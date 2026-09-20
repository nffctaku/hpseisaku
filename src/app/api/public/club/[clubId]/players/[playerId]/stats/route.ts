import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { db } from "@/lib/firebase/admin";

function toSlashSeason(season: string): string {
  if (!season) return season;
  if (season.includes("/")) {
    const parts = season.split("/");
    if (parts.length === 2 && /^\d{4}$/.test(parts[0])) {
      const end = parts[1];
      const end2 = /^\d{4}$/.test(end) ? end.slice(-2) : end;
      if (/^\d{2}$/.test(end2)) return `${parts[0]}/${end2}`;
    }
    return season;
  }
  const mShort = season.match(/^(\d{4})-(\d{2})$/);
  if (mShort) return `${mShort[1]}/${mShort[2]}`;
  const m4 = season.match(/^(\d{4})-(\d{4})$/);
  if (m4) return `${m4[1]}/${m4[2].slice(-2)}`;
  return season;
}

function toDashSeason(season: string): string {
  if (!season) return season;
  if (season.includes("-")) {
    const parts = season.split("-");
    if (parts.length === 2 && /^\d{4}$/.test(parts[0])) {
      const end = parts[1];
      const end2 = /^\d{4}$/.test(end) ? end.slice(-2) : end;
      if (/^\d{2}$/.test(end2)) return `${parts[0]}-${end2}`;
    }
    return season;
  }
  const mShort = season.match(/^(\d{4})\/(\d{2})$/);
  if (mShort) return `${mShort[1]}-${mShort[2]}`;
  const m4 = season.match(/^(\d{4})\/(\d{4})$/);
  if (m4) return `${m4[1]}-${m4[2].slice(-2)}`;
  return season;
}

function seasonEquals(a: string, b: string): boolean {
  if (!a || !b) return false;
  return a === b || toSlashSeason(a) === toSlashSeason(b) || toDashSeason(a) === toDashSeason(b);
}

function getSeasonDataEntry(seasonData: any, seasonId: string): any {
  if (!seasonData || typeof seasonData !== "object" || !seasonId) return undefined;
  const slash = toSlashSeason(seasonId);
  const dash = toDashSeason(seasonId);
  return seasonData?.[seasonId] ?? seasonData?.[slash] ?? seasonData?.[dash] ?? undefined;
}

async function resolveOwnerUid(clubId: string): Promise<{ ownerUid: string; clubName?: string | null; legalPages?: any[] }> {
  const profilesQuery = db.collection("club_profiles").where("clubId", "==", clubId).limit(1);
  const profileSnap = await profilesQuery.get();

  let profileDoc: FirebaseFirestore.DocumentSnapshot | null = null;
  if (!profileSnap.empty) {
    profileDoc = profileSnap.docs[0];
  } else {
    const direct = await db.collection('club_profiles').doc(clubId).get();
    if (direct.exists) {
      profileDoc = direct;
    } else {
      const ownerSnap = await db.collection('club_profiles').where('ownerUid', '==', clubId).limit(1).get();
      if (!ownerSnap.empty) profileDoc = ownerSnap.docs[0];
    }
  }

  if (!profileDoc) throw new Error("Club not found");
  const data = profileDoc.data() as any;
  const ownerUid = (data.ownerUid as string) || profileDoc.id;
  return {
    ownerUid,
    clubName: typeof data.clubName === "string" ? data.clubName : null,
    legalPages: Array.isArray(data.legalPages) ? data.legalPages : [],
  };
}

type RosterHit = { seasonId: string; data: any };

type PlayerStats = {
  appearances: number;
  minutes: number;
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
  ratingSum: number;
  ratingCount: number;
};

type SeasonSummaryRow = {
  season: string;
  matches: number;
  goals: number;
  assists: number;
  avgRating: number | null;
  hasStats: boolean;
  overall?: number | null;
  competitions?: {
    competitionId: string;
    competitionName: string;
    competitionLogoUrl?: string;
    matches: number;
    goals: number;
    assists: number;
    avgRating: number | null;
    hasStats: boolean;
    overall?: number | null;
  }[];
};

type CachedPlayerStatsResponse = {
  ownerUid: string;
  playerId: string;
  statsSeason: string | null;
  seasonStats: PlayerStats;
  careerStats: PlayerStats;
  seasonSummaries: SeasonSummaryRow[] | null;
  summariesIncluded: boolean;
  cachedAtMs: number;
  cacheVersion: number;
};

