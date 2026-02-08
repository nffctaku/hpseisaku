import { db } from "@/lib/firebase/admin";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { FaXTwitter, FaYoutube, FaTiktok, FaInstagram } from "react-icons/fa6";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatMoneyWithSymbol } from "@/lib/money";
import { ClubFooter } from "@/components/club-footer";
import { ClubHeader } from "@/components/club-header";
import { PublicPlayerHexChart } from "@/components/public-player-hex-chart";
import { PublicPlayerOverallBySeasonChart } from "@/components/public-player-overall-by-season-chart";
import { PublicPlayerSeasonSummaries } from "@/components/public-player-season-summaries";
import { cache, Suspense } from "react";

export const revalidate = 300;

interface PlayerPageProps {
  params: Promise<{ clubId: string; playerId: string }>;
}

const DETAILED_PITCH_LAYOUT: Array<{ key: string; label: string; grid: string }> = [
  { key: "ST", label: "ST", grid: "col-start-3 row-start-1" },
  { key: "LW", label: "LW", grid: "col-start-1 row-start-1" },
  { key: "RW", label: "RW", grid: "col-start-5 row-start-1" },
  { key: "AM", label: "AM", grid: "col-start-3 row-start-2" },
  { key: "LM", label: "LM", grid: "col-start-1 row-start-3" },
  { key: "CM", label: "CM", grid: "col-start-3 row-start-3" },
  { key: "RM", label: "RM", grid: "col-start-5 row-start-3" },
  { key: "DM", label: "DM", grid: "col-start-3 row-start-4" },
  { key: "LB", label: "LB", grid: "col-start-1 row-start-5" },
  { key: "CB", label: "CB", grid: "col-start-3 row-start-5" },
  { key: "RB", label: "RB", grid: "col-start-5 row-start-5" },
  { key: "GK", label: "GK", grid: "col-start-3 row-start-6" },
];

const DETAILED_PITCH_BOXES: Array<{ key: string; label: string; style: React.CSSProperties }> = [
  { key: "ST", label: "ST", style: { left: "24%", top: "4%", width: "52%", height: "16%" } },
  { key: "LW", label: "LW", style: { left: "4%", top: "4%", width: "21%", height: "26%" } },
  { key: "RW", label: "RW", style: { left: "75%", top: "4%", width: "21%", height: "26%" } },
  { key: "AM", label: "AM", style: { left: "24%", top: "20%", width: "52%", height: "16%" } },
  { key: "LM", label: "LM", style: { left: "4%", top: "30%", width: "21%", height: "26%" } },
  { key: "RM", label: "RM", style: { left: "75%", top: "30%", width: "21%", height: "26%" } },
  { key: "CM", label: "CM", style: { left: "24%", top: "36%", width: "52%", height: "16%" } },
  { key: "DM", label: "DM", style: { left: "24%", top: "52%", width: "52%", height: "16%" } },
  { key: "LB", label: "LB", style: { left: "4%", top: "56%", width: "21%", height: "28%" } },
  { key: "RB", label: "RB", style: { left: "75%", top: "56%", width: "21%", height: "28%" } },
  { key: "CB", label: "CB", style: { left: "24%", top: "68%", width: "52%", height: "16%" } },
  { key: "GK", label: "GK", style: { left: "33%", top: "84%", width: "34%", height: "8%" } },
];

interface LegalPageItem {
  title: string;
  slug: string;
}

