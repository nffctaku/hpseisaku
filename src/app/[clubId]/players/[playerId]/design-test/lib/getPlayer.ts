import { db } from "@/lib/firebase/admin";

import { toSlashSeason } from "./season";

export interface LegalPageItem {
  title: string;
  slug: string;
}

const getRosterHits = async (ownerUid: string, playerId: string): Promise<{ seasonId: string; data: any }[]> => {
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
};

async function getLatestRosterPlayer(ownerUid: string, playerId: string): Promise<{ seasonId: string; data: any } | null> {
  const hits = await getRosterHits(ownerUid, playerId);
  if (hits.length === 0) return null;
  const sorted = [...hits].sort((a, b) => toSlashSeason(b.seasonId).localeCompare(toSlashSeason(a.seasonId)));
  return sorted[0] ?? null;
}

function mergeWithoutUndefined(base: any, patch: any): any {
  const out: any = { ...(base || {}) };
  if (!patch || typeof patch !== "object") return out;
  for (const [k, v] of Object.entries(patch)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
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
  return hits * 10_000_000;
}

async function findBestPlayerDoc(
  ownerUid: string,
  playerId: string,
  preferredSeasons?: string[],
  preferredTeamIds?: string[]
): Promise<any | null> {
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

export async function getPlayer(
  clubId: string,
  playerId: string
): Promise<{ clubName: string; player: any; ownerUid: string; legalPages: LegalPageItem[]; gameTeamUsage: boolean; publicPlayerParamsEnabled?: boolean } | null> {
  let clubName = clubId;
  let ownerUid: string | null = null;
  let legalPages: LegalPageItem[] = [];
  let gameTeamUsage = false;
  let publicPlayerParamsEnabled: boolean | undefined = undefined;

  const profilesQuery = db.collection("club_profiles").where("clubId", "==", clubId);
  const profileSnap = await profilesQuery.get();

  if (!profileSnap.empty) {
    const doc = profileSnap.docs[0];
    const data = doc.data() as any;
    ownerUid = (data.ownerUid as string) || doc.id;
    clubName = data.clubName || clubName;
    gameTeamUsage = Boolean((data as any).gameTeamUsage);
    if (typeof (data as any).publicPlayerParamsEnabled === "boolean") {
      publicPlayerParamsEnabled = Boolean((data as any).publicPlayerParamsEnabled);
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
      if (typeof (data as any).publicPlayerParamsEnabled === "boolean") {
        publicPlayerParamsEnabled = Boolean((data as any).publicPlayerParamsEnabled);
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

  let player: any | null = null;
  if (rosterTeamId) {
    const snap = await db.doc(`clubs/${ownerUid}/teams/${rosterTeamId}/players/${playerId}`).get();
    if (snap.exists) player = snap.data() as any;
  }

  if (!player) {
    const preferredSeasons = await getRosterSeasonIdsOnly(ownerUid, playerId);
    const preferredTeams = await getPreferredTeamIdsFromRoster(ownerUid, playerId);
    player = await findBestPlayerDoc(ownerUid, playerId, preferredSeasons, preferredTeams);
  }

  const mergedPlayer = rosterData && player ? (mergeWithoutUndefined(rosterData, player) as any) : player ?? rosterData;

  if (mergedPlayer) {
    return {
      clubName,
      player: mergedPlayer,
      ownerUid,
      legalPages,
      gameTeamUsage,
      publicPlayerParamsEnabled,
    };
  }

  return null;
}
