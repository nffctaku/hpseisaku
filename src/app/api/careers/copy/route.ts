export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { getCopyableSourceData, copyCareerData, type CopyOptions } from "@/lib/career-copy";

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

export async function GET(request: NextRequest) {
  try {
    const uid = await getUidFromRequest(request);
    if (!uid) return NextResponse.json({ message: "認証されていません。" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const sourceCareerId = searchParams.get("sourceCareerId");
    if (!sourceCareerId) return NextResponse.json({ message: "sourceCareerId が必要です。" }, { status: 400 });

    const data = await getCopyableSourceData(uid, sourceCareerId);
    return NextResponse.json({ ok: true, data });
  } catch (e: any) {
    console.error("[careers/copy GET] error", e);
    return NextResponse.json({ message: e?.message || "読み込みに失敗しました。" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const uid = await getUidFromRequest(request);
    if (!uid) return NextResponse.json({ message: "認証されていません。" }, { status: 401 });

    const body = (await request.json()) as CopyOptions & { targetCareerId?: string };
    if (!body?.sourceCareerId || !body?.targetCareerId) {
      return NextResponse.json({ message: "sourceCareerId, targetCareerId が必要です。" }, { status: 400 });
    }

    const result = await copyCareerData(uid, body.targetCareerId, body);
    return NextResponse.json({ ok: true, result });
  } catch (e: any) {
    console.error("[careers/copy POST] error", e);
    return NextResponse.json({ message: e?.message || "コピーに失敗しました。" }, { status: 500 });
  }
}
