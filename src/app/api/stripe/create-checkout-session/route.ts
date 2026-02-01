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

type CheckoutPlan = 'pro' | 'officia';

const resolvePriceId = async (opts: { plan: CheckoutPlan; productId?: string }): Promise<string> => {
  if (!stripe) throw new Error('Stripe not configured');

  if (opts.plan === 'pro') {
    if (!priceId) throw new Error('STRIPE_PRICE_ID is not set');
    return priceId;
  }

  // Officia: productId -> default_price
  const productId = typeof opts.productId === 'string' ? opts.productId : '';
  if (!productId) throw new Error('productId is required for Officia plan');

  const product = await stripe.products.retrieve(productId, { expand: ['default_price'] });
  const defaultPrice = (product as any)?.default_price;
  const resolved = typeof defaultPrice === 'string' ? defaultPrice : typeof defaultPrice?.id === 'string' ? defaultPrice.id : '';
  if (!resolved) throw new Error('default_price is missing on the Stripe product');
  return resolved;
};

export async function POST(req: NextRequest) {
  try {
    if (!stripe) {
      return NextResponse.json(
        { error: 'Stripe is not correctly configured on the server.' },
        { status: 500 }
      );
    }

    const requestOrigin = req.nextUrl?.origin;
    const baseUrl = requestOrigin || appBaseUrl;
    if (!baseUrl) {
      return NextResponse.json(
        { error: 'App URL is not correctly configured on the server.' },
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

    const body = await req.json().catch(() => ({} as any));
    const planRaw = typeof body?.plan === 'string' ? body.plan : 'pro';
    const plan: CheckoutPlan = planRaw === 'officia' ? 'officia' : 'pro';
    const productId = typeof body?.productId === 'string' ? body.productId : undefined;

    // 既に有料なら決済を作らない
    try {
      const profileRef = db.collection('club_profiles').doc(ownerUid);
      const profileSnap = await profileRef.get();
      const plan = profileSnap.exists ? (profileSnap.data() as any)?.plan : undefined;
      if (plan === 'pro' || plan === 'officia') {
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

    let resolvedPriceId: string;
    try {
      resolvedPriceId = await resolvePriceId({ plan, productId });
    } catch (e) {
      console.error('[create-checkout-session] failed to resolve price', {
        plan,
        productId,
        message: (e as any)?.message,
      });
      return NextResponse.json(
        { error: (e as any)?.message || 'Failed to resolve price.' },
        { status: 400 }
      );
    }

    const session = await stripe.checkout.sessions.create(
      {
      mode: 'subscription',
      line_items: [{ price: resolvedPriceId, quantity: 1 }],
      success_url: `${baseUrl}/admin/plan?result=success`,
      cancel_url: `${baseUrl}/admin/plan?result=cancel`,
      client_reference_id: ownerUid,
      metadata: {
        plan,
      },
      subscription_data: {
        metadata: {
          plan,
        },
      },
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
    console.error('[create-checkout-session] Error creating checkout session:', {
      message: (error as any)?.message,
      code: (error as any)?.code,
      type: (error as any)?.type,
    });
    return NextResponse.json(
      {
        error: (error as any)?.message || 'Failed to create checkout session',
        code: (error as any)?.code,
      },
      { status: 500 }
    );
  }
}
