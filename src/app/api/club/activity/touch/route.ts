import { NextResponse } from 'next/server';
import { auth } from '@/lib/firebase/admin';
import { touchUserActivity } from '@/lib/server-activity';

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!token) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const decoded = await auth.verifyIdToken(token);
    await touchUserActivity(decoded.uid);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[API] activity/touch error:', error);
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}
