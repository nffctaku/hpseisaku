"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { useCareer } from "@/contexts/CareerContext";
import { db } from "@/lib/firebase";
import { doc, getDoc, getDocs, query, collection, where } from "firebase/firestore";
import { CalendarDays, FilePenLine, Loader2, Plus, X } from "lucide-react";
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
  moveMatchToRound,
  updateMatchEventFields,
  updateSheetMatch,
} from "@/lib/match-sheet";
import { toSlashSeason } from "@/lib/season";

type HAPref = "H" | "A";

interface PendingRow {
  matchDate: string;
  competitionId: string;
  roundId: string;
  opponentTeamId: string;
  ha: HAPref;
  selfScore: number | null;
  oppScore: number | null;
}

const NEW_VALUE = "__new__";

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// 自チーム視点の得点イベントを抽出（type:'goal'自チーム or type:'og'相手チーム）
// 日付セル: シーズンの年のみ選択可能な年・月・日プルダウン（matchDateは "YYYY-MM-DD" 文字列）
const pad2 = (n: number) => String(n).padStart(2, "0");
const daysInMonth = (y: number, m: number) => new Date(y, m, 0).getDate();

const seasonYearsOf = (season: string): number[] => {
  const m = season.match(/^(\d{4})(?:\/(\d{2,4}))?$/);
  if (!m) return [];
  const y1 = Number(m[1]);
  const y2 = m[2] ? (Number(m[2]) < 100 ? 2000 + Number(m[2]) : Number(m[2])) : y1;
  return y2 === y1 ? [y1] : [y1, y2];
};

const dateSelCls = "h-8 rounded-md border border-[#E2E4EA] bg-white px-1 text-[12px] font-semibold text-[#1B1F27]";

const DateSelect = ({ value, years, onChange }: { value: string; years: number[]; onChange: (v: string) => void }) => {
  const [py, pm, pd] = (value || "").split("-").map(Number);
  const yearOptions = [...new Set([...(py ? [py] : []), ...years])].sort((a, b) => a - b);
  const maxDay = py && pm ? daysInMonth(py, pm) : 31;
  const commit = (ny: number, nm: number, nd: number) => {
    if (!ny || !nm || !nd) return;
    onChange(`${ny}-${pad2(nm)}-${pad2(Math.min(nd, daysInMonth(ny, nm)))}`);
  };
  return (
    <div className="flex items-center gap-0.5">
      <select value={py || ""} onChange={(e) => commit(Number(e.target.value), pm || 1, pd || 1)} className={`${dateSelCls} w-[68px]`} aria-label="年">
        {!py && <option value="" disabled>年</option>}
        {yearOptions.map((yy) => <option key={yy} value={yy}>{yy}</option>)}
      </select>
      <select value={pm || ""} onChange={(e) => commit(py || years[0] || new Date().getFullYear(), Number(e.target.value), pd || 1)} className={`${dateSelCls} w-[52px]`} aria-label="月">
        {!pm && <option value="" disabled>月</option>}
        {Array.from({ length: 12 }, (_, i) => i + 1).map((mm) => <option key={mm} value={mm}>{mm}</option>)}
      </select>
      <select value={pd || ""} onChange={(e) => commit(py || years[0] || new Date().getFullYear(), pm || 1, Number(e.target.value))} className={`${dateSelCls} w-[52px]`} aria-label="日">
        {!pd && <option value="" disabled>日</option>}
        {Array.from({ length: maxDay }, (_, i) => i + 1).map((dd) => <option key={dd} value={dd}>{dd}</option>)}
      </select>
    </div>
  );
};

// スコア（自チーム視点）から勝敗バッジを生成。W=勝利(緑)/L=敗北(赤)/D=引分(灰)
const ResultBadge = ({ selfScore, oppScore }: { selfScore: number | null; oppScore: number | null }) => {
  if (selfScore === null || oppScore === null) return <span className="text-[#9CA3AF]">–</span>;
  const r = selfScore > oppScore ? "W" : selfScore < oppScore ? "L" : "D";
  const cls = r === "W" ? "bg-emerald-500 text-white" : r === "L" ? "bg-red-500 text-white" : "bg-gray-400 text-white";
  return <span className={`inline-flex h-6 w-6 items-center justify-center rounded-md text-[11px] font-black ${cls}`}>{r}</span>;
};

const isOwnGoalEvent = (ev: MatchEvent, ownTeamId: string): boolean => {
  if (ev.type === "goal" && ev.teamId === ownTeamId) return true;
  if (String(ev.type) === "og" && ev.teamId !== ownTeamId) return true; // 相手のOG=自チームの得点
  return false;
};

const goalEventLabel = (ev: MatchEvent): string => {
  if (String(ev.type) === "og" || ev.goalKind === "own_goal") {
    const name = (ev.playerName || "").replace(/^OG\(|\)$/g, "").trim();
    return name && name !== "OG" ? `OG(${name})` : "OG";
  }
  return ev.playerName || "不明";
};

