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

  // 軽量化のため、ニュースだけ少数取得（試合やリーグ表は別APIに任せる）
  const newsQuery = db.collection(`clubs/${ownerUid}/news`).orderBy('publishedAt', 'desc').limit(3);
  const newsSnap = await newsQuery.get();
  const news = newsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as NewsArticle));

  return {
    profile: profileData,
    data: clubData,
    latestResult: null,
    nextMatch: null,
    recentMatches: [],
    upcomingMatches: [],
    news,
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