const PLAYER_STATS_CACHE_VERSION = 1;
const PLAYER_STATS_CACHE_TTL_MS = 10 * 60 * 1000;

function getPlayerStatsCacheRef(ownerUid: string, playerId: string) {
  return db.doc(`clubs/${ownerUid}/public_player_stats_cache/${playerId}`);
}

function isFreshCache(cache: CachedPlayerStatsResponse | null): boolean {
  if (!cache) return false;
  if (cache.cacheVersion !== PLAYER_STATS_CACHE_VERSION) return false;
  if (typeof cache.cachedAtMs !== "number" || !Number.isFinite(cache.cachedAtMs)) return false;
  return Date.now() - cache.cachedAtMs <= PLAYER_STATS_CACHE_TTL_MS;
}

function canServeFromCache(cache: CachedPlayerStatsResponse, includeSummaries: boolean): boolean {
  if (!isFreshCache(cache)) return false;
  if (!includeSummaries) return true;
  return cache.summariesIncluded === true && Array.isArray(cache.seasonSummaries);
}

function buildManualStatsMapFromPlayer(playerData: any, targetSeason?: string | null) {
  const manualStatsMap = new Map<
    string,
    { matches?: number; minutes?: number; goals?: number; assists?: number; yellowCards?: number; redCards?: number; avgRating?: number }
  >();
  if (!playerData || typeof playerData !== "object") return manualStatsMap;

  const seasonData = playerData?.seasonData && typeof playerData.seasonData === "object" ? (playerData.seasonData as any) : {};

  const selectedSeasonKey = typeof targetSeason === "string" && targetSeason.trim().length > 0 ? targetSeason.trim() : null;
  if (selectedSeasonKey) {
    const sd = getSeasonDataEntry(seasonData, selectedSeasonKey);
    const rows = Array.isArray((sd as any)?.manualCompetitionStats) ? ((sd as any).manualCompetitionStats as any[]) : [];
    for (const r of rows) {
      if (r && typeof r.competitionId === "string" && r.competitionId.trim().length > 0) {
        manualStatsMap.set(r.competitionId, {
          matches: typeof r.matches === "number" ? r.matches : undefined,
          minutes: typeof r.minutes === "number" ? r.minutes : undefined,
          goals: typeof r.goals === "number" ? r.goals : undefined,
          assists: typeof r.assists === "number" ? r.assists : undefined,
          yellowCards: typeof r.yellowCards === "number" ? r.yellowCards : undefined,
          redCards: typeof r.redCards === "number" ? r.redCards : undefined,
          avgRating: typeof r.avgRating === "number" ? r.avgRating : undefined,
        });
      }
    }
  } else {
    for (const sd of Object.values(seasonData)) {
      const rows = Array.isArray((sd as any)?.manualCompetitionStats) ? ((sd as any).manualCompetitionStats as any[]) : [];
      for (const r of rows) {
        if (r && typeof r.competitionId === "string" && r.competitionId.trim().length > 0) {
          manualStatsMap.set(r.competitionId, {
            matches: typeof r.matches === "number" ? r.matches : undefined,
            minutes: typeof r.minutes === "number" ? r.minutes : undefined,
            goals: typeof r.goals === "number" ? r.goals : undefined,
            assists: typeof r.assists === "number" ? r.assists : undefined,
            yellowCards: typeof r.yellowCards === "number" ? r.yellowCards : undefined,
            redCards: typeof r.redCards === "number" ? r.redCards : undefined,
            avgRating: typeof r.avgRating === "number" ? r.avgRating : undefined,
          });
        }
      }
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
        yellowCards: typeof r.yellowCards === "number" ? r.yellowCards : undefined,
        redCards: typeof r.redCards === "number" ? r.redCards : undefined,
        avgRating: typeof r.avgRating === "number" ? r.avgRating : undefined,
      });
    }
  }

  return manualStatsMap;
}

const getRosterHits = (ownerUid: string, playerId: string): Promise<RosterHit[]> => {
  return unstable_cache(
    async () => {
      const seasonsSnap = await db.collection(`clubs/${ownerUid}/seasons`).get();
      if (seasonsSnap.empty) return [];

      const rosterSnaps = await Promise.all(
        seasonsSnap.docs.map(async (seasonDoc) => {
          const rosterDocSnap = await seasonDoc.ref.collection("roster").doc(playerId).get();
          return { seasonId: seasonDoc.id, snap: rosterDocSnap };
        })
      );

      return rosterSnaps
        .filter((x) => x.snap.exists)
        .map((x) => ({ seasonId: x.seasonId, data: x.snap.data() as any }));
    },
    ["public_player_roster_hits_api", ownerUid, playerId],
    { revalidate: 300 }
  )();
};

