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
import { TeamVsTeamLeagueSection } from "./components/team-vs-team-league-section";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getPlanTier } from "@/lib/plan-limits";

export default function AnalysisPage() {
  const { user, clubProfileExists, ownerUid } = useAuth();
  const [activeView, setActiveView] = useState<"overall" | "tournament" | "headtohead">("overall");
  const [selectedTournamentType, setSelectedTournamentType] = useState("league-cup");
  const leagueCompareMetric: 'rank' = 'rank';

  const planTier = getPlanTier(user?.plan);
  const canViewTournament = planTier === "pro" || planTier === "officia";
  
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

  const LEAGUE_RANK_PLOT_PADDING_VB = 8;

  const clubUid = ownerUid || user?.uid || null;

  const [resolvedTeamId, setResolvedTeamId] = useState<string | null>(null);

  useEffect(() => {
    if (!canViewTournament && activeView === "tournament") {
      setActiveView("overall");
    }
  }, [activeView, canViewTournament]);

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

  const [leagueRanksBySeason, setLeagueRanksBySeason] = useState<Record<string, number | null>>({});
  const [leagueTeamsBySeason, setLeagueTeamsBySeason] = useState<Record<string, number | null>>({});
  const [leagueStandingsBySeason, setLeagueStandingsBySeason] = useState<
    Record<
      string,
      {
        played: number;
        wins: number;
        draws: number;
        losses: number;
        goalsFor: number;
        goalsAgainst: number;
        goalDifference: number;
        points: number;
      } | null
    >
  >({});
  const [leagueRanksLoading, setLeagueRanksLoading] = useState(false);

  const leagueSeasonRows = useMemo(() => {
    const bySeason: Record<
      string,
      {
        season: string;
        played: number;
        wins: number;
        draws: number;
        losses: number;
        points: number;
        goalsFor: number;
        goalsAgainst: number;
        goalDifference: number;
      }
    > = {};
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

    // When comparing across all seasons, include seasons that have standings/rank even if there are no matches.
    if (selectedSeason === 'all') {
      for (const season of Object.keys(leagueRanksBySeason || {})) {
        const s = typeof season === 'string' ? season.trim() : '';
        if (!s) continue;
        if (!bySeason[s]) {
          bySeason[s] = { season: s, played: 0, wins: 0, draws: 0, losses: 0, points: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0 };
        }
      }
    }

    return Object.values(bySeason).sort((a, b) => b.season.localeCompare(a.season, 'ja'));
  }, [leagueMatches, leagueRanksBySeason, selectedSeason]);

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

  const leagueGoalsBar = useMemo(() => {
    const values = leagueCompareSeasons.map((season) => {
      const standings = leagueStandingsBySeason[season];
      const byMatch = leagueRowBySeason.get(season);
      const goalsFor = standings ? standings.goalsFor : byMatch ? byMatch.goalsFor : 0;
      const goalsAgainst = standings ? standings.goalsAgainst : byMatch ? byMatch.goalsAgainst : 0;
      return { season, goalsFor, goalsAgainst };
    });
    const max = values.reduce((acc, v) => Math.max(acc, v.goalsFor, v.goalsAgainst), 0);
    return { values, max };
  }, [leagueCompareSeasons, leagueStandingsBySeason, leagueRowBySeason]);

  const leagueGoalsForTicks = useMemo(() => {
    const rawMax = Math.max(0, leagueGoalsBar.max);
    const max = rawMax > 0 ? rawMax : 1;
    const roughStep = max / 4;
    const pow = Math.pow(10, Math.floor(Math.log10(roughStep)));
    const n = roughStep / pow;
    const step = Math.max(1, Math.round((n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow));
    const top = Math.max(1, Math.ceil(max / step) * step);
    const ticks: number[] = [];
    for (let v = 0; v <= top; v += step) ticks.push(v);
    if (ticks[ticks.length - 1] !== top) ticks.push(top);
    return { top, step, ticks, rawMax };
  }, [leagueGoalsBar.max]);

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

      const selectedName = typeof selectedCompetitionId === 'string' ? selectedCompetitionId.trim() : '';
      const comps = (Array.isArray(competitions) ? competitions : []).filter((c: any) => {
        const nameKey = typeof c?.name === 'string' ? c.name.trim() : '';
        const matchesSelection = selectedName.length > 0 && selectedName !== 'all' && selectedName === nameKey;
        if (!matchesSelection) return false;
        const formatRaw = typeof c?.format === 'string' ? String(c.format) : '';
        const typeRaw = typeof c?.type === 'string' ? String(c.type) : '';
        const normalized = formatRaw === 'league_cup' ? 'league-cup' : formatRaw;
        if (normalized === 'league') return true;
        if (normalized === 'league-cup') return true;
        if (typeRaw === 'league') return true;
        return false;
      });

      if (process.env.NODE_ENV === 'development') {
        // eslint-disable-next-line no-console
        console.log(
          '[analysis] fetchRanks comps',
          comps
            .map((c: any) => ({ id: String(c?.id), season: String(c?.season || ''), format: String(c?.format || ''), name: String(c?.name || '') }))
            .sort((a, b) => a.season.localeCompare(b.season))
        );
      }

      const next: Record<string, number | null> = {};
      const teamCounts: Record<string, number | null> = {};
      const standingsBySeason: Record<
        string,
        {
          played: number;
          wins: number;
          draws: number;
          losses: number;
          goalsFor: number;
          goalsAgainst: number;
          goalDifference: number;
          points: number;
        } | null
      > = {};
      try {
        await Promise.all(
          comps.map(async (c: any) => {
            const season = typeof c?.season === 'string' ? String(c.season).trim() : '';
            if (!season) return;
            try {
              const standingsCol = collection(db, 'clubs', clubUid, 'competitions', String(c.id), 'standings');
              const standingsSnap = await getDocs(standingsCol);
              teamCounts[season] = standingsSnap.size;

              if (process.env.NODE_ENV === 'development') {
                // eslint-disable-next-line no-console
                console.log('[analysis] standings debug', {
                  season,
                  competitionId: String(c.id),
                  standingsSize: standingsSnap.size,
                });
              }

              const candidateIds = Array.from(
                new Set([String(targetTeamId), String(mainTeamId), String(clubUid)].filter((v) => v && v.length > 0))
              );

              const candidates: Array<{ id: string; data: any }> = [];

              for (const candidateId of candidateIds) {
                const direct = await getDoc(doc(standingsCol, candidateId));
                if (direct.exists()) {
                  candidates.push({ id: direct.id, data: direct.data() as any });
                }
              }

              // Also scan the collection in case the team's identifier is stored in a field.
              standingsSnap.forEach((d) => {
                const data = d.data() as any;
                const idMatch = candidateIds.includes(d.id);
                const fieldMatch =
                  candidateIds.includes(String(data?.teamId || '')) ||
                  candidateIds.includes(String(data?.teamUid || '')) ||
                  candidateIds.includes(String(data?.uid || '')) ||
                  candidateIds.includes(String(data?.ownerUid || ''));

                if (idMatch || fieldMatch) {
                  candidates.push({ id: d.id, data });
                }
              });

              const scoreStanding = (data: any): number => {
                if (!data) return 0;
                let score = 0;
                const hasNumber = (v: any) => typeof v === 'number' && Number.isFinite(v);

                if (hasNumber(data.points)) score += 10;
                if (hasNumber(data.wins) || hasNumber(data.draws) || hasNumber(data.losses)) score += 6;
                if (hasNumber(data.goalsFor) || hasNumber(data.goalsAgainst)) score += 4;
                if (hasNumber(data.played)) score += 2;
                if (hasNumber(data.rank)) score += 1;

                // Prefer documents that actually have non-zero match stats (likely manually saved standings)
                const sum =
                  (hasNumber(data.points) ? data.points : 0) +
                  (hasNumber(data.wins) ? data.wins : 0) +
                  (hasNumber(data.draws) ? data.draws : 0) +
                  (hasNumber(data.losses) ? data.losses : 0) +
                  (hasNumber(data.goalsFor) ? data.goalsFor : 0) +
                  (hasNumber(data.goalsAgainst) ? data.goalsAgainst : 0);
                if (sum > 0) score += 100;

                return score;
              };

              // Pick the best candidate.
              candidates.sort((a, b) => scoreStanding(b.data) - scoreStanding(a.data));
              const picked = candidates.length > 0 ? candidates[0] : null;
              const pickedData: any = picked ? picked.data : null;
              const rank: unknown = pickedData?.rank ?? null;

              if (pickedData) {
                const wins = typeof pickedData?.wins === 'number' ? pickedData.wins : 0;
                const draws = typeof pickedData?.draws === 'number' ? pickedData.draws : 0;
                const losses = typeof pickedData?.losses === 'number' ? pickedData.losses : 0;
                const goalsFor = typeof pickedData?.goalsFor === 'number' ? pickedData.goalsFor : 0;
                const goalsAgainst = typeof pickedData?.goalsAgainst === 'number' ? pickedData.goalsAgainst : 0;

                const played =
                  typeof pickedData?.played === 'number'
                    ? pickedData.played
                    : wins + draws + losses;
                const points =
                  typeof pickedData?.points === 'number'
                    ? pickedData.points
                    : wins * 3 + draws;
                const goalDifference =
                  typeof pickedData?.goalDifference === 'number'
                    ? pickedData.goalDifference
                    : goalsFor - goalsAgainst;

                const prev = standingsBySeason[season];
                if (!prev) {
                  standingsBySeason[season] = {
                    played,
                    wins,
                    draws,
                    losses,
                    goalsFor,
                    goalsAgainst,
                    goalDifference,
                    points,
                  };
                }
              }

              if (process.env.NODE_ENV === 'development') {
                const topCandidates = candidates.slice(0, 5).map((c) => {
                  const d = c.data as any;
                  return {
                    id: c.id,
                    score: scoreStanding(d),
                    rank: d?.rank,
                    points: d?.points,
                    wins: d?.wins,
                    draws: d?.draws,
                    losses: d?.losses,
                    goalsFor: d?.goalsFor,
                    goalsAgainst: d?.goalsAgainst,
                    played: d?.played,
                    teamId: d?.teamId,
                    teamUid: d?.teamUid,
                    uid: d?.uid,
                    ownerUid: d?.ownerUid,
                    teamName: d?.teamName,
                  };
                });
                // eslint-disable-next-line no-console
                console.log('[analysis] standings picked', {
                  season,
                  competitionId: String(c.id),
                  candidateIds,
                  candidateCount: candidates.length,
                  pickedId: picked?.id || null,
                  pickedSummary: pickedData
                    ? {
                        rank: pickedData?.rank,
                        points: pickedData?.points,
                        wins: pickedData?.wins,
                        draws: pickedData?.draws,
                        losses: pickedData?.losses,
                        goalsFor: pickedData?.goalsFor,
                        goalsAgainst: pickedData?.goalsAgainst,
                        played: pickedData?.played,
                      }
                    : null,
                  topCandidates,
                });
              }

              if (process.env.NODE_ENV === 'development' && (rank == null || rank === '')) {
                const sampleDocs = standingsSnap.docs.slice(0, 8).map((d) => {
                  const data = d.data() as any;
                  return {
                    id: d.id,
                    rank: data?.rank,
                    teamId: data?.teamId,
                    teamUid: data?.teamUid,
                    uid: data?.uid,
                    ownerUid: data?.ownerUid,
                    teamName: data?.teamName,
                  };
                });
                // eslint-disable-next-line no-console
                console.log('[analysis] standings rank not resolved', {
                  season,
                  competitionId: String(c.id),
                  candidateIds,
                  sampleDocs,
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

              const prevRank = next[season];
              if (typeof prevRank === 'number') {
                if (typeof normalizedRank === 'number') {
                  next[season] = Math.min(prevRank, normalizedRank);
                } else {
                  // Keep previously resolved rank for the same season.
                }
              } else {
                next[season] = normalizedRank;
              }

              const prevCount = teamCounts[season];
              if (typeof prevCount === 'number') {
                if (typeof teamCounts[season] === 'number') {
                  teamCounts[season] = Math.max(prevCount, teamCounts[season] as number);
                }
              }
            } catch {
              const prevRank = next[season];
              if (typeof prevRank !== 'number') {
                next[season] = null;
              }
              const prevCount = teamCounts[season];
              if (typeof prevCount !== 'number') {
                teamCounts[season] = null;
              }
              if (!(season in standingsBySeason)) {
                standingsBySeason[season] = null;
              }
            }
          })
        );
      } finally {
        setLeagueRanksBySeason(next);
        setLeagueTeamsBySeason(teamCounts);
        setLeagueStandingsBySeason(standingsBySeason);
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
              {canViewTournament ? (
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
              ) : null}
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
                                const standings = leagueStandingsBySeason[row.season];
                                const points = standings ? standings.points : row.points;
                                const wins = standings ? standings.wins : row.wins;
                                const draws = standings ? standings.draws : row.draws;
                                const losses = standings ? standings.losses : row.losses;
                                const goalsFor = standings ? standings.goalsFor : row.goalsFor;
                                const goalsAgainst = standings ? standings.goalsAgainst : row.goalsAgainst;
                                const goalDifference = standings ? standings.goalDifference : row.goalDifference;
                                return (
                                  <TableRow key={row.season} className="border-slate-700">
                                    <TableCell className="text-white font-medium px-2 py-1 text-xs sm:text-sm">{row.season}</TableCell>
                                    <TableCell className="text-white text-right px-2 py-1 text-xs sm:text-sm">{typeof rank === 'number' ? rank : '-'}</TableCell>
                                    <TableCell className="text-white text-right px-2 py-1 text-xs sm:text-sm">{points}</TableCell>
                                    <TableCell className="text-white text-right px-2 py-1 text-xs sm:text-sm">{wins}</TableCell>
                                    <TableCell className="text-white text-right px-2 py-1 text-xs sm:text-sm">{draws}</TableCell>
                                    <TableCell className="text-white text-right px-2 py-1 text-xs sm:text-sm">{losses}</TableCell>
                                    <TableCell className="text-white text-right px-2 py-1 text-xs sm:text-sm">{goalsFor}</TableCell>
                                    <TableCell className="text-white text-right px-2 py-1 text-xs sm:text-sm">{goalsAgainst}</TableCell>
                                    <TableCell className="text-white text-right px-2 py-1 text-xs sm:text-sm">{goalDifference}</TableCell>
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

                      <div className="mt-4">
                        <div className="flex items-center justify-between mb-2">
                          <div className="text-white text-sm font-semibold">得点 / 失点</div>
                          <div className="text-[11px] text-slate-400">シーズン別</div>
                        </div>

                        <div className="rounded-md border border-slate-700 bg-slate-900/20 overflow-hidden">
                          <div className="h-28 sm:h-36 relative">
                            <div className="absolute inset-0 flex">
                              <div className="w-10 sm:w-12 border-r border-slate-700/60 relative">
                                <div className="absolute left-0 top-0 bottom-0 w-10 sm:w-12 flex items-center justify-center pointer-events-none">
                                  <div className="text-[9px] text-slate-400 -rotate-90 tracking-widest">得点/失点</div>
                                </div>

                                {leagueGoalsForTicks.ticks.map((t) => {
                                  const ratio = leagueGoalsForTicks.top > 0 ? t / leagueGoalsForTicks.top : 0;
                                  const yPct = 100 - ratio * 100;
                                  return (
                                    <div
                                      key={t}
                                      className="absolute left-0 right-0 text-[9px] text-slate-400 pr-1 text-right"
                                      style={{
                                        top: `${yPct}%`,
                                        transform: t === 0 ? 'translateY(0%)' : t === leagueGoalsForTicks.top ? 'translateY(-100%)' : 'translateY(-50%)',
                                      }}
                                    >
                                      {t}
                                    </div>
                                  );
                                })}
                              </div>

                              <div className="flex-1 h-full relative">
                                <div className="absolute inset-0 z-0">
                                  {leagueGoalsForTicks.ticks.map((t) => {
                                    const ratio = leagueGoalsForTicks.top > 0 ? t / leagueGoalsForTicks.top : 0;
                                    const yPct = 100 - ratio * 100;
                                    return (
                                      <div
                                        key={t}
                                        className="absolute left-0 right-0 border-t border-slate-700/25"
                                        style={{ top: `${yPct}%` }}
                                      />
                                    );
                                  })}
                                </div>

                                <div className="absolute inset-0 z-10 flex items-end gap-2 px-3 pb-2">
                                  {leagueGoalsBar.values.map((v) => {
                                    const ratioFor = leagueGoalsForTicks.top > 0 ? v.goalsFor / leagueGoalsForTicks.top : 0;
                                    const ratioAgainst = leagueGoalsForTicks.top > 0 ? v.goalsAgainst / leagueGoalsForTicks.top : 0;
                                    const hPctFor = Math.max(0, Math.min(100, ratioFor * 100));
                                    const hPctAgainst = Math.max(0, Math.min(100, ratioAgainst * 100));
                                    return (
                                      <div key={v.season} className="flex-1 min-w-0 h-full flex flex-col items-center justify-end gap-1">
                                        <div className="w-full flex-1 flex items-end justify-center">
                                          <div className="flex items-end gap-0.5 h-full">
                                            <div
                                              className="w-4 sm:w-5 bg-gradient-to-t from-teal-600/90 to-teal-300/90 shadow-[0_0_0_1px_rgba(45,212,191,0.25)]"
                                              style={{ height: `${Math.max(2, hPctFor)}%` }}
                                            />
                                            <div
                                              className="w-4 sm:w-5 bg-gradient-to-t from-red-600/90 to-red-300/90 shadow-[0_0_0_1px_rgba(248,113,113,0.25)]"
                                              style={{ height: `${Math.max(2, hPctAgainst)}%` }}
                                            />
                                          </div>
                                        </div>
                                        <div className="text-[10px] text-slate-300 tabular-nums">{v.goalsFor}/{v.goalsAgainst}</div>
                                      </div>
                                    );
                                  })}
                                </div>
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
                </div>
              </div>
            )}

            {selectedTournamentType === "league" && selectedCompetitionId !== "all" && selectedSeason === 'all' && (
              <TeamVsTeamLeagueSection
                clubUid={clubUid || ''}
                teamId={resolvedTeamId || (mainTeamId ? String(mainTeamId) : '')}
                matches={filteredMatches as any}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
