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

    const { clubName, logoUrl } = await request.json();

    if (!clubName) {
      return new NextResponse(JSON.stringify({ message: 'クラブ名は必須です。' }), { status: 400 });
    }

    const clubProfilesRef = db.collection('club_profiles');
    const q = clubProfilesRef.where('ownerUid', '==', uid).limit(1);
    const querySnapshot = await q.get();

    if (querySnapshot.empty) {
      return new NextResponse(JSON.stringify({ message: '更新対象のクラブが見つかりません。' }), { status: 404 });
    }

    const clubDocRef = querySnapshot.docs[0].ref;
    await clubDocRef.update({
      clubName,
      logoUrl: logoUrl || null, // URLが空の場合はnullを保存
    });

    return new NextResponse(JSON.stringify({ message: 'クラブ情報が正常に更新されました。' }), { status: 200 });

  } catch (error) {
    console.error('Club update error:', error);
    return new NextResponse(JSON.stringify({ message: 'サーバーエラーが発生しました。' }), { status: 500 });
  }
}
