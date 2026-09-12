import { NextRequest, NextResponse } from "next/server";
import { db, auth, admin } from "@/lib/firebase/admin";
import { ADMIN_UID } from "@/lib/admin-config";
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

    let preTrackingActiveCount = 0;
    if (preTrackingCount > 0) {
      try {
        const preTrackingUids = new Set(
          rows
            .filter((r) => r.analyticsCohort !== "tracked")
            .map((r) => r.id)
            .filter(Boolean)
        );
        const since = admin.firestore.Timestamp.fromMillis(Date.now() - THIRTY_DAYS_MS);
        const eventsSnap = await db
          .collection("analyticsEvents")
          .where("createdAt", ">=", since)
          .get();
        const activeUids = new Set<string>();
        for (const d of eventsSnap.docs) {
          const userId = d.data().userId as string | undefined;
          if (userId && preTrackingUids.has(userId) && !activeUids.has(userId)) {
            activeUids.add(userId);
          }
        }
        preTrackingActiveCount = activeUids.size;
      } catch (e) {
        console.warn("[admin/analytics] pre_tracking active count failed", e);
      }
    }

    const targetRows: UserRow[] = trackedOnly
      ? rows.filter((r) => r.analyticsCohort === "tracked")
      : rows;

    const metrics = computeMetrics(targetRows);

    return NextResponse.json({
      cohort: trackedOnly ? "tracked" : "all",
      trackedCount,
      preTrackingCount,
      preTrackingActiveCount,
      ...metrics,
    });
  } catch (error) {
    console.error("[admin/analytics] error", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
