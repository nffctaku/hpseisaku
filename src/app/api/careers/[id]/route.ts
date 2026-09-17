export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { db } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import { MAX_CAREERS } from "@/lib/career-constants";

async function getUidFromRequest(request: NextRequest): Promise<string | null> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const idToken = authHeader.substring(7);
  try {
    const decoded = await getAuth().verifyIdToken(idToken);
    return decoded.uid;
  } catch {
    return null;
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const uid = await getUidFromRequest(request);
  if (!uid) {
    return NextResponse.json({ message: "認証されていません。" }, { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ message: "Career IDが指定されていません。" }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ message: "リクエスト本文が不正です。" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : undefined;
  if (name === undefined || name === "") {
    return NextResponse.json({ message: "記録名を入力してください" }, { status: 400 });
  }

  try {
    const careerRef = db.collection("careers").doc(id);
    const snap = await careerRef.get();
    if (!snap.exists) {
      return NextResponse.json({ message: "Careerが見つかりません" }, { status: 404 });
    }
    const data = snap.data() as Record<string, unknown> | undefined;
    if (data?.ownerId !== uid) {
      return NextResponse.json({ message: "このCareerを編集する権限がありません" }, { status: 403 });
    }

    if (data?.status === "deleted") {
      return NextResponse.json({ message: "削除済みの記録は編集できません" }, { status: 409 });
    }

    await careerRef.set(
      { name, updatedAt: FieldValue.serverTimestamp() },
      { merge: true }
    );

    return NextResponse.json({ ok: true, id, name });
  } catch (e: any) {
    console.error("[careers PATCH] failed", e);
    return NextResponse.json({ message: e?.message || "更新に失敗しました" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const uid = await getUidFromRequest(request);
  if (!uid) {
    return NextResponse.json({ message: "認証されていません。" }, { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ message: "Career IDが指定されていません。" }, { status: 400 });
  }

  try {
    const careerRef = db.collection("careers").doc(id);
    const userRef = db.collection("users").doc(uid);

    await db.runTransaction(async (t) => {
      const [careerSnap, userSnap, otherCareersSnap] = await Promise.all([
        t.get(careerRef),
        t.get(userRef),
        t.get(db.collection("careers").where("ownerId", "==", uid).where("status", "in", ["active", "creating"])),
      ]);

      if (!careerSnap.exists) {
        throw new Error("not-found");
      }

      const data = careerSnap.data() as Record<string, unknown> | undefined;
      if (data?.ownerId !== uid) {
        throw new Error("forbidden");
      }

      if (data?.status === "deleted") {
        throw new Error("already-deleted");
      }

      const deletedAt = FieldValue.serverTimestamp();
      t.set(careerRef, { status: "deleted", deletedAt, updatedAt: deletedAt }, { merge: true });

      const activeId = (userSnap.data() as Record<string, unknown> | undefined)?.activeCareerId as string | undefined;
      if (activeId === id) {
        const next = otherCareersSnap.docs.find((c) => c.id !== id);
        t.set(userRef, { activeCareerId: next ? next.id : null, updatedAt: deletedAt }, { merge: true });
      }
    });

    return NextResponse.json({ ok: true, id });
  } catch (e: any) {
    const msg = e?.message || "";
    if (msg === "not-found") return NextResponse.json({ message: "Careerが見つかりません" }, { status: 404 });
    if (msg === "forbidden") return NextResponse.json({ message: "権限がありません" }, { status: 403 });
    if (msg === "already-deleted") return NextResponse.json({ message: "既に削除されています" }, { status: 409 });
    console.error("[careers DELETE] failed", e);
    return NextResponse.json({ message: "削除に失敗しました" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const uid = await getUidFromRequest(request);
  if (!uid) {
    return NextResponse.json({ message: "認証されていません。" }, { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ message: "Career IDが指定されていません。" }, { status: 400 });
  }

  try {
    const careerRef = db.collection("careers").doc(id);

    await db.runTransaction(async (t) => {
      const [careerSnap, allSnap] = await Promise.all([
        t.get(careerRef),
        t.get(db.collection("careers").where("ownerId", "==", uid).where("status", "in", ["active", "creating"])),
      ]);

      if (!careerSnap.exists) {
        throw new Error("not-found");
      }

      const data = careerSnap.data() as Record<string, unknown> | undefined;
      if (data?.ownerId !== uid) {
        throw new Error("forbidden");
      }

      if (data?.status !== "deleted") {
        throw new Error("not-deleted");
      }

      const activeCount = allSnap.docs.filter((c) => c.id !== id).length;
      if (activeCount >= MAX_CAREERS) {
        throw new Error(`記録数の上限（${MAX_CAREERS}件）に達しているため復元できません`);
      }

      const now = FieldValue.serverTimestamp();
      t.set(careerRef, { status: "active", deletedAt: FieldValue.delete(), updatedAt: now }, { merge: true });
    });

    return NextResponse.json({ ok: true, id });
  } catch (e: any) {
    const msg = e?.message || "";
    if (msg === "not-found") return NextResponse.json({ message: "Careerが見つかりません" }, { status: 404 });
    if (msg === "forbidden") return NextResponse.json({ message: "権限がありません" }, { status: 403 });
    if (msg === "not-deleted") return NextResponse.json({ message: "削除済みの記録ではありません" }, { status: 409 });
    console.error("[careers POST] failed", e);
    return NextResponse.json({ message: e?.message || "復元に失敗しました" }, { status: 500 });
  }
}
