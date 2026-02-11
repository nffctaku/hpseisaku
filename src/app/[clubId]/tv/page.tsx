import { db } from "@/lib/firebase/admin";
import { notFound } from 'next/navigation';
import { Timestamp } from 'firebase-admin/firestore';
import PaginationControls from '@/components/pagination-controls';
import { ClubHeader } from '@/components/club-header';
import { ClubFooter } from '@/components/club-footer';
import { PartnerStripClient } from "@/components/partner-strip-client";

const VIDEOS_PER_PAGE = 9;

interface TvPageProps {
  params: { clubId: string };
  searchParams: { [key: string]: string | string[] | undefined };
}

interface Video {
  id: string;
  title: string;
  youtubeVideoId: string;
  description?: string;
  publishedAt: Timestamp;
}

async function getPaginatedVideos(ownerUid: string, page: number) {
  const videosCollectionRef = db.collection(`clubs/${ownerUid}/videos`);

  const totalSnapshot = await videosCollectionRef.count().get();
  const totalVideos = totalSnapshot.data().count;

  let videosQuery = videosCollectionRef.orderBy('publishedAt', 'desc').limit(VIDEOS_PER_PAGE);

  if (page > 1) {
    const offset = (page - 1) * VIDEOS_PER_PAGE;
    const previousDocsSnapshot = await videosCollectionRef.orderBy('publishedAt', 'desc').limit(offset).get();
    const lastVisible = previousDocsSnapshot.docs[previousDocsSnapshot.docs.length - 1];
    if (lastVisible) {
        videosQuery = videosQuery.startAfter(lastVisible);
    }
  }

  const snapshot = await videosQuery.get();
  const videos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Video[];

  return { videos, totalVideos };
}

async function getClubInfo(clubId: string) {
  const profilesQuery = db.collection('club_profiles').where('clubId', '==', clubId).limit(1);
  const profilesSnap = await profilesQuery.get();

  if (!profilesSnap.empty) {
    const doc = profilesSnap.docs[0];
    return { ...(doc.data() as any), ownerUid: (doc.data() as any)?.ownerUid || doc.id };
  }

  // fallback: allow accessing by direct doc id (ownerUid) or by ownerUid field
  const direct = await db.collection('club_profiles').doc(clubId).get();
  if (direct.exists) {
    const data = direct.data() as any;
    return { ...data, ownerUid: data?.ownerUid || direct.id };
  }

  const ownerSnap = await db.collection('club_profiles').where('ownerUid', '==', clubId).limit(1).get();
  if (!ownerSnap.empty) {
    const doc = ownerSnap.docs[0];
    return { ...(doc.data() as any), ownerUid: (doc.data() as any)?.ownerUid || doc.id };
  }

  return null;
}

export default async function TvPage({ params: { clubId }, searchParams }: TvPageProps) {
  const page = typeof searchParams.page === 'string' ? Number(searchParams.page) : 1;

  if (clubId === 'admin') {
    notFound();
  }

  const clubInfo = await getClubInfo(clubId);

  if (!clubInfo || !clubInfo.ownerUid) {
    notFound();
  }

  const { videos, totalVideos } = await getPaginatedVideos(clubInfo.ownerUid, page);
  const totalPages = Math.ceil(totalVideos / VIDEOS_PER_PAGE);

  const clubName = (clubInfo.clubName as string | undefined) ?? "";
  const logoUrl = (clubInfo.logoUrl as string | undefined) ?? undefined;
  const snsLinks = ((clubInfo as any).snsLinks as any) ?? {};
  const sponsors = (Array.isArray((clubInfo as any).sponsors) ? ((clubInfo as any).sponsors as any[]) : []) as any;
  const legalPages = (Array.isArray((clubInfo as any).legalPages) ? ((clubInfo as any).legalPages as any[]) : []) as any;
  const homeBgColor = (clubInfo as any).homeBgColor as string | undefined;
  const gameTeamUsage = Boolean((clubInfo as any).gameTeamUsage);

  return (
    <main className="min-h-screen flex flex-col bg-white">
      <ClubHeader clubId={clubId} clubName={clubName} logoUrl={logoUrl} snsLinks={snsLinks} headerBackgroundColor={homeBgColor} />
      <div className="flex-1">
        <div className="container mx-auto py-6 sm:py-8 px-4">
        <h1 className="text-2xl sm:text-3xl font-bold mb-6 sm:mb-8 text-center sm:text-left">TV</h1>
        {videos.length > 0 ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {videos.map(video => (
                <div key={video.id} className="bg-white text-gray-900 rounded-lg overflow-hidden border">
                  <div className="aspect-video">
                    <iframe
                      width="100%"
                      height="100%"
                      src={`https://www.youtube.com/embed/${video.youtubeVideoId}`}
                      title={video.title}
                      frameBorder="0"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    ></iframe>
                  </div>
                  <div className="p-4">
                    <h2 className="text-lg font-semibold mb-2">{video.title}</h2>
                    <p className="text-sm text-muted-foreground mb-4">
                      公開日: {video.publishedAt.toDate().toLocaleDateString('ja-JP')}
                    </p>
                    {video.description && <p className="text-sm">{video.description}</p>}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-8">
              <PaginationControls
                currentPage={page}
                totalPages={totalPages}
                basePath={`/${clubId}/tv`}
              />
            </div>
          </>
        ) : (
          <div className="text-center py-20">
            <p className="text-muted-foreground">投稿された動画はありません。</p>
          </div>
        )}
        </div>
      </div>

      <PartnerStripClient clubId={clubId} />
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
