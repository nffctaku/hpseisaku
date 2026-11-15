import type { SheetMatchRow, SheetCompetition } from "./match-sheet";
import { getRoundSortKey } from "./match-sheet";
import type { MatchEvent } from "@/types/match";
import { toSlashSeason } from "./season";

export type CompetitionFormat = "league" | "cup" | "league_cup" | undefined;

export interface DashboardMatchView {
  row: SheetMatchRow;
  isHome: boolean;
  selfTeamId: string;
  opponentTeamId: string;
  selfScore: number | null;
  oppScore: number | null;
  selfPk: number | null;
  oppPk: number | null;
  result: "W" | "D" | "L" | null;
  concluded: boolean;
  competitionFormat: CompetitionFormat;
}

export interface DashboardFilter {
  season?: string; // slash, e.g. "2030/31"
  competitionId?: "all" | "league" | string;
}

const isNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export function baseMinute(minute: number | string | undefined): number {
  if (isNumber(minute)) return Math.floor(minute);
  const s = String(minute ?? "");
  if (s.includes("+")) {
    const n = parseInt(s.split("+")[0], 10);
    return Number.isNaN(n) ? 0 : n;
  }
  const n = parseInt(s, 10);
  return Number.isNaN(n) ? 0 : n;
}

export function determineResult(
  selfScore: number | null,
  oppScore: number | null,
  selfPk: number | null,
  oppPk: number | null
): "W" | "D" | "L" | null {
  if (!isNumber(selfScore) || !isNumber(oppScore)) return null;
  if (selfScore > oppScore) return "W";
  if (selfScore < oppScore) return "L";
  const pkConcluded = isNumber(selfPk) && isNumber(oppPk);
  if (pkConcluded) {
    if (selfPk > oppPk) return "W";
    if (selfPk < oppPk) return "L";
    return "D";
  }
  return "D";
}

export function buildMatchViews(
  rows: SheetMatchRow[],
  competitions: SheetCompetition[],
  selfTeamIds: string[]
): DashboardMatchView[] {
  const compMap = new Map(competitions.map((c) => [c.id, c]));
  return rows
    .filter((r) => selfTeamIds.includes(r.homeTeam) || selfTeamIds.includes(r.awayTeam))
    .map((row) => {
      const isHome = selfTeamIds.includes(row.homeTeam);
      const selfTeamId = isHome ? row.homeTeam : row.awayTeam;
      const opponentTeamId = isHome ? row.awayTeam : row.homeTeam;
      const selfScore = isHome ? row.scoreHome : row.scoreAway;
      const oppScore = isHome ? row.scoreAway : row.scoreHome;
      const selfPk = isHome ? row.pkScoreHome : row.pkScoreAway;
      const oppPk = isHome ? row.pkScoreAway : row.pkScoreHome;
      const concluded = isNumber(row.scoreHome) && isNumber(row.scoreAway);
      const result = determineResult(selfScore, oppScore, selfPk, oppPk);
      const competitionFormat = compMap.get(row.competitionId)?.format as CompetitionFormat;
      return {
        row,
        isHome,
        selfTeamId,
        opponentTeamId,
        selfScore,
        oppScore,
        selfPk,
        oppPk,
        result,
        concluded,
        competitionFormat,
      };
    });
}

export function filterMatchViews(
  views: DashboardMatchView[],
  competitions: SheetCompetition[],
  filter: DashboardFilter
): DashboardMatchView[] {
  const compMap = new Map(competitions.map((c) => [c.id, c]));
  return views.filter((v) => {
    if (filter.season) {
      const c = compMap.get(v.row.competitionId);
      const season = c?.season ? toSlashSeason(c.season) : undefined;
      if (season !== filter.season) return false;
    }
    if (filter.competitionId) {
      if (filter.competitionId === "all") return true;
      if (filter.competitionId === "league") return v.competitionFormat === "league";
      return v.row.competitionId === filter.competitionId;
    }
    return true;
  });
}

export interface OverviewStats {
  matches: number;
  wins: number;
  draws: number;
  losses: number;
  winRate: number;
  drawRate: number;
  lossRate: number;
  leaguePoints: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  cleanSheets: number;
}

