import { db } from "@/lib/firebase/admin";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { FaXTwitter, FaYoutube, FaTiktok, FaInstagram } from "react-icons/fa6";
import { ClubFooter } from "@/components/club-footer";
import { PublicPlayerHexChart } from "@/components/public-player-hex-chart";
import { PublicPlayerOverallBySeasonChart } from "@/components/public-player-overall-by-season-chart";
import { PublicPlayerSeasonSummaries } from "@/components/public-player-season-summaries";

interface PlayerPageProps {
  params: { clubId: string; playerId: string };
}

interface LegalPageItem {
  title: string;
  slug: string;
}

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
  const m2 = season.match(/^(\d{4})-(\d{2})$/);
  if (m2) return `${m2[1]}/${m2[2]}`;
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
  const m2 = season.match(/^(\d{4})\/(\d{2})$/);
  if (m2) return `${m2[1]}-${m2[2]}`;
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

function scorePlayerDocForPublic(data: any): number {
  if (!data || typeof data !== "object") return -1;
  const seasonData = data?.seasonData && typeof data.seasonData === "object" ? (data.seasonData as any) : {};

  const hasSeasonParams = Object.values(seasonData).some((sd: any) => {
    const items = Array.isArray(sd?.params?.items) ? (sd.params.items as any[]) : [];
    return (
      (typeof sd?.params?.overall === "number" && Number.isFinite(sd.params.overall)) ||
      items.some((i) => typeof (i as any)?.label === "string" && String((i as any).label).trim().length > 0) ||
      items.some((i) => typeof (i as any)?.value === "number" && Number.isFinite((i as any).value))
    );
  });

  const rootItems = Array.isArray(data?.params?.items) ? (data.params.items as any[]) : [];
  const hasRootParams =
    (typeof data?.params?.overall === "number" && Number.isFinite(data.params.overall)) ||
    rootItems.some((i) => typeof (i as any)?.label === "string" && String((i as any).label).trim().length > 0) ||
    rootItems.some((i) => typeof (i as any)?.value === "number" && Number.isFinite((i as any).value));

  const seasons = Array.isArray(data?.seasons) ? (data.seasons as string[]) : [];
  const latestSeason = seasons
    .map((s) => (typeof s === "string" ? toSlashSeason(s.trim()) : ""))
    .filter((s) => s.length > 0)
    .sort((a, b) => b.localeCompare(a))[0];
  const latestSeasonScore = latestSeason ? parseInt(latestSeason.slice(0, 4), 10) || 0 : 0;

  return (hasSeasonParams ? 1_000_000 : 0) + (hasRootParams ? 100_000 : 0) + latestSeasonScore;
}

async function findBestPlayerDoc(ownerUid: string, playerId: string): Promise<any | null> {
  const teamsSnap = await db.collection(`clubs/${ownerUid}/teams`).get();
  let best: { score: number; data: any } | null = null;

  for (const teamDoc of teamsSnap.docs) {
    const playerSnap = await teamDoc.ref.collection("players").doc(playerId).get();
    if (!playerSnap.exists) continue;
    const data = playerSnap.data() as any;
    const score = scorePlayerDocForPublic(data);
    if (!best || score > best.score) {
      best = { score, data };
    }
  }

  return best?.data ?? null;
}

async function getRegisteredSeasonIds(ownerUid: string, playerId: string, playerSeasons: string[] | undefined): Promise<string[]> {
  const seasonsSnap = await db.collection(`clubs/${ownerUid}/seasons`).get();
  const rosterSeasonIds: string[] = [];
  for (const seasonDoc of seasonsSnap.docs) {
    const rosterDocSnap = await seasonDoc.ref.collection("roster").doc(playerId).get();
    if (rosterDocSnap.exists) {
      rosterSeasonIds.push(seasonDoc.id);
    }
  }

  const base = rosterSeasonIds.length > 0 ? rosterSeasonIds : (Array.isArray(playerSeasons) ? playerSeasons : []);
  const normalized = base
    .map((s) => (typeof s === "string" ? s.trim() : ""))
    .filter((s) => s.length > 0)
    .map((s) => toSlashSeason(s));

  normalized.sort((a, b) => b.localeCompare(a));
  return Array.from(new Set(normalized));
}

interface PlayerStats {
  appearances: number;
  minutes: number;
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
  ratingSum: number;
  ratingCount: number;
}

