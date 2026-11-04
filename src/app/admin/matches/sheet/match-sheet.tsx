"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { useCareer } from "@/contexts/CareerContext";
import { db } from "@/lib/firebase";
import { doc, getDoc, getDocs, query, collection, where } from "firebase/firestore";
import { CalendarDays, FilePenLine, Loader2, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MobilePickerModal, type PickerRequest } from "@/components/mobile-picker-modal";
import { toast } from "sonner";
import type { MatchEvent } from "@/types/match";
import { appendMatchEvent, removeMatchEvent } from "@/lib/match-event-sync";
import { formatMinute } from "@/lib/formatMinute";
import {
  type SheetCompetition,
  type SheetMatchRow,
  type SheetPlayer,
  type SheetRound,
  type SheetTeam,
  createSheetMatch,
  createSheetRound,
  fetchSheetCompetitions,
  fetchSheetMatches,
  fetchSheetRounds,
  fetchSheetTeams,
  matchDocPath,
  deleteSheetMatch,
  moveMatchToRound,
  updateSheetMatch,
} from "@/lib/match-sheet";
import { seasonKeyCandidates, toDashSeason, toSlashSeason } from "@/lib/season";

type HAPref = "H" | "A";

interface PendingRow {
  matchDate: string;
  competitionId: string;
  roundId: string;
  opponentTeamId: string;
  ha: HAPref;
  selfScore: number | null;
  oppScore: number | null;
  pkSelf: number | null;
  pkOpp: number | null;
}

const NEW_VALUE = "__new__";

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// 自チーム視点の得点イベントを抽出（type:'goal'自チーム or type:'og'相手チーム）
// シーズン文字列 → 選択可能な年一覧。例: "2027/28"→[2027,2028]、"2027"→[2027]
const seasonYearsOf = (season: string): number[] => {
  const m = season.match(/^(\d{4})(?:\/(\d{2,4}))?$/);
  if (!m) return [];
  const y1 = Number(m[1]);
  const y2 = m[2] ? (Number(m[2]) < 100 ? 2000 + Number(m[2]) : Number(m[2])) : y1;
  return y2 === y1 ? [y1] : [y1, y2];
};

const pad2 = (n: number) => String(n).padStart(2, "0");
const daysInMonth = (y: number, m: number) => new Date(y, m, 0).getDate();
// "2028-10-15" → "2028/10/15"（ゼロ埋めなし・既存表示形式）
const formatSlashDate = (iso: string): string => {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return y && m && d ? `${y}/${m}/${d}` : iso;
};

// ホイール式日付ピッカー（年｜月｜日 3列・中央帯・scroll-snap）
const WHEEL_ITEM_H = 56;
const MONTH_ITEMS = Array.from({ length: 12 }, (_, i) => i + 1);

const WheelColumn = ({ items, value, onPick, ariaLabel, alignLeft }: { items: { v: string; label: string }[]; value: string; onPick: (v: string) => void; ariaLabel: string; alignLeft?: boolean }) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const indexOf = (v: string) => Math.max(0, items.findIndex((i) => i.v === v));
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = indexOf(value) * WHEEL_ITEM_H;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div
      ref={ref}
      role="listbox"
      aria-label={ariaLabel}
      onScroll={(e) => {
        const i = Math.max(0, Math.min(items.length - 1, Math.round(e.currentTarget.scrollTop / WHEEL_ITEM_H)));
        const item = items[i];
        if (item && item.v !== value) onPick(item.v);
      }}
      className="h-[280px] flex-1 overflow-y-auto py-[112px] [scroll-snap-type:y_mandatory] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {items.map((item) => (
        <div
          key={item.v}
          data-picker-selected={item.v === value ? "true" : undefined}
          onClick={() => {
            onPick(item.v);
            ref.current?.scrollTo({ top: indexOf(item.v) * WHEEL_ITEM_H, behavior: "smooth" });
          }}
          className={`flex h-14 cursor-pointer items-center [scroll-snap-align:center] text-[22px] font-bold ${alignLeft ? "justify-start pl-6" : "justify-center"} ${item.v === value ? "text-blue-600" : "text-slate-400"}`}
        >
          {item.label}
        </div>
      ))}
    </div>
  );
};

const DateWheelModal = ({ initial, years, onDone, onClose }: { initial: string; years: number[]; onDone: (v: string) => void; onClose: () => void }) => {
  const [iy, im, id] = (initial || todayStr()).split("-").map(Number);
  const [y, setY] = useState(iy || years[0] || new Date().getFullYear());
  const [m, setM] = useState(im || 1);
  const [d, setD] = useState(id || 1);
  const maxD = daysInMonth(y, m);
  const clampDay = (ny: number, nm: number, nd: number) => Math.min(nd, daysInMonth(ny, nm));
  const yearItems = useMemo(() => [...new Set([...years, y])].sort((a, b) => a - b), [years, y]);
  const dayItems = useMemo(() => Array.from({ length: maxD }, (_, i) => i + 1), [maxD]);
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 px-4" onClick={onClose}>
      <div className="w-full max-w-md overflow-hidden rounded-[28px] bg-[#f4f4f6] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex h-12 items-center justify-between border-b border-slate-300/80 bg-white px-4">
          <button type="button" className="text-base font-bold text-blue-500" onClick={onClose}>キャンセル</button>
          <div className="text-sm font-bold text-slate-500">試合日を選択</div>
          <button
            type="button"
            className="text-base font-bold text-blue-500"
            onClick={() => onDone(`${y}-${pad2(m)}-${pad2(Math.min(d, maxD))}`)}
          >
            完了
          </button>
        </div>
        <div className="relative flex px-2">
          <div className="pointer-events-none absolute left-2 right-2 top-1/2 h-14 -translate-y-1/2 rounded-xl border-y border-slate-300/80 bg-blue-500/10" />
          <WheelColumn items={yearItems.map((n) => ({ v: String(n), label: String(n) }))} value={String(y)} onPick={(v) => { const ny = Number(v); setY(ny); setD((dd) => clampDay(ny, m, dd)); }} ariaLabel="年" />
          <WheelColumn items={MONTH_ITEMS.map((n) => ({ v: String(n), label: String(n) }))} value={String(m)} onPick={(v) => { const nm = Number(v); setM(nm); setD((dd) => clampDay(y, nm, dd)); }} ariaLabel="月" />
          <WheelColumn items={dayItems.map((n) => ({ v: String(n), label: String(n) }))} value={String(Math.min(d, maxD))} onPick={(v) => setD(Number(v))} ariaLabel="日" />
        </div>
        <div className="border-t border-slate-300/80 bg-white px-4 py-2 text-center text-[12px] font-bold text-[#1B1F27]">
          {y}/{m}/{Math.min(d, maxD)}
        </div>
      </div>
    </div>
  );
};

