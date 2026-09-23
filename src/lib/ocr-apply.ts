// OCR確定結果を試合ドキュメントへ適用する。
// runTransaction で最新の match.events を読み、重複統合した上で
// 導出スタッツ（得点/アシスト/カード/出場時間）を再計算して書き戻す。
// 自動保存・別タブのイベント編集と競合しても、トランザクションの
// read-after-write により互いの更新を上書きしない。
//
// 変更しないフィールド（配置保持）:
//   homeSquad / awaySquad / homeFormation / awayFormation /
//   playerStats の role・starterSlot・position 等の配置関連値
//
// 冪等性:
//   match.ocrApplied.{analysisId} = true を同一トランザクションで記録し、
//   同一 analysisId の再適用は早期リターンで二重適用しない。

import {
  doc,
  runTransaction,
  serverTimestamp,
  type Firestore,
} from 'firebase/firestore';
import { recomputeTeamMinutes } from './match-minutes';
import { mirrorDocsForEvent, type MatchEventInput } from './match-event-sync';

export interface OcrApplyEvent {
  id: string;
  type: string; // 'goal' | 'pk_miss' | 'card' | 'substitution' | 'note'
  /** null/0/解釈不能な時刻は不正値として保存対象から除外される */
  minute: number | string | null;
  /** team_side未判定は null。nullのイベントは保存対象から除外される */
  teamId: string | null;
  playerId?: string;
  playerName?: string;
  assistPlayerId?: string;
  assistPlayerName?: string;
  cardColor?: 'yellow' | 'red';
  inPlayerId?: string;
  inPlayerName?: string;
  outPlayerId?: string;
  outPlayerName?: string;
  goalKind?: 'open' | 'penalty' | 'own_goal';
  playerLinkStatus?: 'linked' | 'name_only' | 'needs_input';
  source?: 'ocr' | 'manual';
  assistStatus?: 'unknown' | 'none' | 'set';
  needsConfirmation?: boolean;
  minuteText?: string;
}

export interface OcrApplyPayload {
  analysisId: string;
  /** 確定済みスコア（ユーザーが確認した値のみ。nullは変更しない） */
  scoreHome?: number | null;
  scoreAway?: number | null;
  /** 確認済みチームスタッツ（適用分のみ） */
  teamStats?: Array<{ id: string; name: string; homeValue: string | number; awayValue: string | number }>;
  /** 確認済み評価点 playerId -> rating（null/N/Aは含めない＝既存値を消さない） */
  ratings?: Record<string, number>;
  /** 追加するイベント（確認済みのみ） */
  events?: OcrApplyEvent[];
}

export interface OcrApplyResult {
  applied: boolean;
  skippedDuplicate: boolean;
  eventsAdded: number;
  eventsSkipped: number;
  /** 仕様上保存しないPK失敗イベントを除外した件数 */
  pkMissExcluded: number;
  /** 時刻・チームが未確定で保存対象から除外した件数 */
  invalidExcluded: number;
}

const stripUndefined = <T>(v: T): T => {
  if (Array.isArray(v)) return v.map(stripUndefined) as T;
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (val !== undefined) out[k] = stripUndefined(val);
    }
    return out as T;
  }
  return v;
};

const GOAL_TYPES = new Set(['goal', 'og', 'pk', 'penalty', 'own_goal']);
const YELLOW = (e: any) =>
  e.type === 'card' ? e.cardColor === 'yellow' : e.type === 'yellow';
const RED = (e: any) =>
  e.type === 'card' ? e.cardColor === 'red' : e.type === 'red';

// イベントの重複判定キー。タイムスタンプ由来のIDは使わない。
// 選手は playerId 優先、なければ正規化済み表示名で比較する。
function eventDedupKey(ev: { type?: string; minute?: unknown; teamId?: string | null; playerId?: string; playerName?: string; outPlayerId?: string; inPlayerId?: string; outPlayerName?: string; inPlayerName?: string }): string {
  const norm = (s?: string) => (s || '').replace(/[\s　.．・=＝‐\-]/g, '').toLowerCase();
  const minuteStr = String(ev.minute ?? '');
  const player = ev.playerId || norm(ev.playerName);
  if (ev.type === 'substitution') {
    return `sub|${minuteStr}|${ev.teamId}|${ev.outPlayerId || norm(ev.outPlayerName)}|${ev.inPlayerId || norm(ev.inPlayerName)}`;
  }
  return `${ev.type}|${minuteStr}|${ev.teamId}|${player}`;
}