function MiniPitch({
  player,
  className,
  pitchClassName,
}: {
  player: PlayerData;
  className?: string;
  pitchClassName?: string;
}) {
  if (!player.mainPosition && !(Array.isArray(player.subPositions) && player.subPositions.length > 0)) {
    return null;
  }

  const main = typeof player.mainPosition === "string" ? player.mainPosition : "";
  const subs = Array.isArray(player.subPositions) ? player.subPositions : [];

  const VIEW_W = 100;
  const VIEW_H = 160;
  const INSET = 4;

  const pctToX = (pct: string | undefined): number => {
    const n = typeof pct === "string" ? parseFloat(pct) : NaN;
    if (!Number.isFinite(n)) return INSET;
    return INSET + (n * (VIEW_W - INSET * 2)) / 100;
  };

  const pctToY = (pct: string | undefined): number => {
    const n = typeof pct === "string" ? parseFloat(pct) : NaN;
    if (!Number.isFinite(n)) return INSET;
    return INSET + (n * (VIEW_H - INSET * 2)) / 100;
  };

  const pctToW = (pct: string | undefined): number => {
    const n = typeof pct === "string" ? parseFloat(pct) : NaN;
    if (!Number.isFinite(n)) return 0;
    return (n * (VIEW_W - INSET * 2)) / 100;
  };

  const pctToH = (pct: string | undefined): number => {
    const n = typeof pct === "string" ? parseFloat(pct) : NaN;
    if (!Number.isFinite(n)) return 0;
    return (n * (VIEW_H - INSET * 2)) / 100;
  };

  return (
    <div className={className}>
      <div className="inline-flex flex-col">
        <div
          className={`relative rounded-md bg-white overflow-hidden flex-shrink-0 ${
            pitchClassName || "w-[200px] h-[260px] sm:w-[220px] sm:h-[286px]"
          }`}
        >
          <svg
            className="absolute inset-0 w-full h-full"
            viewBox="0 0 100 160"
            fill="none"
            aria-hidden="true"
          >
            {/* zones */}
            {DETAILED_PITCH_BOXES.map((p) => {
              const isMain = main === p.key;
              const isSub = subs.includes(p.key);
              const fill = isMain ? "rgba(244,63,94,0.80)" : isSub ? "rgba(244,63,94,0.25)" : "rgba(0,0,0,0.03)";

              const x = pctToX((p.style as any)?.left);
              const y = pctToY((p.style as any)?.top);
              const w = pctToW((p.style as any)?.width);
              const h = pctToH((p.style as any)?.height);

              return (
                <rect
                  key={p.key}
                  x={x}
                  y={y}
                  width={w}
                  height={h}
                  rx="1"
                  fill={fill}
                />
              );
            })}
          </svg>
        </div>
      </div>
    </div>
  );
}

