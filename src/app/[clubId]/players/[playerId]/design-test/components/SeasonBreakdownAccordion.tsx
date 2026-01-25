"use client";

import Image from "next/image";
import { useMemo, useState } from "react";

type SimplePlayerStats = {
  appearances: number;
  minutes: number;
  goals: number;
  assists: number;
};

type SeasonCompetitionBreakdownRow = {
  competitionId: string;
  competitionName: string;
  competitionLogoUrl?: string;
  format?: string;
  stats: SimplePlayerStats;
};

type PlayerSeasonBreakdownRow = {
  season: string;
  total: SimplePlayerStats;
  competitions: SeasonCompetitionBreakdownRow[];
};

function StatCell({ label, value, className }: { label: string; value: number; className?: string }) {
  return (
    <div className={className || ""}>
      <div className="text-[9px] leading-none text-white/55">{label}</div>
      <div className="mt-0.5 text-xs font-bold tabular-nums leading-none">{value}</div>
    </div>
  );
}

export function SeasonBreakdownAccordion({ rows }: { rows: PlayerSeasonBreakdownRow[] }) {
  const [openSeason, setOpenSeason] = useState<string | null>(null);

  const normalizedRows = useMemo(() => {
    const copy = Array.isArray(rows) ? rows.slice() : [];
    copy.sort((a, b) => b.season.localeCompare(a.season));
    return copy;
  }, [rows]);

  return (
    <div className="divide-y divide-white/10">
      {normalizedRows.length === 0 ? (
        <div className="py-6 text-sm text-white/70">シーズン成績がありません</div>
      ) : (
        normalizedRows.map((r) => {
          const isOpen = openSeason === r.season;
          return (
            <div key={r.season} className="py-2">
              <button
                type="button"
                onClick={() => setOpenSeason((cur) => (cur === r.season ? null : r.season))}
                className="w-full text-left"
              >
                <div className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold">{r.season}</div>
                    <div className="mt-1 grid grid-cols-4 gap-1.5 text-center">
                      <StatCell label="試合" value={r.total.appearances} className="w-10" />
                      <StatCell label="分" value={r.total.minutes} className="w-12" />
                      <StatCell label="G" value={r.total.goals} className="w-9" />
                      <StatCell label="A" value={r.total.assists} className="w-9" />
                    </div>
                  </div>
                  <div className="shrink-0 text-white/60 text-xs">{isOpen ? "▲" : "▼"}</div>
                </div>
              </button>

              {isOpen ? (
                <div className="mt-2 rounded-xl border border-white/10 bg-black/10">
                  {r.competitions.length === 0 ? (
                    <div className="px-3 py-4 text-sm text-white/70">大会データがありません</div>
                  ) : (
                    <div className="divide-y divide-white/10">
                      {r.competitions.map((c) => (
                        <div key={c.competitionId} className="px-3 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0 flex items-center gap-2">
                              {c.competitionLogoUrl ? (
                                <div className="relative h-5 w-5 overflow-hidden rounded-full shrink-0">
                                  <Image
                                    src={c.competitionLogoUrl}
                                    alt={c.competitionName}
                                    fill
                                    sizes="20px"
                                    className="object-contain"
                                  />
                                </div>
                              ) : null}
                              <div className="min-w-0">
                                <div className="text-xs font-semibold leading-snug line-clamp-2">{c.competitionName}</div>
                              </div>
                            </div>

                            <div className="grid grid-cols-4 gap-1.5 text-center shrink-0">
                              <StatCell label="試合" value={c.stats.appearances} className="w-10" />
                              <StatCell label="分" value={c.stats.minutes} className="w-12" />
                              <StatCell label="G" value={c.stats.goals} className="w-9" />
                              <StatCell label="A" value={c.stats.assists} className="w-9" />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          );
        })
      )}
    </div>
  );
}
