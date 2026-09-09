"use client";

import { useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useAnalysisData } from "@/app/admin/analysis/hooks/use-analysis-data";
import { PlayerStats } from "@/app/admin/analysis/types";

function LeaderCard({
  title,
  label,
  player,
  value,
}: {
  title: string;
  label: string;
  player?: PlayerStats;
  value: number;
}) {
  return (
    <div className="group relative flex h-[140px] min-h-[140px] flex-col justify-between overflow-hidden rounded-lg border border-white/10 bg-slate-950 p-3 text-left shadow-[0_12px_30px_rgba(0,0,0,0.28)] transition hover:opacity-90 lg:h-[180px] lg:min-h-[180px]">
      {player?.photoUrl ? (
        <Image src={player.photoUrl} alt="" fill className="object-cover object-top opacity-90" sizes="50vw" />
      ) : (
        <div className="absolute inset-0 bg-slate-900" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-[#06101f]/50 from-[40%] to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-r from-[#06101f]/80 via-transparent to-transparent" />
      <div className="relative z-10">
        <h2 className="text-[11px] font-black leading-none tracking-wide text-white">{title}</h2>
        <p className="mt-0.5 text-[6px] font-black tracking-[0.18em] text-slate-400">{label}</p>
      </div>
      <div className="relative z-10 mt-6 max-w-[55%]">
        <p className="text-[42px] font-black leading-none tracking-[-0.06em] text-yellow-400 drop-shadow-sm">{value}</p>
        <p className="mt-1 break-words text-xs font-black leading-tight text-white">{player?.playerName || "-"}</p>
      </div>
    </div>
  );
}

export default function PlayerRecordsPage() {
  const {
    seasons,
    selectedSeason,
    setSelectedSeason,
    playerStatsList,
    topGoalscorers,
    topAssists,
    loading,
    error,
  } = useAnalysisData();

  const topMatches = useMemo(
    () => [...playerStatsList].sort((a, b) => b.matches - a.matches).slice(0, 5),
    [playerStatsList]
  );
  const topCleanSheets = useMemo(
    () => [...playerStatsList].filter((p) => p.position === "GK").sort((a, b) => b.matches - a.matches).slice(0, 1),
    [playerStatsList]
  );

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

      <section className="relative z-10 min-h-[360px] overflow-hidden sm:min-h-[440px] lg:min-h-[520px]">
        <Image src="/選手記録背景.jpg" alt="" fill priority className="object-cover object-center opacity-70" sizes="100vw" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/45 to-black/15" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#050a12]/85 via-transparent to-[#050a12]/25" />
        <div className="relative z-10 flex min-h-[360px] flex-col justify-end px-4 pb-2 pt-20 sm:min-h-[440px] sm:px-6 sm:pb-3 sm:pt-24 lg:min-h-[520px] lg:pt-28">
          <h1 className="text-[36px] font-black leading-[0.92] tracking-[-0.08em] text-slate-100 sm:text-5xl">
            PLAYER <span className="text-yellow-400">RECORDS</span>
          </h1>
          <p className="mt-1 text-xs font-bold leading-none text-slate-400">
            歴代の出場・得点・アシストランキング
          </p>

          <div className="mt-2 flex items-center gap-2">
            <label htmlFor="season" className="text-xs font-bold text-slate-400">
              シーズン
            </label>
            <select
              id="season"
              value={selectedSeason}
              onChange={(e) => setSelectedSeason(e.target.value)}
              className="rounded border border-white/10 bg-slate-900 px-2 py-1 text-xs font-bold text-white outline-none focus:border-blue-500"
            >
              <option value="all">全シーズン</option>
              {seasons.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className="relative z-10 mt-1 pb-8">
        <div className="px-4">
          <h2 className="text-2xl font-black tracking-[-0.04em] text-white">ALL-TIME LEADERS</h2>
          <p className="mt-1 text-xs font-bold text-slate-400">クラブの歴史に名を刻んだ選手たち</p>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
          <LeaderCard title="最多出場" label="APPEARANCES" player={topMatches[0]} value={topMatches[0]?.matches || 0} />
          <LeaderCard title="最多得点" label="GOALS" player={topGoalscorers[0]} value={topGoalscorers[0]?.goals || 0} />
          <LeaderCard title="最多アシスト" label="ASSISTS" player={topAssists[0]} value={topAssists[0]?.assists || 0} />
          <LeaderCard title="最多CS" label="CLEAN SHEETS" player={topCleanSheets[0]} value={0} />
          <Link
            href="/admin/club/history/players/rankings"
            className="col-span-2 flex min-h-[70px] items-center justify-between overflow-hidden rounded-lg border border-blue-500/20 bg-gradient-to-r from-slate-950 to-slate-900 p-4 text-left shadow-[0_12px_30px_rgba(0,0,0,0.45)] transition hover:brightness-110 lg:col-span-4"
          >
            <div>
              <p className="text-[13px] font-black text-white">歴代ランキングを見る</p>
              <p className="mt-1 text-[9px] font-bold tracking-[0.08em] text-slate-300">ALL-TIME RANKINGS</p>
            </div>
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-500 text-white">
              <ArrowRight className="h-3 w-3" />
            </div>
          </Link>
        </div>
      </section>

    </div>
  );
}
