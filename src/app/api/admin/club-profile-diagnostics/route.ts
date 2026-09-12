import { NextRequest, NextResponse } from 'next/server';
import { db, auth } from '@/lib/firebase/admin';
import { ADMIN_UID } from '@/lib/admin-config';
import { scoreRepresentativeProfiles, hasValue } from '@/lib/representative-profile';

interface OwnerProfileGroup {
  profiles: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>[];
  ownerUid: string;
}

interface CoverageStats {
  total: number;
  covered: number;
  uncovered: number;
  rate: number;
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

    // 1. Firebase Auth ユーザー一覧
    const authUsers: { uid: string; email: string | null }[] = [];
    let nextPageToken: string | undefined;
    do {
      const listResult = await auth.listUsers(1000, nextPageToken);
      for (const u of listResult.users) {
        authUsers.push({ uid: u.uid, email: u.email || null });
      }
      nextPageToken = listResult.pageToken;
    } while (nextPageToken);

    const authUids = new Set(authUsers.map((u) => u.uid));
    const emailToUids: Record<string, string[]> = {};
    for (const u of authUsers) {
      if (u.email) {
        emailToUids[u.email] = emailToUids[u.email] || [];
        emailToUids[u.email].push(u.uid);
      }
    }
    const duplicatedEmails = Object.fromEntries(
      Object.entries(emailToUids).filter(([, uids]) => uids.length > 1)
    );

    // 2. club_profiles 全件取得とownerUid状態の分類
    const profilesSnap = await db.collection('club_profiles').get();
    const allProfileIds = new Set<string>();

    const validProfilesByOwner: Record<string, OwnerProfileGroup> = {};
    const missingOwnerProfiles: FirebaseFirestore.QueryDocumentSnapshot[] = [];
    const emptyOwnerProfiles: FirebaseFirestore.QueryDocumentSnapshot[] = [];
    const nullOwnerProfiles: FirebaseFirestore.QueryDocumentSnapshot[] = [];
    const nonStringOwnerProfiles: FirebaseFirestore.QueryDocumentSnapshot[] = [];

    for (const d of profilesSnap.docs) {
      const data = d.data() as Record<string, unknown>;
      allProfileIds.add(d.id);

      const ownerUid = data.ownerUid;
      if (ownerUid === undefined) {
        missingOwnerProfiles.push(d);
      } else if (ownerUid === null) {
        nullOwnerProfiles.push(d);
      } else if (typeof ownerUid !== 'string') {
        nonStringOwnerProfiles.push(d);
      } else if (ownerUid.trim() === '') {
        emptyOwnerProfiles.push(d);
      } else {
        const key = ownerUid.trim();
        validProfilesByOwner[key] = validProfilesByOwner[key] || { ownerUid: key, profiles: [] };
        validProfilesByOwner[key].profiles.push(d);
      }
    }

    const totalProfiles = profilesSnap.size;
    const validOwnerUids = Object.keys(validProfilesByOwner);
    const validOwnedProfiles = validOwnerUids.reduce((sum, k) => sum + validProfilesByOwner[k].profiles.length, 0);

    // 3. 各種データの clubProfileId 対応率を集計
    const teamCoveredSnap = await db.collectionGroup('teams').select('clubProfileId').get();
    const playerCoveredSnap = await db.collectionGroup('players').select('clubProfileId').get();
    const competitionCoveredSnap = await db.collectionGroup('competitions').select('clubProfileId').get();
    const matchCoveredSnap = await db.collectionGroup('matches').select('clubProfileId').get();
    const friendlyCoveredSnap = await db.collectionGroup('friendly_matches').select('clubProfileId').get();
    const newsCoveredSnap = await db.collectionGroup('news').select('clubProfileId').get();
    const transferCoveredSnap = await db.collectionGroup('transfers').select('clubProfileId').get();
    const analyticsCoveredSnap = await db.collection('analyticsEvents').select('properties').get();

    function countCovered(snap: FirebaseFirestore.QuerySnapshot, key: string): CoverageStats {
      const total = snap.size;
      let covered = 0;
      for (const d of snap.docs) {
        const data = d.data() as Record<string, unknown>;
        const cpid = key === 'properties'
          ? ((data.properties as Record<string, unknown>)?.clubProfileId as string)
          : (data.clubProfileId as string);
        if (typeof cpid === 'string' && cpid.trim()) covered++;
      }
      return {
        total,
        covered,
        uncovered: total - covered,
        rate: total > 0 ? Math.round((covered / total) * 1000) / 10 : 0,
      };
    }

