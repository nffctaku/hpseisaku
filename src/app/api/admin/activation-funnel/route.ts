import { NextRequest, NextResponse } from 'next/server';
import { db, auth } from '@/lib/firebase/admin';
import { ADMIN_UID } from '@/lib/admin-config';
import {
  toDateMillis,
  isNonEmptyString,
  isProPlan,
  getClubName,
  ownerUidFromPath,
  validTeam,
  validPlayer,
  validCompetition,
  validMatch,
  hasTeamImage,
  hasPlayerImage,
  computeProStatus,
  computeTeamImageWithFallback,
} from '@/lib/admin-analytics/uid-analytics';
import { computeLastActivityForUid } from '@/lib/admin-analytics/last-activity';

// FC27 発売スケジュール（JST）。実際の日時が確定したらここを 1 箇所だけ変更してください。
const FC27_EARLY_ACCESS_DATE = new Date('2026-09-18T00:00:00+09:00').getTime();
const FC27_GLOBAL_RELEASE_DATE = new Date('2026-09-25T00:00:00+09:00').getTime();

interface FunnelRow {
  uid: string;
  email: string | null;
  hasProfile: boolean;
  clubNameSet: boolean;
  hasTeam: boolean;
  hasPlayer: boolean;
  hasCompetition: boolean;
  hasMatch: boolean;
  has10Matches: boolean;
  has50Matches: boolean;
  has100Matches: boolean;
  hasPlayerImage10: boolean;
  hasPlayerImage20: boolean;
  hasTeamImage: boolean;
  active7: boolean;
  active30: boolean;
  isPaidPro: boolean;
  isGrantedPro: boolean;
  isFree: boolean;
  matchCount: number;
  playerCount: number;
  playerImageCount: number;
  teamCount: number;
  teamImageCount: number;
  competitionCount: number;
  profileCount: number;
  registrationAt: number;
  signupAt: number;
  signupDate: string;
  signupWeek: number;
  cohort: 'pre_fc27' | 'early_access' | 'global_launch';
  utmCampaign: string | null;
  utmSource: string | null;
  profileCreatedAt: number;
  firstTeamAt: number;
  firstPlayerAt: number;
  firstCompetitionAt: number;
  firstMatchAt: number;
  daysToTeam: number | null;
  daysToPlayer: number | null;
  daysToCompetition: number | null;
  daysToFirstMatch: number | null;
  paidStartedAt: number;
  daysToPaid: number | null;
  subscriptionStatus: string | null;
  lastActivityAt: number;
  activeDetail: {
    lastActivityAt: number;
    eventAt: number;
    userAt: number;
    authAt: number;
    profileAt: number;
    representativeAt: number;
    userCreatedAt: number;
    profileCreatedAt: number;
    profileUpdatedAt: number;
    adoptedAt: number;
  };
}

