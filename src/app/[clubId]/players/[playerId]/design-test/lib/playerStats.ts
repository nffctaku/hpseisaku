import { db } from "@/lib/firebase/admin";

import { expandSeasonVariants, getSeasonDataEntry, toSlashSeason } from "./season";

type SimplePlayerStats = {
  appearances: number;
  minutes: number;
  goals: number;
  assists: number;
};

export type SeasonCompetitionStatsRow = {
  competitionId: string;
  competitionName: string;
  competitionLogoUrl?: string;
  format?: string;
  stats: SimplePlayerStats;
};

export type PlayerSeasonSummaryRow = {
  season: string;
  stats: SimplePlayerStats;
};

export type SeasonCompetitionBreakdownRow = {
  competitionId: string;
  competitionName: string;
  competitionLogoUrl?: string;
  format?: string;
  stats: SimplePlayerStats;
};

export type PlayerSeasonBreakdownRow = {
  season: string;
  total: SimplePlayerStats;
  competitions: SeasonCompetitionBreakdownRow[];
};

export async function getLeagueCompetitionLabel(
  ownerUid: string,
  targetSeason?: string | null
): Promise<string | null> {
  if (!ownerUid) return null;
  const formats = ["league", "league_cup"];
  const compsSnap = await db.collection(`clubs/${ownerUid}/competitions`).where("format", "in", formats as any).get();

  const targetSeasonSet = (() => {
    const raw = typeof targetSeason === "string" ? targetSeason.trim() : "";
    if (!raw) return null;
    return new Set(expandSeasonVariants(raw));
  })();

  const names: string[] = [];
  for (const competitionDoc of compsSnap.docs) {
    const competitionData = competitionDoc.data() as any;
    const compSeasonRaw = typeof competitionData?.season === "string" ? String(competitionData.season).trim() : "";

    if (targetSeasonSet) {
      const variants = expandSeasonVariants(compSeasonRaw);
      const match = variants.some((v) => targetSeasonSet.has(v));
      if (!match) continue;
    }

    const compName = typeof competitionData?.name === "string" && competitionData.name.trim().length > 0 ? competitionData.name : competitionDoc.id;
    names.push(compName);
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

function buildManualStatsMapFromPlayer(playerData: any, targetSeason?: string | null) {
  const manualStatsMap = new Map<string, { matches?: number; minutes?: number; goals?: number; assists?: number }>();
  if (!playerData || typeof playerData !== "object") return manualStatsMap;

  const seasonData = playerData?.seasonData && typeof playerData.seasonData === "object" ? (playerData.seasonData as any) : {};
  const selectedSeasonKey = typeof targetSeason === "string" && targetSeason.trim().length > 0 ? targetSeason.trim() : null;

  const addRows = (rows: any[]) => {
    for (const r of rows) {
      if (r && typeof r.competitionId === "string" && r.competitionId.trim().length > 0) {
        manualStatsMap.set(r.competitionId, {
          matches: typeof r.matches === "number" ? r.matches : undefined,
          minutes: typeof r.minutes === "number" ? r.minutes : undefined,
          goals: typeof r.goals === "number" ? r.goals : undefined,
          assists: typeof r.assists === "number" ? r.assists : undefined,
        });
      }
    }
  };

  if (selectedSeasonKey) {
    const sd = getSeasonDataEntry(seasonData, selectedSeasonKey);
    const rows = Array.isArray((sd as any)?.manualCompetitionStats) ? ((sd as any).manualCompetitionStats as any[]) : [];
    addRows(rows);
  } else {
    for (const sd of Object.values(seasonData)) {
      const rows = Array.isArray((sd as any)?.manualCompetitionStats) ? ((sd as any).manualCompetitionStats as any[]) : [];
      addRows(rows);
    }
  }

  const legacyRows = Array.isArray(playerData?.manualCompetitionStats) ? (playerData.manualCompetitionStats as any[]) : [];
  for (const r of legacyRows) {
    if (r && typeof r.competitionId === "string" && r.competitionId.trim().length > 0) {
      if (manualStatsMap.has(r.competitionId)) continue;
      manualStatsMap.set(r.competitionId, {
        matches: typeof r.matches === "number" ? r.matches : undefined,
        minutes: typeof r.minutes === "number" ? r.minutes : undefined,
        goals: typeof r.goals === "number" ? r.goals : undefined,
        assists: typeof r.assists === "number" ? r.assists : undefined,
      });
    }
  }

  return manualStatsMap;
}

function buildManualStatsMapBySeason(playerData: any): Map<string, Map<string, SimplePlayerStats>> {
  const out = new Map<string, Map<string, SimplePlayerStats>>();
  if (!playerData || typeof playerData !== "object") return out;

  const seasonData = playerData?.seasonData && typeof playerData.seasonData === "object" ? (playerData.seasonData as any) : {};
  for (const [seasonKey, entry] of Object.entries(seasonData)) {
    const seasonId = toSlashSeason(String(seasonKey || "").trim());
    if (!seasonId) continue;
    const rows = Array.isArray((entry as any)?.manualCompetitionStats) ? (((entry as any).manualCompetitionStats as any[]) ?? []) : [];
    if (!out.has(seasonId)) out.set(seasonId, new Map());
    const m = out.get(seasonId)!;
    for (const r of rows) {
      if (r && typeof (r as any).competitionId === "string" && String((r as any).competitionId).trim().length > 0) {
        const competitionId = String((r as any).competitionId).trim();
        m.set(competitionId, {
          appearances: Number.isFinite((r as any).matches) ? Number((r as any).matches) : 0,
          minutes: Number.isFinite((r as any).minutes) ? Number((r as any).minutes) : 0,
          goals: Number.isFinite((r as any).goals) ? Number((r as any).goals) : 0,
          assists: Number.isFinite((r as any).assists) ? Number((r as any).assists) : 0,
        });
      }
    }
  }

  const legacyRows = Array.isArray(playerData?.manualCompetitionStats) ? (playerData.manualCompetitionStats as any[]) : [];
  if (legacyRows.length > 0) {
    const fallbackSeason = (() => {
      const sd = playerData?.seasonData && typeof playerData.seasonData === "object" ? (playerData.seasonData as any) : {};
      const keys = Object.keys(sd).map((k) => toSlashSeason(String(k || "").trim())).filter(Boolean);
      keys.sort((a, b) => b.localeCompare(a));
      return keys[0] || "";
    })();
    if (fallbackSeason) {
      if (!out.has(fallbackSeason)) out.set(fallbackSeason, new Map());
      const m = out.get(fallbackSeason)!;
      for (const r of legacyRows) {
        if (r && typeof (r as any).competitionId === "string" && String((r as any).competitionId).trim().length > 0) {
          const competitionId = String((r as any).competitionId).trim();
          if (m.has(competitionId)) continue;
          m.set(competitionId, {
            appearances: Number.isFinite((r as any).matches) ? Number((r as any).matches) : 0,
            minutes: Number.isFinite((r as any).minutes) ? Number((r as any).minutes) : 0,
            goals: Number.isFinite((r as any).goals) ? Number((r as any).goals) : 0,
            assists: Number.isFinite((r as any).assists) ? Number((r as any).assists) : 0,
          });
        }
      }
    }
  }

  return out;
}

export async function getLeaguePlayerStats(
  ownerUid: string,
  playerId: string,
  playerData: any,
  targetSeason?: string | null
): Promise<SimplePlayerStats> {
  const aggregated: SimplePlayerStats = { appearances: 0, minutes: 0, goals: 0, assists: 0 };

  const formats = ["league", "league_cup"];
  const compsSnap = await db.collection(`clubs/${ownerUid}/competitions`).where("format", "in", formats as any).get();

  const targetSeasonSet = (() => {
    const raw = typeof targetSeason === "string" ? targetSeason.trim() : "";
    if (!raw) return null;
    return new Set(expandSeasonVariants(raw));
  })();

  const manualStatsMap = buildManualStatsMapFromPlayer(playerData, targetSeason);

  for (const competitionDoc of compsSnap.docs) {
    const competitionData = competitionDoc.data() as any;
    const compSeasonRaw = typeof competitionData?.season === "string" ? String(competitionData.season).trim() : "";

    if (targetSeasonSet) {
      const variants = expandSeasonVariants(compSeasonRaw);
      const match = variants.some((v) => targetSeasonSet.has(v));
      if (!match) continue;
    }

    const manual = manualStatsMap.get(competitionDoc.id);

    if (manual) {
      aggregated.appearances += Number.isFinite(manual.matches as any) ? Number(manual.matches) : 0;
      aggregated.minutes += Number.isFinite(manual.minutes as any) ? Number(manual.minutes) : 0;
      aggregated.goals += Number.isFinite(manual.goals as any) ? Number(manual.goals) : 0;
      aggregated.assists += Number.isFinite(manual.assists as any) ? Number(manual.assists) : 0;
      continue;
    }

    const roundsSnap = await competitionDoc.ref.collection("rounds").get();
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
      aggregated.minutes += minutesPlayed;
      aggregated.appearances += minutesPlayed > 0 ? 1 : 0;
      aggregated.goals += Number(playerStat.goals) || 0;
      aggregated.assists += Number(playerStat.assists) || 0;
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
  if (!ownerUid) return [];

  const targetSeasonSet = (() => {
    const raw = typeof targetSeason === "string" ? targetSeason.trim() : "";
    if (!raw) return null;
    return new Set(expandSeasonVariants(raw));
  })();

  const manualStatsMap = buildManualStatsMapFromPlayer(playerData, targetSeason);
  const compsSnap = await db.collection(`clubs/${ownerUid}/competitions`).get();

  const rows: SeasonCompetitionStatsRow[] = [];
  for (const competitionDoc of compsSnap.docs) {
    const competitionData = competitionDoc.data() as any;
    const compSeasonRaw = typeof competitionData?.season === "string" ? String(competitionData.season).trim() : "";

    if (targetSeasonSet) {
      const variants = expandSeasonVariants(compSeasonRaw);
      const match = variants.some((v) => targetSeasonSet.has(v));
      if (!match) continue;
    }

    const competitionName =
      typeof competitionData?.name === "string" && competitionData.name.trim().length > 0
        ? competitionData.name
        : competitionDoc.id;
    const competitionLogoUrl = typeof competitionData?.logoUrl === "string" ? competitionData.logoUrl : undefined;
    const format = typeof competitionData?.format === "string" ? competitionData.format : undefined;

    const stats: SimplePlayerStats = { appearances: 0, minutes: 0, goals: 0, assists: 0 };
    const manual = manualStatsMap.get(competitionDoc.id);

    if (manual) {
      stats.appearances = Number.isFinite(manual.matches as any) ? Number(manual.matches) : 0;
      stats.minutes = Number.isFinite(manual.minutes as any) ? Number(manual.minutes) : 0;
      stats.goals = Number.isFinite(manual.goals as any) ? Number(manual.goals) : 0;
      stats.assists = Number.isFinite(manual.assists as any) ? Number(manual.assists) : 0;
    } else {
      const roundsSnap = await competitionDoc.ref.collection("rounds").get();
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
        stats.minutes += minutesPlayed;
        stats.appearances += minutesPlayed > 0 ? 1 : 0;
        stats.goals += Number(playerStat.goals) || 0;
        stats.assists += Number(playerStat.assists) || 0;
      }
    }

    const hasAny = stats.appearances > 0 || stats.goals > 0 || stats.assists > 0 || stats.minutes > 0;
    if (!hasAny) continue;

    rows.push({
      competitionId: competitionDoc.id,
      competitionName,
      competitionLogoUrl,
      format,
      stats,
    });
  }

  rows.sort((a, b) => a.competitionName.localeCompare(b.competitionName, "ja"));
  return rows;
}

export async function getPlayerSeasonSummaries(
  ownerUid: string,
  playerId: string,
  playerData: any
): Promise<PlayerSeasonSummaryRow[]> {
  if (!ownerUid) return [];

  const seasonData = playerData?.seasonData && typeof playerData.seasonData === "object" ? (playerData.seasonData as any) : {};
  const registeredSeasons = Object.keys(seasonData).map((k) => toSlashSeason(String(k || "").trim())).filter(Boolean);
  if (registeredSeasons.length === 0) return [];

  const manualBySeason = buildManualStatsMapBySeason(playerData);
  const compsSnap = await db.collection(`clubs/${ownerUid}/competitions`).get();

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
    if (!registeredSeasons.includes(compSeason)) continue;

    const manual = manualBySeason.get(compSeason)?.get(compDoc.id);
    if (manual) {
      const agg = getAgg(compSeason);
      agg.appearances += manual.appearances;
      agg.minutes += manual.minutes;
      agg.goals += manual.goals;
      agg.assists += manual.assists;
      continue;
    }

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

      const agg = getAgg(compSeason);
      agg.minutes += minutesPlayed;
      agg.appearances += minutesPlayed > 0 ? 1 : 0;
      agg.goals += goals;
      agg.assists += assists;
    }
  }

  const rows: PlayerSeasonSummaryRow[] = registeredSeasons
    .map((season) => ({ season, stats: seasonAgg.get(season) || { appearances: 0, minutes: 0, goals: 0, assists: 0 } }))
    .filter((r) => r.stats.appearances > 0 || r.stats.goals > 0 || r.stats.assists > 0 || r.stats.minutes > 0);

  rows.sort((a, b) => b.season.localeCompare(a.season));
  return rows;
}

