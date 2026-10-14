import { NextRequest, NextResponse } from 'next/server';
import { auth, db, admin } from '@/lib/firebase/admin';
import { getPlanLimit } from '@/lib/plan-limits';
import { getEffectivePlanForUid } from '@/lib/server-plan';
import { touchUserActivity } from '@/lib/server-activity';
import { getActiveClubUid } from '@/lib/career-server';

interface SaveTeamLogoRequest {
  teamId: string;
  logoUrl: string;
}

interface SaveTeamLogoResponse {
  ok: boolean;
  logoUrl: string;
  currentCount?: number;
  limit?: number;
  plan?: string;
  error?: string;
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!token) {
      return NextResponse.json<SaveTeamLogoResponse>({ ok: false, logoUrl: '', error: 'Unauthorized' }, { status: 401 });
    }

    const decoded = await auth.verifyIdToken(token);
    const uid = decoded.uid;
    const clubUid = await getActiveClubUid(uid);

    const body = (await req.json()) as SaveTeamLogoRequest;
    const { teamId, logoUrl } = body;
    if (!teamId || typeof logoUrl !== 'string') {
      return NextResponse.json<SaveTeamLogoResponse>({ ok: false, logoUrl: '', error: 'Missing fields' }, { status: 400 });
    }

    const { tier, plan } = await getEffectivePlanForUid(uid);
    const limit = getPlanLimit('team_images_per_account', tier);

    const teamRef = db.collection(`clubs/${clubUid}/teams`).doc(teamId);
    const [teamSnap, teamsSnap] = await Promise.all([
      teamRef.get(),
      db.collection(`clubs/${clubUid}/teams`).get(),
    ]);

    const teamData = teamSnap.exists ? (teamSnap.data() as Record<string, unknown> || {}) : {};
    const hasExistingLogo = typeof teamData.logoUrl === 'string' && teamData.logoUrl.trim().length > 0;

    let currentCount = 0;
    for (const d of teamsSnap.docs) {
      if (d.id === teamId) continue;
      const data = d.data() as Record<string, unknown>;
      if (typeof data.logoUrl === 'string' && data.logoUrl.trim().length > 0) {
        currentCount += 1;
      }
    }

    const isSettingNewLogo = logoUrl.trim().length > 0 && !hasExistingLogo;

    if (Number.isFinite(limit) && isSettingNewLogo && currentCount >= limit) {
      await db.collection('analyticsEvents').add({
        eventName: 'plan_limit_reached',
        userId: uid,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        properties: {
          uid,
          limitType: 'team_image',
          currentCount,
          limit,
          plan,
          sourcePage: 'admin/teams',
          teamId,
        },
      });
      return NextResponse.json<SaveTeamLogoResponse>(
        { ok: false, logoUrl: '', error: `Freeプランではチーム画像は最大${limit}チームまで登録できます。`, currentCount, limit },
        { status: 403 }
      );
    }

    await teamRef.set(
      {
        logoUrl: logoUrl.trim().length > 0 ? logoUrl.trim() : null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    // メインチームのロゴは club_profiles にも伝播する
    // （公開クラブページ・選手名鑑・ヘッダーは club_profiles.logoUrl を参照するため）
    try {
      const profileRef = db.collection('club_profiles').doc(clubUid);
      const profileSnap = await profileRef.get();
      const profileData = profileSnap.exists ? (profileSnap.data() as Record<string, unknown>) : {};
      if (profileData.mainTeamId === teamId) {
        const nextLogo = logoUrl.trim().length > 0 ? logoUrl.trim() : null;
        const profilePatch = {
          logoUrl: nextLogo,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };
        await profileRef.set(profilePatch, { merge: true });
        // slug alias（club_profiles/{clubId}）も公開URL側の参照先として同期
        const aliasId =
          typeof profileData.clubId === 'string' && profileData.clubId.trim()
            ? profileData.clubId.trim()
            : typeof profileData.slug === 'string' && profileData.slug.trim()
              ? profileData.slug.trim()
              : '';
        if (aliasId && aliasId !== clubUid) {
          await db.collection('club_profiles').doc(aliasId).set(profilePatch, { merge: true });
        }
      }
    } catch (syncError) {
      // チームロゴ自体の保存は成功しているため、プロファイル同期失敗はログのみ
      console.error('[team-logo] club_profiles sync failed:', syncError);
    }

    await touchUserActivity(uid);

    return NextResponse.json<SaveTeamLogoResponse>({
      ok: true,
      logoUrl: logoUrl.trim().length > 0 ? logoUrl.trim() : '',
      currentCount: isSettingNewLogo ? currentCount + 1 : currentCount,
      limit,
      plan,
    });
  } catch (error) {
    console.error('[team-logo] save failed:', error);
    return NextResponse.json<SaveTeamLogoResponse>(
      { ok: false, logoUrl: '', error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
