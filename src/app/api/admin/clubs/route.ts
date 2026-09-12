import { NextRequest, NextResponse } from "next/server";
import { db, auth, admin } from "@/lib/firebase/admin";
import { ADMIN_UID } from "@/lib/admin-config";
import { scoreRepresentativeProfiles } from "@/lib/representative-profile";
import {
  isNonEmptyString,
  isProPlan,
  ownerUidFromPath,
  validTeam,
  validPlayer,
  validCompetition,
  validMatch,
  hasTeamImage,
  hasPlayerImage,
  computeProStatus,
  computeTeamImageWithFallback,
  type MatchDiagnostic,
} from "@/lib/admin-analytics/uid-analytics";
import { computeLastActivityForUid } from "@/lib/admin-analytics/last-activity";

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
  isPaidPro: boolean;
  isGrantedPro: boolean;
  isFree: boolean;
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
  duplicateProfileCount: number;
  authExists: boolean;
  allProfilePlans: string[];
  allStripeCustomerIds: string[];
  anyProPlan: boolean;
  anyStripeCustomer: boolean;
  lastActivityAtMillis: number;
  activeDetail: {
    lastActivityAt: number;
    eventAt: number;
    userAt: number;
    authAt: number;
    profileAt: number;
    representativeAt: number;
    userCreatedAt: number;
    profileCreatedAt: number;
    profileUpdatedAt: number;
    adoptedAt: number;
  };
}

interface Summary {
  total: number;
  aggregatable: number;
  nameSet: number;
  nameUnset: number;
  nameUnsetRate: number;
  public: number;
  paidPro: number;
  grantedPro: number;
  totalPro: number;
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
  clubProfilesTotal: number;
  reducedDisplayRows: number;
}