export async function getPlayerSeasonBreakdowns(
  ownerUid: string,
  playerId: string,
  playerData: any
): Promise<PlayerSeasonBreakdownRow[]> {
  if (!ownerUid) return [];

  const seasonData = playerData?.seasonData && typeof playerData.seasonData === "object" ? (playerData.seasonData as any) : {};
  const registeredSeasons = Object.keys(seasonData).map((k) => toSlashSeason(String(k || "").trim())).filter(Boolean);
  if (registeredSeasons.length === 0) return [];

  const manualBySeason = buildManualStatsMapBySeason(playerData);
  const compsSnap = await db.collection(`clubs/${ownerUid}/competitions`).get();

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

  for (const compDoc of compsSnap.docs) {
    const compData = compDoc.data() as any;
    const compSeasonRaw = typeof compData?.season === "string" ? String(compData.season).trim() : "";
    if (!compSeasonRaw) continue;
    const compSeason = toSlashSeason(compSeasonRaw);
    if (!registeredSeasons.includes(compSeason)) continue;

    const competitionId = compDoc.id;
    const competitionName = typeof compData?.name === "string" && compData.name.trim().length > 0 ? compData.name : competitionId;
    const competitionLogoUrl = typeof compData?.logoUrl === "string" ? compData.logoUrl : undefined;
    const format = typeof compData?.format === "string" ? compData.format : undefined;

    const seasonEntry = getSeasonEntry(compSeason);

    const ensureComp = () => {
      if (!seasonEntry.competitions.has(competitionId)) {
        seasonEntry.competitions.set(competitionId, {
          competitionId,
          competitionName,
          competitionLogoUrl,
          format,
          stats: { appearances: 0, minutes: 0, goals: 0, assists: 0 },
        });
      }
      return seasonEntry.competitions.get(competitionId)!;
    };

    const manual = manualBySeason.get(compSeason)?.get(competitionId);
    if (manual) {
      const compRow = ensureComp();
      compRow.stats = { ...manual };
      addToTotals(seasonEntry.total, manual);
      continue;
    }

    const compRow = ensureComp();
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

      compRow.stats.minutes += minutesPlayed;
      compRow.stats.appearances += minutesPlayed > 0 ? 1 : 0;
      compRow.stats.goals += goals;
      compRow.stats.assists += assists;
    }

    addToTotals(seasonEntry.total, compRow.stats);
  }

  const rows: PlayerSeasonBreakdownRow[] = registeredSeasons
    .map((season) => {
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
      const matchesSnap = await roundDoc.ref.collection("matches").get();
      for (const matchDoc of matchesSnap.docs) {
        const m = matchDoc.data() as any;
        const ps = Array.isArray(m?.playerStats) ? (m.playerStats as any[]) : [];
        const stat = ps.find((s) => s?.playerId === playerId);

        const homeTeamId = typeof m?.homeTeam === "string" ? m.homeTeam : "";
        const awayTeamId = typeof m?.awayTeam === "string" ? m.awayTeam : "";
        const homeTeamName = (typeof m?.homeTeamName === "string" && m.homeTeamName) || teamNameMap.get(homeTeamId) || "-";
        const awayTeamName = (typeof m?.awayTeamName === "string" && m.awayTeamName) || teamNameMap.get(awayTeamId) || "-";

        const homeSubs = Array.isArray(m?.homeSquad?.substitutes) ? (m.homeSquad.substitutes as any[]) : [];
        const awaySubs = Array.isArray(m?.awaySquad?.substitutes) ? (m.awaySquad.substitutes as any[]) : [];
        const isBenchHome = squadListHasPlayerId(homeSubs, playerId);
        const isBenchAway = squadListHasPlayerId(awaySubs, playerId);
        const isBenchRegistered = isBenchHome || isBenchAway;

        if (!stat && !isBenchRegistered) continue;

        const playerTeamId = typeof stat?.teamId === "string" ? stat.teamId : "";
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
        const goals = stat?.goals == null ? null : Number(stat.goals);
        const assists = stat?.assists == null ? null : Number(stat.assists);

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
