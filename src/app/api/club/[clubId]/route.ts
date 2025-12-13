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
  const heroLimitRaw = (clubData as any)?.heroNewsLimit;
  const heroLimit = typeof heroLimitRaw === 'number' && heroLimitRaw >= 1 && heroLimitRaw <= 5 ? heroLimitRaw : 3;

  const { latestResult, nextMatch, recentMatches, upcomingMatches } = await getMatchDataForClub(ownerUid);

  const baseLimit = heroLimit * 3;
  const newsQuery = db.collection(`clubs/${ownerUid}/news`).orderBy('publishedAt', 'desc').limit(baseLimit);
  const newsSnap = await newsQuery.get();
  const allNews = newsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
  const prioritized = allNews.slice().sort((a, b) => {
    const af = a?.featuredInHero ? 1 : 0;
    const bf = b?.featuredInHero ? 1 : 0;
    return bf - af;
  });
  const news = prioritized.slice(0, heroLimit) as NewsArticle[];

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
    profile: profileData,
    data: clubData,
    latestResult,
    nextMatch,
    recentMatches,
    upcomingMatches,
    news,
    videos,
    competitions: Array.isArray(competitions) ? competitions : [competitions].filter(Boolean),
  };
}

export async function GET(request: NextRequest, context: { params: { clubId: string } }) {
  try {
    const { clubId } = context.params;
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
