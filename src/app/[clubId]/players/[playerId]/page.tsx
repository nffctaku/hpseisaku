import { db } from "@/lib/firebase/admin";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { FaXTwitter, FaYoutube, FaTiktok, FaInstagram } from "react-icons/fa6";
import { GiWhistle, GiSoccerBall, GiNotebook } from "react-icons/gi";
import { ClubFooter } from "@/components/club-footer";

interface PlayerPageProps {
  params: { clubId: string; playerId: string };
}

interface LegalPageItem {
  title: string;
  slug: string;
}

function SmallHexIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <polygon
        points="12,2.5 20,7.1 20,16.9 12,21.5 4,16.9 4,7.1"
        stroke="currentColor"
        strokeWidth="2"
        fill="none"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SingleFootIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M32 6c-6 0-11 6-11 14 0 10 5 18 11 18s11-8 11-18C43 12 38 6 32 6z" />
      <path d="M32 39c-5 0-9 5-9 11v6c0 2 2 4 4 4h10c2 0 4-2 4-4v-6c0-6-4-11-9-11z" />
    </svg>
  );
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

function computeOverall(items: PlayerParameterItem[] | undefined): number {
  const vals = (items || [])
    .map((i) => i?.value)
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v))
    .map((v) => clamp99(v));
  if (vals.length === 0) return 0;
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
}

function HexChart({
  labels,
  values,
  overall,
}: {
  labels: string[];
  values: number[];
  overall: number;
}) {
  const size = 240;
  const pad = 44;
  const c = size / 2;
  const r = 86;
  const max = 99;
  const angles = Array.from({ length: 6 }, (_, i) => (-Math.PI / 2) + (i * (Math.PI * 2)) / 6);

  const outerPoints = angles.map((a) => `${c + r * Math.cos(a)},${c + r * Math.sin(a)}`).join(" ");

  const valuePoints = angles
    .map((a, i) => {
      const rr = r * (clamp99(values[i] ?? 0) / max);
      return `${c + rr * Math.cos(a)},${c + rr * Math.sin(a)}`;
    })
    .join(" ");

  const labelPoints = angles.map((a) => {
    const rr = r + 36;
    return {
      x: c + rr * Math.cos(a),
      y: c + rr * Math.sin(a),
      anchor: Math.abs(Math.cos(a)) < 0.2 ? "middle" : Math.cos(a) > 0 ? "start" : "end",
    } as const;
  });

  return (
    <svg width="100%" viewBox={`${-pad} ${-pad} ${size + pad * 2} ${size + pad * 2}`} className="max-w-[360px]">
      <polygon points={outerPoints} fill="none" stroke="#E5E7EB" strokeWidth="2" />
      {[0.2, 0.4, 0.6, 0.8].map((k) => (
        <polygon
          key={k}
          points={angles
            .map((a) => {
              const rr = r * k;
              return `${c + rr * Math.cos(a)},${c + rr * Math.sin(a)}`;
            })
            .join(" ")}
          fill="none"
          stroke="#F3F4F6"
          strokeWidth="2"
        />
      ))}
      {angles.map((a, idx) => (
        <line
          key={idx}
          x1={c}
          y1={c}
          x2={c + r * Math.cos(a)}
          y2={c + r * Math.sin(a)}
          stroke="#F3F4F6"
          strokeWidth="2"
        />
      ))}
      <polygon points={valuePoints} fill="rgba(37,99,235,0.25)" stroke="#2563EB" strokeWidth="2" />
      <text x={c} y={c - 6} textAnchor="middle" fontSize="12" fill="#6B7280">
        総合
      </text>
      <text x={c} y={c + 24} textAnchor="middle" fontSize="32" fontWeight="700" fill="#111827">
        {clamp99(overall)}
      </text>
      {labelPoints.map((p, i) => (
        <text
          key={i}
          x={p.x}
          y={p.y}
          textAnchor={p.anchor}
          dominantBaseline="middle"
          fontSize="11"
          fill="#111827"
        >
          {(labels[i] || "").slice(0, 8) || `項目${i + 1}`}
        </text>
      ))}
    </svg>
  );
}

