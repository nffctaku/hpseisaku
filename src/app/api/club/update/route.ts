import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase/admin';
import { getAuth } from 'firebase-admin/auth';

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
    if (!uid) {
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
      foundedYear,
      hometown,
      stadiumName,
      stadiumCapacity,
      stadiumPhotoUrl,
      clubTitles,
    } = body as any;

    const clubProfilesRef = db.collection('club_profiles');

    // 既存の club_profiles ドキュメントから clubId を引き継ぐ
    const existingUidDocSnap = await clubProfilesRef.doc(uid).get();
    const existingOwnerQuerySnap = await clubProfilesRef.where('ownerUid', '==', uid).get();

    let existingClubId: string | null = null;
    if (existingUidDocSnap.exists) {
      const uidData = existingUidDocSnap.data() as any;
      if (uidData && typeof uidData.clubId === 'string') {
        existingClubId = uidData.clubId as string;
      }
    } else if (!existingOwnerQuerySnap.empty) {
      const firstOwnerDoc = existingOwnerQuerySnap.docs[0].data() as any;
      if (typeof firstOwnerDoc.clubId === 'string') {
        existingClubId = firstOwnerDoc.clubId;
      }
    }

    const requestedClubId = typeof clubId === 'string' ? String(clubId).trim() : '';
    const clubIdForUpdate = existingClubId || (requestedClubId ? requestedClubId : null);

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

    if (Array.isArray(clubTitles)) {
      updateData.clubTitles = clubTitles;
    }

    // ID が uid の doc を更新
    const clubDocRef = clubProfilesRef.doc(uid);

    // 公開側が参照しやすい canonical doc: docId == clubId(slug)
    const clubSlugDocRef = clubIdForUpdate ? clubProfilesRef.doc(clubIdForUpdate) : null;

    // UI から指定された clubId(slug) も更新（参照元が複数パターンあるため）
    const requestedSlugDocRef = requestedClubId ? clubProfilesRef.doc(requestedClubId) : null;

    // 既存の ownerUid ベースの doc もあれば同じ内容で更新
    const ownerQuerySnapshot = await clubProfilesRef.where('ownerUid', '==', uid).get();

    // clubId(slug) でヒットする doc もあれば更新（公開側が clubId で参照するケースのため）
    const clubIdQuerySnapshot = clubIdForUpdate
      ? await clubProfilesRef.where('clubId', '==', clubIdForUpdate).get()
      : null;

    const writePromises: Promise<FirebaseFirestore.WriteResult>[] = [];
    writePromises.push(clubDocRef.set(updateData, { merge: true }));

    if (clubSlugDocRef && clubSlugDocRef.id !== uid) {
      writePromises.push(clubSlugDocRef.set(updateData, { merge: true }));
    }

    if (requestedSlugDocRef && requestedSlugDocRef.id !== uid && (!clubSlugDocRef || requestedSlugDocRef.id !== clubSlugDocRef.id)) {
      writePromises.push(requestedSlugDocRef.set(updateData, { merge: true }));
    }

    console.log('[club/update] write targets', {
      uid,
      uidDocId: clubDocRef.id,
      clubSlugDocId: clubSlugDocRef ? clubSlugDocRef.id : null,
      requestedSlugDocId: requestedSlugDocRef ? requestedSlugDocRef.id : null,
    });

    ownerQuerySnapshot.forEach((docSnap) => {
      // uid docは上で更新済み
      if (docSnap.id !== uid) {
        writePromises.push(docSnap.ref.set(updateData, { merge: true }));
      }
    });

    if (clubIdQuerySnapshot) {
      clubIdQuerySnapshot.forEach((docSnap) => {
        if (docSnap.id !== uid) {
          writePromises.push(docSnap.ref.set(updateData, { merge: true }));
        }
      });
    }

    await Promise.all(writePromises);

    return new NextResponse(
      JSON.stringify({
        message: 'クラブ情報が正常に更新されました。',
        debug: {
          uid,
          requestedClubId,
          clubIdForUpdate,
          displaySettingsKeys: dsKeys,
          writeTargets: {
            uidDocId: clubDocRef.id,
            clubSlugDocId: clubSlugDocRef ? clubSlugDocRef.id : null,
            requestedSlugDocId: requestedSlugDocRef ? requestedSlugDocRef.id : null,
          },
        },
      }),
      { status: 200 }
    );

  } catch (error) {
    console.error('Club update error:', error);
    return new NextResponse(JSON.stringify({ message: 'サーバーエラーが発生しました。' }), { status: 500 });
  }
}
