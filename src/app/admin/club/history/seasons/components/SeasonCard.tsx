"use client";

import Image from "next/image";
import Link from "next/link";
import { Trophy, ArrowRight } from "lucide-react";
import type { SeasonSummary } from "../lib/season-records";

function moodImageClass(mood: SeasonSummary["mood"]): string {
  switch (mood) {
    case "title":
      return "brightness-105";
    case "good":
      return "saturate-150";
    case "poor":
      return "grayscale brightness-75";
    default:
      return "";
  }
}

export function SeasonCard({ season }: { season: SeasonSummary }) {
  const comps = season.competitionResults.slice(0, 4);

  return (
    <Link
      href={`/admin/club/history/seasons/${encodeURIComponent(season.season)}`}
      className="group relative block aspect-[16/9] w-full overflow-hidden rounded-2xl"
    >
      <Image
        src={season.imageUrl}
        alt=""
        fill
        className={`object-cover transition duration-700 group-hover:scale-105 ${moodImageClass(season.mood)}`}
        sizes="(max-width: 640px) 100vw, 80vw"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-slate-950/85 via-slate-950/55 to-slate-950/20" />
      <div className="absolute inset-0 bg-gradient-to-t from-slate-950/95 via-slate-950/25 to-slate-950/25" />

      <div className="relative z-10 flex h-full flex-col justify-between p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[34px] font-black leading-none tracking-[-0.04em] text-white sm:text-[40px]">
              {season.season}
            </h2>
            <p className="mt-1 text-[10px] font-black tracking-[0.22em] text-white/60">SEASON</p>
          </div>
          {season.titleCount > 0 ? (
            <div className="flex items-center gap-1 rounded-full bg-yellow-500/20 px-2.5 py-1.5 text-yellow-400 backdrop-blur-sm">
              <Trophy className="h-3.5 w-3.5" />
              <span className="text-[11px] font-black">{season.titleCount} TITLES</span>
            </div>
          ) : null}
        </div>

        <div className="mt-3 space-y-1">
          {comps.length === 0 ? (
            <p className="text-xs font-bold text-white/50">大会データがありません</p>
          ) : (
            comps.map((c) => (
              <div key={c.competitionId} className="flex items-baseline justify-between gap-2">
                <div className="flex min-w-0 items-baseline gap-1.5">
                  <span className="truncate text-[13px] font-bold text-white/90">{c.competitionName}</span>
                  {c.rank ? (
                    <span
                      className={`flex-shrink-0 text-[11px] font-black ${
                        c.isChampion ? "text-yellow-400" : "text-white/80"
                      }`}
                    >
                      第{c.rank}位
                    </span>
                  ) : null}
                  <span className="flex-shrink-0 text-[11px] font-black text-white/70">{c.record}</span>
                </div>
                <div className="flex flex-shrink-0 items-center gap-1">
                  {c.result !== "LEAGUE" ? (
                    <span
                      className={`text-[12px] font-black ${
                        c.isChampion ? "text-yellow-400" : "text-white/70"
                      }`}
                    >
                      {c.result}
                    </span>
                  ) : null}
                  {c.isChampion ? <Trophy className="h-3 w-3 text-yellow-400" /> : null}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="mt-3 flex items-end justify-between">
          <div>
            <p className="text-[11px] font-black tracking-wide text-white/80">{season.matches} MATCHES</p>
            <p className="mt-1 text-[15px] font-black text-white">
              <span className="mr-2">{season.wins} W</span>
              <span className="mr-2">{season.draws} D</span>
              <span>{season.losses} L</span>
            </p>
            <p className="mt-0.5 text-[11px] font-black text-white/70">
              {season.goalsFor} GF &nbsp;{season.goalsAgainst} GA
            </p>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm transition group-hover:translate-x-1 group-hover:bg-white/20">
            <ArrowRight className="h-5 w-5" />
          </div>
        </div>
      </div>
    </Link>
  );
}
