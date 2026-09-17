export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { db } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import { normalizeSlug, validateSlug } from "@/lib/slug";
import { copyCareerData, getCopyableSourceData, type CopyOptions, type CopyResult } from "@/lib/career-copy";
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

function isValidCopyOptions(value: unknown): value is CopyOptions {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.sourceCareerId !== "string" || !v.sourceCareerId.trim()) return false;
  if (typeof v.copyPlayers !== "boolean") return false;
  if (typeof v.copyTeams !== "boolean") return false;
  if (typeof v.copySettings !== "boolean") return false;
  if (v.copyPlayers && (typeof v.playerSourceSeasonId !== "string" || !v.playerSourceSeasonId.trim())) {
    return false;
  }
  return true;
}

export async function POST(request: NextRequest) {
  const uid = await getUidFromRequest(request);
  if (!uid) {
    return NextResponse.json({ message: "認証されていません。" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ message: "リクエスト本文が不正です。" }, { status: 400 });
  }

  const recordName = typeof body.recordName === "string" ? body.recordName.trim() : "";
  const clubName = typeof body.clubName === "string" ? body.clubName.trim() : "";
  const rawClubId = typeof body.clubId === "string" ? body.clubId : "";
  const startSeasonRaw = typeof body.startSeason === "string" ? body.startSeason.trim() : "";
  const startSeasonId = startSeasonRaw.replace(/\//g, "-");
  const copyOptions = body.copyOptions as CopyOptions | undefined;

  if (!recordName) {
    return NextResponse.json({ message: "記録名を入力してください" }, { status: 400 });
  }
  if (!clubName) {
    return NextResponse.json({ message: "クラブ名を入力してください" }, { status: 400 });
  }
  if (!startSeasonRaw) {
    return NextResponse.json({ message: "開始シーズンを入力してください" }, { status: 400 });
  }
  if (startSeasonId.includes("/") || startSeasonId === "." || startSeasonId === "..") {
    return NextResponse.json({ message: "開始シーズンの形式が正しくありません" }, { status: 400 });
  }

  const slug = normalizeSlug(rawClubId);
  const careersSnapshot = await db.collection("careers").where("ownerId", "==", uid).get();
  const forbiddenClubUids = careersSnapshot.docs
    .map((d) => ({ id: d.id, data: d.data() as Record<string, unknown> }))
    .filter((c) => c.data.status !== "creating")
    .map((c) => c.data.clubUid as string)
    .filter((v): v is string => typeof v === "string");
  const validation = validateSlug(slug, { forbiddenValues: [uid, ...forbiddenClubUids] });
  if (!validation.ok) {
    return NextResponse.json({ message: validation.message || "公開URLが正しくありません" }, { status: 400 });
  }

  if (copyOptions !== undefined && copyOptions !== null && !isValidCopyOptions(copyOptions)) {
    return NextResponse.json({ message: "引き継ぎ設定が不正です" }, { status: 400 });
  }

  const clubProfilesRef = db.collection("club_profiles");
  const careersRef = db.collection("careers");
  const userRef = db.collection("users").doc(uid);
  const newCareerRef = careersRef.doc();
  const newClubUid = clubProfilesRef.doc().id;
  const newClubProfileRef = clubProfilesRef.doc(newClubUid);
  const aliasRef = clubProfilesRef.doc(slug);
  const newCareerId = newCareerRef.id;
  const now = FieldValue.serverTimestamp();

  interface ReuseResult {
    careerId: string;
    clubUid: string;
    isNew: boolean;
  }

  let result: ReuseResult;

  try {
    result = await db.runTransaction(async (t) => {
      // 0. 同一所有者の全記録を取得（上限チェック・作成中再試行に使用）
      const [byField, byId, existingSnapshot] = await Promise.all([
        t.get(clubProfilesRef.where("clubId", "==", slug)),
        t.get(clubProfilesRef.doc(slug)),
        t.get(careersRef.where("ownerId", "==", uid)),
      ]);

      // 1. 同一スラグの club_profiles を検索（自分の creating 再試行を許可）
      for (const d of byField.docs) {
        const data = d.data() as Record<string, unknown> | undefined;
        if (data?.ownerUid === uid) {
          const mainClubUid = typeof data?.clubUid === "string" ? data.clubUid : d.id;
          const creatingCareer = existingSnapshot.docs.find(
            (c) =>
              (c.data() as Record<string, unknown>).ownerId === uid &&
              (c.data() as Record<string, unknown>).clubUid === mainClubUid &&
              (c.data() as Record<string, unknown>).status === "creating"
          );
          if (creatingCareer) {
            const careerId = creatingCareer.id;
            t.set(
              clubProfilesRef.doc(mainClubUid),
              {
                clubName,
                updatedAt: now,
              },
              { merge: true }
            );
            t.set(
              creatingCareer.ref,
              {
                name: recordName,
                clubName,
                clubLogo: null,
                updatedAt: now,
              },
              { merge: true }
            );
            if (!copyOptions) {
              t.set(userRef, { activeCareerId: careerId, updatedAt: now }, { merge: true });
              t.set(creatingCareer.ref, { status: "active", updatedAt: now }, { merge: true });
            }
            return { careerId, clubUid: d.id, isNew: false };
          }
          throw new Error("このURLはすでに使用されています");
        } else {
          throw new Error("このURLはすでに使用されています");
        }
      }

      // 2. ドキュメント ID でも重複チェック
      if (byId.exists) {
        const data = byId.data() as Record<string, unknown> | undefined;
        if (data?.ownerUid !== uid) {
          throw new Error("このURLはすでに使用されています");
        }
      }

      // 3. 記録数上限チェック（削除済みを除く）
      const activeCount = existingSnapshot.docs.filter(
        (c) => (c.data() as Record<string, unknown>).status !== "deleted"
      ).length;
      if (activeCount >= MAX_CAREERS) {
        throw new Error(`記録数の上限（${MAX_CAREERS}件）に達しています`);
      }

      // 4. 新規作成
      t.set(newClubProfileRef, {
        clubId: slug,
        slug: slug,
        ownerUid: uid,
        clubUid: newClubUid,
        clubName,
        logoUrl: null,
        plan: "free",
        transfersPublic: false,
        publicPlayerParamsEnabled: false,
        realTeamUsage: false,
        gameTeamUsage: true,
        createdAt: now,
        updatedAt: now,
      });

      // 5. URL 予約（alias）
      t.set(aliasRef, {
        clubId: slug,
        slug: slug,
        clubUid: newClubUid,
        ownerUid: uid,
        createdAt: now,
        updatedAt: now,
      });

      t.set(newCareerRef, {
        ownerId: uid,
        clubUid: newClubUid,
        name: recordName,
        clubName,
        clubLogo: null,
        startSeason: startSeasonId,
        latestSeason: startSeasonId,
        seasonCount: 1,
        isPublic: false,
        status: copyOptions ? "creating" : "active",
        createdAt: now,
        updatedAt: now,
      });

      if (!copyOptions) {
        t.set(userRef, { activeCareerId: newCareerId, updatedAt: now }, { merge: true });
        t.set(
          db.collection("clubs").doc(newClubUid).collection("seasons").doc(startSeasonId),
          {
            name: startSeasonRaw || startSeasonId,
            isPublic: true,
            createdAt: now,
            updatedAt: now,
          }
        );
      }

      return { careerId: newCareerId, clubUid: newClubUid, isNew: true };
    });
  } catch (e: any) {
    const message = e?.message || "URLの確保に失敗しました";
    const status = message.includes("すでに使用") ? 409 : 500;
    return NextResponse.json({ message }, { status });
  }

  let copyResult: CopyResult | null = null;
  if (copyOptions) {
    try {
      copyResult = await copyCareerData(uid, result.careerId, {
        ...copyOptions,
        targetStartSeasonId: startSeasonId,
        targetStartSeasonName: startSeasonRaw,
      });
    } catch (e: any) {
      console.error("[careers POST] copy failed", e);
      return NextResponse.json(
        { message: e?.message || "データ引き継ぎに失敗しました。URLは確保されたままなので、設定から再試行してください。" },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({
    ok: true,
    careerId: result.careerId,
    clubUid: result.clubUid,
    clubId: slug,
    copyResult,
  });
}

function timestampToISO(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof (v as { toDate?: () => Date }).toDate === "function") {
    return (v as { toDate: () => Date }).toDate().toISOString();
  }
  if (typeof v === "string") return v;
  if (typeof v === "number") return new Date(v).toISOString();
  return null;
}

function seasonFromDoc(d: unknown): string | null {
  if (typeof d === "string" && d.trim()) return d.trim();
  if (typeof d === "object" && d !== null && "id" in d) {
    const id = (d as { id?: unknown }).id;
    if (typeof id === "string" && id.trim()) return id.trim();
  }
  return null;
}

async function ensureLegacyCareer(uid: string) {
  // 1. Check if a career referencing the legacy clubUid (== uid) already exists.
  const existingByClubUid = await db.collection("careers").where("ownerId", "==", uid).where("clubUid", "==", uid).limit(1).get();
  if (!existingByClubUid.empty) return existingByClubUid.docs[0].id;

  const legacyCareerRef = db.collection("careers").doc(uid);
  const legacySnap = await legacyCareerRef.get();
  if (legacySnap.exists) {
    // 旧形式の careers/{uid} ドキュメントがあれば、新しい AutoID 移行が必要か確認
    const legacyData = legacySnap.data() as Record<string, unknown> | undefined;
    if (legacyData?.ownerId === uid) {
      // 既に所有者が一致する場合はそのまま clubUid を uid として扱う
      const newCareerRef = db.collection("careers").doc();
      const now = FieldValue.serverTimestamp();
      await newCareerRef.set({
        ...legacyData,
        ownerId: uid,
        clubUid: uid,
        status: typeof legacyData.status === "string" ? legacyData.status : "active",
        updatedAt: now,
      });
      await legacyCareerRef.delete();
      return newCareerRef.id;
    }
  }

  // 2. Load legacy data areas
  const [profileByUidSnap, profileByOwnerSnap, clubSnap, seasonSnap] = await Promise.all([
    db.collection("club_profiles").doc(uid).get(),
    db.collection("club_profiles").where("ownerUid", "==", uid).limit(1).get(),
    db.collection("clubs").doc(uid).get(),
    db.collection(`clubs/${uid}/seasons`).get(),
  ]);

  const profileData = profileByUidSnap.exists
    ? (profileByUidSnap.data() as Record<string, unknown>)
    : !profileByOwnerSnap.empty
    ? (profileByOwnerSnap.docs[0].data() as Record<string, unknown>)
    : {};

  const clubData = clubSnap.exists ? (clubSnap.data() as Record<string, unknown>) : {};

  const hasLegacy =
    Object.keys(profileData).length > 0 ||
    Object.keys(clubData).length > 0 ||
    !seasonSnap.empty;

  if (!hasLegacy) return null;

  const seasons = seasonSnap.docs
    .map((d) => (d.id ? d.id : seasonFromDoc(d.data() as Record<string, unknown>)))
    .filter((s): s is string => !!s);

  const resolvedClubName =
    (typeof profileData.clubName === "string" && profileData.clubName.trim()) ||
    (typeof clubData.clubName === "string" && clubData.clubName.trim()) ||
    "";

  const gameTitle =
    (typeof profileData.gameTitle === "string" && profileData.gameTitle.trim()) ||
    (typeof clubData.gameTitle === "string" && clubData.gameTitle.trim()) ||
    "FC26";

  const clubLogo =
    (typeof profileData.logoUrl === "string" && profileData.logoUrl) ||
    (typeof clubData.logoUrl === "string" && clubData.logoUrl) ||
    null;

  const now = FieldValue.serverTimestamp();
  const newCareerRef = db.collection("careers").doc();
  const careerId = newCareerRef.id;
  const resolvedName =
    (typeof profileData.careerName === "string" && profileData.careerName.trim()) ||
    (typeof clubData.careerName === "string" && clubData.careerName.trim()) ||
    "キャリア①";

  await newCareerRef.set({
    ownerId: uid,
    clubUid: uid,
    name: resolvedName,
    gameTitle,
    clubName: resolvedClubName,
    clubLogo,
    startSeason: seasons[0] ?? null,
    latestSeason: seasons[seasons.length - 1] ?? null,
    seasonCount: seasons.length,
    isPublic: profileData.directoryListed === true || clubData.directoryListed === true,
    status: "active",
    createdAt: now,
    updatedAt: now,
  });

  // Ensure users.activeCareerId points to a valid career if missing
  const userSnap = await db.collection("users").doc(uid).get();
  const activeCareerId = userSnap.exists ? ((userSnap.data() as Record<string, unknown> | undefined)?.activeCareerId as string | undefined) : undefined;
  if (!activeCareerId) {
    await db.collection("users").doc(uid).set(
      { activeCareerId: careerId, updatedAt: now },
      { merge: true }
    );
  }

  return careerId;
}

export async function GET(request: NextRequest) {
  const uid = await getUidFromRequest(request);
  if (!uid) {
    return NextResponse.json({ message: "認証されていません。" }, { status: 401 });
  }

  try {
    // Ensure a legacy career exists before listing (idempotent)
    await ensureLegacyCareer(uid);

    const [careersSnap, userSnap] = await Promise.all([
      db.collection("careers").where("ownerId", "==", uid).get(),
      db.collection("users").doc(uid).get(),
    ]);

    // Join club_profiles for public URL and latest clubName/logo
    const clubUids = [...new Set(careersSnap.docs.map((d) => (d.data() as Record<string, unknown>).clubUid as string | undefined).filter(Boolean))];
    const profileSnaps = await Promise.all(clubUids.map((clubUid) => db.collection("club_profiles").doc(clubUid as string).get()));
    const profileMap = new Map<string, Record<string, unknown>>();
    for (let i = 0; i < clubUids.length; i++) {
      const snap = profileSnaps[i];
      if (snap.exists) profileMap.set(clubUids[i] as string, snap.data() as Record<string, unknown>);
    }

    const careers = careersSnap.docs
      .filter((d) => (d.data() as Record<string, unknown>).status !== "deleted")
      .map((d) => {
      const data = d.data() as Record<string, unknown>;
      const profile = profileMap.get(data.clubUid as string) ?? {};
      const resolvedClubName =
        (typeof data.clubName === "string" && data.clubName.trim()) ||
        (typeof profile.clubName === "string" && profile.clubName.trim()) ||
        "";
      return {
        id: d.id,
        ownerId: data.ownerId ?? uid,
        clubUid: data.clubUid ?? d.id,
        name: data.name ?? resolvedClubName ?? d.id,
        clubId: (typeof profile.clubId === "string" && profile.clubId) || null,
        gameTitle: data.gameTitle ?? "FC26",
        clubName: resolvedClubName,
        clubLogo: typeof data.clubLogo === "string" ? data.clubLogo : (typeof profile.logoUrl === "string" ? profile.logoUrl : null),
        startSeason: typeof data.startSeason === "string" ? data.startSeason : null,
        latestSeason: typeof data.latestSeason === "string" ? data.latestSeason : null,
        seasonCount: typeof data.seasonCount === "number" ? data.seasonCount : 0,
        isPublic: data.isPublic === true,
        status: typeof data.status === "string" ? data.status : "active",
        createdAt: timestampToISO(data.createdAt),
        updatedAt: timestampToISO(data.updatedAt),
      };
    });

    const activeCareerId = userSnap.exists
      ? ((userSnap.data() as Record<string, unknown> | undefined)?.activeCareerId as string | undefined) || null
      : null;

    return NextResponse.json({ ok: true, careers, activeCareerId });
  } catch (e: any) {
    console.error("[careers GET] failed", e);
    return NextResponse.json({ message: e?.message || "Career一覧の取得に失敗しました" }, { status: 500 });
  }
}
