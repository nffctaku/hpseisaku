import { NextResponse } from "next/server";
import { db } from "@/lib/firebase/admin";
import { getAuth } from "firebase-admin/auth";
import { toDashSeason, toSlashSeason } from "@/lib/season";
import { getActiveClubUid } from "@/lib/career-server";

export const runtime = "nodejs";

async function getUidFromRequest(request: Request): Promise<string | null> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const idToken = authHeader.substring(7);
  try {
    const decodedToken = await getAuth().verifyIdToken(idToken);
    return decodedToken.uid;
  } catch (e) {
    console.error("verifyIdToken failed", e);
    return null;
  }
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function commitDeletes(refs: FirebaseFirestore.DocumentReference[]) {
  const chunks = chunkArray(refs, 450);
  for (const c of chunks) {
    const batch = db.batch();
    for (const r of c) batch.delete(r);
    await batch.commit();
  }
}

async function playerExistsInAnyTeam(clubUid: string, playerId: string): Promise<boolean> {
  const teamsSnap = await db.collection(`clubs/${clubUid}/teams`).get();
  for (const teamDoc of teamsSnap.docs) {
    const p = await teamDoc.ref.collection("players").doc(playerId).get();
    if (p.exists) return true;
  }
  return false;
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

    const clubUid = await getActiveClubUid(uid);

    const seasonDocId = toDashSeason(seasonId);
    const rosterCol = db.collection(`clubs/${clubUid}/seasons/${seasonDocId}/roster`);
    const rosterSnap = await rosterCol.get();

    const toDelete: FirebaseFirestore.DocumentReference[] = [];
    const affectedPlayerIds: string[] = [];

    for (const d of rosterSnap.docs) {
      const playerId = d.id;
      const exists = await playerExistsInAnyTeam(clubUid, playerId);
      if (!exists) {
        toDelete.push(d.ref);
        affectedPlayerIds.push(playerId);
      }
    }

    if (toDelete.length > 0) {
      await commitDeletes(toDelete);
    }

    // Invalidate public player stats cache for affected players
    if (affectedPlayerIds.length > 0) {
      const cacheRefs = affectedPlayerIds.map((pid) => db.doc(`clubs/${clubUid}/public_player_stats_cache/${pid}`));
      await commitDeletes(cacheRefs);
    }

    return new NextResponse(
      JSON.stringify({
        message: "ok",
        deletedRosterCount: toDelete.length,
      }),
      { status: 200 }
    );
  } catch (error) {
    console.error("cleanup-roster error:", error);
    return new NextResponse(JSON.stringify({ message: "サーバーエラーが発生しました。" }), { status: 500 });
  }
}
