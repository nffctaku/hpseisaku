import { db } from '@/lib/firebase/admin';
import { NewsArticle } from '@/types/news';
import { notFound } from 'next/navigation';

export const revalidate = 0;

async function getArticle(clubId: string, newsId: string): Promise<NewsArticle | null> {
  const profileQuery = db.collection('club_profiles').where('clubId', '==', clubId).limit(1);
  const profileSnapshot = await profileQuery.get();

  if (profileSnapshot.empty) {
    console.error(`No club profile found for clubId: ${clubId}`);
    return null;
  }

  const ownerUid = profileSnapshot.docs[0].data().ownerUid;
  if (!ownerUid) {
    console.error(`ownerUid not found in club profile for clubId: ${clubId}`);
    return null;
  }

  const docRef = db.collection(`clubs/${ownerUid}/news`).doc(newsId);
  const docSnap = await docRef.get();

  if (!docSnap.exists) {
    console.error(`Article with id ${newsId} not found for club ${clubId}`);
    return null;
  }

  const data = docSnap.data()!;

  return {
    id: docSnap.id,
    title: data.title,
    content: data.content,
    publishedAt: data.publishedAt,
  } as NewsArticle;
}

export default async function NewsArticlePage({ params }: { params: { clubId: string, newsId: string } }) {
  const article = await getArticle(params.clubId, params.newsId);

  if (!article) {
    notFound();
  }

  return (
    <div className="bg-gray-900 text-white min-h-screen">
      <div className="container mx-auto px-4 py-8 max-w-3xl">
        <h1 className="text-4xl font-bold mb-4">{article.title}</h1>
        <hr className="border-gray-700 my-8" />
        <div className="whitespace-pre-wrap text-lg">
          {article.content}
        </div>
      </div>
    </div>
  );
}
