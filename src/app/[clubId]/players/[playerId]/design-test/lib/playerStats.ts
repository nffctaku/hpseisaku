import { db } from "@/lib/firebase/admin";
import { unstable_cache } from "next/cache";

import { expandSeasonVariants, getSeasonDataEntry, toSlashSeason } from "./season";
import type { SimplePlayerStats, SeasonCompetitionStatsRow, PlayerSeasonSummaryRow, SeasonCompetitionBreakdownRow } from "./types";
import { PlayerSeasonBreakdownRow } from "./types";
import { buildManualStatsMapFromPlayer, buildManualStatsMapBySeason } from "./manualStats";

export type { SimplePlayerStats, SeasonCompetitionStatsRow, PlayerSeasonSummaryRow, SeasonCompetitionBreakdownRow, PlayerSeasonBreakdownRow } from "./types";

type CompetitionMeta = {
  id: string;
  name: string;
  logoUrl?: string;
  season: string;
  format?: string;
};

type PlayerMatchRecord = {
  competitionId: string;
  roundId: string;
  roundName?: string;
  matchId: string;
  matchDate?: string;
  minutesPlayed: number;
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
  rating: number;
  isBench: boolean;
};

async function fetchAllPlayerMatchRecords(
  ownerUid: string,
  playerId: string
): Promise<{ competitions: CompetitionMeta[]; matches: PlayerMatchRecord[] }> {
  if (!ownerUid) return { competitions: [], matches: [] };

  const competitionsSnap = await db.collection(`clubs/${ownerUid}/competitions`).get();

  const competitions: CompetitionMeta[] = [];
  const matches: PlayerMatchRecord[] = [];

  await Promise.all(
    competitionsSnap.docs.map(async (compDoc) => {
      const compData = compDoc.data() as any;
      const compSeasonRaw = typeof compData?.season === "string" ? String(compData.season).trim() : "";
      if (!compSeasonRaw) return;

      const compSeason = toSlashSeason(compSeasonRaw);
      const name =
        typeof compData?.name === "string" && compData.name.trim().length > 0 ? compData.name : compDoc.id;
      const logoUrl = typeof compData?.logoUrl === "string" ? compData.logoUrl : undefined;
      const format = typeof compData?.format === "string" ? compData.format : undefined;

      competitions.push({ id: compDoc.id, name, logoUrl, season: compSeason, format });

      const roundsSnap = await compDoc.ref.collection("rounds").get();
      const matchesByRound = await Promise.all(
        roundsSnap.docs.map(async (roundDoc) => {
          const roundData = roundDoc.data() as any;
          const roundName =
            typeof roundData?.name === "string" && roundData.name.trim().length > 0 ? roundData.name : roundDoc.id;
          const matchesSnap = await roundDoc.ref.collection("matches").get();
          return matchesSnap.docs.map((matchDoc) => ({ matchDoc, roundId: roundDoc.id, roundName }));
        })
      );

      for (const { matchDoc, roundId, roundName } of matchesByRound.flat()) {
        const m = matchDoc.data() as any;
        const ps = Array.isArray(m?.playerStats) ? (m.playerStats as any[]) : [];
        const stat = ps.find((s: any) => s?.playerId === playerId);
        if (!stat) continue;

        const minutesPlayed = Number(stat.minutesPlayed) || 0;
        const goals = Number(stat.goals) || 0;
        const assists = Number(stat.assists) || 0;
        const yellowCards = Number(stat.yellowCards) || 0;
        const redCards = Number(stat.redCards) || 0;
        const rating = Number(stat.rating);
        const role = typeof stat?.role === "string" ? String(stat.role) : "";
        const isBench = Boolean(role) && role !== "starter" && minutesPlayed === 0;

        matches.push({
          competitionId: compDoc.id,
          roundId,
          roundName,
          matchId: matchDoc.id,
          matchDate: typeof m?.matchDate === "string" ? m.matchDate : undefined,
          minutesPlayed,
          goals,
          assists,
          yellowCards,
          redCards,
          rating: Number.isFinite(rating) && rating > 0 ? rating : 0,
          isBench,
        });
      }
    })
  );

  return { competitions, matches };
}

export const getAllPlayerMatchRecords = unstable_cache(fetchAllPlayerMatchRecords, [
  "design-test-player-match-records",
]);

