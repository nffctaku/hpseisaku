import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { db } from '@/lib/firebase/admin';
import type { DocumentReference } from 'firebase-admin/firestore';

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const proPriceId = process.env.STRIPE_PRICE_ID;
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

const stripe = stripeSecretKey
  ? new Stripe(stripeSecretKey, { apiVersion: '2024-06-20' })
  : null;

const OFFICIA_MONTHLY_PRODUCT_ID = 'prod_Ttjx45ygceCBbw';
const OFFICIA_ANNUAL_PRODUCT_ID = 'prod_TtnQto5avOK0S9';

const resolvePlanFromSubscription = (sub: Stripe.Subscription): 'free' | 'pro' | 'officia' => {
  const status = sub.status;
  const activeLike = status === 'active' || status === 'trialing' || status === 'past_due';
  if (!activeLike) return 'free';

  const item = sub.items?.data?.[0];
  const price = item?.price;
  const priceId = typeof price?.id === 'string' ? price.id : '';
  const productId = typeof price?.product === 'string' ? price.product : '';

  if (proPriceId && priceId === proPriceId) return 'pro';
  if (productId === OFFICIA_MONTHLY_PRODUCT_ID || productId === OFFICIA_ANNUAL_PRODUCT_ID) return 'officia';
  return 'free';
};

const getProfileRefsByCustomerId = async (
  customerId: string
): Promise<DocumentReference[]> => {
  const snap = await db
    .collection('club_profiles')
    .where('stripeCustomerId', '==', customerId)
    .limit(10)
    .get();
  return snap.docs.map((d) => d.ref);
};

export async function POST(req: NextRequest) {
  if (!stripe || !webhookSecret) {
    console.error('Stripe webhook not configured');
    return new NextResponse('Stripe not configured', { status: 500 });
  }

  const sig = req.headers.get('stripe-signature');
  if (!sig) {
    return new NextResponse('Missing stripe-signature header', { status: 400 });
  }

  let event: Stripe.Event;
  const rawBody = await req.text();

  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed', err);
    return new NextResponse('Webhook Error', { status: 400 });
  }

  try {
    // Webhookの再送/重複配信対策（idempotency）
    const eventRef = db.collection('stripe_webhook_events').doc(event.id);
    const already = await eventRef.get();
    if (already.exists) {
      return new NextResponse('OK', { status: 200 });
    }

    await eventRef.set(
      {
        type: event.type,
        created: event.created,
        receivedAtMs: Date.now(),
      },
      { merge: true }
    );

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const ownerUid = session.client_reference_id;
      const customerId = typeof session.customer === 'string' ? session.customer : undefined;

      const planRaw = typeof (session as any)?.metadata?.plan === 'string' ? String((session as any).metadata.plan) : '';
      const plan = planRaw === 'officia' ? 'officia' : 'pro';

      if (ownerUid) {
        const profileRef = db.collection('club_profiles').doc(ownerUid);
        const updateData: Record<string, unknown> = { plan };

        if (customerId) {
          updateData.stripeCustomerId = customerId;
        }

        await profileRef.set(updateData, { merge: true });

        // create-checkout-session側の再利用キャッシュを完了扱いに
        await db
          .collection('stripe_checkout_sessions')
          .doc(ownerUid)
          .set(
            {
              status: 'completed',
              completedAtMs: Date.now(),
              sessionId: session.id,
            },
            { merge: true }
          );
      } else {
        console.warn('checkout.session.completed without client_reference_id');
      }
    }

    if (event.type === 'customer.subscription.updated') {
      const sub = event.data.object as Stripe.Subscription;
      const customerId = typeof sub.customer === 'string' ? sub.customer : undefined;
      if (customerId) {
        const plan = resolvePlanFromSubscription(sub);
        const refs = await getProfileRefsByCustomerId(customerId);
        await Promise.all(refs.map((ref: DocumentReference) => ref.set({ plan }, { merge: true })));
      } else {
        console.warn('customer.subscription.updated without customer id');
      }
    }

    if (event.type === 'customer.subscription.deleted') {
      const sub = event.data.object as Stripe.Subscription;
      const customerId = typeof sub.customer === 'string' ? sub.customer : undefined;
      if (customerId) {
        const refs = await getProfileRefsByCustomerId(customerId);
        await Promise.all(refs.map((ref: DocumentReference) => ref.set({ plan: 'free' }, { merge: true })));
      } else {
        console.warn('customer.subscription.deleted without customer id');
      }
    }

    return new NextResponse('OK', { status: 200 });
  } catch (error) {
    console.error('Error handling Stripe webhook', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
