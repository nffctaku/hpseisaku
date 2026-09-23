"use client";

// OCR解析結果の確認・修正・選択適用パネル。
// 確認前はFirestoreへ一切書き込まない。確定ボタンで
// applyOcrResults()（トランザクション）を呼び、配置関連フィールドは変更しない。

import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Check, AlertTriangle, HelpCircle, Trash2, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import type {
  StatsImageAnalysisWithMatching,
  RatingsImageAnalysisResult,
  EventsImageAnalysisResult,
  OcrMatchEvent,
} from '@/lib/stats-image-parser';
import type { OcrApplyPayload, OcrApplyEvent } from '@/lib/ocr-apply';
import { applyOcrResults, isValidOcrMinute, ocrMinuteSortKey } from '@/lib/ocr-apply';
import { matchPlayerName, normalizePlayerName, type PlayerCandidate, type PlayerMatchStatus } from '@/lib/player-name-matcher';
import { db } from '@/lib/firebase';
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { MobilePickerModal, type PickerOption, type PickerRequest } from '@/components/mobile-picker-modal';
import { useCareer } from '@/contexts/CareerContext';
import type { MatchDetails, Player } from '@/types/match';

export interface OcrImageResultItem {
  index: number;
  kind: 'team_stats' | 'ratings' | 'events';
  result: StatsImageAnalysisWithMatching | RatingsImageAnalysisResult | EventsImageAnalysisResult;
}

interface OcrReviewPanelProps {
  match: MatchDetails;
  matchDocPath: string;
  homePlayers: Player[];
  awayPlayers: Player[];
  results: OcrImageResultItem[];
  analysisId: string;
  onApplied?: () => void;
  onCancel?: () => void;
}

interface EditableEvent extends OcrApplyEvent {
  /** ユーザーが「除外」ボタンで適用対象から外した行（戻すで復元可） */
  excluded: boolean;
  dup: boolean;
  linkStatus: PlayerMatchStatus;
  /** OCRが読み取った生の選手名（alias永続化用。紐づけ後の登録名とは別に保持） */
  readName?: string;
}

const EVENT_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'goal', label: 'ゴール' },
  { value: 'card_yellow', label: 'イエロー' },
  { value: 'card_red', label: 'レッド' },
  { value: 'substitution', label: '交代' },
  { value: 'unknown', label: '要確認' },
];

// 登録済みイベント一覧（match-events-table）と同じ「名前のみ」バッジ
const nameOnlyBadge = (
  <span className="shrink-0 whitespace-nowrap rounded bg-amber-500/20 px-1 text-[10px] text-amber-300">名前のみ</span>
);

const normName = (s?: string) => (s || '').replace(/[\s　.．・=＝‐\-]/g, '').toLowerCase();

function eventTypeToOption(ev: OcrMatchEvent): string {
  if (ev.type === 'goal') return 'goal';
  if (ev.type === 'pk_success') return 'goal_pk';
  if (ev.type === 'pk_miss') return 'pk_miss';
  if (ev.type === 'yellow_card') return 'card_yellow';
  if (ev.type === 'red_card') return 'card_red';
  if (ev.type === 'substitution') return 'substitution';
  return 'unknown';
}

