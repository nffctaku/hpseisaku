import { NextRequest, NextResponse } from "next/server";
import { db, auth, admin } from "@/lib/firebase/admin";
import { ADMIN_UID } from "@/lib/admin-config";
import { scoreRepresentativeProfiles } from "@/lib/representative-profile";
import {
  isNonEmptyString,
  isProPlan,
  validTeam,
  validPlayer,
  validCompetition,
  validMatch,
  hasTeamImage,
  hasPlayerImage,
  computeTeamImageWithFallback,
  type MatchDiagnostic,
} from "@/lib/admin-analytics/uid-analytics";
import { computeLastActivityForUid } from "@/lib/admin-analytics/last-activity";
import {
  buildCareerMaps,
  computeEffectivePlanFromData,
  type AdminCareer,
} from "@/lib/admin-analytics/career-mapping";

const ANALYTICS_DAYS = 30;

interface CareerItem {
  careerId: string;
  name: string;
  clubUid: string;
  status: string;
  isDefault: boolean;
  isActive: boolean;
  isCreating: boolean;
  sharedDataRoot: boolean;
  clubName: string;
  nameSet: boolean;
  publicSlug: string;
  publicUrl: string;
  isPublic: boolean;
  playerCount: number;
  playerImageCount: number;
  teamCount: number;
  teamImageCount: number;
  competitionCount: number;
  matchCount: number;
  newsCount: number;
  lastActivityAt: string | null;
}

interface ClubListItem {
  id: string;
  clubName: string;
  nameSet: boolean;
  allCareersNameUnset: boolean;
  anyCareerNameUnset: boolean;
  logoUrl: string | null;
  publicUrl: string;
  publicSlug: string;
  ownerUid: string;
  email: string | null;
  clubCreatedAt: string | null;
  lastActivityAt: string | null;
  playerCount: number | null;
  playerImageCount: number | null;
  playerImageRate: number | null;
  mainTeamName: string | null;
  teamCount: number | null;
  teamImageCount: number | null;
  teamImageRate: number | null;
  competitionCount: number | null;
  matchCount: number | null;
  newsCount: number | null;
  isPaidPro: boolean;
  isGrantedPro: boolean;
  isFree: boolean;
  plan: string;
  analyticsCohort: string;
  isPublic: boolean;
  aggregateAvailable: boolean;
  aggregateUnavailableReason: string | null;
  usageLevel: number | null;
  active7: boolean;
  active30: boolean;
  engaged7: boolean;
  engaged30: boolean;
  matchActive7: boolean;
  matchActive30: boolean;
  duplicateProfileCount: number;
  authExists: boolean;
  allProfilePlans: string[];
  allStripeCustomerIds: string[];
  anyProPlan: boolean;
  anyStripeCustomer: boolean;
  lastActivityAtMillis: number;
  careerCount: number;
  creatingCareerCount: number;
  dataRootCount: number;
  sharedDataRoots: number;
  profileCount: number;
  unmatchedProfileCount: number;
  careers: CareerItem[];
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

interface ProfileDiagnostics {
  clubProfilesTotal: number;
  careerMatchedProfiles: number;
  ownerDocProfiles: number;
  unmatchedProfiles: number;
  unmatchedProfileIds: string[];
  authlessProfiles: number;
  authlessOwnerUids: string[];
  // 要確認profileを持つAuth存在owner数と、各指標への包含状況
  unmatchedOwnerUids: number;
  unmatchedInclusion: {
    publicUsers: number;
    nameUnsetUsers: number;
    active7Users: number;
    active30Users: number;
    usageUsers: number;
  };
}

interface Summary {
  total: number;
  // Firebase Auth の実UID数（Source of Truth）。total は Analytics対象UID数。
  authTotal: number;
  aggregatable: number;
  totalCareers: number;
  creatingCareers: number;
  multiCareerUsers: number;
  nameSet: number;
  nameUnset: number;
  nameUnsetRate: number;
  public: number;
  publicCareers: number;
  nameUnsetCareers: number;
  paidPro: number;
  grantedPro: number;
  totalPro: number;
  free: number;
  active7: number;
  active30: number;
  withMatches: number;
  matches10: number;
  matches50: number;
  matches100: number;
  withMatchesRate: number;
  matches10Rate: number;
  matches50Rate: number;
  matches100Rate: number;
  withPlayerImages10: number;
  withPlayerImages20: number;
  withTeamImages: number;
  withTeamImages5: number;
  withPlayerImages10Rate: number;
  withPlayerImages20Rate: number;
  withTeamImagesRate: number;
  withTeamImages5Rate: number;
  unavailableByReason: Record<string, number>;
  multiClubOwners: number;
  multiClubProfiles: number;
  avgClubsPerMultiOwner: number;
  maxClubsPerOwner: number;
  engaged7: number;
  engaged30: number;
  matchActive7: number;
  matchActive30: number;
  clubProfilesTotal: number;
  reducedDisplayRows: number;
  // Careerベースの折りたたみ数: Σ max(Career数-1, 0) per UID
  foldedCareers: number;
  // Career保有/旧形式（Career無し）の内訳
  usersWithCareers: number;
  legacyUsers: number;
  publicCareerUsers: number;
  publicLegacyUsers: number;
  allNameUnsetCareerUsers: number;
  legacyNameUnsetUsers: number;
}

function toIso(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0) return null;
    return new Date(value).toISOString();
  }
  if (value instanceof admin.firestore.Timestamp) {
    return value.toDate().toISOString();
  }
  if (value instanceof Date) return value.toISOString();
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// clubs/{clubUid}/... のパス第1セグメントを取り出す。
// 返り値はデータルート clubUid（旧データでは uid と同値のことが多い）。
function clubUidFromPath(path: string): string | null {
  const parts = path.split('/');
  return parts.length >= 2 && parts[0] === 'clubs' ? parts[1] : null;
}

