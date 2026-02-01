import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { db } from '@/lib/firebase/admin';

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

if (!stripeSecretKey) {
  console.warn('STRIPE_SECRET_KEY is not set');
}

const stripe = stripeSecretKey
  ? new Stripe(stripeSecretKey, { apiVersion: '2024-06-20' })
  : null;

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

    return new NextResponse('OK', { status: 200 });
  } catch (error) {
    console.error('Error handling Stripe webhook', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
