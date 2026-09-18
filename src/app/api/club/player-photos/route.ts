import { NextRequest, NextResponse } from 'next/server';
import { auth, db, admin } from '@/lib/firebase/admin';
import { getPlanLimit } from '@/lib/plan-limits';
import { getEffectivePlanForUid } from '@/lib/server-plan';
import { touchUserActivity } from '@/lib/server-activity';
import { getActiveClubUid } from '@/lib/career-server';
import { FieldValue } from 'firebase-admin/firestore';

interface AttachPhotoRequest {
  teamId: string;
  season: string;
  playerId: string;
  photoUrl: string;
  prevPhotoUrl?: string;
  seasons?: string[];
}

// シーズン表記ゆれを doc id 形式（"2025-26"）に統一する。
// players.seasons は "2025/26" 形式で保存されるため、そのまま
// フィールドパスやコレクションパスに使うと invalid になる。
const toDashSeasonKey = (s: unknown): string =>
  typeof s === 'string' ? s.trim().replace(/\//g, '-') : '';

interface AttachPhotoResponse {
  ok: boolean;
  photoUrl: string;
  currentCount?: number;
  limit?: number;
  error?: string;
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!token) {
      return NextResponse.json<AttachPhotoResponse>({ ok: false, photoUrl: '', error: 'Unauthorized' }, { status: 401 });
    }

    const decoded = await auth.verifyIdToken(token);
    const uid = decoded.uid;
    const clubUid = await getActiveClubUid(uid);

    const body = (await req.json()) as AttachPhotoRequest;
    const { teamId, season, playerId, photoUrl, prevPhotoUrl, seasons } = body;
    if (!teamId || !season || !playerId || typeof photoUrl !== 'string' || !photoUrl.trim()) {
      return NextResponse.json<AttachPhotoResponse>({ ok: false, photoUrl: '', error: 'Missing fields' }, { status: 400 });
    }

    const targetSeasonDash = (season || '').trim();
    const rawSeasons = [targetSeasonDash, ...(seasons || [])].filter(
      (s) => s.trim().length > 0
    );
    const requestedSeasons = [...new Set(rawSeasons)];

    // TODO: Cloudinary 署名付きアップロード（A方式）へ移行し、未使用画像が残らないようにする。
    // TODO: 同時アップロードによる上限race conditionをトランザクションまたは分散カウンタで対策する。
    const { plan, tier } = await getEffectivePlanForUid(uid);
    const limit = getPlanLimit('player_photos_per_team', tier);

    const playersSnap = await db.collection(`clubs/${clubUid}/teams/${teamId}/players`).get();
    let currentCount = 0;
    for (const d of playersSnap.docs) {
      if (d.id === playerId) continue;
      const data = d.data() as Record<string, unknown>;
      if (typeof data.photoUrl === 'string' && data.photoUrl.trim().length > 0) {
        currentCount += 1;
        continue;
      }
      const seasonData = (data.seasonData || {}) as Record<string, Record<string, unknown>>;
      const hasSeasonPhoto = Object.values(seasonData).some(
        (s) => typeof s?.photoUrl === 'string' && (s.photoUrl as string).trim().length > 0
      );
      if (hasSeasonPhoto) currentCount += 1;
    }

    // 対象選手が所属する全シーズンも同期対象に含める。
    // どこかのシーズンに旧URLが残ると、旧画像削除時にリンク切れになるため。
    const playerDoc = playersSnap.docs.find((d) => d.id === playerId);
    // 対象選手がactiveCareer領域の対象チームに存在することを検証（所有権チェック）
    if (!playerDoc) {
      return NextResponse.json<AttachPhotoResponse>(
        { ok: false, photoUrl: '', error: '対象の選手が見つかりません' },
        { status: 404 }
      );
    }
    const playerDocData = (playerDoc?.data() || {}) as Record<string, any>;
    const playerSeasonData = (playerDocData.seasonData && typeof playerDocData.seasonData === 'object'
      ? playerDocData.seasonData
      : {}) as Record<string, any>;
    const syncSeasons = [...new Set<string>([
      ...requestedSeasons.map(toDashSeasonKey),
      ...(Array.isArray(playerDocData.seasons) ? playerDocData.seasons.map(toDashSeasonKey) : []),
      ...Object.keys(playerSeasonData).map(toDashSeasonKey),
    ])].filter(Boolean);

    if (Number.isFinite(limit) && currentCount >= limit) {
      await db.collection('analyticsEvents').add({
        eventName: 'plan_limit_reached',
        userId: uid,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        properties: {
          uid,
          limitType: 'player_photo',
          currentCount,
          limit,
          plan,
          sourcePage: 'player-management',
          teamId,
          season: targetSeasonDash,
        },
      });
      return NextResponse.json<AttachPhotoResponse>(
        { ok: false, photoUrl: '', error: `Freeプランではチームあたり選手画像は最大${limit}枚まで登録できます。`, currentCount, limit },
        { status: 403 }
      );
    }

    const batch = db.batch();

    const playerRef = db.collection(`clubs/${clubUid}/teams/${teamId}/players`).doc(playerId);
    const playerUpdate: Record<string, unknown> = {
      photoUrl,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    for (const s of syncSeasons) {
      playerUpdate[`seasonData.${s}.photoUrl`] = photoUrl;
    }
    batch.update(playerRef, playerUpdate);

    for (const s of syncSeasons) {
      const rosterRef = db.collection(`clubs/${clubUid}/seasons/${s}/roster`).doc(playerId);
      // set()+merge はキーのドットをフィールドパスとして解釈しないため、
      // seasonData はネストしたオブジェクトとして書き込む
      batch.set(
        rosterRef,
        {
          photoUrl,
          seasonData: { [s]: { photoUrl } },
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }

    await batch.commit();

    // 旧画像の Cloudinary 削除（best-effort）。失敗分は pendingPhotoDeletes
    // キューに退避し、次回の POST/DELETE で自動再試行する。
    const prevUrl = typeof prevPhotoUrl === 'string' ? prevPhotoUrl.trim() : '';
    const prevPending = Array.isArray(playerDocData?.pendingPhotoDeletes)
      ? playerDocData.pendingPhotoDeletes.filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
      : [];
    const prevFailed = prevPending.length
      ? await drainPhotoDestroyQueue(prevPending, uid, clubUid, playerId)
      : [];

    const prevPublicIds: string[] = [];
    if (prevUrl && prevUrl !== photoUrl.trim()) {
      const cloudName = process.env.CLOUDINARY_CLOUD_NAME || '';
      const prevPublicId = extractCloudinaryPublicId(prevUrl, cloudName);
      if (prevPublicId) prevPublicIds.push(prevPublicId);
    }
    const curFailed = prevPublicIds.length
      ? await drainPhotoDestroyQueue(prevPublicIds, uid, clubUid, playerId)
      : [];

    const remainingPending = [...new Set([...prevFailed, ...curFailed])];
    await savePendingPhotoDeletes(playerRef, remainingPending);

    await touchUserActivity(uid);

    return NextResponse.json<AttachPhotoResponse>({ ok: true, photoUrl, currentCount: currentCount + 1, limit });
  } catch (error) {
    console.error('[player-photos] attach failed:', error);
    return NextResponse.json<AttachPhotoResponse>(
      { ok: false, photoUrl: '', error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

interface DeletePhotoRequest {
  teamId: string;
  playerId: string;
  seasons?: string[];
}

// doc が対象 public_id の画像を参照しているか（トップレベル + 全 seasonData）。
// URL文字列ではなく public_id で比較する（バージョン/拡張子の揺れを同一アセットとして扱う）。
function docReferencesPublicId(
  data: Record<string, any>,
  cloudName: string,
  targetPublicId: string
): boolean {
  const urls: string[] = [];
  if (typeof data?.photoUrl === 'string' && data.photoUrl.trim()) urls.push(data.photoUrl.trim());
  const sd = data?.seasonData && typeof data.seasonData === 'object' ? data.seasonData : {};
  for (const s of Object.values(sd)) {
    if (typeof (s as any)?.photoUrl === 'string' && (s as any).photoUrl.trim()) {
      urls.push((s as any).photoUrl.trim());
    }
  }
  return urls.some((u) => extractCloudinaryPublicId(u, cloudName) === targetPublicId);
}

// 同一オーナーの全Career(clubUid)＋uid直下を走査し、対象選手以外に
// この public_id を参照する doc が残っているかを返す。
// Careerコピー等で画像を共有している場合、他方の参照が残る限り
// Cloudinary の実ファイルを物理削除してはいけない。
async function isPublicIdReferencedElsewhere(
  targetPublicId: string,
  ownerUid: string,
  currentClubUid: string,
  currentPlayerId: string
): Promise<boolean> {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME || '';
  const careersSnap = await db.collection('careers').where('ownerId', '==', ownerUid).get();
  const clubUids = new Set<string>([
    ownerUid,
    currentClubUid,
    ...careersSnap.docs.map((d) => (d.data()?.clubUid as string) || '').filter(Boolean),
  ]);

  for (const cu of clubUids) {
    const teamsSnap = await db.collection(`clubs/${cu}/teams`).get();
    for (const t of teamsSnap.docs) {
      const playersSnap = await t.ref.collection('players').get();
      for (const p of playersSnap.docs) {
        if (cu === currentClubUid && p.id === currentPlayerId) continue;
        if (docReferencesPublicId(p.data() as Record<string, any>, cloudName, targetPublicId)) return true;
      }
    }
    const seasonsSnap = await db.collection(`clubs/${cu}/seasons`).get();
    for (const s of seasonsSnap.docs) {
      const rosterSnap = await s.ref.collection('roster').get();
      for (const r of rosterSnap.docs) {
        if (cu === currentClubUid && r.id === currentPlayerId) continue;
        if (docReferencesPublicId(r.data() as Record<string, any>, cloudName, targetPublicId)) return true;
      }
    }
  }
  return false;
}

// Cloudinary URL から public_id を抽出する（外部URL・異なるクラウドは null）。
function extractCloudinaryPublicId(url: string, cloudName: string): string | null {
  const prefix = `https://res.cloudinary.com/${cloudName}/image/upload/`;
  if (typeof url !== 'string' || !url.startsWith(prefix)) return null;
  let rest = url.slice(prefix.length);
  rest = rest.replace(/^v\d+\//, '');
  rest = rest.replace(/\.[a-zA-Z0-9]+$/, '');
  return rest || null;
}

async function destroyCloudinaryImage(publicId: string): Promise<boolean> {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) return false;
  try {
    // Upload API の destroy。public_id はフォルダ区切りを含むため body で送る
    // （DELETE /resources/.../:public_id はネストした public_id を正しく解決しない）。
    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ public_id: publicId, invalidate: "true" }).toString(),
      }
    );
    if (!res.ok) return false;
    // result: "ok" | "not found"（既に無い場合も削除済みとして成功扱い＝冪等）
    const data = (await res.json().catch(() => null)) as { result?: string } | null;
    return !data?.result || data.result === 'ok' || data.result === 'not found';
  } catch {
    return false;
  }
}

// 削除失敗した public_id を保持する選手docのフィールド名。
// 次回 POST/DELETE 時に drainPhotoDestroyQueue で再試行する。
const PENDING_DELETES_FIELD = 'pendingPhotoDeletes';

// public_id 群の Cloudinary 削除を試行し、失敗したものだけ返す。
// 共有参照が残っている（あるいは再び付いた）ものは削除せずキューからも外す。
async function drainPhotoDestroyQueue(
  publicIds: string[],
  ownerUid: string,
  clubUid: string,
  playerId: string
): Promise<string[]> {
  const failed: string[] = [];
  for (const publicId of publicIds) {
    if (await isPublicIdReferencedElsewhere(publicId, ownerUid, clubUid, playerId)) {
      console.info('[player-photos] image referenced elsewhere, keep file', { publicId });
      continue;
    }
    const ok = await destroyCloudinaryImage(publicId);
    if (!ok) {
      console.warn('[player-photos] cloudinary destroy failed, queued for retry', { publicId });
      failed.push(publicId);
    }
  }
  return failed;
}

// 失敗分を選手docの pendingPhotoDeletes に退避（空ならフィールド削除）。
// ここでの書き込み失敗は致命ではないので warn のみ。
async function savePendingPhotoDeletes(
  playerRef: FirebaseFirestore.DocumentReference,
  publicIds: string[]
): Promise<void> {
  try {
    if (publicIds.length) {
      await playerRef.update({ [PENDING_DELETES_FIELD]: publicIds });
    } else {
      await playerRef.update({ [PENDING_DELETES_FIELD]: FieldValue.delete() });
    }
  } catch (e) {
    console.warn('[player-photos] pendingPhotoDeletes save failed', e);
  }
}

// 選手画像URLの削除。
// 1) Firestore の画像参照を先に確定（batch は不可分 → 失敗時は何も消えず画像も残る）
// 2) その後、共有参照がない旧画像だけ Cloudinary から削除
// 3) 削除失敗分は pendingPhotoDeletes キューに退避し、次回 POST/DELETE で再試行
// → 「表示用の参照だけ消えて実ファイルが残る/消える」不整合を防ぐ。
export async function DELETE(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!token) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const decoded = await auth.verifyIdToken(token);
    const uid = decoded.uid;
    const clubUid = await getActiveClubUid(uid);

    const body = (await req.json()) as DeletePhotoRequest;
    const teamId = typeof body?.teamId === 'string' ? body.teamId.trim() : '';
    const playerId = typeof body?.playerId === 'string' ? body.playerId.trim() : '';
    const providedSeasons = Array.isArray(body?.seasons) ? body.seasons.filter((s) => typeof s === 'string' && s.trim()) : [];
    if (!teamId || !playerId) {
      return NextResponse.json({ ok: false, error: 'Missing fields' }, { status: 400 });
    }

    const playerRef = db.doc(`clubs/${clubUid}/teams/${teamId}/players/${playerId}`);
    const playerSnap = await playerRef.get();
    if (!playerSnap.exists) {
      return NextResponse.json({ ok: false, error: '選手が見つかりません' }, { status: 404 });
    }

    const playerData = playerSnap.data() as Record<string, any>;
    const seasonData = (playerData?.seasonData && typeof playerData.seasonData === 'object' ? playerData.seasonData : {}) as Record<string, any>;
    const allSeasons = Array.from(new Set<string>([
      ...providedSeasons.map(toDashSeasonKey),
      ...(Array.isArray(playerData?.seasons) ? playerData.seasons.map(toDashSeasonKey) : []),
      ...Object.keys(seasonData).map(toDashSeasonKey),
    ])).filter(Boolean);

    // 削除対象の旧URLを収集（Cloudinary 削除用）。player + seasonData + roster を見る。
    const oldUrls = new Set<string>();
    if (typeof playerData?.photoUrl === 'string' && playerData.photoUrl.trim()) oldUrls.add(playerData.photoUrl.trim());
    for (const sd of Object.values(seasonData)) {
      if (typeof sd?.photoUrl === 'string' && sd.photoUrl.trim()) oldUrls.add(sd.photoUrl.trim());
    }

    // 存在する roster doc だけを対象にする（無い doc への update は失敗するため）
    const rosterRefs = allSeasons.map((s) => ({
      season: s,
      ref: db.doc(`clubs/${clubUid}/seasons/${s}/roster/${playerId}`),
    }));
    const rosterSnaps = await Promise.all(rosterRefs.map((r) => r.ref.get()));
    for (let i = 0; i < rosterRefs.length; i++) {
      if (!rosterSnaps[i].exists) continue;
      const rd = rosterSnaps[i].data() as Record<string, any>;
      if (typeof rd?.photoUrl === 'string' && rd.photoUrl.trim()) oldUrls.add(rd.photoUrl.trim());
      const rsd = rd?.seasonData && typeof rd.seasonData === 'object' ? rd.seasonData : {};
      for (const sd of Object.values(rsd)) {
        if (typeof (sd as any)?.photoUrl === 'string' && (sd as any).photoUrl.trim()) {
          oldUrls.add((sd as any).photoUrl.trim());
        }
      }
    }

    // 1. Firestore の参照を削除（player + 存在する roster）。batch は不可分なので、
    //    失敗時は参照も実ファイルもそのまま残り、表示中の画像を失わない。
    const batch = db.batch();
    const playerUpdate: Record<string, unknown> = {
      photoUrl: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    for (const s of allSeasons) {
      playerUpdate[`seasonData.${s}.photoUrl`] = FieldValue.delete();
    }
    batch.update(playerRef, playerUpdate);

    for (let i = 0; i < rosterRefs.length; i++) {
      if (!rosterSnaps[i].exists) continue;
      const s = rosterRefs[i].season;
      batch.update(rosterRefs[i].ref, {
        photoUrl: FieldValue.delete(),
        [`seasonData.${s}.photoUrl`]: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();

    // 2. 共有参照がない旧画像を Cloudinary から削除。
    //    失敗分は pendingPhotoDeletes に退避し、次回 POST/DELETE で再試行する。
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME || '';
    const publicIds = [...oldUrls]
      .map((u) => extractCloudinaryPublicId(u, cloudName))
      .filter((v): v is string => Boolean(v));
    const curFailed = publicIds.length
      ? await drainPhotoDestroyQueue(publicIds, uid, clubUid, playerId)
      : [];

    // 3. 以前の削除失敗分も再試行する
    const prevPending = Array.isArray(playerData?.[PENDING_DELETES_FIELD])
      ? (playerData[PENDING_DELETES_FIELD] as unknown[]).filter(
          (v): v is string => typeof v === 'string' && v.trim().length > 0
        )
      : [];
    const prevFailed = prevPending.length
      ? await drainPhotoDestroyQueue(prevPending, uid, clubUid, playerId)
      : [];

    const remainingPending = [...new Set([...prevFailed, ...curFailed])];
    await savePendingPhotoDeletes(playerRef, remainingPending);

    await touchUserActivity(uid);
    return NextResponse.json({
      ok: true,
      storageDeleted: true,
      pendingDeletes: remainingPending.length,
      ...(remainingPending.length
        ? { warning: '一部の旧画像ファイルの削除に失敗しました。次回の画像操作時に自動で再試行します。' }
        : {}),
    });
  } catch (error) {
    console.error('[player-photos] delete failed', error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
