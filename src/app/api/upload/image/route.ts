import { NextResponse } from 'next/server';
import { admin } from '@/lib/firebase/admin';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return new NextResponse(JSON.stringify({ message: 'ファイルがありません。' }), { status: 400 });
    }

    const bucket = admin.storage().bucket(`gs://${process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET}`);
    
    // ファイルをバッファに変換
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // ファイル名を一意にする
    const fileName = `club-logos/${Date.now()}-${file.name}`;
    const fileUpload = bucket.file(fileName);

    // ファイルをアップロード
    await fileUpload.save(buffer, {
      metadata: {
        contentType: file.type,
      },
    });

    // 公開URLを取得
    const [url] = await fileUpload.getSignedUrl({
      action: 'read',
      expires: '03-09-2491', // 遠い未来の日付に設定して、事実上無期限にする
    });

    return new NextResponse(JSON.stringify({ url }), { status: 200 });

  } catch (error) {
    console.error('Image upload error:', error);
    return new NextResponse(JSON.stringify({ message: '画像のアップロード中にエラーが発生しました。' }), { status: 500 });
  }
}
