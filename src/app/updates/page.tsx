import Link from "next/link";
import { listPublishedUpdates } from "@/lib/updates-server";
import { categoryClassName, mergeUpdates } from "@/lib/updates";

export const dynamic = "force-dynamic";

const itemsPerPage = 5;

type UpdatesPageProps = {
  searchParams?: Promise<{ page?: string }>;
};

export default async function UpdatesPage({ searchParams }: UpdatesPageProps) {
  const published = await listPublishedUpdates().catch(() => []);
  const updates = mergeUpdates(published);

  const resolvedSearchParams = searchParams ? await searchParams : { page: undefined };
  const currentPage = Math.min(
    Math.max(Number(resolvedSearchParams?.page ?? "1") || 1, 1),
    Math.max(Math.ceil(updates.length / itemsPerPage), 1),
  );
  const totalPages = Math.max(Math.ceil(updates.length / itemsPerPage), 1);
  const visibleUpdates = updates.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  return (
    <div className="min-h-screen bg-[#08111f] text-slate-100">
      <main className="mx-auto max-w-5xl px-6 py-12 sm:py-20">
        <div className="mb-12">
          <Link href="/" className="text-sm font-bold text-slate-400 transition-colors hover:text-white">
            ← トップに戻る
          </Link>
        </div>

        <div className="mb-16">
          <p className="text-sm font-black tracking-[0.18em] text-emerald-400">NEWS</p>
          <h1 className="mt-4 text-4xl font-black tracking-[-0.06em] text-white sm:text-6xl">
            運営からのお知らせ
          </h1>
        </div>

        <div className="divide-y divide-slate-800/90 border-b border-slate-800/90">
          {visibleUpdates.map((update) => {
            const content = (
              <article className="grid gap-5 py-9 transition-colors sm:grid-cols-[140px_1fr] sm:gap-8 sm:py-11">
                <time className="font-mono text-sm text-sky-300/55">{update.date}</time>
                <div>
                  <div className="mb-5">
                    <span className={`inline-flex rounded-full px-4 py-1 text-sm font-black ${categoryClassName(update.category)}`}>
                      {update.category}
                    </span>
                  </div>
                  <h2 className="text-xl font-black leading-snug tracking-[-0.03em] text-white sm:text-2xl">
                    {update.title}
                  </h2>
                  <p className="mt-4 text-base font-medium leading-8 text-slate-400 sm:text-lg">
                    {update.description}
                  </p>
                </div>
              </article>
            );

            return update.legacy ? (
              <div key={update.id}>{content}</div>
            ) : (
              <Link key={update.id} href={`/updates/${update.id}`} className="block hover:bg-slate-900/30">
                {content}
              </Link>
            );
          })}
        </div>

        {totalPages > 1 ? (
          <nav className="mt-10 flex justify-center gap-3" aria-label="お知らせページ">
            {Array.from({ length: totalPages }, (_, index) => index + 1).map((page) => (
              <Link
                key={page}
                href={page === 1 ? "/updates" : `/updates?page=${page}`}
                className={`flex h-10 w-10 items-center justify-center rounded-full border text-sm font-black transition-colors ${
                  page === currentPage
                    ? "border-emerald-400 bg-emerald-400 text-[#08111f]"
                    : "border-slate-700 bg-slate-950/40 text-slate-300 hover:border-emerald-400 hover:text-white"
                }`}
              >
                {page}
              </Link>
            ))}
          </nav>
        ) : null}
      </main>
    </div>
  );
}