function toIso(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0) return null;
    return new Date(value).toISOString();
  }
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
    const userDataByUid: Record<string, Record<string, unknown>> = {};
    for (const d of usersSnap.docs) {
      const data = d.data();
      const c = data.analyticsCohort;
      if (typeof c === "string") cohortByUid[d.id] = c;
      userDataByUid[d.id] = data as Record<string, unknown>;
    }

    const dataCountsByClubProfile: Record<string, number> = {};

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
      if (!validPlayer(data)) continue;

      const key = `${uid}/${teamId}`;
      const prev = playerStatsByTeam[key] || { count: 0, imageCount: 0 };
      playerStatsByTeam[key] = {
        count: prev.count + 1,
        imageCount: prev.imageCount + (hasPlayerImage(data) ? 1 : 0),
      };
      const playerClubProfileId = typeof data.clubProfileId === 'string' ? data.clubProfileId : null;
      if (playerClubProfileId) {
        dataCountsByClubProfile[playerClubProfileId] = (dataCountsByClubProfile[playerClubProfileId] || 0) + 1;
      }
    }

    const competitionCountBy: Record<string, number> = {};
    const competitionCountByClubProfile: Record<string, number> = {};
    for (const d of competitionsSnap.docs) {
      const uid = ownerUidFromPath(d.ref.path);
      const data = d.data() as Record<string, unknown>;
      const isValid = validCompetition(data);
      if (typeof data.clubProfileId === "string" && data.clubProfileId.trim()) {
        competitionCountByClubProfile[data.clubProfileId] = (competitionCountByClubProfile[data.clubProfileId] || 0) + 1;
        dataCountsByClubProfile[data.clubProfileId] = (dataCountsByClubProfile[data.clubProfileId] || 0) + 1;
      }
      if (uid && isValid) {
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
        dataCountsByClubProfile[data.clubProfileId] = (dataCountsByClubProfile[data.clubProfileId] || 0) + 1;
      }
      if (uid) {
        newsCountBy[uid] = (newsCountBy[uid] || 0) + 1;
      }
    }

    const matchCountBy: Record<string, number> = {};
    const matchCountByClubProfile: Record<string, number> = {};
    const matchDiagnostics: Record<string, MatchDiagnostic> = {};

    const processMatch = (d: FirebaseFirestore.QueryDocumentSnapshot, isFriendly: boolean) => {
      const uid = ownerUidFromPath(d.ref.path);
      const data = d.data() as Record<string, unknown>;
      const isValid = validMatch(data);

      if (typeof data.clubProfileId === "string" && data.clubProfileId.trim()) {
        dataCountsByClubProfile[data.clubProfileId] = (dataCountsByClubProfile[data.clubProfileId] || 0) + 1;
      }

      if (uid) {
        const prev = matchDiagnostics[uid] || { total: 0, valid: 0, friendly: 0, invalid: 0 };
        matchDiagnostics[uid] = {
          total: prev.total + 1,
          valid: isValid && !isFriendly ? prev.valid + 1 : prev.valid,
          friendly: isFriendly ? prev.friendly + 1 : prev.friendly,
          invalid: !isValid ? prev.invalid + 1 : prev.invalid,
        };
        if (isValid) {
          matchCountBy[uid] = (matchCountBy[uid] || 0) + 1;
          if (typeof data.clubProfileId === "string" && data.clubProfileId.trim()) {
            matchCountByClubProfile[data.clubProfileId] = (matchCountByClubProfile[data.clubProfileId] || 0) + 1;
          }
        }
      }
    };

    for (const d of matchesSnap.docs) {
      processMatch(d, false);
    }
    for (const d of friendlySnap.docs) {
      processMatch(d, true);
    }

    const profileRows = profilesSnap.docs.map((d) => ({
      id: d.id,
      data: d.data() as Record<string, unknown>,
    }));

    const uidToPlan: Record<string, boolean> = {};
    const uidHasStripeCustomer: Record<string, boolean> = {};
    const uidAllPlans: Record<string, string[]> = {};
    const uidAllStripeCustomerIds: Record<string, string[]> = {};
    for (const r of profileRows) {
      const uid = String(r.data.ownerUid || r.id);
      const data = r.data;
      const planStr = typeof data.plan === 'string' ? data.plan : '';
      uidAllPlans[uid] = uidAllPlans[uid] || [];
      uidAllPlans[uid].push(planStr);
      if (isProPlan(data.plan)) uidToPlan[uid] = true;
      if (isProPlan(data.plan) && isNonEmptyString(data.stripeCustomerId)) {
        uidHasStripeCustomer[uid] = true;
      }
      if (isNonEmptyString(data.stripeCustomerId)) {
        uidAllStripeCustomerIds[uid] = uidAllStripeCustomerIds[uid] || [];
        uidAllStripeCustomerIds[uid].push(data.stripeCustomerId);
      }
    }

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
    const lastEventByOwner: Record<string, number> = {};
    const engaged7ByOwner: Record<string, boolean> = {};
    const engaged30ByOwner: Record<string, boolean> = {};
    const matchActive7ByOwner: Record<string, boolean> = {};
    const matchActive30ByOwner: Record<string, boolean> = {};
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
        if (time > (lastEventByOwner[userId] || 0)) lastEventByOwner[userId] = time;
        if (engagedEventNames.has(eventName)) {
          engaged30ByOwner[userId] = true;
          if (now - time < 7 * 24 * 60 * 60 * 1000) engaged7ByOwner[userId] = true;
        }
        if (matchEventNames.has(eventName)) {
          matchActive30ByOwner[userId] = true;
          if (now - time < 7 * 24 * 60 * 60 * 1000) matchActive7ByOwner[userId] = true;
        }
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
      if (!validTeam(data)) continue;

      mainTeamMap.set(`${uid}/${d.id}`, data);

      const prev = teamStatsByUid[uid] || { count: 0, imageCount: 0 };
      teamStatsByUid[uid] = {
        count: prev.count + 1,
        imageCount: prev.imageCount + (hasTeamImage(data) ? 1 : 0),
      };

      const cpid = typeof data.clubProfileId === "string" ? data.clubProfileId : null;
      if (cpid) {
        const prevByProfile = teamStatsByClubProfile[cpid] || { count: 0, imageCount: 0 };
        teamStatsByClubProfile[cpid] = {
          count: prevByProfile.count + 1,
          imageCount: prevByProfile.imageCount + (hasTeamImage(data) ? 1 : 0),
        };
        teamIdsByClubProfile[cpid] = teamIdsByClubProfile[cpid] || [];
        teamIdsByClubProfile[cpid].push(d.id);
        dataCountsByClubProfile[cpid] = (dataCountsByClubProfile[cpid] || 0) + 1;
      }
    }

    const uids = profileRows.map((r) => String(r.data.ownerUid || "")).filter(Boolean);
    const uidSet = Array.from(new Set(uids));
    const emailMap: Record<string, string> = {};
    const authUserUids = new Set<string>();

    const authLastSignInByUid: Record<string, string> = {};
    const uidChunks = chunk(uidSet, 100);
    for (const uidsBatch of uidChunks) {
      const result = await auth.getUsers(uidsBatch.map((uid) => ({ uid })));
      for (const u of result.users) {
        authUserUids.add(u.uid);
        if (u.email) emailMap[u.uid] = u.email;
        const lastSignInTime = (u.metadata as unknown as { lastSignInTime?: string }).lastSignInTime;
        if (lastSignInTime) authLastSignInByUid[u.uid] = lastSignInTime;
      }
    }

    const profileDocById: Record<string, FirebaseFirestore.QueryDocumentSnapshot> = {};
    for (const d of profilesSnap.docs) {
      profileDocById[d.id] = d;
    }

    let missingActivityCount = 0;
    const clubs: ClubListItem[] = Object.keys(profileIdsByOwner).map((ownerUid) => {
      const profileIds = profileIdsByOwner[ownerUid];
      const docs = profileIds.map((id) => profileDocById[id]);
      const ranked = scoreRepresentativeProfiles(docs, { dataCountsByClubProfile, now });
      const rep = ranked[0];
      const repData = rep.data as Record<string, unknown>;
      const repId = rep.id;
      const duplicateProfileCount = profileIds.length;

      const publicSlug = String(repData.clubId || repId);
      const mainTeamId = typeof repData.mainTeamId === "string" ? repData.mainTeamId : null;
      const mainTeamData = mainTeamId
        ? mainTeamMap.get(`${ownerUid}/${mainTeamId}`)
        : undefined;

      const rawName = repData.clubName;
      const mainTeamName =
        typeof mainTeamData?.name === "string" ? mainTeamData.name.trim() : null;
      const nameSet =
        (typeof rawName === "string" && rawName.trim().length > 0) ||
        Boolean(mainTeamName);
      const clubName =
        (typeof rawName === "string" && rawName.trim()) ||
        mainTeamName ||
        publicSlug ||
        repId;

      const created = toIso(repData.createdAt);

      const profileDocsForUid = profileIds.map((id) => profileDocById[id].data() as Record<string, unknown>);
      const { lastActivityAt: lastActivityAtMillis, active7, active30, sources } = computeLastActivityForUid({
        userData: userDataByUid[ownerUid],
        authLastSignInAt: authLastSignInByUid[ownerUid],
        profileDocs: profileDocsForUid,
        lastEventAt: lastEventByOwner[ownerUid],
        now,
      });

      const activeDetail = {
        lastActivityAt: sources.lastActivityAt ?? 0,
        eventAt: sources.eventAt ?? 0,
        userAt: sources.userAt ?? 0,
        authAt: sources.authAt ?? 0,
        profileAt: sources.profileAt ?? 0,
        representativeAt: sources.representativeAt ?? 0,
        userCreatedAt: sources.userCreatedAt ?? 0,
        profileCreatedAt: sources.profileCreatedAt ?? 0,
        profileUpdatedAt: sources.profileUpdatedAt ?? 0,
        adoptedAt: lastActivityAtMillis ?? 0,
      };
      const lastActivity = toIso(lastActivityAtMillis) || created;
      const lastActivityAtMillisValue = (lastActivityAtMillis ?? 0) as number;

      if (missingActivityCount < 5) {
        missingActivityCount += 1;
        console.warn('[internal-clubs] lastActivityAt debug', {
          uid: ownerUid,
          email: emailMap[ownerUid] || null,
          lastActivityAt: lastActivityAtMillis,
          lastActivityString: lastActivity,
          profileIds,
          representativeId: repId,
          sources,
          created,
        });
      }

      const proStatus = computeProStatus(ownerUid, {
        userSubscription: userDataByUid[ownerUid]?.subscription as { status?: string } | undefined,
        uidHasStripeCustomer,
        uidToPlan,
      });
      const { isPaidPro, isGrantedPro, isFree, plan } = proStatus;

      // UID 単位で安全に集約（legacy は path uid、新データは clubProfileId だが path 集計に含まれる）
      const pCount = Object.entries(playerStatsByTeam)
        .filter(([key]) => key.startsWith(`${ownerUid}/`))
        .reduce((sum, [, v]) => sum + v.count, 0);
      const pImage = Object.entries(playerStatsByTeam)
        .filter(([key]) => key.startsWith(`${ownerUid}/`))
        .reduce((sum, [, v]) => sum + v.imageCount, 0);
      const tCount = teamStatsByUid[ownerUid]?.count ?? 0;
      const ownTeamImageCount = teamStatsByUid[ownerUid]?.imageCount ?? 0;
      const clubLogoUrl = typeof repData.logoUrl === 'string' && repData.logoUrl.trim() ? repData.logoUrl.trim() : null;
      const mainTeamLogoUrl = typeof mainTeamData?.logoUrl === 'string' ? mainTeamData.logoUrl.trim() : null;

      const tImage = computeTeamImageWithFallback(ownTeamImageCount, tCount, {
        mainTeamId,
        mainTeamLogoUrl,
        clubLogoUrl,
      });

      const cCount = competitionCountBy[ownerUid] ?? 0;
      const mCount = matchCountBy[ownerUid] ?? 0;
      const nCount = newsCountBy[ownerUid] ?? 0;

      const usageLevel = calcUsageLevel(pCount, cCount, mCount);

      return {
        id: ownerUid,
        clubName,
        nameSet,
        logoUrl:
          typeof mainTeamData?.logoUrl === "string"
            ? mainTeamData.logoUrl
            : typeof repData.logoUrl === "string"
              ? repData.logoUrl
              : null,
        publicUrl: `/${encodeURIComponent(publicSlug)}`,
        publicSlug,
        ownerUid,
        email: emailMap[ownerUid] || null,
        clubCreatedAt: created,
        lastActivityAt: lastActivity,
        lastActivityAtMillis: lastActivityAtMillisValue,
        activeDetail,
        playerCount: pCount,
        playerImageCount: pImage,
        playerImageRate: pCount > 0 ? Math.round((pImage / pCount) * 1000) / 10 : null,
        mainTeamName: mainTeamName || null,
        teamCount: tCount,
        teamImageCount: tImage,
        teamImageRate: tCount > 0 ? Math.round((tImage / tCount) * 1000) / 10 : null,
        competitionCount: cCount,
        matchCount: mCount,
        newsCount: nCount,
        isPaidPro,
        isGrantedPro,
        isFree,
        plan,
        analyticsCohort: cohortByUid[ownerUid] || "pre_tracking",
        isPublic: repData.isPublic !== false,
        aggregateAvailable: true,
        aggregateUnavailableReason: null,
        usageLevel,
        active7,
        active30,
        engaged7: engaged7ByOwner[ownerUid] || false,
        engaged30: engaged30ByOwner[ownerUid] || false,
        matchActive7: matchActive7ByOwner[ownerUid] || false,
        matchActive30: matchActive30ByOwner[ownerUid] || false,
        duplicateProfileCount,
        authExists: authUserUids.has(ownerUid),
        allProfilePlans: uidAllPlans[ownerUid] || [],
        allStripeCustomerIds: uidAllStripeCustomerIds[ownerUid] || [],
        anyProPlan: !!uidToPlan[ownerUid],
        anyStripeCustomer: !!uidHasStripeCustomer[ownerUid],
      };
    });

    const authClubs = clubs.filter((c) => c.authExists);
    const authlessUids = clubs.filter((c) => !c.authExists).map((c) => c.ownerUid);

    const total = authClubs.length;
    const aggregatable = total;
    const nameSet = authClubs.filter((c) => c.nameSet).length;
    const nameUnset = total - nameSet;

    const withMatches = authClubs.filter((c) => (c.matchCount ?? 0) > 0).length;
    const matches10 = authClubs.filter((c) => (c.matchCount ?? 0) >= 10).length;
    const matches50 = authClubs.filter((c) => (c.matchCount ?? 0) >= 50).length;
    const matches100 = authClubs.filter((c) => (c.matchCount ?? 0) >= 100).length;

    let multiClubOwners = 0;
    let multiClubProfiles = 0;
    let maxClubsPerOwner = 0;
    for (const c of authClubs) {
      const ids = profileIdsByOwner[c.ownerUid];
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

    const withPlayerImages10 = authClubs.filter(
      (c) => (c.playerImageCount ?? 0) >= 10
    ).length;
    const withPlayerImages20 = authClubs.filter(
      (c) => (c.playerImageCount ?? 0) >= 20
    ).length;
    const withTeamImages = authClubs.filter(
      (c) => (c.teamImageCount ?? 0) >= 1
    ).length;
    const withTeamImages5 = authClubs.filter(
      (c) => (c.teamImageCount ?? 0) >= 5
    ).length;

    const clubProfilesTotal = profileRows.length;
    const reducedDisplayRows = clubProfilesTotal - total;
    const paidPro = authClubs.filter((c) => c.isPaidPro).length;
    const grantedPro = authClubs.filter((c) => c.isGrantedPro).length;
    const totalPro = paidPro + grantedPro;

    const summary: Summary = {
      total,
      aggregatable,
      nameSet,
      nameUnset,
      nameUnsetRate: total > 0 ? Math.round((nameUnset / total) * 1000) / 10 : 0,
      public: authClubs.filter((c) => c.isPublic).length,
      paidPro,
      grantedPro,
      totalPro,
      free: authClubs.filter((c) => c.isFree).length,
      active7: authClubs.filter((c) => c.active7).length,
      active30: authClubs.filter((c) => c.active30).length,
      withMatches,
      matches10,
      matches50,
      matches100,
      withMatchesRate: total > 0 ? Math.round((withMatches / total) * 1000) / 10 : 0,
      matches10Rate: total > 0 ? Math.round((matches10 / total) * 1000) / 10 : 0,
      matches50Rate: total > 0 ? Math.round((matches50 / total) * 1000) / 10 : 0,
      matches100Rate: total > 0 ? Math.round((matches100 / total) * 1000) / 10 : 0,
      withPlayerImages10,
      withPlayerImages20,
      withTeamImages,
      withTeamImages5,
      withPlayerImages10Rate:
        total > 0 ? Math.round((withPlayerImages10 / total) * 1000) / 10 : 0,
      withPlayerImages20Rate:
        total > 0 ? Math.round((withPlayerImages20 / total) * 1000) / 10 : 0,
      withTeamImagesRate:
        total > 0 ? Math.round((withTeamImages / total) * 1000) / 10 : 0,
      withTeamImages5Rate:
        total > 0 ? Math.round((withTeamImages5 / total) * 1000) / 10 : 0,
      unavailableByReason: {},
      multiClubOwners,
      multiClubProfiles,
      avgClubsPerMultiOwner,
      maxClubsPerOwner,
      engaged7: authClubs.filter((c) => c.engaged7).length,
      engaged30: authClubs.filter((c) => c.engaged30).length,
      matchActive7: authClubs.filter((c) => c.matchActive7).length,
      matchActive30: authClubs.filter((c) => c.matchActive30).length,
      clubProfilesTotal,
      reducedDisplayRows,
    };

    return NextResponse.json({ summary, clubs, authlessUids, matchDiagnostics });
  } catch (error) {
    console.error("[admin/clubs] error", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
