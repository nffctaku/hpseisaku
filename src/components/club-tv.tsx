import Link from 'next/link';

interface Video {
  id: string;
  title: string;
  youtubeVideoId: string;
  publishedAt: string;
}

interface ClubTvProps {
  videos: Video[];
  clubId?: string;
}

export function ClubTv({ videos, clubId }: ClubTvProps) {
  const latestVideo = videos?.[0];
  const otherVideos = videos?.slice(1);

  if (!latestVideo) return null;

  return (
    <div className="bg-white p-4 md:p-6 rounded-lg shadow-sm">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl md:text-2xl font-bold">CLUB TV</h2>
        <Link href={clubId ? `/${clubId}/tv` : "/tv"} className="text-sm text-primary hover:underline">
          すべての動画を見る
        </Link>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2">
          <div className="aspect-video mb-2">
            <iframe 
              className="w-full h-full rounded-md"
              src={`https://www.youtube.com/embed/${latestVideo.youtubeVideoId}`}
              title={latestVideo.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            ></iframe>
          </div>
          <h3 className="font-bold text-lg">{latestVideo.title}</h3>
          <p className="text-sm text-muted-foreground">{new Date(latestVideo.publishedAt).toLocaleDateString()}</p>
        </div>
        <div className="md:col-span-1 md:space-y-3 md:overflow-y-auto md:max-h-[300px] flex md:flex-col gap-3 overflow-x-auto pb-2">
          {otherVideos.map(video => (
            <Link
              key={video.id}
              href={clubId ? `/${clubId}/tv` : "/tv"}
              className="flex md:items-center gap-3 group w-48 md:w-auto flex-shrink-0 md:flex-shrink-1"
            >
              <div className="w-24 h-14 flex-shrink-0">
                <img 
                  src={`https://i.ytimg.com/vi/${video.youtubeVideoId}/mqdefault.jpg`}
                  alt={video.title}
                  className="w-full h-full object-cover rounded-md transition-transform group-hover:scale-105"
                />
              </div>
              <div>
                <h4 className="text-sm font-semibold leading-tight line-clamp-2 group-hover:text-primary">{video.title}</h4>
                <p className="text-xs text-muted-foreground">{new Date(video.publishedAt).toLocaleDateString()}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
