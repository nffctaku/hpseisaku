import { db } from "@/lib/firebase/admin";
import { notFound } from 'next/navigation';
import { Timestamp } from 'firebase-admin/firestore';
import PaginationControls from '@/components/pagination-controls';

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

  if (profilesSnap.empty) {
    return null;
  }

  return profilesSnap.docs[0].data();
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

  return (
    <div className="container mx-auto py-10 px-4">
      <h1 className="text-3xl font-bold mb-8 text-center">TV</h1>
      {videos.length > 0 ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {videos.map(video => (
              <div key={video.id} className="bg-card border rounded-lg overflow-hidden">
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
  );
}
