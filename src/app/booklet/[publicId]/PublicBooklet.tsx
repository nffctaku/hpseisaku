"use client";

import Image from "next/image";

import { BookletPlayerCard } from "@/app/admin/teams/[teamId]/booklet/components/BookletPlayerCard";
import type { BookletPlayer, PositionColors } from "@/app/admin/teams/[teamId]/booklet/types";

export type PublicBookletView = {
  isPro: boolean;
  isParody: boolean;
  clubName: string;
  logoUrl: string | null;
  teamName: string;
  season: string;
  accentColor: string;
  showParameterGraph: boolean;
  positionColors: PositionColors | null;
  players: BookletPlayer[];
  pro: {
    bioTitle: string;
    bioBody: string;
    formationName: string | null;
    startersByPosition: Record<
      string,
      { id: string; number: string; name: string; photoUrl?: string } | null
    >;
    fallbackPlayers: Array<{ id: string; number: string; name: string; photoUrl?: string }>;
  } | null;
};

function positionColorClass(view: PublicBookletView, position: string): string {
  const pc = view.positionColors;
  const pos = String(position || "").toUpperCase();
  const fallback = { GK: "bg-rose-300", DF: "bg-blue-300", MF: "bg-green-300", FW: "bg-orange-300" };
  const colors = pc || fallback;
  if (pos.includes("GK") || pos.includes("ゴールキーパー") || pos.includes("キーパー")) return colors.GK;
  if (pos.includes("DF") || pos.includes("ディフェン") || pos.includes("CB") || pos.includes("SB"))
    return colors.DF;
  if (pos.includes("FW") || pos.includes("フォワード") || pos.includes("ST") || pos.includes("WG"))
    return colors.FW;
  return colors.MF;
}

export function PublicBooklet({ view }: { view: PublicBookletView }) {
  const { pro } = view;
  const hasIntro = !!(pro && (pro.bioTitle.trim() || pro.bioBody.trim()));

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:py-10">
        {/* ヘッダー */}
        {view.isPro ? (
          <header className="mb-8 flex items-center gap-4">
            {view.logoUrl ? (
              <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full bg-white shadow-sm">
                <Image src={view.logoUrl} alt={view.clubName} fill className="object-contain" unoptimized />
              </div>
            ) : null}
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-black text-gray-900 sm:text-3xl">{view.clubName}</h1>
              <p className="mt-1 text-sm font-semibold text-gray-500">
                {view.season} 選手名鑑
              </p>
            </div>
          </header>
        ) : (
          <header className="mb-8">
            <h1 className="text-2xl font-black text-gray-900">選手名鑑</h1>
            <p className="mt-1 text-sm font-semibold text-gray-500">{view.season}</p>
          </header>
        )}

        {/* パロディ/創作表記（Free・Pro共通・判定はサーバー側） */}
        {view.isParody ? (
          <div className="mb-8 flex flex-wrap items-center gap-3 rounded-xl border border-gray-800 bg-gray-900 px-5 py-3.5">
            <span className="rounded-md bg-white/15 px-2.5 py-1 text-[11px] font-black tracking-[0.15em] text-white">
              PARODY / FAN-MADE
            </span>
            <p className="text-xs font-semibold leading-relaxed text-gray-300">
              FootChron利用者による非公式の創作コンテンツです。
            </p>
          </div>
        ) : null}

        {/* チーム紹介（Pro） */}
        {hasIntro ? (
          <section className="mb-8 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            {pro!.bioTitle.trim() ? (
              <h2 className="mb-2 text-base font-bold text-gray-900">{pro!.bioTitle}</h2>
            ) : null}
            {pro!.bioBody.trim() ? (
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700">{pro!.bioBody}</p>
            ) : null}
          </section>
        ) : null}

        {/* フォーメーション（Pro）: 表示不具合のため一時非表示 */}

        {/* 選手プロフィールカード：PC 3列 / モバイルはカード領域のみ横スクロール */}
        <section>
          <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
            <div className="grid min-w-[1020px] grid-cols-3 gap-4 sm:min-w-[1050px] md:min-w-0">
              {view.players.map((p) => (
                <BookletPlayerCard
                  key={p.id}
                  player={p}
                  mode="full"
                  accentColor={view.accentColor}
                  showParameterGraph={view.showParameterGraph}
                  positionColorClass={positionColorClass(view, p.mainPosition || p.position)}
                  fitToWidth
                />
              ))}
            </div>
          </div>
        </section>

        <footer className="mt-12 border-t border-gray-200 pt-6 text-center">
          <p className="mb-3 text-[11px] font-semibold text-gray-400">
            FootChron利用者が作成したコンテンツです。クラブ公式の発信とは限りません。
          </p>
          <a
            href="https://www.footchron.com"
            className="text-xs font-semibold text-gray-400 hover:text-gray-600"
          >
            Powered by FootChron
          </a>
        </footer>
      </div>
    </div>
  );
}
