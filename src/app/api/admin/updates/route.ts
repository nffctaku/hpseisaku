import { NextResponse } from "next/server";
import { db } from "@/lib/firebase/admin";
import { getAuth } from "firebase-admin/auth";
import { FieldValue } from "firebase-admin/firestore";

async function getUidFromRequest(request: Request): Promise<string | null> {
  const authHeader = request.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const idToken = authHeader.substring(7, authHeader.length);
    try {
      const decodedToken = await getAuth().verifyIdToken(idToken);
      return decodedToken.uid;
    } catch {
      return null;
    }
  }
  return null;
}

export async function POST(request: Request) {
  try {
    const uid = await getUidFromRequest(request);
    if (!uid) {
      return new NextResponse(JSON.stringify({ message: "認証されていません。" }), { status: 401 });
    }

    const canPost = uid === "gNDzHTPlzVZK8cOl7ogxQBRvugH2";
    if (!canPost) {
      return new NextResponse(JSON.stringify({ message: "権限がありません。" }), { status: 403 });
    }

    const body = (await request.json().catch(() => null)) as any;
    const linkUrl = typeof body?.linkUrl === "string" ? body.linkUrl.trim() : "";
    const title = typeof body?.title === "string" ? body.title.trim() : "";
    const text = typeof body?.body === "string" ? body.body.trim() : "";

    if (!linkUrl) {
      return new NextResponse(JSON.stringify({ message: "URLが必要です。" }), { status: 400 });
    }

    const safeTitle = title || "アップデート";

    const docRef = db.collection("app_updates").doc();
    await docRef.set(
      {
        title: safeTitle,
        body: text || null,
        linkUrl,
        publishedAt: FieldValue.serverTimestamp(),
        createdBy: uid,
      },
      { merge: true }
    );

    return NextResponse.json({ ok: true, id: docRef.id });
  } catch (e) {
    console.error("[admin/updates] API error", e);
    return new NextResponse(JSON.stringify({ message: "サーバーエラーが発生しました。" }), { status: 500 });
  }
}
