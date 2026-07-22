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
import { MainStats } from "./components/main-stats";
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
    playerStatsList,
  } = useAnalysisData();

  const LEAGUE_RANK_PLOT_PADDING_VB = 8;

  const clubUid = ownerUid || user?.uid || null;

  const [resolvedTeamId, setResolvedTeamId] = useState<string | null>(null);
  const [teamLogoById, setTeamLogoById] = useState<Record<string, string>>({});
  const [seasonRankingTrendMode, setSeasonRankingTrendMode] = useState<'recent' | 'all'>('recent');
  const [mainStatsView, setMainStatsView] = useState<'main' | 'player'>('main');
  const [sortColumn, setSortColumn] = useState<string>('matches');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('desc');
    }
  };

  const sortedPlayerStatsList = useMemo(() => {
    return [...playerStatsList].sort((a, b) => {
      let comparison = 0;
      const getValue = (player: any) => {
        switch (sortColumn) {
          case 'position': return player.position || '';
          case 'name': return player.playerName;
          case 'matches': return player.matches;
          case 'starts': return player.starts;
          case 'substitutions': return player.substitutions;
          case 'goals': return player.goals;
          case 'assists': return player.assists;
          case 'rating': return player.rating || 0;
          default: return 0;
        }
      };
      const aValue = getValue(a);
      const bValue = getValue(b);
      
      if (sortColumn === 'position') {
        const positionOrder: { [key: string]: number } = {
          'GK': 1,
          'DF': 2,
          'MF': 3,
          'FW': 4,
          '': 5,
        };
        const aOrder = positionOrder[aValue] || 99;
        const bOrder = positionOrder[bValue] || 99;
        comparison = aOrder - bOrder;
      } else if (typeof aValue === 'string' && typeof bValue === 'string') {
        comparison = aValue.localeCompare(bValue);
      } else {
        comparison = aValue - bValue;
      }
      
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [playerStatsList, sortColumn, sortDirection]);

  useEffect(() => {
    if (!clubUid) {
      setTeamLogoById({});
      return;
    }

    const fetchTeamLogos = async () => {
      try {
        const teamsSnap = await getDocs(collection(db, 'clubs', clubUid, 'teams'));
        const logoMap: Record<string, string> = {};
        teamsSnap.forEach((d) => {
          const data = d.data() as any;
          const logoUrl = typeof data?.logoUrl === 'string' ? data.logoUrl : typeof data?.logo === 'string' ? data.logo : '';
          if (logoUrl) logoMap[d.id] = logoUrl;
        });
        setTeamLogoById(logoMap);
      } catch {
        setTeamLogoById({});
      }
    };

    fetchTeamLogos();
  }, [clubUid]);

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
    const goalsFor = completed.reduce((sum: number, m: any) => sum + (typeof m.goalsFor === 'number' ? m.goalsFor : 0), 0);
    const goalsAgainst = completed.reduce((sum: number, m: any) => sum + (typeof m.goalsAgainst === 'number' ? m.goalsAgainst : 0), 0);
    const goalDifference = goalsFor - goalsAgainst;

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
      goalsFor,
      goalsAgainst,
      goalDifference,
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
      } else {
        row.losses += 1;
      }
      row.goalsFor += typeof m.goalsFor === 'number' ? m.goalsFor : 0;
      row.goalsAgainst += typeof m.goalsAgainst === 'number' ? m.goalsAgainst : 0;
      row.goalDifference = row.goalsFor - row.goalsAgainst;
    }
    return Object.values(bySeason);
  }, [leagueMatches]);

  const seasonRankingTrend = useMemo(() => {
    if (selectedSeason === 'all' || !mainTeamId) return null;

    const selectedCompetition = competitions.find((competition: any) => {
      const name = typeof competition?.name === 'string' ? competition.name.trim() : '';
      return competition?.id === selectedCompetitionId || name === selectedCompetitionId;
    });

    const seasonMatches = matches.filter((m: any) => {
      const season = typeof m?.competitionSeason === 'string' ? String(m.competitionSeason).trim() : '';
      const competitionName = typeof m?.competitionName === 'string' ? String(m.competitionName).trim() : '';
      const sameCompetition =
        selectedCompetitionId === 'all' ||
        m?.competitionId === selectedCompetitionId ||
        competitionName === selectedCompetitionId;
      return m?.competitionType === 'league' && season === selectedSeason && sameCompetition;
    });

    const parseScore = (value: any): number | null => {
      if (value === undefined || value === null || value === '') return null;
      if (typeof value === 'number') return Number.isFinite(value) ? value : null;
      const num = Number(value);
      return Number.isFinite(num) ? num : null;
    };

    const completedMatches = seasonMatches.filter((m: any) => {
      const scoreHome = parseScore(m?.scoreHome);
      const scoreAway = parseScore(m?.scoreAway);
      return scoreHome !== null && scoreAway !== null;
    });

    if (completedMatches.length === 0) return null;

    const matchesByRound: Record<string, any[]> = {};
    completedMatches.forEach((m: any) => {
      const roundId = typeof m?.roundId === 'string' ? m.roundId : '';
      if (!roundId) return;
      if (!matchesByRound[roundId]) matchesByRound[roundId] = [];
      matchesByRound[roundId].push(m);
    });

    const sortedRounds = Object.keys(matchesByRound).sort((a, b) => {
      const aMatches = matchesByRound[a];
      const bMatches = matchesByRound[b];
      const aTime = Math.min(...aMatches.map((m: any) => new Date(m?.matchDate || 0).getTime()).filter(Number.isFinite));
      const bTime = Math.min(...bMatches.map((m: any) => new Date(m?.matchDate || 0).getTime()).filter(Number.isFinite));
      if (Number.isFinite(aTime) && Number.isFinite(bTime) && aTime !== bTime) return aTime - bTime;
      return a.localeCompare(b, 'ja');
    });

    const teamIds = new Set<string>();
    const competitionTeams = Array.isArray((selectedCompetition as any)?.teams) ? (selectedCompetition as any).teams : [];
    competitionTeams.forEach((teamId: any) => {
      if (typeof teamId === 'string' && teamId.trim()) teamIds.add(teamId);
    });
    completedMatches.forEach((m: any) => {
      if (typeof m?.homeTeam === 'string' && m.homeTeam.trim()) teamIds.add(m.homeTeam);
      if (typeof m?.awayTeam === 'string' && m.awayTeam.trim()) teamIds.add(m.awayTeam);
    });

    const standings: Record<string, { played: number; wins: number; draws: number; losses: number; goalsFor: number; goalsAgainst: number; goalDifference: number; points: number }> = {};
    teamIds.forEach((teamId) => {
      standings[teamId] = { played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0 };
    });

    const trend: Array<{ round: string; rank: number | null; points: number; opponentId?: string; opponentLogoUrl?: string }> = [];

    sortedRounds.forEach((round, roundIndex) => {
      matchesByRound[round].forEach((m: any) => {
        const homeTeamId = typeof m?.homeTeam === 'string' ? m.homeTeam : '';
        const awayTeamId = typeof m?.awayTeam === 'string' ? m.awayTeam : '';
        const scoreHome = typeof m?.scoreHome === 'number' ? m.scoreHome : Number(m?.scoreHome);
        const scoreAway = typeof m?.scoreAway === 'number' ? m.scoreAway : Number(m?.scoreAway);
        if (!homeTeamId || !awayTeamId || !Number.isFinite(scoreHome) || !Number.isFinite(scoreAway)) return;
        if (!standings[homeTeamId]) standings[homeTeamId] = { played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0 };
        if (!standings[awayTeamId]) standings[awayTeamId] = { played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0 };

        const home = standings[homeTeamId];
        const away = standings[awayTeamId];
        home.played += 1;
        away.played += 1;
        home.goalsFor += scoreHome;
        home.goalsAgainst += scoreAway;
        away.goalsFor += scoreAway;
        away.goalsAgainst += scoreHome;
        home.goalDifference = home.goalsFor - home.goalsAgainst;
        away.goalDifference = away.goalsFor - away.goalsAgainst;

        if (scoreHome > scoreAway) {
          home.wins += 1;
          home.points += 3;
          away.losses += 1;
        } else if (scoreHome < scoreAway) {
          away.wins += 1;
          away.points += 3;
          home.losses += 1;
        } else {
          home.draws += 1;
          away.draws += 1;
          home.points += 1;
          away.points += 1;
        }
      });

      const sortedTeams = Object.entries(standings).sort(([teamA, a], [teamB, b]) => {
        if (b.points !== a.points) return b.points - a.points;
        if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
        if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
        return teamA.localeCompare(teamB, 'ja');
      });
      const myRank = sortedTeams.findIndex(([teamId]) => teamId === mainTeamId);
      const myStanding = standings[mainTeamId];
      const myMatch = matchesByRound[round].find((m: any) => m?.homeTeam === mainTeamId || m?.awayTeam === mainTeamId);
      const opponentId = myMatch
        ? myMatch.homeTeam === mainTeamId
          ? myMatch.awayTeam
          : myMatch.homeTeam
        : undefined;
      const opponentLogoUrl = typeof opponentId === 'string' ? teamLogoById[opponentId] : undefined;

      trend.push({
        round: String(roundIndex + 1),
        rank: myRank >= 0 ? myRank + 1 : null,
        points: myStanding?.points || 0,
        opponentId,
        opponentLogoUrl,
      });
    });

    return trend;
  }, [matches, competitions, selectedSeason, selectedCompetitionId, mainTeamId, teamLogoById]);

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
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-3 md:p-6">
      <div className="mx-auto max-w-7xl space-y-5">
        <AnalysisHeader />
        
        <div className="rounded-2xl bg-slate-800/70 p-1.5 shadow-sm">
          <div className="grid grid-cols-2 gap-1">
            <button
              onClick={() => setActiveView("overall")}
              className={`rounded-xl px-6 py-3 text-sm font-semibold transition-all ${
                activeView === "overall"
                  ? "bg-[#4ade80] text-slate-950 shadow-sm"
                  : "text-slate-300 hover:bg-slate-700/60"
              }`}
            >
              通算
            </button>
            {canViewTournament ? (
              <button
                onClick={() => setActiveView("tournament")}
                className={`rounded-xl px-6 py-3 text-sm font-semibold transition-all ${
                  activeView === "tournament"
                    ? "bg-[#4ade80] text-slate-950 shadow-sm"
                    : "text-slate-300 hover:bg-slate-700/60"
                }`}
              >
                大会別
              </button>
            ) : <div />}
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
                      <div className="space-y-4">
                        <div className="rounded-3xl border border-[#263149] bg-[#141d2e] p-5 shadow-sm">
                          <div className="text-sm font-medium text-slate-300">勝率</div>
                          <div className="mt-2 flex items-end gap-3">
                            <div className="text-4xl font-bold leading-none tracking-tight text-white">{leagueSummary.winRate.toFixed(1)}%</div>
                            <div className="pb-1 text-sm text-slate-400">{leagueSummary.matchesCount}試合</div>
                          </div>
                          <div className="mt-4 grid grid-cols-3 gap-2">
                            <div className="h-1.5 rounded-full bg-green-600" />
                            <div className="h-1.5 rounded-full bg-slate-500" />
                            <div className="h-1.5 rounded-full bg-red-500" />
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
                          <div className="rounded-2xl border border-[#263149] bg-[#141d2e] p-4 text-center shadow-sm">
                            <div className="text-sm text-slate-300">勝</div>
                            <div className="mt-2 text-xl font-bold text-green-400">{leagueSummary.wins}</div>
                          </div>
                          <div className="rounded-2xl border border-[#263149] bg-[#141d2e] p-4 text-center shadow-sm">
                            <div className="text-sm text-slate-300">分</div>
                            <div className="mt-2 text-xl font-bold text-white">{leagueSummary.draws}</div>
                          </div>
                          <div className="rounded-2xl border border-[#263149] bg-[#141d2e] p-4 text-center shadow-sm">
                            <div className="text-sm text-slate-300">負</div>
                            <div className="mt-2 text-xl font-bold text-red-400">{leagueSummary.losses}</div>
                          </div>
                          <div className="rounded-2xl border border-[#263149] bg-[#141d2e] p-4 text-center shadow-sm">
                            <div className="text-sm text-slate-300">得点</div>
                            <div className="mt-2 text-xl font-bold text-blue-400">{leagueSummary.goalsFor}</div>
                          </div>
                          <div className="rounded-2xl border border-[#263149] bg-[#141d2e] p-4 text-center shadow-sm">
                            <div className="text-sm text-slate-300">失点</div>
                            <div className="mt-2 text-xl font-bold text-red-400">{leagueSummary.goalsAgainst}</div>
                          </div>
                          <div className="rounded-2xl border border-[#263149] bg-[#141d2e] p-4 text-center shadow-sm">
                            <div className="text-sm text-slate-300">得失差</div>
                            <div className={`mt-2 text-xl font-bold ${leagueSummary.goalDifference >= 0 ? "text-green-400" : "text-red-400"}`}>{leagueSummary.goalDifference}</div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {selectedTournamentType === "league" && selectedCompetitionId !== "all" && selectedSeason !== 'all' && seasonRankingTrend && seasonRankingTrend.length > 0 && (
              <div className="relative overflow-hidden rounded-xl bg-slate-800/50 backdrop-blur-xl border border-slate-700">
                <div className="relative pt-3 px-3 pb-3 sm:pt-4 sm:px-4 sm:pb-4">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div className="text-white text-sm font-semibold">シーズン順位推移（節ごと）</div>
                    <div className="flex rounded-full border border-slate-700 bg-slate-900/50 p-0.5 text-[11px] font-semibold">
                      <button
                        type="button"
                        onClick={() => setSeasonRankingTrendMode('recent')}
                        className={`rounded-full px-3 py-1 transition ${seasonRankingTrendMode === 'recent' ? 'bg-[#4ade80] text-slate-950' : 'text-slate-300'}`}
                      >
                        直近5試合
                      </button>
                      <button
                        type="button"
                        onClick={() => setSeasonRankingTrendMode('all')}
                        className={`rounded-full px-3 py-1 transition ${seasonRankingTrendMode === 'all' ? 'bg-[#4ade80] text-slate-950' : 'text-slate-300'}`}
                      >
                        全期間
                      </button>
                    </div>
                  </div>

                  {(() => {
                    const graphPoints = seasonRankingTrendMode === 'recent' ? seasonRankingTrend.slice(-5) : seasonRankingTrend;
                    const validPoints = graphPoints.filter((p) => p.rank !== null);
                    const maxRank = Math.max(5, Math.ceil(Math.max(...seasonRankingTrend.map((p) => p.rank || 0)) / 5) * 5);
                    const chartWidth = seasonRankingTrendMode === 'recent'
                      ? Math.max(420, graphPoints.length * 88)
                      : Math.max(640, graphPoints.length * 48);
                    const chartHeight = 160;
                    const chartTop = 18;
                    const chartBottom = 132;
                    const chartLeft = 42;
                    const chartRight = 18;
                    const plotWidth = chartWidth - chartLeft - chartRight;
                    const plotHeight = chartBottom - chartTop;
                    const toX = (index: number, length: number) => {
                      const firstPointPadding = 24;
                      const lastPointPadding = 24;
                      const effectiveWidth = plotWidth - firstPointPadding - lastPointPadding;
                      return chartLeft + firstPointPadding + (index / (length - 1 || 1)) * effectiveWidth;
                    };
                    const toY = (rank: number) => chartTop + ((rank - 1) / Math.max(1, maxRank - 1)) * plotHeight;
                    const linePoints = validPoints.map((point, index, points) => `${toX(index, points.length)},${toY(point.rank!)}`).join(' ');
                    const areaPoints = validPoints.length > 1 ? `${chartLeft},${chartBottom} ${linePoints} ${toX(validPoints.length - 1, validPoints.length)},${chartBottom}` : '';
                    const yTicks = [1, ...Array.from({ length: Math.floor(maxRank / 5) }, (_, index) => (index + 1) * 5)].filter((rank) => rank <= maxRank);

                    return (
                      <div className="rounded-md border border-slate-700 bg-slate-900/30 overflow-hidden">
                        <div className="flex">
                          <div className="w-10 sm:w-12 border-r border-slate-700/60 relative">
                            <div className="absolute left-0 top-0 bottom-0 w-10 sm:w-12 flex items-center justify-center pointer-events-none">
                              <div className="text-[9px] text-slate-400 -rotate-90 tracking-widest">順位</div>
                            </div>
                          </div>
                          <div className="min-w-0 flex-1 overflow-x-auto p-2 sm:p-3">
                            <div className="relative" style={{ minWidth: `${chartWidth}px` }}>
                              <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="h-44 w-full sm:h-52" preserveAspectRatio="none">
                                {yTicks.map((rank) => {
                                  const y = toY(rank);
                                  return (
                                    <g key={`rank-tick-${rank}`}>
                                      <line x1={chartLeft} x2={chartWidth - chartRight} y1={y} y2={y} stroke="#263149" strokeWidth="1" />
                                      <text x={chartLeft - 16} y={y + 3} textAnchor="end" fontSize="9" fill="#94a3b8">
                                        {rank}
                                      </text>
                                    </g>
                                  );
                                })}
                                {areaPoints && <polygon points={areaPoints} fill="#4ade80" opacity="0.08" />}
                                {linePoints && (
                                  <polyline
                                    points={linePoints}
                                    fill="none"
                                    stroke="#4ade80"
                                    strokeWidth="1.5"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeDasharray="2 5 16 5"
                                  />
                                )}
                                {validPoints.map((point, index, points) => {
                                  const x = toX(index, points.length);
                                  const y = toY(point.rank!);
                                  return (
                                    <g key={`rank-point-${point.round}`}>
                                      <text x={x} y={Math.max(10, y - 10)} textAnchor="middle" fontSize="9" fill="white" fontWeight="bold">
                                        {point.rank}
                                      </text>
                                    </g>
                                  );
                                })}
                              </svg>
                              {graphPoints.map((point, index) => {
                                const x = toX(index, graphPoints.length);
                                const y = point.rank !== null ? toY(point.rank) : null;
                                return (
                                  <div
                                    key={`round-emblem-${point.round}`}
                                    className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
                                    style={{ left: `${(x / chartWidth) * 100}%`, top: `${y ? (y / chartHeight) * 100 : 0}%` }}
                                  >
                                    {point.opponentLogoUrl ? (
                                      <img src={point.opponentLogoUrl} alt="" className="h-[22px] w-[22px] rounded-full object-contain" />
                                    ) : (
                                      <div className="h-[22px] w-[22px] rounded-full bg-slate-600" />
                                    )}
                                  </div>
                                );
                              })}
                              <div className="border-t border-slate-700/50 pt-2 relative" style={{ height: '40px' }}>
                                {graphPoints.map((point, index) => {
                                  const x = toX(index, graphPoints.length);
                                  return (
                                    <div
                                      key={`round-label-${point.round}`}
                                      className="absolute -translate-x-1/2 text-center"
                                      style={{ left: `${(x / chartWidth) * 100}%` }}
                                    >
                                      <div className="flex flex-col items-center gap-0.5">
                                        <span className="text-[11px] font-semibold text-slate-300">第{point.round}節</span>
                                        <span className="text-[10px] font-medium text-slate-400">{point.points}pt</span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}

            {selectedTournamentType === "league" && selectedCompetitionId !== "all" && (
              <div className="relative overflow-hidden rounded-xl bg-slate-800/50 backdrop-blur-xl border border-slate-700">
                <div className="relative pt-3 px-3 pb-3 sm:pt-4 sm:px-4 sm:pb-4">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div className="text-white text-sm font-semibold">主要スタッツ</div>
                    <div className="flex rounded-full border border-slate-700 bg-slate-900/50 p-0.5 text-[11px] font-semibold">
                      <button
                        type="button"
                        onClick={() => setMainStatsView('main')}
                        className={`rounded-full px-3 py-1 transition ${mainStatsView === 'main' ? 'bg-[#4ade80] text-slate-950' : 'text-slate-300'}`}
                      >
                        チーム
                      </button>
                      <button
                        type="button"
                        onClick={() => setMainStatsView('player')}
                        className={`rounded-full px-3 py-1 transition ${mainStatsView === 'player' ? 'bg-[#4ade80] text-slate-950' : 'text-slate-300'}`}
                      >
                        選手
                      </button>
                    </div>
                  </div>

                  {mainStatsView === 'main' ? (
                    <MainStats mainStatsData={mainStats} />
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-700">
                            <th 
                              className="px-2 py-2 text-left text-slate-400 font-medium cursor-pointer hover:text-white transition"
                              onClick={() => handleSort('position')}
                            >
                              POS {sortColumn === 'position' && (sortDirection === 'asc' ? '↑' : '↓')}
                            </th>
                            <th 
                              className="px-2 py-2 text-left text-slate-400 font-medium cursor-pointer hover:text-white transition"
                              onClick={() => handleSort('name')}
                            >
                              名前 {sortColumn === 'name' && (sortDirection === 'asc' ? '↑' : '↓')}
                            </th>
                            <th 
                              className="px-2 py-2 text-right text-slate-400 font-medium cursor-pointer hover:text-white transition"
                              onClick={() => handleSort('matches')}
                            >
                              試合数 {sortColumn === 'matches' && (sortDirection === 'asc' ? '↑' : '↓')}
                            </th>
                            <th 
                              className="px-2 py-2 text-right text-slate-400 font-medium cursor-pointer hover:text-white transition"
                              onClick={() => handleSort('starts')}
                            >
                              先発 {sortColumn === 'starts' && (sortDirection === 'asc' ? '↑' : '↓')}
                            </th>
                            <th 
                              className="px-2 py-2 text-right text-slate-400 font-medium cursor-pointer hover:text-white transition"
                              onClick={() => handleSort('substitutions')}
                            >
                              途中出場 {sortColumn === 'substitutions' && (sortDirection === 'asc' ? '↑' : '↓')}
                            </th>
                            <th 
                              className="px-2 py-2 text-right text-slate-400 font-medium cursor-pointer hover:text-white transition"
                              onClick={() => handleSort('goals')}
                            >
                              G {sortColumn === 'goals' && (sortDirection === 'asc' ? '↑' : '↓')}
                            </th>
                            <th 
                              className="px-2 py-2 text-right text-slate-400 font-medium cursor-pointer hover:text-white transition"
                              onClick={() => handleSort('assists')}
                            >
                              A {sortColumn === 'assists' && (sortDirection === 'asc' ? '↑' : '↓')}
                            </th>
                            <th 
                              className="px-2 py-2 text-right text-slate-400 font-medium cursor-pointer hover:text-white transition"
                              onClick={() => handleSort('rating')}
                            >
                              評価点 {sortColumn === 'rating' && (sortDirection === 'asc' ? '↑' : '↓')}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {sortedPlayerStatsList && sortedPlayerStatsList.length > 0 ? (
                            sortedPlayerStatsList.map((player) => (
                              <tr key={player.playerId} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                                <td className="px-2 py-2 text-slate-300">{player.position || '-'}</td>
                                <td className="px-2 py-2 text-white font-medium">{player.playerName}</td>
                                <td className="px-2 py-2 text-right text-slate-300">{player.matches}</td>
                                <td className="px-2 py-2 text-right text-slate-300">{player.starts}</td>
                                <td className="px-2 py-2 text-right text-slate-300">{player.substitutions}</td>
                                <td className="px-2 py-2 text-right text-green-400 font-medium">{player.goals}</td>
                                <td className="px-2 py-2 text-right text-blue-400 font-medium">{player.assists}</td>
                                <td className="px-2 py-2 text-right text-slate-300">
                                  {player.rating !== undefined && player.rating !== null ? player.rating.toFixed(2) : '-'}
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan={8} className="px-2 py-4 text-center text-slate-500">
                                データがありません
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
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
                              <div className="absolute inset-x-0 top-0 h-1/2 bg-slate-900/[0.02]" />
                              <div className="absolute inset-x-0 bottom-0 h-1/2 bg-slate-900/[0.04]" />
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
