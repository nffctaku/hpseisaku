import { NextRequest, NextResponse } from "next/server";
import { auth, db, admin } from "@/lib/firebase/admin";
import { getPlanLimit } from "@/lib/plan-limits";
import { getEffectivePlanForUid } from "@/lib/server-plan";
import { getActiveClubUid } from "@/lib/career-server";

interface CheckResponse {
  allowed: boolean;
  currentCount: number;
  limit: number;
  plan: string;
}

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) {
      return NextResponse.json({ allowed: false, error: "Unauthorized" }, { status: 401 });
    }
    const decoded = await auth.verifyIdToken(token);
    const clubUid = await getActiveClubUid(decoded.uid);

    const { searchParams } = new URL(req.url);
    const teamId = searchParams.get("teamId") || "";
    if (!teamId) {
      return NextResponse.json({ allowed: false, error: "teamId is required" }, { status: 400 });
    }

    const [effectivePlan, playersSnap] = await Promise.all([
      getEffectivePlanForUid(clubUid),
      db.collection(`clubs/${clubUid}/teams/${teamId}/players`).get(),
    ]);

    const { plan, tier } = effectivePlan;
    const limit = getPlanLimit("player_photos_per_team", tier);

    let currentCount = 0;
    for (const d of playersSnap.docs) {
      const data = d.data() as Record<string, unknown>;
      if (typeof data.photoUrl === "string" && data.photoUrl.trim().length > 0) {
        currentCount++;
      }
    }

    const allowed = !Number.isFinite(limit) || currentCount < limit;

    if (!allowed) {
      await db.collection("analyticsEvents").add({
        eventName: "plan_limit_reached",
        userId: clubUid,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        properties: {
          uid: clubUid,
          limitType: "player_photo",
          currentCount,
          limit,
          plan,
          sourcePage: "admin/player-form",
        },
      });
    }

    return NextResponse.json<CheckResponse>({ allowed, currentCount, limit, plan });
  } catch (error) {
    console.error("[API] player photo check error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ allowed: false, error: message }, { status: 500 });
  }
}
