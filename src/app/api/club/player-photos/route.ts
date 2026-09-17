import { NextRequest, NextResponse } from 'next/server';
import { auth, db, admin } from '@/lib/firebase/admin';
import { getPlanLimit } from '@/lib/plan-limits';
import { getEffectivePlanForUid } from '@/lib/server-plan';
import { touchUserActivity } from '@/lib/server-activity';
import { getActiveClubUid } from '@/lib/career-server';

interface AttachPhotoRequest {
  teamId: string;
  season: string;
  playerId: string;
  photoUrl: string;
  seasons?: string[];
}

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
    const { teamId, season, playerId, photoUrl, seasons } = body;
    if (!teamId || !season || !playerId || typeof photoUrl !== 'string' || !photoUrl.trim()) {
      return NextResponse.json<AttachPhotoResponse>({ ok: false, photoUrl: '', error: 'Missing fields' }, { status: 400 });
    }

    const targetSeasonDash = (season || '').trim();
    const rawSeasons = [targetSeasonDash, ...(seasons || [])].filter(
      (s) => s.trim().length > 0
    );
    const syncSeasons = [...new Set(rawSeasons)];

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
      const rosterUpdate: Record<string, unknown> = {
        photoUrl,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      rosterUpdate[`seasonData.${s}.photoUrl`] = photoUrl;
      batch.set(rosterRef, rosterUpdate, { merge: true });
    }

    await batch.commit();
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
