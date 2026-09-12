import { db } from '@/lib/firebase/admin';
import { isProPlan, isNonEmptyString } from '@/lib/admin-analytics/uid-analytics';
import { getPlanTier, type PlanTier } from '@/lib/plan-limits';

export interface EffectivePlan {
  plan: 'pro' | 'officia' | 'free';
  tier: PlanTier;
  isPaid: boolean;
  isGranted: boolean;
}

function normalizeProStatus(status: unknown): 'pro' | null {
  return typeof status === 'string' && status.toLowerCase() === 'pro' ? 'pro' : null;
}

export async function getEffectivePlanForUid(uid: string): Promise<EffectivePlan> {
  const [userSnap, ownProfileSnap, ownedProfilesSnap] = await Promise.all([
    db.collection('users').doc(uid).get(),
    db.collection('club_profiles').doc(uid).get(),
    db.collection('club_profiles').where('ownerUid', '==', uid).get(),
  ]);

  const userData = userSnap.exists ? (userSnap.data() as Record<string, unknown>) : undefined;
  const userSubscription = userData?.subscription as { status?: string } | undefined;

  const profiles: Record<string, unknown>[] = [];

  if (ownProfileSnap.exists) {
    const data = ownProfileSnap.data() as Record<string, unknown>;
    // 同じドキュメントが ownerUid クエリに含まれる場合を避けるため id で判定
    const isDuplicate = ownedProfilesSnap.docs.some((d) => d.id === uid);
    if (!isDuplicate) {
      profiles.push(data);
    }
  }

  for (const d of ownedProfilesSnap.docs) {
    profiles.push(d.data() as Record<string, unknown>);
  }

  // 優先：Paid Pro
  const isUserSubscriptionPro = normalizeProStatus(userSubscription?.status) === 'pro';
  const hasPaidProfile = profiles.some(
    (p) => isProPlan(p.plan) && isNonEmptyString(p.stripeCustomerId)
  );

  if (isUserSubscriptionPro || hasPaidProfile) {
    return { plan: 'pro', tier: getPlanTier('pro'), isPaid: true, isGranted: false };
  }

  // 次：Granted Pro
  const hasGrantedProfile = profiles.some((p) => isProPlan(p.plan));
  if (hasGrantedProfile) {
    return { plan: 'officia', tier: getPlanTier('officia'), isPaid: false, isGranted: true };
  }

  return { plan: 'free', tier: getPlanTier('free'), isPaid: false, isGranted: false };
}
