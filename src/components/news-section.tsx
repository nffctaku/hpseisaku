import Image from "next/image";
import Link from "next/link";
import { format } from 'date-fns';
import { NewsArticle } from '@/types/news';

function toCloudinaryPadded16x9(url: string, width: number) {
  if (!url) return url;
  // Works for standard Cloudinary delivery URLs.
  // Example: https://res.cloudinary.com/<cloud>/image/upload/<publicId>
  if (!url.includes('/image/upload/')) return url;
  return url.replace(
    '/image/upload/',
    `/image/upload/c_pad,ar_16:9,w_${width},b_auto,f_auto,q_auto/`
  );
}

interface NewsSectionProps {
  news: NewsArticle[];
  clubId?: string;
}

function resolvePublishedDate(value: any): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'string') return new Date(value);
  if (typeof value.toDate === 'function') return value.toDate();
  if (typeof value._seconds === 'number') return new Date(value._seconds * 1000);
  if (typeof value.seconds === 'number') return new Date(value.seconds * 1000);
  return null;
}

export function NewsSection({ news, clubId }: NewsSectionProps) {
  if (!news || news.length === 0) {
    return null; // Don't render the section if there's no news
  }

  return (
    <section className="py-0 md:py-6 -mx-4 md:mx-0">
      <div className="w-full">
        <div className="space-y-0">
          {news.map((item) => (
            <Link
              key={item.id}
              href={(item as any).noteUrl && (item as any).noteUrl !== ''
                ? (item as any).noteUrl
                : clubId
                  ? `/${clubId}/news/${item.id}`
                  : `/news/${item.id}`}
              target={(item as any).noteUrl && (item as any).noteUrl !== '' ? "_blank" : undefined}
              rel={(item as any).noteUrl && (item as any).noteUrl !== '' ? "noopener noreferrer" : undefined}
              className="flex gap-4 md:gap-5 p-3 bg-white shadow-sm hover:shadow-md transition-shadow rounded-none md:rounded-none md:first:rounded-t-lg md:last:rounded-b-lg w-full"
            >
              <div className="relative w-32 md:w-40 flex-shrink-0 aspect-video bg-muted">
                <Image
                  src={toCloudinaryPadded16x9(item.imageUrl || "/no-image.png", 640)}
                  alt={item.imageUrl ? item.title : "No image available"}
                  fill
                  className="object-contain"
                />
              </div>
              <div className="flex flex-col justify-center gap-1.5 min-w-0">
                <p className="text-xs md:text-sm text-muted-foreground">
                  {(() => {
                    const d = resolvePublishedDate((item as any).publishedAt);
                    return d ? format(d, 'yyyy/MM/dd') : '';
                  })()}
                </p>
                <h3 className="text-base md:text-lg font-semibold leading-snug line-clamp-2">
                  {item.title}
                </h3>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
