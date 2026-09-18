import { NextRequest, NextResponse } from "next/server";
import { auth, db } from "@/lib/firebase/admin";
import { getActiveClubUid } from "@/lib/career-server";
import { touchUserActivity } from "@/lib/server-activity";

interface DeleteTransferRequest {
  teamId: string;
  transferId: string;
}

// 移籍記録の選手エントリを1件削除する。
// 削除対象は clubs/{clubUid}/teams/{teamId}/transfers/{transferId} のみ。
// 選手マスター・試合成績・他Careerのデータには一切触れない。
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const decoded = await auth.verifyIdToken(token);
    const uid = decoded.uid;
    const clubUid = await getActiveClubUid(uid);

    const body = (await req.json()) as DeleteTransferRequest;
    const teamId = typeof body?.teamId === "string" ? body.teamId.trim() : "";
    const transferId = typeof body?.transferId === "string" ? body.transferId.trim() : "";
    if (!teamId || !transferId) {
      return NextResponse.json({ ok: false, error: "Missing fields" }, { status: 400 });
    }

    const transferRef = db.doc(`clubs/${clubUid}/teams/${teamId}/transfers/${transferId}`);
    const snap = await transferRef.get();
    if (!snap.exists) {
      return NextResponse.json({ ok: false, error: "移籍記録が見つかりません" }, { status: 404 });
    }

    await transferRef.delete();
    await touchUserActivity(uid);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[transfers/delete] failed", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