function calcUsageLevel(
  playerCount: number,
  competitionCount: number,
  matchCount: number
): number {
  if (matchCount >= 100) return 6;
  if (matchCount >= 50) return 5;
  if (matchCount >= 10) return 4;
  if (matchCount >= 1) return 3;
  if (competitionCount >= 1) return 2;
  if (playerCount >= 1) return 1;
  return 0;
}

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const decoded = await auth.verifyIdToken(token);
    if (decoded.uid !== ADMIN_UID) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const since = admin.firestore.Timestamp.fromMillis(
      Date.now() - ANALYTICS_DAYS * 24 * 60 * 60 * 1000
    );

    const [
      profilesSnap,
      usersSnap,
      careersSnap,
      playersSnap,
      teamsSnap,
      competitionsSnap,
      newsSnap,
      matchesSnap,
      friendlySnap,
      eventsSnap,
    ] = await Promise.all([
      db.collection("club_profiles").get(),
      db.collection("users").get(),
      db.collection("careers").get(),
      db.collectionGroup("players").get(),
      db.collectionGroup("teams").get(),
      db.collectionGroup("competitions").get(),
      db.collectionGroup("news").get(),
      db.collectionGroup("matches").get(),
      db.collectionGroup("friendly_matches").get(),
      db
        .collection("analyticsEvents")
        .where("createdAt", ">=", since)
        .orderBy("createdAt", "desc")
        .get(),
    ]);

    const cohortByUid: Record<string, string> = {};
    const userDataByUid: Record<string, Record<string, unknown>> = {};
    for (const d of usersSnap.docs) {
      const data = d.data();
      const c = data.analyticsCohort;
      if (typeof c === "string") cohortByUid[d.id] = c;
      userDataByUid[d.id] = data as Record<string, unknown>;
    }

    const { careersByOwner, careersByClubUid, ownerByClubUid, activeCareerIdByOwner } =
      buildCareerMaps(careersSnap, userDataByUid);

    // ---- データルート(clubUid)単位の集計。path第1セグメントはclubUid ----
    const playerStatsByClub: Record<string, { count: number; imageCount: number }> = {};
    for (const d of playersSnap.docs) {
      const parts = d.ref.path.split("/");
      if (
        parts.length !== 6 ||
        parts[0] !== "clubs" ||
        parts[2] !== "teams" ||
        parts[4] !== "players"
      ) {
        continue;
      }
      const clubUid = parts[1];
      const teamId = parts[3];
      const data = d.data() as Record<string, unknown>;
      if (!validPlayer(data)) continue;
      const key = `${clubUid}/${teamId}`;
      const prev = playerStatsByClub[key] || { count: 0, imageCount: 0 };
      playerStatsByClub[key] = {
        count: prev.count + 1,
        imageCount: prev.imageCount + (hasPlayerImage(data) ? 1 : 0),
      };
    }

    const competitionCountByClub: Record<string, number> = {};
    for (const d of competitionsSnap.docs) {
      const clubUid = clubUidFromPath(d.ref.path);
      const data = d.data() as Record<string, unknown>;
      if (clubUid && validCompetition(data)) {
        competitionCountByClub[clubUid] = (competitionCountByClub[clubUid] || 0) + 1;
      }
    }

    const newsCountByClub: Record<string, number> = {};
    for (const d of newsSnap.docs) {
      const clubUid = clubUidFromPath(d.ref.path);
      if (clubUid) {
        newsCountByClub[clubUid] = (newsCountByClub[clubUid] || 0) + 1;
      }
    }

    const matchCountByClub: Record<string, number> = {};
    // matchDiagnostics は clubUid→uid 解決後の uid 単位で保持する
    const matchDiagnostics: Record<string, MatchDiagnostic> = {};

    const processMatch = (d: FirebaseFirestore.QueryDocumentSnapshot, isFriendly: boolean) => {
      const clubUid = clubUidFromPath(d.ref.path);
      const data = d.data() as Record<string, unknown>;
      const isValid = validMatch(data);
      if (!clubUid) return;
      const uid = ownerByClubUid.get(clubUid) || clubUid;
      const prev = matchDiagnostics[uid] || { total: 0, valid: 0, friendly: 0, invalid: 0 };
      matchDiagnostics[uid] = {
        total: prev.total + 1,
        valid: isValid && !isFriendly ? prev.valid + 1 : prev.valid,
        friendly: isFriendly ? prev.friendly + 1 : prev.friendly,
        invalid: !isValid ? prev.invalid + 1 : prev.invalid,
      };
      if (isValid) {
        matchCountByClub[clubUid] = (matchCountByClub[clubUid] || 0) + 1;
      }
    };

    for (const d of matchesSnap.docs) processMatch(d, false);
    for (const d of friendlySnap.docs) processMatch(d, true);

    const profileRows = profilesSnap.docs.map((d) => ({
      id: d.id,
      data: d.data() as Record<string, unknown>,
    }));

    const uidAllPlans: Record<string, string[]> = {};
    const uidAllStripeCustomerIds: Record<string, string[]> = {};
    for (const r of profileRows) {
      const uid = String(r.data.ownerUid || r.id);
      const planStr = typeof r.data.plan === 'string' ? r.data.plan : '';
      uidAllPlans[uid] = uidAllPlans[uid] || [];
      uidAllPlans[uid].push(planStr);
      if (isNonEmptyString(r.data.stripeCustomerId)) {
        uidAllStripeCustomerIds[uid] = uidAllStripeCustomerIds[uid] || [];
        uidAllStripeCustomerIds[uid].push(r.data.stripeCustomerId);
      }
    }

    const profileIdsByOwner: Record<string, string[]> = {};
    for (const r of profileRows) {
      const ownerUid = String(r.data.ownerUid || r.id);
      profileIdsByOwner[ownerUid] = profileIdsByOwner[ownerUid] || [];
      profileIdsByOwner[ownerUid].push(r.id);
    }

    const now = Date.now();
    // イベントの clubProfileId プロパティには clubUid が入る。
    // userId には uid（新規）と clubUid（過去のバグ）の両方が混在するため、
    // clubUid→uid 解決できるものは owner 単位にも紐付ける。
    const lastActiveByClub: Record<string, string> = {};
    const lastActiveByOwner: Record<string, string> = {};
    const lastEventByOwner: Record<string, number> = {};
    const engaged7ByOwner: Record<string, boolean> = {};
    const engaged30ByOwner: Record<string, boolean> = {};
    const matchActive7ByOwner: Record<string, boolean> = {};
    const matchActive30ByOwner: Record<string, boolean> = {};

    const engagedEventNames = new Set([
      "match_create",
      "match_create_first",
      "competition_create_first",
      "player_create_first",
    ]);
    const matchEventNames = new Set(["match_create", "match_create_first"]);

    for (const d of eventsSnap.docs) {
      const data = d.data() as Record<string, unknown>;
      const rawUserId = typeof data.userId === "string" ? data.userId : null;
      const props = (data.properties as Record<string, unknown>) || {};
      const eventName = typeof data.eventName === "string" ? data.eventName : "";
      const createdAt = data.createdAt;
      let time: number | null = null;
      if (createdAt instanceof admin.firestore.Timestamp) {
        time = createdAt.toMillis();
      } else if (createdAt instanceof Date) {
        time = createdAt.getTime();
      } else if (typeof createdAt === "string" || typeof createdAt === "number") {
        const t = new Date(createdAt).getTime();
        if (!Number.isNaN(t)) time = t;
      }
      if (time === null) continue;
      const iso = new Date(time).toISOString();

      const clubProfileId =
        (typeof props.clubProfileId === "string" && props.clubProfileId.trim()) ||
        (typeof data.clubProfileId === "string" && (data.clubProfileId as string).trim()) ||
        null;
      if (clubProfileId && !lastActiveByClub[clubProfileId]) {
        lastActiveByClub[clubProfileId] = iso;
      }

      // userId が clubUid の過去イベントは owner uid へ解決する（推測ではなく Career マッピング）
      const userId = rawUserId ? ownerByClubUid.get(rawUserId) || rawUserId : null;
      if (userId) {
        if (!lastActiveByOwner[userId]) lastActiveByOwner[userId] = iso;
        if (time > (lastEventByOwner[userId] || 0)) lastEventByOwner[userId] = time;
        if (engagedEventNames.has(eventName)) {
          engaged30ByOwner[userId] = true;
          if (now - time < 7 * 24 * 60 * 60 * 1000) engaged7ByOwner[userId] = true;
        }
        if (matchEventNames.has(eventName)) {
          matchActive30ByOwner[userId] = true;
          if (now - time < 7 * 24 * 60 * 60 * 1000) matchActive7ByOwner[userId] = true;
        }
      }
    }

    const mainTeamMap = new Map<string, Record<string, unknown>>();
    const teamStatsByClub: Record<string, { count: number; imageCount: number }> = {};
    for (const d of teamsSnap.docs) {
      const parts = d.ref.path.split("/");
      if (
        parts.length !== 4 ||
        parts[0] !== "clubs" ||
        parts[2] !== "teams"
      ) {
        continue;
      }
      const clubUid = parts[1];
      const data = d.data() as Record<string, unknown>;
      if (!validTeam(data)) continue;

      mainTeamMap.set(`${clubUid}/${d.id}`, data);

      const prev = teamStatsByClub[clubUid] || { count: 0, imageCount: 0 };
      teamStatsByClub[clubUid] = {
        count: prev.count + 1,
        imageCount: prev.imageCount + (hasTeamImage(data) ? 1 : 0),
      };
    }

    // Auth 存在チェック（profile owner ∪ career owner が対象）
    const candidateUids = new Set<string>([
      ...Object.keys(profileIdsByOwner),
      ...careersByOwner.keys(),
    ]);

    // Firebase Auth を全件取得（Source of Truth）。listUsersは1000件/ページのため
    // nextPageToken がある限り全ページ取得する。Firestoreのドキュメント件数から
    // Auth総数を推測しない。
    const allAuthUsers: admin.auth.UserRecord[] = [];
    let listUsersPageToken: string | undefined;
    do {
      const result = await auth.listUsers(1000, listUsersPageToken);
      allAuthUsers.push(...result.users);
      listUsersPageToken = result.pageToken;
    } while (listUsersPageToken);

    const emailMap: Record<string, string> = {};
    const authUserUids = new Set<string>();
    const authLastSignInByUid: Record<string, string> = {};
    for (const u of allAuthUsers) {
      if (!candidateUids.has(u.uid)) continue;
      authUserUids.add(u.uid);
      if (u.email) emailMap[u.uid] = u.email;
      const lastSignInTime = (u.metadata as unknown as { lastSignInTime?: string }).lastSignInTime;
      if (lastSignInTime) authLastSignInByUid[u.uid] = lastSignInTime;
    }

    // Authには存在するがAnalytics対象集合（club_profiles/careersのowner）に
    // 存在しないUIDの分類。個人情報は出さずカウントのみ。
    const unmatchedBreakdown = {
      withUsersDoc: 0,
      withActivityEvent: 0,
      googleProvider: 0,
      passwordProvider: 0,
      otherProvider: 0,
      noProvider: 0,
      neverSignedIn: 0,
      createdWithin7d: 0,
      createdWithin30d: 0,
      disabled: 0,
    };
    for (const u of allAuthUsers) {
      if (candidateUids.has(u.uid)) continue;
      if (userDataByUid[u.uid]) unmatchedBreakdown.withUsersDoc++;
      if (lastEventByOwner[u.uid]) unmatchedBreakdown.withActivityEvent++;
      const providers = new Set(
        (u.providerData || []).map((p) => p?.providerId).filter(Boolean)
      );
      if (providers.size === 0) unmatchedBreakdown.noProvider++;
      else if (providers.has("google.com")) unmatchedBreakdown.googleProvider++;
      else if (providers.has("password")) unmatchedBreakdown.passwordProvider++;
      else unmatchedBreakdown.otherProvider++;
      if (!u.metadata.lastSignInTime) unmatchedBreakdown.neverSignedIn++;
      const createdMs = u.metadata.creationTime ? Date.parse(u.metadata.creationTime) : NaN;
      if (!Number.isNaN(createdMs)) {
        if (now - createdMs < 7 * 24 * 60 * 60 * 1000) unmatchedBreakdown.createdWithin7d++;
        if (now - createdMs < 30 * 24 * 60 * 60 * 1000) unmatchedBreakdown.createdWithin30d++;
      }
      if (u.disabled) unmatchedBreakdown.disabled++;
    }

    const profileDocById: Record<string, FirebaseFirestore.QueryDocumentSnapshot> = {};
    for (const d of profilesSnap.docs) {
      profileDocById[d.id] = d;
    }

    // ---- ユーザー行（1 Auth UID = 1行）の構築 ----
    const clubs: ClubListItem[] = Array.from(candidateUids).map((ownerUid) => {
      const profileIds = profileIdsByOwner[ownerUid] || [];
      const profileDocs = profileIds
        .map((id) => profileDocById[id])
        .filter(Boolean);
      const ranked = scoreRepresentativeProfiles(profileDocs, {
        dataCountsByClubProfile: {},
        now,
      });
      const rep = ranked[0];
      const repData = (rep?.data || {}) as Record<string, unknown>;

      const allCareers = careersByOwner.get(ownerUid) || [];
      const validCareers = allCareers.filter((c) => c.status !== 'creating');
      const creatingCareers = allCareers.filter((c) => c.status === 'creating');
      const activeCareerId = activeCareerIdByOwner.get(ownerUid) || null;

      // ユーザーのデータルート集合（CareerのclubUid。Careerが無ければ旧形式のuid）
      const rootSet = new Set<string>();
      for (const c of validCareers) rootSet.add(c.clubUid);
      for (const c of creatingCareers) rootSet.add(c.clubUid); // 分類用に含める（集計は別途制御）
      if (allCareers.length === 0) rootSet.add(ownerUid);
      const dataRoots = Array.from(rootSet);
      const usageRoots = new Set<string>(validCareers.map((c) => c.clubUid));
      if (allCareers.length === 0) usageRoots.add(ownerUid);

      const careersByRoot = (clubUid: string) => careersByClubUid.get(clubUid) || [];

      // Career行の構築
      const careerItems: CareerItem[] = allCareers.map((c) => {
        const rootProfiles = profileIds
          .map((id) => profileDocById[id])
          .filter((d) => d && (d.id === c.clubUid || (d.data() as any)?.clubUid === c.clubUid));
        const rootProfileData = (rootProfiles[0]?.data() || {}) as Record<string, unknown>;
        const isCreating = c.status === 'creating';
        const shared = careersByRoot(c.clubUid).length > 1;
        const statsClubUid = c.clubUid;
        const pStats = Object.entries(playerStatsByClub)
          .filter(([key]) => key.startsWith(`${statsClubUid}/`))
          .reduce(
            (acc, [, v]) => ({ count: acc.count + v.count, imageCount: acc.imageCount + v.imageCount }),
            { count: 0, imageCount: 0 }
          );
        const tStats = teamStatsByClub[statsClubUid] || { count: 0, imageCount: 0 };
        const mainTeamId =
          typeof rootProfileData.mainTeamId === 'string' ? rootProfileData.mainTeamId : null;
        const mainTeamData = mainTeamId ? mainTeamMap.get(`${statsClubUid}/${mainTeamId}`) : undefined;
        const clubLogoUrl =
          typeof rootProfileData.logoUrl === 'string' ? rootProfileData.logoUrl : null;
        const mainTeamLogoUrl =
          typeof mainTeamData?.logoUrl === 'string' ? mainTeamData.logoUrl : null;
        const tImage = computeTeamImageWithFallback(tStats.imageCount, tStats.count, {
          mainTeamId,
          mainTeamLogoUrl,
          clubLogoUrl,
        });
        const clubName =
          c.clubName ||
          (typeof rootProfileData.clubName === 'string' ? rootProfileData.clubName : '') ||
          c.name ||
          '';
        const slug = c.clubId || (typeof rootProfileData.clubId === 'string' ? rootProfileData.clubId : '') || c.clubUid;
        // 「公開」の実フラグは directoryListed（/clubs ディレクトリ掲載条件）。
        // career.isPublic は作成時に directoryListed からコピーされたスナップショット。
        // club_profiles に isPublic フィールドは存在しない（欠損を公開扱いしない）。
        const isPublic = c.isPublic === true || rootProfileData.directoryListed === true;
        return {
          careerId: c.id,
          name: c.name,
          clubUid: c.clubUid,
          status: c.status,
          isDefault: c.clubUid === ownerUid,
          isActive: c.id === activeCareerId,
          isCreating,
          sharedDataRoot: shared,
          clubName: clubName || '(未設定)',
          nameSet: clubName.trim().length > 0,
          publicSlug: slug,
          publicUrl: `/${encodeURIComponent(slug)}`,
          isPublic,
          playerCount: isCreating ? 0 : pStats.count,
          playerImageCount: isCreating ? 0 : pStats.imageCount,
          teamCount: isCreating ? 0 : tStats.count,
          teamImageCount: isCreating ? 0 : tImage,
          competitionCount: isCreating ? 0 : (competitionCountByClub[statsClubUid] ?? 0),
          matchCount: isCreating ? 0 : (matchCountByClub[statsClubUid] ?? 0),
          newsCount: isCreating ? 0 : (newsCountByClub[statsClubUid] ?? 0),
          lastActivityAt: lastActiveByClub[c.clubUid] || null,
        };
      });

      // ユーザー合計（共有データルートは1回だけ計上、creatingは除外）
      let pCount = 0, pImage = 0, tCount = 0, tImageSum = 0, cCount = 0, mCount = 0, nCount = 0;
      const countedRoots = new Set<string>();
      for (const ci of careerItems) {
        if (ci.isCreating || countedRoots.has(ci.clubUid)) continue;
        countedRoots.add(ci.clubUid);
        pCount += ci.playerCount;
        pImage += ci.playerImageCount;
        tCount += ci.teamCount;
        tImageSum += ci.teamImageCount;
        cCount += ci.competitionCount;
        mCount += ci.matchCount;
        nCount += ci.newsCount;
      }
      // Careerが無い旧ユーザー: uid直下を数える
      if (allCareers.length === 0) {
        for (const [key, v] of Object.entries(playerStatsByClub)) {
          if (key.startsWith(`${ownerUid}/`)) { pCount += v.count; pImage += v.imageCount; }
        }
        const tStats = teamStatsByClub[ownerUid] || { count: 0, imageCount: 0 };
        const mainTeamId = typeof repData.mainTeamId === 'string' ? repData.mainTeamId : null;
        const mainTeamData = mainTeamId ? mainTeamMap.get(`${ownerUid}/${mainTeamId}`) : undefined;
        tCount += tStats.count;
        tImageSum += computeTeamImageWithFallback(tStats.imageCount, tStats.count, {
          mainTeamId,
          mainTeamLogoUrl: typeof mainTeamData?.logoUrl === 'string' ? mainTeamData.logoUrl : null,
          clubLogoUrl: typeof repData.logoUrl === 'string' ? repData.logoUrl : null,
        });
        cCount += competitionCountByClub[ownerUid] ?? 0;
        mCount += matchCountByClub[ownerUid] ?? 0;
        nCount += newsCountByClub[ownerUid] ?? 0;
      }

      // profile分類: Careerに紐づく / uid直下(ownerDoc) / 要確認(unmatched)
      const careerClubUidSet = new Set(allCareers.map((c) => c.clubUid));
      let careerMatchedProfiles = 0;
      let ownerDocProfiles = 0;
      let unmatchedProfiles = 0;
      for (const r of profileRows) {
        if (String(r.data.ownerUid || r.id) !== ownerUid) continue;
        if (r.id === ownerUid) ownerDocProfiles++;
        else if (careerClubUidSet.has(r.id) || careerClubUidSet.has(String(r.data.clubUid || ''))) {
          careerMatchedProfiles++;
        } else {
          unmatchedProfiles++;
        }
      }

      // 代表表示: activeCareer > デフォルトルートcareer > 先頭career > rep profile
      const repCareer =
        careerItems.find((c) => c.isActive) ||
        careerItems.find((c) => c.isDefault) ||
        careerItems[0] ||
        null;
      const mainTeamId = typeof repData.mainTeamId === 'string' ? repData.mainTeamId : null;
      const repRoot = repCareer?.clubUid || ownerUid;
      const mainTeamData = mainTeamId ? mainTeamMap.get(`${repRoot}/${mainTeamId}`) : undefined;
      const mainTeamName = typeof mainTeamData?.name === 'string' ? mainTeamData.name : null;

      const publicSlug = repCareer?.publicSlug || String(repData.clubId || rep?.id || ownerUid);
      const rawName = repCareer?.nameSet ? repCareer.clubName : (typeof repData.clubName === 'string' ? repData.clubName : null);
      const nameSet =
        (typeof rawName === 'string' && rawName.trim().length > 0) || Boolean(mainTeamName);
      const clubName =
        (typeof rawName === 'string' && rawName.trim()) || mainTeamName || publicSlug || ownerUid;

      const created = toIso(
        repCareer
          ? (allCareers.find((c) => c.id === repCareer.careerId)?.createdAt || repData.createdAt)
          : repData.createdAt
      );

      const { lastActivityAt: lastActivityAtMillis, active7, active30, sources } =
        computeLastActivityForUid({
          userData: userDataByUid[ownerUid],
          authLastSignInAt: authLastSignInByUid[ownerUid],
          profileDocs: profileDocs.map((d) => d.data() as Record<string, unknown>),
          lastEventAt: lastEventByOwner[ownerUid],
          now,
        });
      const lastActivity = toIso(lastActivityAtMillis) || created;

      const effective = computeEffectivePlanFromData(
        userDataByUid[ownerUid],
        profileDocs.map((d) => d.data() as Record<string, unknown>)
      );

      const usageLevel = calcUsageLevel(pCount, cCount, mCount);

      return {
        id: ownerUid,
        clubName,
        nameSet,
        allCareersNameUnset:
          careerItems.length > 0
            ? careerItems.every((c) => !c.nameSet)
            : !nameSet,
        anyCareerNameUnset:
          careerItems.length > 0 ? careerItems.some((c) => !c.nameSet) : !nameSet,
        logoUrl:
          typeof mainTeamData?.logoUrl === "string"
            ? mainTeamData.logoUrl
            : typeof repData.logoUrl === "string"
              ? repData.logoUrl
              : null,
        publicUrl: `/${encodeURIComponent(publicSlug)}`,
        publicSlug,
        ownerUid,
        email: emailMap[ownerUid] || null,
        clubCreatedAt: created,
        lastActivityAt: lastActivity,
        lastActivityAtMillis: (lastActivityAtMillis ?? 0) as number,
        activeDetail: {
          lastActivityAt: sources.lastActivityAt ?? 0,
          eventAt: sources.eventAt ?? 0,
          userAt: sources.userAt ?? 0,
          authAt: sources.authAt ?? 0,
          profileAt: sources.profileAt ?? 0,
          representativeAt: sources.representativeAt ?? 0,
          userCreatedAt: sources.userCreatedAt ?? 0,
          profileCreatedAt: sources.profileCreatedAt ?? 0,
          profileUpdatedAt: sources.profileUpdatedAt ?? 0,
          adoptedAt: lastActivityAtMillis ?? 0,
        },
        playerCount: pCount,
        playerImageCount: pImage,
        playerImageRate: pCount > 0 ? Math.round((pImage / pCount) * 1000) / 10 : null,
        mainTeamName: mainTeamName || null,
        teamCount: tCount,
        teamImageCount: tImageSum,
        teamImageRate: tCount > 0 ? Math.round((tImageSum / tCount) * 1000) / 10 : null,
        competitionCount: cCount,
        matchCount: mCount,
        newsCount: nCount,
        isPaidPro: effective.isPaid,
        isGrantedPro: effective.isGranted,
        isFree: effective.plan === 'free',
        plan: effective.plan,
        analyticsCohort: cohortByUid[ownerUid] || "pre_tracking",
        // 「いずれか公開」: Career保有者は有効Careerのどれかが公開、旧形式はprofileのdirectoryListed
        isPublic:
          careerItems.length > 0
            ? careerItems.some((ci) => !ci.isCreating && ci.isPublic)
            : profileDocs.some(
                (d) => (d.data() as Record<string, unknown>).directoryListed === true
              ),
        aggregateAvailable: true,
        aggregateUnavailableReason: null,
        usageLevel,
        active7,
        active30,
        engaged7: engaged7ByOwner[ownerUid] || false,
        engaged30: engaged30ByOwner[ownerUid] || false,
        matchActive7: matchActive7ByOwner[ownerUid] || false,
        matchActive30: matchActive30ByOwner[ownerUid] || false,
        duplicateProfileCount: profileIds.length,
        authExists: authUserUids.has(ownerUid),
        allProfilePlans: uidAllPlans[ownerUid] || [],
        allStripeCustomerIds: uidAllStripeCustomerIds[ownerUid] || [],
        anyProPlan: (uidAllPlans[ownerUid] || []).some((p) => isProPlan(p)),
        anyStripeCustomer: (uidAllStripeCustomerIds[ownerUid] || []).length > 0,
        careerCount: validCareers.length,
        creatingCareerCount: creatingCareers.length,
        dataRootCount: dataRoots.length,
        sharedDataRoots: careerItems.filter((c) => c.sharedDataRoot).length,
        profileCount: profileIds.length,
        unmatchedProfileCount: unmatchedProfiles,
        careers: careerItems,
      };
    });

    // ---- profile診断（グローバル分類） ----
    const allCareerClubUids = new Set(careersByClubUid.keys());
    const diag: ProfileDiagnostics = {
      clubProfilesTotal: profileRows.length,
      careerMatchedProfiles: 0,
      ownerDocProfiles: 0,
      unmatchedProfiles: 0,
      unmatchedProfileIds: [],
      authlessProfiles: 0,
      authlessOwnerUids: [],
      unmatchedOwnerUids: 0,
      unmatchedInclusion: {
        publicUsers: 0,
        nameUnsetUsers: 0,
        active7Users: 0,
        active30Users: 0,
        usageUsers: 0,
      },
    };
    for (const r of profileRows) {
      const ownerUid = String(r.data.ownerUid || r.id);
      // Auth不在のownerは形式に関わらず先にauthlessへ分類する
      if (!authUserUids.has(ownerUid)) {
        diag.authlessProfiles++;
        if (!diag.authlessOwnerUids.includes(ownerUid)) diag.authlessOwnerUids.push(ownerUid);
        continue;
      }
      if (r.id === ownerUid) {
        diag.ownerDocProfiles++;
      } else if (
        allCareerClubUids.has(r.id) ||
        allCareerClubUids.has(String(r.data.clubUid || ''))
      ) {
        diag.careerMatchedProfiles++;
      } else {
        diag.unmatchedProfiles++;
        diag.unmatchedProfileIds.push(r.id);
      }
    }

    // 要確認profileの各指標への包含（owner単位。profile自体はusage集計のデータルートにならない）
    const unmatchedOwnerSet = new Set<string>();
    for (const r of profileRows) {
      const ownerUid = String(r.data.ownerUid || r.id);
      if (!authUserUids.has(ownerUid) || r.id === ownerUid) continue;
      if (
        !allCareerClubUids.has(r.id) &&
        !allCareerClubUids.has(String(r.data.clubUid || ''))
      ) {
        unmatchedOwnerSet.add(ownerUid);
      }
    }
    diag.unmatchedOwnerUids = unmatchedOwnerSet.size;
    const unmatchedOwnerClubs = clubs.filter(
      (c) => c.authExists && unmatchedOwnerSet.has(c.ownerUid)
    );
    diag.unmatchedInclusion = {
      publicUsers: unmatchedOwnerClubs.filter((c) => c.isPublic).length,
      nameUnsetUsers: unmatchedOwnerClubs.filter((c) => c.allCareersNameUnset).length,
      active7Users: unmatchedOwnerClubs.filter((c) => c.active7).length,
      active30Users: unmatchedOwnerClubs.filter((c) => c.active30).length,
      usageUsers: unmatchedOwnerClubs.filter(
        (c) =>
          (c.playerCount ?? 0) +
            (c.teamCount ?? 0) +
            (c.competitionCount ?? 0) +
            (c.matchCount ?? 0) +
            (c.newsCount ?? 0) >
          0
      ).length,
    };

    const authClubs = clubs.filter((c) => c.authExists);
    const authlessUids = clubs.filter((c) => !c.authExists).map((c) => c.ownerUid);

    const total = authClubs.length;
    const aggregatable = total;
    const nameSet = authClubs.filter((c) => c.nameSet).length;
    const nameUnset = total - nameSet;

    const withMatches = authClubs.filter((c) => (c.matchCount ?? 0) > 0).length;
    const matches10 = authClubs.filter((c) => (c.matchCount ?? 0) >= 10).length;
    const matches50 = authClubs.filter((c) => (c.matchCount ?? 0) >= 50).length;
    const matches100 = authClubs.filter((c) => (c.matchCount ?? 0) >= 100).length;

    let multiClubOwners = 0;
    let multiClubProfiles = 0;
    let maxClubsPerOwner = 0;
    for (const c of authClubs) {
      const ids = profileIdsByOwner[c.ownerUid] || [];
      if (ids.length > 1) {
        multiClubOwners += 1;
        multiClubProfiles += ids.length;
      }
      if (ids.length > maxClubsPerOwner) maxClubsPerOwner = ids.length;
    }
    const avgClubsPerMultiOwner =
      multiClubOwners > 0
        ? Math.round((multiClubProfiles / multiClubOwners) * 10) / 10
        : 0;

    const withPlayerImages10 = authClubs.filter((c) => (c.playerImageCount ?? 0) >= 10).length;
    const withPlayerImages20 = authClubs.filter((c) => (c.playerImageCount ?? 0) >= 20).length;
    const withTeamImages = authClubs.filter((c) => (c.teamImageCount ?? 0) >= 1).length;
    const withTeamImages5 = authClubs.filter((c) => (c.teamImageCount ?? 0) >= 5).length;

    const clubProfilesTotal = profileRows.length;
    const reducedDisplayRows = clubProfilesTotal - total;
    const paidPro = authClubs.filter((c) => c.isPaidPro).length;
    const grantedPro = authClubs.filter((c) => c.isGrantedPro).length;
    const totalPro = paidPro + grantedPro;

    const totalCareers = authClubs.reduce((s, c) => s + c.careerCount, 0);
    const creatingCareers = authClubs.reduce((s, c) => s + c.creatingCareerCount, 0);
    const multiCareerUsers = authClubs.filter((c) => c.careerCount > 1).length;
    const publicCareers = authClubs.reduce(
      (s, c) => s + c.careers.filter((x) => !x.isCreating && x.isPublic).length, 0
    );
    const nameUnsetCareers = authClubs.reduce(
      (s, c) => s + c.careers.filter((x) => !x.isCreating && !x.nameSet).length, 0
    );

    // Career単位の折りたたみ数: 各UIDの max(Career数-1, 0) の合計
    const foldedCareers = authClubs.reduce(
      (s, c) => s + Math.max(c.careerCount - 1, 0),
      0
    );
    const usersWithCareers = authClubs.filter((c) => c.careerCount > 0).length;
    const legacyUsers = total - usersWithCareers;
    const publicCareerUsers = authClubs.filter(
      (c) => c.careerCount > 0 && c.isPublic
    ).length;
    const publicLegacyUsers = authClubs.filter(
      (c) => c.careerCount === 0 && c.isPublic
    ).length;
    const allNameUnsetCareerUsers = authClubs.filter(
      (c) => c.careerCount > 0 && c.allCareersNameUnset
    ).length;
    const legacyNameUnsetUsers = authClubs.filter(
      (c) => c.careerCount === 0 && c.allCareersNameUnset
    ).length;

    const authTotal = allAuthUsers.length;
    const authDiagnostics = {
      totalAuthUsers: authTotal,
      analyticsUids: total,
      unmatchedAuthUids: Math.max(authTotal - total, 0),
      coverageRate: authTotal > 0 ? Math.round((total / authTotal) * 1000) / 10 : 0,
      unmatchedBreakdown,
    };

    const summary: Summary = {
      total,
      authTotal,
      aggregatable,
      totalCareers,
      creatingCareers,
      multiCareerUsers,
      nameSet,
      nameUnset,
      nameUnsetRate: total > 0 ? Math.round((nameUnset / total) * 1000) / 10 : 0,
      public: authClubs.filter((c) => c.isPublic).length,
      publicCareers,
      nameUnsetCareers,
      paidPro,
      grantedPro,
      totalPro,
      free: authClubs.filter((c) => c.isFree).length,
      active7: authClubs.filter((c) => c.active7).length,
      active30: authClubs.filter((c) => c.active30).length,
      withMatches,
      matches10,
      matches50,
      matches100,
      // 利用率系KPIの分母は Firebase Auth 総ユーザー（authTotal）。
      // 全登録者に対する利用率を見る指標のため Analytics対象UID ではなく Auth全件を使う。
      withMatchesRate: authTotal > 0 ? Math.round((withMatches / authTotal) * 1000) / 10 : 0,
      matches10Rate: authTotal > 0 ? Math.round((matches10 / authTotal) * 1000) / 10 : 0,
      matches50Rate: authTotal > 0 ? Math.round((matches50 / authTotal) * 1000) / 10 : 0,
      matches100Rate: authTotal > 0 ? Math.round((matches100 / authTotal) * 1000) / 10 : 0,
      withPlayerImages10,
      withPlayerImages20,
      withTeamImages,
      withTeamImages5,
      withPlayerImages10Rate:
        authTotal > 0 ? Math.round((withPlayerImages10 / authTotal) * 1000) / 10 : 0,
      withPlayerImages20Rate:
        authTotal > 0 ? Math.round((withPlayerImages20 / authTotal) * 1000) / 10 : 0,
      withTeamImagesRate:
        authTotal > 0 ? Math.round((withTeamImages / authTotal) * 1000) / 10 : 0,
      withTeamImages5Rate:
        authTotal > 0 ? Math.round((withTeamImages5 / authTotal) * 1000) / 10 : 0,
      unavailableByReason: {},
      multiClubOwners,
      multiClubProfiles,
      avgClubsPerMultiOwner,
      maxClubsPerOwner,
      engaged7: authClubs.filter((c) => c.engaged7).length,
      engaged30: authClubs.filter((c) => c.engaged30).length,
      matchActive7: authClubs.filter((c) => c.matchActive7).length,
      matchActive30: authClubs.filter((c) => c.matchActive30).length,
      clubProfilesTotal,
      reducedDisplayRows,
      foldedCareers,
      usersWithCareers,
      legacyUsers,
      publicCareerUsers,
      publicLegacyUsers,
      allNameUnsetCareerUsers,
      legacyNameUnsetUsers,
    };

    return NextResponse.json({ summary, clubs, authlessUids, matchDiagnostics, profileDiagnostics: diag, authDiagnostics });
  } catch (error) {
    console.error("[admin/clubs] error", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
