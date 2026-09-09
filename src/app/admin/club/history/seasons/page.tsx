"use client";

import Image from "next/image";
import { useSeasonRecordsData } from "./hooks/use-season-records-data";
import { SeasonCard } from "./components/SeasonCard";

export default function SeasonRecordsPage() {
  const { seasonSummaries, loading, error } = useSeasonRecordsData();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#050a12] text-white">
        <p className="text-sm font-bold">読み込み中...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#050a12] text-white">
        <p className="text-sm font-bold text-red-400">{error}</p>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-[#050a12] text-white">
      <div className="absolute inset-x-0 top-0 h-1 bg-red-500" />

      <section className="relative z-10 min-h-[280px] overflow-hidden sm:min-h-[320px] lg:min-h-[360px]">
        <Image
          src="/シーズン記録背景.jpg"
          alt=""
          fill
          priority
          className="object-cover object-center opacity-70"
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/45 to-black/15" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#050a12]/90 via-transparent to-[#050a12]/30" />
        <div className="relative z-10 flex min-h-[280px] flex-col justify-end px-4 pb-2 pt-20 sm:min-h-[320px] sm:px-6 sm:pb-3 sm:pt-24 lg:min-h-[360px] lg:pt-28">
          <h1 className="text-[34px] font-black leading-[0.92] tracking-[-0.08em] text-slate-100 sm:text-[44px]">
            SEASON <span className="text-yellow-400">RECORDS</span>
          </h1>
          <p className="mt-1 text-xs font-bold leading-none text-slate-400">
            1シーズンの記録と成績を振り返る
          </p>
        </div>
      </section>

      <section className="relative z-10 px-4 pt-3 sm:px-6 sm:pt-4">
        <div className="mb-3">
          <h2 className="text-[13px] font-black tracking-[0.22em] text-slate-300">SEASON ARCHIVE</h2>
          <p className="text-[10px] font-bold text-slate-500">歴代シーズン</p>
        </div>
      </section>

      <div className="px-4 pb-24 pt-2 sm:px-6">
        {seasonSummaries.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-[#071321] p-6 text-center">
            <p className="text-sm font-bold text-slate-300">シーズンデータが見つかりません</p>
            <p className="mt-1 text-xs text-slate-500">大会・試合データを登録すると表示されます</p>
          </div>
        ) : (
          <div className="space-y-4">
            {seasonSummaries.map((s) => (
              <SeasonCard key={s.season} season={s} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
