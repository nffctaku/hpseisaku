import { NextResponse } from "next/server";
import { db } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import { getOperatorUid, parseUpdatePayload } from "@/lib/updates-server";

export const runtime = "nodejs";

const COLLECTION = "app_updates";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    const uid = await getOperatorUid(request);
    if (!uid) {
      return new NextResponse(JSON.stringify({ message: "権限がありません。" }), { status: 403 });
    }
    const { id } = await params;
    const docRef = db.collection(COLLECTION).doc(id);
    const existing = await docRef.get();
    if (!existing.exists) {
      return new NextResponse(JSON.stringify({ message: "お知らせが見つかりません。" }), { status: 404 });
    }

    const body = (await request.json().catch(() => null)) as any;
    const parsed = parseUpdatePayload(body);
    if ("error" in parsed) {
      return new NextResponse(JSON.stringify({ message: parsed.error }), { status: 400 });
    }

    await docRef.update({ ...parsed.data, updatedAt: FieldValue.serverTimestamp() });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[admin/updates] update error", e);
    return new NextResponse(JSON.stringify({ message: "サーバーエラーが発生しました。" }), { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    const uid = await getOperatorUid(request);
    if (!uid) {
      return new NextResponse(JSON.stringify({ message: "権限がありません。" }), { status: 403 });
    }
    const { id } = await params;
    await db.collection(COLLECTION).doc(id).delete();
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[admin/updates] delete error", e);
    return new NextResponse(JSON.stringify({ message: "サーバーエラーが発生しました。" }), { status: 500 });
  }
}
