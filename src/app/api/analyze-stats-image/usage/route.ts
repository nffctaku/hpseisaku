import { NextRequest, NextResponse } from 'next/server';
import { auth, db } from '@/lib/firebase/admin';
import { getPlanLimit } from '@/lib/plan-limits';
import { getEffectivePlanForUid } from '@/lib/server-plan';

function monthKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `ocr_${year}_${month}`;
}

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!token) {
      return NextResponse.json({ currentCount: 0, limit: 0, plan: 'free', error: 'Unauthorized' }, { status: 401 });
    }
    const decoded = await auth.verifyIdToken(token);
    const uid = decoded.uid;

    const { plan, tier } = await getEffectivePlanForUid(uid);
    const limit = getPlanLimit('ocr_per_month', tier);

    const usageDoc = await db.collection('users').doc(uid).collection('usage').doc(monthKey()).get();
    const currentCount = usageDoc.exists
      ? Number((usageDoc.data() as Record<string, unknown> | undefined)?.count) || 0
      : 0;

    return NextResponse.json({ currentCount, limit, plan });
  } catch (error) {
    console.error('[analyze-stats-image/usage] error:', error);
    return NextResponse.json({ currentCount: 0, limit: 0, plan: 'free', error: 'Failed' }, { status: 500 });
  }
}
