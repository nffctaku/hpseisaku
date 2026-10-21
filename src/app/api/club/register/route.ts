import { NextResponse } from 'next/server';
import { auth, db } from '@/lib/firebase/admin';
import { touchUserActivity } from '@/lib/server-activity';

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!token) {
      return new NextResponse(JSON.stringify({ message: 'ログインが必要です。' }), { status: 401 });
    }

    let uid: string;
    try {
      const decoded = await auth.verifyIdToken(token);
      uid = decoded.uid;
    } catch {
      return new NextResponse(JSON.stringify({ message: '認証に失敗しました。再度ログインしてください。' }), { status: 401 });
    }

    const { clubId } = await request.json();

    // UI 側ではクラブIDのみ入力する仕様になったため、必須項目は clubId のみ
    // （ownerUid は認証トークン由来の uid を使用し、クライアント指定値は信頼しない）
    if (!clubId) {
      return new NextResponse(JSON.stringify({ message: '必須項目が不足しています。' }), { status: 400 });
    }

    if (!/^[a-z0-9-]+$/.test(clubId)) {
        return new NextResponse(JSON.stringify({ message: 'クラブIDは半角英数字とハイフンのみ使用できます。' }), { status: 400 });
    }

    const clubProfilesRef = db.collection('club_profiles');

    // 重複チェックと作成を1トランザクションで実行する。
    // Firestore トランザクションは直列化されるため、同時登録で同一 clubId の
    // ドキュメントが二重に作成されることはない（敗者側はリトライ時に競合を検出する）。
    // uid を documentId とし、重複 profile を作らない。
    const newClubRef = clubProfilesRef.doc(uid);
    const outcome = await db.runTransaction(async (tx) => {
      // クラブIDの重複チェック
      const existingClubSnap = await tx.get(clubProfilesRef.where('clubId', '==', clubId).limit(1));
      if (!existingClubSnap.empty) {
        return 'clubId-taken' as const;
      }

      // ユーザーが既にクラブを登録済みかチェック
      const ownerSnap = await tx.get(clubProfilesRef.where('ownerUid', '==', uid).limit(1));
      if (!ownerSnap.empty) {
        return 'already-registered' as const;
      }

      // 新しいクラブ情報を登録
      tx.set(newClubRef, {
        clubId,
        ownerUid: uid,
        clubProfileId: uid,
        createdAt: new Date(),
      }, { merge: true });
      return 'created' as const;
    });

    if (outcome === 'clubId-taken') {
      return new NextResponse(JSON.stringify({ message: 'このクラブIDは既に使用されています。' }), { status: 409 });
    }
    if (outcome === 'already-registered') {
      return new NextResponse(JSON.stringify({ message: 'あなたのアカウントは既にクラブを登録済みです。' }), { status: 409 });
    }

    await touchUserActivity(uid);

    return new NextResponse(JSON.stringify({ message: 'クラブが正常に登録されました。', docId: newClubRef.id }), { status: 201 });

  } catch (error) {
    console.error('Club registration error:', error);
    return new NextResponse(JSON.stringify({ message: 'サーバーエラーが発生しました。' }), { status: 500 });
  }
}
