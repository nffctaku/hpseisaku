import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { auth } from '@/lib/firebase';

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

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appBaseUrl}/admin/plan?result=success`,
      cancel_url: `${appBaseUrl}/admin/plan?result=cancel`,
      client_reference_id: ownerUid,
    });

    return NextResponse.json({ url: session.url }, { status: 200 });
  } catch (error) {
    console.error('Error creating Stripe Checkout Session', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