function matchesByCompetition(matches: PlayerMatchRecord[]): Map<string, PlayerMatchRecord[]> {
  const map = new Map<string, PlayerMatchRecord[]>();
  for (const m of matches) {
    const arr = map.get(m.competitionId);
    if (arr) {
      arr.push(m);
    } else {
      map.set(m.competitionId, [m]);
    }
  }
  return map;
}

function seasonMatches(targetSeasonSet: Set<string> | null, competitionSeason: string): boolean {
  if (!targetSeasonSet) return true;
  const variants = new Set(expandSeasonVariants(competitionSeason));
  for (const v of variants) {
    if (targetSeasonSet.has(v)) return true;
  }
  return false;
}

export async function getLeagueCompetitionLabel(
  ownerUid: string,
  playerId: string,
  targetSeason?: string | null
): Promise<string | null> {
  if (!ownerUid || !playerId) return null;

  const { competitions } = await getAllPlayerMatchRecords(ownerUid, playerId);

  const targetSeasonSet = (() => {
    const raw = typeof targetSeason === "string" ? targetSeason.trim() : "";
    if (!raw) return null;
    return new Set(expandSeasonVariants(raw));
  })();

  const names: string[] = [];
  for (const c of competitions) {
    if (c.format !== "league" && c.format !== "league_cup") continue;
    if (targetSeasonSet && !seasonMatches(targetSeasonSet, c.season)) continue;
    names.push(c.name);
  }

  const uniq = Array.from(new Set(names));
  if (uniq.length === 0) return null;
  if (uniq.length === 1) return uniq[0];
  return uniq.join(" / ");
}

export type PlayerMatchRow = {
  matchId: string;
  competitionId: string;
  competitionName: string;
  competitionLogoUrl?: string;
  season?: string;
  roundId: string;
  roundName?: string;
  matchDate: string;
  matchTime?: string;
  homeTeamName: string;
  awayTeamName: string;
  opponentName: string;
  opponentLogoUrl?: string;
  ha: "(H)" | "(A)" | "(-)";
  scoreHome?: number | null;
  scoreAway?: number | null;
  minutesPlayed: number | null;
  isBench?: boolean;
  rating?: number | null;
  goals: number | null;
  assists: number | null;
};

function squadListHasPlayerId(list: any[], playerId: string): boolean {
  if (!Array.isArray(list) || !playerId) return false;
  for (const item of list) {
    if (typeof item === "string") {
      if (item === playerId) return true;
      continue;
    }
    if (item && typeof item === "object") {
      const direct =
        (typeof (item as any).playerId === "string" && (item as any).playerId) ||
        (typeof (item as any).id === "string" && (item as any).id) ||
        (typeof (item as any).uid === "string" && (item as any).uid) ||
        (typeof (item as any).player === "string" && (item as any).player) ||
        "";
      if (direct === playerId) return true;

      const nestedPlayer = (item as any).player;
      if (nestedPlayer && typeof nestedPlayer === "object") {
        const nested =
          (typeof (nestedPlayer as any).playerId === "string" && (nestedPlayer as any).playerId) ||
          (typeof (nestedPlayer as any).id === "string" && (nestedPlayer as any).id) ||
          (typeof (nestedPlayer as any).uid === "string" && (nestedPlayer as any).uid) ||
          "";
        if (nested === playerId) return true;
      }
    }
  }
  return false;
}

