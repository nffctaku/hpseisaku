import Image from "next/image";
import Link from "next/link";
import { format } from 'date-fns';
import { NewsArticle } from '@/types/news';

interface NewsSectionProps {
  news: NewsArticle[];
}

export function NewsSection({ news }: NewsSectionProps) {
  if (!news || news.length === 0) {
    return null; // Don't render the section if there's no news
  }

  return (
    <section className="py-8 md:py-12">
      <div className="container mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl md:text-3xl font-bold">NEWS</h2>
          <Link href="/news" className="text-sm text-primary hover:underline">
            すべてのニュースを見る
          </Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {news.map((item) => (
            <Link href={`/news/${item.id}`} key={item.id} className="bg-card rounded-lg overflow-hidden group block">
              <div className="relative w-full h-40 sm:h-48">
                {item.imageUrl ? (
                  <Image
                    src={item.imageUrl}
                    alt={item.title}
                    fill
                    className="object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                ) : (
                  <Image
                    src="/no-image.png"
                    alt="No image available"
                    fill
                    className="object-cover"
                  />
                )}
                 <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                 <div className="absolute bottom-0 left-0 p-4">
                    <p className="text-gray-300 text-xs">{format(item.publishedAt.toDate(), 'yyyy/MM/dd')}</p>
                    <h3 className="text-white text-base md:text-lg font-semibold leading-tight group-hover:text-primary transition-colors">{item.title}</h3>
                 </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
