import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPublishedUpdate } from "@/lib/updates-server";
import { categoryClassName } from "@/lib/updates";
import { UpdateBody } from "@/components/update-body";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const item = await getPublishedUpdate(id).catch(() => null);
  if (!item) return { title: "お知らせ" };
  return {
    title: `${item.title} | 運営からのお知らせ`,
    description: item.description,
    openGraph: item.imageUrl ? { images: [item.imageUrl] } : undefined,
  };
}

export default async function UpdateDetailPage({ params }: Props) {
  const { id } = await params;
  const item = await getPublishedUpdate(id).catch(() => null);
  if (!item) notFound();

  return (
    <div className="min-h-screen bg-[#08111f] text-slate-100">
      <main className="mx-auto max-w-4xl px-6 py-12 sm:py-20">
        <div className="mb-12">
          <Link href="/updates" className="text-sm font-bold text-slate-400 transition-colors hover:text-white">
            ← お知らせ一覧に戻る
          </Link>
        </div>

        <div className="mb-10">
          <div className="flex flex-wrap items-center gap-4">
            <time className="font-mono text-sm text-sky-300/55">{item.date}</time>
            <span className={`inline-flex rounded-full px-4 py-1 text-sm font-black ${categoryClassName(item.category)}`}>
              {item.category}
            </span>
          </div>
          <h1 className="mt-6 text-3xl font-black leading-snug tracking-[-0.04em] text-white sm:text-5xl">
            {item.title}
          </h1>
        </div>

        {item.imageUrl ? (
          <div className="relative mb-10 aspect-[16/9] w-full overflow-hidden rounded-xl border border-slate-700 bg-slate-900">
            <Image
              src={item.imageUrl}
              alt={item.title}
              fill
              className="object-contain"
              sizes="(max-width: 896px) 100vw, 896px"
              priority
            />
          </div>
        ) : null}

        <UpdateBody body={item.body} />

        {item.linkUrl ? (
          <div className="mt-10">
            <a
              href={item.linkUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-emerald-400/60 bg-emerald-400/10 px-6 py-3 text-sm font-black text-emerald-300 transition-colors hover:bg-emerald-400/20"
            >
              {item.linkLabel || "関連リンクを開く"} →
            </a>
          </div>
        ) : null}
      </main>
    </div>
  );
}
