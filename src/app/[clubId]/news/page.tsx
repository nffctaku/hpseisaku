export const revalidate = 0; // Force dynamic rendering

import { db } from '@/lib/firebase/admin';
import { NewsArticle } from '@/types/news';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import { ja } from 'date-fns/locale';
import PaginationControls from '@/components/pagination-controls';
import { ClubHeader } from '@/components/club-header';
import { ClubFooter } from '@/components/club-footer';

const NEWS_PER_PAGE = 9;

interface NewsPageProps {
  params: { clubId: string };
  searchParams: { [key: string]: string | string[] | undefined };
}

async function getNewsData(clubId: string, page: number) {
  const profilesQuery = db.collection('club_profiles').where('clubId', '==', clubId).limit(1);
  const profilesSnap = await profilesQuery.get();

  let profileDoc: FirebaseFirestore.DocumentSnapshot | null = null;
  if (!profilesSnap.empty) {
    profileDoc = profilesSnap.docs[0];
  } else {
    // fallback: allow accessing by direct doc id (ownerUid) or by ownerUid field
    const direct = await db.collection('club_profiles').doc(clubId).get();
    if (direct.exists) {
      profileDoc = direct;
    } else {
      const ownerSnap = await db.collection('club_profiles').where('ownerUid', '==', clubId).limit(1).get();
      if (!ownerSnap.empty) profileDoc = ownerSnap.docs[0];
    }
  }

  if (!profileDoc) return null;

  const profileData = profileDoc.data() as any;
  const ownerUid = (profileData?.ownerUid as string | undefined) || profileDoc.id;
  if (!ownerUid) return null;

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

  const clubName = (profileData.clubName as string) || undefined;
  const logoUrl = (profileData.logoUrl as string) || undefined;
  const snsLinks = ((profileData as any).snsLinks as any) ?? {};
  const sponsors = (Array.isArray((profileData as any).sponsors) ? ((profileData as any).sponsors as any[]) : []) as any;
  const legalPages = (Array.isArray((profileData as any).legalPages) ? ((profileData as any).legalPages as any[]) : []) as any;
  const homeBgColor = (profileData as any).homeBgColor as string | undefined;
  const gameTeamUsage = Boolean((profileData as any).gameTeamUsage);

  return { news, totalNews, clubName, logoUrl, snsLinks, sponsors, legalPages, homeBgColor, gameTeamUsage };
}

function toCloudinaryPadded16x9(url: string, width: number) {
  if (!url) return url;
  if (!url.includes('/image/upload/')) return url;
  return url.replace(
    '/image/upload/',
    `/image/upload/c_pad,ar_16:9,w_${width},b_auto,f_auto,q_auto/`
  );
}

function NewsCard({ article, clubId }: { article: NewsArticle, clubId: string }) {
  return (
    <Link href={`/${clubId}/news/${article.id}`} className="block group">
      <div className="bg-card text-card-foreground rounded-lg overflow-hidden shadow-md h-full flex flex-col border border-border">
        {article.imageUrl && (
          <div className="relative w-full aspect-video bg-muted">
            <Image
              src={toCloudinaryPadded16x9(article.imageUrl, 1200)}
              alt={article.title}
              fill
              className="object-contain"
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

  const { news, totalNews, clubName, logoUrl, snsLinks, sponsors, legalPages, homeBgColor, gameTeamUsage } = newsData as any;
  const totalPages = Math.ceil(totalNews / NEWS_PER_PAGE);

  return (
    <main className="min-h-screen flex flex-col" style={homeBgColor ? { backgroundColor: homeBgColor } : undefined}>
      <ClubHeader clubId={clubId} clubName={clubName} logoUrl={logoUrl} snsLinks={snsLinks} />
      <div className="flex-1">
        <div className="container mx-auto px-4 py-6 sm:py-8">
        <div className="flex items-center border-b pb-2 mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold">ALL NEWS</h1>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {news.map((article: NewsArticle) => (
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

      <ClubFooter
        clubId={clubId}
        clubName={clubName}
        sponsors={sponsors}
        snsLinks={snsLinks}
        legalPages={legalPages}
        gameTeamUsage={Boolean(gameTeamUsage)}
      />
    </main>
  );
}
