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

    // 旧画像の Cloudinary 削除（best-effort）。
    // Firestore の参照は既に新URLへ切り替わっているため、失敗しても
    // 参照側に不整合は残らない（孤立ファイルが残るのみ）。
    const prevUrl = typeof prevPhotoUrl === 'string' ? prevPhotoUrl.trim() : '';
    if (prevUrl && prevUrl !== photoUrl.trim()) {
      const cloudName = process.env.CLOUDINARY_CLOUD_NAME || '';
      const prevPublicId = extractCloudinaryPublicId(prevUrl, cloudName);
      if (prevPublicId) {
        // Careerコピー等でURLを共有している場合は実ファイルを消さない
        const shared = await isPhotoUrlReferencedElsewhere(prevUrl, uid, clubUid, playerId);
        if (shared) {
          console.info('[player-photos] prev image still referenced elsewhere, skip destroy', { prevPublicId });
        } else {
          const ok = await destroyCloudinaryImage(prevPublicId);
          if (!ok) {
            console.warn('[player-photos] prev image destroy failed', { prevPublicId });
          }
        }
      }
    }

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

// doc が対象URLを参照しているか（トップレベル + 全 seasonData）
function docReferencesPhotoUrl(data: Record<string, any>, url: string): boolean {
  if (typeof data?.photoUrl === 'string' && data.photoUrl.trim() === url) return true;
  const sd = data?.seasonData && typeof data.seasonData === 'object' ? data.seasonData : {};
  return Object.values(sd).some(
    (s: any) => typeof s?.photoUrl === 'string' && s.photoUrl.trim() === url
  );
}

// 同一オーナーの全Career(clubUid)＋uid直下を走査し、対象選手以外に
// このURLを参照する doc が残っているかを返す。
// Careerコピー等で画像URLを共有している場合、他方の参照が残る限り
// Cloudinary の実ファイルを物理削除してはいけない。
async function isPhotoUrlReferencedElsewhere(
  url: string,
  ownerUid: string,
  currentClubUid: string,
  currentPlayerId: string
): Promise<boolean> {
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
        if (docReferencesPhotoUrl(p.data() as Record<string, any>, url)) return true;
      }
    }
    const seasonsSnap = await db.collection(`clubs/${cu}/seasons`).get();
    for (const s of seasonsSnap.docs) {
      const rosterSnap = await s.ref.collection('roster').get();
      for (const r of rosterSnap.docs) {
        if (cu === currentClubUid && r.id === currentPlayerId) continue;
        if (docReferencesPhotoUrl(r.data() as Record<string, any>, url)) return true;
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

// 選手画像URLの削除。
// Cloudinary の旧画像を先に削除し、成功した場合のみ Firestore の参照を消す。
// → Storage 削除が失敗した時点で Firestore を触らずにエラーを返すことで、
//    「参照だけ消えて実ファイルが残る」不整合を防ぐ。
//    （既に実ファイルが無い場合は not found=成功扱いで冪等に進行する）
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

    // 削除対象の旧URLを収集（Cloudinary 削除用）
    const oldUrls = new Set<string>();
    if (typeof playerData?.photoUrl === 'string' && playerData.photoUrl.trim()) oldUrls.add(playerData.photoUrl.trim());
    for (const sd of Object.values(seasonData)) {
      if (typeof sd?.photoUrl === 'string' && sd.photoUrl.trim()) oldUrls.add(sd.photoUrl.trim());
    }

    // 1. Cloudinary の旧画像を先に削除。失敗時は Firestore を変更せず終了。
    //    ただし他Career/他選手が同じURLを参照している場合は実ファイルを保持し、
    //    参照の削除（Firestore側）だけを行う。
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME || '';
    for (const url of oldUrls) {
      const publicId = extractCloudinaryPublicId(url, cloudName);
      if (!publicId) continue;
      const shared = await isPhotoUrlReferencedElsewhere(url, uid, clubUid, playerId);
      if (shared) {
        console.info('[player-photos] image referenced elsewhere, skip destroy', { publicId });
        continue;
      }
      const ok = await destroyCloudinaryImage(publicId);
      if (!ok) {
        console.error('[player-photos] cloudinary destroy failed', { publicId });
        return NextResponse.json(
          { ok: false, error: '画像ストレージの削除に失敗しました。時間をおいて再度お試しください。' },
          { status: 502 }
        );
      }
    }

    // 2. Firestore の参照を削除（player + 全シーズンの roster）
    // ネストしたフィールドの削除は update() のフィールドパス指定が必要なため、
    // 存在する roster doc のみ update する。
    const batch = db.batch();
    const playerUpdate: Record<string, unknown> = {
      photoUrl: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    for (const s of allSeasons) {
      playerUpdate[`seasonData.${s}.photoUrl`] = FieldValue.delete();
    }
    batch.update(playerRef, playerUpdate);

    const rosterRefs = allSeasons.map((s) => ({
      season: s,
      ref: db.doc(`clubs/${clubUid}/seasons/${s}/roster/${playerId}`),
    }));
    const rosterSnaps = await Promise.all(rosterRefs.map((r) => r.ref.get()));
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

    await touchUserActivity(uid);
    return NextResponse.json({ ok: true, storageDeleted: true });
  } catch (error) {
    console.error('[player-photos] delete failed', error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