export function computeOverviewStats(views: DashboardMatchView[]): OverviewStats {
  const matches = views.length;
  const wins = views.filter((v) => v.result === "W").length;
  const draws = views.filter((v) => v.result === "D").length;
  const losses = views.filter((v) => v.result === "L").length;
  const winRate = matches ? (wins / matches) * 100 : 0;
  const drawRate = matches ? (draws / matches) * 100 : 0;
  const lossRate = matches ? (losses / matches) * 100 : 0;
  const leaguePoints = views
    .filter((v) => v.competitionFormat === "league" && v.result)
    .reduce((s, v) => s + (v.result === "W" ? 3 : v.result === "D" ? 1 : 0), 0);
  const goalsFor = views.reduce((s, v) => s + (v.selfScore ?? 0), 0);
  const goalsAgainst = views.reduce((s, v) => s + (v.oppScore ?? 0), 0);
  const cleanSheets = views.filter((v) => v.concluded && v.oppScore === 0).length;
  return {
    matches,
    wins,
    draws,
    losses,
    winRate,
    drawRate,
    lossRate,
    leaguePoints,
    goalsFor,
    goalsAgainst,
    goalDifference: goalsFor - goalsAgainst,
    cleanSheets,
  };
}

export interface HomeAwayRow {
  location: "home" | "away" | "total";
  matches: number;
  wins: number;
  draws: number;
  losses: number;
  points: number;
  goalsFor: number;
  goalsAgainst: number;
  winRate: number;
}

export interface ScoreAnalysis {
  oneGoalWins: number;
  twoPlusGoalWins: number;
  maxGoalsFor: number;
  multiGoalsAgainstMatches: number;
  maxGoalsAgainst: number;
}

export interface Streaks {
  longestWinStreak: number;
  longestLossStreak: number;
}

export interface MatchStats {
  homeAway: HomeAwayRow[];
  streaks: Streaks;
  scoreAnalysis: ScoreAnalysis;
}

function buildHomeAwayRow(location: "home" | "away" | "total", subset: DashboardMatchView[]): HomeAwayRow {
  const matches = subset.length;
  const wins = subset.filter((v) => v.result === "W").length;
  const draws = subset.filter((v) => v.result === "D").length;
  const losses = subset.filter((v) => v.result === "L").length;
  const points = wins * 3 + draws;
  const goalsFor = subset.reduce((s, v) => s + (v.selfScore ?? 0), 0);
  const goalsAgainst = subset.reduce((s, v) => s + (v.oppScore ?? 0), 0);
  const winRate = matches ? (wins / matches) * 100 : 0;
  return { location, matches, wins, draws, losses, points, goalsFor, goalsAgainst, winRate };
}

export function computeMatchStats(views: DashboardMatchView[]): MatchStats {
  const sorted = [...views].filter((v) => v.concluded).sort((a, b) => {
    const d = (a.row.matchDate || "").localeCompare(b.row.matchDate || "");
    return d !== 0 ? d : (a.row.matchId || "").localeCompare(b.row.matchId || "");
  });

  let longestWin = 0;
  let longestLoss = 0;
  let currentWin = 0;
  let currentLoss = 0;
  for (const v of sorted) {
    if (v.result === "W") {
      currentWin++;
      currentLoss = 0;
      longestWin = Math.max(longestWin, currentWin);
    } else if (v.result === "L") {
      currentLoss++;
      currentWin = 0;
      longestLoss = Math.max(longestLoss, currentLoss);
    } else {
      currentWin = 0;
      currentLoss = 0;
    }
  }

  const wins = sorted.filter((v) => v.result === "W");
  const oneGoalWins = wins.filter((v) => (v.selfScore ?? 0) - (v.oppScore ?? 0) === 1).length;
  const twoPlusGoalWins = wins.filter((v) => (v.selfScore ?? 0) - (v.oppScore ?? 0) >= 2).length;
  const maxGoalsFor = sorted.reduce((m, v) => Math.max(m, v.selfScore ?? 0), 0);
  const multiGoalsAgainstMatches = sorted.filter((v) => (v.oppScore ?? 0) >= 2).length;
  const maxGoalsAgainst = sorted.reduce((m, v) => Math.max(m, v.oppScore ?? 0), 0);

  return {
    homeAway: [
      buildHomeAwayRow("home", views.filter((v) => v.isHome)),
      buildHomeAwayRow("away", views.filter((v) => !v.isHome)),
      buildHomeAwayRow("total", views),
    ],
    streaks: { longestWinStreak: longestWin, longestLossStreak: longestLoss },
    scoreAnalysis: {
      oneGoalWins,
      twoPlusGoalWins,
      maxGoalsFor,
      multiGoalsAgainstMatches,
      maxGoalsAgainst,
    },
  };
}

