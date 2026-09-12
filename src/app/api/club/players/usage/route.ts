import { NextRequest, NextResponse } from 'next/server';
import { auth, db } from '@/lib/firebase/admin';
import { getPlanLimit } from '@/lib/plan-limits';
import { getEffectivePlanForUid } from '@/lib/server-plan';
import { toDashSeason } from '@/lib/season';

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!token) {
      return NextResponse.json({ currentCount: 0, limit: 0, plan: 'free', error: 'Unauthorized' }, { status: 401 });
    }
    const decoded = await auth.verifyIdToken(token);
    const uid = decoded.uid;

    const { searchParams } = new URL(req.url);
    const season = searchParams.get('season') || '';
    if (!season) {
      return NextResponse.json({ currentCount: 0, limit: 0, plan: 'free', error: 'season is required' }, { status: 400 });
    }

    const { plan, tier } = await getEffectivePlanForUid(uid);
    const limit = getPlanLimit('players_per_team_per_season', tier);

    const seasonDash = toDashSeason(season);
    const countSnap = await db
      .collection(`clubs/${uid}/seasons/${seasonDash}/roster`)
      .count()
      .get();

    return NextResponse.json({ currentCount: countSnap.data().count, limit, plan });
  } catch (error) {
    console.error('[players/usage] error:', error);
    return NextResponse.json({ currentCount: 0, limit: 0, plan: 'free', error: 'Failed' }, { status: 500 });
  }
}
