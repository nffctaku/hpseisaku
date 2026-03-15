import { NextResponse } from "next/server";
import { db } from "@/lib/firebase/admin";
import { computeWc2026Points } from "@/lib/wc2026/points";

export const runtime = "nodejs";

type OfficialResultsDoc = {
  results?: Record<string, { homeScore: string; awayScore: string }>;
};

type PredictionsDoc = {
  uid?: string;
  matchPredictions?: Record<string, { homeScore: string; awayScore: string; reason?: string }>;
  groupPredictions?: Record<string, string[]>;
};

export async function POST(request: Request) {
  try {
    const resultsSnap = await db.collection("wc2026_official_results").doc("v1").get();
    const resultsDoc = (resultsSnap.exists ? (resultsSnap.data() as OfficialResultsDoc) : null) ?? null;
    const officialResults = (resultsDoc?.results && typeof resultsDoc.results === "object" ? resultsDoc.results : {}) as any;

    const predsSnap = await db.collection("wc2026_predictions").get();

    let processed = 0;
    let updated = 0;

    let batch = db.batch();
    let batchOps = 0;

    for (const docSnap of predsSnap.docs) {
      processed += 1;
      const data = docSnap.data() as PredictionsDoc;
      const uid = docSnap.id;

      const matchPredictions = (data?.matchPredictions && typeof data.matchPredictions === "object" ? data.matchPredictions : {}) as any;
      const groupPredictions = (data?.groupPredictions && typeof data.groupPredictions === "object" ? data.groupPredictions : {}) as any;

      const computed = computeWc2026Points({
        matchPredictions,
        groupPredictions,
        results: officialResults,
      });

      const ref = db.collection("user_points").doc(uid);
      batch.set(
        ref,
        {
          points: computed.totalPoints,
          matchPoints: computed.matchPoints,
          groupPoints: computed.groupPoints,
          displayName: uid,
          updatedAt: new Date(),
          source: "wc2026_batch",
        },
        { merge: true }
      );

      updated += 1;
      batchOps += 1;

      if (batchOps >= 400) {
        await batch.commit();
        batch = db.batch();
        batchOps = 0;
      }
    }

    if (batchOps > 0) {
      await batch.commit();
    }

    return NextResponse.json({ ok: true, processed, updated });
  } catch (e) {
    console.error("/api/wc2026/recompute-points POST error", e);
    return new NextResponse(JSON.stringify({ message: "サーバーエラーが発生しました。" }), { status: 500 });
  }
}
