import { isNonEmptyString, isProPlan, toDateMillis } from './uid-analytics';

export interface AdminCareer {
  id: string;
  ownerId: string;
  clubUid: string;
  name: string;
  clubName: string;
  clubId: string | null;
  status: string;
  isPublic: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface CareerMaps {
  careersByOwner: Map<string, AdminCareer[]>;
  careersByClubUid: Map<string, AdminCareer[]>;
  ownerByClubUid: Map<string, string>;
  activeCareerIdByOwner: Map<string, string>;
}

export function toAdminCareer(
  id: string,
  data: Record<string, unknown> | undefined
): AdminCareer {
  return {
    id,
    ownerId: typeof data?.ownerId === 'string' ? data.ownerId : '',
    clubUid: typeof data?.clubUid === 'string' ? data.clubUid : id,
    name:
      typeof data?.name === 'string' && data.name
        ? data.name
        : typeof data?.clubName === 'string'
          ? data.clubName
          : id,
    clubName: typeof data?.clubName === 'string' ? data.clubName : '',
    clubId: typeof data?.clubId === 'string' && data.clubId ? data.clubId : null,
    status: typeof data?.status === 'string' ? data.status : 'active',
    isPublic: data?.isPublic === true,
    createdAt: toDateMillis(data?.createdAt),
    updatedAt: toDateMillis(data?.updatedAt),
  };
}

export function buildCareerMaps(
  careersSnap: FirebaseFirestore.QuerySnapshot,
  userDataByUid: Record<string, Record<string, unknown>>
): CareerMaps {
  const careersByOwner = new Map<string, AdminCareer[]>();
  const careersByClubUid = new Map<string, AdminCareer[]>();
  const ownerByClubUid = new Map<string, string>();

  for (const d of careersSnap.docs) {
    const c = toAdminCareer(d.id, d.data() as Record<string, unknown>);
    if (!c.ownerId) continue;
    const byOwner = careersByOwner.get(c.ownerId) || [];
    byOwner.push(c);
    careersByOwner.set(c.ownerId, byOwner);
    const byClub = careersByClubUid.get(c.clubUid) || [];
    byClub.push(c);
    careersByClubUid.set(c.clubUid, byClub);
    if (!ownerByClubUid.has(c.clubUid)) ownerByClubUid.set(c.clubUid, c.ownerId);
  }

  const activeCareerIdByOwner = new Map<string, string>();
  for (const [uid, data] of Object.entries(userDataByUid)) {
    if (typeof data?.activeCareerId === 'string' && data.activeCareerId) {
      activeCareerIdByOwner.set(uid, data.activeCareerId);
    }
  }

  return { careersByOwner, careersByClubUid, ownerByClubUid, activeCareerIdByOwner };
}

// clubs/{x}/... のパス第1セグメントはデータルート clubUid。
// Career の clubUid なら owner uid へ解決し、解決できなければそのまま返す
// （旧データでは path 第1セグメントがそのまま uid のことがある）。
export function resolvePathOwnerUid(
  pathSegment: string,
  ownerByClubUid: Map<string, string>
): string {
  return ownerByClubUid.get(pathSegment) || pathSegment;
}

export interface EffectivePlanResult {
  plan: 'pro' | 'officia' | 'free';
  isPaid: boolean;
  isGranted: boolean;
}

// server-plan.ts の getEffectivePlanForUid と同一ルールを、
// 一括取得済みデータから計算する（N+1クエリ回避のためのメモリ版）。
//   1) stripeCustomerId 連携プロフィールの isProPlan → paid Pro
//   2) users.subscription.status='pro' かつ Stripe連携レコード無し → paid Pro
//      （連携レコードがあるのに全て非Pro = 解約済みなら stale として無視）
//   3) isProPlan のプロフィール or users.plan がPro系 → granted Pro
export function computeEffectivePlanFromData(
  userData: Record<string, unknown> | undefined,
  profiles: Array<Record<string, unknown>>
): EffectivePlanResult {
  const subscription = userData?.subscription as { status?: string } | undefined;
  const isUserSubscriptionPro =
    typeof subscription?.status === 'string' &&
    subscription.status.toLowerCase() === 'pro';

  const stripeProfiles = profiles.filter((p) => isNonEmptyString(p.stripeCustomerId));
  const hasPaidProfile = stripeProfiles.some((p) => isProPlan(p.plan));
  const hasStripeRecord =
    stripeProfiles.length > 0 || isNonEmptyString(userData?.stripeCustomerId);

  if (hasPaidProfile || (isUserSubscriptionPro && !hasStripeRecord)) {
    return { plan: 'pro', isPaid: true, isGranted: false };
  }

  const hasGranted =
    profiles.some((p) => isProPlan(p.plan)) || isProPlan(userData?.plan);
  if (hasGranted) {
    return { plan: 'officia', isPaid: false, isGranted: true };
  }

  return { plan: 'free', isPaid: false, isGranted: false };
}