async function getRegisteredSeasonIds(ownerUid: string, playerId: string, playerDoc: any): Promise<string[]> {
  const hits = await getRosterHits(ownerUid, playerId);
  const rosterSeasonIds: string[] = hits.map((h) => h.seasonId);

  const playerSeasons = Array.isArray(playerDoc?.seasons) ? (playerDoc.seasons as any[]) : [];
  const seasonDataKeys =
    playerDoc?.seasonData && typeof playerDoc.seasonData === "object" ? Object.keys(playerDoc.seasonData as any) : [];

  const base = [
    ...rosterSeasonIds,
    ...playerSeasons,
    ...seasonDataKeys,
  ];

  const normalized = base
    .map((s) => (typeof s === "string" ? s.trim() : ""))
    .filter((s) => s.length > 0)
    .map((s) => toSlashSeason(s));

  normalized.sort((a, b) => b.localeCompare(a));

  const unique = Array.from(new Set(normalized));

  // Only keep seasons that still exist under clubs/{ownerUid}/seasons.
  // This prevents deleted seasons from appearing in public player stats pages.
  const seasonsSnap = await db.collection(`clubs/${ownerUid}/seasons`).get();
  const existing = new Set(seasonsSnap.docs.map((d) => toSlashSeason(d.id)));
  return unique.filter((s) => existing.has(toSlashSeason(s)));
}

async function findPlayerDoc(ownerUid: string, playerId: string, preferredTeamId?: string | null): Promise<any | null> {
  if (preferredTeamId) {
    const directSnap = await db.doc(`clubs/${ownerUid}/teams/${preferredTeamId}/players/${playerId}`).get();
    if (directSnap.exists) return directSnap.data() as any;
  }

  const teamsSnap = await db.collection(`clubs/${ownerUid}/teams`).get();
  const candidates = await Promise.all(
    teamsSnap.docs.map(async (teamDoc) => {
      const snap = await teamDoc.ref.collection("players").doc(playerId).get();
      return { teamId: teamDoc.id, snap };
    })
  );

  for (const c of candidates) {
    if (c.snap.exists) return c.snap.data() as any;
  }
  return null;
}

async function getLatestRosterTeamId(ownerUid: string, playerId: string): Promise<string | null> {
  const hits = await getRosterHits(ownerUid, playerId);
  if (hits.length === 0) return null;
  const sorted = [...hits].sort((a, b) => toSlashSeason(b.seasonId).localeCompare(toSlashSeason(a.seasonId)));
  const rosterData = sorted[0]?.data ?? null;
  const rosterTeamId = typeof (rosterData as any)?.teamId === "string" ? String((rosterData as any).teamId).trim() : "";
  return rosterTeamId || null;
}

async function getCompetitions(ownerUid: string) {
  return unstable_cache(
    async () => {
      const snap = await db.collection(`clubs/${ownerUid}/competitions`).get();
      return snap.docs.map((d) => {
        const data = d.data() as any;
        return {
          id: d.id,
          ref: d.ref,
          name: (data?.name as string) || d.id,
          season: typeof data?.season === "string" ? data.season : null,
          logoUrl: typeof data?.logoUrl === "string" ? data.logoUrl : null,
        };
      });
    },
    ["public_player_competitions_api", ownerUid],
    { revalidate: 300 }
  )();
}