// 保存可能なイベント時刻か。null・0・解釈不能な値は false。
// 0はnullの代替値として使わない（キックオフ時刻=0分のイベントは存在しない）。
export function isValidOcrMinute(m: unknown): boolean {
  if (m == null) return false;
  const base = typeof m === 'number' ? m : parseInt(String(m).split('+')[0], 10);
  return Number.isFinite(base) && base >= 1;
}

// 確認画面の表示ソート用キー。`45+2` は45より後・46より前（=45.02）。
// 時刻不明（null・0・解釈不能）は +Inf で一覧の最後に送る。
export function ocrMinuteSortKey(m: unknown): number {
  if (!isValidOcrMinute(m)) return Number.POSITIVE_INFINITY;
  const match = String(m).match(/(\d+)(?:\+(\d+))?/);
  const base = parseInt(match?.[1] ?? '0', 10);
  const extra = match?.[2] ? parseInt(match[2], 10) : 0;
  return base + Math.min(extra, 99) / 100;
}

// イベント配列から導出スタッツを再計算する。
// 配置関連フィールド（role/starterSlot/position等）はそのまま保持し、
// goals/assists/cards/minutesPlayed のみ更新する。
function recomputeDerivedStats(
  playerStats: any[],
  events: any[],
  matchDuration: number
): any[] {
  const goalCounts = new Map<string, number>();
  const assistCounts = new Map<string, number>();
  const yellowCounts = new Map<string, number>();
  const redCounts = new Map<string, number>();

  events.forEach((ev) => {
    if (!ev || typeof ev !== 'object') return;
    if (GOAL_TYPES.has(ev.type) || (ev.type === 'goal' && ev.goalKind === 'penalty')) {
      const scorerId = ev.originalPlayerId || ev.playerId;
      if (scorerId && !String(scorerId).startsWith('custom_')) {
        goalCounts.set(scorerId, (goalCounts.get(scorerId) || 0) + 1);
      }
      if (ev.assistPlayerId && !String(ev.assistPlayerId).startsWith('custom_')) {
        assistCounts.set(ev.assistPlayerId, (assistCounts.get(ev.assistPlayerId) || 0) + 1);
      }
    } else if (YELLOW(ev) && ev.playerId && !String(ev.playerId).startsWith('custom_')) {
      yellowCounts.set(ev.playerId, (yellowCounts.get(ev.playerId) || 0) + 1);
    } else if (RED(ev) && ev.playerId && !String(ev.playerId).startsWith('custom_')) {
      redCounts.set(ev.playerId, (redCounts.get(ev.playerId) || 0) + 1);
    }
  });

  let next = (playerStats || []).map((ps) => {
    if (!ps || !ps.playerId) return ps;
    return {
      ...ps,
      goals: goalCounts.get(ps.playerId) ?? 0,
      assists: assistCounts.get(ps.playerId) ?? 0,
      yellowCards: yellowCounts.get(ps.playerId) ?? 0,
      redCards: redCounts.get(ps.playerId) ?? 0,
    };
  });

  // 交代があるチームだけ出場時間を再計算
  const subTeamIds = new Set(
    events.filter((e) => e?.type === 'substitution' && e?.teamId).map((e) => e.teamId)
  );
  subTeamIds.forEach((teamId) => {
    next = recomputeTeamMinutes(next, events, teamId, matchDuration);
  });
  return next;
}

/**
 * OCR確定結果を match ドキュメントへトランザクション適用する。
 * - 最新 events を読み、dedup key で重複統合
 * - 導出スタッツ再計算
 * - eventsサブコレクションのミラーも同一トランザクションで書き込み
 * - analysisId で二重適用を防止
 */
