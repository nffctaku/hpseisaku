import Image from "next/image";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";

import { NewsArticle } from '@/types/news';

interface HeroProps {
  news: NewsArticle[];
}

export function Hero({ news }: HeroProps) {

  if (!news || news.length === 0) {
    return (
      <div className="relative h-[60vh] w-full bg-gray-800 flex items-center justify-center">
        <p className="text-white text-2xl">ニュースがありません</p>
      </div>
    );
  }

  return (
    <Carousel className="w-full">
      <CarouselContent>
        {news.map((item, index) => (
          <CarouselItem key={item.id}>
            <div className="relative h-[50vh] md:h-[60vh] w-full">
              {item.imageUrl ? (
                <Image
                  src={item.imageUrl}
                  alt={item.title}
                  fill
                  className="object-cover object-[center_top]"
                  priority={index === 0}
                />
              ) : (
                <div className="w-full h-full bg-gray-700" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/40 to-transparent flex items-end p-4 md:p-8 lg:p-12">
                <div className="text-white">
                  <p className="text-sm text-gray-300">ニュース</p>
                  <h2 className="text-2xl md:text-4xl lg:text-5xl font-bold mt-2 leading-tight">{item.title}</h2>
                  <p className="mt-4 text-sm font-semibold tracking-wider">CONTINUE READING →</p>
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