async function computeStats(ownerUid: string, playerId: string, playerData: any, targetSeason?: string | null): Promise<PlayerStats> {
  const aggregatedStats: PlayerStats = {
    appearances: 0,
    minutes: 0,
    goals: 0,
    assists: 0,
    yellowCards: 0,
    redCards: 0,
    ratingSum: 0,
    ratingCount: 0,
  };

  const comps = await getCompetitions(ownerUid);
  const manualStatsMap = buildManualStatsMapFromPlayer(playerData, targetSeason);
  const normalizedTargetSeason = typeof targetSeason === "string" && targetSeason.trim().length > 0 ? targetSeason.trim() : null;

  for (const comp of comps) {
    const competitionSeason = comp.season;
    if (normalizedTargetSeason && competitionSeason && !seasonEquals(competitionSeason, normalizedTargetSeason)) {
      continue;
    }

    const manual = manualStatsMap.get(comp.id);

    if (manual) {
      aggregatedStats.appearances += Number.isFinite(manual.matches as any) ? Number(manual.matches) : 0;
      aggregatedStats.minutes += Number.isFinite(manual.minutes as any) ? Number(manual.minutes) : 0;
      aggregatedStats.goals += Number.isFinite(manual.goals as any) ? Number(manual.goals) : 0;
      aggregatedStats.assists += Number.isFinite(manual.assists as any) ? Number(manual.assists) : 0;
      aggregatedStats.yellowCards += Number.isFinite(manual.yellowCards as any) ? Number(manual.yellowCards) : 0;
      aggregatedStats.redCards += Number.isFinite(manual.redCards as any) ? Number(manual.redCards) : 0;
      const m = Number.isFinite(manual.matches as any) ? Number(manual.matches) : 0;
      const r = Number.isFinite(manual.avgRating as any) ? Number(manual.avgRating) : NaN;
      if (m > 0 && Number.isFinite(r) && r > 0) {
        aggregatedStats.ratingSum += r * m;
        aggregatedStats.ratingCount += m;
      }
      continue;
    }

    const roundsSnap = await comp.ref.collection("rounds").get();
    const matchesByRound = await Promise.all(
      roundsSnap.docs.map(async (roundDoc) => {
        const matchesSnap = await roundDoc.ref.collection("matches").get();
        return matchesSnap.docs.map((d) => d.data());
      })
    );

    for (const matchData of matchesByRound.flat()) {
      const playerStats = Array.isArray((matchData as any)?.playerStats) ? (matchData as any).playerStats : [];
      const playerStat = playerStats.find((s: any) => s?.playerId === playerId);
      if (!playerStat) continue;

      const minutesPlayed = Number(playerStat.minutesPlayed) || 0;
      aggregatedStats.minutes += minutesPlayed;
      aggregatedStats.yellowCards += Number(playerStat.yellowCards) || 0;
      aggregatedStats.redCards += Number(playerStat.redCards) || 0;
      aggregatedStats.appearances += minutesPlayed > 0 ? 1 : 0;
      aggregatedStats.goals += Number(playerStat.goals) || 0;
      aggregatedStats.assists += Number(playerStat.assists) || 0;

      const rating = Number(playerStat.rating);
      if (Number.isFinite(rating) && rating > 0) {
        aggregatedStats.ratingSum += rating;
        aggregatedStats.ratingCount += 1;
      }
    }
  }

  return aggregatedStats;
}