// 得点者追加: 左列=試合時間(未入力〜120)、右列=選手+OG（日付ピッカーと同じ見た目の2列ホイール）
const ScorerWheelModal = ({
  players,
  onDone,
  onClose,
}: {
  players: { v: string; label: string }[];
  onDone: (playerId: string, minute: string) => void;
  onClose: () => void;
}) => {
  const minuteItems = useMemo(() => {
    const items = [{ v: "", label: "未入力" }];
    for (let i = 1; i <= 120; i++) {
      items.push({ v: String(i), label: String(i) });
      // 45/90/105分の直後にロスタイム候補（45+1〜45+10 等）を時系列順で挿入
      if (i === 45 || i === 90 || i === 105) {
        for (let e = 1; e <= 10; e++) items.push({ v: `${i}+${e}`, label: `${i}+${e}` });
      }
    }
    return items;
  }, []);
  const [minute, setMinute] = useState("");
  const [playerId, setPlayerId] = useState(players[0]?.v ?? "");
  const preview = players.find((p) => p.v === playerId)?.label ?? "";
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 px-4" onClick={onClose}>
      <div className="w-full max-w-md overflow-hidden rounded-[28px] bg-[#f4f4f6] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex h-12 items-center justify-between border-b border-slate-300/80 bg-white px-4">
          <button type="button" className="text-base font-bold text-blue-500" onClick={onClose}>キャンセル</button>
          <div className="text-sm font-bold text-slate-500">得点時間（任意）と得点者を追加</div>
          <button type="button" className="text-base font-bold text-blue-500" onClick={() => playerId && onDone(playerId, minute)}>完了</button>
        </div>
        <div className="relative flex px-2">
          <div className="pointer-events-none absolute left-2 right-2 top-1/2 h-14 -translate-y-1/2 rounded-xl border-y border-slate-300/80 bg-blue-500/10" />
          <WheelColumn items={minuteItems} value={minute} onPick={setMinute} ariaLabel="試合時間" />
          <WheelColumn items={players} value={playerId} onPick={setPlayerId} ariaLabel="選手" alignLeft />
        </div>
        <div className="border-t border-slate-300/80 bg-white px-4 py-2 text-center text-[12px] font-bold text-[#1B1F27]">
          {minute ? `${minute}' ` : ""}{preview}
        </div>
      </div>
    </div>
  );
};

// スコア（自チーム視点）から勝敗バッジを生成。W=勝利(緑)/L=敗北(赤)/D=引分(灰)
// 通常スコア同点＋両PK入力済み＋PK不分 → PKで勝敗確定（片側のみ/PK同点は従来判定＝D）
const ResultBadge = ({ selfScore, oppScore, pkSelf, pkOpp }: { selfScore: number | null; oppScore: number | null; pkSelf?: number | null; pkOpp?: number | null }) => {
  if (selfScore === null || oppScore === null) return <span className="text-[#9CA3AF]">–</span>;
  const pkDecisive = selfScore === oppScore && pkSelf != null && pkOpp != null && pkSelf !== pkOpp;
  const effSelf = pkDecisive ? pkSelf : selfScore;
  const effOpp = pkDecisive ? pkOpp : oppScore;
  const r = effSelf > effOpp ? "W" : effSelf < effOpp ? "L" : "D";
  const cls = r === "W" ? "bg-emerald-500 text-white" : r === "L" ? "bg-red-500 text-white" : "bg-gray-400 text-white";
  return <span className={`inline-flex h-6 w-6 items-center justify-center rounded-md text-[11px] font-black ${cls}`}>{r}</span>;
};

const isOwnGoalEvent = (ev: MatchEvent, ownTeamId: string): boolean => {
  if (ev.type === "goal" && ev.teamId === ownTeamId) return true;
  // 相手側のオウンゴール=自チームの得点（旧type:"og"形式と構造化 own_goal 両対応）
  if (String(ev.type) === "og" && ev.teamId !== ownTeamId) return true;
  if (ev.type === "goal" && ev.goalKind === "own_goal" && ev.teamId !== ownTeamId) return true;
  return false;
};

const goalEventLabel = (ev: MatchEvent): string => {
  if (String(ev.type) === "og" || ev.goalKind === "own_goal") {
    const name = (ev.playerName || "").replace(/^OG\(|\)$/g, "").trim();
    return name && name !== "OG" ? `OG(${name})` : "OG";
  }
  return ev.playerName || "不明";
};

