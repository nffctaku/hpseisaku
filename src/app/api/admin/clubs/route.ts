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
  competitionCount: number | null;
  matchCount: number | null;
  newsCount: number | null;
  plan: string;
  analyticsCohort: string;
  isPublic: boolean;
  aggregateAvailable: boolean;
  usageLevel: number | null;
  active7: boolean;
  active30: boolean;
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
      competitionsSnap,
      newsSnap,
      matchesSnap,
      friendlySnap,
      eventsSnap,
    ] = await Promise.all([
      db.collection("club_profiles").get(),
      db.collection("users").get(),
      db.collectionGroup("players").get(),
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

    const playerCountBy: Record<string, number> = {};
    for (const d of playersSnap.docs) {
      const uid = ownerUidFromPath(d.ref.path);
      if (!uid) continue;
      playerCountBy[uid] = (playerCountBy[uid] || 0) + 1;
    }

    const competitionCountBy: Record<string, number> = {};
    for (const d of competitionsSnap.docs) {
      const uid = ownerUidFromPath(d.ref.path);
      if (!uid) continue;
      competitionCountBy[uid] = (competitionCountBy[uid] || 0) + 1;
    }

    const newsCountBy: Record<string, number> = {};
    for (const d of newsSnap.docs) {
      const uid = ownerUidFromPath(d.ref.path);
      if (!uid) continue;
      newsCountBy[uid] = (newsCountBy[uid] || 0) + 1;
    }

    const matchCountBy: Record<string, number> = {};
    for (const d of matchesSnap.docs) {
      const uid = ownerUidFromPath(d.ref.path);
      if (!uid) continue;
      matchCountBy[uid] = (matchCountBy[uid] || 0) + 1;
    }
    for (const d of friendlySnap.docs) {
      const uid = ownerUidFromPath(d.ref.path);
      if (!uid) continue;
      matchCountBy[uid] = (matchCountBy[uid] || 0) + 1;
    }

    const now = Date.now();
    const lastActiveByClub: Record<string, string> = {};
    const active7ByClub: Record<string, boolean> = {};
    const active30ByClub: Record<string, boolean> = {};
    const lastActiveByOwner: Record<string, string> = {};
    const active7ByOwner: Record<string, boolean> = {};
    const active30ByOwner: Record<string, boolean> = {};

    for (const d of eventsSnap.docs) {
      const data = d.data() as Record<string, unknown>;
      const userId = typeof data.userId === "string" ? data.userId : null;
      const clubId = eventClubId(data);
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

      if (clubId) {
        if (!lastActiveByClub[clubId]) lastActiveByClub[clubId] = iso;
        active30ByClub[clubId] = true;
        if (now - time < 7 * 24 * 60 * 60 * 1000) active7ByClub[clubId] = true;
      }

      if (userId) {
        if (!lastActiveByOwner[userId]) lastActiveByOwner[userId] = iso;
        active30ByOwner[userId] = true;
        if (now - time < 7 * 24 * 60 * 60 * 1000) active7ByOwner[userId] = true;
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
      const isUnique = (profileIdsByOwner[ownerUid]?.length || 0) === 1;

      const rawName = data.clubName;
      const nameSet =
        typeof rawName === "string" && rawName.trim().length > 0;
      const clubName = nameSet ? rawName.trim() : "(未設定)";

      const lastLogin = toIso(data.lastLoginAt);
      const created = toIso(data.createdAt);
      const lastActivity =
        lastActiveByClub[publicSlug] ||
        lastActiveByClub[r.id] ||
        (isUnique ? lastActiveByOwner[ownerUid] : null) ||
        lastLogin ||
        created;

      const planRaw = String(data.plan || "free").toLowerCase();
      const plan = planRaw === "officia" ? "officia" : planRaw === "pro" ? "pro" : "free";

      const pCount = isUnique ? playerCountBy[ownerUid] || 0 : null;
      const cCount = isUnique ? competitionCountBy[ownerUid] || 0 : null;
      const mCount = isUnique ? matchCountBy[ownerUid] || 0 : null;
      const nCount = isUnique ? newsCountBy[ownerUid] || 0 : null;

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
        logoUrl: typeof data.logoUrl === "string" ? data.logoUrl : null,
        publicUrl: `/${encodeURIComponent(publicSlug)}`,
        publicSlug,
        ownerUid,
        email: emailMap[ownerUid] || null,
        clubCreatedAt: created,
        lastActivityAt: lastActivity,
        playerCount: pCount,
        competitionCount: cCount,
        matchCount: mCount,
        newsCount: nCount,
        plan,
        analyticsCohort: cohortByUid[ownerUid] || "pre_tracking",
        isPublic: data.isPublic !== false,
        aggregateAvailable: isUnique,
        usageLevel,
        active7,
        active30,
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
    };

    return NextResponse.json({ summary, clubs });
  } catch (error) {
    console.error("[admin/clubs] error", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
