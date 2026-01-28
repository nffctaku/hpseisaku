import { db } from '@/lib/firebase/admin';
import { NewsArticle } from '@/types/news';
import type { Metadata } from 'next';
import Image from 'next/image';
import { headers } from 'next/headers';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import NewsActions from './NewsActions';

export const revalidate = 0;

function toCloudinaryPadded16x9(url: string, width: number) {
  if (!url) return url;
  if (!url.includes('/image/upload/')) return url;
  return url.replace('/image/upload/', `/image/upload/c_pad,ar_16:9,w_${width},b_auto,f_auto,q_auto/`);
}

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
    noteUrl: data.noteUrl,
    imageUrl: data.imageUrl,
    likeCount: typeof data.likeCount === 'number' ? data.likeCount : 0,
    publishedAt: data.publishedAt,
  } as NewsArticle;
}

 async function getOtherNews(clubId: string, currentNewsId: string, limit: number): Promise<NewsArticle[]> {
   const profileQuery = db.collection('club_profiles').where('clubId', '==', clubId).limit(1);
   const profileSnapshot = await profileQuery.get();

   if (profileSnapshot.empty) {
     return [];
   }

   const ownerUid = profileSnapshot.docs[0].data().ownerUid;
   if (!ownerUid) {
     return [];
   }

   const newsRef = db.collection(`clubs/${ownerUid}/news`);
   const snap = await newsRef.orderBy('publishedAt', 'desc').limit(limit + 3).get();
   const items = snap.docs
     .filter((d) => d.id !== currentNewsId)
     .slice(0, limit)
     .map((d) => {
       const data = d.data() as any;
       return {
         id: d.id,
         title: data.title,
         imageUrl: data.imageUrl,
         publishedAt: data.publishedAt,
       } as NewsArticle;
     });

   return items;
 }

 function OtherNewsCard({ article, clubId }: { article: NewsArticle; clubId: string }) {
   const publishedDate = article.publishedAt?.toDate ? article.publishedAt.toDate() : null;

   return (
     <Link href={`/${clubId}/news/${article.id}`} className="block group">
       <div className="bg-white text-gray-900 rounded-lg overflow-hidden shadow-md h-full flex flex-col border">
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
             {publishedDate ? format(publishedDate, 'yyyy年M月d日', { locale: ja }) : ''}
           </div>
           <h3 className="text-card-foreground font-bold text-base leading-tight flex-grow group-hover:underline">
             {article.title}
           </h3>
         </div>
       </div>
     </Link>
   );
 }

export async function generateMetadata({
  params,
}: {
  params: { clubId: string; newsId: string };
}): Promise<Metadata> {
  const { clubId, newsId } = params;
  const article = await getArticle(clubId, newsId);
  if (!article) {
    return {};
  }

  const title = article.title || 'NEWS';
  const description = (article.content || '').replace(/\s+/g, ' ').trim().slice(0, 120) || title;

  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  const proto = h.get('x-forwarded-proto') ?? 'https';
  const envSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  const fallbackSiteUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';
  const baseUrl = envSiteUrl || (host ? `${proto}://${host}` : fallbackSiteUrl);

  const url = new URL(`/${encodeURIComponent(clubId)}/news/${encodeURIComponent(newsId)}`, baseUrl).toString();
  const ogImage = article.imageUrl
    ? toCloudinaryPadded16x9(article.imageUrl, 1200)
    : new URL('/OGP.png?v=20260122', baseUrl).toString();

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url,
      siteName: 'FootChron',
      images: [{ url: ogImage, width: 1200, height: 630 }],
      type: 'article',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImage],
    },
  };
}

export default async function NewsArticlePage({ params }: { params: { clubId: string, newsId: string } }) {
  const article = await getArticle(params.clubId, params.newsId);

  if (!article) {
    notFound();
  }

  const publishedDate = article.publishedAt?.toDate ? article.publishedAt.toDate() : null;
  const otherNews = await getOtherNews(params.clubId, params.newsId, 3);

  return (
    <div className="bg-gray-900 text-white min-h-screen">
      <div className="container mx-auto px-4 py-8 max-w-3xl">
        <div className="mb-4">
          <Link href={`/${params.clubId}/news`} className="text-sm text-gray-300 hover:underline">
            ← NEWS一覧へ戻る
          </Link>
        </div>

        {article.imageUrl && (
          <div className="relative w-full aspect-video bg-gray-800 rounded-lg overflow-hidden mb-6">
            <Image
              src={toCloudinaryPadded16x9(article.imageUrl, 1600)}
              alt={article.title}
              fill
              className="object-contain"
              priority
            />
          </div>
        )}

        <h1 className="text-3xl sm:text-4xl font-bold mb-3">{article.title}</h1>

        <div className="flex items-center justify-between gap-3 flex-wrap text-sm text-gray-300 mb-6">
          <div>
            {publishedDate ? format(publishedDate, 'yyyy年M月d日 HH:mm', { locale: ja }) : ''}
          </div>
          <NewsActions
            clubId={params.clubId}
            newsId={params.newsId}
            title={article.title}
            initialLikeCount={typeof article.likeCount === 'number' ? article.likeCount : 0}
          />
        </div>

        {article.noteUrl && (
          <div className="mb-6">
            <Link
              href={article.noteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-gray-300 hover:underline"
            >
              記事リンクを開く
            </Link>
          </div>
        )}

        <hr className="border-gray-700 my-8" />
        <div className="whitespace-pre-wrap text-lg">{article.content}</div>

        {otherNews.length > 0 && (
          <div className="mt-10">
            <div className="flex items-center border-b border-gray-700 pb-2 mb-6">
              <h2 className="text-xl font-bold">OTHER NEWS</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {otherNews.map((n) => (
                <OtherNewsCard key={n.id} article={n} clubId={params.clubId} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