export async function getLeaguePlayerStats(
  ownerUid: string,
  playerId: string,
  playerData: any,
  targetSeason?: string | null
): Promise<SimplePlayerStats> {
  const aggregated: SimplePlayerStats = { appearances: 0, minutes: 0, goals: 0, assists: 0 };

  if (!ownerUid || !playerId) return aggregated;

  const { competitions, matches } = await getAllPlayerMatchRecords(ownerUid, playerId);

  const targetSeasonSet = (() => {
    const raw = typeof targetSeason === "string" ? targetSeason.trim() : "";
    if (!raw) return null;
    return new Set(expandSeasonVariants(raw));
  })();

  const manualStatsMap = buildManualStatsMapFromPlayer(playerData, targetSeason);
  const matchesMap = matchesByCompetition(matches);

  for (const c of competitions) {
    if (c.format !== "league" && c.format !== "league_cup") continue;
    if (targetSeason && !seasonMatches(targetSeasonSet, c.season)) continue;

    const manual = manualStatsMap.get(c.id);
    if (manual) {
      aggregated.appearances += Number.isFinite(manual.matches as any) ? Number(manual.matches) : 0;
      aggregated.minutes += Number.isFinite(manual.minutes as any) ? Number(manual.minutes) : 0;
      aggregated.goals += Number.isFinite(manual.goals as any) ? Number(manual.goals) : 0;
      aggregated.assists += Number.isFinite(manual.assists as any) ? Number(manual.assists) : 0;
      continue;
    }

    const compMatches = matchesMap.get(c.id) || [];
    for (const r of compMatches) {
      if (r.isBench) continue;
      aggregated.minutes += r.minutesPlayed;
      aggregated.appearances += r.minutesPlayed > 0 ? 1 : 0;
      aggregated.goals += r.goals;
      aggregated.assists += r.assists;
    }
  }

  return aggregated;
}

export async function getSeasonCompetitionStats(
  ownerUid: string,
  playerId: string,
  playerData: any,
  targetSeason?: string | null
): Promise<SeasonCompetitionStatsRow[]> {
  if (!ownerUid || !playerId) return [];

  const { competitions, matches } = await getAllPlayerMatchRecords(ownerUid, playerId);

  const targetSeasonSet = (() => {
    const raw = typeof targetSeason === "string" ? targetSeason.trim() : "";
    if (!raw) return null;
    return new Set(expandSeasonVariants(raw));
  })();

  const manualStatsMap = buildManualStatsMapFromPlayer(playerData, targetSeason);
  const matchesMap = matchesByCompetition(matches);

  const rows: SeasonCompetitionStatsRow[] = [];
  for (const c of competitions) {
    if (targetSeasonSet && !seasonMatches(targetSeasonSet, c.season)) continue;

    const stats: SimplePlayerStats = { appearances: 0, minutes: 0, goals: 0, assists: 0 };
    const manual = manualStatsMap.get(c.id);

    if (manual) {
      stats.appearances = Number.isFinite(manual.matches as any) ? Number(manual.matches) : 0;
      stats.minutes = Number.isFinite(manual.minutes as any) ? Number(manual.minutes) : 0;
      stats.goals = Number.isFinite(manual.goals as any) ? Number(manual.goals) : 0;
      stats.assists = Number.isFinite(manual.assists as any) ? Number(manual.assists) : 0;
    } else {
      const compMatches = matchesMap.get(c.id) || [];
      for (const r of compMatches) {
        stats.minutes += r.minutesPlayed;
        stats.appearances += r.minutesPlayed > 0 ? 1 : 0;
        stats.goals += r.goals;
        stats.assists += r.assists;
      }
    }

    const hasAny = stats.appearances > 0 || stats.goals > 0 || stats.assists > 0 || stats.minutes > 0;
    if (!hasAny) continue;

    rows.push({
      competitionId: c.id,
      competitionName: c.name,
      competitionLogoUrl: c.logoUrl,
      format: c.format,
      stats,
    });
  }

  rows.sort((a, b) => a.competitionName.localeCompare(b.competitionName, "ja"));
  return rows;
}

