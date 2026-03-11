import Image from "next/image";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";

import { NewsArticle } from '@/types/news';

function toCloudinaryPadded16x9(url: string, width: number) {
  if (!url) return url;
  if (!url.includes('/image/upload/')) return url;
  return url.replace(
    '/image/upload/',
    `/image/upload/c_pad,ar_16:9,w_${width},b_auto,f_auto,q_auto/`
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

function formatRelativeDays(d: Date | null): string {
  if (!d) return '';
  const ms = Date.now() - d.getTime();
  if (!Number.isFinite(ms)) return '';
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  if (days <= 0) return '0d';
  return `${days}d`;
}

export function Hero({ news, maxSlides, isLoading }: HeroProps) {

  if (isLoading) {
    return (
      <div className="relative h-[60vh] w-full bg-gray-800 flex flex-col items-center justify-center gap-4">
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
    return (
      <div className="relative h-[60vh] w-full bg-gray-800 flex items-center justify-center">
        <p className="text-white text-2xl">ニュースがありません</p>
      </div>
    );
  }
  const limit = maxSlides ?? 3;
  const sorted = (news || []).slice().sort((a: any, b: any) => {
    const af = a?.featuredInHero ? 1 : 0;
    const bf = b?.featuredInHero ? 1 : 0;
    return bf - af; // featured を優先
  });
  const items = sorted.slice(0, limit);

  return (
    <Carousel className="w-full">
      <CarouselContent className="!-ml-0">
        {items.map((item, index) => (
          <CarouselItem key={item.id} className="!pl-0">
            <div className="relative w-full h-[70vh] bg-muted">
              {item.imageUrl ? (
                <Image
                  src={toCloudinaryPadded16x9(item.imageUrl, 1600)}
                  alt={item.title}
                  fill
                  className="object-cover"
                  priority={index === 0}
                />
              ) : (
                <div className="w-full h-full bg-gray-700" />
              )}
              <div className="absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
              <div className="absolute left-0 right-0 bottom-0 p-4">
                <div className="text-white">
                  <h2 className="text-2xl font-black leading-tight tracking-tight line-clamp-3">
                    {item.title}
                  </h2>
                  <div className="mt-3 text-xs text-white/80 flex items-center gap-3">
                    <span>{formatRelativeDays(resolvePublishedDate((item as any).publishedAt))}</span>
                    <span className="opacity-60">|</span>
                    <span>{String((item as any).category || 'news')}</span>
                  </div>
                </div>
              </div>
            </div>
          </CarouselItem>
        ))}
      </CarouselContent>
      <CarouselPrevious className="absolute left-3 top-1/2 -translate-y-1/2 z-10 bg-black/45 text-white border-none hover:bg-black/65" />
      <CarouselNext className="absolute right-3 top-1/2 -translate-y-1/2 z-10 bg-black/45 text-white border-none hover:bg-black/65" />
    </Carousel>
  );
}