export type GoalTimeBucket = "1-15" | "16-30" | "31-45" | "46-60" | "61-75" | "76-90+";

export interface GoalAnalysis {
  buckets: Record<GoalTimeBucket, number>;
  firstHalfGoals: number;
  secondHalfGoals: number;
  firstHalfRatio: number;
  secondHalfGoalsRatio: number;
  unregisteredGoals: number;
}

function bucketForMinute(minute: number): GoalTimeBucket {
  if (minute <= 15) return "1-15";
  if (minute <= 30) return "16-30";
  if (minute <= 45) return "31-45";
  if (minute <= 60) return "46-60";
  if (minute <= 75) return "61-75";
  return "76-90+";
}

function isSelfGoalEvent(ev: MatchEvent, selfTeamId: string): boolean {
  if (ev.type !== "goal") return false;
  if (ev.teamId === selfTeamId) {
    // 自チーム選手の通常得点・PK
    return ev.goalKind !== "own_goal";
  }
  // 相手側のオウンゴールも自チーム得点
  return ev.goalKind === "own_goal";
}

export function computeGoalAnalysis(views: DashboardMatchView[]): GoalAnalysis {
  const buckets: Record<GoalTimeBucket, number> = {
    "1-15": 0,
    "16-30": 0,
    "31-45": 0,
    "46-60": 0,
    "61-75": 0,
    "76-90+": 0,
  };
  let firstHalf = 0;
  let secondHalf = 0;
  let registeredGoals = 0;

  for (const v of views) {
    for (const ev of v.row.events || []) {
      if (!isSelfGoalEvent(ev, v.selfTeamId)) continue;
      const m = baseMinute(ev.minute);
      const bucket = bucketForMinute(m);
      buckets[bucket]++;
      registeredGoals++;
      if (m <= 45) firstHalf++;
      else secondHalf++;
    }
  }

  const totalGoals = views.reduce((s, v) => s + (v.selfScore ?? 0), 0);
  const totalBucket = firstHalf + secondHalf;
  const firstHalfRatio = totalBucket ? (firstHalf / totalBucket) * 100 : 0;
  const secondHalfGoalsRatio = totalBucket ? (secondHalf / totalBucket) * 100 : 0;

  return {
    buckets,
    firstHalfGoals: firstHalf,
    secondHalfGoals: secondHalf,
    firstHalfRatio,
    secondHalfGoalsRatio,
    unregisteredGoals: Math.max(0, totalGoals - registeredGoals),
  };
}

export interface PlayerForRanking {
  id: string;
  name: string;
  photoURL?: string;
}

export interface PlayerRankingEntry {
  rank: number;
  playerId: string;
  playerName: string;
  playerImage?: string;
  goals: number;
  share: number;
}

export function computePlayerRanking(
  views: DashboardMatchView[],
  players: PlayerForRanking[]
): PlayerRankingEntry[] {
  const playerMap = new Map(players.map((p) => [p.id, p]));
  const counts = new Map<string, number>();

  for (const v of views) {
    for (const ev of v.row.events || []) {
      if (ev.type !== "goal") continue;
      // 自チーム選手の通常得点・PKを計上。オウンゴールは除外。
      if (ev.teamId !== v.selfTeamId) continue;
      if (ev.goalKind === "own_goal") continue;
      if (!ev.playerId) continue; // ID未紐付けは集計しない
      counts.set(ev.playerId, (counts.get(ev.playerId) || 0) + 1);
    }
  }

  const teamGoals = views.reduce((s, v) => s + (v.selfScore ?? 0), 0);
  const entries: PlayerRankingEntry[] = [];
  for (const [playerId, goals] of counts) {
    const p = playerMap.get(playerId);
    const share = teamGoals ? goals / teamGoals : 0;
    entries.push({
      rank: 0,
      playerId,
      playerName: p?.name ?? playerId,
      playerImage: p?.photoURL,
      goals,
      share,
    });
  }

  entries.sort((a, b) => b.goals - a.goals || a.playerName.localeCompare(b.playerName));
  for (let i = 0; i < entries.length; i++) {
    entries[i].rank = i + 1;
  }
  return entries;
}

