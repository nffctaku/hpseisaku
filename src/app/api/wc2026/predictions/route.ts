import { NextResponse } from "next/server";
import { db } from "@/lib/firebase/admin";
import { getAuth } from "firebase-admin/auth";

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
    const uid = await getUidFromRequest(request);
    if (!uid) {
      return new NextResponse(JSON.stringify({ message: "認証されていません。" }), { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as any;
    const matchPredictions = body?.matchPredictions;
    const groupPredictions = body?.groupPredictions;

    if (!matchPredictions || typeof matchPredictions !== "object") {
      return new NextResponse(JSON.stringify({ message: "matchPredictions が不正です。" }), { status: 400 });
    }
    if (!groupPredictions || typeof groupPredictions !== "object") {
      return new NextResponse(JSON.stringify({ message: "groupPredictions が不正です。" }), { status: 400 });
    }

    await db.collection("wc2026_predictions").doc(uid).set(
      {
        uid,
        matchPredictions,
        groupPredictions,
        updatedAt: new Date(),
      },
      { merge: true }
    );

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("/api/wc2026/predictions POST error", e);
    return new NextResponse(JSON.stringify({ message: "サーバーエラーが発生しました。" }), { status: 500 });
  }
}
