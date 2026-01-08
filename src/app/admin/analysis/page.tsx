"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { AnalysisHeader } from "./components";
import { useAnalysisData } from "./hooks";
import { LoadingState, ErrorState, NoTeamState } from "./utils";
import { OverallSection } from "./components/overall-section";
import { TournamentTypeSelection } from "./components/tournament-type-selection";
import { TournamentSelection } from "./components/tournament-selection";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

export default function AnalysisPage() {
  const { user, clubProfileExists, ownerUid } = useAuth();
  const [activeView, setActiveView] = useState<"overall" | "tournament" | "headtohead">("overall");
  const [selectedTournamentType, setSelectedTournamentType] = useState("league-cup");
  const [leagueCompareMetric, setLeagueCompareMetric] = useState<
    'rank' | 'rankTrend' | 'points' | 'goalsFor' | 'goalsAgainst' | 'homeAwayWins' | 'wdl'
  >('points');
  
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

  const clubUid = ownerUid || user?.uid || null;

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
      const row = leagueRowBySeason.get(season);
      if (!row) continue;
      if (leagueCompareMetric === 'points') max = Math.max(max, row.points);
      else if (leagueCompareMetric === 'goalsFor') max = Math.max(max, row.goalsFor);
      else if (leagueCompareMetric === 'goalsAgainst') max = Math.max(max, row.goalsAgainst);
      else if (leagueCompareMetric === 'homeAwayWins') {
        const rec = seasonRecords.find((s: any) => s.season === season);
        const homeWins = typeof rec?.homeWins === 'number' ? rec.homeWins : 0;
        const awayWins = typeof rec?.awayWins === 'number' ? rec.awayWins : 0;
        max = Math.max(max, homeWins, awayWins);
      } else if (leagueCompareMetric === 'wdl') {
        max = Math.max(max, row.wins + row.draws + row.losses);
      } else if (leagueCompareMetric === 'rank' || leagueCompareMetric === 'rankTrend') {
        const rank = leagueRanksBySeason[season];
        if (typeof rank === 'number') max = Math.max(max, rank);
      }
    }
    return max;
  }, [leagueCompareMetric, leagueCompareSeasons, leagueRowBySeason, leagueRanksBySeason, seasonRecords]);

  const leagueCompareLinePoints = useMemo(() => {
    if (!(leagueCompareMetric === 'rankTrend')) return [] as Array<{ xPct: number; yPct: number; season: string; value: number }>;
    const values: Array<{ season: string; value: number }> = [];
    for (const season of leagueCompareSeasons) {
      const v = leagueRanksBySeason[season];
      if (typeof v === 'number') values.push({ season, value: v });
    }
    if (values.length <= 1) return [];
    const max = Math.max(...values.map((v) => v.value), 1);
    const min = Math.min(...values.map((v) => v.value), 1);
    const span = Math.max(1, max - min);
    return values.map((v, idx) => {
      const xPct = (idx / (values.length - 1)) * 100;
      const yPct = ((v.value - min) / span) * 100;
      return { xPct, yPct, season: v.season, value: v.value };
    });
  }, [leagueCompareMetric, leagueCompareSeasons, leagueRanksBySeason]);

  useEffect(() => {
    const fetchRanks = async () => {
      if (selectedTournamentType !== 'league') return;
      if (selectedSeason !== 'all') return;
      if (!clubUid) return;
      if (!mainTeamId) return;
      if (selectedCompetitionId === 'all') return;

      const comps = (Array.isArray(competitions) ? competitions : []).filter((c: any) => {
        if (String(c?.name || '') !== selectedCompetitionId) return false;
        const format = typeof c?.format === 'string' ? String(c.format) : '';
        return format === 'league';
      });

      const next: Record<string, number | null> = {};
      await Promise.all(
        comps.map(async (c: any) => {
          const season = typeof c?.season === 'string' ? String(c.season).trim() : '';
          if (!season) return;
          try {
            const ref = doc(db, 'clubs', clubUid, 'competitions', String(c.id), 'standings', String(mainTeamId));
            const snap = await getDoc(ref);
            const rank = snap.exists() ? (snap.data() as any)?.rank : null;
            next[season] = typeof rank === 'number' ? rank : null;
          } catch {
            next[season] = null;
          }
        })
      );

      setLeagueRanksBySeason(next);
    };

    fetchRanks();
  }, [selectedTournamentType, selectedSeason, selectedCompetitionId, clubUid, mainTeamId, competitions]);

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

                        <div className="flex items-center gap-2">
                          <select
                            value={leagueCompareMetric}
                            onChange={(e) => setLeagueCompareMetric(e.target.value as any)}
                            className="h-8 rounded-md bg-slate-900/70 border border-slate-700 text-white text-xs px-2"
                          >
                            <option value="rank">順位</option>
                            <option value="rankTrend">順位推移</option>
                            <option value="points">勝点</option>
                            <option value="goalsFor">得点</option>
                            <option value="goalsAgainst">失点</option>
                            <option value="homeAwayWins">H/A 勝利数</option>
                            <option value="wdl">勝/分/負</option>
                          </select>
                          <div className="text-slate-400 text-xs">全シーズン比較</div>
                        </div>

                        <div className="-mx-3 sm:-mx-4 px-3 sm:px-4">
                          <div className="h-36 sm:h-44 relative rounded-md border border-slate-700 bg-slate-900/30 overflow-hidden">
                            <div className="absolute inset-0 flex items-end">
                              {leagueCompareSeasons.map((season) => {
                                const row = leagueRowBySeason.get(season);
                                if (!row) return null;

                                const max = Math.max(1, leagueCompareMax);
                                const label = season;

                                if (leagueCompareMetric === 'rank') {
                                  const rank = leagueRanksBySeason[season];
                                  const value = typeof rank === 'number' ? rank : null;
                                  const heightPct = value == null ? 0 : (1 - (value - 1) / Math.max(1, max - 1)) * 100;
                                  return (
                                    <div key={season} className="flex-1 min-w-0 px-0.5 flex flex-col items-center justify-end">
                                      <div className="w-full bg-indigo-500/70" style={{ height: `${heightPct}%` }} />
                                      <div className="text-[10px] text-slate-400 truncate w-full text-center mt-1">{label}</div>
                                    </div>
                                  );
                                }

                                if (leagueCompareMetric === 'points' || leagueCompareMetric === 'goalsFor' || leagueCompareMetric === 'goalsAgainst') {
                                  const value = leagueCompareMetric === 'points' ? row.points : leagueCompareMetric === 'goalsFor' ? row.goalsFor : row.goalsAgainst;
                                  const heightPct = (value / max) * 100;
                                  const color = leagueCompareMetric === 'points' ? 'bg-emerald-500/70' : leagueCompareMetric === 'goalsFor' ? 'bg-sky-500/70' : 'bg-rose-500/70';
                                  return (
                                    <div key={season} className="flex-1 min-w-0 px-0.5 flex flex-col items-center justify-end">
                                      <div className={`w-full ${color}`} style={{ height: `${heightPct}%` }} />
                                      <div className="text-[10px] text-slate-400 truncate w-full text-center mt-1">{label}</div>
                                    </div>
                                  );
                                }

                                if (leagueCompareMetric === 'homeAwayWins') {
                                  const rec = seasonRecords.find((s: any) => s.season === season);
                                  const homeWins = typeof rec?.homeWins === 'number' ? rec.homeWins : 0;
                                  const awayWins = typeof rec?.awayWins === 'number' ? rec.awayWins : 0;
                                  const hPct = (homeWins / max) * 100;
                                  const aPct = (awayWins / max) * 100;
                                  return (
                                    <div key={season} className="flex-1 min-w-0 px-0.5 flex flex-col items-center justify-end">
                                      <div className="w-full flex items-end gap-0.5">
                                        <div className="flex-1 bg-amber-500/70" style={{ height: `${hPct}%` }} />
                                        <div className="flex-1 bg-cyan-500/70" style={{ height: `${aPct}%` }} />
                                      </div>
                                      <div className="text-[10px] text-slate-400 truncate w-full text-center mt-1">{label}</div>
                                    </div>
                                  );
                                }

                                if (leagueCompareMetric === 'wdl') {
                                  const total = Math.max(1, row.wins + row.draws + row.losses);
                                  const wPct = (row.wins / total) * 100;
                                  const dPct = (row.draws / total) * 100;
                                  const lPct = (row.losses / total) * 100;
                                  const heightPct = (total / max) * 100;
                                  return (
                                    <div key={season} className="flex-1 min-w-0 px-0.5 flex flex-col items-center justify-end">
                                      <div className="w-full" style={{ height: `${heightPct}%` }}>
                                        <div className="w-full bg-emerald-500/70" style={{ height: `${wPct}%` }} />
                                        <div className="w-full bg-yellow-500/70" style={{ height: `${dPct}%` }} />
                                        <div className="w-full bg-rose-500/70" style={{ height: `${lPct}%` }} />
                                      </div>
                                      <div className="text-[10px] text-slate-400 truncate w-full text-center mt-1">{label}</div>
                                    </div>
                                  );
                                }

                                return (
                                  <div key={season} className="flex-1 min-w-0 px-0.5 flex flex-col items-center justify-end">
                                    <div className="w-full bg-slate-700" style={{ height: `0%` }} />
                                    <div className="text-[10px] text-slate-400 truncate w-full text-center mt-1">{label}</div>
                                  </div>
                                );
                              })}
                            </div>

                            {leagueCompareMetric === 'rankTrend' && leagueCompareLinePoints.length > 1 && (
                              <svg className="absolute inset-0" viewBox="0 0 100 100" preserveAspectRatio="none">
                                <polyline
                                  fill="none"
                                  stroke="rgba(99, 102, 241, 0.9)"
                                  strokeWidth="2"
                                  points={leagueCompareLinePoints.map((p) => `${p.xPct},${p.yPct}`).join(' ')}
                                />
                              </svg>
                            )}
                          </div>
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
          </div>
        )}
      </div>
    </div>
  );
}
