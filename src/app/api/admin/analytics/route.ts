import { NextRequest, NextResponse } from "next/server";
import { db, auth, admin } from "@/lib/firebase/admin";
import { ADMIN_UID } from "@/lib/admin-config";
import {
  aggregateOcrMeasurements,
  aggregateOcrUsageCaps,
  computeOcrConversion,
  computeOcrMatchCross,
  planBucketOf,
  type OcrMeasurementRow,
  type OcrPlanBucket,
  type OcrUsageMonthRow,
} from "@/lib/admin-analytics/ocr-analytics";
import {
  aggregateMatchesByOwner,
  toDateMillis,
} from "@/lib/admin-analytics/uid-analytics";
import {
  buildCareerMaps,
  computeEffectivePlanFromData,
  resolvePathOwnerUid,
} from "@/lib/admin-analytics/career-mapping";
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function normalizeSource(source: unknown): string {
  const s = String(source || "direct").toLowerCase().trim();
  if (["x.com", "twitter.com", "t.co"].includes(s)) return "X";
  if (s.includes("google.com")) return "Google";
  if (s.includes("instagram.com")) return "Instagram";
  if (s === "direct" || !s) return "Direct";
  return s;
}

interface Metrics {
  total: number;
  club: number;
  player: number;
  competition: number;
  match: number;
  paid: number;
  bySource: Record<string, { signups: number; firstMatch: number; paid: number }>;
  sample: { viewedSignups: number; firstMatch: number; paid: number };
}

interface UserRow {
  id: string;
  analyticsCohort?: string;
  acquisition?: {
    firstSource?: string;
    sampleViewed?: boolean;
  };
  activation?: {
    clubCreatedAt?: unknown;
    firstPlayerCreatedAt?: unknown;
    firstCompetitionCreatedAt?: unknown;
    firstMatchCreatedAt?: unknown;
  };
  subscription?: {
    status?: string;
  };
}

function computeMetrics(rows: UserRow[]): Metrics {
  const total = rows.length;
  const club = rows.filter((r) => r.activation?.clubCreatedAt).length;
  const player = rows.filter((r) => r.activation?.firstPlayerCreatedAt).length;
  const competition = rows.filter((r) => r.activation?.firstCompetitionCreatedAt).length;
  const match = rows.filter((r) => r.activation?.firstMatchCreatedAt).length;
  const paid = rows.filter((r) => r.subscription?.status === "pro").length;

  const bySource: Record<string, { signups: number; firstMatch: number; paid: number }> = {};

  for (const r of rows) {
    const key = normalizeSource(r.acquisition?.firstSource);
    if (!bySource[key]) {
      bySource[key] = { signups: 0, firstMatch: 0, paid: 0 };
    }
    bySource[key].signups += 1;
    if (r.activation?.firstMatchCreatedAt) {
      bySource[key].firstMatch += 1;
    }
    if (r.subscription?.status === "pro") {
      bySource[key].paid += 1;
    }
  }

  const sampleViewed = rows.filter((r) => r.acquisition?.sampleViewed === true);
  const sample = {
    viewedSignups: sampleViewed.length,
    firstMatch: sampleViewed.filter((r) => r.activation?.firstMatchCreatedAt).length,
    paid: sampleViewed.filter((r) => r.subscription?.status === "pro").length,
  };

  return { total, club, player, competition, match, paid, bySource, sample };
}

// ===== 画像自動読み取り β セクション =====
// users/{uid}/ocrMeasurements（画像単位ログ）と users/{uid}/usage/ocr_*（月別確定枚数）
// を読み取って集計する。既存データの変更はしない。

const OCR_MONTH_DOC_RE = /^ocr_\d{4}_\d{2}$/;

interface OcrSection {
  users: { all: number; d7: number; d30: number };
  images: { all: number; d7: number; d30: number };
  attemptedImages: { all: number; d7: number; d30: number };
  planUsers: { free: number; paidPro: number; grantedPro: number };
  avgImages: { free: number | null; paidPro: number | null };
  caps: {
    freeReached: number;
    freeReachRate: number | null;
    proGte50: number;
    proGte150: number;
    proGte250: number;
    proReached: number;
  };
  depth: { once: number; twoPlus: number; fivePlus: number };
  funnel: { reviewed: number; applied: number };
  matchCross: { any: number; gte10: number; gte50: number; gte100: number; active7: number; active30: number };
  conversion: { formerFreeNowPaidPro: number; formerFreeCapNowPaidPro: number };
}

