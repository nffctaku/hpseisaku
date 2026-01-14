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

    const {
      clubName,
      logoUrl,
      layoutType,
      mainTeamId,
      realTeamUsage,
      gameTeamUsage,
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
    } = await request.json();

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

    const updateData: Record<string, any> = {
      logoUrl: logoUrl || null, // URLが空の場合はnullを保存
      ownerUid: uid,
    };

    if (typeof clubName === 'string' && clubName.length > 0) {
      updateData.clubName = clubName;
    }

    if (existingClubId) {
      updateData.clubId = existingClubId;
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

    // 既存の ownerUid ベースの doc もあれば同じ内容で更新
    const ownerQuerySnapshot = await clubProfilesRef.where('ownerUid', '==', uid).get();

    const writePromises: Promise<FirebaseFirestore.WriteResult>[] = [];
    writePromises.push(clubDocRef.set(updateData, { merge: true }));

    ownerQuerySnapshot.forEach((docSnap) => {
      if (docSnap.id !== uid) {
        writePromises.push(docSnap.ref.set(updateData, { merge: true }));
      }
    });

    await Promise.all(writePromises);

    return new NextResponse(JSON.stringify({ message: 'クラブ情報が正常に更新されました。' }), { status: 200 });

  } catch (error) {
    console.error('Club update error:', error);
    return new NextResponse(JSON.stringify({ message: 'サーバーエラーが発生しました。' }), { status: 500 });
  }
}
