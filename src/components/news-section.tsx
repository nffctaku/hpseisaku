import Image from "next/image";
import Link from "next/link";
import { format } from 'date-fns';
import { CalendarDays } from "lucide-react";
import { NewsArticle } from '@/types/news';

function toCloudinaryPadded16x9(url: string, width: number, quality: string = 'q_auto') {
  if (!url) return url;
  // Works for standard Cloudinary delivery URLs.
  // Example: https://res.cloudinary.com/<cloud>/image/upload/<publicId>
  if (!url.includes('/image/upload/')) return url;
  return url.replace(
    '/image/upload/',
    `/image/upload/c_fill,ar_16:9,w_${width},f_auto,${quality}/`
  );
}

interface NewsSectionProps {
  news: NewsArticle[];
  clubId?: string;
  fallbackLogoUrl?: string | null;
  colorTheme?: 'dark' | 'light';
}

type DisplayNewsItem = Omit<Pick<NewsArticle, 'id' | 'title' | 'content' | 'noteUrl' | 'imageUrl' | 'category' | 'publishedAt'>, 'publishedAt'> & {
  publishedAt: NewsArticle['publishedAt'] | Date;
  isFallback?: boolean;
};

type SerializedTimestamp = {
  toDate?: () => Date;
  _seconds?: number;
  seconds?: number;
};

function resolvePublishedDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'string') return new Date(value);
  if (typeof value === 'object') {
    const timestamp = value as SerializedTimestamp;
    if (typeof timestamp.toDate === 'function') return timestamp.toDate();
    if (typeof timestamp._seconds === 'number') return new Date(timestamp._seconds * 1000);
    if (typeof timestamp.seconds === 'number') return new Date(timestamp.seconds * 1000);
  }
  return null;
}

export function NewsSection({ news, clubId, fallbackLogoUrl, colorTheme = 'dark' }: NewsSectionProps) {
  const isDark = colorTheme === 'dark';
  const realNews = Array.isArray(news) ? news : [];
  const fallbackCount = Math.max(0, 4 - realNews.length);
  const fallbackNews: DisplayNewsItem[] = Array.from({ length: fallbackCount }, (_, index) => ({
    id: `default-news-${index + 1}`,
    title: '情報更新',
    content: '情報が更新されるまでお待ちください。',
    category: 'お知らせ',
    imageUrl: fallbackLogoUrl || '/favicon.png',
    publishedAt: new Date(),
    isFallback: true,
  }));
  const displayNews: DisplayNewsItem[] = [...realNews, ...fallbackNews];

  return (
    <section className={`${isDark ? 'bg-[#050506] text-slate-100' : 'bg-white text-gray-900'} px-4 py-12 md:py-16`}>
      <div className="mx-auto w-full max-w-6xl">
        <div className="mb-10 text-center md:mb-12">
          <h2 className={`text-4xl font-black tracking-[0.04em] md:text-5xl ${isDark ? 'text-white' : 'text-black'}`}>
            NEWS
          </h2>
          <div className={`mt-2 flex items-center justify-center gap-3 text-sm font-bold ${isDark ? 'text-slate-500' : 'text-black'}`}>
            <span className={`h-px w-8 ${isDark ? 'bg-white/10' : 'bg-black/70'}`} />
            <span>新着情報</span>
            <span className={`h-px w-8 ${isDark ? 'bg-white/10' : 'bg-black/70'}`} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-3 gap-y-10 md:grid-cols-4 md:gap-x-7 md:gap-y-12">
          {displayNews.map((item) => {
            const noteUrl = item.noteUrl;
            const href = noteUrl && noteUrl !== ''
              ? noteUrl
              : clubId
                ? `/${clubId}/news/${item.id}`
                : `/news/${item.id}`;
            const publishedDate = resolvePublishedDate(item.publishedAt);
            const category = item.category || 'お知らせ';
            const isFallback = item.isFallback === true;

            return (
              <Link
                key={item.id}
                href={isFallback ? '#' : href}
                target={!isFallback && noteUrl && noteUrl !== '' ? "_blank" : undefined}
                rel={!isFallback && noteUrl && noteUrl !== '' ? "noopener noreferrer" : undefined}
                aria-disabled={isFallback ? true : undefined}
                className={`group block min-w-0 rounded-xl border p-0 overflow-hidden shadow-sm ${isDark ? 'border-white/10 bg-[#101116]' : 'border-slate-100 bg-white'} ${isFallback ? 'pointer-events-none' : ''}`}
              >
                <div className={`relative aspect-[16/9] overflow-hidden rounded-t-xl ring-1 ${isDark ? 'bg-[#17181d] ring-white/10' : 'bg-white ring-slate-100'}`}>
                  <Image
                    src={isFallback ? (item.imageUrl || "/favicon.png") : toCloudinaryPadded16x9(item.imageUrl || "/no-image.png", 1200, 'q_90')}
                    alt={item.imageUrl ? item.title : "No image available"}
                    fill
                    className={isFallback ? "object-contain p-8" : "object-cover transition-transform duration-300 group-hover:scale-105"}
                    sizes="(min-width: 768px) 25vw, 50vw"
                    quality={90}
                  />
                  <div className="absolute right-0 top-0 bg-[#bd8424] px-3 py-2 text-xs font-black text-white md:px-4">
                    {category}
                  </div>
                </div>

                <div className="p-3 md:p-4">
                  <h3 className={`text-[15px] font-black leading-[1.65] tracking-[-0.02em] line-clamp-4 md:text-base md:leading-[1.65] ${isDark ? 'text-white' : 'text-black'}`}>
                    {item.title}
                  </h3>

                  {item.content && (
                    <p className="mt-2 text-xs font-medium leading-6 text-slate-500 line-clamp-2 md:block">
                      {item.content.length > 30 ? `${item.content.slice(0, 30)}...` : item.content}
                    </p>
                  )}

                <div className="mt-4 flex flex-col gap-1.5 text-xs font-medium text-slate-500 md:flex-row md:flex-wrap md:items-center md:gap-x-3">
                  {publishedDate && (
                    <span className="inline-flex items-center gap-1.5">
                      <CalendarDays className="h-3.5 w-3.5" />
                      {format(publishedDate, 'yyyy.MM.dd')}
                    </span>
                  )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
