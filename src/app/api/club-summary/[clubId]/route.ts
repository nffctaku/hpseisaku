import { NextResponse, NextRequest } from 'next/server';
import { db } from '@/lib/firebase/admin';
import { NewsArticle } from '@/types/news';

async function getClubSummary(clubId: string) {
  const profilesQuery = db.collection('club_profiles').where('clubId', '==', clubId).limit(1);
  const profilesSnap = await profilesQuery.get();

  if (profilesSnap.empty) {
    throw new Error('Club not found');
  }

  const clubProfileDoc = profilesSnap.docs[0];
  const profileData = clubProfileDoc.data()!;
  const ownerUid = (profileData as any).ownerUid || clubProfileDoc.id;

  if (!ownerUid) {
    throw new Error('Club owner UID not found');
  }

  const clubDataRef = db.collection('clubs').doc(ownerUid);
  const clubDataSnap = await clubDataRef.get();
  const clubData = clubDataSnap.exists ? clubDataSnap.data() : { headerImageUrl: null };
  const heroLimitRaw = (clubData as any)?.heroNewsLimit;
  const heroLimit = typeof heroLimitRaw === 'number' && heroLimitRaw >= 1 && heroLimitRaw <= 5 ? heroLimitRaw : 3;

  // ニュースはスライド用と一覧用の両方に使うため、十分な件数を取得する
  const baseLimit = Math.max(heroLimit * 3, 5);
  const newsQuery = db.collection(`clubs/${ownerUid}/news`).orderBy('publishedAt', 'desc').limit(baseLimit);
  const newsSnap = await newsQuery.get();
  const allNews = newsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));

  // スライド用: featuredInHero を優先して heroLimit 件に絞る
  const prioritized = allNews.slice().sort((a, b) => {
    const af = a?.featuredInHero ? 1 : 0;
    const bf = b?.featuredInHero ? 1 : 0;
    return bf - af; // featured を優先
  });
  const heroNews = prioritized.slice(0, heroLimit) as NewsArticle[];

  // 一覧用: 常に最新順の上位 5 件を使用
  const latestNews = allNews
    .slice()
    .sort((a, b) => {
      const ad = (a as any).publishedAt?.toDate ? (a as any).publishedAt.toDate() : (a as any).publishedAt;
      const bd = (b as any).publishedAt?.toDate ? (b as any).publishedAt.toDate() : (b as any).publishedAt;
      const at = ad instanceof Date ? ad.getTime() : 0;
      const bt = bd instanceof Date ? bd.getTime() : 0;
      return bt - at;
    })
    .slice(0, 5) as NewsArticle[];

  return {
    profile: profileData,
    data: clubData,
    latestResult: null,
    nextMatch: null,
    recentMatches: [],
    upcomingMatches: [],
    news: latestNews,
    heroNews,
    videos: [],
    competitions: [],
  };
}

export async function GET(request: NextRequest, context: { params: { clubId: string } }) {
  try {
    const { clubId } = context.params;
    const clubSummary = await getClubSummary(clubId);
    return NextResponse.json(clubSummary);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    if (errorMessage === 'Club not found' || errorMessage === 'Club owner UID not found') {
      return new NextResponse(errorMessage, { status: 404 });
    }
    console.error('API Error (summary):', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
