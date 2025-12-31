import React from "react";
import { GiWhistle, GiSoccerBall, GiNotebook } from "react-icons/gi";
import Image from "next/image";

function SingleFootIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M32 6c-6 0-11 6-11 14 0 10 5 18 11 18s11-8 11-18C43 12 38 6 32 6z" />
      <path d="M32 39c-5 0-9 5-9 11v6c0 2 2 4 4 4h10c2 0 4-2 4-4v-6c0-6-4-11-9-11z" />
    </svg>
  );
}

export interface PublicSeasonSummaryRow {
  season: string;
  matches: number;
  goals: number;
  assists: number;
  avgRating: number | null;
  hasStats: boolean;
  overall?: number | null;
  competitions?: {
    competitionId: string;
    competitionName: string;
    competitionLogoUrl?: string;
    matches: number;
    goals: number;
    assists: number;
    avgRating: number | null;
    hasStats: boolean;
    overall?: number | null;
  }[];
}

export function PublicPlayerSeasonSummaries({ rows }: { rows: PublicSeasonSummaryRow[] }) {
  if (!Array.isArray(rows) || rows.length === 0) return null;

  return (
    <div className="mt-8">
      <div className="flex items-end justify-between gap-3">
        <h2 className="text-xl font-bold">シーズン別成績</h2>
      </div>
      <div className="mt-4 rounded-lg border">
        <div className="w-full">
          <div className="grid grid-cols-5 items-center bg-muted/30">
            <div className="p-1.5 text-left text-[10px] text-muted-foreground font-medium whitespace-nowrap">シーズン</div>
            <div
              className="p-1.5 text-center text-[10px] text-muted-foreground font-medium whitespace-nowrap"
              title="試合数"
              aria-label="試合数"
            >
              <GiWhistle className="w-4 h-4 inline-block" />
            </div>
            <div
              className="p-1.5 text-center text-[10px] text-muted-foreground font-medium whitespace-nowrap"
              title="ゴール数"
              aria-label="ゴール数"
            >
              <GiSoccerBall className="w-4 h-4 inline-block" />
            </div>
            <div
              className="p-1.5 text-center text-[10px] text-muted-foreground font-medium whitespace-nowrap"
              title="アシスト数"
              aria-label="アシスト数"
            >
              <SingleFootIcon className="w-5 h-5 inline-block" />
            </div>
            <div
              className="p-1.5 text-center text-[10px] text-muted-foreground font-medium whitespace-nowrap"
              title="評価点"
              aria-label="評価点"
            >
              <GiNotebook className="w-4 h-4 inline-block" />
            </div>
          </div>

          <div className="divide-y">
            {rows.map((row) => {
              const comps = Array.isArray(row.competitions) ? row.competitions : [];
              const hasBreakdown = row.hasStats && comps.length > 0;
              return (
                <div key={row.season} className="bg-background">
                  {hasBreakdown ? (
                    <details className="group">
                      <summary
                        className="cursor-pointer list-none [&::-webkit-details-marker]:hidden"
                        style={{ listStyle: "none" }}
                      >
                        <div className="grid grid-cols-5 items-center">
                          <div className="p-1.5 flex items-center gap-1">
                            <span className="inline-flex h-3.5 w-3.5 items-center justify-center text-muted-foreground transition-transform group-open:rotate-180">
                              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            </span>
                            <span className="text-[11px] font-medium">{row.season}</span>
                          </div>
                          <div className="p-1.5 text-center text-[11px] font-semibold tabular-nums">{row.hasStats ? row.matches : "-"}</div>
                          <div className="p-1.5 text-center text-[11px] font-semibold tabular-nums">{row.hasStats ? row.goals : "-"}</div>
                          <div className="p-1.5 text-center text-[11px] font-semibold tabular-nums">{row.hasStats ? row.assists : "-"}</div>
                          <div className="p-1.5 text-center text-[11px] font-semibold tabular-nums">
                            {row.hasStats ? (row.avgRating == null ? "-" : row.avgRating.toFixed(1)) : "-"}
                          </div>
                        </div>
                      </summary>

                      <div className="px-1.5 pb-2">
                        <div className="rounded-md border bg-muted/10">
                          <table className="w-full">
                            <thead className="bg-muted/20">
                              <tr>
                                <th className="p-1.5 text-left text-[10px] text-muted-foreground font-medium">大会</th>
                                <th
                                  className="p-1.5 text-center text-[10px] text-muted-foreground font-medium"
                                  title="試合数"
                                  aria-label="試合数"
                                >
                                  <GiWhistle className="w-4 h-4 inline-block" />
                                </th>
                                <th
                                  className="p-1.5 text-center text-[10px] text-muted-foreground font-medium"
                                  title="ゴール数"
                                  aria-label="ゴール数"
                                >
                                  <GiSoccerBall className="w-4 h-4 inline-block" />
                                </th>
                                <th
                                  className="p-1.5 text-center text-[10px] text-muted-foreground font-medium"
                                  title="アシスト数"
                                  aria-label="アシスト数"
                                >
                                  <SingleFootIcon className="w-5 h-5 inline-block" />
                                </th>
                                <th
                                  className="p-1.5 text-center text-[10px] text-muted-foreground font-medium"
                                  title="評価点"
                                  aria-label="評価点"
                                >
                                  <GiNotebook className="w-4 h-4 inline-block" />
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y">
                              {comps.map((c) => (
                                <tr key={c.competitionId} className="bg-background">
                                  <td className="p-1.5 text-[11px] font-medium">
                                    <div className="flex items-center gap-2">
                                      {typeof c.competitionLogoUrl === "string" && c.competitionLogoUrl.trim().length > 0 ? (
                                        <span className="relative h-4 w-4 shrink-0">
                                          <Image
                                            src={c.competitionLogoUrl}
                                            alt={c.competitionName}
                                            fill
                                            sizes="16px"
                                            className="object-contain"
                                          />
                                        </span>
                                      ) : null}
                                      <span className="truncate">{c.competitionName}</span>
                                    </div>
                                  </td>
                                  <td className="p-1.5 text-center text-[11px] font-semibold tabular-nums">{c.hasStats ? c.matches : "-"}</td>
                                  <td className="p-1.5 text-center text-[11px] font-semibold tabular-nums">{c.hasStats ? c.goals : "-"}</td>
                                  <td className="p-1.5 text-center text-[11px] font-semibold tabular-nums">{c.hasStats ? c.assists : "-"}</td>
                                  <td className="p-1.5 text-center text-[11px] font-semibold tabular-nums">
                                    {c.hasStats ? (c.avgRating == null ? "-" : c.avgRating.toFixed(1)) : "-"}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </details>
                  ) : (
                    <div className="grid grid-cols-5 items-center">
                      <div className="p-1.5">
                        <span className="text-[11px] font-medium">{row.season}</span>
                      </div>
                      <div className="p-1.5 text-center text-[11px] font-semibold tabular-nums">{row.hasStats ? row.matches : "-"}</div>
                      <div className="p-1.5 text-center text-[11px] font-semibold tabular-nums">{row.hasStats ? row.goals : "-"}</div>
                      <div className="p-1.5 text-center text-[11px] font-semibold tabular-nums">{row.hasStats ? row.assists : "-"}</div>
                      <div className="p-1.5 text-center text-[11px] font-semibold tabular-nums">
                        {row.hasStats ? (row.avgRating == null ? "-" : row.avgRating.toFixed(1)) : "-"}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
