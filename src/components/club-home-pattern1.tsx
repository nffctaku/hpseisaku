"use client";

import Image from "next/image";
import Link from "next/link";
import { NewsArticle } from "@/types/news";
import { MatchDetails } from "@/types/match";
import { format } from "date-fns";

interface Video {
  id: string;
  title: string;
  youtubeVideoId: string;
  publishedAt: string;
}

interface ClubHomePattern1Props {
  clubName: string;
  news: NewsArticle[];
  videos: Video[];
  nextMatch: MatchDetails | null;
  recentMatches: MatchDetails[];
  upcomingMatches: MatchDetails[];
}

function resolvePublishedDate(value: any): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "string") return new Date(value);
  if (typeof value.toDate === "function") return value.toDate();
  if (typeof value.seconds === "number") return new Date(value.seconds * 1000);
  return null;
}

function NewsGrid({ news }: { news: NewsArticle[] }) {
  const items = news.slice(0, 6);
  if (items.length === 0) return null;

  return (
    <section className="py-8">
      <div className="container mx-auto px-4">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl md:text-2xl font-bold">NEWS</h2>
          <Link href="/news" className="text-sm text-primary hover:underline">
            MORE NEWS
          </Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
          {items.map((item, index) => (
            <Link
              key={item.id}
              href={`/news/${item.id}`}
              className={`bg-card rounded-lg overflow-hidden shadow-sm group flex flex-col ${
                index === 0 ? "sm:col-span-2 lg:col-span-2 lg:row-span-2" : ""
              }`}
            >
              <div className="relative w-full h-40 sm:h-48 lg:h-64">
                <Image
                  src={item.imageUrl || "/no-image.png"}
                  alt={item.title}
                  fill
                  className="object-cover group-hover:scale-105 transition-transform duration-300"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                <div className="absolute bottom-0 left-0 p-4">
                  <p className="text-xs text-gray-300">
                    {(() => {
                      const d = resolvePublishedDate((item as any).publishedAt);
                      return d ? format(d, "yyyy/MM/dd") : "";
                    })()}
                  </p>
                  <h3 className="text-white text-base md:text-lg font-semibold leading-tight line-clamp-2 group-hover:text-primary">
                    {item.title}
                  </h3>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

function VideosRow({ videos }: { videos: Video[] }) {
  const items = videos.slice(0, 5);
  if (items.length === 0) return null;

  return (
    <section className="py-6 bg-muted/40">
      <div className="container mx-auto px-4">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl md:text-2xl font-bold">LATEST VIDEOS</h2>
          <Link href="/tv" className="text-sm text-primary hover:underline">
            FIND MORE VIDEOS
          </Link>
        </div>
        <div className="flex gap-4 overflow-x-auto pb-2">
          {items.map((video) => (
            <Link
              key={video.id}
              href={`/tv/${video.id}`}
              className="flex-shrink-0 w-56 bg-card rounded-lg overflow-hidden shadow-sm group"
            >
              <div className="relative w-full h-32">
                <Image
                  src={`https://i.ytimg.com/vi/${video.youtubeVideoId}/mqdefault.jpg`}
                  alt={video.title}
                  fill
                  className="object-cover group-hover:scale-105 transition-transform duration-300"
                />
                <div className="absolute inset-0 bg-black/20" />
                <div className="absolute bottom-1 left-1 bg-red-600 text-white text-[10px] px-2 py-1 rounded flex items-center gap-1">
                  <span>▶</span>
                  <span>VIDEO</span>
                </div>
              </div>
              <div className="p-3 space-y-1">
                <h3 className="text-sm font-semibold leading-tight line-clamp-2 group-hover:text-primary">
                  {video.title}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {new Date(video.publishedAt).toLocaleDateString()}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

function NextMatchHero({ match }: { match: MatchDetails | null }) {
  if (!match) return null;

  const matchDate = new Date(match.matchDate);

  return (
    <section className="relative py-12 md:py-16 bg-[url('/stadium-placeholder.jpg')] bg-cover bg-center">
      <div className="absolute inset-0 bg-black/60" />
      <div className="relative container mx-auto px-4 text-center text-white space-y-3 md:space-y-4">
        <p className="text-sm md:text-base font-medium opacity-80">{match.competitionName}</p>
        <p className="text-xs md:text-sm opacity-80">
          {format(matchDate, "yyyy/MM/dd")} {match.matchTime ?? ""}
        </p>
        <div className="flex items-center justify-center gap-6 md:gap-10">
          <TeamMini logo={match.homeTeamLogo} name={match.homeTeamName} />
          <span className="text-2xl md:text-3xl font-bold">VS</span>
          <TeamMini logo={match.awayTeamLogo} name={match.awayTeamName} />
        </div>
      </div>
    </section>
  );
}

function TeamMini({ logo, name }: { logo?: string; name: string }) {
  return (
    <div className="flex flex-col items-center gap-2">
      {logo ? (
        <Image
          src={logo}
          alt={name}
          width={56}
          height={56}
          className="w-12 h-12 md:w-14 md:h-14 rounded-full object-contain bg-white"
        />
      ) : (
        <div className="w-12 h-12 md:w-14 md:h-14 rounded-full bg-white/20 flex items-center justify-center text-lg font-bold">
          {name.charAt(0)}
        </div>
      )}
      <span className="text-xs md:text-sm font-semibold max-w-[120px] truncate">{name}</span>
    </div>
  );
}

function MatchesStrip({ recentMatches, upcomingMatches }: { recentMatches: MatchDetails[]; upcomingMatches: MatchDetails[] }) {
  const past = [...recentMatches];
  const upcoming = [...upcomingMatches];
  const cards = [...past, ...upcoming].slice(0, 10);
  if (cards.length === 0) return null;

  return (
    <section className="py-10">
      <div className="container mx-auto px-4">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl md:text-2xl font-bold">MATCHES</h2>
          <Link href="/results" className="text-sm text-primary hover:underline">
            ALL MATCHES
          </Link>
        </div>
        <div className="flex gap-4 overflow-x-auto pb-2">
          {cards.map((match) => (
            <div
              key={match.id}
              className="flex-shrink-0 w-64 bg-card rounded-lg shadow-sm p-4 flex flex-col justify-between"
            >
              <div className="space-y-1 text-xs text-muted-foreground">
                <p className="font-semibold text-primary text-[11px] uppercase tracking-wide">
                  {match.competitionName}
                </p>
                <p>{format(new Date(match.matchDate), "yyyy/MM/dd HH:mm")}</p>
              </div>
              <div className="flex items-center justify-between my-4">
                <TeamMini logo={match.homeTeamLogo} name={match.homeTeamName} />
                <div className="text-center px-2">
                  {typeof match.scoreHome === "number" && typeof match.scoreAway === "number" ? (
                    <p className="text-2xl font-bold">
                      {match.scoreHome} - {match.scoreAway}
                    </p>
                  ) : (
                    <p className="text-lg font-semibold">{match.matchTime ?? "KICK OFF"}</p>
                  )}
                </div>
                <TeamMini logo={match.awayTeamLogo} name={match.awayTeamName} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function ClubHomePattern1({
  clubName,
  news,
  videos,
  nextMatch,
  recentMatches,
  upcomingMatches,
}: ClubHomePattern1Props) {
  const hasNews = news && news.length > 0;
  const hasVideos = videos && videos.length > 0;
  const hasNextMatch = !!nextMatch;
  const hasMatches = (recentMatches && recentMatches.length > 0) || (upcomingMatches && upcomingMatches.length > 0);

  return (
    <main className="bg-background text-foreground">
      <NewsGrid news={news} />
      <VideosRow videos={videos} />
      <NextMatchHero match={nextMatch} />
      <MatchesStrip recentMatches={recentMatches} upcomingMatches={upcomingMatches} />

      {!hasNews && !hasVideos && !hasNextMatch && !hasMatches && (
        <section className="py-16">
          <div className="container mx-auto px-4 text-center text-muted-foreground">
            <p>まだ表示できるコンテンツがありません。管理画面からニュース・動画・試合結果を登録するとここに表示されます。</p>
          </div>
        </section>
      )}
    </main>
  );
}
