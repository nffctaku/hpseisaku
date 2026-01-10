"use client";

import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { AnalysisHeader } from "./components";
import { useAnalysisData } from "./hooks";
import { LoadingState, ErrorState, NoTeamState } from "./utils";
import { OverallSection } from "./components/overall-section";
import { TournamentTypeSelection } from "./components/tournament-type-selection";
import { TournamentSelection } from "./components/tournament-selection";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";

export default function AnalysisPage() {
  const { user, clubProfileExists, ownerUid } = useAuth();
  const [activeView, setActiveView] = useState<"overall" | "tournament" | "headtohead">("overall");
  const [selectedTournamentType, setSelectedTournamentType] = useState("league-cup");
  const leagueCompareMetric: 'rank' = 'rank';
  
  const {
    matches,
    competitions,
    selectedSeason,
    setSelectedSeason,
    selectedCompetitionId,
    setSelectedCompetitionId,
    selectedCompetitionType,
    setSelectedCompetitionType,
    seasons,
    loading,
    error,
    filteredMatches,
    seasonRecords,
    mainStats,
    topGoalscorers,
    topAssists,
    mainTeamId,
  } = useAnalysisData();

  const LEAGUE_RANK_PLOT_PADDING_VB = 3.2;

  const clubUid = ownerUid || user?.uid || null;

  const [resolvedTeamId, setResolvedTeamId] = useState<string | null>(null);

  useEffect(() => {
    const resolve = async () => {
      if (!clubUid) {
        setResolvedTeamId(null);
        return;
      }
      if (!mainTeamId) {
        setResolvedTeamId(null);
        return;
      }
      try {
        const teamsSnap = await getDocs(collection(db, 'clubs', clubUid, 'teams'));
        let found: string | null = null;
        teamsSnap.forEach((d) => {
          if (found) return;
          const data = d.data() as any;
          const idMatch = d.id === String(mainTeamId);
          const fieldMatch =
            data?.teamId === mainTeamId ||
            data?.teamUid === mainTeamId ||
            data?.uid === mainTeamId ||
            data?.ownerUid === mainTeamId;
          if (idMatch || fieldMatch) found = d.id;
        });
        setResolvedTeamId(found || String(mainTeamId));
      } catch {
        setResolvedTeamId(String(mainTeamId));
      }
    };

    resolve();
  }, [clubUid, mainTeamId]);

  const leagueMatches = useMemo(() => {
    const base = Array.isArray(filteredMatches) ? filteredMatches : [];
    return base.filter((m: any) => {
      if (m?.competitionType !== 'league') return false;
      if (!m?.isCompleted) return false;
      if (!(m.result === 'win' || m.result === 'draw' || m.result === 'loss')) return false;
      return true;
    });
  }, [filteredMatches]);

  const leagueSummary = useMemo(() => {
    const completed = leagueMatches;
    const wins = completed.filter((m: any) => m.result === 'win').length;
    const draws = completed.filter((m: any) => m.result === 'draw').length;
    const losses = completed.filter((m: any) => m.result === 'loss').length;
    const matchesCount = completed.length;
    const winRate = matchesCount > 0 ? (wins / matchesCount) * 100 : 0;

    const pointsBySeason: Record<string, number> = {};
    for (const m of completed) {
      const season = typeof m?.competitionSeason === 'string' ? String(m.competitionSeason).trim() : '';
      if (!season) continue;
      if (!pointsBySeason[season]) pointsBySeason[season] = 0;
      if (m.result === 'win') pointsBySeason[season] += 3;
      else if (m.result === 'draw') pointsBySeason[season] += 1;
    }
    const seasonPoints = Object.values(pointsBySeason);
    const maxPoints = seasonPoints.length > 0 ? Math.max(...seasonPoints) : 0;
    const minPoints = seasonPoints.length > 0 ? Math.min(...seasonPoints) : 0;
    const avgPoints = seasonPoints.length > 0 ? seasonPoints.reduce((a, b) => a + b, 0) / seasonPoints.length : 0;

    return {
      matchesCount,
      wins,
      draws,
      losses,
      winRate,
      seasonCount: seasonPoints.length,
      maxPoints,
      minPoints,
      avgPoints,
    };
  }, [leagueMatches]);

  const leagueSeasonRows = useMemo(() => {
    const bySeason: Record<string, { season: string; played: number; wins: number; draws: number; losses: number; points: number; goalsFor: number; goalsAgainst: number; goalDifference: number; }> = {};
    for (const m of leagueMatches) {
      const season = typeof m?.competitionSeason === 'string' ? String(m.competitionSeason).trim() : '';
      if (!season) continue;
      if (!bySeason[season]) {
        bySeason[season] = { season, played: 0, wins: 0, draws: 0, losses: 0, points: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0 };
      }
      const row = bySeason[season];
      row.played += 1;
      if (m.result === 'win') {
        row.wins += 1;
        row.points += 3;
      } else if (m.result === 'draw') {
        row.draws += 1;
        row.points += 1;
      } else if (m.result === 'loss') {
        row.losses += 1;
      }
      row.goalsFor += typeof m.goalsFor === 'number' ? m.goalsFor : 0;
      row.goalsAgainst += typeof m.goalsAgainst === 'number' ? m.goalsAgainst : 0;
      row.goalDifference = row.goalsFor - row.goalsAgainst;
    }
    return Object.values(bySeason).sort((a, b) => b.season.localeCompare(a.season, 'ja'));
  }, [leagueMatches]);

  const [leagueRanksBySeason, setLeagueRanksBySeason] = useState<Record<string, number | null>>({});
  const [leagueTeamsBySeason, setLeagueTeamsBySeason] = useState<Record<string, number | null>>({});
  const [leagueRanksLoading, setLeagueRanksLoading] = useState(false);

  const leagueCompareSeasons = useMemo(() => {
    const list = leagueSeasonRows.map((r) => r.season);
    return list.slice().sort((a, b) => a.localeCompare(b, 'ja'));
  }, [leagueSeasonRows]);

  const leagueRowBySeason = useMemo(() => {
    const map = new Map<string, (typeof leagueSeasonRows)[number]>();
    for (const r of leagueSeasonRows) map.set(r.season, r);
    return map;
  }, [leagueSeasonRows]);

  const leagueCompareMax = useMemo(() => {
    let max = 0;
    for (const season of leagueCompareSeasons) {
      const teams = leagueTeamsBySeason[season];
      if (typeof teams === 'number') max = Math.max(max, teams);
    }
    if (max === 0) {
      for (const season of leagueCompareSeasons) {
        const r = leagueRanksBySeason[season];
        if (typeof r === 'number') max = Math.max(max, r);
      }
    }
    return max;
  }, [leagueCompareSeasons, leagueTeamsBySeason, leagueRanksBySeason]);

  const leagueCompareTicks = useMemo(() => {
    const rawMax = Math.max(0, leagueCompareMax);
    const max = rawMax > 0 ? rawMax : 1;

    // For these metrics, values are integers and should use integer ticks.
    const forceIntegerTicks = true;
    const isRankMetric = leagueCompareMetric === 'rank';

    if (isRankMetric) {
      const top = Math.max(1, Math.round(max));
      const ticks = Array.from({ length: top }, (_, i) => i + 1);
      return { step: 1, top, ticks, rawMax, isRankMetric };
    }

    const roughStep = max / 5;
    const pow = Math.pow(10, Math.floor(Math.log10(roughStep)));
    const n = roughStep / pow;
    let step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;

    if (forceIntegerTicks) {
      step = Math.max(1, Math.round(step));
    }

    let top = Math.ceil(max / step) * step;
    if (forceIntegerTicks) top = Math.max(1, Math.round(top));

    const ticks: number[] = [];
    if (!isRankMetric) {
      for (let v = 0; v <= top; v += step) {
        ticks.push(forceIntegerTicks ? Math.round(v) : v);
      }
      if (ticks[ticks.length - 1] !== top) ticks.push(top);
    }

    return { step, top, ticks, rawMax, isRankMetric };
  }, [leagueCompareMax, leagueCompareMetric]);

  const leagueRankHistory = useMemo(() => {
    const topRank = Math.max(2, leagueCompareTicks.top);
    const denom = Math.max(1, topRank - 1);
    const count = Math.max(1, leagueCompareSeasons.length);
    const minY = LEAGUE_RANK_PLOT_PADDING_VB;
    const maxY = 100 - LEAGUE_RANK_PLOT_PADDING_VB;

    const points = leagueCompareSeasons.map((season, index) => {
      const rank = leagueRanksBySeason[season];
      if (typeof rank !== 'number') return { season, index, rank: null as number | null, xPct: 0, yPct: 0 };
      const xPct = ((index + 0.5) / count) * 100;
      const ratio = (rank - 1) / denom;
      const yPct = minY + ratio * (maxY - minY);
      return { season, index, rank, xPct, yPct };
    });

    const segments: string[] = [];
    let buf: Array<{ xPct: number; yPct: number }> = [];
    for (const p of points) {
      if (p.rank == null) {
        if (buf.length >= 2) segments.push(buf.map((q) => `${q.xPct},${q.yPct}`).join(' '));
        buf = [];
        continue;
      }
      buf.push({ xPct: p.xPct, yPct: p.yPct });
    }
    if (buf.length >= 2) segments.push(buf.map((q) => `${q.xPct},${q.yPct}`).join(' '));

    return { points, segments, topRank };
  }, [leagueCompareSeasons, leagueRanksBySeason, leagueCompareTicks.top, LEAGUE_RANK_PLOT_PADDING_VB]);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;
    const hasAnyRank = leagueRankHistory.points.some((p) => typeof p.rank === 'number');
    // eslint-disable-next-line no-console
    console.log('[analysis] leagueRanksBySeason', leagueRanksBySeason);
    // eslint-disable-next-line no-console
    console.log('[analysis] leagueRankHistory.points', leagueRankHistory.points);
    // eslint-disable-next-line no-console
    console.log(
      '[analysis] leagueRankHistory.points.simple',
      leagueRankHistory.points.map((p) => ({
        season: p.season,
        rank: p.rank,
        xPct: p.xPct,
        yPct: p.yPct,
      }))
    );
    // eslint-disable-next-line no-console
    console.log('[analysis] leagueRankHistory.hasAnyRank', hasAnyRank);
    // eslint-disable-next-line no-console
    console.log('[analysis] leagueRankHistory.segments', leagueRankHistory.segments);
  }, [leagueRanksBySeason, leagueRankHistory.points, leagueRankHistory.segments]);

  useEffect(() => {
    const fetchRanks = async () => {
      if (selectedTournamentType !== 'league') return;
      if (selectedSeason !== 'all') return;
      if (!clubUid) return;
      if (!mainTeamId) return;
      const targetTeamId = resolvedTeamId || String(mainTeamId);
      if (selectedCompetitionId === 'all') return;

      setLeagueRanksLoading(true);

      const comps = (Array.isArray(competitions) ? competitions : []).filter((c: any) => {
        if (String(c?.name || '') !== selectedCompetitionId) return false;
        const formatRaw = typeof c?.format === 'string' ? String(c.format) : '';
        const typeRaw = typeof c?.type === 'string' ? String(c.type) : '';
        const normalized = formatRaw === 'league_cup' ? 'league-cup' : formatRaw;
        if (normalized === 'league') return true;
        if (typeRaw === 'league') return true;
        return false;
      });

      const next: Record<string, number | null> = {};
      const teamCounts: Record<string, number | null> = {};
      try {
        await Promise.all(
          comps.map(async (c: any) => {
            const season = typeof c?.season === 'string' ? String(c.season).trim() : '';
            if (!season) return;
            try {
              const standingsCol = collection(db, 'clubs', clubUid, 'competitions', String(c.id), 'standings');
              const standingsSnap = await getDocs(standingsCol);
              teamCounts[season] = standingsSnap.size;

              const direct = await getDoc(doc(standingsCol, String(targetTeamId)));
              let rank: unknown = direct.exists() ? (direct.data() as any)?.rank : null;

              if (typeof rank !== 'number') {
                standingsSnap.forEach((d) => {
                  if (typeof rank === 'number') return;
                  const data = d.data() as any;
                  const idMatch = d.id === String(targetTeamId) || d.id === String(mainTeamId);
                  const fieldMatch =
                    data?.teamId === targetTeamId ||
                    data?.teamUid === targetTeamId ||
                    data?.uid === targetTeamId ||
                    data?.ownerUid === targetTeamId ||
                    data?.teamId === mainTeamId ||
                    data?.teamUid === mainTeamId ||
                    data?.uid === mainTeamId ||
                    data?.ownerUid === mainTeamId;
                  if (idMatch || fieldMatch) {
                    rank = data?.rank;
                  }
                });
              }

              const normalizedRank =
                typeof rank === 'number'
                  ? rank
                  : typeof rank === 'string'
                    ? (() => {
                        const n = Number(rank);
                        return Number.isFinite(n) ? n : null;
                      })()
                    : null;

              next[season] = normalizedRank;
            } catch {
              next[season] = null;
              teamCounts[season] = null;
            }
          })
        );
      } finally {
        setLeagueRanksBySeason(next);
        setLeagueTeamsBySeason(teamCounts);
        setLeagueRanksLoading(false);
      }
    };

    fetchRanks();
  }, [selectedTournamentType, selectedSeason, selectedCompetitionId, clubUid, mainTeamId, competitions, resolvedTeamId]);

  if (!user) {
    return <div className="min-h-screen flex items-center justify-center">
      <Card className="w-96">
        <CardContent className="pt-6">
          <div className="text-center text-muted-foreground">ログインが必要です。</div>
        </CardContent>
      </Card>
    </div>;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 p-4 md:p-6">
        <div className="max-w-7xl mx-auto">
          <LoadingState />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-900 p-4 md:p-6">
        <div className="max-w-7xl mx-auto">
          <ErrorState error={error} />
        </div>
      </div>
    );
  }

  if (!clubProfileExists) {
    return (
      <div className="min-h-screen bg-slate-900 p-4 md:p-6">
        <div className="max-w-7xl mx-auto">
          <NoTeamState />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-4 md:space-y-6">
        <AnalysisHeader />
        
        <div className="relative overflow-hidden rounded-xl bg-slate-800/50 backdrop-blur-xl border border-slate-700">
          <div className="relative p-6">
            <div className="flex flex-col sm:flex-row gap-4">
              <button
                onClick={() => setActiveView("overall")}
                className={`flex-1 sm:flex-none px-6 py-3 rounded-lg font-medium transition-all duration-300 ${
                  activeView === "overall"
                    ? "bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-lg"
                    : "bg-slate-700/50 text-slate-300 hover:bg-slate-700/70 hover:text-white"
                }`}
              >
                通算
              </button>
              <button
                onClick={() => setActiveView("tournament")}
                className={`flex-1 sm:flex-none px-6 py-3 rounded-lg font-medium transition-all duration-300 ${
                  activeView === "tournament"
                    ? "bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-lg"
                    : "bg-slate-700/50 text-slate-300 hover:bg-slate-700/70 hover:text-white"
                }`}
              >
                大会別
              </button>
            </div>
          </div>
        </div>

        {activeView === "overall" && (
          <OverallSection
            matches={matches}
            filteredMatches={filteredMatches}
            seasonRecords={seasonRecords}
            mainStatsData={mainStats}
            topGoalscorers={topGoalscorers}
            topAssists={topAssists}
          />
        )}

        {activeView === "tournament" && (
          <div className="space-y-3">
            <TournamentTypeSelection
              selectedType={selectedTournamentType}
              onTypeChange={setSelectedTournamentType}
            />
            
            <TournamentSelection
              selectedTournament={selectedCompetitionId}
              onTournamentChange={setSelectedCompetitionId}
              tournaments={competitions}
              selectedTournamentType={selectedTournamentType}
              selectedSeason={selectedSeason}
              onSeasonChange={setSelectedSeason}
              seasons={seasons}
            />

            {selectedTournamentType === "league" && selectedCompetitionId !== "all" && (
              <div className="relative overflow-hidden rounded-xl bg-slate-800/50 backdrop-blur-xl border border-slate-700">
                <div className="relative pt-3 px-3 pb-2 sm:pt-4 sm:px-4 sm:pb-3">
                  <h2 className="text-base sm:text-xl font-bold text-white mb-2">{selectedSeason === 'all' ? 'リーグ戦通算成績' : 'リーグ戦 成績'}</h2>

                  <div className="space-y-2">
                    {selectedSeason === 'all' ? (
                      <div className="space-y-2">
                        <div className="-mx-3 sm:-mx-4 rounded-none border-t border-b border-slate-700 overflow-hidden">
                          <Table>
                            <TableHeader>
                              <TableRow className="border-slate-700">
                                <TableHead className="text-slate-300 px-2 py-1 text-xs sm:text-sm">シーズン</TableHead>
                                <TableHead className="text-slate-300 text-right px-2 py-1 text-xs sm:text-sm">順位</TableHead>
                                <TableHead className="text-slate-300 text-right px-2 py-1 text-xs sm:text-sm">勝点</TableHead>
                                <TableHead className="text-slate-300 text-right px-2 py-1 text-xs sm:text-sm">勝</TableHead>
                                <TableHead className="text-slate-300 text-right px-2 py-1 text-xs sm:text-sm">分</TableHead>
                                <TableHead className="text-slate-300 text-right px-2 py-1 text-xs sm:text-sm">負</TableHead>
                                <TableHead className="text-slate-300 text-right px-2 py-1 text-xs sm:text-sm">得</TableHead>
                                <TableHead className="text-slate-300 text-right px-2 py-1 text-xs sm:text-sm">失</TableHead>
                                <TableHead className="text-slate-300 text-right px-2 py-1 text-xs sm:text-sm">差</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {leagueSeasonRows.map((row) => {
                                const rank = leagueRanksBySeason[row.season];
                                return (
                                  <TableRow key={row.season} className="border-slate-700">
                                    <TableCell className="text-white font-medium px-2 py-1 text-xs sm:text-sm">{row.season}</TableCell>
                                    <TableCell className="text-white text-right px-2 py-1 text-xs sm:text-sm">{typeof rank === 'number' ? rank : '-'}</TableCell>
                                    <TableCell className="text-white text-right px-2 py-1 text-xs sm:text-sm">{row.points}</TableCell>
                                    <TableCell className="text-white text-right px-2 py-1 text-xs sm:text-sm">{row.wins}</TableCell>
                                    <TableCell className="text-white text-right px-2 py-1 text-xs sm:text-sm">{row.draws}</TableCell>
                                    <TableCell className="text-white text-right px-2 py-1 text-xs sm:text-sm">{row.losses}</TableCell>
                                    <TableCell className="text-white text-right px-2 py-1 text-xs sm:text-sm">{row.goalsFor}</TableCell>
                                    <TableCell className="text-white text-right px-2 py-1 text-xs sm:text-sm">{row.goalsAgainst}</TableCell>
                                    <TableCell className="text-white text-right px-2 py-1 text-xs sm:text-sm">{row.goalDifference}</TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-center flex-1 min-w-0">
                          <p className="text-slate-400 text-[11px] sm:text-sm mb-0.5 sm:mb-1">試合</p>
                          <p className="text-lg sm:text-2xl font-bold text-white leading-none">{leagueSummary.matchesCount}</p>
                        </div>
                        <div className="text-center flex-1 min-w-0">
                          <p className="text-green-400 text-[11px] sm:text-sm mb-0.5 sm:mb-1">勝</p>
                          <p className="text-lg sm:text-2xl font-bold text-green-400 leading-none">{leagueSummary.wins}</p>
                        </div>
                        <div className="text-center flex-1 min-w-0">
                          <p className="text-yellow-400 text-[11px] sm:text-sm mb-0.5 sm:mb-1">分</p>
                          <p className="text-lg sm:text-2xl font-bold text-yellow-400 leading-none">{leagueSummary.draws}</p>
                        </div>
                        <div className="text-center flex-1 min-w-0">
                          <p className="text-red-400 text-[11px] sm:text-sm mb-0.5 sm:mb-1">敗</p>
                          <p className="text-lg sm:text-2xl font-bold text-red-400 leading-none">{leagueSummary.losses}</p>
                        </div>
                        <div className="text-center flex-1 min-w-0">
                          <p className="text-purple-400 text-[11px] sm:text-sm mb-0.5 sm:mb-1">勝率</p>
                          <p className="text-lg sm:text-2xl font-bold text-purple-400 leading-none">{leagueSummary.winRate.toFixed(1)}%</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {selectedTournamentType === "league" && selectedCompetitionId !== "all" && selectedSeason === 'all' && (
              <div className="relative overflow-hidden rounded-xl bg-slate-800/50 backdrop-blur-xl border border-slate-700">
                <div className="relative pt-3 px-3 pb-2 sm:pt-4 sm:px-4 sm:pb-3">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="text-white text-sm font-semibold">リーグ表での順位履歴</div>
                  </div>

                  <div className="-mx-3 sm:-mx-4">
                    <div className="space-y-1">
                      <div className="h-52 sm:h-72 relative rounded-md border border-slate-700 bg-slate-900/30 overflow-hidden">
                        {leagueRanksLoading && (
                          <div className="absolute inset-0 flex items-center justify-center text-slate-400 text-sm">
                            読み込み中...
                          </div>
                        )}

                        {!leagueRanksLoading && leagueRankHistory.points.every((p) => p.rank == null) && (
                          <div className="absolute inset-0 flex items-center justify-center text-slate-400 text-sm">
                            データがありません
                          </div>
                        )}

                        <div className="absolute inset-0 flex">
                          <div className="w-10 sm:w-12 border-r border-slate-700/60 relative">
                            <div className="absolute left-0 top-0 bottom-0 w-10 sm:w-12 flex items-center justify-center pointer-events-none">
                              <div className="text-[9px] text-slate-400 -rotate-90 tracking-widest">順位</div>
                            </div>
                            {!leagueRanksLoading && (
                              <>
                                {leagueCompareTicks.ticks.map((t) => {
                                  const denom = Math.max(1, leagueCompareTicks.top - 1);
                                  const ratio = (t - 1) / denom;
                                  const yPct = LEAGUE_RANK_PLOT_PADDING_VB + ratio * (100 - 2 * LEAGUE_RANK_PLOT_PADDING_VB);
                                  return (
                                    <div
                                      key={t}
                                      className="absolute left-0 right-0 text-[9px] text-slate-400 pr-1 text-right"
                                      style={{
                                        top: `${yPct}%`,
                                        transform:
                                          t === 1
                                            ? 'translateY(0%)'
                                            : t === leagueCompareTicks.top
                                              ? 'translateY(-100%)'
                                              : 'translateY(-50%)',
                                      }}
                                    >
                                      {t}
                                    </div>
                                  );
                                })}
                              </>
                            )}
                          </div>

                          <div className="flex-1 h-full relative">
                            <div className="absolute inset-0 z-0">
                              <div className="absolute inset-x-0 top-0 h-1/2 bg-white/[0.02]" />
                              <div className="absolute inset-x-0 bottom-0 h-1/2 bg-white/[0.04]" />
                            </div>

                            {!leagueRanksLoading && !leagueRankHistory.points.every((p) => p.rank == null) && (
                              <>
                                <div className="absolute inset-0 z-0">
                                  {leagueCompareTicks.ticks.map((t) => {
                                    const denom = Math.max(1, leagueCompareTicks.top - 1);
                                    const ratio = (t - 1) / denom;
                                    const yPct = LEAGUE_RANK_PLOT_PADDING_VB + ratio * (100 - 2 * LEAGUE_RANK_PLOT_PADDING_VB);
                                    return (
                                      <div
                                        key={t}
                                        className="absolute left-0 right-0 border-t border-slate-700/25"
                                        style={{ top: `${yPct}%` }}
                                      />
                                    );
                                  })}
                                </div>

                                <div className="absolute inset-0 z-0">
                                  {leagueCompareSeasons.map((season, i) => (
                                    <div
                                      key={season}
                                      className="absolute top-0 bottom-0 border-l border-slate-700/25"
                                      style={{ left: `${((i + 0.5) / Math.max(1, leagueCompareSeasons.length)) * 100}%` }}
                                    />
                                  ))}
                                </div>

                                <svg className="absolute inset-0 z-10 pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
                                  {leagueRankHistory.segments.map((pts, idx) => (
                                    <polyline
                                      key={idx}
                                      fill="none"
                                      stroke="rgba(20, 184, 166, 0.95)"
                                      strokeWidth="2"
                                      points={pts}
                                    />
                                  ))}
                                </svg>

                                <div className="absolute inset-0 z-20 pointer-events-none">
                                  {leagueRankHistory.points
                                    .filter((p) => typeof p.rank === 'number')
                                    .map((p) => (
                                      <div
                                        key={p.season}
                                        className="absolute flex items-center justify-center font-semibold"
                                        style={{
                                          left: `${p.xPct}%`,
                                          top: `${p.yPct}%`,
                                          transform: 'translate(-50%, -50%)',
                                          width: '26px',
                                          height: '26px',
                                          borderRadius: '9999px',
                                          background: '#ffffff',
                                          border: '2px solid rgba(20, 184, 166, 0.95)',
                                          color: 'rgba(20, 184, 166, 0.95)',
                                          fontSize: '12px',
                                          lineHeight: '12px',
                                        }}
                                      >
                                        {p.rank}
                                      </div>
                                    ))}
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="h-10 sm:h-12 flex items-end">
                        <div className="w-10 sm:w-12" />
                        <div className="flex-1">
                          <div className="flex items-end w-full">
                            {leagueCompareSeasons.map((season, idx) => {
                              const isLast = idx === leagueCompareSeasons.length - 1;
                              return (
                                <div key={season} className="flex-1 min-w-0 px-0.5 text-center">
                                  <div
                                    className={
                                      isLast
                                        ? 'text-[10px] text-white bg-teal-600 rounded-full px-2 py-0.5 inline-block'
                                        : 'text-[10px] text-slate-400'
                                    }
                                  >
                                    {season}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
