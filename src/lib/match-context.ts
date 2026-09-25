import { MatchDetails } from "@/types/match";
import { getMatchDataForClub, getMatchSortMs, getSeasonFromMatchDate } from "@/lib/matches";
import { toSlashSeason } from "@/lib/season";

type Result = "win" | "loss" | "draw";

interface TeamTableRow {
  teamId: string;
  teamName: string;
  played: number;
  points: number;
  gf: number;
  ga: number;
}

export interface StreakNumbers {
  wins: number;
  losses: number;
  unbeaten: number;
  winless: number;
}

export interface StreakContext {
  before: StreakNumbers & { scope: string };
  after: StreakNumbers & { scope: string };
}

export interface RecentMatchContext {
  match: MatchDetails;
  result: Result;
  score: string;
  opponentName: string;
  isHome: boolean;
}

export interface TableContext {
  competitionName: string;
  season: string | null;
  ownRank: number;
  opponentRank: number | null;
  ownPoints: number;
  ownPlayed: number;
  totalTeams: number;
  topRows: { rank: number; teamName: string; played: number; points: number; goalDiff: number }[];
  ownRow: { rank: number; teamName: string; played: number; points: number; goalDiff: number };
  opponentRow: { rank: number; teamName: string; played: number; points: number; goalDiff: number } | null;
  isTopTwoDirect: boolean;
  pointsGap: number;
  note: string;
}

export interface HeadToHeadContext {
  match: MatchDetails;
  result: Result;
  score: string;
}

export interface MatchContext {
  clubName: string | null;
  selfTeamId: string;
  selfTeamName: string;
  opponentTeamId: string;
  opponentTeamName: string;
  selfIsHome: boolean;
  selfScore: number;
  opponentScore: number;
  selfResult: Result;
  recent5SameCompetition: RecentMatchContext[];
  /** 同一大会で前回勝利してからの試合数（今回を含む。直近30試合を上限に遡り、実際に勝利が見つかった場合のみ値を入れる） */
  matchesSinceLastWinSameCompetition: number | null;
  /** 前回勝利の検索が上限まで尽きた（30試合遡っても勝利なし=「◯試合ぶり」の具体的数字を断定できない） */
  previousWinSearchExhausted: boolean;
  sameCompetitionStreak: StreakContext | null;
  officialStreak: StreakContext | null;
  table: TableContext | null;
  headToHead: HeadToHeadContext[];
}

function isFinished(m: MatchDetails): boolean {
  return typeof m.scoreHome === "number" && typeof m.scoreAway === "number";
}

function getOwnScore(m: MatchDetails, teamId: string): number {
  return m.homeTeam === teamId ? m.scoreHome ?? 0 : m.scoreAway ?? 0;
}

function getOppScore(m: MatchDetails, teamId: string): number {
  return m.homeTeam === teamId ? m.scoreAway ?? 0 : m.scoreHome ?? 0;
}

function getOwnPkScore(m: MatchDetails, teamId: string): number | null {
  if (m.homeTeam === teamId) return typeof m.pkScoreHome === "number" ? m.pkScoreHome : null;
  return typeof m.pkScoreAway === "number" ? m.pkScoreAway : null;
}

function getOppPkScore(m: MatchDetails, teamId: string): number | null {
  if (m.homeTeam === teamId) return typeof m.pkScoreAway === "number" ? m.pkScoreAway : null;
  return typeof m.pkScoreHome === "number" ? m.pkScoreHome : null;
}

function getResultForTeam(m: MatchDetails, teamId: string): Result | null {
  if (!isFinished(m)) return null;
  const own = getOwnScore(m, teamId);
  const opp = getOppScore(m, teamId);
  if (own === opp) {
    const ownPk = getOwnPkScore(m, teamId);
    const oppPk = getOppPkScore(m, teamId);
    if (ownPk !== null && oppPk !== null) {
      if (ownPk > oppPk) return "win";
      if (ownPk < oppPk) return "loss";
    }
    return "draw";
  }
  return own > opp ? "win" : "loss";
}

function getScoreString(m: MatchDetails, teamId: string): string {
  const own = getOwnScore(m, teamId);
  const opp = getOppScore(m, teamId);
  let s = `${own}-${opp}`;
  const ownPk = getOwnPkScore(m, teamId);
  const oppPk = getOppPkScore(m, teamId);
  if (ownPk !== null && oppPk !== null && own === opp) {
    s += ` (PK ${ownPk}-${oppPk})`;
  }
  return s;
}

function getOpponentName(m: MatchDetails, teamId: string): string {
  return m.homeTeam === teamId ? m.awayTeamName : m.homeTeamName;
}

function isHomeMatch(m: MatchDetails, teamId: string): boolean {
  return m.homeTeam === teamId;
}

function countConsecutive(results: Result[], fromIndex: number, predicate: (r: Result) => boolean): number {
  let count = 0;
  for (let i = fromIndex; i >= 0; i--) {
    if (predicate(results[i])) {
      count++;
    } else {
      break;
    }
  }
  return count;
}