export default function MatchSheetPage() {
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
    matchDate: todayStr(),
    competitionId: "",
    roundId: "",
    opponentTeamId: "",
    ha: "H",
    selfScore: null,
    oppScore: null,
  });
  const [picker, setPicker] = useState<PickerRequest | null>(null);
  const [newTextPrompt, setNewTextPrompt] = useState<{
    title: string;
    placeholder: string;
    value: string;
    onSubmit: (text: string) => Promise<void>;
  } | null>(null);
  const [savingKeys, setSavingKeys] = useState<Set<string>>(new Set());

  const teamsMap = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);
  const competitionsMap = useMemo(() => new Map(competitions.map((c) => [c.id, c])), [competitions]);

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

      // 自チーム選手（得点者候補）
      if (main) {
        const ps = await getDocs(collection(db, `clubs/${clubUid}/teams/${main}/players`));
        setPlayers(ps.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as SheetPlayer)).sort((a, b) => (a.number ?? 999) - (b.number ?? 999)));
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
      allRows.sort((a, b) => (a.matchDate || "9999").localeCompare(b.matchDate || "9999"));
      setRows(allRows);

      const seasons = [...new Set(comps.map((c) => (c.season || "").trim()).filter(Boolean))].map(toSlashSeason).sort().reverse();
      setSelectedSeason((prev) => prev || seasons[0] || "");
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
    const ownTeamId = ha === "A" ? row.awayTeam : ha === "H" ? row.homeTeam : own || row.homeTeam;
    return { ha, opponentId, selfScore, oppScore, ownTeamId };
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

  // === 得点者セル ===
  const ownGoals = (row: SheetMatchRow): MatchEvent[] => {
    const { ownTeamId } = describe(row);
    return (row.events || []).filter((e) => ownTeamId && isOwnGoalEvent(e, ownTeamId));
  };

  const addScorer = async (row: SheetMatchRow, playerId: string) => {
    if (!clubUid) return;
    const { ownTeamId, opponentId } = describe(row);
    const path = matchDocPath(clubUid, row.competitionId, row.roundId, row.matchId);
    markSaving(row.key, true);
    try {
      if (playerId === "__og__") {
        await appendMatchEvent(db, path, {
          id: crypto.randomUUID(),
          type: "goal",
          minute: "",
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
          minute: "",
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

  const updateScorerMinute = async (row: SheetMatchRow, eventId: string, minute: string) => {
    if (!clubUid) return;
    const path = matchDocPath(clubUid, row.competitionId, row.roundId, row.matchId);
    try {
      await updateMatchEventFields(db, path, eventId, minute.trim() === "" ? { minute: undefined } : { minute: minute.trim() });
      setRows((prev) => prev.map((r) => r.key === row.key
        ? { ...r, events: (r.events || []).map((e) => e.id === eventId ? { ...e, minute: minute.trim() === "" ? undefined : minute.trim() } as MatchEvent : e) }
        : r));
    } catch (e) {
      console.error(e);
      toast.error("時間の更新に失敗しました。");
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
      }, teamsMap);
      toast.success("試合カードを作成しました。");
      setPending({ matchDate: todayStr(), competitionId: "", roundId: "", opponentTeamId: "", ha: "H", selfScore: null, oppScore: null });
      await loadAll();
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
  const openCompetitionPicker = (current: string, onPick: (id: string) => void) => {
    setPicker({
      title: "大会を選択",
      value: current,
      options: competitions.map((c) => ({ value: c.id, label: c.name })),
      onSelect: onPick,
    });
  };

  const openRoundPicker = (compId: string, current: string, onPick: (id: string) => void) => {
    const rounds = roundsByComp.get(compId) || [];
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
  const visibleRows = selectedSeason
    ? rows.filter((r) => {
        const comp = competitionsMap.get(r.competitionId);
        return !comp?.season || toSlashSeason(comp.season) === selectedSeason;
      })
    : rows;

  const cellBase = "border-r border-[#E2E4EA] px-1.5 py-1 align-middle";
  const selBtn = "w-full min-w-[92px] h-8 rounded-md border border-[#E2E4EA] bg-white px-2 text-left text-[12px] text-[#1B1F27] truncate";

  return (
    <div className="w-full py-6 px-2 sm:px-4">
      <div className="mx-auto w-full max-w-[1200px] space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 px-1">
          <div>
            <h1 className="text-[18px] font-bold text-white">試合記録シート（公式戦）</h1>
            <p className="mt-0.5 text-[12px] text-white/60">セルをタップして編集・自動保存。詳細入力は右端「詳細」から。</p>
          </div>
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
        </div>

        <div className="overflow-x-auto rounded-[10px] border border-[#E2E4EA] bg-white">
          <table className="w-full min-w-[980px] border-collapse text-[12px]">
            <thead>
              <tr className="border-b border-[#E2E4EA] bg-[#F8F9FB] text-left text-[11px] font-semibold text-[#6B7280]">
                <th className={`${cellBase} w-[108px]`}>日付</th>
                <th className={`${cellBase} w-[130px]`}>大会名</th>
                <th className={`${cellBase} w-[110px]`}>節・ラウンド</th>
                <th className={`${cellBase} w-[140px]`}>対戦相手</th>
                <th className={`${cellBase} w-[56px] text-center`}>H/A</th>
                <th className={`${cellBase} w-[110px] text-center`}>スコア</th>
                <th className={`${cellBase} w-[44px] text-center`}>勝敗</th>
                <th className={`${cellBase} min-w-[220px]`}>得点者・時間</th>
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
                    {/* 日付（選択シーズンの年のみ・年/月/日プルダウン） */}
                    <td className={cellBase}>
                      <DateSelect
                        value={row.matchDate}
                        years={seasonYearsOf(selectedSeason)}
                        onChange={(v) => void saveField(row, { matchDate: v })}
                      />
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
                    {/* スコア（自–相・nullは空欄表示） */}
                    <td className={`${cellBase} text-center`}>
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
                    </td>
                    {/* 勝敗（スコア×H/Aから自動算出・編集不可） */}
                    <td className={`${cellBase} text-center`}>
                      <ResultBadge selfScore={d.selfScore} oppScore={d.oppScore} />
                    </td>
                    {/* 得点者・時間 */}
                    <td className={cellBase}>
                      {d.ownTeamId && (
                        <span className="mb-0.5 block text-[10px] leading-tight text-[#9AA0AE]">得点時間（任意）</span>
                      )}
                      <div className="flex flex-wrap items-center gap-1">
                        {goals.map((ev) => (
                          <span key={ev.id} className="inline-flex items-center gap-1 rounded-full bg-[#3355FF12] px-2 py-1">
                            <span className="text-[11px] font-semibold text-[#1B1F27]">{goalEventLabel(ev)}</span>
                            <input
                              inputMode="numeric"
                              defaultValue={formatMinute(ev.minute)}
                              placeholder="例：23、45+2"
                              title="得点時間（任意）"
                              aria-label="得点時間（任意）"
                              onBlur={(e) => {
                                const v = e.target.value;
                                if (v !== formatMinute(ev.minute)) void updateScorerMinute(row, ev.id, v);
                              }}
                              className="h-6 w-[76px] rounded border border-[#E2E4EA] bg-white text-center text-[11px] font-semibold text-[#1B1F27] placeholder:font-normal placeholder:text-[#9AA0AE]"
                            />
                            <button type="button" onClick={() => void removeScorer(row, ev.id)} className="text-[#9CA3AF] hover:text-red-500" aria-label="削除">
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        ))}
                        <button
                          type="button"
                          disabled={!d.ownTeamId}
                          onClick={() => {
                            setPicker({
                              title: "得点者を追加",
                              value: "",
                              options: [
                                ...players.map((p) => ({ value: p.id, label: p.name })),
                                { value: "__og__", label: "OG（相手）" },
                              ],
                              onSelect: (v) => void addScorer(row, v),
                            });
                          }}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-dashed border-[#9CA3AF] text-[#6B7280] hover:text-[#3355FF] disabled:opacity-40"
                          aria-label="得点者を追加"
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                    {/* 詳細 */}
                    <td className={`${cellBase} text-center`}>
                      <Link
                        href={`/admin/competitions/${row.competitionId}/rounds/${row.roundId}/matches/${row.matchId}`}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[#6B7280] hover:bg-[#3355FF12] hover:text-[#3355FF]"
                        aria-label="詳細を開く"
                      >
                        <FilePenLine className="h-4 w-4" />
                      </Link>
                      {saving && <Loader2 className="ml-1 inline h-3 w-3 animate-spin text-[#9CA3AF]" />}
                    </td>
                  </tr>
                );
              })}

              {/* 新規行（pending） */}
              <tr className="bg-[#F8F9FB]/70">
                <td className={cellBase}>
                  <DateSelect
                    value={pending.matchDate}
                    years={seasonYearsOf(selectedSeason)}
                    onChange={(v) => updatePending({ matchDate: v })}
                  />
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
                <td className={`${cellBase} text-center`}>
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
                </td>
                <td className={`${cellBase} text-center`}>
                  <ResultBadge selfScore={pending.selfScore} oppScore={pending.oppScore} />
                </td>
                <td className={cellBase}>
                  <span className="px-1 text-[11px] text-[#9CA3AF]">大会と節を選ぶと記録できます</span>
                </td>
                <td className={`${cellBase} text-center`}>
                  <span className="text-[#D1D5DB]">—</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <p className="px-1 text-[11px] text-white/50">
          得点者はタップした選手ごとに1イベントとして登録されます。時間は空欄でも保存でき、後から入力すると同じイベントが更新されます。
        </p>
      </div>

      <MobilePickerModal picker={picker} onClose={() => setPicker(null)} />

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
