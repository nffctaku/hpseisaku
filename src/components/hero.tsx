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
      <CarouselContent>
        {items.map((item, index) => (
          <CarouselItem key={item.id}>
            <div className="relative w-full aspect-video bg-muted">
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
              <div className="absolute left-0 right-0 bottom-0 h-44 md:h-52 bg-gradient-to-t from-black/70 via-black/30 to-transparent md:from-black/45 md:via-black/20 flex items-end p-4 md:p-8 lg:p-12">
                <div className="text-white">
                  <p className="text-sm text-gray-300">ニュース</p>
                  <h2 className="mt-2 text-xl md:text-4xl lg:text-5xl font-bold leading-tight line-clamp-2 md:line-clamp-3">{item.title}</h2>
                  <p className="mt-3 text-sm font-semibold tracking-wider">CONTINUE READING →</p>
                </div>
              </div>
            </div>
          </CarouselItem>
        ))}
      </CarouselContent>
      <CarouselPrevious className="absolute left-4 top-1/2 -translate-y-1/2 z-10 bg-black/50 text-white border-none hover:bg-black/70" />
      <CarouselNext className="absolute right-4 top-1/2 -translate-y-1/2 z-10 bg-black/50 text-white border-none hover:bg-black/70" />
    </Carousel>
  );
}
