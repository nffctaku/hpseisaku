import { NextRequest, NextResponse } from 'next/server';
import { auth, db } from '@/lib/firebase/admin';
import { getPlanLimit } from '@/lib/plan-limits';
import { getEffectivePlanForUid } from '@/lib/server-plan';
import { getActiveClubUid } from '@/lib/career-server';

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!token) {
      return NextResponse.json({ currentCount: 0, limit: 0, plan: 'free', error: 'Unauthorized' }, { status: 401 });
    }
    const decoded = await auth.verifyIdToken(token);
    const uid = decoded.uid;
    const clubUid = await getActiveClubUid(uid);

    const { plan, tier } = await getEffectivePlanForUid(uid);
    const limit = getPlanLimit('team_images_per_account', tier);

    const teamsSnap = await db.collection(`clubs/${clubUid}/teams`).get();
    let currentCount = 0;
    for (const d of teamsSnap.docs) {
      const data = d.data() as Record<string, unknown>;
      if (typeof data.logoUrl === 'string' && data.logoUrl.trim().length > 0) {
        currentCount += 1;
      }
    }

    return NextResponse.json({ currentCount, limit, plan });
  } catch (error) {
    console.error('[teams/usage] error:', error);
    return NextResponse.json({ currentCount: 0, limit: 0, plan: 'free', error: 'Failed' }, { status: 500 });
  }
}