interface SeasonSummaryRow {
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
    matches: number;
    goals: number;
    assists: number;
    avgRating: number | null;
    hasStats: boolean;
    overall?: number | null;
  }[];
}

interface PlayerParameterItem {
  label: string;
  value?: number;
}

interface PlayerParameters {
  overall?: number;
  items: PlayerParameterItem[];
}

interface PlayerData {
  name: string;
  number: number;
  position: string;
  photoUrl?: string;
  snsLinks?: {
    x?: string;
    youtube?: string;
    tiktok?: string;
    instagram?: string;
  };
  height?: number;
  age?: number;
  profile?: string;
  nationality?: string;
  params?: PlayerParameters;
  manualCompetitionStats?: {
    competitionId: string;
    matches?: number;
    minutes?: number;
    goals?: number;
    assists?: number;
    yellowCards?: number;
    redCards?: number;
    avgRating?: number;
  }[];
  seasons?: string[];

  seasonData?: Record<
    string,
    {
      params?: PlayerParameters;
      manualCompetitionStats?: {
        competitionId: string;
        matches?: number;
        minutes?: number;
        goals?: number;
        assists?: number;
        yellowCards?: number;
        redCards?: number;
        avgRating?: number;
      }[];
    }
  >;
}

function clamp99(n: unknown): number {
  if (typeof n !== "number" || !Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(99, n));
}

const toFiniteNumber = (v: any): number | null => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

const currencySymbol = (c: string | undefined): string => {
  if (c === "GBP") return "￡";
  if (c === "EUR") return "€";
  return "￥";
};

const formatAmount = (v: number): string => {
  return new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 0 }).format(v);
};

const formatFeeCompact = (v: number): string => {
  if (!Number.isFinite(v)) return "-";
  if (v < 10000) return formatAmount(v);
  const scaled = v / 10000;
  const display = Number.isInteger(scaled) ? String(scaled) : scaled.toFixed(1);
  return `${display}M`;
};

interface PlayerContract {
  salary: number;
  years: number;
  currency: string;
}

function getPlayerContract(playerData: any): PlayerContract | null {
  const seasonData = playerData?.seasonData && typeof playerData.seasonData === "object" ? (playerData.seasonData as any) : {};
  const latestSeason = Object.keys(seasonData).sort((a, b) => b.localeCompare(a))[0];
  const contract = seasonData[latestSeason]?.contract;
  if (contract) {
    const salary = toFiniteNumber(contract.salary);
    const years = toFiniteNumber(contract.years);
    if (salary == null && years == null) return null;
    return {
      salary: salary ?? 0,
      years: years ?? 0,
      currency: typeof contract.currency === "string" ? contract.currency : "JPY",
    };
  }
  return null;
}

function computeOverall(items: PlayerParameterItem[] | undefined): number {
  const vals = (items || [])
    .map((i) => i?.value)
    .map((v) => toFiniteNumber(v))
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v))
    .map((v) => clamp99(v));
  if (vals.length === 0) return 0;
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
}