export function OcrReviewPanel({
  match,
  matchDocPath,
  homePlayers,
  awayPlayers,
  results,
  analysisId,
  onApplied,
  onCancel,
}: OcrReviewPanelProps) {
  const { activeCareer } = useCareer();
  const [applying, setApplying] = useState(false);

  // ---- スコア・チームスタッツ（確認済みのみ適用） ----
  const statsResult = useMemo(
    () => results.find((r) => r.kind === 'team_stats')?.result as StatsImageAnalysisWithMatching | undefined,
    [results]
  );
  const firstMatch = useMemo(() => {
    for (const r of results) {
      const m = (r.result as { match?: { score_home?: number | null; score_away?: number | null } }).match;
      if (m && (m.score_home != null || m.score_away != null)) return m;
    }
    return statsResult?.match ?? null;
  }, [results, statsResult]);

  const [applyScore, setApplyScore] = useState(true);
  const [scoreHome, setScoreHome] = useState(firstMatch?.score_home?.toString() ?? '');
  const [scoreAway, setScoreAway] = useState(firstMatch?.score_away?.toString() ?? '');
  const [applyStats, setApplyStats] = useState(true);

  // ---- 選手評価 ----
  interface RatingRow {
    name: string;
    rating: number | null;
    teamSide: 'home' | 'away' | null;
    status: PlayerMatchStatus;
    playerId?: string;
    selected: boolean;
  }
  const buildRatingRows = (r: OcrImageResultItem): RatingRow[] => {
    if (r.kind !== 'ratings') return [];
    const rr = r.result as RatingsImageAnalysisResult;
    return rr.players.map((p) => {
      // team_side未判定(null)はhomeへ推定しない。両チームで照合し、
      // 一致した選手の所属側からsideを導出する。
      const candidates: PlayerCandidate[] =
        p.team_side === 'away' ? awayPlayers
          : p.team_side === 'home' ? homePlayers
          : [...homePlayers, ...awayPlayers];
      const m = matchPlayerName(p.name, candidates);
      const derivedSide = p.team_side ??
        (m.status === 'matched' && m.playerId
          ? (homePlayers.some((pl) => pl.id === m.playerId) ? 'home' : 'away')
          : null);
      return {
        name: p.name,
        rating: p.rating,
        teamSide: derivedSide,
        status: m.status,
        playerId: m.playerId,
        selected: p.rating != null && m.status === 'matched',
      };
    });
  };
  // 画像間の同一評価行（同一選手名）は1行に統合する
  const dedupeRatingRows = (rows: RatingRow[]): RatingRow[] => {
    const seen = new Set<string>();
    return rows.filter((r) => {
      const k = `${r.teamSide ?? ''}|${normName(r.name)}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  };
  const [ratings, setRatings] = useState<RatingRow[]>(() =>
    dedupeRatingRows(results.flatMap((r) => buildRatingRows(r)))
  );

  // ---- イベント ----
  // applyOcrResults の dedup key と同一規則。交代はOUT/INを含め、
  // 同時刻・同チームの複数交代は別イベントとして保持する。
  const eventDedupKeyOf = (e: {
    type: string; minute: unknown; teamId?: string | null;
    playerId?: string; playerName?: string;
    outPlayerId?: string; inPlayerId?: string;
    outPlayerName?: string; inPlayerName?: string;
  }) => {
    const minuteStr = String(e.minute ?? '');
    if (e.type === 'substitution') {
      return `sub|${minuteStr}|${e.teamId}|${e.outPlayerId || normName(e.outPlayerName)}|${e.inPlayerId || normName(e.inPlayerName)}`;
    }
    return `${e.type}|${minuteStr}|${e.teamId}|${e.playerId || normName(e.playerName)}`;
  };

  // 左右(side)を除いた同一性キー。画像間で一方がhome・他方がawayと
  // 誤判定された「幻影イベント」を検出し、要確認にするために使う。
  const sideAgnosticKeyOf = (e: {
    type: string; minute: unknown;
    playerId?: string; playerName?: string;
    outPlayerId?: string; inPlayerId?: string;
    outPlayerName?: string; inPlayerName?: string;
  }) => {
    const minuteStr = String(e.minute ?? '');
    if (e.type === 'substitution') {
      return `sub|${minuteStr}|${e.outPlayerId || normName(e.outPlayerName)}|${e.inPlayerId || normName(e.inPlayerName)}`;
    }
    return `${e.type}|${minuteStr}|${e.playerId || normName(e.playerName)}`;
  };

  // 同一内容でsideが異なる行を双方 要確認 にする
  const flagSideConflicts = (rows: EditableEvent[]): void => {
    const byKey = new Map<string, EditableEvent[]>();
    for (const e of rows) {
      const k = sideAgnosticKeyOf(e);
      const arr = byKey.get(k) || [];
      arr.push(e);
      byKey.set(k, arr);
    }
    for (const arr of byKey.values()) {
      const sides = new Set(arr.map((e) => e.teamId));
      if (sides.size > 1) arr.forEach((e) => { e.needsConfirmation = true; });
    }
  };

  const buildEventRows = (r: OcrImageResultItem): EditableEvent[] => {
    if (r.kind !== 'events') return [];
    const rr = r.result as EventsImageAnalysisResult;
    const list: EditableEvent[] = [];
    for (const ev of rr.events) {
        // team_side未判定(null)はhomeへ推定しない。チーム未選択のまま表示し、
        // ユーザーがH/Aを選ぶまで保存対象外にする。
        const teamId =
          ev.team_side === 'away' ? match.awayTeam
            : ev.team_side === 'home' ? match.homeTeam
            : null;
        // チーム未確定時は誤照合を避けるため候補を提示しない（名前のみ保持）
        const candidates: PlayerCandidate[] =
          ev.team_side === 'away' ? awayPlayers
            : ev.team_side === 'home' ? homePlayers
            : [];
        const pm = matchPlayerName(ev.player_name, candidates);
        // アシスト名も照合（一致時のみID付与。名前のみ保持も許可し、
        // 未登録名が個人成績に混入しないよう playerId は確定一致のみ）
        const am = ev.assist_name ? matchPlayerName(ev.assist_name, candidates) : null;
        const om = ev.out_player_name ? matchPlayerName(ev.out_player_name, candidates) : null;
        const im = ev.in_player_name ? matchPlayerName(ev.in_player_name, candidates) : null;
        const typeOpt = eventTypeToOption(ev);
        // PK失敗は表示・保存・集計のすべてから除外する
        if (typeOpt === 'pk_miss') continue;
        // 読めない時刻は0へ変換せずnullのまま保持する。
        // 90分超の数値は延長戦との自動判定をせず要確認対象にする。
        const minuteBase = typeof ev.minute === 'number'
          ? Math.floor(ev.minute)
          : parseInt(String(ev.minute ?? '').split('+')[0], 10);
        const minuteValid = Number.isFinite(minuteBase) && minuteBase >= 1;
        const ambiguousMinute = minuteValid && minuteBase > 90;
        const teamKnown = ev.team_side === 'home' || ev.team_side === 'away';
        // イベントに必要な選手情報: 交代はIN/OUT両名、他は対象選手名が必要
        const playerInfoOk = ev.type === 'substitution'
          ? !!(ev.out_player_name && ev.in_player_name)
          : !!ev.player_name;
        // 同一選手をOUT/IN両方に設定できない（誤ペアリングはIN側を未確定に戻す）
        const outId = om?.status === 'matched' ? om.playerId : undefined;
        let inId = im?.status === 'matched' ? im.playerId : undefined;
        if (outId && outId === inId) inId = undefined;

        const applyEvent: EditableEvent = {
          id: `ocr_${Math.random().toString(36).slice(2)}_${ev.minute ?? 'x'}`,
          type:
            typeOpt === 'goal_pk'
              ? 'goal'
              : typeOpt === 'card_yellow' || typeOpt === 'card_red'
                ? 'card'
                : typeOpt === 'unknown'
                  ? 'note'
                  : typeOpt,
          minute: ev.minute ?? null,
          minuteText: typeof ev.minute === 'string' ? ev.minute : undefined,
          teamId,
          playerId: pm.status === 'matched' ? pm.playerId : undefined,
          playerName: pm.status === 'matched' ? pm.playerName : ev.player_name ?? undefined,
          cardColor: typeOpt === 'card_yellow' ? 'yellow' : typeOpt === 'card_red' ? 'red' : undefined,
          goalKind: typeOpt === 'goal_pk' ? 'penalty' : typeOpt === 'goal' ? 'open' : undefined,
          outPlayerId: outId,
          inPlayerId: inId,
          outPlayerName: ev.out_player_name ?? undefined,
          inPlayerName: ev.in_player_name ?? undefined,
          // PKゴールにアシストは付かない（goalKind=penalty時はアシストを保存しない）
          assistPlayerId: typeOpt === 'goal_pk' ? undefined : am?.status === 'matched' ? am.playerId : undefined,
          assistPlayerName: typeOpt === 'goal_pk' ? undefined : ev.assist_name ?? undefined,
          playerLinkStatus: pm.status === 'matched' ? 'linked' : pm.status === 'name_only' ? 'name_only' : 'needs_input',
          assistStatus: typeOpt === 'goal_pk' ? 'none' : ev.assist_name ? 'set' : 'unknown',
          source: 'ocr',
          needsConfirmation: typeOpt === 'unknown' || !minuteValid || ambiguousMinute || !teamKnown || !playerInfoOk,
          // PK失敗は仕様上登録対象外（確認画面に表示のみ。確定時も保存しない）
          excluded: false,
          dup: false,
          linkStatus: pm.status,
          readName: ev.player_name ?? undefined,
        };
      list.push(applyEvent);
    }
    // 既存イベントとの重複チェック
    const existing = (match.events || []).map((e) => eventDedupKeyOf(e as EditableEvent));
    return list.map((e) => ({ ...e, dup: existing.includes(eventDedupKeyOf(e)) }));
  };
  // 画像間の同一イベントは先勝ちで1行にする（PK失敗の重複表示もここで防ぐ）
  const dedupeEventRows = (rows: EditableEvent[]): EditableEvent[] => {
    const seenKeys = new Set<string>();
    return rows.filter((e) => {
      const k = eventDedupKeyOf(e);
      if (seenKeys.has(k)) return false;
      seenKeys.add(k);
      return true;
    });
  };
  // 「登録可能」かどうかは現在のフィールド値から毎回導出する。
  // 要確認行は不足項目（時刻・チーム・選手名）を直すと自動で登録可能になる。
  // 名前のみ（登録選手IDなし）も登録可能 — 個人成績には加算されない。
  const eventAppliable = (e: EditableEvent): boolean => {
    if (e.dup || e.excluded || e.type === 'pk_miss' || e.type === 'note') return false;
    if (!isValidOcrMinute(e.minute) || !e.teamId) return false;
    const base = typeof e.minute === 'number'
      ? Math.floor(e.minute)
      : parseInt(String(e.minute).split('+')[0], 10);
    if (base > 90) return false; // 90分超は延長との自動判定をせず要確認のまま
    if (e.type === 'substitution') {
      const out = e.outPlayerId || normName(e.outPlayerName);
      const inn = e.inPlayerId || normName(e.inPlayerName);
      return !!out && !!inn && out !== inn;
    }
    return !!e.playerId || (e.playerLinkStatus === 'name_only' && !!e.playerName);
  };
  const eventStatusOf = (e: EditableEvent): '登録可能' | '要確認' | '登録対象外' | '登録済み' | '除外' =>
    e.dup ? '登録済み'
      : e.type === 'pk_miss' || e.type === 'note' ? '登録対象外'
      : e.excluded ? '除外'
      : eventAppliable(e) ? '登録可能' : '要確認';

  const [events, setEvents] = useState<EditableEvent[]>(() => {
    const list = dedupeEventRows(results.flatMap((r) => buildEventRows(r)));
    // 表示順のみ時刻昇順（同時刻・時刻不明の相対順は統合順を維持）
    list.sort((a, b) => ocrMinuteSortKey(a.minute) - ocrMinuteSortKey(b.minute));
    flagSideConflicts(list);
    return list;
  });

  // 部分失敗の再試行などで後から到着した結果を、既存の編集を保持したまま追記する
  const seenResultIdx = useRef<Set<number>>(new Set(results.map((r) => r.index)));
  useEffect(() => {
    const fresh = results.filter((r) => !seenResultIdx.current.has(r.index));
    if (!fresh.length) return;
    for (const r of fresh) seenResultIdx.current.add(r.index);
    const newRatings = fresh.flatMap((r) => buildRatingRows(r));
    const newEvents = fresh.flatMap((r) => buildEventRows(r));
    if (newRatings.length) setRatings((prev) => dedupeRatingRows([...prev, ...newRatings]));
    if (newEvents.length) {
      setEvents((prev) => {
        const seen = new Set(prev.map((e) => eventDedupKeyOf(e)));
        // 既出イベントと完全同一の行は追加しない（画像間重複は1行のみ）
        const merged = [...prev, ...newEvents.filter((e) => !seen.has(eventDedupKeyOf(e)))];
        merged.sort((a, b) => ocrMinuteSortKey(a.minute) - ocrMinuteSortKey(b.minute));
        flagSideConflicts(merged);
        return merged;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results]);

  const candidatesFor = (teamId: string): PlayerCandidate[] =>
    teamId === match.homeTeam ? homePlayers : awayPlayers;

  const updateEvent = (idx: number, patch: Partial<EditableEvent>) =>
    setEvents((prev) => prev.map((e, i) => (i === idx ? { ...e, ...patch } : e)));

  const updateRating = (idx: number, patch: Partial<RatingRow>) =>
    setRatings((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));

  const handleApply = async () => {
    if (applying) return;
    setApplying(true);
    try {
      const payload: OcrApplyPayload = { analysisId };

      if (applyScore && scoreHome !== '' && scoreAway !== '') {
        const h = Number(scoreHome);
        const a = Number(scoreAway);
        if (Number.isInteger(h) && Number.isInteger(a) && h >= 0 && a >= 0) {
          payload.scoreHome = h;
          payload.scoreAway = a;
        }
      }

      if (applyStats && statsResult) {
        const t = statsResult.team_stats;
        const rows: { id: string; name: string; homeValue: string | number; awayValue: string | number }[] = [];
        const push = (id: string, name: string, v?: { home: number | null; away: number | null }) => {
          if (v && (v.home != null || v.away != null)) {
            rows.push({ id, name, homeValue: v.home ?? '', awayValue: v.away ?? '' });
          }
        };
        push('possession', 'ポゼッション', t.possession);
        push('shots', 'シュート', t.shots);
        push('expectedGoals', 'ゴール期待値', t.expected_goals);
        push('passes', 'パス', t.passes);
        push('tackles', 'タックル', t.tackles);
        push('tacklesWon', 'タックル成功', t.tackles_won);
        push('interceptions', 'インターセプト', t.interceptions);
        push('offsides', 'オフサイド', t.offsides);
        push('cornerKicks', 'コーナー', t.corners);
        push('freeKicks', 'フリーキック', t.free_kicks);
        push('penaltyKicks', 'PK', t.penalty_kicks);
        const p = statsResult.percentage_stats;
        push('shotAccuracy', 'シュート精度', p?.shot_accuracy);
        push('passAccuracy', 'パス精度', p?.pass_accuracy);
        push('dribbleSuccessRate', 'ドリブル成功率', p?.dribble_success_rate);
        if (rows.length) payload.teamStats = rows;
      }

      const ratingsMap: Record<string, number> = {};
      for (const r of ratings) {
        if (r.selected && r.playerId && r.rating != null) ratingsMap[r.playerId] = r.rating;
      }
      if (Object.keys(ratingsMap).length) payload.ratings = ratingsMap;

      // 登録可能かつ除外されていない行のみ送信する（保存側でも同条件を検証）。
      const selEvents = events.filter((e) => eventAppliable(e));
      if (selEvents.length) {
        payload.events = selEvents.map(({ excluded, dup, linkStatus, readName, ...rest }) => {
          // 自由入力の空文字は undefined に正規化（空欄のまま保存しない）
          const cleaned = {
            ...rest,
            playerName: rest.playerName || undefined,
            assistPlayerName: rest.assistPlayerName || undefined,
            outPlayerName: rest.outPlayerName || undefined,
            inPlayerName: rest.inPlayerName || undefined,
          };
          // PKゴールにアシストは付かない（「PK」を選手名・IDとして保存しない）
          if (cleaned.type === 'goal' && cleaned.goalKind === 'penalty') {
            return { ...cleaned, assistPlayerId: undefined, assistPlayerName: undefined, assistStatus: 'none' as const };
          }
          // 自由入力を選んだまま空欄ならアシストなし扱い（'unknown'=未読取の意味は維持）
          return {
            ...cleaned,
            assistStatus:
              cleaned.assistStatus === 'set' && !cleaned.assistPlayerId && !cleaned.assistPlayerName
                ? ('none' as const)
                : cleaned.assistStatus,
          };
        });
      }

      const res = await applyOcrResults(db, matchDocPath, payload);
      if (res.skippedDuplicate) {
        toast.info('この解析結果は既に適用済みです');
      } else {
        toast.success(`適用しました（イベント追加 ${res.eventsAdded} 件 / 重複スキップ ${res.eventsSkipped} 件）`);
      }

      // ユーザーが確定した「読み取り名 → 登録選手」の対応だけを
      // 選手ドキュメントの aliases に永続化する（AI推測は保存しない）。
      // 失敗しても適用自体は成功扱いを維持する。
      try {
        const clubUid = activeCareer?.clubUid;
        if (clubUid) {
          const aliasOps: Promise<unknown>[] = [];
          const seen = new Set<string>();
          const addAlias = (teamId: string | undefined, readName: string | undefined, playerId: string | undefined) => {
            if (!teamId || !readName || !playerId) return;
            const key = `${playerId}|${normalizePlayerName(readName)}`;
            if (seen.has(key)) return;
            seen.add(key);
            const player = [...homePlayers, ...awayPlayers].find((p) => p.id === playerId);
            // 登録名と同一表記はalias不要
            if (player && normalizePlayerName(player.name) === normalizePlayerName(readName)) return;
            // 既存alias登録済みならスキップ
            if (player?.aliases?.some((a) => normalizePlayerName(a) === normalizePlayerName(readName))) return;
            const playerTeamId = (player as Player | undefined)?.teamId || teamId;
            aliasOps.push(
              updateDoc(doc(db, `clubs/${clubUid}/teams/${playerTeamId}/players/${playerId}`), {
                aliases: arrayUnion(readName),
              }).catch((e) => console.error('[OcrReviewPanel] alias persist failed:', e))
            );
          };
          for (const r of ratings) {
            if (r.selected && r.playerId && r.status === 'matched') {
              addAlias(r.teamSide === 'away' ? match.awayTeam : r.teamSide === 'home' ? match.homeTeam : undefined, r.name, r.playerId);
            }
          }
          for (const e of events) {
            if (eventAppliable(e) && e.teamId && e.playerId && e.playerLinkStatus === 'linked' && e.readName) {
              addAlias(e.teamId, e.readName, e.playerId);
            }
          }
          await Promise.allSettled(aliasOps);
        }
      } catch (e) {
        console.error('[OcrReviewPanel] alias persistence error:', e);
      }

      onApplied?.();
    } catch (e) {
      console.error('[OcrReviewPanel] apply failed:', e);
      toast.error('適用に失敗しました');
    } finally {
      setApplying(false);
    }
  };

  const appliableEventCount = events.filter((e) => eventAppliable(e)).length;
  const reviewEventCount = events.filter(
    (e) => !e.excluded && !e.dup && e.type !== 'pk_miss' && e.type !== 'note' && !eventAppliable(e)
  ).length;
  // 削除済み行の復元用スタック（LIFO）。行自体は配列に残すので同じ位置へ戻る
  const [deletedIds, setDeletedIds] = useState<string[]>([]);
  // 選手選択はイベント追加フォームと同じホイールピッカー（MobilePickerModal）
  const [mobilePicker, setMobilePicker] = useState<PickerRequest | null>(null);
  const visibleEvents = events.map((e, i) => ({ e, i })).filter(({ e }) => !e.excluded);
  const selectedRatingCount = ratings.filter((r) => r.selected).length;

  return (
    <div className="space-y-4 rounded-2xl border border-emerald-500/30 bg-slate-900/80 p-4 text-slate-100">
      <MobilePickerModal picker={mobilePicker} onClose={() => setMobilePicker(null)} />
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold">読み取り結果の確認</h3>
        <span className="text-[10px] text-slate-400">確定するまで保存されません</span>
      </div>

      {/* スコア */}
      {firstMatch && (firstMatch.score_home != null || firstMatch.score_away != null) && (
        <div>
          <label className="flex items-center gap-2 text-xs font-bold text-slate-300">
            <input type="checkbox" checked={applyScore} onChange={(e) => setApplyScore(e.target.checked)} />
            スコアを適用
          </label>
          <div className="mt-2 flex items-center gap-2 text-sm">
            <span className="text-slate-400">{match.homeTeamName}</span>
            <Input className="h-8 w-16 text-center" value={scoreHome} onChange={(e) => setScoreHome(e.target.value)} />
            <span>-</span>
            <Input className="h-8 w-16 text-center" value={scoreAway} onChange={(e) => setScoreAway(e.target.value)} />
            <span className="text-slate-400">{match.awayTeamName}</span>
          </div>
        </div>
      )}

      {/* チームスタッツ */}
      {statsResult && (
        <div>
          <label className="flex items-center gap-2 text-xs font-bold text-slate-300">
            <input type="checkbox" checked={applyStats} onChange={(e) => setApplyStats(e.target.checked)} />
            チームスタッツを適用
          </label>
        </div>
      )}

      {/* 評価 */}
      {ratings.length > 0 && (
        <div>
          <div className="mb-2 text-xs font-bold text-slate-300">選手評価（{selectedRatingCount}件選択中）</div>
          <div className="space-y-1">
            {ratings.map((r, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={r.selected}
                  disabled={r.rating == null}
                  onChange={(e) => updateRating(i, { selected: e.target.checked })}
                />
                <span className="w-28 truncate">{r.name}</span>
                <select
                  className="h-6 rounded bg-slate-800 text-[10px]"
                  value={r.teamSide ?? ''}
                  onChange={(ev) => {
                    const newSide = ev.target.value === 'away' ? 'away' : 'home';
                    const m = matchPlayerName(r.name, newSide === 'away' ? awayPlayers : homePlayers);
                    updateRating(i, {
                      teamSide: newSide,
                      status: m.status,
                      playerId: m.playerId,
                      selected: r.rating != null && m.status === 'matched',
                    });
                  }}
                >
                  <option value="">未選択</option>
                  <option value="home">(H)</option>
                  <option value="away">(A)</option>
                </select>
                <span className="w-10 text-slate-400">{r.rating ?? 'N/A'}</span>
                {r.status === 'matched' ? (
                  <span className="text-emerald-400">✓ 登録選手</span>
                ) : r.status === 'name_only' ? (
                  <>
                    <select
                      className="h-6 rounded bg-slate-800 text-xs"
                      value={r.playerId || ''}
                      onChange={(e) => {
                        const pid = e.target.value || undefined;
                        updateRating(i, { playerId: pid, status: pid ? 'matched' : 'name_only', selected: !!pid });
                      }}
                    >
                      <option value="">{r.name}</option>
                      {(r.teamSide === 'away' ? awayPlayers : r.teamSide === 'home' ? homePlayers : [...homePlayers, ...awayPlayers]).map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                    {nameOnlyBadge}
                  </>
                ) : (
                  <span className="text-amber-400">選手を選択</span>
                )}
              </div>
            ))}
          </div>
          <p className="mt-1 text-[10px] text-slate-500">名前のみ・未選択の選手は登録選手の評価には反映されません</p>
        </div>
      )}

      {/* イベント */}
      {events.length > 0 && (
        <div>
          <div className="mb-2 text-xs font-bold text-slate-300">
            イベント（登録予定 {appliableEventCount}件／要確認 {reviewEventCount}件）
          </div>
          <p className="mb-2 text-[10px] text-slate-500">名前のみ：登録されていない選手です。イベントには名前が保存されますが、個人成績には集計されません。</p>
          <div className="space-y-3">
            {visibleEvents.map(({ e, i }) => {
              const sideSelect = (
                <select
                  className="h-7 rounded bg-slate-800 text-xs"
                  value={e.teamId === match.homeTeam ? 'home' : e.teamId === match.awayTeam ? 'away' : ''}
                  onChange={(ev) => {
                    const newTeamId = ev.target.value === 'home' ? match.homeTeam : match.awayTeam;
                    const cands = candidatesFor(newTeamId);
                    const pm = matchPlayerName(e.readName ?? e.playerName, cands);
                    const om = e.outPlayerName ? matchPlayerName(e.outPlayerName, cands) : null;
                    const im = e.inPlayerName ? matchPlayerName(e.inPlayerName, cands) : null;
                    const am = e.assistPlayerName ? matchPlayerName(e.assistPlayerName, cands) : null;
                    updateEvent(i, {
                      teamId: newTeamId,
                      playerId: pm.status === 'matched' ? pm.playerId : undefined,
                      playerName: pm.status === 'matched' ? pm.playerName : (e.readName ?? e.playerName),
                      playerLinkStatus: pm.status === 'matched' ? 'linked' : pm.status === 'name_only' ? 'name_only' : 'needs_input',
                      outPlayerId: om?.status === 'matched' ? om.playerId : undefined,
                      inPlayerId: im?.status === 'matched' ? im.playerId : undefined,
                      assistPlayerId: am?.status === 'matched' ? am.playerId : undefined,
                      needsConfirmation: false,
                    });
                  }}
                >
                  <option value="">未選択</option>
                  <option value="home">(H)</option>
                  <option value="away">(A)</option>
                </select>
              );
              const cands = e.teamId ? candidatesFor(e.teamId) : [];
              // イベント追加フォームと同じピッカー: 未選択 / [追加選択肢] / 登録選手 / その他（自由入力）
              const pickBtn = (label: string, onClick: () => void) => (
                <button
                  type="button"
                  onClick={onClick}
                  className="h-7 flex-1 truncate rounded bg-slate-800 px-2 text-left text-xs text-slate-100"
                >
                  {label}
                </button>
              );
              // 自由入力（名前のみ）時に入力欄の右へ置く、選手選択画面を開くボタン
              const pickerIconBtn = (onClick: () => void) => (
                <button
                  type="button"
                  aria-label="選手選択画面を開く"
                  title="選手選択画面を開く"
                  onClick={onClick}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-slate-800 text-slate-300 hover:bg-slate-700"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
              );
              const openPlayerPicker = (opts: {
                title: string;
                value: string;
                players: PlayerCandidate[];
                extraOptions?: PickerOption[];
                onSelect: (v: string) => void;
              }) =>
                setMobilePicker({
                  title: opts.title,
                  value: opts.value,
                  options: [
                    { value: '', label: '未選択' },
                    ...(opts.extraOptions ?? []),
                    ...opts.players.map((p) => ({ value: p.id, label: p.name })),
                    { value: '__custom__', label: 'その他（自由入力）' },
                  ],
                  onSelect: opts.onSelect,
                });
              // 得点者・カード等の対象選手。名前のみ=自由入力欄だけ、登録選手=選択ボタンだけを表示
              const mainIsCustom = !e.playerId && e.playerLinkStatus === 'name_only';
              const mainLabel = e.playerId
                ? e.playerName || '選手を選択'
                : mainIsCustom
                  ? e.playerName || 'その他（自由入力）'
                  : '選手を選択';
              const openMainPicker = () =>
                openPlayerPicker({
                  title: '選手を選択',
                  value: e.playerId || (mainIsCustom ? '__custom__' : ''),
                  players: cands,
                  onSelect: (v) => {
                    if (v === '__custom__') {
                      updateEvent(i, { playerId: undefined, playerLinkStatus: 'name_only', playerName: e.playerName ?? '' });
                    } else if (v === '') {
                      updateEvent(i, { playerId: undefined, playerLinkStatus: 'needs_input' });
                    } else {
                      const p = cands.find((pl) => pl.id === v);
                      updateEvent(i, { playerId: v, playerName: p?.name || e.playerName, playerLinkStatus: 'linked' });
                    }
                  },
                });
              const mainPlayerField = mainIsCustom ? (
                <>
                  <Input
                    className="h-7 flex-1 text-xs"
                    value={e.playerName ?? ''}
                    placeholder="選手名を入力"
                    onChange={(ev) => updateEvent(i, { playerName: ev.target.value })}
                  />
                  {!!e.playerName && nameOnlyBadge}
                  {pickerIconBtn(openMainPicker)}
                </>
              ) : (
                pickBtn(mainLabel, openMainPicker)
              );
              const subField = (kind: 'out' | 'in') => {
                const curId = kind === 'out' ? e.outPlayerId : e.inPlayerId;
                const curName = kind === 'out' ? e.outPlayerName : e.inPlayerName;
                const otherId = kind === 'out' ? e.inPlayerId : e.outPlayerId;
                // 未選択=undefined、自由入力=文字列（空でも入力欄を開いた状態を維持）
                const isCustom = !curId && typeof curName === 'string';
                const label = curId
                  ? curName || '選手を選択'
                  : isCustom
                    ? curName || 'その他（自由入力）'
                    : '選手を選択';
                const openPicker = () =>
                  openPlayerPicker({
                    title: kind === 'in' ? 'IN選手を選択' : 'OUT選手を選択',
                    value: curId || (isCustom ? '__custom__' : ''),
                    players: cands.filter((p) => p.id !== otherId),
                    onSelect: (v) => {
                      if (v === otherId) return; // 同一選手はOUT/IN両方に設定できない
                      // 表示名と選手IDを同時に更新。両側揃えば要確認も解除
                      const complete = !!otherId;
                      if (v === '__custom__') {
                        updateEvent(i, kind === 'out' ? { outPlayerId: undefined, outPlayerName: curName ?? '' } : { inPlayerId: undefined, inPlayerName: curName ?? '' });
                      } else if (v === '') {
                        updateEvent(i, kind === 'out' ? { outPlayerId: undefined, outPlayerName: undefined } : { inPlayerId: undefined, inPlayerName: undefined });
                      } else {
                        const p = cands.find((pl) => pl.id === v);
                        updateEvent(i, kind === 'out'
                          ? { outPlayerId: v, outPlayerName: p?.name || curName, needsConfirmation: complete ? false : e.needsConfirmation }
                          : { inPlayerId: v, inPlayerName: p?.name || curName, needsConfirmation: complete ? false : e.needsConfirmation });
                      }
                    },
                  });
                // 名前のみ=自由入力欄だけ、登録選手=選択ボタンだけを表示
                return isCustom ? (
                  <>
                    <Input
                      className="h-7 flex-1 text-xs"
                      value={curName}
                      placeholder="選手名を入力"
                      onChange={(ev) =>
                        updateEvent(i, kind === 'out' ? { outPlayerName: ev.target.value } : { inPlayerName: ev.target.value })
                      }
                    />
                    {!!curName && nameOnlyBadge}
                    {pickerIconBtn(openPicker)}
                  </>
                ) : (
                  pickBtn(label, openPicker)
                );
              };
              // アシスト（PK選択肢あり。PK時は goalKind=penalty でアシスト空）
              const assistIsCustom = e.goalKind !== 'penalty' && !e.assistPlayerId && e.assistStatus === 'set';
              const assistLabel = e.goalKind === 'penalty'
                ? 'PK'
                : e.assistPlayerId
                  ? e.assistPlayerName || '選手を選択'
                  : assistIsCustom
                    ? e.assistPlayerName || 'その他（自由入力）'
                    : '選手を選択';
              const openAssistPicker = () =>
                openPlayerPicker({
                  title: 'アシストを選択',
                  value: e.goalKind === 'penalty' ? '__pk__' : e.assistPlayerId || (assistIsCustom ? '__custom__' : ''),
                  players: cands,
                  extraOptions: [{ value: '__pk__', label: 'PK' }],
                  onSelect: (v) => {
                    if (v === '__pk__') {
                      updateEvent(i, { goalKind: 'penalty', assistPlayerId: undefined, assistPlayerName: undefined, assistStatus: 'none' });
                    } else if (v === '') {
                      updateEvent(i, { assistPlayerId: undefined, assistPlayerName: undefined, assistStatus: 'none', goalKind: 'open' });
                    } else if (v === '__custom__') {
                      updateEvent(i, { assistPlayerId: undefined, assistStatus: 'set', goalKind: 'open', assistPlayerName: e.assistPlayerName ?? '' });
                    } else {
                      const p = cands.find((pl) => pl.id === v);
                      updateEvent(i, { assistPlayerId: v, assistPlayerName: p?.name || e.assistPlayerName, assistStatus: 'set', goalKind: 'open' });
                    }
                  },
                });
              const assistField = assistIsCustom ? (
                <>
                  <Input
                    className="h-7 flex-1 text-xs"
                    value={e.assistPlayerName ?? ''}
                    placeholder="選手名を入力"
                    onChange={(ev) => updateEvent(i, { assistPlayerName: ev.target.value })}
                  />
                  {!!e.assistPlayerName && nameOnlyBadge}
                  {pickerIconBtn(openAssistPicker)}
                </>
              ) : (
                pickBtn(assistLabel, openAssistPicker)
              );
              const teamName = e.teamId === match.homeTeam ? match.homeTeamName
                : e.teamId === match.awayTeam ? match.awayTeamName : '';
              const statusText = eventStatusOf(e);
              return (
              <div key={e.id} className="space-y-1.5 rounded-lg bg-slate-800/50 p-2 text-xs">
                {/* 1行目: 時刻 + チーム + 除外/戻す */}
                <div className="flex flex-wrap items-center gap-1">
                  <Input
                    className="h-7 w-16 text-center text-xs"
                    value={e.minute == null ? '' : String(e.minute)}
                    placeholder="分"
                    onChange={(ev) => {
                      const v = ev.target.value.trim();
                      // 空欄はnullに戻す（0や空文字を時刻として保存しない）
                      updateEvent(i, { minute: v === '' ? null : /^\d+$/.test(v) ? Number(v) : v });
                    }}
                  />
                  <span className="text-slate-400">分</span>
                  {sideSelect}
                  {teamName && <span className="font-medium text-slate-200">{teamName}</span>}
                  <button
                    type="button"
                    aria-label="読み取り結果から削除"
                    title="読み取り結果から削除"
                    onClick={() => {
                      updateEvent(i, { excluded: true });
                      setDeletedIds((prev) => [...prev, e.id]);
                    }}
                    className="ml-auto rounded p-1 text-red-400 hover:bg-slate-700"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                {/* 2行目: 種別 */}
                <div className="flex items-center gap-1">
                  <select
                    className="h-7 rounded bg-slate-800 text-xs"
                    value={
                      e.type === 'card' ? `card_${e.cardColor || 'yellow'}`
                        : e.type === 'note' ? 'unknown'
                        : e.type
                    }
                    onChange={(ev) => {
                      const v = ev.target.value;
                      // PK成功は「ゴール」＋A欄のPK選択で表現するため goalKind を維持する
                      if (v === 'goal') updateEvent(i, { type: 'goal', goalKind: e.goalKind === 'penalty' ? 'penalty' : 'open', needsConfirmation: false });
                      else if (v === 'card_yellow') updateEvent(i, { type: 'card', cardColor: 'yellow', goalKind: undefined, needsConfirmation: false });
                      else if (v === 'card_red') updateEvent(i, { type: 'card', cardColor: 'red', goalKind: undefined, needsConfirmation: false });
                      else if (v === 'substitution') updateEvent(i, { type: 'substitution', goalKind: undefined, needsConfirmation: false });
                      else updateEvent(i, { type: 'note', needsConfirmation: true });
                    }}
                  >
                    {EVENT_TYPE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                {/* 3行目: 選手（交代=IN/OUT、ゴール=G/A、その他=選手1行） */}
                {e.type === 'substitution' ? (
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-1">
                      <span className="w-8 shrink-0 text-slate-400">IN</span>
                      {subField('in')}
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="w-8 shrink-0 text-slate-400">OUT</span>
                      {subField('out')}
                    </div>
                  </div>
                ) : e.type === 'goal' ? (
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-1">
                      <span className="w-8 shrink-0 text-slate-400">G</span>
                      {mainPlayerField}
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="w-8 shrink-0 text-slate-400">A</span>
                      {assistField}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-1">{mainPlayerField}</div>
                )}
                {/* 4行目: 要確認の理由のみ黄色で表示 */}
                {statusText === '要確認' && (
                <div className="flex flex-wrap items-center gap-1 text-[11px]">
                  <span className="text-amber-400">状態：要確認</span>
                  <span className="text-slate-500">※確定対象外</span>
                  {!isValidOcrMinute(e.minute) && <span className="text-amber-400">時刻を入力してください</span>}
                  {!e.teamId && <span className="text-amber-400">チーム未選択</span>}
                  {e.needsConfirmation && !e.dup && (
                    <HelpCircle className="h-3 w-3 text-amber-400" />
                  )}
                </div>
                )}
              </div>
              );
            })}
          </div>
        </div>
      )}

      {/* アクション */}
      <div className="flex gap-2">
        <Button
          type="button"
          onClick={handleApply}
          disabled={applying}
          className="flex-1 bg-emerald-500 font-bold hover:bg-emerald-600"
        >
          {applying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
          登録可能な{appliableEventCount}件を適用
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={applying}
          className="border-slate-600 bg-slate-800 text-slate-100 hover:bg-slate-700">
          キャンセル
        </Button>
      </div>
      <p className="flex items-center gap-1 text-[10px] text-slate-500">
        <AlertTriangle className="h-3 w-3" />
        フォーメーション・先発/ベンチ・配置は変更されません。アシストは確定後にイベントから追加できます。
      </p>
      {deletedIds.length > 0 && (
        <div className="flex items-center justify-between rounded-md border border-slate-700 bg-slate-800/60 px-3 py-2 text-xs">
          <span className="text-slate-300">読み取り結果から削除しました</span>
          <button
            type="button"
            className="rounded border border-slate-500 px-2 py-0.5 text-slate-200 hover:bg-slate-700"
            onClick={() => {
              const last = deletedIds[deletedIds.length - 1];
              setDeletedIds((prev) => prev.slice(0, -1));
              setEvents((prev) => prev.map((ev) => (ev.id === last ? { ...ev, excluded: false } : ev)));
            }}
          >
            元に戻す
          </button>
        </div>
      )}
    </div>
  );
}