interface FunnelSummary {
  total: number;
  hasProfile: number;
  clubNameSet: number;
  hasTeam: number;
  hasPlayer: number;
  hasCompetition: number;
  hasMatch: number;
  has10Matches: number;
  has50Matches: number;
  has100Matches: number;
  active7: number;
  active30: number;
  isPaidPro: number;
  isGrantedPro: number;
  isFree: number;
  hasTeamImage: number;
  hasPlayerImage20: number;
}

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const decoded = await auth.verifyIdToken(token);
    if (decoded.uid !== ADMIN_UID) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const full = searchParams.get('full') === '1';

    // 1. Auth ユーザー
    const authUsers: { uid: string; email: string | null; registrationAt: number; metadata: { lastSignInTime?: string } }[] = [];
    let nextPageToken: string | undefined;
    do {
      const listResult = await auth.listUsers(1000, nextPageToken);
      for (const u of listResult.users) {
        authUsers.push({
          uid: u.uid,
          email: u.email || null,
          registrationAt: toDateMillis((u.metadata as unknown as { creationTime?: string }).creationTime),
          metadata: { lastSignInTime: (u.metadata as unknown as { lastSignInTime?: string }).lastSignInTime },
        });
      }
      nextPageToken = listResult.pageToken;
    } while (nextPageToken);

    const now = Date.now();
    const ms30 = 30 * 24 * 60 * 60 * 1000;
    const ms7 = 7 * 24 * 60 * 60 * 1000;
    const since30 = new Date(now - ms30);
    const since7 = new Date(now - ms7);

    // 2. 最小限のフィールド取得（Firestore read コスト削減）
    const [
      profilesSnap,
      usersSnap,
      eventsSnap,
      teamsSnap,
      playersSnap,
      competitionsSnap,
      matchesSnap,
      friendlySnap,
    ] = await Promise.all([
      db.collection('club_profiles').select('ownerUid', 'clubName', 'name', 'teamName', 'club', 'profile', 'plan', 'stripeCustomerId', 'lastLoginAt', 'createdAt', 'mainTeamId', 'logoUrl').get(),
      db.collection('users').select('subscription', 'lastLoginAt', 'createdAt', 'utm_campaign', 'utm_source').get(),
      db.collection('analyticsEvents').where('createdAt', '>=', since30).select('userId', 'createdAt', 'eventName', 'properties').get(),
      db.collectionGroup('teams').select('name', 'logoUrl', 'image', 'photoUrl', 'imageUrl', 'isDeleted', 'createdAt').get(),
      db.collectionGroup('players').select('name', 'image', 'photo', 'photoUrl', 'photoURL', 'seasonData', 'imageUrl', 'isDeleted', 'createdAt').get(),
      db.collectionGroup('competitions').select('name', 'competitionName', 'ownerUid', 'clubProfileId', 'isDeleted', 'createdAt').get(),
      db.collectionGroup('matches').select('homeTeam', 'awayTeam', 'matchDate', 'ownerUid', 'clubProfileId', 'isDeleted', 'createdAt').get(),
      db.collectionGroup('friendly_matches').select('homeTeam', 'awayTeam', 'matchDate', 'ownerUid', 'clubProfileId', 'isDeleted', 'createdAt').get(),
    ]);

    // 3. club_profiles を UID ごとに集約
    const profilesByOwner: Record<string, FirebaseFirestore.QueryDocumentSnapshot[]> = {};
    const uidToPlan: Record<string, boolean> = {};
    const uidHasStripeCustomer: Record<string, boolean> = {};
    const mainTeamIdByUid: Record<string, string | null> = {};
    const clubLogoUrlByUid: Record<string, string | null> = {};

    for (const d of profilesSnap.docs) {
      const data = d.data() as Record<string, unknown>;
      const ownerUid = data.ownerUid;
      if (typeof ownerUid !== 'string' || ownerUid.trim() === '') continue;
      const uid = ownerUid.trim();
      profilesByOwner[uid] = profilesByOwner[uid] || [];
      profilesByOwner[uid].push(d);

      if (!uidToPlan[uid] && isProPlan(data.plan)) {
        uidToPlan[uid] = true;
      }
      if (!uidHasStripeCustomer[uid] && isProPlan(data.plan) && isNonEmptyString(data.stripeCustomerId)) {
        uidHasStripeCustomer[uid] = true;
      }

      if (mainTeamIdByUid[uid] == null && isNonEmptyString(data.mainTeamId)) {
        mainTeamIdByUid[uid] = data.mainTeamId.trim();
      }
      if (clubLogoUrlByUid[uid] == null && isNonEmptyString(data.logoUrl)) {
        clubLogoUrlByUid[uid] = data.logoUrl.trim();
      }
    }

    // 4. users コレクション
    const userDataByUid: Record<string, Record<string, unknown>> = {};
    for (const d of usersSnap.docs) {
      userDataByUid[d.id] = d.data() as Record<string, unknown>;
    }

    // 5. analyticsEvents から最新活動時刻を取得（UID 単位）
    const lastEventByUid: Record<string, number> = {};
    for (const d of eventsSnap.docs) {
      const data = d.data() as Record<string, unknown>;
      const uid = typeof data.userId === 'string' ? data.userId : null;
      if (!uid) continue;
      const ts = toDateMillis(data.createdAt);
      if (ts > (lastEventByUid[uid] || 0)) {
        lastEventByUid[uid] = ts;
      }
    }

    const monetizationEventNames = [
      'plan_limit_reached',
      'pro_paywall_view',
      'pro_cta_click',
      'checkout_start',
      'subscription_start',
    ] as const;
    type MonetizationEvent = (typeof monetizationEventNames)[number];

    const uidCohort: Record<string, 'pre_fc27' | 'early_access' | 'global_launch' | 'unknown'> = {};
    for (const d of usersSnap.docs) {
      const data = d.data() as Record<string, unknown>;
      const reg = toDateMillis(data.createdAt);
      const cohort =
        reg >= FC27_GLOBAL_RELEASE_DATE
          ? 'global_launch'
          : reg >= FC27_EARLY_ACCESS_DATE
            ? 'early_access'
            : reg > 0
              ? 'pre_fc27'
              : 'unknown';
      uidCohort[d.id] = cohort;
    }

    const eventSet: Record<MonetizationEvent, { last7: Set<string>; last30: Set<string>; byCohort: Record<string, Set<string>> }> = {
      plan_limit_reached: { last7: new Set<string>(), last30: new Set<string>(), byCohort: {} },
      pro_paywall_view: { last7: new Set<string>(), last30: new Set<string>(), byCohort: {} },
      pro_cta_click: { last7: new Set<string>(), last30: new Set<string>(), byCohort: {} },
      checkout_start: { last7: new Set<string>(), last30: new Set<string>(), byCohort: {} },
      subscription_start: { last7: new Set<string>(), last30: new Set<string>(), byCohort: {} },
    };
    for (const d of eventsSnap.docs) {
      const data = d.data() as Record<string, unknown>;
      const uid = typeof data.userId === 'string' ? data.userId : null;
      const eventName = typeof data.eventName === 'string' ? data.eventName : null;
      if (!uid || !eventName || !(monetizationEventNames as readonly string[]).includes(eventName)) continue;
      const ts = toDateMillis(data.createdAt);
      const key = eventName as MonetizationEvent;
      if (ts >= since7.getTime()) {
        eventSet[key].last7.add(uid);
        eventSet[key].last30.add(uid);
      } else if (ts >= since30.getTime()) {
        eventSet[key].last30.add(uid);
      }
      const cohort = uidCohort[uid] || 'unknown';
      eventSet[key].byCohort[cohort] = eventSet[key].byCohort[cohort] || new Set<string>();
      eventSet[key].byCohort[cohort].add(uid);
    }

    const toObj = (set: Set<string>) => set.size;
    const toCohortObj = (byCohort: Record<string, Set<string>>) =>
      Object.fromEntries(Object.entries(byCohort).map(([k, v]) => [k, v.size]));

    const last7: Record<MonetizationEvent, number> = {
      plan_limit_reached: toObj(eventSet.plan_limit_reached.last7),
      pro_paywall_view: toObj(eventSet.pro_paywall_view.last7),
      pro_cta_click: toObj(eventSet.pro_cta_click.last7),
      checkout_start: toObj(eventSet.checkout_start.last7),
      subscription_start: toObj(eventSet.subscription_start.last7),
    };
    const last30: Record<MonetizationEvent, number> = {
      plan_limit_reached: toObj(eventSet.plan_limit_reached.last30),
      pro_paywall_view: toObj(eventSet.pro_paywall_view.last30),
      pro_cta_click: toObj(eventSet.pro_cta_click.last30),
      checkout_start: toObj(eventSet.checkout_start.last30),
      subscription_start: toObj(eventSet.subscription_start.last30),
    };
    const byCohort: Record<MonetizationEvent, Record<string, number>> = {
      plan_limit_reached: toCohortObj(eventSet.plan_limit_reached.byCohort),
      pro_paywall_view: toCohortObj(eventSet.pro_paywall_view.byCohort),
      pro_cta_click: toCohortObj(eventSet.pro_cta_click.byCohort),
      checkout_start: toCohortObj(eventSet.checkout_start.byCohort),
      subscription_start: toCohortObj(eventSet.subscription_start.byCohort),
    };

    const monetizationFunnel: {
      last7: Record<MonetizationEvent, number>;
      last30: Record<MonetizationEvent, number>;
      byCohort: Record<MonetizationEvent, Record<string, number>>;
      limitType: Record<string, { last7: number; last30: number }>;
    } = {
      last7,
      last30,
      byCohort,
      limitType: {},
    };

    const limitTypes = ['player_photo', 'competition', 'ocr'] as const;
    for (const lt of limitTypes) {
      const last7Set = new Set<string>();
      const last30Set = new Set<string>();
      for (const d of eventsSnap.docs) {
        const data = d.data() as Record<string, unknown>;
        const uid = typeof data.userId === 'string' ? data.userId : null;
        const eventName = typeof data.eventName === 'string' ? data.eventName : null;
        const props = (data.properties || {}) as Record<string, unknown>;
        if (!uid || eventName !== 'plan_limit_reached' || props.limitType !== lt) continue;
        const ts = toDateMillis(data.createdAt);
        if (ts >= since7.getTime()) {
          last7Set.add(uid);
          last30Set.add(uid);
        } else if (ts >= since30.getTime()) {
          last30Set.add(uid);
        }
      }
      monetizationFunnel.limitType[lt] = { last7: last7Set.size, last30: last30Set.size };
    }

    // 6. 各種データを UID ごとに集約
    const hasTeamByUid: Record<string, boolean> = {};
    const teamCountByUid: Record<string, number> = {};
    const teamImageCountByUid: Record<string, number> = {};
    const firstTeamAtByUid: Record<string, number> = {};
    const mainTeamMap = new Map<string, Record<string, unknown>>();
    const hasPlayerByUid: Record<string, boolean> = {};
    const playerCountByUid: Record<string, number> = {};
    const playerImageCountByUid: Record<string, number> = {};
    const firstPlayerAtByUid: Record<string, number> = {};
    const hasCompetitionByUid: Record<string, boolean> = {};
    const competitionCountByUid: Record<string, number> = {};
    const firstCompetitionAtByUid: Record<string, number> = {};
    const matchCountByUid: Record<string, number> = {};
    const firstMatchAtByUid: Record<string, number> = {};

    for (const d of teamsSnap.docs) {
      const uid = ownerUidFromPath(d.ref.path);
      if (!uid) continue;
      const data = d.data() as Record<string, unknown>;
      if (!validTeam(data)) continue;
      hasTeamByUid[uid] = true;
      teamCountByUid[uid] = (teamCountByUid[uid] || 0) + 1;
      const ts = toDateMillis(data.createdAt);
      if (ts > 0 && (!firstTeamAtByUid[uid] || ts < firstTeamAtByUid[uid])) firstTeamAtByUid[uid] = ts;
      if (hasTeamImage(data)) {
        teamImageCountByUid[uid] = (teamImageCountByUid[uid] || 0) + 1;
      }
      mainTeamMap.set(`${uid}/${d.id}`, data);
    }
    for (const d of playersSnap.docs) {
      const uid = ownerUidFromPath(d.ref.path);
      if (!uid) continue;
      const data = d.data() as Record<string, unknown>;
      if (!validPlayer(data)) continue;
      hasPlayerByUid[uid] = true;
      playerCountByUid[uid] = (playerCountByUid[uid] || 0) + 1;
      const ts = toDateMillis(data.createdAt);
      if (ts > 0 && (!firstPlayerAtByUid[uid] || ts < firstPlayerAtByUid[uid])) firstPlayerAtByUid[uid] = ts;
      if (hasPlayerImage(data)) {
        playerImageCountByUid[uid] = (playerImageCountByUid[uid] || 0) + 1;
      }
    }
    for (const d of competitionsSnap.docs) {
      const data = d.data() as Record<string, unknown>;
      const uidFromPath = ownerUidFromPath(d.ref.path);
      const uidFromData = typeof data.ownerUid === 'string' ? data.ownerUid : typeof data.clubProfileId === 'string' ? data.clubProfileId : null;
      const uid = (uidFromPath && uidFromPath.trim()) || (uidFromData && uidFromData.trim());
      if (uid && validCompetition(data)) {
        hasCompetitionByUid[uid] = true;
        competitionCountByUid[uid] = (competitionCountByUid[uid] || 0) + 1;
        const ts = toDateMillis(data.createdAt);
        if (ts > 0 && (!firstCompetitionAtByUid[uid] || ts < firstCompetitionAtByUid[uid])) firstCompetitionAtByUid[uid] = ts;
      }
    }
    const processMatchDoc = (d: FirebaseFirestore.QueryDocumentSnapshot) => {
      const data = d.data() as Record<string, unknown>;
      const uidFromPath = ownerUidFromPath(d.ref.path);
      const uidFromData = typeof data.ownerUid === 'string' ? data.ownerUid : null;
      const uid = (uidFromPath && uidFromPath.trim()) || (uidFromData && uidFromData.trim());
      if (uid && validMatch(data)) {
        matchCountByUid[uid] = (matchCountByUid[uid] || 0) + 1;
        const ts = toDateMillis(data.createdAt);
        if (ts > 0 && (!firstMatchAtByUid[uid] || ts < firstMatchAtByUid[uid])) firstMatchAtByUid[uid] = ts;
      }
    };

    for (const d of matchesSnap.docs) {
      processMatchDoc(d);
    }
    for (const d of friendlySnap.docs) {
      processMatchDoc(d);
    }

    // 7. 1ユーザーごとにファネル状態を判定
    const msDay = 24 * 60 * 60 * 1000;
    const msWeek = 7 * msDay;
    const rows: FunnelRow[] = [];
    for (const u of authUsers) {
      const uid = u.uid;
      const profiles = profilesByOwner[uid] || [];
      const hasProfile = profiles.length > 0;

      const clubNameSet = profiles.some((d) => getClubName(d.data() as Record<string, unknown>) !== null);

      const hasTeam = hasTeamByUid[uid] || false;
      const hasPlayer = hasPlayerByUid[uid] || false;
      const hasCompetition = hasCompetitionByUid[uid] || false;
      const matchCount = matchCountByUid[uid] || 0;
      const hasMatch = matchCount > 0;
      const has10Matches = matchCount >= 10;
      const has50Matches = matchCount >= 50;
      const has100Matches = matchCount >= 100;

      const playerCount = playerCountByUid[uid] || 0;
      const playerImageCount = playerImageCountByUid[uid] || 0;
      const hasPlayerImage10 = playerImageCount >= 10;
      const hasPlayerImage20 = playerImageCount >= 20;
      const teamCount = teamCountByUid[uid] || 0;
      const ownTeamImageCount = teamImageCountByUid[uid] || 0;
      const mainTeamId = mainTeamIdByUid[uid] || null;
      const mainTeamData = mainTeamId ? mainTeamMap.get(`${uid}/${mainTeamId}`) : undefined;
      const mainTeamLogoUrl = typeof mainTeamData?.logoUrl === 'string' ? mainTeamData.logoUrl : null;
      const clubLogoUrl = clubLogoUrlByUid[uid] || null;
      const teamImageCount = computeTeamImageWithFallback(ownTeamImageCount, teamCount, {
        mainTeamId,
        mainTeamLogoUrl,
        clubLogoUrl,
      });
      const hasTeamImage = teamImageCount > 0;
      const competitionCount = competitionCountByUid[uid] || 0;

      const profileCreatedAt = Math.max(
        ...profiles.map((d) => toDateMillis((d.data() as Record<string, unknown>).createdAt)),
        ...profiles.map((d) => toDateMillis(d.createTime))
      );

      // 登録日時： Auth creationTime > users.createdAt > profile.createdAt
      const userCreatedAt = toDateMillis(userDataByUid[uid]?.createdAt);
      const signupAt = u.registrationAt || userCreatedAt || profileCreatedAt || 0;
      const signupDate = signupAt > 0 ? new Date(signupAt).toISOString().slice(0, 10) : '';
      const cohort: 'pre_fc27' | 'early_access' | 'global_launch' =
        signupAt <= 0 ? 'pre_fc27' :
        signupAt < FC27_EARLY_ACCESS_DATE ? 'pre_fc27' :
        signupAt < FC27_GLOBAL_RELEASE_DATE ? 'early_access' : 'global_launch';
      const signupWeek = signupAt > 0 ? Math.floor((signupAt - FC27_GLOBAL_RELEASE_DATE) / msWeek) + 1 : 0;

      const firstTeamAt = firstTeamAtByUid[uid] || 0;
      const firstPlayerAt = firstPlayerAtByUid[uid] || 0;
      const firstCompetitionAt = firstCompetitionAtByUid[uid] || 0;
      const firstMatchAt = firstMatchAtByUid[uid] || 0;

      const days = (from: number, to: number) => from > 0 && to > 0 ? Math.round((to - from) / msDay) : null;
      const daysToTeam = days(signupAt, firstTeamAt);
      const daysToPlayer = days(signupAt, firstPlayerAt);
      const daysToCompetition = days(signupAt, firstCompetitionAt);
      const daysToFirstMatch = days(signupAt, firstMatchAt);

      const authLastSignInAt = (u.metadata as unknown as { lastSignInTime?: string }).lastSignInTime;
      const { lastActivityAt: lastActivity, active7, active30, sources } = computeLastActivityForUid({
        userData: userDataByUid[uid],
        authLastSignInAt,
        profileDocs: profiles.map((d) => d.data() as Record<string, unknown>),
        lastEventAt: lastEventByUid[uid],
        now,
      });
      const activeDetail = {
        lastActivityAt: sources.lastActivityAt ?? 0,
        eventAt: sources.eventAt ?? 0,
        userAt: sources.userAt ?? 0,
        authAt: sources.authAt ?? 0,
        profileAt: sources.profileAt ?? 0,
        representativeAt: sources.representativeAt ?? 0,
        userCreatedAt: sources.userCreatedAt ?? 0,
        profileCreatedAt: sources.profileCreatedAt ?? 0,
        profileUpdatedAt: sources.profileUpdatedAt ?? 0,
        adoptedAt: lastActivity ?? 0,
      };

      const userSubscription = userDataByUid[uid]?.subscription as { status?: string; startedAt?: unknown } | undefined;
      const proStatus = computeProStatus(uid, {
        userSubscription,
        uidHasStripeCustomer,
        uidToPlan,
      });
      const { isPaidPro, isGrantedPro, isFree } = proStatus;

      const paidStartedAt = toDateMillis(userSubscription?.startedAt);
      const daysToPaid = isPaidPro && paidStartedAt > 0 && signupAt > 0 ? days(signupAt, paidStartedAt) : null;

      const utmCampaign = typeof userDataByUid[uid]?.utm_campaign === 'string' ? userDataByUid[uid].utm_campaign : null;
      const utmSource = typeof userDataByUid[uid]?.utm_source === 'string' ? userDataByUid[uid].utm_source : null;

      const subscriptionStatus = typeof userSubscription?.status === 'string' ? userSubscription.status : null;

      rows.push({
        uid,
        email: u.email,
        hasProfile,
        clubNameSet,
        hasTeam,
        hasPlayer,
        hasCompetition,
        hasMatch,
        has10Matches,
        has50Matches,
        has100Matches,
        hasPlayerImage10,
        hasPlayerImage20,
        hasTeamImage,
        active7,
        active30,
        isPaidPro,
        isGrantedPro,
        isFree,
        matchCount,
        playerCount,
        playerImageCount,
        teamCount,
        teamImageCount,
        competitionCount,
        profileCount: profiles.length,
        registrationAt: u.registrationAt,
        signupAt,
        signupDate,
        signupWeek,
        cohort,
        utmCampaign,
        utmSource,
        profileCreatedAt,
        firstTeamAt,
        firstPlayerAt,
        firstCompetitionAt,
        firstMatchAt,
        daysToTeam,
        daysToPlayer,
        daysToCompetition,
        daysToFirstMatch,
        paidStartedAt,
        daysToPaid,
        subscriptionStatus,
        lastActivityAt: lastActivity ?? 0,
        activeDetail,
      });
    }

    // 8. コホートフィルター
    const cohortParam = searchParams.get('cohort') || 'all';
    const filteredRows = cohortParam === 'all' ? rows : rows.filter((r) => r.cohort === cohortParam);

    // 9. summary
    const buildSummary = (targetRows: FunnelRow[]): FunnelSummary =>
      targetRows.reduce<FunnelSummary>(
        (acc, r) => ({
          total: acc.total + 1,
          hasProfile: acc.hasProfile + (r.hasProfile ? 1 : 0),
          clubNameSet: acc.clubNameSet + (r.clubNameSet ? 1 : 0),
          hasTeam: acc.hasTeam + (r.hasTeam ? 1 : 0),
          hasPlayer: acc.hasPlayer + (r.hasPlayer ? 1 : 0),
          hasCompetition: acc.hasCompetition + (r.hasCompetition ? 1 : 0),
          hasMatch: acc.hasMatch + (r.hasMatch ? 1 : 0),
          has10Matches: acc.has10Matches + (r.has10Matches ? 1 : 0),
          has50Matches: acc.has50Matches + (r.has50Matches ? 1 : 0),
          has100Matches: acc.has100Matches + (r.has100Matches ? 1 : 0),
          active7: acc.active7 + (r.active7 ? 1 : 0),
          active30: acc.active30 + (r.active30 ? 1 : 0),
          isPaidPro: acc.isPaidPro + (r.isPaidPro ? 1 : 0),
          isGrantedPro: acc.isGrantedPro + (r.isGrantedPro ? 1 : 0),
          isFree: acc.isFree + (r.isFree ? 1 : 0),
          hasTeamImage: acc.hasTeamImage + (r.hasTeamImage ? 1 : 0),
          hasPlayerImage20: acc.hasPlayerImage20 + (r.hasPlayerImage20 ? 1 : 0),
        }),
        {
          total: 0,
          hasProfile: 0,
          clubNameSet: 0,
          hasTeam: 0,
          hasPlayer: 0,
          hasCompetition: 0,
          hasMatch: 0,
          has10Matches: 0,
          has50Matches: 0,
          has100Matches: 0,
          active7: 0,
          active30: 0,
          isPaidPro: 0,
          isGrantedPro: 0,
          isFree: 0,
          hasTeamImage: 0,
          hasPlayerImage20: 0,
        }
      );

    const summary = buildSummary(filteredRows);
    const summaryByProfile = buildSummary(filteredRows.filter((r) => r.hasProfile));

    const mainFunnel = [
      { key: 'total', label: '登録', count: summary.total, prev: summary.total },
      { key: 'hasProfile', label: 'profile保有', count: summary.hasProfile, prev: summary.hasProfile },
      { key: 'clubNameSet', label: 'クラブ名設定', count: summary.clubNameSet, prev: summary.clubNameSet },
      { key: 'hasTeam', label: 'チーム登録あり', count: summary.hasTeam, prev: summary.hasTeam },
      { key: 'hasPlayer', label: '選手登録あり', count: summary.hasPlayer, prev: summary.hasPlayer },
      { key: 'hasCompetition', label: '大会登録あり', count: summary.hasCompetition, prev: summary.hasCompetition },
      { key: 'hasMatch', label: '試合登録あり', count: summary.hasMatch, prev: summary.hasMatch },
    ];

    const matchDepth = [
      { key: 'hasMatch', label: '試合登録あり', count: summary.hasMatch, prev: summary.hasMatch },
      { key: 'has10Matches', label: '10試合以上', count: summary.has10Matches, prev: summary.hasMatch },
      { key: 'has50Matches', label: '50試合以上', count: summary.has50Matches, prev: summary.has10Matches },
      { key: 'has100Matches', label: '100試合以上', count: summary.has100Matches, prev: summary.has50Matches },
    ];

    const activeSteps = [
      { key: 'active30', label: '30日Active', count: summary.active30, prev: summary.total },
      { key: 'active7', label: '7日Active', count: summary.active7, prev: summary.total },
    ];

    const proSteps = [
      { key: 'isPaidPro', label: 'Paid Pro', count: summary.isPaidPro, prev: summary.total },
      { key: 'isGrantedPro', label: 'Granted Pro', count: summary.isGrantedPro, prev: summary.total },
      { key: 'isFree', label: 'Free', count: summary.isFree, prev: summary.total },
    ];

    const buildStep = (s: { key: string; label: string; count: number; prev: number }) => ({
      ...s,
      rateFromTotal: summary.total > 0 ? Math.round((s.count / summary.total) * 1000) / 10 : 0,
      cvrFromPrev: s.prev > 0 ? Math.round((s.count / s.prev) * 1000) / 10 : 0,
    });

    // 9. 重複profile集計（ファネル母数に影響しない）
    let duplicateProfileUsers = 0;
    let extraProfiles = 0;
    for (const [, docs] of Object.entries(profilesByOwner)) {
      if (docs.length > 1) {
        duplicateProfileUsers++;
        extraProfiles += docs.length - 1;
      }
    }

    const totalCompetitionDocs = competitionsSnap.size;
    const unmappedCompetitionDocs = competitionsSnap.docs.filter((d) => {
      const data = d.data() as Record<string, unknown>;
      const pathUid = ownerUidFromPath(d.ref.path);
      const dataUid = typeof data.ownerUid === 'string' ? data.ownerUid : null;
      return !pathUid && !dataUid;
    }).length;

    const median = (arr: number[]): number => {
      const sorted = [...arr].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    };
    const rate = (n: number, d: number): number => d > 0 ? Math.round((n / d) * 1000) / 10 : 0;

    const freeUsers = filteredRows.filter((r) => r.isFree);
    const freeUsage = {
      total: freeUsers.length,
      has10Matches: freeUsers.filter((r) => r.has10Matches).length,
      has50Matches: freeUsers.filter((r) => r.has50Matches).length,
      has100Matches: freeUsers.filter((r) => r.has100Matches).length,
      hasPlayerImage10: freeUsers.filter((r) => r.hasPlayerImage10).length,
      hasPlayerImage20: freeUsers.filter((r) => r.hasPlayerImage20).length,
      hasTeamImage: freeUsers.filter((r) => r.hasTeamImage).length,
      active30: freeUsers.filter((r) => r.active30).length,
    };

    const paidUsers = filteredRows.filter((r) => r.isPaidPro);
    const matchCounts = paidUsers.map((r) => r.matchCount);
    const playerCounts = paidUsers.map((r) => r.playerCount);
    const playerImageCounts = paidUsers.map((r) => r.playerImageCount);
    const teamCounts = paidUsers.map((r) => r.teamCount);
    const teamImageCounts = paidUsers.map((r) => r.teamImageCount);
    const competitionCounts = paidUsers.map((r) => r.competitionCount);
    const daysToPaid = paidUsers.map((r) => r.daysToPaid).filter((v): v is number => v !== null);
    const paidAnalysis = {
      count: paidUsers.length,
      matchCount: { avg: paidUsers.length ? matchCounts.reduce((a, b) => a + b, 0) / paidUsers.length : 0, median: median(matchCounts) },
      playerCount: { avg: paidUsers.length ? playerCounts.reduce((a, b) => a + b, 0) / paidUsers.length : 0, median: median(playerCounts) },
      playerImageCount: { avg: paidUsers.length ? playerImageCounts.reduce((a, b) => a + b, 0) / paidUsers.length : 0, median: median(playerImageCounts) },
      teamCount: { avg: paidUsers.length ? teamCounts.reduce((a, b) => a + b, 0) / paidUsers.length : 0, median: median(teamCounts) },
      teamImageCount: { avg: paidUsers.length ? teamImageCounts.reduce((a, b) => a + b, 0) / paidUsers.length : 0, median: median(teamImageCounts) },
      competitionCount: { avg: paidUsers.length ? competitionCounts.reduce((a, b) => a + b, 0) / paidUsers.length : 0, median: median(competitionCounts) },
      active7: paidUsers.filter((r) => r.active7).length,
      active30: paidUsers.filter((r) => r.active30).length,
      daysToPaid: { avg: daysToPaid.length ? daysToPaid.reduce((a, b) => a + b, 0) / daysToPaid.length : 0, median: median(daysToPaid) },
    };

    const paidVsFree = {
      match: { paid: rate(paidUsers.filter((r) => r.hasMatch).length, paidUsers.length), free: rate(freeUsers.filter((r) => r.hasMatch).length, freeUsers.length) },
      match10: { paid: rate(paidUsers.filter((r) => r.has10Matches).length, paidUsers.length), free: rate(freeUsers.filter((r) => r.has10Matches).length, freeUsers.length) },
      match50: { paid: rate(paidUsers.filter((r) => r.has50Matches).length, paidUsers.length), free: rate(freeUsers.filter((r) => r.has50Matches).length, freeUsers.length) },
      match100: { paid: rate(paidUsers.filter((r) => r.has100Matches).length, paidUsers.length), free: rate(freeUsers.filter((r) => r.has100Matches).length, freeUsers.length) },
      active30: { paid: rate(paidUsers.filter((r) => r.active30).length, paidUsers.length), free: rate(freeUsers.filter((r) => r.active30).length, freeUsers.length) },
      playerImage20: { paid: rate(paidUsers.filter((r) => r.hasPlayerImage20).length, paidUsers.length), free: rate(freeUsers.filter((r) => r.hasPlayerImage20).length, freeUsers.length) },
      teamImage: { paid: rate(paidUsers.filter((r) => r.hasTeamImage).length, paidUsers.length), free: rate(freeUsers.filter((r) => r.hasTeamImage).length, freeUsers.length) },
    };

    const dropoff = [
      { key: 'A', label: 'profileなし', count: filteredRows.filter((r) => !r.hasProfile).length },
      { key: 'B', label: 'profileあり / teamなし', count: filteredRows.filter((r) => r.hasProfile && !r.hasTeam).length },
      { key: 'C', label: 'teamあり / playerなし', count: filteredRows.filter((r) => r.hasTeam && !r.hasPlayer).length },
      { key: 'D', label: 'playerあり / competitionなし', count: filteredRows.filter((r) => r.hasPlayer && !r.hasCompetition).length },
      { key: 'E', label: 'competitionあり / matchなし', count: filteredRows.filter((r) => r.hasCompetition && !r.hasMatch).length },
      { key: 'F', label: 'matchあり', count: filteredRows.filter((r) => r.hasMatch).length },
    ];

    const noMatchUsers = filteredRows.filter((r) => !r.hasMatch);
    const noMatch = {
      total: noMatchUsers.length,
      active30: noMatchUsers.filter((r) => r.active30).length,
      active7: noMatchUsers.filter((r) => r.active7).length,
      hasPlayer: noMatchUsers.filter((r) => r.hasPlayer).length,
      hasCompetition: noMatchUsers.filter((r) => r.hasCompetition).length,
      hasTeam: noMatchUsers.filter((r) => r.hasTeam).length,
      active30NoMatch: noMatchUsers.filter((r) => r.active30).length,
    };

    const core = (r: FunnelRow) => r.has50Matches || r.has100Matches || r.hasPlayerImage20;
    const superCore = (r: FunnelRow) => r.has100Matches && r.active30;
    const coreUsers = {
      core: filteredRows.filter(core).length,
      corePaid: filteredRows.filter((r) => core(r) && r.isPaidPro).length,
      coreFree: filteredRows.filter((r) => core(r) && r.isFree).length,
      coreGranted: filteredRows.filter((r) => core(r) && r.isGrantedPro).length,
      superCore: filteredRows.filter(superCore).length,
      superCorePaid: filteredRows.filter((r) => superCore(r) && r.isPaidPro).length,
      superCoreFree: filteredRows.filter((r) => superCore(r) && r.isFree).length,
      superCoreGranted: filteredRows.filter((r) => superCore(r) && r.isGrantedPro).length,
    };

    // 10. FC27 コホート分析（全件ベース）
    const cohortKpis = (targetRows: FunnelRow[]) => ({
      total: targetRows.length,
      hasProfile: rate(targetRows.filter((r) => r.hasProfile).length, targetRows.length),
      hasTeam: rate(targetRows.filter((r) => r.hasTeam).length, targetRows.length),
      hasPlayer: rate(targetRows.filter((r) => r.hasPlayer).length, targetRows.length),
      hasCompetition: rate(targetRows.filter((r) => r.hasCompetition).length, targetRows.length),
      hasMatch: rate(targetRows.filter((r) => r.hasMatch).length, targetRows.length),
      has10Matches: rate(targetRows.filter((r) => r.has10Matches).length, targetRows.length),
      isPaidPro: rate(targetRows.filter((r) => r.isPaidPro).length, targetRows.length),
      active7: rate(targetRows.filter((r) => r.active7).length, targetRows.length),
      active30: rate(targetRows.filter((r) => r.active30).length, targetRows.length),
    });

    const preRows = rows.filter((r) => r.cohort === 'pre_fc27');
    const earlyRows = rows.filter((r) => r.cohort === 'early_access');
    const globalRows = rows.filter((r) => r.cohort === 'global_launch');
    const postRows = rows.filter((r) => r.cohort !== 'pre_fc27');
    const pre = cohortKpis(preRows);
    const earlyAccess = cohortKpis(earlyRows);
    const globalLaunch = cohortKpis(globalRows);
    const preVsCohorts = { pre, earlyAccess, globalLaunch };

    const weekly = [1, 2, 3, 4].map((week) => {
      const wk = globalRows.filter((r) => r.signupWeek === week);
      return {
        week,
        total: wk.length,
        hasMatch: rate(wk.filter((r) => r.hasMatch).length, wk.length),
        has10Matches: rate(wk.filter((r) => r.has10Matches).length, wk.length),
        active7: rate(wk.filter((r) => r.active7).length, wk.length),
        isPaidPro: rate(wk.filter((r) => r.isPaidPro).length, wk.length),
      };
    });

    const timeToFirst = (rows: FunnelRow[], key: 'daysToTeam' | 'daysToPlayer' | 'daysToCompetition' | 'daysToFirstMatch' | 'daysToPaid') => {
      const values = rows.map((r) => r[key]).filter((v): v is number => v !== null);
      return { avg: values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0, median: median(values) };
    };

    const postTimeToFirstValue = {
      team: timeToFirst(postRows, 'daysToTeam'),
      player: timeToFirst(postRows, 'daysToPlayer'),
      competition: timeToFirst(postRows, 'daysToCompetition'),
      match: timeToFirst(postRows, 'daysToFirstMatch'),
      paid: timeToFirst(postRows.filter((r) => r.isPaidPro), 'daysToPaid'),
    };

    const utmGroups = (key: 'utmCampaign' | 'utmSource', targetRows: FunnelRow[]) => {
      const groups: Record<string, FunnelRow[]> = {};
      for (const r of targetRows) {
        const name = (r[key] || 'direct').toLowerCase();
        groups[name] = groups[name] || [];
        groups[name].push(r);
      }
      return Object.entries(groups)
        .map(([name, list]) => ({
          name,
          total: list.length,
          hasMatch: rate(list.filter((r) => r.hasMatch).length, list.length),
          isPaidPro: rate(list.filter((r) => r.isPaidPro).length, list.length),
        }))
        .sort((a, b) => b.total - a.total);
    };

    const utm = {
      campaign: utmGroups('utmCampaign', postRows),
      source: utmGroups('utmSource', postRows),
    };

    const freeRows = filteredRows.filter((r) => r.isFree);
    const potentialProUsers = {
      playerImage20plus: freeRows.filter((r) => r.playerImageCount >= 20).length,
      competition3plus: freeRows.filter((r) => r.competitionCount >= 3).length,
      player30plus: freeRows.filter((r) => r.playerCount >= 30).length,
      match50plus: freeRows.filter((r) => r.matchCount >= 50).length,
      match100plus: freeRows.filter((r) => r.matchCount >= 100).length,
    };

    // 11. 整合性チェック
    const consistency = {
      profileLeTotal: summary.hasProfile <= summary.total,
      clubNameLeProfile: summary.clubNameSet <= summary.hasProfile,
      competitionDocsMappable: totalCompetitionDocs - unmappedCompetitionDocs >= 0,
      paidLeTotal: summary.isPaidPro <= summary.total,
      proSumEqualsTotal: summary.isPaidPro + summary.isGrantedPro + summary.isFree === summary.total,
    };

    return NextResponse.json({
      earlyAccessAt: FC27_EARLY_ACCESS_DATE,
      globalReleaseAt: FC27_GLOBAL_RELEASE_DATE,
      cohort: cohortParam,
      summary,
      summaryByProfile,
      funnel: mainFunnel.map(buildStep),
      matchDepth: matchDepth.map(buildStep),
      active: activeSteps.map(buildStep),
      pro: proSteps.map(buildStep),
      freeUsage,
      paidAnalysis,
      paidVsFree,
      dropoff,
      noMatch,
      coreUsers,
      preVsCohorts,
      weekly,
      postTimeToFirstValue,
      utm,
      kpiTargets: {
        team: 65,
        player: 30,
        match: 20,
      },
      duplicate: {
        duplicateProfileUsers,
        extraProfiles,
        totalCompetitionDocs,
        unmappedCompetitionDocs,
      },
      consistency,
      monetizationFunnel,
      potentialProUsers,
      users: full ? filteredRows : null,
    });
  } catch (error) {
    console.error('[activation-funnel]', error);
    return NextResponse.json({ error: 'Server error', message: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
