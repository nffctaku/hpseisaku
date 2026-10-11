import { NextResponse } from "next/server";
import { db } from "@/lib/firebase/admin";
import { getAuth } from "firebase-admin/auth";

import { getBookletTeamData } from "@/lib/booklet-data-server";
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

export async function GET(request: Request) {
  try {
    const uid = await getUidFromRequest(request);
    if (!uid) {
      return new NextResponse(JSON.stringify({ message: "認証されていません。" }), { status: 401 });
    }

    const clubUid = await getActiveClubUid(uid);
    const ownerUid = clubUid;
    const clubId = clubUid; // 公開ページと同じ API を使用するために clubId を設定

    const url = new URL(request.url);
    const urlTeamId = (url.searchParams.get("teamId") || "").trim();
    const seasonId = (url.searchParams.get("season") || "").trim();
    if (!urlTeamId || !seasonId) {
      return new NextResponse(JSON.stringify({ message: "teamId/season が不正です。" }), { status: 400 });
    }

    // メインチームIDを club_profiles/{clubUid}（docId = clubUid のみ）から解決し、
    // URLのteamIdと照合する。不一致・未指定時はメインチームへ補正する。
    let profileMainTeamId: string | null = null;
    try {
      const pSnap = await db.collection("club_profiles").doc(clubUid).get();
      const v = pSnap.exists ? (pSnap.data() as any)?.mainTeamId : null;
      if (typeof v === "string" && v.trim()) profileMainTeamId = v.trim();
    } catch {}
    const teamId = profileMainTeamId || urlTeamId;
    console.log("[booklet api] id check", { uid, clubUid, mainTeamId: profileMainTeamId, urlTeamId, teamId, seasonId });

    // 公開ページと同じ API を使用してプロフィールデータを取得
    let profile: any = null;
    try {
      const summaryRes = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/club-summary/${encodeURIComponent(clubId)}`, {
        method: 'GET',
        cache: 'no-store',
      });
      if (summaryRes.ok) {
        const summaryJson = await summaryRes.json();
        profile = summaryJson?.profile || null;
      }
    } catch (e) {
      // エラーの場合はフォールバックして直接取得
      const profileSnap = await db.collection("club_profiles").doc(ownerUid).get();
      profile = profileSnap.exists ? (profileSnap.data() as any) : null;
    }

    const data = await getBookletTeamData({
      ownerUid,
      teamId,
      seasonId,
      clubProfile: profile,
    });

    return new NextResponse(JSON.stringify(data), { status: 200 });
  } catch (e) {
    console.error("booklet api error", e);
    return new NextResponse(JSON.stringify({ message: "サーバーエラーが発生しました。" }), { status: 500 });
  }
}
