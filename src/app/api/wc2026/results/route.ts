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
    const results = body?.results;
    if (!results || typeof results !== "object") {
      return new NextResponse(JSON.stringify({ message: "results が不正です。" }), { status: 400 });
    }

    await db.collection("wc2026_official_results").doc("v1").set(
      {
        results,
        updatedBy: uid,
        updatedAt: new Date(),
      },
      { merge: true }
    );

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("/api/wc2026/results POST error", e);
    return new NextResponse(JSON.stringify({ message: "サーバーエラーが発生しました。" }), { status: 500 });
  }
}
