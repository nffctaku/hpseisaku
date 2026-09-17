import { NextResponse } from "next/server";
import { db } from "@/lib/firebase/admin";
import { getAuth } from "firebase-admin/auth";
import { getActiveClubUid } from "@/lib/career-server";

async function getUidFromRequest(request: Request): Promise<string | null> {
  const authHeader = request.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const idToken = authHeader.substring(7, authHeader.length);
    try {
      const decodedToken = await getAuth().verifyIdToken(idToken);
      return decodedToken.uid;
    } catch (error) {
      console.error("Error verifying auth token:", error);
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

    const body = await request.json().catch(() => ({} as any));
    const playerId = typeof body?.playerId === "string" ? body.playerId.trim() : "";
    if (!playerId) {
      return new NextResponse(JSON.stringify({ message: "playerId が不正です。" }), { status: 400 });
    }

    const clubUid = await getActiveClubUid(uid);

    await db.doc(`clubs/${clubUid}/public_player_stats_cache/${playerId}`).delete();
    
    // public_stats_index キャッシュも削除
    const statsIndexRef = db.collection(`clubs/${clubUid}/public_stats_index`);
    const snapshot = await statsIndexRef.get();
    for (const doc of snapshot.docs) {
      await doc.ref.delete();
    }

    return new NextResponse(JSON.stringify({ message: "ok" }), { status: 200 });
  } catch (error) {
    console.error("invalidate-player-stats-cache error:", error);
    return new NextResponse(JSON.stringify({ message: "サーバーエラーが発生しました。" }), { status: 500 });
  }
}