export async function getPlayerSeasonSummaries(
  ownerUid: string,
  playerId: string,
  playerData: any,
  targetSeason?: string | null
): Promise<PlayerSeasonSummaryRow[]> {
  if (!ownerUid) return [];

  const seasonData = playerData?.seasonData && typeof playerData.seasonData === "object" ? (playerData.seasonData as any) : {};

  const manualStatsMap = buildManualStatsMapFromPlayer(playerData, targetSeason);
  const formats = ["league", "league_cup"];
  const compsSnap = await db.collection(`clubs/${ownerUid}/competitions`).where("format", "in", formats as any).get();

  const seasonAgg = new Map<string, SimplePlayerStats>();
  const getAgg = (season: string) => {
    if (!seasonAgg.has(season)) seasonAgg.set(season, { appearances: 0, minutes: 0, goals: 0, assists: 0 });
    return seasonAgg.get(season)!;
  };

  for (const compDoc of compsSnap.docs) {
    const compData = compDoc.data() as any;
    const compSeasonRaw = typeof compData?.season === "string" ? String(compData.season).trim() : "";
    if (!compSeasonRaw) continue;
    const compSeason = toSlashSeason(compSeasonRaw);

    const manual = manualStatsMap.get(compDoc.id);
    const agg = getAgg(compSeason);

    const roundsSnap = await compDoc.ref.collection("rounds").get();
    const matchesByRound = await Promise.all(
      roundsSnap.docs.map(async (roundDoc) => {
        const matchesSnap = await roundDoc.ref.collection("matches").get();
        return matchesSnap.docs.map((d) => d.data());
      })
    );

    for (const matchData of matchesByRound.flat()) {
      if (!matchData?.playerStats || !Array.isArray(matchData.playerStats)) continue;
      const playerStat = matchData.playerStats.find((stat: any) => stat?.playerId === playerId);
      if (!playerStat) continue;

      const minutesPlayed = Number(playerStat.minutesPlayed) || 0;
      const goals = Number(playerStat.goals) || 0;
      const assists = Number(playerStat.assists) || 0;

      if (!manual) {
        agg.minutes += minutesPlayed;
        agg.appearances += minutesPlayed > 0 ? 1 : 0;
        agg.goals += goals;
        agg.assists += assists;
      }
    }

    if (manual) {
      agg.appearances += Number.isFinite(manual.matches as any) ? Number(manual.matches) : 0;
      agg.minutes += Number.isFinite(manual.minutes as any) ? Number(manual.minutes) : 0;
      agg.goals += Number.isFinite(manual.goals as any) ? Number(manual.goals) : 0;
      agg.assists += Number.isFinite(manual.assists as any) ? Number(manual.assists) : 0;
    }
  }

  const rows: PlayerSeasonSummaryRow[] = Array.from(seasonAgg.keys())
    .map((season) => ({ season, stats: seasonAgg.get(season) || { appearances: 0, minutes: 0, goals: 0, assists: 0 } }))
    .filter((r) => r.stats.appearances > 0 || r.stats.goals > 0 || r.stats.assists > 0 || r.stats.minutes > 0);

  rows.sort((a, b) => b.season.localeCompare(a.season));
  return rows;
}

export async function getPlayerSeasonBreakdowns(
  ownerUid: string,
  playerId: string,
  playerData: any,
  targetSeason?: string | null
): Promise<PlayerSeasonBreakdownRow[]> {
  if (!ownerUid || !playerId) return [];

  const { competitions, matches } = await getAllPlayerMatchRecords(ownerUid, playerId);

  const manualStatsMap = buildManualStatsMapFromPlayer(playerData, targetSeason);
  const matchesMap = matchesByCompetition(matches);

  const seasonMap = new Map<string, { total: SimplePlayerStats; competitions: Map<string, SeasonCompetitionBreakdownRow> }>();
  const getSeasonEntry = (season: string) => {
    if (!seasonMap.has(season)) {
      seasonMap.set(season, {
        total: { appearances: 0, minutes: 0, goals: 0, assists: 0 },
        competitions: new Map(),
      });
    }
    return seasonMap.get(season)!;
  };

  const addToTotals = (total: SimplePlayerStats, s: SimplePlayerStats) => {
    total.appearances += s.appearances;
    total.minutes += s.minutes;
    total.goals += s.goals;
    total.assists += s.assists;
  };

  for (const c of competitions) {
    if (c.format !== "league" && c.format !== "league_cup") continue;
    if (!c.season) continue;

    const seasonEntry = getSeasonEntry(c.season);

    const ensureComp = () => {
      if (!seasonEntry.competitions.has(c.id)) {
        seasonEntry.competitions.set(c.id, {
          competitionId: c.id,
          competitionName: c.name,
          competitionLogoUrl: c.logoUrl,
          format: c.format,
          stats: { appearances: 0, minutes: 0, goals: 0, assists: 0 },
        });
      }
      return seasonEntry.competitions.get(c.id)!;
    };

    const manual = manualStatsMap.get(c.id);
    const compRow = ensureComp();
    const compMatches = matchesMap.get(c.id) || [];

    if (manual) {
      compRow.stats.appearances = Number.isFinite(manual.matches as any) ? Number(manual.matches) : 0;
      compRow.stats.minutes = Number.isFinite(manual.minutes as any) ? Number(manual.minutes) : 0;
      compRow.stats.goals = Number.isFinite(manual.goals as any) ? Number(manual.goals) : 0;
      compRow.stats.assists = Number.isFinite(manual.assists as any) ? Number(manual.assists) : 0;
    } else {
      for (const r of compMatches) {
        compRow.stats.minutes += r.minutesPlayed;
        compRow.stats.appearances += r.minutesPlayed > 0 ? 1 : 0;
        compRow.stats.goals += r.goals;
        compRow.stats.assists += r.assists;
      }
    }

    addToTotals(seasonEntry.total, compRow.stats);
  }

  const rows: PlayerSeasonBreakdownRow[] = Array.from(seasonMap.keys())
    .map((season: string) => {
      const entry = seasonMap.get(season);
      const competitions = entry ? Array.from(entry.competitions.values()) : [];
      competitions.sort((a, b) => a.competitionName.localeCompare(b.competitionName, "ja"));
      return {
        season,
        total: entry ? entry.total : { appearances: 0, minutes: 0, goals: 0, assists: 0 },
        competitions,
      };
    })
    .filter(
      (r) =>
        r.total.appearances > 0 ||
        r.total.minutes > 0 ||
        r.total.goals > 0 ||
        r.total.assists > 0 ||
        r.competitions.length > 0
    );

  rows.sort((a, b) => b.season.localeCompare(a.season));
  return rows;
}

