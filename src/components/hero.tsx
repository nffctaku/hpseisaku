import { useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { NewsArticle } from '@/types/news';
import { formatDistanceToNow } from 'date-fns';
import { ja } from 'date-fns/locale';

function toCloudinaryPadded16x9(url: string, width: number) {
  if (!url) return url;
  if (!url.includes('/image/upload/')) return url;
  return url.replace(
    '/image/upload/',
    `/image/upload/c_fill,ar_16:9,w_${width},f_auto,q_90/`
  );
}

interface HeroProps {
  news: NewsArticle[];
  maxSlides?: number;
  isLoading?: boolean;
}

function resolvePublishedDate(input: any): Date | null {
  if (!input) return null;
  if (input instanceof Date) return input;
  if (typeof input?.toDate === 'function') {
    try {
      const d = input.toDate();
      return d instanceof Date ? d : null;
    } catch {
      return null;
    }
  }
  const t = Date.parse(String(input));
  return Number.isFinite(t) ? new Date(t) : null;
}

export function Hero({ news, maxSlides, isLoading }: HeroProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  if (isLoading) {
    return (
      <div className="relative h-[50vh] w-full bg-gray-800 flex flex-col items-center justify-center gap-4">
        <Image
          src="/favicon.png"
          alt="Loading"
          width={64}
          height={64}
          className="opacity-90 animate-pulse"
          priority
        />
        <p className="text-white text-sm">読み込み中</p>
      </div>
    );
  }

  if (!news || news.length === 0) {
    return null;
  }

  const limit = maxSlides ?? 3;
  const featuredOnly = (news || []).filter((a: any) => a?.featuredInHero === true);
  const sorted = featuredOnly.slice().sort((a: any, b: any) => {
    const ad = a?.publishedAt instanceof Date ? a.publishedAt.getTime() :
                a?.publishedAt?.toDate?.() ? a.publishedAt.toDate().getTime() : 0;
    const bd = b?.publishedAt instanceof Date ? b.publishedAt.getTime() :
                b?.publishedAt?.toDate?.() ? b.publishedAt.toDate().getTime() : 0;
    return bd - ad;
  });
  const items = sorted.slice(0, limit);

  const handlePrev = () => {
    setCurrentIndex((prev) => (prev === 0 ? items.length - 1 : prev - 1));
  };

  const handleNext = () => {
    setCurrentIndex((prev) => (prev === items.length - 1 ? 0 : prev + 1));
  };

  const handleDotClick = (index: number) => {
    setCurrentIndex(index);
  };

  const currentArticle = items[currentIndex];

  if (!currentArticle) return null;

  const publishedDate = resolvePublishedDate((currentArticle as any).publishedAt);
  const relativeTime = publishedDate ? formatDistanceToNow(publishedDate, { addSuffix: true, locale: ja }) : '';

  return (
    <div className="relative w-full aspect-[9/11] sm:aspect-[16/7] overflow-hidden rounded-2xl">
      {/* 背景画像 */}
      {currentArticle.imageUrl ? (
        <Image
          src={toCloudinaryPadded16x9(currentArticle.imageUrl, 1600)}
          alt={currentArticle.title}
          fill
          sizes="100vw"
          className="object-cover"
          priority
        />
      ) : (
        <div className="w-full h-full bg-gray-700" />
      )}

      {/* 上から下へのグラデーションオーバーレイ（テキスト視認性確保） */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />

      {/* 左右ナビゲーション矢印 */}
      <button
        type="button"
        onClick={handlePrev}
        aria-label="前の記事"
        className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/60 transition"
      >
        <ChevronLeft className="w-5 h-5" />
      </button>
      <button
        type="button"
        onClick={handleNext}
        aria-label="次の記事"
        className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/60 transition"
      >
        <ChevronRight className="w-5 h-5" />
      </button>

      {/* 下部テキストエリア */}
      <div className="absolute bottom-0 left-0 right-0 p-5 sm:p-6">
        {/* カテゴリバッジ */}
        <span className="inline-block rounded-full bg-violet-600/90 px-3 py-1 text-xs font-semibold text-white mb-3">
          {(currentArticle as any).category || 'お知らせ'}
        </span>

        {/* 見出し */}
        <h2 className="text-xl sm:text-2xl font-bold text-white leading-snug mb-1 line-clamp-2">
          {currentArticle.title}
        </h2>

        {/* 経過時間 */}
        <p className="text-sm text-slate-300">{relativeTime}</p>

        {/* ページネーションドット */}
        <div className="mt-4 flex items-center gap-1.5">
          {items.map((_, index) => (
            <button
              key={index}
              type="button"
              onClick={() => handleDotClick(index)}
              aria-label={`スライド ${index + 1}`}
              className={
                index === currentIndex
                  ? "h-1.5 w-5 rounded-full bg-red-500 transition-all"
                  : "h-1.5 w-1.5 rounded-full bg-white/50 transition-all hover:bg-white/70"
              }
            />
          ))}
        </div>
      </div>
    </div>
  );
}
