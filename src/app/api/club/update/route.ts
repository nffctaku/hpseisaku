import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase/admin';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue } from 'firebase-admin/firestore';
import { touchUserActivity } from '@/lib/server-activity';
import { getActiveClubUid } from '@/lib/career-server';
import { normalizeSlug, validateSlug } from '@/lib/slug';

// この関数は、リクエストから認証トークンを取得し、ユーザーUIDを検証するために使用します。
// 実際のアプリケーションでは、より堅牢な認証方法を検討してください。
async function getUidFromRequest(request: Request): Promise<string | null> {
  const authHeader = request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const idToken = authHeader.substring(7, authHeader.length);
    try {
      const decodedToken = await getAuth().verifyIdToken(idToken);
      return decodedToken.uid;
    } catch (error) {
      console.error('Error verifying auth token:', error);
      return null;
    }
  }
  return null;
}

export async function POST(request: Request) {
  try {
    const uid = await getUidFromRequest(request);
    const clubUid = uid ? await getActiveClubUid(uid) : null;
    if (!uid || !clubUid) {
      return new NextResponse(JSON.stringify({ message: '認証されていません。' }), { status: 401 });
    }

    const body = await request.json();
    const {
      clubId,
      clubName,
      logoUrl,
      layoutType,
      mainTeamId,
      realTeamUsage,
      gameTeamUsage,
      transfersPublic,
      directoryListed,
      displaySettings,
      sponsors,
      snsLinks,
      legalPages,
      homeBgColor,
      homeColorTheme,
      headerLayout,
      homeLayout,
      foundedYear,
      hometown,
      stadiumName,
      stadiumCapacity,
      stadiumPhotoUrl,
      clubDescription,
      clubTitles,
    } = body as any;

    const clubProfilesRef = db.collection('club_profiles');

    // 正規の club_profiles/{clubUid} ドキュメントから clubId を取得する
    const mainDocRef = clubProfilesRef.doc(clubUid);
    const mainDocSnap = await mainDocRef.get();
    const existingClubId = mainDocSnap.exists
      ? (mainDocSnap.data() as any)?.clubId || null
      : null;

    const allCareersSnap = await db.collection('careers').where('ownerId', '==', uid).get();
    const forbiddenValues = Array.from(
      new Set(
        [uid].concat(
          allCareersSnap.docs
            .map((d) => (d.data() as any)?.clubUid)
            .filter((v): v is string => typeof v === 'string')
        )
      )
    );

    const rawRequestedClubId = typeof clubId === 'string' ? String(clubId).trim() : '';

    // Validate requested slug on the server with raw input to preserve exact current URLs
    let validationResult: { ok: true; slug: string } | { ok: false } | undefined;
    if (Object.prototype.hasOwnProperty.call(body, 'clubId') && rawRequestedClubId) {
      const validation = validateSlug(rawRequestedClubId, {
        currentSlug: existingClubId || undefined,
        forbiddenValues,
      });
      if (!validation.ok) {
        return new NextResponse(JSON.stringify({ message: validation.message }), { status: 400 });
      }
      validationResult = validation;
    }

    const requestedClubId = validationResult?.ok ? validationResult.slug : '';
    const clubIdForUpdate = requestedClubId || existingClubId;

    if (Object.prototype.hasOwnProperty.call(body, 'clubId') && !clubIdForUpdate) {
      return new NextResponse(JSON.stringify({ message: 'URL識別名の決定に失敗しました' }), { status: 400 });
    }

    console.log('[club/update] resolved clubIdForUpdate', { uid, existingClubId, requestedClubId, clubIdForUpdate });

    const updateData: Record<string, any> = {
      ownerUid: uid,
    };

    if (Object.prototype.hasOwnProperty.call(body, 'logoUrl')) {
      updateData.logoUrl = typeof logoUrl === 'string' && logoUrl.length > 0 ? logoUrl : null;
    }

    if (typeof clubName === 'string' && clubName.length > 0) {
      updateData.clubName = clubName;
    }

    if (clubIdForUpdate) {
      updateData.clubId = clubIdForUpdate;
      updateData.slug = clubIdForUpdate;
    }

    if (typeof layoutType === 'string' && layoutType.length > 0) {
      updateData.layoutType = layoutType;
    }

    if (typeof mainTeamId === 'string' && mainTeamId.length > 0) {
      updateData.mainTeamId = mainTeamId;
    }

    if (typeof realTeamUsage === 'boolean') {
      updateData.realTeamUsage = realTeamUsage;
    }

    if (typeof gameTeamUsage === 'boolean') {
      updateData.gameTeamUsage = gameTeamUsage;
    }

    if (typeof transfersPublic === 'boolean') {
      updateData.transfersPublic = transfersPublic;
    }

    if (typeof directoryListed === 'boolean') {
      updateData.directoryListed = directoryListed;
    }

    const displaySettingsPatch: Record<string, any> = {};
    if (displaySettings && typeof displaySettings === 'object') {
      if (typeof (displaySettings as any).playerProfileLatest === 'boolean') {
        displaySettingsPatch.playerProfileLatest = (displaySettings as any).playerProfileLatest;
      }
      if (typeof (displaySettings as any).resultsPageV2 === 'boolean') {
        displaySettingsPatch.resultsPageV2 = (displaySettings as any).resultsPageV2;
      }
      if (typeof (displaySettings as any).topPageV2 === 'boolean') {
        displaySettingsPatch.topPageV2 = (displaySettings as any).topPageV2;
      }
      if (typeof (displaySettings as any).newsPageV2 === 'boolean') {
        displaySettingsPatch.newsPageV2 = (displaySettings as any).newsPageV2;
      }
      if (typeof (displaySettings as any).tvPageV2 === 'boolean') {
        displaySettingsPatch.tvPageV2 = (displaySettings as any).tvPageV2;
      }
      if (typeof (displaySettings as any).clubPageV2 === 'boolean') {
        displaySettingsPatch.clubPageV2 = (displaySettings as any).clubPageV2;
      }
      if (typeof (displaySettings as any).transfersPageV2 === 'boolean') {
        displaySettingsPatch.transfersPageV2 = (displaySettings as any).transfersPageV2;
      }
      if (typeof (displaySettings as any).matchesPageV2 === 'boolean') {
        displaySettingsPatch.matchesPageV2 = (displaySettings as any).matchesPageV2;
      }
      if (typeof (displaySettings as any).tablePageV2 === 'boolean') {
        displaySettingsPatch.tablePageV2 = (displaySettings as any).tablePageV2;
      }
      if (typeof (displaySettings as any).statsPageV2 === 'boolean') {
        displaySettingsPatch.statsPageV2 = (displaySettings as any).statsPageV2;
      }
      if (typeof (displaySettings as any).squadPageV2 === 'boolean') {
        displaySettingsPatch.squadPageV2 = (displaySettings as any).squadPageV2;
      }
      if (typeof (displaySettings as any).partnerPageV2 === 'boolean') {
        displaySettingsPatch.partnerPageV2 = (displaySettings as any).partnerPageV2;
      }

      if (typeof (displaySettings as any).resultsPageVariant === 'string') {
        displaySettingsPatch.resultsPageVariant = (displaySettings as any).resultsPageVariant;
      }
      if (typeof (displaySettings as any).topPageVariant === 'string') {
        displaySettingsPatch.topPageVariant = (displaySettings as any).topPageVariant;
      }
      if (typeof (displaySettings as any).newsPageVariant === 'string') {
        displaySettingsPatch.newsPageVariant = (displaySettings as any).newsPageVariant;
      }
      if (typeof (displaySettings as any).tvPageVariant === 'string') {
        displaySettingsPatch.tvPageVariant = (displaySettings as any).tvPageVariant;
      }
      if (typeof (displaySettings as any).clubPageVariant === 'string') {
        displaySettingsPatch.clubPageVariant = (displaySettings as any).clubPageVariant;
      }
      if (typeof (displaySettings as any).transfersPageVariant === 'string') {
        displaySettingsPatch.transfersPageVariant = (displaySettings as any).transfersPageVariant;
      }
      if (typeof (displaySettings as any).matchesPageVariant === 'string') {
        displaySettingsPatch.matchesPageVariant = (displaySettings as any).matchesPageVariant;
      }
      if (typeof (displaySettings as any).tablePageVariant === 'string') {
        displaySettingsPatch.tablePageVariant = (displaySettings as any).tablePageVariant;
      }
      if (typeof (displaySettings as any).statsPageVariant === 'string') {
        displaySettingsPatch.statsPageVariant = (displaySettings as any).statsPageVariant;
      }
      if (typeof (displaySettings as any).squadPageVariant === 'string') {
        displaySettingsPatch.squadPageVariant = (displaySettings as any).squadPageVariant;
      }
      if (typeof (displaySettings as any).partnerPageVariant === 'string') {
        displaySettingsPatch.partnerPageVariant = (displaySettings as any).partnerPageVariant;
      }

      if (typeof (displaySettings as any).menuShowNews === 'boolean') {
        displaySettingsPatch.menuShowNews = (displaySettings as any).menuShowNews;
      }
      if (typeof (displaySettings as any).menuShowTv === 'boolean') {
        displaySettingsPatch.menuShowTv = (displaySettings as any).menuShowTv;
      }
      if (typeof (displaySettings as any).menuShowClub === 'boolean') {
        displaySettingsPatch.menuShowClub = (displaySettings as any).menuShowClub;
      }
      if (typeof (displaySettings as any).menuShowTransfers === 'boolean') {
        displaySettingsPatch.menuShowTransfers = (displaySettings as any).menuShowTransfers;
      }
      if (typeof (displaySettings as any).menuShowMatches === 'boolean') {
        displaySettingsPatch.menuShowMatches = (displaySettings as any).menuShowMatches;
      }
      if (typeof (displaySettings as any).menuShowTable === 'boolean') {
        displaySettingsPatch.menuShowTable = (displaySettings as any).menuShowTable;
      }
      if (typeof (displaySettings as any).menuShowStats === 'boolean') {
        displaySettingsPatch.menuShowStats = (displaySettings as any).menuShowStats;
      }
      if (typeof (displaySettings as any).menuShowSquad === 'boolean') {
        displaySettingsPatch.menuShowSquad = (displaySettings as any).menuShowSquad;
      }
      if (typeof (displaySettings as any).menuShowPartner === 'boolean') {
        displaySettingsPatch.menuShowPartner = (displaySettings as any).menuShowPartner;
      }
    }

    if (Object.keys(displaySettingsPatch).length > 0) {
      updateData.displaySettings = displaySettingsPatch;
    }

    const dsKeys = Object.keys(displaySettingsPatch);
    if (dsKeys.length > 0) {
      console.log('[club/update] displaySettings updates', { uid, clubIdForUpdate, keys: dsKeys, values: dsKeys.map((k) => displaySettingsPatch[k]) });
    }

    // スポンサー情報（画像URLとリンク先URLの配列）
    if (Array.isArray(sponsors)) {
      updateData.sponsors = sponsors;
    }

    // SNSリンク（X, YouTube, TikTok, Instagram）
    if (snsLinks && typeof snsLinks === 'object') {
      updateData.snsLinks = snsLinks;
    }

    // テキストページ（プライバシーポリシー等）最大3件想定
    if (Array.isArray(legalPages)) {
      updateData.legalPages = legalPages;
    }

    if (typeof homeBgColor === 'string') {
      updateData.homeBgColor = homeBgColor;
    }

    if (homeColorTheme === 'dark' || homeColorTheme === 'light') {
      updateData.homeColorTheme = homeColorTheme;
    }

    if (headerLayout === 'center' || headerLayout === 'left') {
      updateData.headerLayout = headerLayout;
    }

    if (homeLayout === 'default' || homeLayout === 'pattern1' || homeLayout === 'pattern2') {
      updateData.homeLayout = homeLayout;
    }

    // Ensure clubId is preserved in the update
    if (clubIdForUpdate) {
      updateData.clubId = clubIdForUpdate;
    } else if (existingClubId) {
      updateData.clubId = existingClubId;
    } else if (requestedClubId) {
      updateData.clubId = requestedClubId;
    }

    updateData.clubUid = clubUid;
    updateData.updatedAt = FieldValue.serverTimestamp();

    if (typeof foundedYear === 'string') {
      updateData.foundedYear = foundedYear;
    }

    if (typeof hometown === 'string') {
      updateData.hometown = hometown;
    }

    if (typeof stadiumName === 'string') {
      updateData.stadiumName = stadiumName;
    }

    if (typeof stadiumCapacity === 'string') {
      updateData.stadiumCapacity = stadiumCapacity;
    }

    if (typeof stadiumPhotoUrl === 'string') {
      updateData.stadiumPhotoUrl = stadiumPhotoUrl;
    }

    if (typeof clubDescription === 'string') {
      updateData.clubDescription = clubDescription;
    }

    if (Array.isArray(clubTitles)) {
      updateData.clubTitles = clubTitles;
    }

    if (!clubIdForUpdate) {
      return new NextResponse(JSON.stringify({ message: 'URL識別名が決定できません' }), { status: 400 });
    }

    // 公開URL（slug）の更新を同一トランザクションで保証
    try {
      await db.runTransaction(async (t) => {
        const mainRef = clubProfilesRef.doc(clubUid);
        const mainSnap = await t.get(mainRef);
        const mainData = mainSnap.data() as Record<string, unknown> | undefined;
        const currentMainClubId = typeof mainData?.clubId === 'string' ? mainData.clubId : null;

        // 既存URLを持つ場合、変更前の値が取得できていることを確認
        if (existingClubId && currentMainClubId !== existingClubId) {
          throw new Error('この間にURLが更新されました。もう一度お試しください。');
        }

        // slug が実際に変更される場合のみ重複チェックを行う
        // （slug 非変更の保存で、削除済みCareer等が同じ clubId を保持していても保存を妨げない）
        const slugChanged = requestedClubId !== '' && requestedClubId !== currentMainClubId;
        let byIdSnap: FirebaseFirestore.DocumentSnapshot | null = null;
        const aliasRef = clubProfilesRef.doc(clubIdForUpdate);
        if (slugChanged) {
          // clubId フィールドでの重複チェック（対象Careerの正規 doc / 対象 alias のみ許可）
          const byField = await t.get(clubProfilesRef.where('clubId', '==', clubIdForUpdate));
          for (const d of byField.docs) {
            if (d.id === clubUid) continue; // 対象Careerの正規プロフィール
            const dClubUid = d.data()?.clubUid;
            const dOwnerUid = d.data()?.ownerUid;
            if (d.id === clubIdForUpdate && dClubUid === clubUid && dOwnerUid === uid) continue; // 対象CareerのURL alias
            throw new Error('このURLはすでに使用されています');
          }

          // 新 alias ドキュメントIDの重複チェック
          byIdSnap = await t.get(aliasRef);
          if (byIdSnap.exists) {
            const aData = byIdSnap.data() as Record<string, unknown> | undefined;
            if (aData?.ownerUid !== uid || aData?.clubUid !== clubUid) {
              throw new Error('このURLはすでに使用されています');
            }
          }
        } else {
          byIdSnap = await t.get(aliasRef);
        }

        // 正規の club_profiles/{clubUid} のみを更新。clubUid フィールドが汚染された他ドキュメントは触らない
        t.set(mainRef, updateData, { merge: true });

        // 新 alias を作成または更新
        if (clubIdForUpdate !== clubUid) {
          if (byIdSnap.exists) {
            t.set(aliasRef, updateData, { merge: true });
          } else {
            t.set(aliasRef, {
              ...updateData,
              createdAt: FieldValue.serverTimestamp(),
              updatedAt: FieldValue.serverTimestamp(),
            });
          }
        }
      });
    } catch (error: any) {
      console.error('[club/update] slug uniqueness check failed:', error);
      return new NextResponse(JSON.stringify({ message: error.message || 'URLの更新に失敗しました' }), { status: 409 });
    }
    await touchUserActivity(uid);

    return new NextResponse(
      JSON.stringify({
        message: 'クラブ情報が正常に更新されました。',
        debug: {
          uid,
          requestedClubId,
          clubIdForUpdate,
          displaySettingsKeys: dsKeys,
        },
      }),
      { status: 200 }
    );

  } catch (error) {
    console.error('Club update error:', error);
    return new NextResponse(JSON.stringify({ message: 'サーバーエラーが発生しました。' }), { status: 500 });
  }
}
