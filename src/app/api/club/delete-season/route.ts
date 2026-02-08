import { NextResponse } from "next/server";
import { db } from "@/lib/firebase/admin";
import { getAuth } from "firebase-admin/auth";
import { FieldPath, FieldValue } from "firebase-admin/firestore";
import { toDashSeason, toSlashSeason } from "@/lib/season";

export const runtime = "nodejs";

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

function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

async function commitInBatches(ops: Array<(b: FirebaseFirestore.WriteBatch) => void>) {
  // Keep below Firestore batch limit (500)
  const chunks = chunkArray(ops, 450);
  for (const c of chunks) {
    const batch = db.batch();
    for (const op of c) op(batch);
    await batch.commit();
  }
}

export async function POST(request: Request) {
  try {
    const uid = await getUidFromRequest(request);
    if (!uid) {
      return new NextResponse(JSON.stringify({ message: "認証されていません。" }), { status: 401 });
    }

    const body = await request.json().catch(() => ({} as any));
    const seasonIdRaw = typeof body?.seasonId === "string" ? body.seasonId.trim() : "";
    const seasonId = toSlashSeason(seasonIdRaw);
    if (!seasonId) {
      return new NextResponse(JSON.stringify({ message: "seasonId が不正です。" }), { status: 400 });
    }

    const ownerUid = await resolveOwnerUidFromUid(uid);
    if (!ownerUid) {
      return new NextResponse(JSON.stringify({ message: "クラブ情報が見つかりません。" }), { status: 404 });
    }

    const seasonDocId = toDashSeason(seasonId);
    const seasonRef = db.doc(`clubs/${ownerUid}/seasons/${seasonDocId}`);

    const rosterSnap = await seasonRef.collection("roster").get();
    const rosterPlayerIds = rosterSnap.docs.map((d) => d.id);

    const ops: Array<(b: FirebaseFirestore.WriteBatch) => void> = [];

    for (const d of rosterSnap.docs) {
      ops.push((b) => b.delete(d.ref));
    }

    const teamsSnap = await db.collection(`clubs/${ownerUid}/teams`).get();
    for (const teamDoc of teamsSnap.docs) {
      const refs = rosterPlayerIds.map((playerId) => teamDoc.ref.collection("players").doc(playerId));
      const snaps = refs.length > 0 ? await db.getAll(...refs) : [];
      for (let i = 0; i < snaps.length; i += 1) {
        const snap = snaps[i];
        if (!snap.exists) continue;
        const playerRef = snap.ref;
        ops.push((b) => {
          b.update(
            playerRef,
            new FieldPath("seasonData", seasonDocId),
            FieldValue.delete(),
            new FieldPath("seasonData", seasonId),
            FieldValue.delete(),
            "seasons",
            FieldValue.arrayRemove(seasonId, seasonDocId)
          );
        });
      }
    }

    for (const playerId of rosterPlayerIds) {
      ops.push((b) => b.delete(db.doc(`clubs/${ownerUid}/public_player_stats_cache/${playerId}`)));
    }

    ops.push((b) => b.delete(seasonRef));

    await commitInBatches(ops);

    return new NextResponse(JSON.stringify({ message: "ok" }), { status: 200 });
  } catch (error) {
    console.error("delete-season error:", error);
    return new NextResponse(JSON.stringify({ message: "サーバーエラーが発生しました。" }), { status: 500 });
  }
}
