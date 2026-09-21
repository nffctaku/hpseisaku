import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/firebase/admin';
import { getEffectivePlanForUid } from '@/lib/server-plan';

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!token) {
      return NextResponse.json({ plan: 'free', error: 'Unauthorized' }, { status: 401 });
    }
    const decoded = await auth.verifyIdToken(token);
    const { plan, isPaid, isGranted } = await getEffectivePlanForUid(decoded.uid);
    const source = isPaid ? 'paid' : isGranted ? 'granted' : 'none';
    return NextResponse.json({ plan, source });
  } catch (error) {
    console.error('[me/plan] error:', error);
    return NextResponse.json({ plan: 'free', error: 'Failed' }, { status: 500 });
  }
}
