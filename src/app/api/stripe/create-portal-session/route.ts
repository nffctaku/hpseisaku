import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { auth, db } from '@/lib/firebase/admin';

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL;

if (!stripeSecretKey) {
  console.warn('STRIPE_SECRET_KEY is not set');
}

const stripe = stripeSecretKey
  ? new Stripe(stripeSecretKey, { apiVersion: '2024-06-20' })
  : null;

let stripeAccountIdCache: string | null = null;

export async function POST(req: NextRequest) {
  try {
    if (!stripe) {
      return NextResponse.json(
        { error: 'Stripe is not correctly configured on the server.' },
        { status: 500 }
      );
    }

    const stripeKeyType = stripeSecretKey?.startsWith('sk_live_')
      ? 'live'
      : stripeSecretKey?.startsWith('sk_test_')
        ? 'test'
        : 'unknown';

    if (!stripeAccountIdCache) {
      try {
        const acct = await stripe.accounts.retrieve();
        stripeAccountIdCache = typeof (acct as any)?.id === 'string' ? (acct as any).id : 'unknown';
      } catch {
        stripeAccountIdCache = 'unknown';
      }
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
    const requesterUid = decoded.uid;
    let email = typeof (decoded as any)?.email === 'string' ? String((decoded as any).email).trim() : '';
    if (!email) {
      try {
        const userRecord = await auth.getUser(requesterUid);
        email = typeof userRecord?.email === 'string' ? userRecord.email.trim() : '';
      } catch (e) {
        console.warn('[create-portal-session] failed to load user email via admin auth.getUser', e);
      }
    }

    // Resolve correct club profile document (supports admin users)
    let profileRef = db.collection('club_profiles').doc(requesterUid);
    let profileSnap = await profileRef.get();
    let resolvedBy: 'doc_id' | 'ownerUid' | 'admins' | 'none' = 'doc_id';

    if (!profileSnap.exists) {
      try {
        const ownerSnap = await db
          .collection('club_profiles')
          .where('ownerUid', '==', requesterUid)
          .limit(1)
          .get();
        if (!ownerSnap.empty) {
          profileRef = ownerSnap.docs[0].ref;
          profileSnap = ownerSnap.docs[0];
          resolvedBy = 'ownerUid';
        }
      } catch (e) {
        console.warn('[create-portal-session] failed to resolve profile by ownerUid', e);
      }
    }

    if (!profileSnap.exists) {
      try {
        const adminSnap = await db
          .collection('club_profiles')
          .where('admins', 'array-contains', requesterUid)
          .limit(1)
          .get();
        if (!adminSnap.empty) {
          profileRef = adminSnap.docs[0].ref;
          profileSnap = adminSnap.docs[0];
          resolvedBy = 'admins';
        }
      } catch (e) {
        console.warn('[create-portal-session] failed to resolve profile by admins', e);
      }
    }

    if (!profileSnap.exists) {
      return NextResponse.json(
        { error: 'Club profile not found.' },
        { status: 404 }
      );
    }

    let profileData = profileSnap.data() as { stripeCustomerId?: string; ownerUid?: string; admins?: string[] };
    let stripeCustomerId = profileData?.stripeCustomerId;

    // If the profile we resolved does not have stripeCustomerId, try to find another related profile
    // (e.g. admin user has their own club_profiles doc without billing info, while owner's doc has it).
    if (!stripeCustomerId) {
      const candidateDocIds: string[] = [];
      const ownerUidFromProfile = typeof profileData?.ownerUid === 'string' ? profileData.ownerUid.trim() : '';
      if (ownerUidFromProfile && ownerUidFromProfile !== (profileSnap as any)?.id) {
        candidateDocIds.push(ownerUidFromProfile);
      }

      for (const docId of candidateDocIds) {
        try {
          const altRef = db.collection('club_profiles').doc(docId);
          const altSnap = await altRef.get();
          if (altSnap.exists) {
            const altData = altSnap.data() as any;
            const altCustomerId = typeof altData?.stripeCustomerId === 'string' ? altData.stripeCustomerId.trim() : '';
            if (altCustomerId) {
              profileRef = altRef;
              profileSnap = altSnap;
              profileData = altData;
              stripeCustomerId = altCustomerId;
              resolvedBy = 'ownerUid';
              break;
            }
          }
        } catch (e) {
          console.warn('[create-portal-session] failed to resolve alternate profile doc', e);
        }
      }

      if (!stripeCustomerId) {
        try {
          const adminSnap = await db
            .collection('club_profiles')
            .where('admins', 'array-contains', requesterUid)
            .limit(5)
            .get();
          for (const d of adminSnap.docs) {
            const altData = d.data() as any;
            const altCustomerId = typeof altData?.stripeCustomerId === 'string' ? altData.stripeCustomerId.trim() : '';
            if (altCustomerId) {
              profileRef = d.ref;
              profileSnap = d;
              profileData = altData;
              stripeCustomerId = altCustomerId;
              resolvedBy = 'admins';
              break;
            }
          }
        } catch (e) {
          console.warn('[create-portal-session] failed to search alternate profiles by admins', e);
        }
      }
    }

    const debug: Record<string, unknown> = {
      requesterUid,
      profileDocId: (profileSnap as any)?.id,
      resolvedBy,
      hasProfile: true,
      hasStripeCustomerIdInProfile: Boolean(stripeCustomerId),
      hasEmail: Boolean(email),
    };

    const publicDiag = () => {
      return {
        deploySha: process.env.VERCEL_GIT_COMMIT_SHA || process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || undefined,
        requesterUid,
        profileDocId: (profileSnap as any)?.id,
        resolvedBy,
        stripeKeyType,
        stripeAccountId: stripeAccountIdCache,
        hasStripeCustomerIdInProfile: Boolean(stripeCustomerId),
        hasCheckoutSessionCache: Boolean((debug as any).hasCheckoutSessionCache),
        checkoutSessionIdPresent: Boolean((debug as any).checkoutSessionIdPresent),
        customerLookupByEmailCount: (debug as any).customerLookupByEmailCount ?? null,
        customerSearchByEmailCount: (debug as any).customerSearchByEmailCount ?? null,
        customerSearchByEmailError: (debug as any).customerSearchByEmailError ?? null,
      };
    };

    if (!stripeCustomerId) {
      // 1) Most reliable recovery: restore from cached checkout session (if exists)
      try {
        const cacheRef = db.collection('stripe_checkout_sessions').doc((profileSnap as any)?.id || requesterUid);
        const cacheSnap = await cacheRef.get();
        const sessionId = cacheSnap.exists ? (cacheSnap.data() as any)?.sessionId : undefined;
        debug.hasCheckoutSessionCache = cacheSnap.exists;
        debug.checkoutSessionIdPresent = typeof sessionId === 'string' && sessionId.trim().length > 0;
        if (typeof sessionId === 'string' && sessionId.trim()) {
          const session = await stripe.checkout.sessions.retrieve(sessionId.trim());
          const customer = session?.customer;
          debug.checkoutSessionCustomerType = typeof customer;
          if (typeof customer === 'string' && customer.trim()) {
            stripeCustomerId = customer.trim();
            await profileRef.set({ stripeCustomerId }, { merge: true });
            debug.restoredFrom = 'checkout_session';
          }
        }
      } catch (e) {
        console.warn('[create-portal-session] failed to restore stripeCustomerId from checkout session cache', e);
        debug.checkoutSessionRestoreError = (e as any)?.message || String(e);
      }

      if (!stripeCustomerId) {
        if (!email) {
          return NextResponse.json(
            {
              error: 'Stripe customer information is not available for this user (missing stripeCustomerId and email).',
              code: 'missing_stripe_customer_and_email',
              diag: publicDiag(),
              ...(process.env.NODE_ENV !== 'production' ? { debug } : {}),
            },
            { status: 400 }
          );
        }

        const customers = await stripe.customers.list({ email, limit: 1 });
        let found = customers.data?.[0];
        debug.customerLookupByEmailCount = Array.isArray(customers.data) ? customers.data.length : 0;
        debug.customerSearchByEmailCount = 0;
        debug.customerSearchByEmailError = null;

        // Fallback: Search API tends to be more reliable than list-by-email for some Stripe data shapes.
        if (!found?.id) {
          try {
            const queryEmail = email.replace(/'/g, "\\'");
            const searched = await stripe.customers.search({ query: `email:'${queryEmail}'`, limit: 1 });
            debug.customerSearchByEmailCount = Array.isArray(searched.data) ? searched.data.length : 0;
            found = searched.data?.[0];
            if (found?.id) {
              debug.restoredFrom = 'email_search';
            }
          } catch (e) {
            debug.customerSearchByEmailError = (e as any)?.message || String(e);
          }
        }

        if (!found?.id) {
          return NextResponse.json(
            {
              error: 'Stripe customer information is not available for this user.',
              code: 'missing_stripe_customer',
              diag: publicDiag(),
              ...(process.env.NODE_ENV !== 'production' ? { debug } : {}),
            },
            { status: 400 }
          );
        }

        stripeCustomerId = found.id;
        await profileRef.set({ stripeCustomerId }, { merge: true });
        debug.restoredFrom = debug.restoredFrom || 'email';
      }
    }

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: `${baseUrl}/admin/plan`,
    });

    return NextResponse.json({ url: portalSession.url }, { status: 200 });
  } catch (error) {
    console.error('Error creating Stripe Billing Portal session', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