async function getPlayerStats(ownerUid: string, playerId: string): Promise<PlayerStats> {
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
  for (const teamDoc of (await db.collection(`clubs/${ownerUid}/teams`).get()).docs) {
    const pSnap = await teamDoc.ref.collection("players").doc(playerId).get();
    if (!pSnap.exists) continue;
    const data = pSnap.data() as any;
    const rows = Array.isArray(data?.manualCompetitionStats) ? data.manualCompetitionStats : [];
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
    break;
  }

  for (const competitionDoc of competitionsSnap.docs) {
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

  // 管理画面と同様に、全チームの players サブコレクションから選手を探す
  const teamsSnap = await db.collection(`clubs/${ownerUid}/teams`).get();
  for (const teamDoc of teamsSnap.docs) {
    const playerDocRef = teamDoc.ref.collection("players").doc(playerId);
    const playerSnap = await playerDocRef.get();
    if (playerSnap.exists) {
      return {
        clubName,
        player: playerSnap.data() as PlayerData,
        ownerUid,
        legalPages,
      };
    }
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
  const stats = await getPlayerStats(ownerUid, playerId);
  const registeredSeasonIds = await getRegisteredSeasonIds(ownerUid, playerId, (player as any)?.seasons);
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
    const sd = (seasonData as any)?.[seasonId] || (seasonData as any)?.[slash] || undefined;
    const items = Array.isArray((sd as any)?.params?.items) ? ((sd as any).params.items as any[]) : undefined;
    const manualOverall = (sd as any)?.params?.overall;
    const overallVal =
      typeof manualOverall === "number" && Number.isFinite(manualOverall)
        ? clamp99(manualOverall)
        : computeOverall(items);
    overallBySeason.set(slash, overallVal > 0 ? overallVal : null);
  }

  const seasonSummaries =
    registeredSeasonIds.length > 0
      ? await getPlayerSeasonSummaries(ownerUid, playerId, registeredSeasonIds, manualCompetitionStatsBySeason, legacyManualByCompetitionId, overallBySeason)
      : [];

  const paramItems = Array.isArray(player?.params?.items) ? player.params!.items : [];
  const filledItems = Array.from({ length: 6 }, (_, i) => {
    const item = paramItems?.[i] as any;
    return {
      label: typeof item?.label === "string" ? item.label.slice(0, 8) : "",
      value: typeof item?.value === "number" && Number.isFinite(item.value) ? clamp99(item.value) : 0,
    };
  });
  const paramLabels = filledItems.map((i) => i.label);
  const paramValues = filledItems.map((i) => i.value);
  const overall =
    typeof player?.params?.overall === "number" && Number.isFinite(player.params.overall)
      ? clamp99(player.params.overall)
      : computeOverall(paramItems);
  const hasParams =
    (Array.isArray(paramItems)
      ? paramItems.some((i) => (typeof (i as any)?.label === "string" && ((i as any).label as string).trim().length > 0)) ||
        paramItems.some((i) => typeof (i as any)?.value === "number" && Number.isFinite((i as any).value))
      : false) ||
    (typeof player?.params?.overall === "number" && Number.isFinite(player.params.overall));

  const snsLinks = player.snsLinks || {};
  const snsEntries = [
    { key: "x", label: "X", url: snsLinks.x },
    { key: "youtube", label: "YouTube", url: snsLinks.youtube },
    { key: "tiktok", label: "TikTok", url: snsLinks.tiktok },
    { key: "instagram", label: "Instagram", url: snsLinks.instagram },
  ].filter((e) => typeof e.url === "string" && e.url.trim().length > 0);

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
              <p className="text-2xl font-bold">{player.height ? `${player.height} cm` : 'N/A'}</p>
            </div>
            <div className="border rounded-lg p-4">
              <p className="text-sm text-muted-foreground">年齢</p>
              <p className="text-2xl font-bold">{player.age ? `${player.age} 歳` : 'N/A'}</p>
            </div>
          </div>

          {player.profile && (
            <div className="mt-8">
              <h2 className="text-xl font-bold">プロフィール</h2>
              <p className="mt-2 text-muted-foreground whitespace-pre-wrap">{player.profile}</p>
            </div>
          )}

          {/* Stats Section */}
          <div className="mt-8">
            <h2 className="text-xl font-bold mb-4">シーズンスタッツ</h2>
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

          {hasParams && (
            <div className="mt-8">
              <h2 className="text-xl font-bold mb-4">パラメーター</h2>
              <div className="flex flex-col items-center gap-4 rounded-lg border p-4">
                <HexChart labels={paramLabels} values={paramValues} overall={overall} />
              </div>
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
                {filledItems.map((item, idx) => (
                  <div key={idx} className="border rounded-lg p-3 text-center">
                    <p className="text-sm text-muted-foreground break-words">{item.label || `項目${idx + 1}`}</p>
                    <p className="text-2xl font-bold">{item.value ?? 0}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {seasonSummaries.length > 0 && (
            <div className="mt-8">
              <div className="flex items-end justify-between gap-3">
                <h2 className="text-xl font-bold">シーズン別成績</h2>
              </div>
              <div className="mt-4 overflow-x-auto rounded-lg border">
                <div className="w-full min-w-[360px]">
                  <div className="grid grid-cols-6 items-center bg-muted/30">
                    <div className="p-1.5 text-left text-[10px] text-muted-foreground font-medium whitespace-nowrap">シーズン</div>
                    <div className="p-1.5 text-center text-[10px] text-muted-foreground font-medium whitespace-nowrap" title="試合数" aria-label="試合数">
                      <GiWhistle className="w-4 h-4 inline-block" />
                    </div>
                    <div className="p-1.5 text-center text-[10px] text-muted-foreground font-medium whitespace-nowrap" title="ゴール数" aria-label="ゴール数">
                      <GiSoccerBall className="w-4 h-4 inline-block" />
                    </div>
                    <div className="p-1.5 text-center text-[10px] text-muted-foreground font-medium whitespace-nowrap" title="アシスト数" aria-label="アシスト数">
                      <SingleFootIcon className="w-5 h-5 inline-block" />
                    </div>
                    <div className="p-1.5 text-center text-[10px] text-muted-foreground font-medium whitespace-nowrap" title="評価点" aria-label="評価点">
                      <GiNotebook className="w-4 h-4 inline-block" />
                    </div>
                    <div className="p-1.5 text-center text-[10px] text-muted-foreground font-medium whitespace-nowrap" title="総合値" aria-label="総合値">
                      <SmallHexIcon className="w-4 h-4 inline-block" />
                    </div>
                  </div>

                  <div className="divide-y">
                    {seasonSummaries.map((row) => {
                      const comps = Array.isArray(row.competitions) ? row.competitions : [];
                      const hasBreakdown = row.hasStats && comps.length > 0;
                      return (
                        <details key={row.season} className="group bg-background">
                          <summary className="list-none cursor-pointer select-none">
                            <div className="grid grid-cols-6 items-center">
                              <div className="p-1.5">
                                <div className="flex items-center gap-1">
                                  <span
                                    className={
                                      hasBreakdown
                                        ? "text-[10px] text-muted-foreground group-open:rotate-180 transition-transform"
                                        : "text-[10px] text-muted-foreground opacity-40"
                                    }
                                  >
                                    ▾
                                  </span>
                                  <span className="text-[11px] font-medium">{row.season}</span>
                                </div>
                              </div>
                              <div className="p-1.5 text-center text-[11px] font-semibold tabular-nums">{row.hasStats ? row.matches : "-"}</div>
                              <div className="p-1.5 text-center text-[11px] font-semibold tabular-nums">{row.hasStats ? row.goals : "-"}</div>
                              <div className="p-1.5 text-center text-[11px] font-semibold tabular-nums">{row.hasStats ? row.assists : "-"}</div>
                              <div className="p-1.5 text-center text-[11px] font-semibold tabular-nums">
                                {row.hasStats ? (row.avgRating == null ? "-" : row.avgRating.toFixed(1)) : "-"}
                              </div>
                              <div className="p-1.5 text-center text-[11px] font-semibold tabular-nums">{row.hasStats ? (row.overall == null ? "-" : row.overall) : "-"}</div>
                            </div>
                          </summary>

                          {hasBreakdown ? (
                            <div className="px-1.5 pb-2">
                              <div className="rounded-md border bg-muted/10">
                                <table className="w-full">
                                  <thead className="bg-muted/20">
                                    <tr>
                                      <th className="p-1.5 text-left text-[10px] text-muted-foreground font-medium">大会</th>
                                      <th className="p-1.5 text-center text-[10px] text-muted-foreground font-medium" title="試合数" aria-label="試合数">
                                        <GiWhistle className="w-4 h-4 inline-block" />
                                      </th>
                                      <th className="p-1.5 text-center text-[10px] text-muted-foreground font-medium" title="ゴール数" aria-label="ゴール数">
                                        <GiSoccerBall className="w-4 h-4 inline-block" />
                                      </th>
                                      <th className="p-1.5 text-center text-[10px] text-muted-foreground font-medium" title="アシスト数" aria-label="アシスト数">
                                        <SingleFootIcon className="w-5 h-5 inline-block" />
                                      </th>
                                      <th className="p-1.5 text-center text-[10px] text-muted-foreground font-medium" title="評価点" aria-label="評価点">
                                        <GiNotebook className="w-4 h-4 inline-block" />
                                      </th>
                                      <th className="p-1.5 text-center text-[10px] text-muted-foreground font-medium" title="総合値" aria-label="総合値">
                                        <SmallHexIcon className="w-4 h-4 inline-block" />
                                      </th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y">
                                    {comps.map((c) => (
                                      <tr key={c.competitionId} className="bg-background">
                                        <td className="p-1.5 text-[11px] font-medium">{c.competitionName}</td>
                                        <td className="p-1.5 text-center text-[11px] font-semibold tabular-nums">{c.hasStats ? c.matches : "-"}</td>
                                        <td className="p-1.5 text-center text-[11px] font-semibold tabular-nums">{c.hasStats ? c.goals : "-"}</td>
                                        <td className="p-1.5 text-center text-[11px] font-semibold tabular-nums">{c.hasStats ? c.assists : "-"}</td>
                                        <td className="p-1.5 text-center text-[11px] font-semibold tabular-nums">
                                          {c.hasStats ? (c.avgRating == null ? "-" : c.avgRating.toFixed(1)) : "-"}
                                        </td>
                                        <td className="p-1.5 text-center text-[11px] font-semibold tabular-nums">{c.hasStats ? (c.overall == null ? "-" : c.overall) : "-"}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          ) : null}
                        </details>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

        </div>
      </div>

      <ClubFooter clubId={clubId} legalPages={legalPages} />
    </div>
  );
}
