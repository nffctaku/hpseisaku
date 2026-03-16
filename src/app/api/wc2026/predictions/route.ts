import { NextResponse } from "next/server";
import { db } from "@/lib/firebase/admin";
import { getAuth } from "firebase-admin/auth";
import admin from "firebase-admin";

export const runtime = "nodejs";

async function getUidFromRequest(request: Request): Promise<string | null> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const idToken = authHeader.substring(7);
  try {
    const decodedToken = await getAuth().verifyIdToken(idToken);
    return decodedToken.uid;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  try {
    if (typeof (db as any)?.collection !== "function") {
      return new NextResponse(
        JSON.stringify({
          message: "Firebase Admin が初期化できていません。FIREBASE_SERVICE_ACCOUNT_BASE64 を本番環境の環境変数に設定してください。",
        }),
        { status: 500 }
      );
    }

    const uid = await getUidFromRequest(request);
    if (!uid) {
      return new NextResponse(JSON.stringify({ message: "認証されていません。" }), { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as any;
    const matchPredictions = body?.matchPredictions;
    const groupPredictions = body?.groupPredictions;
    const knockoutPredictions = body?.knockoutPredictions;

    if (!matchPredictions || typeof matchPredictions !== "object") {
      return new NextResponse(JSON.stringify({ message: "matchPredictions が不正です。" }), { status: 400 });
    }
    if (!groupPredictions || typeof groupPredictions !== "object") {
      return new NextResponse(JSON.stringify({ message: "groupPredictions が不正です。" }), { status: 400 });
    }

    let sanitizedKnockout: { championTeamId?: string; top4TeamIds?: string[] } | null = null;
    if (typeof knockoutPredictions !== "undefined") {
      if (!knockoutPredictions || typeof knockoutPredictions !== "object") {
        return new NextResponse(JSON.stringify({ message: "knockoutPredictions が不正です。" }), { status: 400 });
      }
      const championTeamId = typeof knockoutPredictions?.championTeamId === "string" ? knockoutPredictions.championTeamId : "";
      const top4TeamIdsRaw = knockoutPredictions?.top4TeamIds;
      const top4TeamIds = Array.isArray(top4TeamIdsRaw) ? top4TeamIdsRaw.map((x) => String(x || "")).slice(0, 4) : [];
      sanitizedKnockout = { championTeamId, top4TeamIds };
    }

    await db.collection("wc2026_predictions").doc(uid).set(
      {
        uid,
        matchPredictions,
        groupPredictions,
        ...(sanitizedKnockout ? { knockoutPredictions: sanitizedKnockout } : {}),
        updatedAt: new Date(),
      },
      { merge: true }
    );

    const snap = await db.collection("wc2026_predictions").doc(uid).get();
    const firestoreProjectId = (admin.app()?.options as any)?.projectId ?? null;

    return NextResponse.json({ ok: true, uid, exists: snap.exists, firestoreProjectId });
  } catch (e) {
    console.error("/api/wc2026/predictions POST error", e);
    return new NextResponse(JSON.stringify({ message: "サーバーエラーが発生しました。" }), { status: 500 });
  }
}
