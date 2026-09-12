import { NextRequest, NextResponse } from 'next/server';
import { auth, db, admin } from '@/lib/firebase/admin';
import { getPlanLimit } from '@/lib/plan-limits';
import { getEffectivePlanForUid } from '@/lib/server-plan';
import { touchUserActivity } from '@/lib/server-activity';

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

    const body = (await req.json()) as SaveTeamLogoRequest;
    const { teamId, logoUrl } = body;
    if (!teamId || typeof logoUrl !== 'string') {
      return NextResponse.json<SaveTeamLogoResponse>({ ok: false, logoUrl: '', error: 'Missing fields' }, { status: 400 });
    }

    const { tier, plan } = await getEffectivePlanForUid(uid);
    const limit = getPlanLimit('team_images_per_account', tier);

    const teamRef = db.collection(`clubs/${uid}/teams`).doc(teamId);
    const [teamSnap, teamsSnap] = await Promise.all([
      teamRef.get(),
      db.collection(`clubs/${uid}/teams`).get(),
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