export async function applyOcrResults(
  db: Firestore,
  matchPath: string,
  payload: OcrApplyPayload
): Promise<OcrApplyResult> {
  const matchRef = doc(db, matchPath);
  const eventsColPath = `${matchPath}/events`;

  return runTransaction(db, async (tx) => {
    const snap = await tx.get(matchRef);
    if (!snap.exists()) {
      throw new Error('match_not_found');
    }
    const data = snap.data() || {};

    // 冪等: 同一 analysisId の適用済みならスキップ
    const applied = (data.ocrApplied || {}) as Record<string, unknown>;
    if (applied[payload.analysisId]) {
      return { applied: false, skippedDuplicate: true, eventsAdded: 0, eventsSkipped: 0, pkMissExcluded: 0, invalidExcluded: 0 };
    }

    const curEvents: any[] = Array.isArray(data.events) ? data.events : [];
    const curStats: any[] = Array.isArray(data.playerStats) ? data.playerStats : [];
    const duration = typeof data.matchDuration === 'number' ? data.matchDuration : 90;

    // 重複統合: 既存+新規の dedup key 集合
    const existingKeys = new Set(curEvents.map(eventDedupKey));
    const newEvents: OcrApplyEvent[] = [];
    let skipped = 0;
    let pkMissExcluded = 0;
    let invalidExcluded = 0;
    for (const ev of payload.events || []) {
      // PK失敗（ボール+×）は最新仕様では試合イベントへ保存しない。
      // unknown由来のnoteも登録対象外。
      if (ev.type === 'pk_miss' || ev.type === 'note') {
        pkMissExcluded += 1;
        continue;
      }
      // 時刻・チーム未確定のイベントは保存しない（events配列/サブコレクション/
      // 選手成績のいずれにも到達させない）
      if (!ev.teamId || !isValidOcrMinute(ev.minute)) {
        invalidExcluded += 1;
        continue;
      }
      // 必要な選手名がない行は保存しない（交代はOUT/IN両名、その他は対象選手名。
      // 名前のみ＝登録選手IDなしは可、個人成績には加算されない）
      const hasRequiredPlayer = ev.type === 'substitution'
        ? !!(ev.outPlayerId || ev.outPlayerName) && !!(ev.inPlayerId || ev.inPlayerName) &&
          (ev.outPlayerId || ev.outPlayerName) !== (ev.inPlayerId || ev.inPlayerName)
        : !!(ev.playerId || ev.playerName);
      if (!hasRequiredPlayer) {
        invalidExcluded += 1;
        continue;
      }
      const key = eventDedupKey(ev);
      if (existingKeys.has(key)) {
        skipped += 1;
        continue;
      }
      existingKeys.add(key);
      newEvents.push({ ...ev, source: ev.source || 'ocr' });
    }

    const nextEvents = [...curEvents, ...newEvents.map((e) => stripUndefined(e as unknown as Record<string, unknown>))];
    const nextStats = recomputeDerivedStats(curStats, nextEvents, duration);

    // 評価点の適用（確認済み・数値のみ）
    let statsWithRatings = nextStats;
    if (payload.ratings) {
      statsWithRatings = nextStats.map((ps) => {
        const r = payload.ratings?.[ps?.playerId];
        if (typeof r === 'number' && Number.isFinite(r)) {
          return { ...ps, rating: r };
        }
        return ps;
      });
    }

    const update: Record<string, unknown> = {
      events: nextEvents,
      playerStats: statsWithRatings,
      [`ocrApplied.${payload.analysisId}`]: true,
      updatedAt: serverTimestamp(),
    };
    if (typeof payload.scoreHome === 'number') update.scoreHome = payload.scoreHome;
    if (typeof payload.scoreAway === 'number') update.scoreAway = payload.scoreAway;
    if (Array.isArray(payload.teamStats)) update.teamStats = payload.teamStats;

    tx.update(matchRef, update);

    // eventsサブコレクションのミラー（新規追加分のみ）
    for (const ev of newEvents) {
      for (const m of mirrorDocsForEvent(ev as MatchEventInput)) {
        tx.set(doc(db, eventsColPath, m.id), m.data, { merge: true });
      }
    }

    return {
      applied: true,
      skippedDuplicate: false,
      eventsAdded: newEvents.length,
      eventsSkipped: skipped,
      pkMissExcluded,
      invalidExcluded,
    };
  });
}
