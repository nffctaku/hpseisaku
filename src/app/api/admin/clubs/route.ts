import { NextRequest, NextResponse } from "next/server";
import { db, auth, admin } from "@/lib/firebase/admin";
import { ADMIN_UID } from "@/lib/admin-config";

const ANALYTICS_DAYS = 30;

interface ClubListItem {
  id: string;
  clubName: string;
  nameSet: boolean;
  logoUrl: string | null;
  publicUrl: string;
  publicSlug: string;
  ownerUid: string;
  email: string | null;
  clubCreatedAt: string | null;
  lastActivityAt: string | null;
  playerCount: number | null;
  playerImageCount: number | null;
  playerImageRate: number | null;
  mainTeamName: string | null;
  teamCount: number | null;
  teamImageCount: number | null;
  teamImageRate: number | null;
  competitionCount: number | null;
  matchCount: number | null;
  newsCount: number | null;
  plan: string;
  analyticsCohort: string;
  isPublic: boolean;
  aggregateAvailable: boolean;
  aggregateUnavailableReason: string | null;
  usageLevel: number | null;
  active7: boolean;
  active30: boolean;
  engaged7: boolean;
  engaged30: boolean;
  matchActive7: boolean;
  matchActive30: boolean;
}

interface Summary {
  total: number;
  aggregatable: number;
  nameSet: number;
  nameUnset: number;
  nameUnsetRate: number;
  public: number;
  pro: number;
  free: number;
  active7: number;
  active30: number;
  withMatches: number;
  matches10: number;
  matches50: number;
  matches100: number;
  withMatchesRate: number;
  matches10Rate: number;
  matches50Rate: number;
  matches100Rate: number;
  withPlayerImages10: number;
  withPlayerImages20: number;
  withTeamImages: number;
  withTeamImages5: number;
  withPlayerImages10Rate: number;
  withPlayerImages20Rate: number;
  withTeamImagesRate: number;
  withTeamImages5Rate: number;
  unavailableByReason: Record<string, number>;
  multiClubOwners: number;
  multiClubProfiles: number;
  avgClubsPerMultiOwner: number;
  maxClubsPerOwner: number;
  engaged7: number;
  engaged30: number;
  matchActive7: number;
  matchActive30: number;
}

function toIso(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof admin.firestore.Timestamp) {
    return value.toDate().toISOString();
  }
  if (value instanceof Date) return value.toISOString();
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

function ownerUidFromPath(path: string): string | null {
  const parts = path.split("/");
  return parts.length >= 2 ? parts[1] : null;
}

function eventClubId(data: Record<string, unknown>): string | null {
  if (typeof data.clubId === "string") return data.clubId;
  const props = (data.properties as Record<string, unknown>) || {};
  if (typeof props.clubId === "string") return props.clubId;
  if (typeof props.profileId === "string") return props.profileId;
  return null;
}

function eventClubProfileId(data: Record<string, unknown>): string | null {
  const props = (data.properties as Record<string, unknown>) || {};
  if (typeof props.clubProfileId === "string" && props.clubProfileId.trim()) {
    return props.clubProfileId;
  }
  if (typeof data.clubProfileId === "string" && data.clubProfileId.trim()) {
    return data.clubProfileId;
  }
  return null;
}

function calcUsageLevel(
  playerCount: number,
  competitionCount: number,
  matchCount: number
): number {
  if (matchCount >= 100) return 6;
  if (matchCount >= 50) return 5;
  if (matchCount >= 10) return 4;
  if (matchCount >= 1) return 3;
  if (competitionCount >= 1) return 2;
  if (playerCount >= 1) return 1;
  return 0;
}

function isWithinDays(iso: string | null, now: number, days: number): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  return now - t <= days * 24 * 60 * 60 * 1000;
}

function isValidPlayer(data: Record<string, unknown>): boolean {
  if (data.isDeleted === true) return false;
  if (data.deletedAt != null) return false;
  if (typeof data.name !== "string" || !data.name.trim()) return false;
  return true;
}