export interface MonthlyStats {
  month: string;
  matches: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  winRate: number;
}

export interface MonthlyStatsResult {
  months: MonthlyStats[];
  chartData: MonthlyStats[];
}

export function computeMonthlyStats(views: DashboardMatchView[]): MonthlyStatsResult {
  const map = new Map<string, MonthlyStats>();
  for (const v of views) {
    const month = (v.row.matchDate || "").slice(0, 7);
    if (!month) continue;
    if (!map.has(month)) {
      map.set(month, { month, matches: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, winRate: 0 });
    }
    const m = map.get(month)!;
    m.matches++;
    if (v.result === "W") m.wins++;
    else if (v.result === "D") m.draws++;
    else if (v.result === "L") m.losses++;
    m.goalsFor += v.selfScore ?? 0;
    m.goalsAgainst += v.oppScore ?? 0;
  }
  const months = Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month));
  for (const m of months) {
    m.goalDifference = m.goalsFor - m.goalsAgainst;
    m.winRate = m.matches ? (m.wins / m.matches) * 100 : 0;
  }
  return { months, chartData: months };
}

export function getSeasonOptions(competitions: SheetCompetition[]): string[] {
  const set = new Set<string>();
  for (const c of competitions) {
    if (c.season) set.add(toSlashSeason(c.season));
  }
  return Array.from(set).sort().reverse();
}

export interface CompetitionFilterOption {
  id: string;
  name: string;
  logoUrl?: string;
}

export function getCompetitionFilterOptions(competitions: SheetCompetition[]): CompetitionFilterOption[] {
  return competitions
    .map((c) => ({ id: c.id, name: c.name, logoUrl: c.logoUrl }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export interface LeaguePositionPoint {
  matchId: string;
  competitionId: string;
  competitionName: string;
  roundName: string;
  matchDate: string;
  sortKey: number;
  position: number;
  label: string;
  opponentTeamId: string;
  selfScore: number | null;
  oppScore: number | null;
  isHome: boolean;
  points?: number;
}

export interface LeaguePositionSeries {
  competitionId: string;
  competitionName: string;
  points: LeaguePositionPoint[];
}

export function computeLeaguePositionSeries(
  views: DashboardMatchView[],
  competitions: SheetCompetition[]
): LeaguePositionSeries[] {
  const compMap = new Map(competitions.map((c) => [c.id, c]));
  const byComp = new Map<string, DashboardMatchView[]>();

  for (const v of views) {
    const comp = compMap.get(v.row.competitionId);
    if (!comp || comp.format !== 'league') continue;
    if (!isNumber(v.row.leaguePositionAfterMatch)) continue;
    const list = byComp.get(comp.id) ?? [];
    list.push(v);
    byComp.set(comp.id, list);
  }

  const result: LeaguePositionSeries[] = [];
  for (const [compId, list] of byComp) {
    const comp = compMap.get(compId)!;
    const sorted = [...list].sort((a, b) => {
      const roundA = getRoundSortKey(a.row.roundName);
      const roundB = getRoundSortKey(b.row.roundName);
      if (roundA !== roundB) return roundA - roundB;
      const dateCmp = (a.row.matchDate || '').localeCompare(b.row.matchDate || '');
      if (dateCmp !== 0) return dateCmp;
      return (a.row.matchId || '').localeCompare(b.row.matchId || '');
    });

    let cumulativePoints = 0;
    const points: LeaguePositionPoint[] = sorted.map((v, idx) => {
      const resultPoints = v.result === 'W' ? 3 : v.result === 'D' ? 1 : 0;
      cumulativePoints += resultPoints;
      return {
        matchId: v.row.matchId,
        competitionId: compId,
        competitionName: comp.name,
        roundName: v.row.roundName,
        matchDate: v.row.matchDate,
        sortKey: idx,
        position: v.row.leaguePositionAfterMatch as number,
        label: v.row.roundName || `第${idx + 1}節`,
        opponentTeamId: v.opponentTeamId,
        selfScore: v.selfScore,
        oppScore: v.oppScore,
        isHome: v.isHome,
        points: cumulativePoints,
      };
    });
    result.push({ competitionId: compId, competitionName: comp.name, points });
  }

  return result.sort((a, b) => a.competitionName.localeCompare(b.competitionName));
}
