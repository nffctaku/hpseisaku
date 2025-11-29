import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase/admin';

export async function POST(request: Request) {
  try {
    const { clubId, ownerUid } = await request.json();

    // UI 側ではクラブIDのみ入力する仕様になったため、必須項目は clubId と ownerUid のみ
    if (!clubId || !ownerUid) {
      return new NextResponse(JSON.stringify({ message: '必須項目が不足しています。' }), { status: 400 });
    }

    if (!/^[a-z0-9-]+$/.test(clubId)) {
        return new NextResponse(JSON.stringify({ message: 'クラブIDは半角英数字とハイフンのみ使用できます。' }), { status: 400 });
    }

    const clubProfilesRef = db.collection('club_profiles');

    // クラブIDの重複チェック
    const existingClubQuery = clubProfilesRef.where('clubId', '==', clubId).limit(1);
    const existingClubSnap = await existingClubQuery.get();
    if (!existingClubSnap.empty) {
      return new NextResponse(JSON.stringify({ message: 'このクラブIDは既に使用されています。' }), { status: 409 });
    }

    // ユーザーが既にクラブを登録済みかチェック
    const ownerQuery = clubProfilesRef.where('ownerUid', '==', ownerUid).limit(1);
    const ownerSnap = await ownerQuery.get();
    if (!ownerSnap.empty) {
      return new NextResponse(JSON.stringify({ message: 'あなたのアカウントは既にクラブを登録済みです。' }), { status: 409 });
    }

    // 新しいクラブ情報を登録
    const newClubRef = db.collection('club_profiles').doc();
    await newClubRef.set({
      clubId,
      ownerUid,
      createdAt: new Date(),
    });

    return new NextResponse(JSON.stringify({ message: 'クラブが正常に登録されました。', docId: newClubRef.id }), { status: 201 });

  } catch (error) {
    console.error('Club registration error:', error);
    return new NextResponse(JSON.stringify({ message: 'サーバーエラーが発生しました。' }), { status: 500 });
  }
}