    const coverage = {
      teams: countCovered(teamCoveredSnap, 'clubProfileId'),
      players: countCovered(playerCoveredSnap, 'clubProfileId'),
      competitions: countCovered(competitionCoveredSnap, 'clubProfileId'),
      matches: countCovered(matchCoveredSnap, 'clubProfileId'),
      friendlyMatches: countCovered(friendlyCoveredSnap, 'clubProfileId'),
      news: countCovered(newsCoveredSnap, 'clubProfileId'),
      transfers: countCovered(transferCoveredSnap, 'clubProfileId'),
      analyticsEvents: countCovered(analyticsCoveredSnap, 'properties'),
    };

    // 4. 各 clubProfileId に紐づくデータ量を集計
    const dataCountsByClubProfile: Record<string, number> = {};
    const countSnaps = [
      teamCoveredSnap,
      playerCoveredSnap,
      competitionCoveredSnap,
      matchCoveredSnap,
      friendlyCoveredSnap,
      newsCoveredSnap,
      transferCoveredSnap,
    ];
    for (const snap of countSnaps) {
      for (const d of snap.docs) {
        const data = d.data() as Record<string, unknown>;
        const cpid = typeof data.clubProfileId === 'string' ? data.clubProfileId : null;
        if (cpid) {
          dataCountsByClubProfile[cpid] = (dataCountsByClubProfile[cpid] || 0) + 1;
        }
      }
    }