async function computeSeasonSummaries(ownerUid: string, playerId: string, rosterSeasonIds: string[], playerData: any): Promise<SeasonSummaryRow[]> {
  type CompetitionAgg = {
    name: string;
    logoUrl?: string;
    matches: number;
    goals: number;
    assists: number;
    ratingSum: number;
    ratingCount: number;
  };

  type SeasonAgg = {
    matches: number;
    goals: number;
    assists: number;
    ratingSum: number;
    ratingCount: number;
    competitions: Map<string, CompetitionAgg>;
  };

  const seasonData = playerData?.seasonData && typeof playerData.seasonData === "object" ? (playerData.seasonData as any) : {};

  const legacyRows = Array.isArray(playerData?.manualCompetitionStats) ? (playerData.manualCompetitionStats as any[]) : [];
  const legacyManualByCompetitionId = new Map<string, any>();
  for (const r of legacyRows) {
    if (r && typeof r.competitionId === "string" && r.competitionId.trim().length > 0) {
      legacyManualByCompetitionId.set(r.competitionId, r);
    }
  }

  const manualCompetitionStatsBySeason = new Map<string, Map<string, any>>();
  for (const [seasonKey, sd] of Object.entries(seasonData)) {
    const rows = Array.isArray((sd as any)?.manualCompetitionStats) ? ((sd as any).manualCompetitionStats as any[]) : [];
    const byComp = new Map<string, any>();
    for (const r of rows) {
      if (r && typeof r.competitionId === "string" && r.competitionId.trim().length > 0) {
        byComp.set(r.competitionId, r);
      }
    }
    manualCompetitionStatsBySeason.set(toSlashSeason(seasonKey), byComp);
  }

  const overallBySeason = new Map<string, number | null>();
  for (const seasonId of rosterSeasonIds) {
    const slash = toSlashSeason(seasonId);
    const sd = getSeasonDataEntry(seasonData as any, seasonId);
    const manualOverall = (sd as any)?.params?.overall;
    const v = typeof manualOverall === "number" && Number.isFinite(manualOverall) ? Math.max(0, Math.min(99, manualOverall)) : null;
    overallBySeason.set(slash, v);
  }

  const summaries = new Map<string, SeasonAgg>();
  const getSeasonAgg = (seasonKey: string): SeasonAgg => {
    const existing = summaries.get(seasonKey);
    if (existing) return existing;
    const created: SeasonAgg = { matches: 0, goals: 0, assists: 0, ratingSum: 0, ratingCount: 0, competitions: new Map() };
    summaries.set(seasonKey, created);
    return created;
  };
  const getCompetitionAgg = (seasonAgg: SeasonAgg, compId: string, compName: string, compLogoUrl?: string): CompetitionAgg => {
    const existing = seasonAgg.competitions.get(compId);
    if (existing) {
      if (!existing.logoUrl && typeof compLogoUrl === "string" && compLogoUrl.trim().length > 0) existing.logoUrl = compLogoUrl;
      return existing;
    }
    const created: CompetitionAgg = { name: compName, logoUrl: compLogoUrl, matches: 0, goals: 0, assists: 0, ratingSum: 0, ratingCount: 0 };
    seasonAgg.competitions.set(compId, created);
    return created;
  };

  const comps = await getCompetitions(ownerUid);

  for (const comp of comps) {
    const rawSeason = typeof comp.season === "string" && comp.season.trim().length > 0 ? comp.season : "unknown";
    if (rawSeason === "unknown") continue;
    const compSeason = toSlashSeason(rawSeason);
    if (!rosterSeasonIds.some((s: string) => seasonEquals(s, compSeason))) continue;

    const manual = manualCompetitionStatsBySeason.get(compSeason)?.get(comp.id) || legacyManualByCompetitionId.get(comp.id);
    if (manual) {
      const seasonAgg = getSeasonAgg(compSeason);
      const m = Number.isFinite(manual.matches as any) ? Number(manual.matches) : 0;
      const g = Number.isFinite(manual.goals as any) ? Number(manual.goals) : 0;
      const a = Number.isFinite(manual.assists as any) ? Number(manual.assists) : 0;
      const r = Number.isFinite(manual.avgRating as any) ? Number(manual.avgRating) : NaN;

      seasonAgg.matches += m;
      seasonAgg.goals += g;
      seasonAgg.assists += a;
      if (m > 0 && Number.isFinite(r) && r > 0) {
        seasonAgg.ratingSum += r;
        seasonAgg.ratingCount += 1;
      }

      const compAgg = getCompetitionAgg(seasonAgg, comp.id, comp.name, comp.logoUrl ?? undefined);
      compAgg.matches = m;
      compAgg.goals = g;
      compAgg.assists = a;
      if (m > 0 && Number.isFinite(r) && r > 0) {
        compAgg.ratingSum = r;
        compAgg.ratingCount = 1;
      }
      continue;
    }

    const roundsSnap = await comp.ref.collection("rounds").get();
    for (const roundDoc of roundsSnap.docs) {
      const matchesSnap = await roundDoc.ref.collection("matches").get();
      for (const matchDoc of matchesSnap.docs) {
        const matchData = matchDoc.data() as any;
        const playerStats = Array.isArray(matchData?.playerStats) ? matchData.playerStats : [];
        const playerStat = playerStats.find((s: any) => s?.playerId === playerId);
        if (!playerStat) continue;

        const minutesPlayed = Number(playerStat.minutesPlayed) || 0;
        const goals = Number(playerStat.goals) || 0;
        const assists = Number(playerStat.assists) || 0;
        const rating = Number(playerStat.rating);

        const seasonAgg = getSeasonAgg(compSeason);
        seasonAgg.matches += minutesPlayed > 0 ? 1 : 0;
        seasonAgg.goals += goals;
        seasonAgg.assists += assists;
        if (Number.isFinite(rating) && rating > 0) {
          seasonAgg.ratingSum += rating;
          seasonAgg.ratingCount += 1;
        }

        const compAgg = getCompetitionAgg(seasonAgg, comp.id, comp.name, comp.logoUrl ?? undefined);
        compAgg.matches += minutesPlayed > 0 ? 1 : 0;
        compAgg.goals += goals;
        compAgg.assists += assists;
        if (Number.isFinite(rating) && rating > 0) {
          compAgg.ratingSum += rating;
          compAgg.ratingCount += 1;
        }
      }
    }
  }

  const rows: SeasonSummaryRow[] = Array.from(summaries.entries()).map(([season, v]) => {
    const competitions = Array.from(v.competitions.entries())
      .map(([competitionId, c]) => {
        const avgRating = c.ratingCount > 0 ? c.ratingSum / c.ratingCount : null;
        const hasStats = c.matches > 0 || c.goals > 0 || c.assists > 0 || c.ratingCount > 0;
        return {
          competitionId,
          competitionName: c.name,
          competitionLogoUrl: c.logoUrl,
          matches: c.matches,
          goals: c.goals,
          assists: c.assists,
          avgRating,
          hasStats,
          overall: overallBySeason.get(season) ?? null,
        };
      })
      .filter((c) => c.hasStats)
      .sort((a, b) => b.matches - a.matches || b.goals - a.goals || a.competitionName.localeCompare(b.competitionName));

    return {
      season,
      matches: v.matches,
      goals: v.goals,
      assists: v.assists,
      avgRating: v.ratingCount > 0 ? v.ratingSum / v.ratingCount : null,
      hasStats: v.matches > 0 || v.goals > 0 || v.assists > 0 || v.ratingCount > 0,
      overall: overallBySeason.get(season) ?? null,
      competitions,
    };
  });

  rows.sort((a, b) => b.season.localeCompare(a.season));

  const rowMap = new Map(rows.map((r) => [r.season, r] as const));
  const merged: SeasonSummaryRow[] = rosterSeasonIds.map((season: string) => {
    const s = toSlashSeason(season);
    const r = rowMap.get(s);
    if (r) return r;
    return { season: s, matches: 0, goals: 0, assists: 0, avgRating: null, hasStats: false, competitions: [] };
  });

  return merged;
}