async function buildOcrSection(
  usersSnap: FirebaseFirestore.QuerySnapshot,
  last30dEventsSnap: FirebaseFirestore.QuerySnapshot | null
): Promise<OcrSection> {
  const now = Date.now();
  const userDataByUid: Record<string, Record<string, unknown>> = {};
  for (const d of usersSnap.docs) {
    userDataByUid[d.id] = d.data() as Record<string, unknown>;
  }

  const [measurementsSnap, usageSnap, profilesSnap, careersSnap, matchesSnap, friendlySnap, ocrEventsSnap] =
    await Promise.all([
      db.collectionGroup("ocrMeasurements").select(
        "userId", "createdAt", "status", "slotConsumed", "analysisId", "plan", "isPaid", "isGranted"
      ).get(),
      db.collectionGroup("usage").select("count", "plan", "capReachedAt").get(),
      db.collection("club_profiles").get(),
      db.collection("careers").get(),
      db.collectionGroup("matches").get(),
      db.collectionGroup("friendly_matches").get(),
      db.collection("analyticsEvents")
        .where("eventName", "in", ["ocr_review_opened", "ocr_review_confirmed"])
        .select("userId", "eventName")
        .get(),
    ]);

  const measurementRows: OcrMeasurementRow[] = measurementsSnap.docs.map((d) => {
    const data = d.data() as Record<string, unknown>;
    return {
      userId: typeof data.userId === "string" ? data.userId : "",
      createdAtMs: toDateMillis(data.createdAt),
      status: typeof data.status === "string" ? data.status : "",
      slotConsumed: data.slotConsumed === true,
      analysisId: typeof data.analysisId === "string" ? data.analysisId : "",
      plan: typeof data.plan === "string" ? data.plan : undefined,
      isPaid: data.isPaid === true,
      isGranted: data.isGranted === true,
    };
  });

  const monthRows: OcrUsageMonthRow[] = [];
  for (const d of usageSnap.docs) {
    if (!OCR_MONTH_DOC_RE.test(d.id)) continue;
    // users/{uid}/usage/{monthKey} → uidはパス第2セグメント
    const uid = d.ref.parent.parent?.id ?? "";
    if (!uid) continue;
    const data = d.data() as Record<string, unknown>;
    monthRows.push({
      uid,
      monthKey: d.id,
      count: Number(data.count) || 0,
      plan: typeof data.plan === "string" ? data.plan : undefined,
      capReachedAtMs: toDateMillis(data.capReachedAt) || undefined,
    });
  }

  // 現在のeffective plan（転換判定・usage.plan欠損時フォールバック用）
  const profilesByUid = new Map<string, Array<Record<string, unknown>>>();
  for (const d of profilesSnap.docs) {
    const data = d.data() as Record<string, unknown>;
    const uid = typeof data.ownerUid === "string" && data.ownerUid ? data.ownerUid : d.id;
    const list = profilesByUid.get(uid) || [];
    list.push(data);
    profilesByUid.set(uid, list);
  }
  const currentPlanByUid = new Map<string, OcrPlanBucket>();
  const currentPaidProUids = new Set<string>();
  for (const uid of Object.keys(userDataByUid)) {
    const eff = computeEffectivePlanFromData(userDataByUid[uid], profilesByUid.get(uid) ?? []);
    const bucket: OcrPlanBucket = eff.isPaid ? "paid_pro" : eff.isGranted ? "granted_pro" : "free";
    currentPlanByUid.set(uid, bucket);
    if (eff.isPaid) currentPaidProUids.add(uid);
  }

  // usage.plan欠損時のフォールバック：直近measurementのプラン → 現在のeffective plan
  const latestMeasureByUid = new Map<string, OcrMeasurementRow>();
  for (const r of measurementRows) {
    const prev = latestMeasureByUid.get(r.userId);
    if (!prev || r.createdAtMs >= prev.createdAtMs) latestMeasureByUid.set(r.userId, r);
  }
  const planHints = new Map<string, OcrPlanBucket>();
  const usageUids = new Set(monthRows.map((r) => r.uid));
  for (const uid of usageUids) {
    const m = latestMeasureByUid.get(uid);
    planHints.set(uid, m ? planBucketOf(m) : (currentPlanByUid.get(uid) ?? "free"));
  }

  const measAgg = aggregateOcrMeasurements(measurementRows, now);
  const capsAgg = aggregateOcrUsageCaps(monthRows, planHints, undefined, undefined, measAgg.planUsers.free);
  const conversion = computeOcrConversion(measurementRows, currentPaidProUids, capsAgg.freeReachedUids);

  // 試合数クロス集計（clubs/{clubUid}/... → owner uid へ解決）
  const { ownerByClubUid } = buildCareerMaps(careersSnap, userDataByUid);
  const { counts: matchCountByClubUid } = aggregateMatchesByOwner(matchesSnap, friendlySnap);
  const matchCountByUid = new Map<string, number>();
  for (const [clubUidOrUid, count] of Object.entries(matchCountByClubUid)) {
    const uid = resolvePathOwnerUid(clubUidOrUid, ownerByClubUid);
    matchCountByUid.set(uid, (matchCountByUid.get(uid) ?? 0) + count);
  }

  // 直近30日の最終活動（analyticsEvents全イベント。OCR利用UIDの活動判定用）
  const lastActivityMsByUid = new Map<string, number>();
  if (last30dEventsSnap) {
    for (const d of last30dEventsSnap.docs) {
      const data = d.data() as Record<string, unknown>;
      const uid = typeof data.userId === "string" ? data.userId : null;
      const at = toDateMillis(data.createdAt);
      if (uid && at) {
        const prev = lastActivityMsByUid.get(uid) ?? 0;
        if (at > prev) lastActivityMsByUid.set(uid, at);
      }
    }
  }
  const matchCross = computeOcrMatchCross(measAgg.uids, matchCountByUid, lastActivityMsByUid, now);

  // review表示/確定のUID集合
  const reviewedUids = new Set<string>();
  const appliedUids = new Set<string>();
  for (const d of ocrEventsSnap.docs) {
    const data = d.data() as Record<string, unknown>;
    const uid = typeof data.userId === "string" ? data.userId : null;
    if (!uid) continue;
    if (data.eventName === "ocr_review_opened") reviewedUids.add(uid);
    if (data.eventName === "ocr_review_confirmed") appliedUids.add(uid);
  }

  return {
    users: measAgg.users,
    images: measAgg.images,
    attemptedImages: measAgg.attemptedImages,
    planUsers: measAgg.planUsers,
    avgImages: measAgg.avgImages,
    caps: {
      freeReached: capsAgg.freeReached,
      freeReachRate: capsAgg.freeReachRate,
      proGte50: capsAgg.proGte50,
      proGte150: capsAgg.proGte150,
      proGte250: capsAgg.proGte250,
      proReached: capsAgg.proReached,
    },
    depth: measAgg.depth,
    funnel: { reviewed: reviewedUids.size, applied: appliedUids.size },
    matchCross,
    conversion,
  };
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

    const cohort = req.nextUrl.searchParams.get("cohort");
    const trackedOnly = cohort !== "all";

    const usersSnap = await db.collection("users").get();
    const rows = usersSnap.docs.map((d) => ({
      ...(d.data() as Omit<UserRow, "id">),
      id: d.id,
    })) as UserRow[];

    const trackedCount = rows.filter((r) => r.analyticsCohort === "tracked").length;
    const preTrackingCount = rows.length - trackedCount;

    // 直近30日イベント（pre_trackingアクティブ判定とOCRセクションで共有）
    let last30dEventsSnap: FirebaseFirestore.QuerySnapshot | null = null;
    try {
      const since = admin.firestore.Timestamp.fromMillis(Date.now() - THIRTY_DAYS_MS);
      last30dEventsSnap = await db
        .collection("analyticsEvents")
        .where("createdAt", ">=", since)
        .get();
    } catch (e) {
      console.warn("[admin/analytics] events fetch failed", e);
    }

    let preTrackingActiveCount = 0;
    if (preTrackingCount > 0 && last30dEventsSnap) {
      const preTrackingUids = new Set(
        rows
          .filter((r) => r.analyticsCohort !== "tracked")
          .map((r) => r.id)
          .filter(Boolean)
      );
      const activeUids = new Set<string>();
      for (const d of last30dEventsSnap.docs) {
        const userId = d.data().userId as string | undefined;
        if (userId && preTrackingUids.has(userId) && !activeUids.has(userId)) {
          activeUids.add(userId);
        }
      }
      preTrackingActiveCount = activeUids.size;
    }

    const targetRows: UserRow[] = trackedOnly
      ? rows.filter((r) => r.analyticsCohort === "tracked")
      : rows;

    const metrics = computeMetrics(targetRows);

    let ocr: OcrSection | null = null;
    try {
      ocr = await buildOcrSection(usersSnap, last30dEventsSnap);
    } catch (e) {
      console.warn("[admin/analytics] ocr section failed", e);
    }

    return NextResponse.json({
      cohort: trackedOnly ? "tracked" : "all",
      trackedCount,
      preTrackingCount,
      preTrackingActiveCount,
      ...metrics,
      ocr,
    });
  } catch (error) {
    console.error("[admin/analytics] error", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
