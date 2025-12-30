import { NextResponse, NextRequest } from 'next/server';
import { db } from '@/lib/firebase/admin';
import { getMatchDataForClub } from '@/lib/matches';
import { NewsArticle } from '@/types/news';

async function getClubData(clubId: string) {
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

  // メインチームの情報を取得して、表示用のクラブ名・ロゴに反映
  const mainTeamId = (profileData as any)?.mainTeamId;
  let mainTeamData: any = null;
  if (mainTeamId) {
    const mainTeamRef = db.collection(`clubs/${ownerUid}/teams`).doc(mainTeamId);
    const mainTeamSnap = await mainTeamRef.get();
    if (mainTeamSnap.exists) {
      mainTeamData = mainTeamSnap.data();
    }
  }

  const resolvedProfile = {
    ...profileData,
    clubName: (mainTeamData as any)?.name || (profileData as any).clubName,
    logoUrl: (mainTeamData as any)?.logoUrl || (profileData as any).logoUrl,
  } as any;
  const heroLimitRaw = (clubData as any)?.heroNewsLimit;
  const heroLimit = typeof heroLimitRaw === 'number' && heroLimitRaw >= 1 && heroLimitRaw <= 5 ? heroLimitRaw : 3;

  const { latestResult, nextMatch, recentMatches, upcomingMatches } = await getMatchDataForClub(ownerUid);

  const baseLimit = Math.max(heroLimit * 3, 5);
  const newsQuery = db.collection(`clubs/${ownerUid}/news`).orderBy('publishedAt', 'desc').limit(baseLimit);
  const newsSnap = await newsQuery.get();
  const allNews = newsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));

  // スライド用: featuredInHero を優先して heroLimit 件に絞る
  const prioritized = allNews.slice().sort((a, b) => {
    const af = a?.featuredInHero ? 1 : 0;
    const bf = b?.featuredInHero ? 1 : 0;
    return bf - af;
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

  const videosQuery = db.collection(`clubs/${ownerUid}/videos`).orderBy('publishedAt', 'desc').limit(4);
  const videosSnap = await videosQuery.get();
  const videos = videosSnap.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id,
      title: data.title,
      youtubeVideoId: data.youtubeVideoId,
      publishedAt: (data.publishedAt.toDate()).toISOString(),
    };
  });

  const competitionsQuery = db.collection(`clubs/${ownerUid}/competitions`);
  const competitionsSnap = await competitionsQuery.get();
  const competitions = competitionsSnap.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id,
      ownerUid: ownerUid,
      name: data.name || 'Unnamed Competition',
      ...data
    };
  });

  return {
    profile: resolvedProfile,
    data: clubData,
    latestResult,
    nextMatch,
    recentMatches,
    upcomingMatches,
    news: latestNews,
    heroNews,
    videos,
    competitions: Array.isArray(competitions) ? competitions : [competitions].filter(Boolean),
  };
}

export async function GET(request: NextRequest, context: { params: Promise<{ clubId: string }> }) {
  try {
    const { clubId } = await context.params;
    const clubData = await getClubData(clubId);
    return NextResponse.json(clubData);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    if (errorMessage === 'Club not found' || errorMessage === 'Club owner UID not found') {
      return new NextResponse(errorMessage, { status: 404 });
    }
    console.error('API Error:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