export function MatchSheet({ initialSeason, filterCompetitionId, filterTeamId, hideSeasonSelect }: { initialSeason?: string; filterCompetitionId?: string; filterTeamId?: string; hideSeasonSelect?: boolean }) {
  const { user } = useAuth();
  const { activeCareer, loading: careerLoading } = useCareer();
  // activeCareer未解決（Career未作成の旧ユーザー等）は uid フォールバック（EventForm等と同じ）
  const clubUid = activeCareer?.clubUid || user?.uid;

  const [loading, setLoading] = useState(true);
  const [competitions, setCompetitions] = useState<SheetCompetition[]>([]);
  const [roundsByComp, setRoundsByComp] = useState<Map<string, SheetRound[]>>(new Map());
  const [teams, setTeams] = useState<SheetTeam[]>([]);
  const [players, setPlayers] = useState<SheetPlayer[]>([]);

  const [mainTeamId, setMainTeamId] = useState<string | null>(null);
  const [rows, setRows] = useState<SheetMatchRow[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<string>("");
  const [pending, setPending] = useState<PendingRow>({
    matchDate: "",
    competitionId: "",
    roundId: "",
    opponentTeamId: "",
    ha: "H",
    selfScore: null,
    oppScore: null,
    pkSelf: null,
    pkOpp: null,
  });
  const [picker, setPicker] = useState<PickerRequest | null>(null);
  // PK入力枠の展開状態（行keyごと）＋新規行用フラグ
  const [pkOpenRows, setPkOpenRows] = useState<Record<string, boolean>>({});
  const [pkOpenPending, setPkOpenPending] = useState(false);
  // 新規入力行は「＋試合を追加」を押した時だけ表示
  const [pendingVisible, setPendingVisible] = useState(false);
  // 親ページ（/admin/matches）からの初期シーズン指定に追従
  useEffect(() => { if (initialSeason) setSelectedSeason(toSlashSeason(initialSeason)); }, [initialSeason]);
  const [newTextPrompt, setNewTextPrompt] = useState<{
    title: string;
    placeholder: string;
    value: string;
    onSubmit: (text: string) => Promise<void>;
  } | null>(null);
  const [savingKeys, setSavingKeys] = useState<Set<string>>(new Set());
  const [datePick, setDatePick] = useState<{ value: string; onDone: (v: string) => void } | null>(null);
  const [scorerPick, setScorerPick] = useState<SheetMatchRow | null>(null);

  const teamsMap = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);
  const competitionsMap = useMemo(() => new Map(competitions.map((c) => [c.id, c])), [competitions]);

  // seasons/{dash}/roster も候補元として読む（roster側にのみ在籍が登録されている選手を拾う）
  const [rosterPlayers, setRosterPlayers] = useState<{ id: string; name: string; number?: number; teamId?: string }[]>([]);
  useEffect(() => {
    if (!clubUid || !selectedSeason) { setRosterPlayers([]); return; }
    let cancelled = false;
    void (async () => {
      try {
        const dash = toDashSeason(selectedSeason);
        const sids0 = seasonKeyCandidates(selectedSeason);
        // seasonsコレクション内で docID/season/name が一致するdocもroster元に含める（自動ID対応）
        const seasonsSnap = await getDocs(collection(db, `clubs/${clubUid}/seasons`));
        const seasonDocIds = new Set([dash]);
        for (const d of seasonsSnap.docs) {
          const keys = seasonKeyCandidates(d.id);
          const field = String((d.data() as any).season || (d.data() as any).name || "");
          if (field) keys.push(...seasonKeyCandidates(field));
          if (keys.some((k) => sids0.includes(k))) seasonDocIds.add(d.id);
        }
        const snaps = await Promise.all([...seasonDocIds].map((sid) => getDocs(collection(db, `clubs/${clubUid}/seasons/${sid}/roster`))));
        if (cancelled) return;
        const sids = seasonKeyCandidates(selectedSeason);
        const out = snaps.flatMap((s) => s.docs)
          .filter((d) => {
            const data = d.data() as any;
            if (data?.registered === false) return false;
            const sd = data?.seasonData && typeof data.seasonData === "object" ? data.seasonData : null;
            const arr = Array.isArray(data?.seasons) ? data.seasons : null;
            if (sd) return sids.some((k) => k in sd);
            if (arr && arr.length) return arr.some((s: any) => seasonKeyCandidates(String(s)).some((k) => sids.includes(k)));
            return true;
          })
          .map((d) => {
            const data = d.data() as any;
            return {
              id: typeof data?.playerId === "string" && data.playerId ? data.playerId : d.id,
              name: data?.name || data?.playerName || "",
              number: typeof data?.number === "number" ? data.number : undefined,
              teamId: typeof data?.teamId === "string" ? data.teamId : undefined,
            };
          })
          .filter((p) => p.name);
        setRosterPlayers(out);
      } catch {
        if (!cancelled) setRosterPlayers([]);
      }
    })();
    return () => { cancelled = true; };
  }, [clubUid, selectedSeason]);

  // 得点者候補 = 選手管理画面と同じロジック（player自身の seasons / seasonData で在籍判定。
  // rosterコレクションは参照しないため取得失敗で空になる問題を回避。
  // シーズン情報を持たない選手はレガシーとして在籍扱い＝選手管理画面の表示と一致）
  const scorerCandidates = useMemo(() => {
    const rosterIds = new Set(rosterPlayers.map((p) => p.id));
    return players.filter((p) => rosterIds.has(p.id));
  }, [players, rosterPlayers]);

  const markSaving = (key: string, on: boolean) => {
    setSavingKeys((prev) => {
      const next = new Set(prev);
      if (on) next.add(key); else next.delete(key);
      return next;
    });
  };

  const loadAll = useCallback(async () => {
    if (!clubUid) return;
    setLoading(true);
    try {
      const [comps, teamList] = await Promise.all([
        fetchSheetCompetitions(db, clubUid),
        fetchSheetTeams(db, clubUid),
      ]);
      setCompetitions(comps);
      setTeams(teamList);

      // mainTeamId
      let main: string | null = null;
      try {
        const p = await getDoc(doc(db, "club_profiles", clubUid));
        if (p.exists() && typeof p.data()?.mainTeamId === "string") main = p.data().mainTeamId;
        if (!main) {
          const q = await getDocs(query(collection(db, "club_profiles"), where("ownerUid", "==", clubUid)));
          const d0 = q.docs[0]?.data() as any;
          if (typeof d0?.mainTeamId === "string") main = d0.mainTeamId;
        }
      } catch { /* continue */ }
      setMainTeamId(main);

      // 自チーム選手（得点者候補）: mainTeamId配下＋Career方式の teams/{clubUid}/players を併用（ID重複除去）
      if (main || clubUid) {
        const paths = new Set<string>();
        if (main) paths.add(`clubs/${clubUid}/teams/${main}/players`);
        paths.add(`clubs/${clubUid}/teams/${clubUid}/players`);
        const merged = new Map<string, SheetPlayer>();
        for (const p of paths) {
          try {
            const ps = await getDocs(collection(db, p));
            for (const d of ps.docs) merged.set(d.id, { id: d.id, ...(d.data() as any) } as SheetPlayer);
          } catch { /* pathなし */ }
        }
        setPlayers([...merged.values()].sort((a, b) => (a.number ?? 999) - (b.number ?? 999)));
      }

      // 大会ごとの節＋試合
      const roundsMap = new Map<string, SheetRound[]>();
      const allRows: SheetMatchRow[] = [];
      for (const comp of comps) {
        const rounds = await fetchSheetRounds(db, clubUid, comp.id);
        roundsMap.set(comp.id, rounds);
        for (const round of rounds) {
          const matches = await fetchSheetMatches(db, clubUid, comp, round);
          allRows.push(...matches);
        }
      }
      setRoundsByComp(roundsMap);
      // 自チーム（mainTeamIdまたはclubUid）が出場する試合のみ表示
      const ownIds = new Set([main, clubUid].filter(Boolean) as string[]);
      const ownRows = allRows.filter((r) => ownIds.has(r.homeTeam) || ownIds.has(r.awayTeam));
      ownRows.sort((a, b) => (a.matchDate || "9999").localeCompare(b.matchDate || "9999"));
      setRows(ownRows);

      const seasons = [...new Set(comps.map((c) => (c.season || "").trim()).filter(Boolean))].map(toSlashSeason).sort().reverse();
      const init = initialSeason ? toSlashSeason(initialSeason) : "";
      setSelectedSeason((prev) => prev || (init && seasons.includes(init) ? init : seasons[0]) || "");
    } catch (e) {
      console.error(e);
      toast.error("試合データの読み込みに失敗しました。");
    } finally {
      setLoading(false);
    }
  }, [clubUid]);

  useEffect(() => {
    setRows([]);
    setCompetitions([]);
    setRoundsByComp(new Map());
    setTeams([]);
    setPlayers([]);
    setMainTeamId(null);
    setSelectedSeason("");
    if (careerLoading) return;
    if (!clubUid) { setLoading(false); return; }
    void loadAll();
  }, [clubUid, careerLoading, loadAll]);

  // === 行の表示用導出 ===
  // 新規行ホイールの開始位置: 直近の日付入り試合（なければ今日）
  const latestRowDate = () => {
    for (let i = rows.length - 1; i >= 0; i--) {
      const d = rows[i].matchDate;
      if (d) return d;
    }
    return todayStr();
  };

  const describe = (row: SheetMatchRow) => {
    const own = mainTeamId;
    let ha: HAPref | "" = "";
    let opponentId = "";
    if (own) {
      if (row.homeTeam === own) { ha = "H"; opponentId = row.awayTeam; }
      else if (row.awayTeam === own) { ha = "A"; opponentId = row.homeTeam; }
    }
    if (!opponentId) {
      opponentId = [row.homeTeam, row.awayTeam].find((t) => t && t !== own) || "";
    }
    const selfScore = ha === "A" ? row.scoreAway : ha === "H" ? row.scoreHome : row.scoreHome;
    const oppScore = ha === "A" ? row.scoreHome : ha === "H" ? row.scoreAway : row.scoreAway;
    const pkSelf = ha === "A" ? row.pkScoreAway : row.pkScoreHome;
    const pkOpp = ha === "A" ? row.pkScoreHome : row.pkScoreAway;
    const ownTeamId = ha === "A" ? row.awayTeam : ha === "H" ? row.homeTeam : own || row.homeTeam;
    return { ha, opponentId, selfScore, oppScore, pkSelf, pkOpp, ownTeamId };
  };

  // === 自動保存 ===
  const saveField = async (row: SheetMatchRow, patch: Record<string, unknown>) => {
    if (!clubUid) return;
    const comp = competitionsMap.get(row.competitionId);
    const round = (roundsByComp.get(row.competitionId) || []).find((r) => r.id === row.roundId);
    if (!comp || !round) return;
    markSaving(row.key, true);
    try {
      await updateSheetMatch(db, clubUid, comp, round, row.matchId, patch, teamsMap);
      setRows((prev) => prev.map((r) => (r.key === row.key ? { ...r, ...patch } as SheetMatchRow : r)));
    } catch (e) {
      console.error(e);
      toast.error("保存に失敗しました。");
    } finally {
      markSaving(row.key, false);
    }
  };

  const setHa = (row: SheetMatchRow, ha: HAPref, opponentId: string) => {
    const own = row.homeTeam === mainTeamId || row.awayTeam === mainTeamId
      ? (row.homeTeam === mainTeamId ? row.homeTeam : row.awayTeam)
      : mainTeamId || row.homeTeam || row.awayTeam;
    if (!own) return;
    // H/A変更＝自チームをhome/awayスロットに置き換え、相手は反対側へ
    const patch = ha === "H"
      ? { homeTeam: own, awayTeam: opponentId || row.awayTeam }
      : { awayTeam: own, homeTeam: opponentId || row.homeTeam };
    // スコアは「自–相」表示なので並び替え時も視点を維持: スコア自体はhome/awayの値をそのまま保持する
    void saveField(row, patch);
  };

  const setOpponent = (row: SheetMatchRow, opponentId: string, ha: HAPref | "") => {
    const ownTeamId = row.homeTeam === mainTeamId ? row.homeTeam
      : row.awayTeam === mainTeamId ? row.awayTeam
      : (mainTeamId || row.homeTeam || row.awayTeam);
    const effHa = ha || (row.awayTeam === ownTeamId ? "A" : "H");
    const patch = effHa === "H"
      ? { homeTeam: ownTeamId, awayTeam: opponentId }
      : { awayTeam: ownTeamId, homeTeam: opponentId };
    void saveField(row, patch);
  };

  const setScore = (row: SheetMatchRow, side: "self" | "opp", raw: string) => {
    const { ha } = describe(row);
    const value = raw === "" ? null : Math.max(0, Math.min(99, parseInt(raw, 10) || 0));
    let patch: Record<string, unknown>;
    if (ha === "A") {
      patch = side === "self" ? { scoreAway: value } : { scoreHome: value };
    } else {
      patch = side === "self" ? { scoreHome: value } : { scoreAway: value };
    }
    void saveField(row, patch);
  };

  // PKスコア（自/相 → pkScoreHome/pkScoreAway。H/Aに応じてhome/away変換）
  const setPkScore = (row: SheetMatchRow, side: "self" | "opp", raw: string) => {
    const { ha } = describe(row);
    const value = raw === "" ? null : Math.max(0, Math.min(99, parseInt(raw, 10) || 0));
    const patch = ha === "A"
      ? (side === "self" ? { pkScoreAway: value } : { pkScoreHome: value })
      : (side === "self" ? { pkScoreHome: value } : { pkScoreAway: value });
    void saveField(row, patch);
  };

  // PK欄を出すか: カップ/カップ・リーグ戦 かつ 通常スコアが同点（両方入力済み）
  const isCupFormat = (compId: string) => {
    const f = competitionsMap.get(compId)?.format;
    return f === "cup" || f === "league_cup";
  };
  const showPkUi = (compId: string, selfScore: number | null, oppScore: number | null) =>
    isCupFormat(compId) && selfScore !== null && oppScore !== null && selfScore === oppScore;

  // === 得点者セル ===
  const ownGoals = (row: SheetMatchRow): MatchEvent[] => {
    const { ownTeamId } = describe(row);
    return (row.events || []).filter((e) => ownTeamId && isOwnGoalEvent(e, ownTeamId));
  };

  const addScorer = async (row: SheetMatchRow, playerId: string, minute = "") => {
    if (!clubUid) return;
    const { ownTeamId, opponentId } = describe(row);
    const path = matchDocPath(clubUid, row.competitionId, row.roundId, row.matchId);
    markSaving(row.key, true);
    const min = minute.trim();
    try {
      if (playerId === "__og__") {
        await appendMatchEvent(db, path, {
          id: crypto.randomUUID(),
          type: "goal",
          minute: min,
          teamId: ownTeamId,
          goalKind: "own_goal",
          playerName: "OG",
          source: "manual",
        });
      } else {
        const p = players.find((pl) => pl.id === playerId);
        if (!p) return;
        await appendMatchEvent(db, path, {
          id: crypto.randomUUID(),
          type: "goal",
          minute: min,
          teamId: ownTeamId,
          playerId: p.id,
          playerName: p.name,
          source: "manual",
        });
      }
      await refreshRow(row);
    } catch (e) {
      console.error(e);
      toast.error("得点の追加に失敗しました。");
    } finally {
      markSaving(row.key, false);
    }
  };


  const removeScorer = async (row: SheetMatchRow, eventId: string) => {
    if (!clubUid) return;
    const path = matchDocPath(clubUid, row.competitionId, row.roundId, row.matchId);
    markSaving(row.key, true);
    try {
      await removeMatchEvent(db, path, `evt-${eventId}`);
      setRows((prev) => prev.map((r) => r.key === row.key ? { ...r, events: (r.events || []).filter((e) => e.id !== eventId) } : r));
    } catch (e) {
      console.error(e);
      toast.error("得点の削除に失敗しました。");
    } finally {
      markSaving(row.key, false);
    }
  };

  // 試合行の削除（doc本体+イベント+公開indexを1バッチで除去・確認後のみ実行）
  const deleteRow = async (row: SheetMatchRow) => {
    if (!clubUid) return;
    const compName = competitionsMap.get(row.competitionId)?.name || "大会";
    const roundName = (roundsByComp.get(row.competitionId) || []).find((r) => r.id === row.roundId)?.name || row.roundId;
    if (!window.confirm(`${compName} ${roundName} のこの試合を削除しますか？この操作は取り消せません。`)) return;
    markSaving(row.key, true);
    try {
      await deleteSheetMatch(db, clubUid, row.competitionId, row.roundId, row.matchId);
      setRows((prev) => prev.filter((r) => r.key !== row.key));
      toast.success("試合を削除しました。");
    } catch (e) {
      console.error(e);
      toast.error("削除に失敗しました。");
    } finally {
      markSaving(row.key, false);
    }
  };

  const refreshRow = async (row: SheetMatchRow) => {
    if (!clubUid) return;
    const comp = competitionsMap.get(row.competitionId);
    const round = (roundsByComp.get(row.competitionId) || []).find((r) => r.id === row.roundId);
    if (!comp || !round) return;
    const matches = await fetchSheetMatches(db, clubUid, comp, round);
    const fresh = matches.find((m) => m.matchId === row.matchId);
    if (fresh) setRows((prev) => prev.map((r) => (r.key === row.key ? fresh : r)));
  };

  // === 新規行（pending） ===
  const pendingRoundOptions = pending.competitionId ? (roundsByComp.get(pending.competitionId) || []) : [];

  // 大会＋節が揃った時点で試合docを1件だけ作成（保持中の値をすべて書き込む）
  const materializePending = async (next: PendingRow) => {
    if (!clubUid || !next.competitionId || !next.roundId || !mainTeamId) return;
    const comp = competitionsMap.get(next.competitionId);
    const round = pendingRoundOptions.find((r) => r.id === next.roundId);
    if (!comp || !round) return;
    try {
      const homeTeam = next.ha === "H" ? mainTeamId : next.opponentTeamId;
      const awayTeam = next.ha === "H" ? next.opponentTeamId : mainTeamId;
      const scoreHome = next.ha === "H" ? next.selfScore : next.oppScore;
      const scoreAway = next.ha === "H" ? next.oppScore : next.selfScore;
      const matchId = await createSheetMatch(db, clubUid, comp, round, {
        matchDate: next.matchDate,
        homeTeam, awayTeam, scoreHome, scoreAway,
        pkScoreHome: next.ha === "H" ? next.pkSelf : next.pkOpp,
        pkScoreAway: next.ha === "H" ? next.pkOpp : next.pkSelf,
      }, teamsMap);
      toast.success("試合カードを作成しました。");
      setPending({ matchDate: "", competitionId: "", roundId: "", opponentTeamId: "", ha: "H", selfScore: null, oppScore: null, pkSelf: null, pkOpp: null });
      setPendingVisible(false); // 作成後は入力行を閉じ、次は「＋試合を追加」で開く
      // 全件リロードせず作成した行だけローカル追加（日付順を維持）
      const newRow: SheetMatchRow = {
        key: `${comp.id}__${round.id}__${matchId}`,
        matchId,
        competitionId: comp.id,
        roundId: round.id,
        competitionName: comp.name,
        roundName: round.name,
        matchDate: next.matchDate || "",
        homeTeam, awayTeam, scoreHome, scoreAway,
        pkScoreHome: next.ha === "H" ? next.pkSelf : next.pkOpp,
        pkScoreAway: next.ha === "H" ? next.pkOpp : next.pkSelf,
        events: [],
      };
      setRows((prev) => [...prev, newRow].sort((a, b) => (a.matchDate || "9999").localeCompare(b.matchDate || "9999")));
    } catch (e) {
      console.error(e);
      toast.error("作成に失敗しました。");
    }
  };

  const updatePending = (patch: Partial<PendingRow>) => {
    const next = { ...pending, ...patch };
    setPending(next);
    if (next.competitionId && next.roundId) void materializePending(next);
  };

  // === セル用ピッカー ===
  // 得点イベントの分を後入れ（同じイベントidを更新するため二重登録にならない）

  const openCompetitionPicker = (current: string, onPick: (id: string) => void) => {
    // 選択中シーズンに登録されている大会のみ（season未設定の大会も含める・行表示と同じルール）
    const list = selectedSeason
      ? competitions.filter((c) => toSlashSeason(c.season || "") === selectedSeason || !c.season)
      : competitions;
    setPicker({
      title: "大会を選択",
      value: current,
      options: list.map((c) => ({ value: c.id, label: c.name, iconUrl: c.logoUrl })),
      onSelect: onPick,
    });
  };

  const openRoundPicker = (compId: string, current: string, onPick: (id: string) => void) => {
    // 節名を数値解釈して順序化（"第9節"→9、"第10節"→10。数値なしは末尾）
    const rounds = [...(roundsByComp.get(compId) || [])].sort((a, b) => {
      const na = parseInt(String(a.name).replace(/\D/g, ""), 10);
      const nb = parseInt(String(b.name).replace(/\D/g, ""), 10);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      if (!isNaN(na)) return -1;
      if (!isNaN(nb)) return 1;
      return a.name.localeCompare(b.name, "ja");
    });
    setPicker({
      title: "節・ラウンドを選択",
      value: current,
      options: [
        { value: NEW_VALUE, label: "＋ 新しい節を追加" },
        ...rounds.map((r) => ({ value: r.id, label: r.name })),
      ],
      onSelect: (v) => {
        if (v === NEW_VALUE) {
          setNewTextPrompt({
            title: "新しい節・ラウンド名",
            placeholder: "例: 第10節",
            value: `第${rounds.length + 1}節`,
            onSubmit: async (text) => {
              if (!clubUid || !text.trim()) return;
              const created = await createSheetRound(db, clubUid, compId, text.trim());
              setRoundsByComp((prev) => {
                const next = new Map(prev);
                next.set(compId, [...(next.get(compId) || []), created]);
                return next;
              });
              onPick(created.id);
            },
          });
          return;
        }
        onPick(v);
      },
    });
  };

  const openOpponentPicker = (current: string, competitionId: string | null, onPick: (id: string) => void) => {
    // 大会が選ばれている場合は、その大会に登録されているチームのみ候補に出す
    const registered = competitionId ? competitionsMap.get(competitionId)?.teams : undefined;
    const candidates = teams
      .filter((t) => t.id !== mainTeamId && (!registered || registered.includes(t.id)))
      .sort((a, b) => a.name.localeCompare(b.name, "ja"));
    setPicker({
      title: "対戦相手を選択",
      value: current,
      // 大会に登録済みのチームのみ選択（セルからの新規チーム追加は行わない）
      options: candidates.map((t) => ({ value: t.id, label: t.name, iconUrl: t.logoUrl })),
      onSelect: (v) => onPick(v),
    });
  };

  // === UI ===
  if (careerLoading || loading) {
    return (
      <div className="container mx-auto flex items-center justify-center py-10">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }
  if (!user) {
    return <div className="container mx-auto py-10">ログインしてください。</div>;
  }

  const seasonComps = selectedSeason
    ? competitions.filter((c) => toSlashSeason(c.season || "") === selectedSeason || !c.season)
    : competitions;
  const visibleRows = (selectedSeason
    ? rows.filter((r) => {
        const comp = competitionsMap.get(r.competitionId);
        return !comp?.season || toSlashSeason(comp.season) === selectedSeason;
      })
    : rows
  ).filter((r) => {
    // 上部フィルター連動: 大会・チーム（自/相どちらかに該当すれば表示）
    if (filterCompetitionId && filterCompetitionId !== "all" && r.competitionId !== filterCompetitionId) return false;
    if (filterTeamId && filterTeamId !== "all" && r.homeTeam !== filterTeamId && r.awayTeam !== filterTeamId) return false;
    return true;
  });

  const cellBase = "border-r border-[#E2E4EA] px-1.5 py-1 align-middle";
  const selBtn = "w-full min-w-[92px] h-8 rounded-md border border-[#E2E4EA] bg-white px-2 text-left text-[12px] text-[#1B1F27] truncate";

  return (
    <div className="w-full py-6 px-2 sm:px-4">
      <div className="mx-auto w-full max-w-[1200px] space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 px-1">
          <div>
            <p className="text-[11px] text-[#6B7280]">セルをタップして編集・自動保存。詳細入力は右端「詳細」から。</p>
          </div>
          {!hideSeasonSelect && (
            <div className="w-[180px]">
              <Select value={selectedSeason} onValueChange={setSelectedSeason}>
                <SelectTrigger className="h-9 border-[#E2E4EA] bg-white text-[#1B1F27]">
                  <SelectValue placeholder="シーズン" />
                </SelectTrigger>
                <SelectContent>
                  {[...new Set(competitions.map((c) => toSlashSeason(c.season || "")).filter(Boolean))].sort().reverse().map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {/* スマホでは親の余白を突き抜けて画面幅いっぱいにテーブルを表示（PCは従来どおり中央コンテナ内） */}
        <div className="overflow-x-auto rounded-[10px] border border-[#E2E4EA] bg-white max-sm:relative max-sm:left-1/2 max-sm:w-screen max-sm:-translate-x-1/2">
          <table className="w-full min-w-[1120px] border-collapse text-[12px]">
            <thead>
              <tr className="border-b border-[#E2E4EA] bg-[#F8F9FB] text-left text-[11px] font-semibold text-[#6B7280]">
                <th className={`${cellBase} w-[108px]`}>日付</th>
                <th className={`${cellBase} w-[130px]`}>大会名</th>
                <th className={`${cellBase} w-[110px]`}>節・ラウンド</th>
                <th className={`${cellBase} w-[140px]`}>対戦相手</th>
                <th className={`${cellBase} w-[56px] text-center`}>H/A</th>
                <th className={`${cellBase} w-[110px] text-center`}>スコア</th>
                <th className={`${cellBase} w-[44px] text-center`}>勝敗</th>
                <th className={`${cellBase} min-w-[360px]`}>得点者・時間</th>
                <th className={`${cellBase} w-[64px] text-center`}>詳細</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-[#9CA3AF]">
                    <CalendarDays className="mx-auto mb-2 h-8 w-8" strokeWidth={1.5} />
                    このシーズンの試合カードはありません。
                  </td>
                </tr>
              )}
              {visibleRows.map((row) => {
                const d = describe(row);
                const saving = savingKeys.has(row.key);
                const goals = ownGoals(row);
                return (
                  <tr key={row.key} className="border-b border-[#E2E4EA] last:border-b-0 hover:bg-[#F8F9FB]/60">
                    {/* 日付（ホイール式ピッカー「試合日を選択」で編集・表示は YYYY/M/D） */}
                    <td className={cellBase}>
                      <button
                        type="button"
                        onClick={() => setDatePick({ value: row.matchDate, onDone: (v) => void saveField(row, { matchDate: v }) })}
                        className="flex h-8 w-[104px] items-center gap-1 rounded-md border border-[#E2E4EA] bg-white px-1.5 text-[12px] font-semibold text-[#1B1F27]"
                      >
                        <CalendarDays className="h-3.5 w-3.5 shrink-0 text-[#9AA0AE]" />
                        <span className="truncate">{formatSlashDate(row.matchDate) || "—"}</span>
                      </button>
                    </td>
                    {/* 大会名（既存行は参照のみ） */}
                    <td className={cellBase}>
                      <span className="block truncate px-1 text-[12px] text-[#1B1F27]">{row.competitionName}</span>
                    </td>
                    {/* 節（同一大会内での移動可。大会名は参照専用） */}
                    <td className={cellBase}>
                      <button
                        type="button"
                        className={selBtn}
                        onClick={() =>
                          openRoundPicker(row.competitionId, row.roundId, async (newRoundId) => {
                            if (!clubUid || newRoundId === row.roundId) return;
                            const comp = competitionsMap.get(row.competitionId);
                            const fromRound = (roundsByComp.get(row.competitionId) || []).find((r) => r.id === row.roundId);
                            const toRound = (roundsByComp.get(row.competitionId) || []).find((r) => r.id === newRoundId);
                            if (!comp || !fromRound || !toRound) return;
                            if (!window.confirm(`${fromRound.name} から ${toRound.name} へこの試合を移動しますか？\n節を変更すると公開ページのURLが変わり、以前のリンクは開けなくなります。`)) return;
                            markSaving(row.key, true);
                            try {
                              await moveMatchToRound(db, clubUid, comp, fromRound, toRound, row.matchId, teamsMap);
                              toast.success(`${toRound.name}へ移動しました。`);
                              await loadAll();
                            } catch (e: any) {
                              toast.error(e?.message || "移動に失敗しました。");
                            } finally {
                              markSaving(row.key, false);
                            }
                          })
                        }
                      >
                        {row.roundName}
                      </button>
                    </td>
                    {/* 対戦相手 */}
                    <td className={cellBase}>
                      <button type="button" className={selBtn} onClick={() => openOpponentPicker(d.opponentId, row.competitionId, (id) => setOpponent(row, id, d.ha || "H"))}>
                        {d.opponentId ? (
                          <span className="flex items-center gap-1.5">
                            {teamsMap.get(d.opponentId)?.logoUrl && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={teamsMap.get(d.opponentId)!.logoUrl} alt="" className="h-4 w-4 shrink-0 rounded-full object-contain" />
                            )}
                            <span className="truncate">{teamsMap.get(d.opponentId)?.name || "未設定"}</span>
                          </span>
                        ) : "相手を選択"}
                      </button>
                    </td>
                    {/* H/A */}
                    <td className={`${cellBase} text-center`}>
                      <div className="inline-flex overflow-hidden rounded-md border border-[#E2E4EA]">
                        {(["H", "A"] as const).map((v) => (
                          <button
                            key={v}
                            type="button"
                            onClick={() => setHa(row, v, d.opponentId)}
                            className={`h-7 w-7 text-[11px] font-bold ${d.ha === v ? "bg-[#3355FF] text-white" : "bg-white text-[#6B7280]"}`}
                          >
                            {v}
                          </button>
                        ))}
                      </div>
                    </td>
                    {/* スコア（自–相・nullは空欄表示）＋PK（カップ戦の引分時のみ展開） */}
                    <td className={`${cellBase} relative text-center`}>
                      {(() => {
                        const pkEligible = showPkUi(row.competitionId, d.selfScore, d.oppScore);
                        const pkOpen = pkEligible && !!pkOpenRows[row.key];
                        return (
                          <>
                            {pkOpen ? (
                              <div className="flex items-center justify-center gap-0.5">
                                <input inputMode="numeric" value={d.selfScore ?? ""} placeholder="–" onChange={(e) => setScore(row, "self", e.target.value)} className="h-7 w-8 rounded-md border border-[#E2E4EA] bg-white text-center text-[12px] font-bold text-[#1B1F27]" />
                                <span className="text-[9px] font-black text-emerald-600">[</span>
                                <input inputMode="numeric" value={d.pkSelf ?? ""} placeholder="–" onChange={(e) => setPkScore(row, "self", e.target.value)} className="h-6 w-5 rounded border border-emerald-300 bg-emerald-50 text-center text-[10px] font-bold text-emerald-700" title="PK（自）" />
                                <span className="text-[9px] font-black text-emerald-600">]</span>
                                <span className="text-[11px] text-[#9CA3AF]">−</span>
                                <span className="text-[9px] font-black text-emerald-600">[</span>
                                <input inputMode="numeric" value={d.pkOpp ?? ""} placeholder="–" onChange={(e) => setPkScore(row, "opp", e.target.value)} className="h-6 w-5 rounded border border-emerald-300 bg-emerald-50 text-center text-[10px] font-bold text-emerald-700" title="PK（相）" />
                                <span className="text-[9px] font-black text-emerald-600">]</span>
                                <input inputMode="numeric" value={d.oppScore ?? ""} placeholder="–" onChange={(e) => setScore(row, "opp", e.target.value)} className="h-7 w-8 rounded-md border border-[#E2E4EA] bg-white text-center text-[12px] font-bold text-[#1B1F27]" />
                              </div>
                            ) : (
                              <div className="flex items-center justify-center gap-1">
                                <input
                                  inputMode="numeric"
                                  value={d.selfScore ?? ""}
                                  placeholder="–"
                                  onChange={(e) => setScore(row, "self", e.target.value)}
                                  className="h-8 w-9 rounded-md border border-[#E2E4EA] bg-white text-center text-[14px] font-bold text-[#1B1F27]"
                                />
                                <span className="text-[#9CA3AF]">–</span>
                                <input
                                  inputMode="numeric"
                                  value={d.oppScore ?? ""}
                                  placeholder="–"
                                  onChange={(e) => setScore(row, "opp", e.target.value)}
                                  className="h-8 w-9 rounded-md border border-[#E2E4EA] bg-white text-center text-[14px] font-bold text-[#1B1F27]"
                                />
                              </div>
                            )}
                            {pkEligible && (
                              <button
                                type="button"
                                onClick={() => setPkOpenRows((prev) => ({ ...prev, [row.key]: !pkOpen }))}
                                className={`absolute right-0.5 top-0.5 rounded px-1 text-[8px] font-black leading-4 ${pkOpen ? "bg-emerald-500 text-white" : "bg-emerald-100 text-emerald-700"}`}
                                title="PKスコアを入力"
                              >
                                PK
                              </button>
                            )}
                          </>
                        );
                      })()}
                    </td>
                    {/* 勝敗（スコア×H/Aから自動算出・編集不可。PK決着時はPKで判定） */}
                    <td className={`${cellBase} text-center`}>
                      <ResultBadge selfScore={d.selfScore} oppScore={d.oppScore} pkSelf={d.pkSelf} pkOpp={d.pkOpp} />
                    </td>
                    {/* 得点者・時間 */}
                    <td className={cellBase}>
                      <div className="flex flex-wrap items-center gap-1">
                        {goals.map((ev) => (
                          <span key={ev.id} className="inline-flex items-center gap-1 rounded-full bg-[#3355FF12] px-2 py-1">
                            <span className="text-[11px] font-semibold text-[#1B1F27]">
                              {/* 分は登録済みのみ名前の頭に表示（登録後は編集不可。空欄 "" は0と誤判定しないよう生値で判定） */}
                              {ev.minute != null && ev.minute !== "" && formatMinute(ev.minute) !== "" && (
                                <span className="mr-0.5 text-[#3355FF]">{formatMinute(ev.minute)}'</span>
                              )}
                              {goalEventLabel(ev)}
                            </span>
                            <button type="button" onClick={() => void removeScorer(row, ev.id)} className="text-[#9CA3AF] hover:text-red-500" aria-label="削除">
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        ))}
                        <button
                          type="button"
                          disabled={!d.ownTeamId}
                          onClick={() => setScorerPick(row)}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-dashed border-[#9CA3AF] text-[#6B7280] hover:text-[#3355FF] disabled:opacity-40"
                          aria-label="得点者を追加"
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                    {/* 詳細＋削除 */}
                    <td className={`${cellBase} text-center`}>
                      <div className="inline-flex items-center gap-0.5">
                        <Link
                          href={`/admin/competitions/${row.competitionId}/rounds/${row.roundId}/matches/${row.matchId}`}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[#6B7280] hover:bg-[#3355FF12] hover:text-[#3355FF]"
                          aria-label="詳細を開く"
                        >
                          <FilePenLine className="h-4 w-4" />
                        </Link>
                        <button
                          type="button"
                          onClick={() => void deleteRow(row)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[#9CA3AF] hover:bg-red-50 hover:text-red-500"
                          aria-label="試合を削除"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                      {saving && <Loader2 className="ml-1 inline h-3 w-3 animate-spin text-[#9CA3AF]" />}
                    </td>
                  </tr>
                );
              })}

              {/* 新規行（pending）「＋試合を追加」で表示 */}
              {pendingVisible && (
              <tr className="bg-[#F8F9FB]/70">
                <td className={cellBase}>
                  <button
                    type="button"
                    id="sheet-pending-date"
                    onClick={() => setDatePick({ value: pending.matchDate || latestRowDate(), onDone: (v) => updatePending({ matchDate: v }) })}
                    className="flex h-8 w-[104px] items-center gap-1 rounded-md border border-dashed border-[#9CA3AF] bg-white px-1.5 text-[12px] font-semibold text-[#1B1F27]"
                  >
                    <CalendarDays className="h-3.5 w-3.5 shrink-0 text-[#9AA0AE]" />
                    <span className={`truncate ${pending.matchDate ? "" : "text-[#9AA0AE] font-normal"}`}>
                      {pending.matchDate ? formatSlashDate(pending.matchDate) : "日付を選択"}
                    </span>
                  </button>
                </td>
                <td className={cellBase}>
                  <button type="button" className={selBtn} onClick={() => openCompetitionPicker(pending.competitionId, (id) => updatePending({ competitionId: id, roundId: "" }))}>
                    {pending.competitionId ? competitionsMap.get(pending.competitionId)?.name : "大会を選択"}
                  </button>
                </td>
                <td className={cellBase}>
                  <button
                    type="button"
                    className={selBtn}
                    disabled={!pending.competitionId}
                    onClick={() => pending.competitionId && openRoundPicker(pending.competitionId, pending.roundId, (id) => updatePending({ roundId: id }))}
                  >
                    {pending.roundId ? pendingRoundOptions.find((r) => r.id === pending.roundId)?.name : "節を選択"}
                  </button>
                </td>
                <td className={cellBase}>
                  <button type="button" className={selBtn} onClick={() => openOpponentPicker(pending.opponentTeamId, pending.competitionId || null, (id) => updatePending({ opponentTeamId: id }))}>
                    {pending.opponentTeamId ? (
                      <span className="flex items-center gap-1.5">
                        {teamsMap.get(pending.opponentTeamId)?.logoUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={teamsMap.get(pending.opponentTeamId)!.logoUrl} alt="" className="h-4 w-4 shrink-0 rounded-full object-contain" />
                        )}
                        <span className="truncate">{teamsMap.get(pending.opponentTeamId)?.name}</span>
                      </span>
                    ) : "相手を選択"}
                  </button>
                </td>
                <td className={`${cellBase} text-center`}>
                  <div className="inline-flex overflow-hidden rounded-md border border-[#E2E4EA]">
                    {(["H", "A"] as const).map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => updatePending({ ha: v })}
                        className={`h-7 w-7 text-[11px] font-bold ${pending.ha === v ? "bg-[#3355FF] text-white" : "bg-white text-[#6B7280]"}`}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </td>
                <td className={`${cellBase} relative text-center`}>
                  {(() => {
                    const pkEligible = showPkUi(pending.competitionId, pending.selfScore, pending.oppScore);
                    const pkOpen = pkEligible && pkOpenPending;
                    return (
                      <>
                        {pkOpen ? (
                          <div className="flex items-center justify-center gap-0.5">
                            <input inputMode="numeric" value={pending.selfScore ?? ""} placeholder="–" onChange={(e) => updatePending({ selfScore: e.target.value === "" ? null : Math.max(0, Math.min(99, parseInt(e.target.value, 10) || 0)) })} className="h-7 w-8 rounded-md border border-[#E2E4EA] bg-white text-center text-[12px] font-bold" />
                            <span className="text-[9px] font-black text-emerald-600">[</span>
                            <input inputMode="numeric" value={pending.pkSelf ?? ""} placeholder="–" onChange={(e) => updatePending({ pkSelf: e.target.value === "" ? null : Math.max(0, Math.min(99, parseInt(e.target.value, 10) || 0)) })} className="h-6 w-5 rounded border border-emerald-300 bg-emerald-50 text-center text-[10px] font-bold text-emerald-700" title="PK（自）" />
                            <span className="text-[9px] font-black text-emerald-600">]</span>
                            <span className="text-[11px] text-[#9CA3AF]">−</span>
                            <span className="text-[9px] font-black text-emerald-600">[</span>
                            <input inputMode="numeric" value={pending.pkOpp ?? ""} placeholder="–" onChange={(e) => updatePending({ pkOpp: e.target.value === "" ? null : Math.max(0, Math.min(99, parseInt(e.target.value, 10) || 0)) })} className="h-6 w-5 rounded border border-emerald-300 bg-emerald-50 text-center text-[10px] font-bold text-emerald-700" title="PK（相）" />
                            <span className="text-[9px] font-black text-emerald-600">]</span>
                            <input inputMode="numeric" value={pending.oppScore ?? ""} placeholder="–" onChange={(e) => updatePending({ oppScore: e.target.value === "" ? null : Math.max(0, Math.min(99, parseInt(e.target.value, 10) || 0)) })} className="h-7 w-8 rounded-md border border-[#E2E4EA] bg-white text-center text-[12px] font-bold" />
                          </div>
                        ) : (
                          <div className="flex items-center justify-center gap-1">
                            <input
                              inputMode="numeric"
                              value={pending.selfScore ?? ""}
                              placeholder="–"
                              onChange={(e) => updatePending({ selfScore: e.target.value === "" ? null : Math.max(0, Math.min(99, parseInt(e.target.value, 10) || 0)) })}
                              className="h-8 w-9 rounded-md border border-dashed border-[#9CA3AF] bg-white text-center text-[14px] font-bold"
                            />
                            <span className="text-[#9CA3AF]">–</span>
                            <input
                              inputMode="numeric"
                              value={pending.oppScore ?? ""}
                              placeholder="–"
                              onChange={(e) => updatePending({ oppScore: e.target.value === "" ? null : Math.max(0, Math.min(99, parseInt(e.target.value, 10) || 0)) })}
                              className="h-8 w-9 rounded-md border border-dashed border-[#9CA3AF] bg-white text-center text-[14px] font-bold"
                            />
                          </div>
                        )}
                        {pkEligible && (
                          <button
                            type="button"
                            onClick={() => setPkOpenPending((v) => !v)}
                            className={`absolute right-0.5 top-0.5 rounded px-1 text-[8px] font-black leading-4 ${pkOpen ? "bg-emerald-500 text-white" : "bg-emerald-100 text-emerald-700"}`}
                            title="PKスコアを入力"
                          >
                            PK
                          </button>
                        )}
                      </>
                    );
                  })()}
                </td>
                <td className={`${cellBase} text-center`}>
                  <ResultBadge selfScore={pending.selfScore} oppScore={pending.oppScore} pkSelf={pending.pkSelf} pkOpp={pending.pkOpp} />
                </td>
                <td className={cellBase}>
                  <span className="px-1 text-[11px] text-[#9CA3AF]">大会と節を選ぶと記録できます</span>
                </td>
                {/* 削除（1項目でも入力されていれば×で破棄できる） */}
                <td className={`${cellBase} text-center`}>
                  {(pending.competitionId || pending.roundId || pending.opponentTeamId || pending.selfScore != null || pending.oppScore != null || pending.ha !== "H" || pending.matchDate !== "") ? (
                    <button
                      type="button"
                      onClick={() => {
                        if (!window.confirm("入力中の内容を消去しますか？")) return;
                        setPending({ matchDate: "", competitionId: "", roundId: "", opponentTeamId: "", ha: "H", selfScore: null, oppScore: null, pkSelf: null, pkOpp: null });
                        setPendingVisible(false);
                      }}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[#9CA3AF] hover:bg-red-50 hover:text-red-500"
                      aria-label="入力行をクリア"
                      title="入力内容をクリア"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  ) : (
                    <span className="text-[#D1D5DB]">—</span>
                  )}
                </td>
              </tr>
              )}

            </tbody>
          </table>
        </div>

        <p className="px-1 text-[11px] text-white/50">
          得点者はタップした選手ごとに1イベントとして登録されます。時間は空欄でも保存でき、後から入力すると同じイベントが更新されます。
        </p>
      </div>

      <MobilePickerModal picker={picker} onClose={() => setPicker(null)} />
      {/* 試合追加ボタン: 画面下部中央に常時固定表示 */}
      <div className="fixed bottom-5 left-1/2 z-40 -translate-x-1/2">
        <button
          type="button"
          onClick={() => {
            setPendingVisible(true);
            requestAnimationFrame(() => document.getElementById("sheet-pending-date")?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
          }}
          className="inline-flex items-center gap-1 rounded-full border border-dashed border-[#9CA3AF] bg-white px-5 py-2.5 text-[13px] font-semibold text-[#3355FF] shadow-lg hover:bg-[#3355FF10]"
        >
          ＋ 試合を追加
        </button>
      </div>
      {datePick && (
        <DateWheelModal
          initial={datePick.value}
          years={seasonYearsOf(selectedSeason)}
          onDone={(v) => {
            datePick.onDone(v);
            setDatePick(null);
          }}
          onClose={() => setDatePick(null)}
        />
      )}
      {scorerPick && (
        <ScorerWheelModal
          players={(() => {
            const merged = new Map<string, { v: string; label: string }>();
            for (const p of scorerCandidates) {
              merged.set(p.id, { v: p.id, label: p.number != null ? `${p.number} ${p.name}` : p.name });
            }
            for (const p of rosterPlayers) {
              if (!merged.has(p.id)) merged.set(p.id, { v: p.id, label: p.number != null ? `${p.number} ${p.name}` : p.name });
            }
            const opts = [...merged.values()];
            opts.push({ v: "__og__", label: "OG（相手）" });
            console.log("[sheet-scorer]", { season: selectedSeason, players: players.length, candidates: scorerCandidates.length, roster: rosterPlayers.length, options: opts.length - 1 });
            return opts;
          })()}
          onDone={(pid, min) => {
            void addScorer(scorerPick, pid, min);
            setScorerPick(null);
          }}
          onClose={() => setScorerPick(null)}
        />
      )}

      {/* 節・対戦相手の新規追加プロンプト */}
      {newTextPrompt && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" onClick={() => setNewTextPrompt(null)}>
          <div className="w-full max-w-sm rounded-t-2xl bg-white p-5 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 text-sm font-bold text-[#1B1F27]">{newTextPrompt.title}</div>
            <Input
              autoFocus
              value={newTextPrompt.value}
              placeholder={newTextPrompt.placeholder}
              onChange={(e) => setNewTextPrompt((p) => (p ? { ...p, value: e.target.value } : p))}
              onKeyDown={async (e) => {
                if (e.key === "Enter" && newTextPrompt) {
                  await newTextPrompt.onSubmit(newTextPrompt.value);
                  setNewTextPrompt(null);
                }
              }}
            />
            <div className="mt-4 flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setNewTextPrompt(null)}>キャンセル</Button>
              <Button
                className="flex-1 bg-[#3355FF] text-white hover:bg-[#2645E0]"
                onClick={async () => {
                  if (!newTextPrompt) return;
                  await newTextPrompt.onSubmit(newTextPrompt.value);
                  setNewTextPrompt(null);
                }}
              >
                登録
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
