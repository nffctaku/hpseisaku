export const revalidate = 0; // Force dynamic rendering

import { db } from '@/lib/firebase/admin';
import { NewsArticle } from '@/types/news';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import { ja } from 'date-fns/locale';
import PaginationControls from '@/components/pagination-controls';

const NEWS_PER_PAGE = 9;

interface NewsPageProps {
  params: { clubId: string };
  searchParams: { [key: string]: string | string[] | undefined };
}

async function getNewsData(clubId: string, page: number) {
  const profilesQuery = db.collection('club_profiles').where('clubId', '==', clubId).limit(1);
  const profilesSnap = await profilesQuery.get();

  if (profilesSnap.empty) {
    return null;
  }

  const clubProfileDoc = profilesSnap.docs[0];
  const profileData = clubProfileDoc.data();
  const ownerUid = profileData.ownerUid;

  if (!ownerUid) {
    return null;
  }

  const newsCollectionRef = db.collection(`clubs/${ownerUid}/news`);

  // Get total count for pagination
  const totalSnapshot = await newsCollectionRef.count().get();
  const totalNews = totalSnapshot.data().count;

  let newsQuery = newsCollectionRef.orderBy('publishedAt', 'desc').limit(NEWS_PER_PAGE);

  if (page > 1) {
    const offset = (page - 1) * NEWS_PER_PAGE;
    const previousDocsSnapshot = await newsCollectionRef.orderBy('publishedAt', 'desc').limit(offset).get();
    const lastVisible = previousDocsSnapshot.docs[previousDocsSnapshot.docs.length - 1];
    if (lastVisible) {
        newsQuery = newsQuery.startAfter(lastVisible);
    }
  }

  const snapshot = await newsQuery.get();
  const news = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as NewsArticle[];

  return { news, totalNews };
}

function NewsCard({ article, clubId }: { article: NewsArticle, clubId: string }) {
  return (
    <Link href={`/${clubId}/news/${article.id}`} className="block group">
      <div className="bg-card rounded-lg overflow-hidden shadow-md h-full flex flex-col">
        {article.imageUrl && (
          <div className="relative w-full h-48">
            <Image
              src={article.imageUrl}
              alt={article.title}
              fill
              className="object-cover"
            />
          </div>
        )}
        <div className="p-4 flex-grow flex flex-col">
          <div className="flex items-center text-xs text-muted-foreground mb-2">
            {article.category && <span className="font-bold mr-2 text-primary">{article.category.toUpperCase()}</span>}
            {article.publishedAt && (
              <span>
                {formatDistanceToNow(article.publishedAt.toDate(), { addSuffix: true, locale: ja })}
              </span>
            )}
          </div>
          <h3 className="text-card-foreground font-bold text-lg leading-tight flex-grow group-hover:underline">
            {article.title}
          </h3>
        </div>
      </div>
    </Link>
  );
}

export default async function NewsPage({ params, searchParams }: NewsPageProps) {
  const clubId = params.clubId;
  const page = typeof searchParams.page === 'string' ? Number(searchParams.page) : 1;

  if (clubId === 'admin') {
    notFound();
  }

  const newsData = await getNewsData(clubId, page);

  if (!newsData) {
    notFound();
  }

  const { news, totalNews } = newsData;
  const totalPages = Math.ceil(totalNews / NEWS_PER_PAGE);

  return (
    <div className="min-h-screen">
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center border-b pb-2 mb-8">
            <h1 className="text-3xl font-bold">ALL NEWS</h1>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {news.map(article => (
            <NewsCard key={article.id} article={article} clubId={clubId} />
          ))}
        </div>
        <div className="mt-8">
            <PaginationControls
                currentPage={page}
                totalPages={totalPages}
                basePath={`/${clubId}/news`}
            />
        </div>
      </div>
    </div>
  );
}
