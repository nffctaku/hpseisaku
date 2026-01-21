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
    } catch {
      return null;
    }
  }
  return null;
}

async function resolveProfileDocIdsForOwnerUid(uid: string): Promise<string[]> {
  const clubProfilesRef = db.collection("club_profiles");
  const ids = new Set<string>();

  ids.add(uid);

  const ownerSnap = await clubProfilesRef.where("ownerUid", "==", uid).get();
  ownerSnap.forEach((d) => ids.add(d.id));

  const uidDocSnap = await clubProfilesRef.doc(uid).get();
  if (uidDocSnap.exists) {
    const data = uidDocSnap.data() as any;
    if (data && typeof data.clubId === "string" && data.clubId.trim().length > 0) {
      ids.add(data.clubId);
    }
  }

  return Array.from(ids);
}

export async function GET(request: Request) {
  try {
    const uid = await getUidFromRequest(request);
    if (!uid) {
      return new NextResponse(JSON.stringify({ message: "認証されていません。" }), { status: 401 });
    }

    const clubProfilesRef = db.collection("club_profiles");

    const uidSnap = await clubProfilesRef.doc(uid).get();
    if (uidSnap.exists) {
      const data = uidSnap.data() as any;
      return NextResponse.json({ transfersPublic: typeof data?.transfersPublic === "boolean" ? data.transfersPublic : true });
    }

    const ownerSnap = await clubProfilesRef.where("ownerUid", "==", uid).limit(1).get();
    if (!ownerSnap.empty) {
      const data = ownerSnap.docs[0].data() as any;
      return NextResponse.json({ transfersPublic: typeof data?.transfersPublic === "boolean" ? data.transfersPublic : true });
    }

    return NextResponse.json({ transfersPublic: true });
  } catch (e) {
    console.error("[club/transfers-public] GET error", e);
    return new NextResponse(JSON.stringify({ message: "サーバーエラーが発生しました。" }), { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const uid = await getUidFromRequest(request);
    if (!uid) {
      return new NextResponse(JSON.stringify({ message: "認証されていません。" }), { status: 401 });
    }

    const body = await request.json().catch(() => ({} as any));
    const transfersPublic = (body as any)?.transfersPublic;

    if (typeof transfersPublic !== "boolean") {
      return new NextResponse(JSON.stringify({ message: "transfersPublic が不正です。" }), { status: 400 });
    }

    const clubProfilesRef = db.collection("club_profiles");
    const docIds = await resolveProfileDocIdsForOwnerUid(uid);

    await Promise.all(docIds.map((id) => clubProfilesRef.doc(id).set({ ownerUid: uid, transfersPublic }, { merge: true })));

    return NextResponse.json({ transfersPublic });
  } catch (e) {
    console.error("[club/transfers-public] POST error", e);
    return new NextResponse(JSON.stringify({ message: "サーバーエラーが発生しました。" }), { status: 500 });
  }
}
