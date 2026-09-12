import { NextRequest, NextResponse } from "next/server";
import { db, auth, admin } from "@/lib/firebase/admin";
import { getPlanLimit } from "@/lib/plan-limits";
import { getEffectivePlanForUid } from "@/lib/server-plan";
import { toDashSeason } from "@/lib/season";
import { touchUserActivity } from "@/lib/server-activity";

interface CompetitionRound {
  name: string;
}

interface CreateCompetitionBody {
  name: string;
  season: string;
  format: "league" | "cup" | "league_cup";
  leagueRounds?: number;
  cupRounds?: CompetitionRound[];
  teams: string[];
  logoUrl?: string;
  showOnHome: boolean;
  showOnTable: boolean;
  rankLabels?: Array<{
    name: string;
    startRank: number;
    endRank: number;
    color: string;
  }>;
}

function removeUndefined(obj: unknown): unknown {
  if (obj === null || obj === undefined) return null;
  if (Array.isArray(obj)) return obj.map(removeUndefined);
  if (typeof obj === "object") {
    const cleaned: Record<string, unknown> = {};
    for (const key in obj as Record<string, unknown>) {
      if ((obj as Record<string, unknown>)[key] !== undefined) {
        cleaned[key] = removeUndefined((obj as Record<string, unknown>)[key]);
      }
    }
    return cleaned;
  }
  return obj;
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    const decoded = await auth.verifyIdToken(token);
    const clubUid = decoded.uid;

    const body: CreateCompetitionBody = await req.json();
    const {
      name,
      season,
      format,
      leagueRounds,
      cupRounds,
      teams,
      logoUrl,
      showOnHome,
      showOnTable,
      rankLabels,
    } = body;

    if (!name || !season || !format || !Array.isArray(teams) || teams.length === 0) {
      return NextResponse.json({ success: false, error: "Invalid input" }, { status: 400 });
    }

    const [effectivePlan, countSnap] = await Promise.all([
      getEffectivePlanForUid(clubUid),
      db.collection(`clubs/${clubUid}/competitions`).where("season", "==", season).count().get(),
    ]);

    const { plan, tier } = effectivePlan;
    const limit = getPlanLimit("competitions_per_season", tier);
    const currentCount = countSnap.data().count;

    if (Number.isFinite(limit) && currentCount >= limit) {
      await db.collection("analyticsEvents").add({
        eventName: "plan_limit_reached",
        userId: clubUid,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        properties: {
          uid: clubUid,
          limitType: "competition",
          currentCount,
          limit,
          plan,
          sourcePage: "admin/competitions/new",
        },
      });
      return NextResponse.json(
        { success: false, error: `このシーズンでは大会は${limit}つまで作成できます。`, limit, currentCount },
        { status: 403 }
      );
    }

    const seasonId = toDashSeason(season.trim());
    const seasonRef = db.collection(`clubs/${clubUid}/seasons`).doc(seasonId);
    const competitionData: Record<string, unknown> = {
      name: String(name).trim(),
      season: String(season),
      format,
      teams,
      logoUrl: logoUrl && logoUrl !== "" ? logoUrl : null,
      showOnHome: !!showOnHome,
      showOnTable: format === "cup" ? false : !!showOnTable,
      rankLabels: format === "cup" ? [] : Array.isArray(rankLabels) ? rankLabels : [],
      ownerUid: clubUid,
      clubProfileId: clubUid,
    };

    const batch = db.batch();
    batch.set(seasonRef, { id: seasonId }, { merge: true });

    if (showOnHome) {
      const homeSnap = await db
        .collection(`clubs/${clubUid}/competitions`)
        .where("showOnHome", "==", true)
        .get();
      homeSnap.docs.forEach((d) => {
        batch.update(d.ref, { showOnHome: false });
      });
    }

    const compRef = db.collection(`clubs/${clubUid}/competitions`).doc();
    const cleanedData = removeUndefined(competitionData) as Record<string, unknown>;
    batch.set(compRef, cleanedData);

    const roundsColRef = compRef.collection("rounds");
    if (format === "league" || format === "league_cup") {
      for (let i = 1; i <= (leagueRounds || 0); i++) {
        const roundDoc = roundsColRef.doc();
        batch.set(roundDoc, { name: `第${i}節` });
      }
    }
    if (format === "cup" || format === "league_cup") {
      (cupRounds || []).forEach((round) => {
        const roundDoc = roundsColRef.doc();
        batch.set(roundDoc, { name: round.name });
      });
    }

    if (currentCount === 0) {
      const firstEventRef = db.collection("analyticsEvents").doc();
      batch.set(firstEventRef, {
        eventName: "competition_create_first",
        userId: clubUid,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        properties: {
          profileId: clubUid,
          ownerUid: clubUid,
          clubProfileId: clubUid,
          competitionId: compRef.id,
        },
      });
      const userRef = db.collection("users").doc(clubUid);
      batch.set(
        userRef,
        { activation: { firstCompetitionCreatedAt: admin.firestore.FieldValue.serverTimestamp() } },
        { merge: true }
      );
    } else {
      const eventRef = db.collection("analyticsEvents").doc();
      batch.set(eventRef, {
        eventName: "competition_create",
        userId: clubUid,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        properties: {
          profileId: clubUid,
          ownerUid: clubUid,
          competitionId: compRef.id,
        },
      });
    }

    await batch.commit();
    await touchUserActivity(clubUid);

    return NextResponse.json({
      success: true,
      competitionId: compRef.id,
      limit,
      currentCount: currentCount + 1,
    });
  } catch (error) {
    console.error("[API] create competition error:", error);
    const message = error instanceof Error ? error.message : "大会の作成に失敗しました";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
