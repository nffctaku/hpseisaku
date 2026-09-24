import { NextResponse } from "next/server";
import { db } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import { getOperatorUid, listUpdates, parseUpdatePayload } from "@/lib/updates-server";

export const runtime = "nodejs";

const COLLECTION = "app_updates";

export async function GET(request: Request) {
  const uid = await getOperatorUid(request);
  if (!uid) {
    return new NextResponse(JSON.stringify({ message: "権限がありません。" }), { status: 403 });
  }
  try {
    const items = await listUpdates();
    return NextResponse.json({ ok: true, items }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[admin/updates] list error", e);
    return new NextResponse(JSON.stringify({ message: "サーバーエラーが発生しました。" }), { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const uid = await getOperatorUid(request);
    if (!uid) {
      return new NextResponse(JSON.stringify({ message: "権限がありません。" }), { status: 403 });
    }

    const body = (await request.json().catch(() => null)) as any;
    const parsed = parseUpdatePayload(body);
    if ("error" in parsed) {
      return new NextResponse(JSON.stringify({ message: parsed.error }), { status: 400 });
    }

    const docRef = db.collection(COLLECTION).doc();
    await docRef.set({
      ...parsed.data,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      createdBy: uid,
    });

    return NextResponse.json({ ok: true, id: docRef.id });
  } catch (e) {
    console.error("[admin/updates] API error", e);
    return new NextResponse(JSON.stringify({ message: "サーバーエラーが発生しました。" }), { status: 500 });
  }
}