export async function GET(request: NextRequest, context: { params: Promise<{ clubId: string; playerId: string }> }) {
  try {
    const { clubId, playerId } = await context.params;
    const includeSummaries = request.nextUrl.searchParams.get("includeSummaries") === "1";
    const forceRefresh = request.nextUrl.searchParams.get("force") === "1";

    const { ownerUid } = await resolveOwnerUid(clubId);

    const cacheSnap = await getPlayerStatsCacheRef(ownerUid, playerId).get();
    if (!forceRefresh && cacheSnap.exists) {
      const cached = cacheSnap.data() as any as CachedPlayerStatsResponse;
      if (canServeFromCache(cached, includeSummaries)) {
        return NextResponse.json(
          {
            ownerUid,
            playerId,
            statsSeason: cached.statsSeason ?? null,
            seasonStats: cached.seasonStats,
            careerStats: cached.careerStats,
            seasonSummaries: includeSummaries ? cached.seasonSummaries : null,
          },
          {
            headers: {
              // Vercel Edge/Node cache hint for API response
              "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
            },
          }
        );
      }
    }

    const rosterTeamId = await getLatestRosterTeamId(ownerUid, playerId);
    const playerDoc = await findPlayerDoc(ownerUid, playerId, rosterTeamId);

    if (!playerDoc) {
      return NextResponse.json({ error: "Player not found" }, { status: 404 });
    }

    const registeredSeasonIds = await getRegisteredSeasonIds(ownerUid, playerId, playerDoc);

    const statsSeason = (() => {
      const candidates = Array.isArray(registeredSeasonIds) ? [...registeredSeasonIds] : [];
      candidates.sort((a, b) => toSlashSeason(b).localeCompare(toSlashSeason(a)));
      return candidates.length > 0 ? candidates[0] : null;
    })();

    const [seasonStats, careerStats] = await Promise.all([
      computeStats(ownerUid, playerId, playerDoc, statsSeason),
      computeStats(ownerUid, playerId, playerDoc, null),
    ]);

    const seasonSummaries = includeSummaries
      ? await computeSeasonSummaries(ownerUid, playerId, registeredSeasonIds, playerDoc)
      : null;

    const cachePayload: CachedPlayerStatsResponse = {
      ownerUid,
      playerId,
      statsSeason,
      seasonStats,
      careerStats,
      seasonSummaries,
      summariesIncluded: includeSummaries,
      cachedAtMs: Date.now(),
      cacheVersion: PLAYER_STATS_CACHE_VERSION,
    };
    await getPlayerStatsCacheRef(ownerUid, playerId).set(cachePayload, { merge: true });

    return NextResponse.json(
      {
        ownerUid,
        playerId,
        statsSeason,
        seasonStats,
        careerStats,
        seasonSummaries,
      },
      {
        headers: {
          // Vercel Edge/Node cache hint for API response
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
        },
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
