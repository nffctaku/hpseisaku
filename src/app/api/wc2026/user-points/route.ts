import { NextResponse } from "next/server";
import { db } from "@/lib/firebase/admin";
import { getAuth } from "firebase-admin/auth";

export const runtime = "nodejs";

type UserPointsDoc = {
  points?: number;
  matchPoints?: number;
  groupPoints?: number;
  displayName?: string;
  updatedAt?: any;
};

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

function normalizePoints(v: unknown): number {
  if (typeof v !== "number") return 0;
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.trunc(v));
}

export async function GET(request: Request) {
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

    const url = new URL(request.url);
    const limitParam = Number(url.searchParams.get("limit") || "50");
    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(1, Math.trunc(limitParam)), 200) : 50;

    const myData = uid
      ? await (async () => {
          const mySnap = await db.collection("user_points").doc(uid).get();
          return ((mySnap.exists ? (mySnap.data() as UserPointsDoc) : null) ?? null) as UserPointsDoc | null;
        })()
      : null;

    const rankingSnap = await db.collection("user_points").orderBy("points", "desc").limit(limit).get();
    const ranking = rankingSnap.docs.map((d) => {
      const data = d.data() as UserPointsDoc;
      return {
        uid: d.id,
        points: normalizePoints(data?.points),
        matchPoints: normalizePoints(data?.matchPoints),
        groupPoints: normalizePoints(data?.groupPoints),
        displayName: (typeof data?.displayName === "string" && data.displayName.trim()) || d.id,
      };
    });

    return NextResponse.json({
      ok: true,
      me: uid
        ? {
            uid,
            points: normalizePoints(myData?.points),
            matchPoints: normalizePoints(myData?.matchPoints),
            groupPoints: normalizePoints(myData?.groupPoints),
          }
        : null,
      ranking,
    });
  } catch (e) {
    console.error("/api/wc2026/user-points GET error", e);
    return new NextResponse(JSON.stringify({ message: "サーバーエラーが発生しました。" }), { status: 500 });
  }
}
