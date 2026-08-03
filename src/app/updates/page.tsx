import Link from "next/link";

const updates = [
  {
    date: "2026.08.03",
    category: "改善",
    categoryClassName: "bg-blue-500/15 text-blue-300",
    title: "トップページのモバイル表示を改善",
    description: "UIを一新しました。",
    href: "",
  },
  {
    date: "2026.07.22",
    category: "改善",
    categoryClassName: "bg-blue-500/15 text-blue-300",
    title: "トップページUI改善",
    description: "モバイル用トップヒーロー画像を新しい画像に差し替え。2枚目と3枚目の画像を自動スライド形式に変更。「無料で始める」ボタンのデザイン変更（青色、横長化）。",
    href: "",
  },
  {
    date: "2026.07.21",
    category: "修正",
    categoryClassName: "bg-rose-500/15 text-rose-300",
    title: "公開ページの選手スタッツ集計の修正",
    description: "管理画面で入力した手動スタッツが公開ページで正しく反映されるよう修正。getPlayer.tsのマージロジックを改善。",
    href: "",
  },
  {
    date: "2026.07.20",
    category: "改善",
    categoryClassName: "bg-blue-500/15 text-blue-300",
    title: "管理画面UI一貫性改善",
    description: "クラブ情報設定ページの完全再設計。SNSリンクタブの再設計。友好試合管理ページの再設計。A3選手名鑑エディターの大幅改善。",
    href: "",
  },
  {
    date: "2026.07.28",
    category: "新機能",
    categoryClassName: "bg-emerald-500/15 text-emerald-300",
    title: "選手名鑑の出力機能をリリースしました",
    description: "選手プロフィール・スタッフ・写真をまとめた名鑑を、管理画面から直接出力できるようになりました。",
    href: "",
  },
  {
    date: "2026.07.10",
    category: "改善",
    categoryClassName: "bg-blue-500/15 text-blue-300",
    title: "レーダーチャートの項目をカスタマイズできるようになりました",
    description: "表示するスタッフ項目を大会ごとに自由に設定できるようになりました。",
    href: "",
  },
];

const itemsPerPage = 3;

type UpdatesPageProps = {
  searchParams?: {
    page?: string;
  };
};

export default function UpdatesPage({ searchParams }: UpdatesPageProps) {
  const currentPage = Math.min(
    Math.max(Number(searchParams?.page ?? "1") || 1, 1),
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
                    <span className={`inline-flex rounded-full px-4 py-1 text-sm font-black ${update.categoryClassName}`}>
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

            return update.href ? (
              <a key={`${update.date}-${update.title}`} href={update.href} target="_blank" rel="noreferrer" className="block hover:bg-slate-900/30">
                {content}
              </a>
            ) : (
              <div key={`${update.date}-${update.title}`}>{content}</div>
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