async function getPlayerStats(ownerUid: string, playerId: string, targetSeason?: string | null): Promise<PlayerStats> {
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

  const competitionsRef = db.collection(`clubs/${ownerUid}/competitions`);
  const competitionsSnap = await competitionsRef.get();

  const manualStatsMap = new Map<
    string,
    { matches?: number; minutes?: number; goals?: number; assists?: number; yellowCards?: number; redCards?: number; avgRating?: number }
  >();
  const playerData = await findBestPlayerDoc(ownerUid, playerId);
  if (playerData) {
    const seasonData = playerData?.seasonData && typeof playerData.seasonData === "object" ? (playerData.seasonData as any) : {};

    // If we have a target season, prefer manual stats from that season only.
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
      // No season specified: include all seasons (legacy behavior)
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

    // Legacy schema fallback: manualCompetitionStats at root (only fill if not already present)
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
  }

  const normalizedTargetSeason = typeof targetSeason === "string" && targetSeason.trim().length > 0 ? targetSeason.trim() : null;

  for (const competitionDoc of competitionsSnap.docs) {
    const competitionData = competitionDoc.data() as any;
    const competitionSeason = typeof competitionData?.season === "string" ? competitionData.season : null;
    if (normalizedTargetSeason && competitionSeason && !seasonEquals(competitionSeason, normalizedTargetSeason)) {
      continue;
    }
    const manual = manualStatsMap.get(competitionDoc.id);
    const roundsRef = competitionDoc.ref.collection('rounds');
    const roundsSnap = await roundsRef.get();

    for (const roundDoc of roundsSnap.docs) {
      const matchesRef = roundDoc.ref.collection('matches');
      const matchesSnap = await matchesRef.get();

      for (const matchDoc of matchesSnap.docs) {
        const matchData = matchDoc.data();
        if (matchData.playerStats && Array.isArray(matchData.playerStats)) {
          const playerStat = matchData.playerStats.find(stat => stat.playerId === playerId);
          if (playerStat) {
            const minutesPlayed = Number(playerStat.minutesPlayed) || 0;

            if (!manual) {
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
        }
      }
    }

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
    }
  }

  return aggregatedStats;
}

async function getPlayerSeasonSummaries(
  ownerUid: string,
  playerId: string,
  rosterSeasonIds: string[],
  manualCompetitionStatsBySeason: Map<
    string,
    Map<
      string,
      {
        competitionId: string;
        matches?: number;
        minutes?: number;
        goals?: number;
        assists?: number;
        yellowCards?: number;
        redCards?: number;
        avgRating?: number;
      }
    >
  >,
  legacyManualByCompetitionId: Map<
    string,
    {
      competitionId: string;
      matches?: number;
      minutes?: number;
      goals?: number;
      assists?: number;
      yellowCards?: number;
      redCards?: number;
      avgRating?: number;
    }
  >,
  overallBySeason: Map<string, number | null>
): Promise<SeasonSummaryRow[]> {
  type CompetitionAgg = {
    name: string;
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

  const summaries = new Map<string, SeasonAgg>();

  const getOverallForSeason = (seasonKey: string): number | null => {
    if (overallBySeason.has(seasonKey)) return overallBySeason.get(seasonKey) ?? null;
    const slash = toSlashSeason(seasonKey);
    if (overallBySeason.has(slash)) return overallBySeason.get(slash) ?? null;
    return null;
  };

  const getSeasonAgg = (seasonKey: string): SeasonAgg => {
    const existing = summaries.get(seasonKey);
    if (existing) return existing;
    const created: SeasonAgg = {
      matches: 0,
      goals: 0,
      assists: 0,
      ratingSum: 0,
      ratingCount: 0,
      competitions: new Map(),
    };
    summaries.set(seasonKey, created);
    return created;
  };

  const getCompetitionAgg = (seasonAgg: SeasonAgg, compId: string, compName: string): CompetitionAgg => {
    const existing = seasonAgg.competitions.get(compId);
    if (existing) return existing;
    const created: CompetitionAgg = { name: compName, matches: 0, goals: 0, assists: 0, ratingSum: 0, ratingCount: 0 };
    seasonAgg.competitions.set(compId, created);
    return created;
  };

  const competitionsRef = db.collection(`clubs/${ownerUid}/competitions`);
  const competitionsSnap = await competitionsRef.get();

  for (const competitionDoc of competitionsSnap.docs) {
    const compData = competitionDoc.data() as any;
    const rawSeason =
      typeof compData?.season === "string" && compData.season.trim().length > 0 ? compData.season : "unknown";
    if (rawSeason === "unknown") continue;
    const compSeason = toSlashSeason(rawSeason);
    if (!rosterSeasonIds.some((s: string) => seasonEquals(s, compSeason))) continue;

    const competitionId = competitionDoc.id;
    const competitionName = (compData?.name as string) || competitionDoc.id;

    const manual = manualCompetitionStatsBySeason.get(compSeason)?.get(competitionId) || legacyManualByCompetitionId.get(competitionId);
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

      const compAgg = getCompetitionAgg(seasonAgg, competitionId, competitionName);
      compAgg.matches = m;
      compAgg.goals = g;
      compAgg.assists = a;
      if (m > 0 && Number.isFinite(r) && r > 0) {
        compAgg.ratingSum = r;
        compAgg.ratingCount = 1;
      }
      continue;
    }

    const roundsRef = competitionDoc.ref.collection("rounds");
    const roundsSnap = await roundsRef.get();

    for (const roundDoc of roundsSnap.docs) {
      const matchesRef = roundDoc.ref.collection("matches");
      const matchesSnap = await matchesRef.get();

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

        const compAgg = getCompetitionAgg(seasonAgg, competitionId, competitionName);
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
    const seasonOverall = getOverallForSeason(season);
    const competitions = Array.from(v.competitions.entries())
      .map(([competitionId, c]) => {
        const avgRating = c.ratingCount > 0 ? c.ratingSum / c.ratingCount : null;
        const hasStats = c.matches > 0 || c.goals > 0 || c.assists > 0 || c.ratingCount > 0;
        return {
          competitionId,
          competitionName: c.name,
          matches: c.matches,
          goals: c.goals,
          assists: c.assists,
          avgRating,
          hasStats,
          overall: seasonOverall,
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
      overall: seasonOverall,
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

async function getPlayer(
  clubId: string,
  playerId: string
): Promise<{ clubName: string; player: PlayerData; ownerUid: string; legalPages: LegalPageItem[] } | null> {
  let clubName = clubId;
  let ownerUid: string | null = null;
  let legalPages: LegalPageItem[] = [];

  // club_profiles から ownerUid と clubName を取得
  const profilesQuery = db
    .collection("club_profiles")
    .where("clubId", "==", clubId);
  const profileSnap = await profilesQuery.get();

  if (!profileSnap.empty) {
    const doc = profileSnap.docs[0];
    const data = doc.data() as any;
    ownerUid = (data.ownerUid as string) || doc.id;
    clubName = data.clubName || clubName;
    if (Array.isArray((data as any).legalPages)) {
      legalPages = (data as any).legalPages
        .map((p: any) => ({
          title: typeof p?.title === "string" ? p.title : "",
          slug: typeof p?.slug === "string" ? p.slug : "",
        }))
        .filter((p: any) => typeof p.slug === "string" && p.slug.trim().length > 0);
    }
  } else {
    const directSnap = await db.collection("club_profiles").doc(clubId).get();
    if (directSnap.exists) {
      const data = directSnap.data() as any;
      ownerUid = (data.ownerUid as string) || directSnap.id;
      clubName = data.clubName || clubName;
      if (Array.isArray((data as any).legalPages)) {
        legalPages = (data as any).legalPages
          .map((p: any) => ({
            title: typeof p?.title === "string" ? p.title : "",
            slug: typeof p?.slug === "string" ? p.slug : "",
          }))
          .filter((p: any) => typeof p.slug === "string" && p.slug.trim().length > 0);
      }
    }
  }

  if (!ownerUid) {
    return null;
  }

  const player = await findBestPlayerDoc(ownerUid, playerId);
  if (player) {
    return {
      clubName,
      player: player as PlayerData,
      ownerUid,
      legalPages,
    };
  }

  return null;
}

export default async function PlayerPage({
  params,
}: {
  params: { clubId: string; playerId: string };
}) {
  const { clubId, playerId } = params;
  const result = await getPlayer(clubId, playerId);
  if (!result) return notFound();

  const { clubName, player, ownerUid, legalPages } = result;
  const registeredSeasonIds = await getRegisteredSeasonIds(ownerUid, playerId, (player as any)?.seasons);

  const statsSeason = (() => {
    const candidates = Array.isArray(registeredSeasonIds) ? [...registeredSeasonIds] : [];
    candidates.sort((a, b) => toSlashSeason(b).localeCompare(toSlashSeason(a)));
    return candidates.length > 0 ? candidates[0] : null;
  })();
  const stats = await getPlayerStats(ownerUid, playerId, statsSeason);
  const careerStats = await getPlayerStats(ownerUid, playerId, null);
  const legacyManualCompetitionStats = Array.isArray((player as any)?.manualCompetitionStats)
    ? ((player as any).manualCompetitionStats as any[])
    : [];
  const legacyManualByCompetitionId = new Map<string, any>();
  for (const r of legacyManualCompetitionStats) {
    if (r && typeof r.competitionId === "string" && r.competitionId.trim().length > 0) {
      legacyManualByCompetitionId.set(r.competitionId, r);
    }
  }

  const seasonData = (player as any)?.seasonData && typeof (player as any).seasonData === "object" ? ((player as any).seasonData as any) : {};
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
  for (const seasonId of registeredSeasonIds) {
    const slash = toSlashSeason(seasonId);
    const sd = getSeasonDataEntry(seasonData as any, seasonId);
    const items = Array.isArray((sd as any)?.params?.items) ? ((sd as any).params.items as any[]) : undefined;
    const manualOverall = (sd as any)?.params?.overall;
    const overallVal =
      typeof manualOverall === "number" && Number.isFinite(manualOverall)
        ? clamp99(manualOverall)
        : computeOverall(items);
    overallBySeason.set(slash, overallVal > 0 ? overallVal : null);
  }

  const overallSeries = (() => {
    const seasons = Array.isArray(registeredSeasonIds) ? [...registeredSeasonIds] : [];
    seasons.sort((a, b) => toSlashSeason(a).localeCompare(toSlashSeason(b)));
    return seasons.map((seasonId) => {
      const slash = toSlashSeason(seasonId);
      return {
        season: slash,
        overall: overallBySeason.get(slash) ?? null,
      };
    });
  })();

  const seasonSummaries =
    registeredSeasonIds.length > 0
      ? await getPlayerSeasonSummaries(ownerUid, playerId, registeredSeasonIds, manualCompetitionStatsBySeason, legacyManualByCompetitionId, overallBySeason)
      : [];

  const latestSeasonKeyForParams = (() => {
    const candidates = Array.isArray(registeredSeasonIds) ? [...registeredSeasonIds] : [];
    candidates.sort((a, b) => toSlashSeason(b).localeCompare(toSlashSeason(a)));
    for (const seasonId of candidates) {
      const sd = getSeasonDataEntry(seasonData as any, seasonId);
      const items = Array.isArray((sd as any)?.params?.items) ? ((sd as any).params.items as any[]) : [];
      const hasAny =
        (toFiniteNumber((sd as any)?.params?.overall) != null) ||
        items.some((i) => typeof (i as any)?.label === "string" && String((i as any).label).trim().length > 0) ||
        items.some((i) => toFiniteNumber((i as any)?.value) != null);
      if (hasAny) return seasonId;
    }
    return candidates.length > 0 ? candidates[0] : null;
  })();

  const latestSeasonKeyForContract = (() => {
    const candidates = Array.isArray(registeredSeasonIds) ? [...registeredSeasonIds] : [];
    candidates.sort((a, b) => toSlashSeason(b).localeCompare(toSlashSeason(a)));
    for (const seasonId of candidates) {
      const sd = getSeasonDataEntry(seasonData as any, seasonId);
      const hasAny = (toFiniteNumber((sd as any)?.annualSalary) != null) || (toFiniteNumber((sd as any)?.contractYears) != null);
      if (hasAny) return seasonId;
    }
    return candidates.length > 0 ? candidates[0] : null;
  })();

  const seasonParams = (() => {
    if (!latestSeasonKeyForParams) return undefined;
    const sd = getSeasonDataEntry(seasonData as any, latestSeasonKeyForParams);
    return (sd as any)?.params;
  })();

  const paramItems = Array.isArray((seasonParams as any)?.items)
    ? ((seasonParams as any).items as any[])
    : Array.isArray(player?.params?.items)
      ? player.params!.items
      : [];
  const filledItems = Array.from({ length: 6 }, (_, i) => {
    const item = paramItems?.[i] as any;
    return {
      label: typeof item?.label === "string" ? item.label.slice(0, 8) : "",
      value: toFiniteNumber(item?.value) != null ? clamp99(toFiniteNumber(item?.value)) : 0,
    };
  });
  const defaultParamLabels = ["PAC", "SHO", "PAS", "DRI", "DEF", "PHY"];
  const paramLabels = filledItems.map((i, idx) => (i.label && i.label.trim().length > 0 ? i.label : defaultParamLabels[idx]));
  const paramValues = filledItems.map((i) => i.value);
  const overall =
    toFiniteNumber((seasonParams as any)?.overall) != null
      ? clamp99(toFiniteNumber((seasonParams as any).overall))
      : toFiniteNumber(player?.params?.overall) != null
        ? clamp99(toFiniteNumber(player?.params?.overall))
        : computeOverall(paramItems);
  const hasParams =
    (Array.isArray(paramItems)
      ? paramItems.some((i) => (typeof (i as any)?.label === "string" && ((i as any).label as string).trim().length > 0)) ||
        paramItems.some((i) => toFiniteNumber((i as any)?.value) != null)
      : false) ||
    ((toFiniteNumber((seasonParams as any)?.overall) != null) || (toFiniteNumber(player?.params?.overall) != null));

  const snsLinks = player.snsLinks || {};
  const snsEntries = [
    { key: "x", label: "X", url: snsLinks.x },
    { key: "youtube", label: "YouTube", url: snsLinks.youtube },
    { key: "tiktok", label: "TikTok", url: snsLinks.tiktok },
    { key: "instagram", label: "Instagram", url: snsLinks.instagram },
  ].filter((e) => typeof e.url === "string" && e.url.trim().length > 0);

  const contractSeasonData = latestSeasonKeyForContract ? getSeasonDataEntry(seasonData as any, latestSeasonKeyForContract) : undefined;
  const annualSalary =
    toFiniteNumber((contractSeasonData as any)?.annualSalary) != null
      ? (toFiniteNumber((contractSeasonData as any)?.annualSalary) as number)
      : toFiniteNumber((player as any)?.annualSalary) != null
        ? (toFiniteNumber((player as any)?.annualSalary) as number)
        : null;
  const annualSalaryCurrency =
    typeof (contractSeasonData as any)?.annualSalaryCurrency === "string"
      ? ((contractSeasonData as any).annualSalaryCurrency as string)
      : typeof (player as any)?.annualSalaryCurrency === "string"
        ? ((player as any).annualSalaryCurrency as string)
        : undefined;
  const contractYears =
    toFiniteNumber((contractSeasonData as any)?.contractYears) != null
      ? (toFiniteNumber((contractSeasonData as any)?.contractYears) as number)
      : toFiniteNumber((player as any)?.contractYears) != null
        ? (toFiniteNumber((player as any)?.contractYears) as number)
        : null;

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex-1">
        <div className="container mx-auto px-4 py-8">
          <div className="mb-8">
            <Link href={`/${clubId}/players`} className="text-sm text-muted-foreground hover:underline">
              &larr; 選手一覧に戻る
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="md:col-span-1">
                <div className="relative aspect-[4/5] rounded-lg border bg-card overflow-hidden">
                  {player.photoUrl ? (
                    <Image
                      src={player.photoUrl}
                      alt={player.name}
                      fill
                      sizes="(max-width: 768px) 100vw, 33vw"
                      className="object-cover"
                    />
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center p-6">
                      <p className="text-7xl font-black text-primary tracking-tighter">{player.number}</p>
                      <h1 className="mt-4 text-3xl font-bold uppercase text-center break-words">{player.name}</h1>
                    </div>
                  )}
                </div>
              </div>

              <div className="md:col-span-2">
                <p className="text-7xl font-black text-primary tracking-tighter">{player.number}</p>
                <h1 className="text-5xl font-bold uppercase mt-2">{player.name}</h1>
                {player.nationality && <p className="text-xl text-muted-foreground mt-2">{player.nationality}</p>}
                <p className="text-2xl text-muted-foreground mt-1">{player.position}</p>

                {snsEntries.length > 0 && (
                  <div className="mt-6 flex flex-wrap gap-2">
                    {snsEntries.map((e) => {
                      const Icon =
                        e.key === "x"
                          ? FaXTwitter
                          : e.key === "youtube"
                            ? FaYoutube
                            : e.key === "tiktok"
                              ? FaTiktok
                              : FaInstagram;

                      return (
                        <a
                          key={e.key}
                          href={e.url}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={e.label}
                          title={e.label}
                          className="w-9 h-9 rounded-full bg-background flex items-center justify-center text-foreground hover:bg-primary hover:text-primary-foreground transition-colors"
                        >
                          <Icon className={e.key === "youtube" ? "w-5 h-5" : "w-4 h-4"} />
                        </a>
                      );
                    })}
                  </div>
                )}

                <div className="mt-8 grid grid-cols-2 gap-4 text-center">
                  <div className="border rounded-lg p-4">
                    <p className="text-sm text-muted-foreground">身長</p>
                    <p className="text-2xl font-bold">{player.height ? `${player.height} cm` : "N/A"}</p>
                  </div>
                  <div className="border rounded-lg p-4">
                    <p className="text-sm text-muted-foreground">年齢</p>
                    <p className="text-2xl font-bold">{player.age ? `${player.age} 歳` : "N/A"}</p>
                  </div>
                </div>

                {annualSalary != null || contractYears != null ? (
                  <div className="mt-4 grid grid-cols-2 gap-4 text-center">
                    {annualSalary != null ? (
                      <div className="border rounded-lg p-4">
                        <p className="text-sm text-muted-foreground">年俸</p>
                        <p className="text-2xl font-bold">
                          {currencySymbol(annualSalaryCurrency)}
                          {formatFeeCompact(annualSalary)}
                        </p>
                      </div>
                    ) : null}
                    {contractYears != null ? (
                      <div className="border rounded-lg p-4">
                        <p className="text-sm text-muted-foreground">契約年数</p>
                        <p className="text-2xl font-bold">{contractYears} 年</p>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {player.profile && (
                  <div className="mt-8">
                    <h2 className="text-xl font-bold">プロフィール</h2>
                    <p className="mt-2 text-muted-foreground whitespace-pre-wrap">{player.profile}</p>
                  </div>
                )}

                {/* Stats Section */}
                <div className="mt-8">
                  <h2 className="text-xl font-bold mb-4">シーズンスタッツ</h2>
                  {statsSeason && <p className="text-xs text-muted-foreground mb-2">{toSlashSeason(statsSeason)} シーズン</p>}
                  <div className="overflow-x-auto">
                    <div className="grid grid-cols-6 gap-2 min-w-[420px] text-center">
                      <div className="border rounded-md p-2">
                        <p className="text-[10px] text-muted-foreground">試合数</p>
                        <p className="text-xl font-bold tabular-nums">{stats.appearances}</p>
                      </div>
                      <div className="border rounded-md p-2">
                        <p className="text-[10px] text-muted-foreground">出場時間</p>
                        <p className="text-xl font-bold tabular-nums">{stats.minutes}</p>
                      </div>
                      <div className="border rounded-md p-2">
                        <p className="text-[10px] text-muted-foreground">ゴール</p>
                        <p className="text-xl font-bold tabular-nums">{stats.goals}</p>
                      </div>
                      <div className="border rounded-md p-2">
                        <p className="text-[10px] text-muted-foreground">アシスト</p>
                        <p className="text-xl font-bold tabular-nums">{stats.assists}</p>
                      </div>
                      <div className="border rounded-md p-2">
                        <p className="text-[10px] text-muted-foreground">警告</p>
                        <p className="text-xl font-bold tabular-nums">{stats.yellowCards}</p>
                      </div>
                      <div className="border rounded-md p-2">
                        <p className="text-[10px] text-muted-foreground">退場</p>
                        <p className="text-xl font-bold tabular-nums">{stats.redCards}</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-4">
                  <h2 className="text-xl font-bold mb-4">通算スタッツ</h2>
                  <div className="overflow-x-auto">
                    <div className="grid grid-cols-6 gap-2 min-w-[420px] text-center">
                      <div className="border rounded-md p-2">
                        <p className="text-[10px] text-muted-foreground">試合数</p>
                        <p className="text-xl font-bold tabular-nums">{careerStats.appearances}</p>
                      </div>
                      <div className="border rounded-md p-2">
                        <p className="text-[10px] text-muted-foreground">出場時間</p>
                        <p className="text-xl font-bold tabular-nums">{careerStats.minutes}</p>
                      </div>
                      <div className="border rounded-md p-2">
                        <p className="text-[10px] text-muted-foreground">ゴール</p>
                        <p className="text-xl font-bold tabular-nums">{careerStats.goals}</p>
                      </div>
                      <div className="border rounded-md p-2">
                        <p className="text-[10px] text-muted-foreground">アシスト</p>
                        <p className="text-xl font-bold tabular-nums">{careerStats.assists}</p>
                      </div>
                      <div className="border rounded-md p-2">
                        <p className="text-[10px] text-muted-foreground">警告</p>
                        <p className="text-xl font-bold tabular-nums">{careerStats.yellowCards}</p>
                      </div>
                      <div className="border rounded-md p-2">
                        <p className="text-[10px] text-muted-foreground">退場</p>
                        <p className="text-xl font-bold tabular-nums">{careerStats.redCards}</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-8">
                  <h2 className="text-xl font-bold mb-4">パラメーター</h2>
                  <div className="flex flex-col items-center gap-4 rounded-lg border p-4">
                    <PublicPlayerHexChart labels={paramLabels} values={paramValues} overall={overall} />
                    <div className="w-full max-w-[520px]">
                      <PublicPlayerOverallBySeasonChart data={overallSeries} />
                    </div>
                  </div>
                  {!hasParams && <p className="mt-3 text-xs text-muted-foreground">パラメーター未登録</p>}
                </div>

                <PublicPlayerSeasonSummaries rows={seasonSummaries as any} />
              </div>
            </div>
        </div>
      </div>

      <ClubFooter clubId={clubId} clubName={clubName} legalPages={legalPages} />
    </div>
  );
}