function hasTeamLogo(data: Record<string, unknown>): boolean {
  return typeof data.logoUrl === "string" && data.logoUrl.trim().length > 0;
}

function hasPlayerPhoto(data: Record<string, unknown>): boolean {
  if (typeof data.photoUrl === "string" && data.photoUrl.trim()) return true;
  const seasonData =
    data.seasonData && typeof data.seasonData === "object"
      ? (data.seasonData as Record<string, unknown>)
      : null;
  if (!seasonData) return false;
  for (const value of Object.values(seasonData)) {
    if (value && typeof value === "object") {
      const sd = value as Record<string, unknown>;
      if (typeof sd.photoUrl === "string" && sd.photoUrl.trim()) return true;
    }
  }
  return false;
}

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const decoded = await auth.verifyIdToken(token);
    if (decoded.uid !== ADMIN_UID) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const since = admin.firestore.Timestamp.fromMillis(
      Date.now() - ANALYTICS_DAYS * 24 * 60 * 60 * 1000
    );

    const [
      profilesSnap,
      usersSnap,
      playersSnap,
      teamsSnap,
      competitionsSnap,
      newsSnap,
      matchesSnap,
      friendlySnap,
      eventsSnap,
    ] = await Promise.all([
      db.collection("club_profiles").get(),
      db.collection("users").get(),
      db.collectionGroup("players").get(),
      db.collectionGroup("teams").get(),
      db.collectionGroup("competitions").get(),
      db.collectionGroup("news").get(),
      db.collectionGroup("matches").get(),
      db.collectionGroup("friendly_matches").get(),
      db
        .collection("analyticsEvents")
        .where("createdAt", ">=", since)
        .orderBy("createdAt", "desc")
        .get(),
    ]);

    const cohortByUid: Record<string, string> = {};
    for (const d of usersSnap.docs) {
      const c = d.data().analyticsCohort;
      if (typeof c === "string") cohortByUid[d.id] = c;
    }

    const playerStatsByTeam: Record<string, { count: number; imageCount: number }> = {};
    for (const d of playersSnap.docs) {
      const parts = d.ref.path.split("/");
      if (
        parts.length !== 6 ||
        parts[0] !== "clubs" ||
        parts[2] !== "teams" ||
        parts[4] !== "players"
      ) {
        continue;
      }
      const uid = parts[1];
      const teamId = parts[3];
      const data = d.data() as Record<string, unknown>;
      if (!isValidPlayer(data)) continue;

      const key = `${uid}/${teamId}`;
      const prev = playerStatsByTeam[key] || { count: 0, imageCount: 0 };
      playerStatsByTeam[key] = {
        count: prev.count + 1,
        imageCount: prev.imageCount + (hasPlayerPhoto(data) ? 1 : 0),
      };
    }

    const competitionCountBy: Record<string, number> = {};
    const competitionCountByClubProfile: Record<string, number> = {};
    for (const d of competitionsSnap.docs) {
      const uid = ownerUidFromPath(d.ref.path);
      const data = d.data() as Record<string, unknown>;
      if (typeof data.clubProfileId === "string" && data.clubProfileId.trim()) {
        competitionCountByClubProfile[data.clubProfileId] = (competitionCountByClubProfile[data.clubProfileId] || 0) + 1;
      }
      if (uid) {
        competitionCountBy[uid] = (competitionCountBy[uid] || 0) + 1;
      }
    }

    const newsCountBy: Record<string, number> = {};
    const newsCountByClubProfile: Record<string, number> = {};
    for (const d of newsSnap.docs) {
      const uid = ownerUidFromPath(d.ref.path);
      const data = d.data() as Record<string, unknown>;
      if (typeof data.clubProfileId === "string" && data.clubProfileId.trim()) {
        newsCountByClubProfile[data.clubProfileId] = (newsCountByClubProfile[data.clubProfileId] || 0) + 1;
      }
      if (uid) {
        newsCountBy[uid] = (newsCountBy[uid] || 0) + 1;
      }
    }

    const matchCountBy: Record<string, number> = {};
    const matchCountByClubProfile: Record<string, number> = {};
    for (const d of matchesSnap.docs) {
      const uid = ownerUidFromPath(d.ref.path);
      const data = d.data() as Record<string, unknown>;
      if (typeof data.clubProfileId === "string" && data.clubProfileId.trim()) {
        matchCountByClubProfile[data.clubProfileId] = (matchCountByClubProfile[data.clubProfileId] || 0) + 1;
      }
      if (uid) {
        matchCountBy[uid] = (matchCountBy[uid] || 0) + 1;
      }
    }
    for (const d of friendlySnap.docs) {
      const uid = ownerUidFromPath(d.ref.path);
      const data = d.data() as Record<string, unknown>;
      if (typeof data.clubProfileId === "string" && data.clubProfileId.trim()) {
        matchCountByClubProfile[data.clubProfileId] = (matchCountByClubProfile[data.clubProfileId] || 0) + 1;
      }
      if (uid) {
        matchCountBy[uid] = (matchCountBy[uid] || 0) + 1;
      }
    }

    const profileRows = profilesSnap.docs.map((d) => ({
      id: d.id,
      data: d.data() as Record<string, unknown>,
    }));

    const profileIdsByOwner: Record<string, string[]> = {};
    for (const r of profileRows) {
      const ownerUid = String(r.data.ownerUid || r.id);
      profileIdsByOwner[ownerUid] = profileIdsByOwner[ownerUid] || [];
      profileIdsByOwner[ownerUid].push(r.id);
    }

    const uniquePublicSlugByOwner: Record<string, string> = {};
    for (const [uid, ids] of Object.entries(profileIdsByOwner)) {
      if (ids.length === 1) {
        const r = profileRows.find((row) => row.id === ids[0])!;
        uniquePublicSlugByOwner[uid] = String(r.data.clubId || r.id);
      }
    }

    const now = Date.now();
    const lastActiveByClub: Record<string, string> = {};
    const lastActiveByClubProfile: Record<string, string> = {};
    const lastActiveByOwner: Record<string, string> = {};
    const engaged7ByClub: Record<string, boolean> = {};
    const engaged30ByClub: Record<string, boolean> = {};
    const engaged7ByClubProfile: Record<string, boolean> = {};
    const engaged30ByClubProfile: Record<string, boolean> = {};
    const matchActive7ByClub: Record<string, boolean> = {};
    const matchActive30ByClub: Record<string, boolean> = {};
    const matchActive7ByClubProfile: Record<string, boolean> = {};
    const matchActive30ByClubProfile: Record<string, boolean> = {};

    const engagedEventNames = new Set([
      "match_create",
      "match_create_first",
      "competition_create_first",
      "player_create_first",
    ]);
    const matchEventNames = new Set(["match_create", "match_create_first"]);

    for (const d of eventsSnap.docs) {
      const data = d.data() as Record<string, unknown>;
      const userId = typeof data.userId === "string" ? data.userId : null;
      const props = (data.properties as Record<string, unknown>) || {};
      const eventName = typeof data.eventName === "string" ? data.eventName : "";
      const createdAt = data.createdAt;
      let time: number | null = null;
      if (createdAt instanceof admin.firestore.Timestamp) {
        time = createdAt.toMillis();
      } else if (createdAt instanceof Date) {
        time = createdAt.getTime();
      } else if (typeof createdAt === "string" || typeof createdAt === "number") {
        const t = new Date(createdAt).getTime();
        if (!Number.isNaN(t)) time = t;
      }
      if (time === null) continue;
      const iso = new Date(time).toISOString();

      let clubId: string | null = null;
      const directClubProfileId = eventClubProfileId(data);
      const directClubId = eventClubId(data);
      if (directClubProfileId) {
        clubId = directClubProfileId;
      } else if (directClubId) {
        clubId = directClubId;
      } else {
        const candidateUid =
          userId ||
          (typeof props.ownerUid === "string" ? props.ownerUid : null) ||
          (typeof props.profileId === "string" ? props.profileId : null);
        if (candidateUid && uniquePublicSlugByOwner[candidateUid]) {
          clubId = uniquePublicSlugByOwner[candidateUid];
        }
      }

      if (directClubProfileId) {
        if (!lastActiveByClubProfile[directClubProfileId]) lastActiveByClubProfile[directClubProfileId] = iso;
        if (engagedEventNames.has(eventName)) {
          engaged30ByClubProfile[directClubProfileId] = true;
          if (now - time < 7 * 24 * 60 * 60 * 1000) engaged7ByClubProfile[directClubProfileId] = true;
        }
        if (matchEventNames.has(eventName)) {
          matchActive30ByClubProfile[directClubProfileId] = true;
          if (now - time < 7 * 24 * 60 * 60 * 1000) matchActive7ByClubProfile[directClubProfileId] = true;
        }
      } else if (clubId) {
        if (!lastActiveByClub[clubId]) lastActiveByClub[clubId] = iso;
        if (engagedEventNames.has(eventName)) {
          engaged30ByClub[clubId] = true;
          if (now - time < 7 * 24 * 60 * 60 * 1000) engaged7ByClub[clubId] = true;
        }
        if (matchEventNames.has(eventName)) {
          matchActive30ByClub[clubId] = true;
          if (now - time < 7 * 24 * 60 * 60 * 1000) matchActive7ByClub[clubId] = true;
        }
      }

      if (userId) {
        if (!lastActiveByOwner[userId]) lastActiveByOwner[userId] = iso;
      }
    }

    const mainTeamMap = new Map<string, Record<string, unknown>>();
    const teamStatsByUid: Record<string, { count: number; imageCount: number }> = {};
    const teamStatsByClubProfile: Record<string, { count: number; imageCount: number }> = {};
    const teamIdsByClubProfile: Record<string, string[]> = {};
    for (const d of teamsSnap.docs) {
      const parts = d.ref.path.split("/");
      if (
        parts.length !== 4 ||
        parts[0] !== "clubs" ||
        parts[2] !== "teams"
      ) {
        continue;
      }
      const uid = parts[1];
      const data = d.data() as Record<string, unknown>;
      if (data.isDeleted === true || data.deletedAt != null) continue;
      if (typeof data.name !== "string" || !data.name.trim()) continue;

      mainTeamMap.set(`${uid}/${d.id}`, data);

      const prev = teamStatsByUid[uid] || { count: 0, imageCount: 0 };
      teamStatsByUid[uid] = {
        count: prev.count + 1,
        imageCount: prev.imageCount + (hasTeamLogo(data) ? 1 : 0),
      };

      const cpid = typeof data.clubProfileId === "string" ? data.clubProfileId : null;
      if (cpid) {
        const prevByProfile = teamStatsByClubProfile[cpid] || { count: 0, imageCount: 0 };
        teamStatsByClubProfile[cpid] = {
          count: prevByProfile.count + 1,
          imageCount: prevByProfile.imageCount + (hasTeamLogo(data) ? 1 : 0),
        };
        teamIdsByClubProfile[cpid] = teamIdsByClubProfile[cpid] || [];
        teamIdsByClubProfile[cpid].push(d.id);
      }
    }

    const uids = profileRows.map((r) => String(r.data.ownerUid || "")).filter(Boolean);
    const uidSet = Array.from(new Set(uids));
    const emailMap: Record<string, string> = {};

    const uidChunks = chunk(uidSet, 100);
    for (const uidsBatch of uidChunks) {
      const result = await auth.getUsers(uidsBatch.map((uid) => ({ uid })));
      for (const u of result.users) {
        if (u.email) emailMap[u.uid] = u.email;
      }
    }

    const clubs: ClubListItem[] = profileRows.map((r) => {
      const data = r.data;
      const ownerUid = String(data.ownerUid || r.id);
      const publicSlug = String(data.clubId || r.id);
      const profileCountForOwner = profileIdsByOwner[ownerUid]?.length || 0;
      const isUnique = profileCountForOwner === 1;

      const clubProfileId = r.id;
      const hasClubProfileIdData =
        Boolean(teamStatsByClubProfile[clubProfileId]) ||
        Boolean(competitionCountByClubProfile[clubProfileId]) ||
        Boolean(matchCountByClubProfile[clubProfileId]) ||
        Boolean(newsCountByClubProfile[clubProfileId]);
      const canAggregate = isUnique || hasClubProfileIdData;

      const aggregateUnavailableReason = canAggregate
        ? null
        : (typeof data.ownerUid === "string" && data.ownerUid
            ? "MULTIPLE_PROFILES"
            : "NO_OWNER_UID");

      const mainTeamId = typeof data.mainTeamId === "string" ? data.mainTeamId : null;
      const mainTeamData = mainTeamId
        ? mainTeamMap.get(`${ownerUid}/${mainTeamId}`)
        : undefined;

      const rawName = data.clubName;
      const mainTeamName =
        typeof mainTeamData?.name === "string" ? mainTeamData.name.trim() : null;
      const nameSet =
        (typeof rawName === "string" && rawName.trim().length > 0) ||
        Boolean(mainTeamName);
      const clubName =
        (typeof rawName === "string" && rawName.trim()) ||
        mainTeamName ||
        publicSlug ||
        r.id;

      const lastLogin = toIso(data.lastLoginAt);
      const created = toIso(data.createdAt);
      const lastActivity =
        lastActiveByClubProfile[clubProfileId] ||
        lastActiveByClub[publicSlug] ||
        lastActiveByClub[r.id] ||
        (isUnique ? lastActiveByOwner[ownerUid] : null) ||
        lastLogin ||
        created;

      const planRaw = String(data.plan || "free").toLowerCase();
      const plan = planRaw === "officia" ? "officia" : planRaw === "pro" ? "pro" : "free";

      // mainTeamId がなければ clubProfileId に紐づくチームが1つだけならそれを使う
      const uidCandidates = Array.from(new Set([ownerUid, publicSlug].filter(Boolean)));
      const teamIdsForCandidates = new Set<string>();
      for (const uid of uidCandidates) {
        for (const key of Object.keys(playerStatsByTeam)) {
          if (key.startsWith(`${uid}/`)) teamIdsForCandidates.add(key.slice(uid.length + 1));
        }
      }
      const fallbackTeamIds = teamIdsByClubProfile[clubProfileId] || [];
      const targetTeamId =
        mainTeamId ||
        (fallbackTeamIds.length === 1 ? fallbackTeamIds[0] : null) ||
        (teamIdsForCandidates.size === 1 ? Array.from(teamIdsForCandidates)[0] : null);

      let pCount: number | null = null;
      let pImage: number | null = null;
      if (canAggregate && targetTeamId) {
        pCount = 0;
        pImage = 0;
        for (const uid of uidCandidates) {
          const stats = playerStatsByTeam[`${uid}/${targetTeamId}`];
          if (stats) {
            pCount += stats.count;
            pImage += stats.imageCount;
          }
        }
      }

      let tCount: number | null = null;
      let tImage: number | null = null;
      if (canAggregate) {
        const byProfile = teamStatsByClubProfile[clubProfileId];
        if (byProfile) {
          tCount = byProfile.count;
          tImage = byProfile.imageCount;
        } else if (isUnique) {
          tCount = 0;
          tImage = 0;
          for (const uid of uidCandidates) {
            const stats = teamStatsByUid[uid];
            if (stats) {
              tCount += stats.count;
              tImage += stats.imageCount;
            }
          }
        }
      }

      let cCount: number | null = null;
      let mCount: number | null = null;
      let nCount: number | null = null;
      if (canAggregate) {
        const byProfileCompetition = competitionCountByClubProfile[clubProfileId];
        const byProfileMatch = matchCountByClubProfile[clubProfileId];
        const byProfileNews = newsCountByClubProfile[clubProfileId];
        cCount = byProfileCompetition ?? (isUnique ? (competitionCountBy[ownerUid] ?? 0) : 0);
        mCount = byProfileMatch ?? (isUnique ? (matchCountBy[ownerUid] ?? 0) : 0);
        nCount = byProfileNews ?? (isUnique ? (newsCountBy[ownerUid] ?? 0) : 0);
      }

      const usageLevel =
        pCount !== null && cCount !== null && mCount !== null
          ? calcUsageLevel(pCount, cCount, mCount)
          : null;

      const active7 = isWithinDays(lastActivity, now, 7);
      const active30 = isWithinDays(lastActivity, now, 30);

      return {
        id: r.id,
        clubName,
        nameSet,
        logoUrl:
          typeof mainTeamData?.logoUrl === "string"
            ? mainTeamData.logoUrl
            : typeof data.logoUrl === "string"
              ? data.logoUrl
              : null,
        publicUrl: `/${encodeURIComponent(publicSlug)}`,
        publicSlug,
        ownerUid,
        email: emailMap[ownerUid] || null,
        clubCreatedAt: created,
        lastActivityAt: lastActivity,
        playerCount: pCount,
        playerImageCount: pImage,
        playerImageRate:
          pCount !== null && pCount > 0 ? Math.round(((pImage || 0) / pCount) * 1000) / 10 : null,
        mainTeamName: mainTeamName || null,
        teamCount: tCount,
        teamImageCount: tImage,
        teamImageRate:
          tCount !== null && tCount > 0 ? Math.round(((tImage || 0) / tCount) * 1000) / 10 : null,
        competitionCount: cCount,
        matchCount: mCount,
        newsCount: nCount,
        plan,
        analyticsCohort: cohortByUid[ownerUid] || "pre_tracking",
        isPublic: data.isPublic !== false,
        aggregateAvailable: canAggregate,
        aggregateUnavailableReason,
        usageLevel,
        active7,
        active30,
        engaged7:
          engaged7ByClubProfile[clubProfileId] ||
          engaged7ByClub[publicSlug] ||
          engaged7ByClub[r.id] ||
          false,
        engaged30:
          engaged30ByClubProfile[clubProfileId] ||
          engaged30ByClub[publicSlug] ||
          engaged30ByClub[r.id] ||
          false,
        matchActive7:
          matchActive7ByClubProfile[clubProfileId] ||
          matchActive7ByClub[publicSlug] ||
          matchActive7ByClub[r.id] ||
          false,
        matchActive30:
          matchActive30ByClubProfile[clubProfileId] ||
          matchActive30ByClub[publicSlug] ||
          matchActive30ByClub[r.id] ||
          false,
      };
    });

    const aggregatable = clubs.filter((c) => c.aggregateAvailable).length;
    const total = clubs.length;
    const nameSet = clubs.filter((c) => c.nameSet).length;
    const nameUnset = total - nameSet;

    const withMatches = clubs.filter(
      (c) => c.aggregateAvailable && (c.matchCount ?? 0) > 0
    ).length;
    const matches10 = clubs.filter(
      (c) => c.aggregateAvailable && (c.matchCount ?? 0) >= 10
    ).length;
    const matches50 = clubs.filter(
      (c) => c.aggregateAvailable && (c.matchCount ?? 0) >= 50
    ).length;
    const matches100 = clubs.filter(
      (c) => c.aggregateAvailable && (c.matchCount ?? 0) >= 100
    ).length;

    const unavailableByReason: Record<string, number> = {};
    for (const c of clubs) {
      if (c.aggregateAvailable) continue;
      const reason = c.aggregateUnavailableReason || "UNKNOWN";
      unavailableByReason[reason] = (unavailableByReason[reason] || 0) + 1;
    }

    let multiClubOwners = 0;
    let multiClubProfiles = 0;
    let maxClubsPerOwner = 0;
    for (const [, ids] of Object.entries(profileIdsByOwner)) {
      if (ids.length > 1) {
        multiClubOwners += 1;
        multiClubProfiles += ids.length;
      }
      if (ids.length > maxClubsPerOwner) maxClubsPerOwner = ids.length;
    }
    const avgClubsPerMultiOwner =
      multiClubOwners > 0
        ? Math.round((multiClubProfiles / multiClubOwners) * 10) / 10
        : 0;

    const withPlayerImages10 = clubs.filter(
      (c) => c.aggregateAvailable && (c.playerImageCount ?? 0) >= 10
    ).length;
    const withPlayerImages20 = clubs.filter(
      (c) => c.aggregateAvailable && (c.playerImageCount ?? 0) >= 20
    ).length;
    const withTeamImages = clubs.filter(
      (c) => c.aggregateAvailable && (c.teamImageCount ?? 0) >= 1
    ).length;
    const withTeamImages5 = clubs.filter(
      (c) => c.aggregateAvailable && (c.teamImageCount ?? 0) >= 5
    ).length;

    const summary: Summary = {
      total,
      aggregatable,
      nameSet,
      nameUnset,
      nameUnsetRate: total > 0 ? Math.round((nameUnset / total) * 1000) / 10 : 0,
      public: clubs.filter((c) => c.isPublic).length,
      pro: clubs.filter((c) => c.plan === "pro" || c.plan === "officia").length,
      free: clubs.filter((c) => c.plan === "free").length,
      active7: clubs.filter((c) => c.active7).length,
      active30: clubs.filter((c) => c.active30).length,
      withMatches,
      matches10,
      matches50,
      matches100,
      withMatchesRate: aggregatable > 0 ? Math.round((withMatches / aggregatable) * 1000) / 10 : 0,
      matches10Rate: aggregatable > 0 ? Math.round((matches10 / aggregatable) * 1000) / 10 : 0,
      matches50Rate: aggregatable > 0 ? Math.round((matches50 / aggregatable) * 1000) / 10 : 0,
      matches100Rate: aggregatable > 0 ? Math.round((matches100 / aggregatable) * 1000) / 10 : 0,
      withPlayerImages10,
      withPlayerImages20,
      withTeamImages,
      withTeamImages5,
      withPlayerImages10Rate:
        aggregatable > 0 ? Math.round((withPlayerImages10 / aggregatable) * 1000) / 10 : 0,
      withPlayerImages20Rate:
        aggregatable > 0 ? Math.round((withPlayerImages20 / aggregatable) * 1000) / 10 : 0,
      withTeamImagesRate:
        aggregatable > 0 ? Math.round((withTeamImages / aggregatable) * 1000) / 10 : 0,
      withTeamImages5Rate:
        aggregatable > 0 ? Math.round((withTeamImages5 / aggregatable) * 1000) / 10 : 0,
      unavailableByReason,
      multiClubOwners,
      multiClubProfiles,
      avgClubsPerMultiOwner,
      maxClubsPerOwner,
      engaged7: clubs.filter((c) => c.engaged7).length,
      engaged30: clubs.filter((c) => c.engaged30).length,
      matchActive7: clubs.filter((c) => c.matchActive7).length,
      matchActive30: clubs.filter((c) => c.matchActive30).length,
    };

    return NextResponse.json({ summary, clubs });
  } catch (error) {
    console.error("[admin/clubs] error", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