function streakAtEnd(results: Result[]): StreakNumbers {
  const idx = results.length - 1;
  if (idx < 0) return { wins: 0, losses: 0, unbeaten: 0, winless: 0 };
  return {
    wins: countConsecutive(results, idx, (r) => r === "win"),
    losses: countConsecutive(results, idx, (r) => r === "loss"),
    unbeaten: countConsecutive(results, idx, (r) => r !== "loss"),
    winless: countConsecutive(results, idx, (r) => r !== "win"),
  };
}

function buildStreaks(beforeResults: Result[], targetResult: Result, scope: string): StreakContext {
  const before = streakAtEnd(beforeResults);
  const after = streakAtEnd([...beforeResults, targetResult]);
  return {
    before: { ...before, scope },
    after: { ...after, scope },
  };
}

function areResultArraysEqual(a: Result[], b: Result[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

function ensureTeam(map: Map<string, TeamTableRow>, teamId: string, teamName: string): void {
  if (!map.has(teamId)) {
    map.set(teamId, {
      teamId,
      teamName: teamName || "不明",
      played: 0,
      points: 0,
      gf: 0,
      ga: 0,
    });
  }
}

function buildTable(
  matches: MatchDetails[],
  ownTeamId: string,
  opponentId: string,
  competitionName: string,
  season: string | null
): TableContext | null {
  const map = new Map<string, TeamTableRow>();
  for (const m of matches) {
    if (!isFinished(m)) continue;
    ensureTeam(map, m.homeTeam, m.homeTeamName);
    ensureTeam(map, m.awayTeam, m.awayTeamName);
    const homeRow = map.get(m.homeTeam)!;
    const awayRow = map.get(m.awayTeam)!;

    homeRow.played++;
    awayRow.played++;
    homeRow.gf += m.scoreHome ?? 0;
    homeRow.ga += m.scoreAway ?? 0;
    awayRow.gf += m.scoreAway ?? 0;
    awayRow.ga += m.scoreHome ?? 0;

    const homeResult = getResultForTeam(m, m.homeTeam);
    if (!homeResult) continue;
    if (homeResult === "win") {
      homeRow.points += 3;
    } else if (homeResult === "draw") {
      homeRow.points += 1;
      awayRow.points += 1;
    } else {
      awayRow.points += 3;
    }
  }

  if (map.size === 0) return null;

  const sorted = Array.from(map.values()).sort((a, b) => {
    const gdA = a.gf - a.ga;
    const gdB = b.gf - b.ga;
    return (
      b.points - a.points ||
      gdB - gdA ||
      b.gf - a.gf ||
      a.teamName.localeCompare(b.teamName)
    );
  });

  const ranked = sorted.map((row, i) => ({
    rank: i + 1,
    teamName: row.teamName,
    played: row.played,
    points: row.points,
    goalDiff: row.gf - row.ga,
  }));

  const ownIndex = sorted.findIndex((r) => r.teamId === ownTeamId);
  if (ownIndex === -1) return null;

  const opponentIndex = sorted.findIndex((r) => r.teamId === opponentId);
  const ownRanked = ranked[ownIndex];
  const opponentRanked = opponentIndex >= 0 ? ranked[opponentIndex] : null;

  const isTopTwoDirect =
    !!opponentRanked &&
    ((ownRanked.rank === 1 && opponentRanked.rank === 2) ||
      (ownRanked.rank === 2 && opponentRanked.rank === 1));
  const pointsGap = isTopTwoDirect ? Math.abs(ownRanked.points - opponentRanked.points) : 0;

  const topRows = ranked.slice(0, 5);
  const neededRows = new Set<number>([0, 1, 2, 3, 4, ownIndex, opponentIndex >= 0 ? opponentIndex : -1]);
  const displayRows = ranked.filter((_, i) => neededRows.has(i));

  return {
    competitionName,
    season,
    ownRank: ownRanked.rank,
    opponentRank: opponentRanked?.rank ?? null,
    ownPoints: ownRanked.points,
    ownPlayed: ownRanked.played,
    totalTeams: ranked.length,
    topRows: displayRows,
    ownRow: ownRanked,
    opponentRow: opponentRanked,
    isTopTwoDirect,
    pointsGap,
    note: "試合前時点の暫定順位表（消化試合数には対象試合は含まない）",
  };
}

export async function getMatchContextForAi(
  clubUid: string,
  targetMatch: MatchDetails
): Promise<MatchContext | null> {
  const {
    clubName,
    mainTeamId,
    allRecentMatches,
    allOwnPastMatches,
  } = await getMatchDataForClub(clubUid, { includeAllSeasons: true });

  if (!mainTeamId) {
    return null;
  }

  const targetSeason =
    targetMatch.season || toSlashSeason(getSeasonFromMatchDate(targetMatch.matchDate) || "");
  const targetCompId = targetMatch.competitionId;
  const isOfficial = targetCompId !== "friendly" && targetCompId !== "practice";
  const selfIsHome = targetMatch.homeTeam === mainTeamId;
  const opponentId = selfIsHome ? targetMatch.awayTeam : targetMatch.homeTeam;
  const targetMs = getMatchSortMs(targetMatch);
  const targetResult = getResultForTeam(targetMatch, mainTeamId);
  const selfTeamName = selfIsHome ? targetMatch.homeTeamName : targetMatch.awayTeamName;
  const opponentTeamName = selfIsHome ? targetMatch.awayTeamName : targetMatch.homeTeamName;
  const selfScore = getOwnScore(targetMatch, mainTeamId);
  const opponentScore = getOppScore(targetMatch, mainTeamId);

  if (!targetResult) {
    return null;
  }

  const sameSeason = (m: MatchDetails): boolean =>
    !targetSeason ||
    (m.season || toSlashSeason(getSeasonFromMatchDate(m.matchDate) || "")) === targetSeason;
  const beforeTarget = (m: MatchDetails): boolean => getMatchSortMs(m) < targetMs;

  const ownSameCompBefore = allOwnPastMatches
    .filter(
      (m) =>
        m.competitionId === targetCompId &&
        sameSeason(m) &&
        isFinished(m) &&
        beforeTarget(m)
    )
    .sort((a, b) => getMatchSortMs(a) - getMatchSortMs(b));

  const allSameCompBefore = allRecentMatches.filter(
    (m) =>
      m.competitionId === targetCompId &&
      sameSeason(m) &&
      isFinished(m) &&
      beforeTarget(m)
  );

  const recent5SameCompetition: RecentMatchContext[] = [...ownSameCompBefore]
    .sort((a, b) => getMatchSortMs(b) - getMatchSortMs(a))
    .slice(0, 5)
    .map((m) => ({
      match: m,
      result: getResultForTeam(m, mainTeamId)!,
      score: getScoreString(m, mainTeamId),
      opponentName: getOpponentName(m, mainTeamId),
      isHome: isHomeMatch(m, mainTeamId),
    }));

  const ownResultsSameComp: Result[] = ownSameCompBefore
    .map((m) => getResultForTeam(m, mainTeamId))
    .filter((r): r is Result => r !== null);

  // 同一大会で前回勝利してからの試合数（新しい順に最大30試合まで遡る）
  // 見つからない場合は「◯試合ぶり」の数字を断定できないため null + exhausted フラグで返す
  const FIRST_WIN_LOOKBACK = 30;
  let matchesSinceLastWinSameCompetition: number | null = null;
  let previousWinSearchExhausted = false;
  {
    const desc = [...ownResultsSameComp].reverse().slice(0, FIRST_WIN_LOOKBACK);
    let n = 0;
    let found = false;
    for (const r of desc) {
      if (r === "win") { found = true; break; }
      n++;
    }
    if (found && n >= 1) matchesSinceLastWinSameCompetition = n + 1;
    else if (!found) previousWinSearchExhausted = true;
  }

  const sameCompetitionStreak = buildStreaks(
    ownResultsSameComp,
    targetResult,
    `${targetMatch.competitionName || "同一大会"}${targetSeason ? ` ${targetSeason}` : ""}`
  );

  let officialStreak: StreakContext | null = null;
  if (isOfficial) {
    const ownOfficialBefore = allOwnPastMatches
      .filter(
        (m) =>
          m.competitionId !== "friendly" &&
          m.competitionId !== "practice" &&
          sameSeason(m) &&
          isFinished(m) &&
          beforeTarget(m)
      )
      .sort((a, b) => getMatchSortMs(a) - getMatchSortMs(b));

    const officialResults: Result[] = ownOfficialBefore
      .map((m) => getResultForTeam(m, mainTeamId))
      .filter((r): r is Result => r !== null);

    if (!areResultArraysEqual(officialResults, ownResultsSameComp)) {
      officialStreak = buildStreaks(
        officialResults,
        targetResult,
        `公式戦${targetSeason ? ` ${targetSeason}` : ""}`
      );
    }
  }

  const table = isOfficial
    ? buildTable(
        allSameCompBefore,
        mainTeamId,
        opponentId,
        targetMatch.competitionName || "大会",
        targetSeason
      )
    : null;

  const headToHead: HeadToHeadContext[] = allSameCompBefore
    .filter(
      (m) =>
        (m.homeTeam === mainTeamId && m.awayTeam === opponentId) ||
        (m.homeTeam === opponentId && m.awayTeam === mainTeamId)
    )
    .sort((a, b) => getMatchSortMs(b) - getMatchSortMs(a))
    .slice(0, 3)
    .map((m) => ({
      match: m,
      result: getResultForTeam(m, mainTeamId)!,
      score: getScoreString(m, mainTeamId),
    }));

  return {
    clubName,
    selfTeamId: mainTeamId,
    selfTeamName,
    opponentTeamId: opponentId,
    opponentTeamName,
    selfIsHome,
    selfScore,
    opponentScore,
    selfResult: targetResult,
    recent5SameCompetition,
    matchesSinceLastWinSameCompetition,
    previousWinSearchExhausted,
    sameCompetitionStreak,
    officialStreak,
    table,
    headToHead,
  };
}