    // 5. ownerUid ごとの重複分析
    const singleProfileOwners: string[] = [];
    const duplicateProfileOwners: string[] = [];
    const userRows: Record<string, unknown>[] = [];
    const duplicatePatterns: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, E: 0 };
    const unavailableReasonByProfile: Record<string, number> = {};
    const unavailableReasonByUser: Record<string, number> = {};

    for (const [ownerUid, group] of Object.entries(validProfilesByOwner)) {
      const profiles = group.profiles;
      const authFound = authUids.has(ownerUid);

      if (profiles.length === 1) {
        singleProfileOwners.push(ownerUid);
      } else {
        duplicateProfileOwners.push(ownerUid);
      }

      // 代表 profile 候補をスコアリング
      const now = Date.now();
      const ranked = scoreRepresentativeProfiles(profiles, { dataCountsByClubProfile, now });

      const representative = ranked[0];
      const runnerUp = ranked[1];
      const secondScore = runnerUp ? runnerUp.score : 0;
      const confidenceGap = representative.score - secondScore;
      const hasClearRepresentative = profiles.length === 1 || confidenceGap >= 10;

      // 重複パターン分類
      let pattern = 'E';
      if (profiles.length === 1) {
        pattern = 'single';
      } else {
        const allClubId = new Set(ranked.map((s) => s.data.clubId as string | undefined).filter(Boolean));
        const allClubName = new Set(ranked.map((s) => s.data.clubName as string | undefined).filter(Boolean));
        const allMainTeam = new Set(ranked.map((s) => s.data.mainTeamId as string | undefined).filter(Boolean));

        const hasEmpty = ranked.some((s) => !s.hasClubName && !s.hasMainTeam);
        const hasFilled = ranked.some((s) => s.hasClubName || s.hasMainTeam);
        const hasUidDoc = profiles.some((d) => d.id === ownerUid);
        const hasSlugDoc = profiles.some((d) => (d.data() as Record<string, unknown>).clubId === d.id);

        if (allClubId.size === 1 && allClubName.size === 1 && allMainTeam.size === 1) {
          pattern = 'A';
        } else if (hasUidDoc && hasSlugDoc) {
          pattern = 'B';
        } else if (hasEmpty && hasFilled) {
          pattern = 'C';
        } else if (allClubId.size > 1 && allClubName.size <= 1) {
          pattern = 'D';
        } else {
          pattern = 'E';
        }
      }

      if (profiles.length > 1) {
        duplicatePatterns[pattern]++;
      }

      // 集計不可理由
      let unavailableReason = 'OTHER';
      if (profiles.length > 1) {
        unavailableReason = hasClearRepresentative ? 'PROFILE_DUPLICATE_RESOLVABLE' : 'PROFILE_DUPLICATE';
      } else if (!authFound) {
        unavailableReason = 'AUTH_USER_NOT_FOUND';
      } else if (!representative.hasClubId && !representative.hasMainTeam) {
        unavailableReason = 'CLUB_PROFILE_MAPPING_FAILED';
      } else if (representative.id === ownerUid && !representative.hasClubId) {
        unavailableReason = 'LEGACY_STRUCTURE';
      } else if (!hasValue(representative.data, 'clubProfileId')) {
        unavailableReason = 'CLUB_PROFILE_ID_MISSING';
      } else {
        unavailableReason = 'OK';
      }

      if (unavailableReason !== 'OK') {
        unavailableReasonByUser[unavailableReason] = (unavailableReasonByUser[unavailableReason] || 0) + 1;
      }

      const reasonForProfile = profiles.length > 1
        ? (hasClearRepresentative ? 'PROFILE_DUPLICATE_RESOLVABLE' : 'PROFILE_DUPLICATE')
        : unavailableReason;
      for (let i = 0; i < profiles.length; i++) {
        unavailableReasonByProfile[reasonForProfile] = (unavailableReasonByProfile[reasonForProfile] || 0) + 1;
      }

      if (full) {
        userRows.push({
          uid: ownerUid,
          email: authUsers.find((u) => u.uid === ownerUid)?.email || null,
          authFound,
          profileCount: profiles.length,
          representativeProfileId: hasClearRepresentative ? representative.id : null,
          otherProfileIds: ranked.slice(1).map((s) => s.id),
          pattern,
          hasClearRepresentative,
          confidenceGap,
          unavailableReason,
          representativeScore: representative.score,
        });
      }
    }

    const authWithProfile = validOwnerUids.filter((uid) => authUids.has(uid)).length;
    const authWithoutProfile = authUsers.length - authWithProfile;
    const ownerUidsNotInAuth = validOwnerUids.filter((uid) => !authUids.has(uid));
    const ownerUidsNotInAuthCount = ownerUidsNotInAuth.length;
    const ownerNotInAuthProfileCount = ownerUidsNotInAuth.reduce(
      (sum, uid) => sum + validProfilesByOwner[uid].profiles.length,
      0
    );

    const authUsersWithSingleProfile = singleProfileOwners.filter((uid) => authUids.has(uid)).length;
    const authUsersWithDuplicateProfile = duplicateProfileOwners.filter((uid) => authUids.has(uid)).length;
    const duplicateProfileOwnersCount = duplicateProfileOwners.length;
    const extraProfilesCount = validOwnerUids.reduce(
      (sum, k) => sum + Math.max(0, validProfilesByOwner[k].profiles.length - 1),
      0
    );
    const profileOwnershipRate = authUsers.length > 0
      ? Math.round((authWithProfile / authUsers.length) * 1000) / 10
      : 0;

    const normalProfiles = authWithProfile - authUsersWithDuplicateProfile;
    const missing = missingOwnerProfiles.length;
    const empty = emptyOwnerProfiles.length;
    const nullUids = nullOwnerProfiles.length;
    const nonString = nonStringOwnerProfiles.length;

    // 6. 同一メールアドレスのケース分類
    let sameEmailDifferentUid = 0;
    for (const [, uids] of Object.entries(emailToUids)) {
      if (uids.length > 1) {
        sameEmailDifferentUid += uids.length - 1;
      }
    }

    const dataIntegrity = {
      totalProfiles,
      validOwnedProfiles,
      normalProfiles,
      extraProfilesCount,
      ownerNotInAuth: {
        distinctUids: ownerUidsNotInAuthCount,
        profileCount: ownerNotInAuthProfileCount,
      },
      missing,
      empty,
      nullUids,
      nonString,
      check: validOwnedProfiles + missing + empty + nullUids + nonString,
      authBasedReconciliation: {
        authTotal: authUsers.length,
        authWithProfile,
        authWithoutProfile,
        unaccounted: totalProfiles - (validOwnedProfiles + missing + empty + nullUids + nonString),
      },
    };

    return NextResponse.json({
      auth: {
        totalUsers: authUsers.length,
        duplicatedEmailCount: Object.keys(duplicatedEmails).length,
        sameEmailDifferentUid,
        sameUidMultipleProfiles: authUsersWithDuplicateProfile,
        sameUidMultipleProfilesNote: '重複profileユーザー数と同義（ownerUidを2件以上持つAuth UID数）',
        duplicatedEmails,
      },
      profiles: {
        total: totalProfiles,
        uniqueOwnerUids: validOwnerUids.length,
        singleProfileOwners: singleProfileOwners.length,
        duplicateProfileOwners: duplicateProfileOwnersCount,
        authUsersWithSingleProfile,
        authUsersWithDuplicateProfile,
        extraProfilesCount,
        authWithProfile,
        authWithoutProfile,
        profileOwnershipRate,
      },
      duplicatePatterns: {
        A: duplicatePatterns.A,
        B: duplicatePatterns.B,
        C: duplicatePatterns.C,
        D: duplicatePatterns.D,
        E: duplicatePatterns.E,
        labels: {
          A: '完全重複',
          B: '旧形式 + 新形式',
          C: '片方未設定',
          D: 'slug変更由来',
          E: '判定困難',
        },
      },
      unavailableReasonByUser,
      unavailableReasonByProfile,
      representativeCandidates: userRows.filter((r) => Boolean(r.hasClearRepresentative)).length,
      clubProfileIdCoverage: coverage,
      dataIntegrity,
      users: full ? userRows : null,
    });
  } catch (error) {
    console.error('[club-profile-diagnostics]', error);
    return NextResponse.json({ error: 'Server error', message: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
