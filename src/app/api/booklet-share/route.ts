import { NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { FieldValue } from "firebase-admin/firestore";
import { randomBytes } from "crypto";

import { getActiveCareer } from "@/lib/career-server";
import { bookletShareCollection, findBookletShare, normalizeShareDoc } from "@/lib/booklet-share";

export const runtime = "nodejs";

async function getUidFromRequest(request: Request): Promise<string | null> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  try {
    const decoded = await getAuth().verifyIdToken(authHeader.substring(7));
    return decoded.uid;
  } catch {
    return null;
  }
}

function str(v: unknown, max = 200): string {
  return typeof v === "string" ? v.slice(0, max) : "";
}

function strArray(v: unknown, max = 60): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string" && x.trim().length > 0).slice(0, max);
}

function sanitizePositionColors(v: unknown) {
  const allowed = new Set([
    "bg-rose-300",
    "bg-blue-300",
    "bg-green-300",
    "bg-orange-300",
    "bg-purple-300",
    "bg-yellow-300",
    "bg-gray-300",
    "bg-pink-300",
  ]);
  const pick = (x: unknown, fallback: string) =>
    typeof x === "string" && allowed.has(x) ? x : fallback;
  const o = (v || {}) as Record<string, unknown>;
  return {
    GK: pick(o.GK, "bg-rose-300"),
    DF: pick(o.DF, "bg-blue-300"),
    MF: pick(o.MF, "bg-green-300"),
    FW: pick(o.FW, "bg-orange-300"),
  };
}

// GET /api/booklet-share?teamId=...&season=...
// 自分の名鑑の公開設定を取得（未設定なら null）
export async function GET(request: Request) {
  const uid = await getUidFromRequest(request);
  if (!uid) {
    return NextResponse.json({ message: "認証されていません。" }, { status: 401 });
  }
  const career = await getActiveCareer(uid);
  if (!career) {
    return NextResponse.json({ message: "Career が見つかりません。" }, { status: 400 });
  }

  const url = new URL(request.url);
  const teamId = str(url.searchParams.get("teamId"), 100).trim();
  const season = str(url.searchParams.get("season"), 40).trim();
  if (!teamId || !season) {
    return NextResponse.json({ message: "teamId/season が不正です。" }, { status: 400 });
  }

  const share = await findBookletShare({
    ownerUid: uid,
    careerId: career.id,
    teamId,
    season,
  });

  return NextResponse.json({ share: share ? toClientShare(share) : null }, { status: 200 });
}

// POST /api/booklet-share
// 公開設定の作成・更新。ownerUid/clubUid/careerId はサーバー側で確定する。
export async function POST(request: Request) {
  const uid = await getUidFromRequest(request);
  if (!uid) {
    return NextResponse.json({ message: "認証されていません。" }, { status: 401 });
  }
  const career = await getActiveCareer(uid);
  if (!career) {
    return NextResponse.json({ message: "Career が見つかりません。" }, { status: 400 });
  }

  let body: any = null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "リクエストが不正です。" }, { status: 400 });
  }

  const teamId = str(body?.teamId, 100).trim();
  const season = str(body?.season, 40).trim();
  if (!teamId || !season) {
    return NextResponse.json({ message: "teamId/season が不正です。" }, { status: 400 });
  }

  const startersRaw = body?.starters && typeof body.starters === "object" ? body.starters : {};
  const starters = Object.fromEntries(
    Object.entries(startersRaw as Record<string, unknown>)
      .filter(([, v]) => v === null || typeof v === "string")
      .slice(0, 24)
      .map(([k, v]) => [String(k).slice(0, 20), v === null ? null : String(v).slice(0, 80)])
  );

  const payload = {
    ownerUid: uid,
    careerId: career.id,
    clubUid: career.clubUid,
    teamId,
    season,
    isPublished: body?.isPublished === true,
    showFormation: body?.showFormation === true,
    showIntroduction: body?.showIntroduction === true,
    cardPlayerIds: strArray(body?.cardPlayerIds, 60),
    additionalPlayerIds: strArray(body?.additionalPlayerIds, 40),
    showParameterGraph: body?.showParameterGraph !== false,
    positionColors: sanitizePositionColors(body?.positionColors),
    formationName: str(body?.formationName, 40).trim() || null,
    starters,
    bioTitle: str(body?.bioTitle, 120),
    bioBody: str(body?.bioBody, 2000),
    updatedAt: FieldValue.serverTimestamp(),
  };

  const existing = await findBookletShare({
    ownerUid: uid,
    careerId: career.id,
    teamId,
    season,
  });

  let publicId: string;
  if (existing) {
    publicId = existing.publicId;
    await bookletShareCollection().doc(publicId).set(payload, { merge: true });
  } else {
    publicId = randomBytes(9).toString("base64url");
    await bookletShareCollection()
      .doc(publicId)
      .set({ ...payload, createdAt: FieldValue.serverTimestamp() });
  }

  const saved = await bookletShareCollection().doc(publicId).get();
  return NextResponse.json(
    { share: toClientShare(normalizeShareDoc(saved.id, saved.data())) },
    { status: 200 }
  );
}

// クライアント返却用（管理用フィールドはそのまま owner に返してよいが、
// 公開ページとは別の形式に保つ）
function toClientShare(s: ReturnType<typeof normalizeShareDoc>) {
  return {
    publicId: s.publicId,
    teamId: s.teamId,
    season: s.season,
    isPublished: s.isPublished,
    showFormation: s.showFormation,
    showIntroduction: s.showIntroduction,
    cardPlayerIds: s.cardPlayerIds,
    additionalPlayerIds: s.additionalPlayerIds,
    showParameterGraph: s.showParameterGraph,
    positionColors: s.positionColors,
    formationName: s.formationName,
    starters: s.starters,
    bioTitle: s.bioTitle,
    bioBody: s.bioBody,
  };
}
