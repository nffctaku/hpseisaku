import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { auth, db } from '@/lib/firebase/admin';

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const priceId = process.env.STRIPE_PRICE_ID;
const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL;

if (!stripeSecretKey) {
  console.warn('STRIPE_SECRET_KEY is not set');
}

const stripe = stripeSecretKey
  ? new Stripe(stripeSecretKey, { apiVersion: '2024-06-20' })
  : null;

export async function POST(req: NextRequest) {
  try {
    if (!stripe || !priceId || !appBaseUrl) {
      return NextResponse.json(
        { error: 'Stripe is not correctly configured on the server.' },
        { status: 500 }
      );
    }

    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const idToken = authHeader.substring('Bearer '.length);
    const decoded = await auth.verifyIdToken(idToken);
    const ownerUid = decoded.uid;

    // 既にProなら決済を作らない
    try {
      const profileRef = db.collection('club_profiles').doc(ownerUid);
      const profileSnap = await profileRef.get();
      const plan = profileSnap.exists ? (profileSnap.data() as any)?.plan : undefined;
      if (plan === 'pro') {
        return NextResponse.json(
          { error: 'Already subscribed.' },
          { status: 409 }
        );
      }
    } catch (e) {
      console.warn('[create-checkout-session] failed to read club_profiles', e);
    }

    // 多重クリック対策：直近のCheckout Sessionを再利用
    const cacheRef = db.collection('stripe_checkout_sessions').doc(ownerUid);
    const now = Date.now();
    const ttlMs = 10 * 60 * 1000;
    const cacheSnap = await cacheRef.get();
    if (cacheSnap.exists) {
      const data = cacheSnap.data() as any;
      const createdAtMs = typeof data?.createdAtMs === 'number' ? data.createdAtMs : 0;
      const url = typeof data?.url === 'string' ? data.url : undefined;
      const status = typeof data?.status === 'string' ? data.status : undefined;
      if (url && status === 'open' && now - createdAtMs < ttlMs) {
        return NextResponse.json({ url }, { status: 200 });
      }
    }

    // Stripe側も冪等化
    const idempotencyKey = `checkout:${ownerUid}:${Math.floor(now / ttlMs)}`;

    const session = await stripe.checkout.sessions.create(
      {
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appBaseUrl}/admin/plan?result=success`,
      cancel_url: `${appBaseUrl}/admin/plan?result=cancel`,
      client_reference_id: ownerUid,
      },
      { idempotencyKey }
    );

    await cacheRef.set(
      {
        url: session.url,
        sessionId: session.id,
        status: 'open',
        createdAtMs: now,
      },
      { merge: true }
    );

    return NextResponse.json({ url: session.url }, { status: 200 });
  } catch (error) {
    console.error('Error creating Stripe Checkout Session', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
