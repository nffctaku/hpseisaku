import { NextResponse } from 'next/server';
import { db, admin } from '@/lib/firebase/admin';

export const runtime = 'nodejs';

type Body = {
  clubId?: string;
  newsId?: string;
  visitorId?: string;
};

async function resolveOwnerUid(clubId: string): Promise<string | null> {
  try {
    const profilesQuery = db.collection('club_profiles').where('clubId', '==', clubId).limit(1);
    const profileSnap = await profilesQuery.get();
    if (profileSnap.empty) return null;
    const doc = profileSnap.docs[0];
    const data = doc.data() as any;
    return (data.ownerUid as string) || doc.id;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Body;
    const clubId = typeof body.clubId === 'string' ? body.clubId : '';
    const newsId = typeof body.newsId === 'string' ? body.newsId : '';
    const visitorId = typeof body.visitorId === 'string' ? body.visitorId : '';

    if (!clubId || !newsId || !visitorId) {
      return NextResponse.json({ message: 'clubId, newsId, visitorId are required' }, { status: 400 });
    }

    const ownerUid = await resolveOwnerUid(clubId);
    if (!ownerUid) {
      return NextResponse.json({ message: 'Club not found' }, { status: 404 });
    }

    const articleRef = db.doc(`clubs/${ownerUid}/news/${newsId}`);
    const likeRef = articleRef.collection('likes').doc(visitorId);

    const result = await db.runTransaction(async (tx) => {
      const [articleSnap, likeSnap] = await Promise.all([tx.get(articleRef), tx.get(likeRef)]);
      if (!articleSnap.exists) {
        throw new Error('not-found');
      }

      const currentLikeCount = typeof (articleSnap.data() as any)?.likeCount === 'number' ? (articleSnap.data() as any).likeCount : 0;

      if (likeSnap.exists) {
        tx.delete(likeRef);
        tx.set(
          articleRef,
          {
            likeCount: Math.max(0, currentLikeCount - 1),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
        return { liked: false, likeCount: Math.max(0, currentLikeCount - 1) };
      }

      tx.set(
        likeRef,
        {
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      tx.set(
        articleRef,
        {
          likeCount: currentLikeCount + 1,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      return { liked: true, likeCount: currentLikeCount + 1 };
    });

    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Internal Server Error';
    if (msg === 'not-found') {
      return NextResponse.json({ message: 'News not found' }, { status: 404 });
    }
    return NextResponse.json({ message: msg }, { status: 500 });
  }
}
