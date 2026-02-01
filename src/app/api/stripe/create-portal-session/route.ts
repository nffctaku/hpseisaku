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

    let ownerUidHint = '';
    let flow: 'manage' | 'cancel' = 'manage';
    try {
      const body = await req.json();
      const flowRaw = typeof (body as any)?.flow === 'string' ? String((body as any).flow) : 'manage';
      flow = flowRaw === 'cancel' ? 'cancel' : 'manage';
      ownerUidHint = typeof body?.ownerUid === 'string' ? body.ownerUid.trim() : '';
    } catch {
      // ignore (no body)
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

    const findStripeCustomerIdByEmail = async (emailToTry: string) => {
      const safe = String(emailToTry || '').trim();
      if (!safe) return null;

      const customers = await stripe.customers.list({ email: safe, limit: 1 });
      const first = customers.data?.[0];
      if (first?.id) {
        return {
          id: first.id,
          lookupCount: Array.isArray(customers.data) ? customers.data.length : 0,
          searchCount: 0,
          searchError: null as string | null,
          restoredFrom: 'email' as const,
        };
      }

      let searchCount = 0;
      let searchError: string | null = null;
      try {
        const queryEmail = safe.replace(/'/g, "\\'");
        const searched = await stripe.customers.search({ query: `email:'${queryEmail}'`, limit: 1 });
        searchCount = Array.isArray(searched.data) ? searched.data.length : 0;
        const hit = searched.data?.[0];
        if (hit?.id) {
          return {
            id: hit.id,
            lookupCount: Array.isArray(customers.data) ? customers.data.length : 0,
            searchCount,
            searchError,
            restoredFrom: 'email_search' as const,
          };
        }
      } catch (e) {
        searchError = (e as any)?.message || String(e);
      }

      return {
        id: null,
        lookupCount: Array.isArray(customers.data) ? customers.data.length : 0,
        searchCount,
        searchError,
        restoredFrom: null,
      };
    };

    // Resolve correct club profile document (supports admin users)
    let profileRef = db.collection('club_profiles').doc(requesterUid);
    let profileSnap = await profileRef.get();
    let resolvedBy: 'doc_id' | 'ownerUid' | 'admins' | 'none' = 'doc_id';

    // If the client provides an ownerUid hint, prefer it (after verifying access)
    if (ownerUidHint && ownerUidHint !== requesterUid) {
      try {
        const hintedRef = db.collection('club_profiles').doc(ownerUidHint);
        const hintedSnap = await hintedRef.get();
        if (hintedSnap.exists) {
          const hintedData = hintedSnap.data() as any;
          const hintedAdmins = Array.isArray(hintedData?.admins) ? hintedData.admins : [];
          const hintedOwnerUid = typeof hintedData?.ownerUid === 'string' ? hintedData.ownerUid.trim() : '';
          const allowed = hintedSnap.id === ownerUidHint && (hintedOwnerUid === ownerUidHint || hintedOwnerUid === '')
            ? hintedAdmins.includes(requesterUid)
            : hintedAdmins.includes(requesterUid);

          // Owner himself is always allowed
          const ownerAllowed = ownerUidHint === requesterUid;

          if (ownerAllowed || allowed) {
            profileRef = hintedRef;
            profileSnap = hintedSnap;
            resolvedBy = 'ownerUid';
          }
        }
      } catch (e) {
        console.warn('[create-portal-session] failed to use ownerUid hint', e);
      }
    }

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

    let profileData = profileSnap.data() as {
      stripeCustomerId?: string;
      ownerUid?: string;
      admins?: string[];
      clubId?: string;
    };
    let stripeCustomerId = profileData?.stripeCustomerId;

    // If doc_id profile exists but is missing club context, prefer a related profile (admins / owner)
    // so we can recover billing information from the authoritative club profile.
    if (
      profileSnap.exists &&
      !stripeCustomerId &&
      (!profileData?.clubId || !profileData?.ownerUid)
    ) {
      try {
        const adminSnap = await db
          .collection('club_profiles')
          .where('admins', 'array-contains', requesterUid)
          .limit(10)
          .get();

        // Prefer one that already has stripeCustomerId; else prefer one with clubId/ownerUid.
        let best: FirebaseFirestore.QueryDocumentSnapshot | null = null;
        for (const d of adminSnap.docs) {
          const dData = d.data() as any;
          const hasCid = typeof dData?.stripeCustomerId === 'string' && dData.stripeCustomerId.trim();
          const hasClub = typeof dData?.clubId === 'string' && dData.clubId.trim();
          const hasOwner = typeof dData?.ownerUid === 'string' && dData.ownerUid.trim();
          if (hasCid) {
            best = d;
            break;
          }
          if (!best && hasClub && hasOwner) {
            best = d;
          }
        }

        if (best) {
          profileRef = best.ref;
          profileSnap = best;
          profileData = best.data() as any;
          stripeCustomerId = typeof (profileData as any)?.stripeCustomerId === 'string'
            ? String((profileData as any).stripeCustomerId).trim()
            : undefined;
          resolvedBy = 'admins';
        }
      } catch (e) {
        console.warn('[create-portal-session] failed to prefer admins profile over doc_id profile', e);
      }
    }

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
        ownerUidHint: ownerUidHint || null,
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
        clubIdPresent: (debug as any).clubIdPresent ?? null,
        clubProfilesByClubIdCount: (debug as any).clubProfilesByClubIdCount ?? null,
        clubIdLookupError: (debug as any).clubIdLookupError ?? null,
        adminProfilesCount: (debug as any).adminProfilesCount ?? null,
        ownerUidPresent: (debug as any).ownerUidPresent ?? null,
        ownerEmailPresent: (debug as any).ownerEmailPresent ?? null,
        ownerCustomerLookupByEmailCount: (debug as any).ownerCustomerLookupByEmailCount ?? null,
        ownerCustomerSearchByEmailCount: (debug as any).ownerCustomerSearchByEmailCount ?? null,
        ownerCustomerSearchByEmailError: (debug as any).ownerCustomerSearchByEmailError ?? null,
        adminOwnerFallbackError: (debug as any).adminOwnerFallbackError ?? null,
        restoredFrom: (debug as any).restoredFrom ?? null,
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

        const byRequesterEmail = await findStripeCustomerIdByEmail(email);
        debug.customerLookupByEmailCount = byRequesterEmail?.lookupCount ?? 0;
        debug.customerSearchByEmailCount = byRequesterEmail?.searchCount ?? 0;
        debug.customerSearchByEmailError = (byRequesterEmail as any)?.searchError ?? null;
        if (byRequesterEmail?.id) {
          stripeCustomerId = byRequesterEmail.id;
          await profileRef.set({ stripeCustomerId }, { merge: true });
          debug.restoredFrom = byRequesterEmail.restoredFrom;
        }

        if (!stripeCustomerId) {
          // Fallback2: resolve from another club_profiles doc with the same clubId.
          // (This helps when admin users have their own club_profiles doc without billing info.)
          try {
            const clubId = typeof profileData?.clubId === 'string' ? profileData.clubId.trim() : '';
            debug.clubIdPresent = Boolean(clubId);
            if (clubId) {
              const snap = await db
                .collection('club_profiles')
                .where('clubId', '==', clubId)
                .limit(20)
                .get();
              debug.clubProfilesByClubIdCount = snap.size;
              for (const d of snap.docs) {
                const dData = d.data() as any;
                const cid = typeof dData?.stripeCustomerId === 'string' ? dData.stripeCustomerId.trim() : '';
                if (cid) {
                  // Switch to this profile as the billing authority.
                  profileRef = d.ref;
                  profileSnap = d;
                  profileData = dData;
                  stripeCustomerId = cid;
                  resolvedBy = 'ownerUid';
                  debug.restoredFrom = 'clubId_profile';
                  break;
                }
              }
            }
          } catch (e) {
            debug.clubIdLookupError = (e as any)?.message || String(e);
          }

          // Fallback3: resolve owner's email from a related club profile and try customer lookup again.
          if (!stripeCustomerId) {
            try {
              // Find a related club profile where requester is an admin.
              const adminSnap = await db
                .collection('club_profiles')
                .where('admins', 'array-contains', requesterUid)
                .limit(5)
                .get();

              debug.adminProfilesCount = adminSnap.size;

              let ownerUidToTry = '';
              if (!adminSnap.empty) {
                const d = adminSnap.docs[0];
                const dData = d.data() as any;
                ownerUidToTry = typeof dData?.ownerUid === 'string' ? dData.ownerUid.trim() : '';
              }

              debug.ownerUidPresent = Boolean(ownerUidToTry);

              if (ownerUidToTry) {
                let ownerEmail = '';
                try {
                  const ownerUser = await auth.getUser(ownerUidToTry);
                  ownerEmail = typeof ownerUser?.email === 'string' ? ownerUser.email.trim() : '';
                } catch (e) {
                  debug.ownerEmailLookupError = (e as any)?.message || String(e);
                }

                debug.ownerEmailPresent = Boolean(ownerEmail);

                if (ownerEmail) {
                  const byOwnerEmail = await findStripeCustomerIdByEmail(ownerEmail);
                  debug.ownerCustomerLookupByEmailCount = (byOwnerEmail as any)?.lookupCount ?? 0;
                  debug.ownerCustomerSearchByEmailCount = (byOwnerEmail as any)?.searchCount ?? 0;
                  debug.ownerCustomerSearchByEmailError = (byOwnerEmail as any)?.searchError ?? null;
                  if (byOwnerEmail?.id) {
                    stripeCustomerId = byOwnerEmail.id;
                    await profileRef.set({ stripeCustomerId }, { merge: true });
                    debug.restoredFrom = 'owner_email';
                  }
                }
              }
            } catch (e) {
              debug.adminOwnerFallbackError = (e as any)?.message || String(e);
            }
          }

          if (!stripeCustomerId) {
            // As a last resort, create a Stripe customer if we have an email.
            if (email) {
              try {
                const created = await stripe.customers.create({
                  email,
                  metadata: {
                    requesterUid,
                    profileDocId: String((profileSnap as any)?.id || ''),
                  },
                });
                stripeCustomerId = typeof created?.id === 'string' ? created.id : undefined;
                if (stripeCustomerId) {
                  await profileRef.set({ stripeCustomerId }, { merge: true });
                  debug.restoredFrom = 'created_customer';
                }
              } catch (e) {
                debug.customerCreateError = (e as any)?.message || String(e);
              }
            }

            if (!stripeCustomerId) {
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
          }
        }
      }
    }

    const configuration = 'bpc_1Sw05vP1yzZQTG1FLrwNKVAz';

    if (flow === 'cancel') {
      // Force the portal to open the cancellation flow even if the overview UI doesn't show it.
      const subs = await stripe.subscriptions.list({
        customer: stripeCustomerId,
        status: 'all',
        limit: 10,
      });
      const target = subs.data.find((s) =>
        s.status === 'active' || s.status === 'trialing' || s.status === 'past_due'
      );
      if (!target) {
        // Fall back to the regular portal so the user can still reach Stripe.
        const portalSession = await stripe.billingPortal.sessions.create({
          customer: stripeCustomerId,
          configuration,
          return_url: `${baseUrl}/admin/plan`,
        });
        return NextResponse.json(
          {
            url: portalSession.url,
            warning: 'No active subscription found for cancellation flow. Opened regular portal instead.',
            code: 'no_active_subscription_fallback',
          },
          { status: 200 }
        );
      }

      const portalSession = await stripe.billingPortal.sessions.create({
        customer: stripeCustomerId,
        configuration,
        flow_data: {
          type: 'subscription_cancel',
          subscription_cancel: {
            subscription: target.id,
          },
        },
        return_url: `${baseUrl}/admin/plan`,
      });

      return NextResponse.json({ url: portalSession.url }, { status: 200 });
    }

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      configuration,
      return_url: `${baseUrl}/admin/plan`,
    });

    return NextResponse.json({ url: portalSession.url }, { status: 200 });
  } catch (error) {
    console.error('[create-portal-session] Error creating Stripe Billing Portal session', {
      message: (error as any)?.message,
      code: (error as any)?.code,
      type: (error as any)?.type,
    });
    const message =
      typeof (error as any)?.message === 'string'
        ? String((error as any).message)
        : typeof error === 'string'
          ? error
          : 'Internal Server Error';
    const code = typeof (error as any)?.code === 'string' && (error as any).code ? String((error as any).code) : 'unknown_error';
    return NextResponse.json(
      {
        error: message,
        code,
      },
      { status: 500 }
    );
  }
}