export async function getPlayerMatchResults(
  ownerUid: string,
  playerId: string,
  targetSeason?: string | null
): Promise<PlayerMatchRow[]> {
  if (!ownerUid) return [];

  const targetSeasonSet = (() => {
    const raw = typeof targetSeason === "string" ? targetSeason.trim() : "";
    if (!raw) return null;
    return new Set(expandSeasonVariants(raw));
  })();

  const teamsSnap = await db.collection(`clubs/${ownerUid}/teams`).get();
  const teamNameMap = new Map<string, string>();
  const teamLogoUrlMap = new Map<string, string>();
  for (const doc of teamsSnap.docs) {
    const d = doc.data() as any;
    teamNameMap.set(doc.id, typeof d?.name === "string" ? d.name : doc.id);
    if (typeof d?.logoUrl === "string" && d.logoUrl.trim().length > 0) {
      teamLogoUrlMap.set(doc.id, d.logoUrl);
    }
  }

  const compsSnap = await db.collection(`clubs/${ownerUid}/competitions`).get();
  const rows: PlayerMatchRow[] = [];

  for (const compDoc of compsSnap.docs) {
    const compData = compDoc.data() as any;
    const compSeasonRaw = typeof compData?.season === "string" ? String(compData.season).trim() : "";
    if (targetSeasonSet) {
      const variants = expandSeasonVariants(compSeasonRaw);
      const match = variants.some((v) => targetSeasonSet.has(v));
      if (!match) continue;
    }

    const compName = typeof compData?.name === "string" && compData.name.trim().length > 0 ? compData.name : compDoc.id;
    const compLogoUrl = typeof compData?.logoUrl === "string" ? compData.logoUrl : undefined;

    const roundsSnap = await compDoc.ref.collection("rounds").get();
    for (const roundDoc of roundsSnap.docs) {
      const roundData = roundDoc.data() as any;
      const roundName = typeof roundData?.name === "string" && roundData.name.trim().length > 0 ? roundData.name : roundDoc.id;
      const matchesSnap = await roundDoc.ref.collection("matches").get();
      for (const matchDoc of matchesSnap.docs) {
        const m = matchDoc.data() as any;
        const ps = Array.isArray(m?.playerStats) ? (m.playerStats as any[]) : [];
        const stat = ps.find((s) => s?.playerId === playerId);
        const events = Array.isArray(m?.events) ? (m.events as any[]) : [];
        const playerEvents = events.filter((e) => e?.playerId === playerId || e?.assistPlayerId === playerId);
        const eventGoals = playerEvents.filter((e) => e?.type === "goal" && e?.playerId === playerId).length;
        const eventAssists = playerEvents.filter((e) => e?.type === "goal" && e?.assistPlayerId === playerId).length;

        const homeTeamId = typeof m?.homeTeam === "string" ? m.homeTeam : "";
        const awayTeamId = typeof m?.awayTeam === "string" ? m.awayTeam : "";
        const homeTeamName = (typeof m?.homeTeamName === "string" && m.homeTeamName) || teamNameMap.get(homeTeamId) || "-";
        const awayTeamName = (typeof m?.awayTeamName === "string" && m.awayTeamName) || teamNameMap.get(awayTeamId) || "-";

        const homeSubs = Array.isArray(m?.homeSquad?.substitutes) ? (m.homeSquad.substitutes as any[]) : [];
        const awaySubs = Array.isArray(m?.awaySquad?.substitutes) ? (m.awaySquad.substitutes as any[]) : [];
        const isBenchHome = squadListHasPlayerId(homeSubs, playerId);
        const isBenchAway = squadListHasPlayerId(awaySubs, playerId);
        const isBenchRegistered = isBenchHome || isBenchAway;

        if (!stat && !isBenchRegistered && playerEvents.length === 0) continue;

        const eventTeamId = typeof playerEvents[0]?.teamId === "string" ? playerEvents[0].teamId : "";
        const playerTeamId = typeof stat?.teamId === "string" ? stat.teamId : eventTeamId;
        const isHome = Boolean(playerTeamId) ? playerTeamId === homeTeamId : isBenchHome;
        const isAway = Boolean(playerTeamId) ? playerTeamId === awayTeamId : isBenchAway;
        const opponentName = isHome ? awayTeamName : isAway ? homeTeamName : awayTeamName;
        const opponentTeamId = isHome ? awayTeamId : isAway ? homeTeamId : "";
        const opponentLogoUrl = opponentTeamId ? teamLogoUrlMap.get(opponentTeamId) : undefined;
        const ha: "(H)" | "(A)" | "(-)" = isHome ? "(H)" : isAway ? "(A)" : "(-)";

        const matchDate = typeof m?.matchDate === "string" ? m.matchDate : "";
        const matchTime = typeof m?.matchTime === "string" ? m.matchTime : undefined;
        const scoreHome = typeof m?.scoreHome === "number" ? m.scoreHome : (m?.scoreHome ?? null);
        const scoreAway = typeof m?.scoreAway === "number" ? m.scoreAway : (m?.scoreAway ?? null);

        const minutesPlayed = stat?.minutesPlayed == null ? null : Number(stat.minutesPlayed);
        const goals = stat?.goals == null ? (eventGoals > 0 ? eventGoals : null) : Number(stat.goals);
        const assists = stat?.assists == null ? (eventAssists > 0 ? eventAssists : null) : Number(stat.assists);

        const minutesPlayedNum = Number.isFinite(minutesPlayed) ? (minutesPlayed as number) : null;
        const didPlay = (minutesPlayedNum ?? 0) > 0;
        const role = typeof stat?.role === "string" ? String(stat.role) : "";
        const isBenchByRole = Boolean(role) && role !== "starter" && !didPlay;
        const isBench = (isBenchRegistered || isBenchByRole) && !didPlay;

        rows.push({
          matchId: matchDoc.id,
          competitionId: compDoc.id,
          competitionName: compName,
          competitionLogoUrl: compLogoUrl,
          season: compSeasonRaw || undefined,
          roundId: roundDoc.id,
          roundName,
          matchDate,
          matchTime,
          homeTeamName,
          awayTeamName,
          opponentName,
          opponentLogoUrl,
          ha,
          scoreHome,
          scoreAway,
          minutesPlayed: minutesPlayedNum,
          isBench: isBench ? true : undefined,
          rating: typeof stat?.rating === "number" && Number.isFinite(stat.rating) ? stat.rating : null,
          goals: Number.isFinite(goals) ? goals : null,
          assists: Number.isFinite(assists) ? assists : null,
        });
      }
    }
  }

  const toMs = (d: string): number => {
    const raw = typeof d === "string" ? d.trim() : "";
    if (!raw) return 0;
    const ms = Date.parse(raw);
    if (Number.isFinite(ms)) return ms;
    return 0;
  };

  rows.sort((a, b) => toMs(b.matchDate) - toMs(a.matchDate));
  return rows;
}