function PositionBadges({ player }: { player: PlayerData }) {
  const main = typeof player.mainPosition === "string" ? player.mainPosition.trim() : "";
  const subs = Array.isArray(player.subPositions)
    ? player.subPositions.filter((p) => typeof p === "string" && p.trim().length > 0).slice(0, 3)
    : [];

  if (!main && subs.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 items-start">
      {main && (
        <span className="inline-flex items-center rounded-full bg-rose-500/90 text-white px-3 py-1 text-sm font-semibold">
          {main}
        </span>
      )}
      {subs.map((p, idx) => (
        <span
          key={`${p}-${idx}`}
          className="inline-flex items-center rounded-full bg-rose-500/25 text-foreground px-3 py-1 text-sm font-semibold"
        >
          {p}
        </span>
      ))}
    </div>
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
  const mShort = season.match(/^(\d{4})-(\d{2})$/);
  if (mShort) return `${mShort[1]}/${mShort[2]}`;
  const m2 = season.match(/^(\d{4})-(\d{2})$/);
  if (m2) return `${m2[1]}/${m2[2]}`;
  const m4 = season.match(/^(\d{4})-(\d{4})$/);
  if (m4) return `${m4[1]}/${m4[2].slice(-2)}`;
  return season;
}

function toDashSeason(season: string): string {
  if (!season) return season;
  if (season.includes("-")) {
    // すでにダッシュ形式の場合はそのまま返す（変換しない）
    return season;
  }
  const mShort = season.match(/^(\d{4})\/(\d{2})$/);
  if (mShort) return `${mShort[1]}-${mShort[2]}`;
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

  const hasSeasonProfile = Object.values(seasonData).some((sd: any) => {
    return (
      (typeof sd?.height === "number" && Number.isFinite(sd.height)) ||
      (typeof sd?.weight === "number" && Number.isFinite(sd.weight)) ||
      (typeof sd?.age === "number" && Number.isFinite(sd.age)) ||
      (typeof sd?.preferredFoot === "string" && String(sd.preferredFoot).trim().length > 0)
    );
  });

  const rootItems = Array.isArray(data?.params?.items) ? (data.params.items as any[]) : [];
  const hasRootParams =
    (typeof data?.params?.overall === "number" && Number.isFinite(data.params.overall)) ||
    rootItems.some((i) => typeof (i as any)?.label === "string" && String((i as any).label).trim().length > 0) ||
    rootItems.some((i) => typeof (i as any)?.value === "number" && Number.isFinite((i as any).value));

  const hasRootProfile =
    (typeof data?.height === "number" && Number.isFinite(data.height)) ||
    (typeof data?.weight === "number" && Number.isFinite(data.weight)) ||
    (typeof data?.age === "number" && Number.isFinite(data.age)) ||
    (typeof data?.preferredFoot === "string" && String(data.preferredFoot).trim().length > 0);

  const seasons = Array.isArray(data?.seasons) ? (data.seasons as string[]) : [];
  const latestSeason = seasons
    .map((s) => (typeof s === "string" ? toSlashSeason(s.trim()) : ""))
    .filter((s) => s.length > 0)
    .sort((a, b) => b.localeCompare(a))[0];
  const latestSeasonScore = latestSeason ? parseInt(latestSeason.slice(0, 4), 10) || 0 : 0;

  return (
    (hasSeasonParams ? 1_000_000 : 0) +
    (hasSeasonProfile ? 500_000 : 0) +
    (hasRootParams ? 100_000 : 0) +
    (hasRootProfile ? 50_000 : 0) +
    latestSeasonScore
  );
}

async function getRosterSeasonIdsOnly(ownerUid: string, playerId: string): Promise<string[]> {
  const hits = await getRosterHits(ownerUid, playerId);
  const rosterSeasonIds = hits.map((h) => h.seasonId);
  const normalized = rosterSeasonIds
    .map((s) => (typeof s === "string" ? s.trim() : ""))
    .filter((s) => s.length > 0)
    .map((s) => toSlashSeason(s));
  normalized.sort((a, b) => b.localeCompare(a));
  return Array.from(new Set(normalized));
}

async function getPreferredTeamIdsFromRoster(ownerUid: string, playerId: string): Promise<string[]> {
  const hits = await getRosterHits(ownerUid, playerId);
  const teamIds: string[] = [];
  for (const h of hits) {
    const teamId = typeof (h.data as any)?.teamId === "string" ? String((h.data as any).teamId).trim() : "";
    if (teamId) teamIds.push(teamId);
  }
  return Array.from(new Set(teamIds));
}

async function getLatestRosterPlayer(ownerUid: string, playerId: string): Promise<{ seasonId: string; data: any } | null> {
  const hits = await getRosterHits(ownerUid, playerId);
  if (hits.length === 0) return null;
  const sorted = [...hits].sort((a, b) => toSlashSeason(b.seasonId).localeCompare(toSlashSeason(a.seasonId)));
  return sorted[0] ?? null;
}

const getRosterHits = cache((ownerUid: string, playerId: string): Promise<{ seasonId: string; data: any }[]> => {
  return (async () => {
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
  })();
});

const getCompetitionsSnap = cache((ownerUid: string) => {
  return db.collection(`clubs/${ownerUid}/competitions`).get();
});

function mergeWithoutUndefined(base: any, patch: any): any {
  const out: any = { ...(base || {}) };
  if (!patch || typeof patch !== "object") return out;
  for (const [k, v] of Object.entries(patch)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

function scorePlayerDocSeasonMatch(data: any, preferredSeasons: string[]): number {
  if (!Array.isArray(preferredSeasons) || preferredSeasons.length === 0) return 0;
  const seasons = Array.isArray(data?.seasons) ? (data.seasons as any[]) : [];
  const seasonDataKeys = data?.seasonData && typeof data.seasonData === "object" ? Object.keys(data.seasonData as any) : [];
  const candidates = Array.from(new Set([...seasons, ...seasonDataKeys]))
    .map((s) => (typeof s === "string" ? toSlashSeason(s.trim()) : ""))
    .filter((s) => s.length > 0);

  let hits = 0;
  for (const ps of preferredSeasons) {
    const psNorm = toSlashSeason(String(ps));
    if (candidates.some((c) => c === psNorm)) hits += 1;
  }
  // 一致数を強く優遇（別チーム同一IDでも正しいシーズンのドキュメントを拾う）
  return hits * 10_000_000;
}

async function findBestPlayerDoc(ownerUid: string, playerId: string, preferredSeasons?: string[], preferredTeamIds?: string[]): Promise<any | null> {
  const teamsSnap = await db.collection(`clubs/${ownerUid}/teams`).get();
  let best: { score: number; data: any } | null = null;

  const preferred = Array.isArray(preferredSeasons) ? preferredSeasons : [];
  const preferredTeams = Array.isArray(preferredTeamIds) ? preferredTeamIds : [];

  const candidateSnaps = await Promise.all(
    teamsSnap.docs.map(async (teamDoc) => {
      const snap = await teamDoc.ref.collection("players").doc(playerId).get();
      return { teamId: teamDoc.id, snap };
    })
  );

  for (const c of candidateSnaps) {
    if (!c.snap.exists) continue;
    const data = c.snap.data() as any;

    const seasonMatchScore = scorePlayerDocSeasonMatch(data, preferred);
    const teamMatchScore = preferredTeams.length > 0 && preferredTeams.includes(c.teamId) ? 100_000_000 : 0;
    const score = scorePlayerDocForPublic(data) + seasonMatchScore + teamMatchScore;

    if (!best || score > best.score) {
      best = { score, data };
    }
  }

  return best?.data ?? null;
}

async function getRegisteredSeasonIds(ownerUid: string, playerId: string, playerSeasons: string[] | undefined): Promise<string[]> {
  const hits = await getRosterHits(ownerUid, playerId);
  const rosterSeasonIds: string[] = hits.map((h) => h.seasonId);

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
  mainPosition?: string;
  subPositions?: string[];
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

async function getPlayerStats(ownerUid: string, playerId: string, playerData: any, targetSeason?: string | null): Promise<PlayerStats> {
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

  const competitionsSnap = await getCompetitionsSnap(ownerUid);

  const manualStatsMap = buildManualStatsMapFromPlayer(playerData, targetSeason);

  const normalizedTargetSeason = typeof targetSeason === "string" && targetSeason.trim().length > 0 ? targetSeason.trim() : null;

  for (const competitionDoc of competitionsSnap.docs) {
    const competitionData = competitionDoc.data() as any;
    const competitionSeason = typeof competitionData?.season === "string" ? competitionData.season : null;
    
    // 強化されたシーズンマッチング
    if (normalizedTargetSeason && competitionSeason) {
      const targetSlash = toSlashSeason(normalizedTargetSeason);
      const targetDash = toDashSeason(normalizedTargetSeason);
      const competitionSlash = toSlashSeason(competitionSeason);
      const competitionDash = toDashSeason(competitionSeason);
      
      const targetFormats = [
        normalizedTargetSeason,
        targetSlash,
        targetDash
      ];
      const competitionFormats = [
        competitionSeason,
        competitionSlash,
        competitionDash
      ];
      
      const isMatch = targetFormats.some(tf => competitionFormats.includes(tf));
      console.log("Final debug - Competition:", {
        competitionId: competitionDoc.id,
        originalCompetitionSeason: competitionSeason,
        normalizedTargetSeason,
        conversions: {
          targetSlash,
          targetDash,
          competitionSlash,
          competitionDash
        },
        targetFormats,
        competitionFormats,
        isMatch
      });
      
      if (!isMatch) {
        continue;
      }
    }
    const manual = manualStatsMap.get(competitionDoc.id);
    const roundsSnap = await competitionDoc.ref.collection('rounds').get();
    const matchesByRound = await Promise.all(
      roundsSnap.docs.map(async (roundDoc) => {
        const matchesSnap = await roundDoc.ref.collection('matches').get();
        return matchesSnap.docs.map((d) => d.data());
      })
    );

    for (const matchData of matchesByRound.flat()) {
      if (!matchData?.playerStats || !Array.isArray(matchData.playerStats)) continue;
      const playerStat = matchData.playerStats.find((stat: any) => stat?.playerId === playerId);
      if (!playerStat) continue;

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

async function PlayerStatsSection({
  ownerUid,
  playerId,
  registeredSeasonIds,
  player,
  currentSeason,
}: {
  ownerUid: string;
  playerId: string;
  registeredSeasonIds: string[];
  player: PlayerData;
  currentSeason?: string | null;
}) {
  const statsSeason = (() => {
    // URLから指定されたシーズンがあればそれを優先、なければ最新シーズン
    if (currentSeason) {
      // 直接マッチング
      if (registeredSeasonIds.includes(currentSeason)) {
        return currentSeason;
      }
      
      // 全ての形式変換でマッチングを試行
      const currentFormats = [
        currentSeason,
        toSlashSeason(currentSeason),
        toDashSeason(currentSeason)
      ];
      
      for (const currentFormat of currentFormats) {
        if (registeredSeasonIds.includes(currentFormat)) {
          return currentFormat;
        }
        
        // 登録されているシーズンも形式変換して比較
        for (const registeredId of registeredSeasonIds) {
          const registeredFormats = [
            registeredId,
            toSlashSeason(registeredId),
            toDashSeason(registeredId)
          ];
          
          if (currentFormats.some(cf => registeredFormats.includes(cf))) {
            return registeredId;
          }
        }
      }
    }
    
    // フォールバック：最新シーズン
    const candidates = Array.isArray(registeredSeasonIds) ? [...registeredSeasonIds] : [];
    candidates.sort((a, b) => toSlashSeason(b).localeCompare(toSlashSeason(a)));
    return candidates.length > 0 ? candidates[0] : null;
  })();

  const [stats, careerStats] = await Promise.all([
    getPlayerStats(ownerUid, playerId, player, statsSeason),
    getPlayerStats(ownerUid, playerId, player, null),
  ]);

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

  const seasonSummaries =
    registeredSeasonIds.length > 0
      ? await getPlayerSeasonSummaries(ownerUid, playerId, registeredSeasonIds, manualCompetitionStatsBySeason, legacyManualByCompetitionId, overallBySeason)
      : [];

  return (
    <>
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

      <PublicPlayerSeasonSummaries rows={seasonSummaries as any} />
    </>
  );
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

  const getCompetitionAgg = (seasonAgg: SeasonAgg, compId: string, compName: string, compLogoUrl?: string): CompetitionAgg => {
    const existing = seasonAgg.competitions.get(compId);
    if (existing) {
      if (!existing.logoUrl && typeof compLogoUrl === "string" && compLogoUrl.trim().length > 0) {
        existing.logoUrl = compLogoUrl;
      }
      return existing;
    }
    const created: CompetitionAgg = { name: compName, logoUrl: compLogoUrl, matches: 0, goals: 0, assists: 0, ratingSum: 0, ratingCount: 0 };
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
    const competitionLogoUrl = typeof compData?.logoUrl === "string" && compData.logoUrl.trim().length > 0 ? compData.logoUrl : undefined;

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

      const compAgg = getCompetitionAgg(seasonAgg, competitionId, competitionName, competitionLogoUrl);
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

        const compAgg = getCompetitionAgg(seasonAgg, competitionId, competitionName, competitionLogoUrl);
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
          competitionLogoUrl: c.logoUrl,
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
): Promise<{
  clubName: string;
  player: PlayerData;
  ownerUid: string;
  legalPages: LegalPageItem[];
  gameTeamUsage: boolean;
  displaySettings: { playerProfileLatest?: boolean };
} | null> {
  let clubName = clubId;
  let ownerUid: string | null = null;
  let legalPages: LegalPageItem[] = [];
  let gameTeamUsage = false;
  let displaySettings: { playerProfileLatest?: boolean } = {};

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
    gameTeamUsage = Boolean((data as any).gameTeamUsage);
    if ((data as any).displaySettings && typeof (data as any).displaySettings === "object") {
      displaySettings = {
        playerProfileLatest: typeof (data as any).displaySettings.playerProfileLatest === "boolean" ? (data as any).displaySettings.playerProfileLatest : undefined,
      };
    }
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
      gameTeamUsage = Boolean((data as any).gameTeamUsage);
      if ((data as any).displaySettings && typeof (data as any).displaySettings === "object") {
        displaySettings = {
          playerProfileLatest: typeof (data as any).displaySettings.playerProfileLatest === "boolean" ? (data as any).displaySettings.playerProfileLatest : undefined,
        };
      }
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

  const rosterLatest = await getLatestRosterPlayer(ownerUid, playerId);
  const rosterData = rosterLatest?.data ?? null;
  const rosterTeamId = typeof (rosterData as any)?.teamId === "string" ? String((rosterData as any).teamId).trim() : "";

  // まず roster 由来の teamId が取れるなら、そのチームの players を直参照する
  let player: any | null = null;
  if (rosterTeamId) {
    const snap = await db.doc(`clubs/${ownerUid}/teams/${rosterTeamId}/players/${playerId}`).get();
    if (snap.exists) player = snap.data() as any;
  }

  // 直参照で取れない場合は、従来のスコアリングでfallback
  if (!player) {
    const preferredSeasons = await getRosterSeasonIdsOnly(ownerUid, playerId);
    const preferredTeams = await getPreferredTeamIdsFromRoster(ownerUid, playerId);
    player = await findBestPlayerDoc(ownerUid, playerId, preferredSeasons, preferredTeams);
  }

  // roster側にプレイヤー情報が入っている場合は不足分を補完（体重/利き足など）
  const mergedPlayer = rosterData && player ? (mergeWithoutUndefined(rosterData, player) as any) : player ?? rosterData;

  if (mergedPlayer) {
    return {
      clubName,
      player: mergedPlayer as PlayerData,
      ownerUid,
      legalPages,
      gameTeamUsage,
      displaySettings,
    };
  }

  return null;
}

export default async function PlayerPage({
  params,
  searchParams,
}: {
  params: Promise<{ clubId: string; playerId: string }>;
  searchParams: Promise<{ season?: string; legacy?: string }>; 
}) {
  const { clubId, playerId } = await params;
  const { season: urlSeason, legacy } = await searchParams;
  const result = await getPlayer(clubId, playerId);
  if (!result) return notFound();

  const { clubName, player, ownerUid, legalPages, gameTeamUsage, displaySettings } = result;

  if (legacy !== "1" && displaySettings?.playerProfileLatest === true) {
    const qs = new URLSearchParams();
    qs.set("design", "new");
    if (typeof urlSeason === "string" && urlSeason.trim().length > 0) {
      qs.set("season", urlSeason);
    }
    redirect(`/${clubId}/players/${playerId}/design-test?${qs.toString()}`);
  }
  const registeredSeasonIds = await getRegisteredSeasonIds(ownerUid, playerId, (player as any)?.seasons);

  const seasonData = (player as any)?.seasonData && typeof (player as any).seasonData === "object" ? ((player as any).seasonData as any) : {};

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
    const last5 = seasons.slice(-5);
    return last5.map((seasonId) => {
      const slash = toSlashSeason(seasonId);
      return {
        season: slash,
        overall: overallBySeason.get(slash) ?? null,
      };
    });
  })();

  // URLで指定されたシーズンを優先的に使用
  const targetSeason = (() => {
    if (!urlSeason || !registeredSeasonIds.length) return null;
    
    // 直接マッチング
    if (registeredSeasonIds.includes(urlSeason)) {
      return urlSeason;
    }
    
    // 全ての形式変換でマッチングを試行
    const urlFormats = [
      urlSeason,
      toSlashSeason(urlSeason),
      toDashSeason(urlSeason)
    ];
    
    for (const urlFormat of urlFormats) {
      if (registeredSeasonIds.includes(urlFormat)) {
        return urlFormat;
      }
      
      // 登録されているシーズンも形式変換して比較
      for (const registeredId of registeredSeasonIds) {
        const registeredFormats = [
          registeredId,
          toSlashSeason(registeredId),
          toDashSeason(registeredId)
        ];
        
        if (urlFormats.some(uf => registeredFormats.includes(uf))) {
          return registeredId;
        }
      }
    }
    
    return null;
  })();
  
  // 現在のシーズンデータを取得
  const currentSeasonData = targetSeason ? getSeasonDataEntry(seasonData as any, targetSeason) : undefined;

  const latestSeasonKeyForParams = (() => {
    if (targetSeason) return targetSeason;
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
    if (targetSeason) return targetSeason;
    const candidates = Array.isArray(registeredSeasonIds) ? [...registeredSeasonIds] : [];
    candidates.sort((a, b) => toSlashSeason(b).localeCompare(toSlashSeason(a)));
    for (const seasonId of candidates) {
      const sd = getSeasonDataEntry(seasonData as any, seasonId);
      const hasAny = (toFiniteNumber((sd as any)?.annualSalary) != null) || (toFiniteNumber((sd as any)?.contractYears) != null);
      if (hasAny) return seasonId;
    }
    return candidates.length > 0 ? candidates[0] : null;
  })();

  const latestSeasonKeyForProfile = (() => {
    if (targetSeason) return targetSeason;
    const candidates = Array.isArray(registeredSeasonIds) ? [...registeredSeasonIds] : [];
    candidates.sort((a, b) => toSlashSeason(b).localeCompare(toSlashSeason(a)));
    for (const seasonId of candidates) {
      const sd = getSeasonDataEntry(seasonData as any, seasonId);
      const hasAny =
        (toFiniteNumber((sd as any)?.height) != null) ||
        (toFiniteNumber((sd as any)?.age) != null) ||
        (toFiniteNumber((sd as any)?.weight) != null) ||
        (typeof (sd as any)?.preferredFoot === "string" && String((sd as any).preferredFoot).trim().length > 0);
      if (hasAny) return seasonId;
    }
    return candidates.length > 0 ? candidates[0] : null;
  })();

  const latestSeasonKeyForWeight = (() => {
    if (targetSeason) return targetSeason;
    const candidates = Array.isArray(registeredSeasonIds) ? [...registeredSeasonIds] : [];
    candidates.sort((a, b) => toSlashSeason(b).localeCompare(toSlashSeason(a)));
    for (const seasonId of candidates) {
      const sd = getSeasonDataEntry(seasonData as any, seasonId);
      if (toFiniteNumber((sd as any)?.weight) != null) return seasonId;
    }
    return null;
  })();

  const latestSeasonKeyForPreferredFoot = (() => {
    if (targetSeason) return targetSeason;
    const candidates = Array.isArray(registeredSeasonIds) ? [...registeredSeasonIds] : [];
    candidates.sort((a, b) => toSlashSeason(b).localeCompare(toSlashSeason(a)));
    for (const seasonId of candidates) {
      const sd = getSeasonDataEntry(seasonData as any, seasonId);
      if (typeof (sd as any)?.preferredFoot === "string" && String((sd as any).preferredFoot).trim().length > 0) return seasonId;
    }
    return null;
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
  const profileSeasonData = latestSeasonKeyForProfile ? getSeasonDataEntry(seasonData as any, latestSeasonKeyForProfile) : undefined;
  const weightSeasonData = latestSeasonKeyForWeight ? getSeasonDataEntry(seasonData as any, latestSeasonKeyForWeight) : undefined;
  const preferredFootSeasonData =
    latestSeasonKeyForPreferredFoot ? getSeasonDataEntry(seasonData as any, latestSeasonKeyForPreferredFoot) : undefined;

  const heightValue =
    toFiniteNumber((profileSeasonData as any)?.height) != null
      ? (toFiniteNumber((profileSeasonData as any)?.height) as number)
      : toFiniteNumber((player as any)?.height) != null
        ? (toFiniteNumber((player as any)?.height) as number)
        : null;
  const ageValue =
    toFiniteNumber((profileSeasonData as any)?.age) != null
      ? (toFiniteNumber((profileSeasonData as any)?.age) as number)
      : toFiniteNumber((player as any)?.age) != null
        ? (toFiniteNumber((player as any)?.age) as number)
        : null;
  const weightValue =
    toFiniteNumber((weightSeasonData as any)?.weight) != null
      ? (toFiniteNumber((weightSeasonData as any)?.weight) as number)
      : toFiniteNumber((player as any)?.weight) != null
        ? (toFiniteNumber((player as any)?.weight) as number)
        : null;
  const preferredFootValue =
    typeof (preferredFootSeasonData as any)?.preferredFoot === "string"
      ? ((preferredFootSeasonData as any).preferredFoot as string)
      : typeof (player as any)?.preferredFoot === "string"
        ? ((player as any).preferredFoot as string)
        : null;
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
  const contractEndDateRaw =
    typeof (contractSeasonData as any)?.contractEndDate === "string"
      ? ((contractSeasonData as any).contractEndDate as string)
      : typeof (player as any)?.contractEndDate === "string"
        ? ((player as any).contractEndDate as string)
        : null;

  const contractEndText = (() => {
    if (!contractEndDateRaw) return null;
    const m = String(contractEndDateRaw).match(/^(\d{4})-(\d{2})$/);
    if (!m) return null;
    const year = Number(m[1]);
    const month = Number(m[2]);
    if (!Number.isFinite(year) || !Number.isFinite(month)) return null;
    return `${year}年${month}月`;
  })();

  const preferredFootText =
    preferredFootValue === "left" ? "左" : preferredFootValue === "right" ? "右" : preferredFootValue === "both" ? "両" : null;

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
                <div className="mx-auto w-full max-w-[260px]">
                  <div className="relative w-full h-52 sm:h-52 md:h-60 rounded-lg border bg-card overflow-hidden">
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
                        <p className="text-7xl font-black text-primary tracking-tighter">
                          {currentSeasonData?.number ?? player.number ?? "-"}
                        </p>
                        <h1 className="mt-4 text-3xl font-bold uppercase text-center break-words">{player.name}</h1>
                      </div>
                    )}
                  </div>

                  <MiniPitch
                    player={player}
                    className="hidden md:block mt-4 w-full"
                    pitchClassName="w-full aspect-[3/4] min-h-[340px]"
                  />
                </div>
              </div>

              <div className="md:col-span-2">
                <p className="text-7xl font-black text-primary tracking-tighter">
                  {currentSeasonData?.number ?? player.number ?? "-"}
                </p>
                <h1 className="text-5xl font-bold uppercase mt-1">{player.name}</h1>
                {player.nationality && <p className="text-xl text-muted-foreground mt-1">{player.nationality}</p>}
                <p className="text-2xl text-muted-foreground mt-0.5">
                  {currentSeasonData?.position ?? player.position ?? ""}
                </p>

                <div className="mt-2 md:hidden flex items-start justify-center gap-4 mx-auto w-full">
                  <MiniPitch
                    player={player}
                    className="shrink-0"
                    pitchClassName="w-[160px] h-[208px]"
                  />
                  <div className="pt-0.5">
                    <PositionBadges player={player} />
                  </div>
                </div>

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
                    <p className="text-2xl font-bold">{heightValue != null ? `${heightValue} cm` : "N/A"}</p>
                  </div>
                  <div className="border rounded-lg p-4">
                    <p className="text-sm text-muted-foreground">年齢</p>
                    <p className="text-2xl font-bold">{ageValue != null ? `${ageValue} 歳` : "N/A"}</p>
                  </div>
                  <div className="border rounded-lg p-4">
                    <p className="text-sm text-muted-foreground">体重</p>
                    <p className="text-2xl font-bold">{weightValue != null ? `${weightValue} kg` : "N/A"}</p>
                  </div>
                  <div className="border rounded-lg p-4">
                    <p className="text-sm text-muted-foreground">利き足</p>
                    <p className="text-2xl font-bold">{preferredFootText ?? "N/A"}</p>
                  </div>
                </div>

                {annualSalary != null || contractEndText != null ? (
                  <div className="mt-4 grid grid-cols-2 gap-4 text-center">
                    {annualSalary != null ? (
                      <div className="border rounded-lg p-4">
                        <p className="text-sm text-muted-foreground">年俸</p>
                        <p className="text-2xl font-bold">
                          {formatMoneyWithSymbol(annualSalary, annualSalaryCurrency)}
                        </p>
                      </div>
                    ) : null}
                    {contractEndText != null ? (
                      <div className="border rounded-lg p-4">
                        <p className="text-sm text-muted-foreground">契約満了日</p>
                        <p className="text-2xl font-bold">{contractEndText}</p>
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

                <div className="mt-8">
                  <h2 className="text-xl font-bold mb-4">パラメーター</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 rounded-lg border p-4 items-start">
                    <div className="flex flex-col items-center gap-4">
                      <PublicPlayerHexChart labels={paramLabels} values={paramValues} overall={overall} />
                    </div>
                    <div className="flex flex-col items-center gap-4">
                      <div className="w-full max-w-[520px]">
                        <PublicPlayerOverallBySeasonChart data={overallSeries} />
                      </div>
                    </div>
                  </div>
                  {!hasParams && <p className="mt-3 text-xs text-muted-foreground">パラメーター未登録</p>}
                </div>

                <Suspense fallback={<div className="mt-8 text-sm text-muted-foreground">スタッツ集計中...</div>}>
                  <PlayerStatsSection 
                    ownerUid={ownerUid} 
                    playerId={playerId} 
                    registeredSeasonIds={registeredSeasonIds} 
                    player={player} 
                    currentSeason={urlSeason}
                  />
                </Suspense>
              </div>
            </div>
        </div>
      </div>

      <ClubFooter clubId={clubId} clubName={clubName} legalPages={legalPages} gameTeamUsage={Boolean(gameTeamUsage)} />
    </div>
  );
}
