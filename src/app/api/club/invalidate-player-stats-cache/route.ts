import { NextResponse } from "next/server";
import { db } from "@/lib/firebase/admin";
import { getAuth } from "firebase-admin/auth";

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

async function resolveOwnerUidFromUid(uid: string): Promise<string | null> {
  const direct = await db.collection("club_profiles").doc(uid).get();
  if (direct.exists) {
    const data = direct.data() as any;
    return (data?.ownerUid as string) || uid;
  }

  const ownerQuery = await db.collection("club_profiles").where("ownerUid", "==", uid).limit(1).get();
  if (!ownerQuery.empty) {
    const doc = ownerQuery.docs[0];
    const data = doc.data() as any;
    return (data?.ownerUid as string) || doc.id;
  }

  const adminQuery = await db.collection("club_profiles").where("admins", "array-contains", uid).limit(1).get();
  if (!adminQuery.empty) {
    const doc = adminQuery.docs[0];
    const data = doc.data() as any;
    return (data?.ownerUid as string) || doc.id;
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

    const ownerUid = await resolveOwnerUidFromUid(uid);
    if (!ownerUid) {
      return new NextResponse(JSON.stringify({ message: "クラブ情報が見つかりません。" }), { status: 404 });
    }

    await db.doc(`clubs/${ownerUid}/public_player_stats_cache/${playerId}`).delete();

    return new NextResponse(JSON.stringify({ message: "ok" }), { status: 200 });
  } catch (error) {
    console.error("invalidate-player-stats-cache error:", error);
    return new NextResponse(JSON.stringify({ message: "サーバーエラーが発生しました。" }), { status: 500 });
  }
}
