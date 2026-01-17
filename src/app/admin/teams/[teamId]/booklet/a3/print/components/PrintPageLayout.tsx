"use client";

import { useMemo } from "react";
import Image from "next/image";
import type { BookletResponse } from "../../../types";
import { BookletPlayerCard } from "../../../components/BookletPlayerCard";
import { formations } from "@/lib/formations";

type StatRow = {
  season: string;
  league: string;
  rank: string;
};

export type TransferRow = {
  position: string;
  playerName: string;
  type: string;
  fromTo: string;
};

type CupRow = {
  tournament: string;
  result: string;
};

type CoachInfo = {
  name: string;
  photoUrl: string | null;
  bio: string;
};

function NoImageCard() {
  return (
    <div className="relative border border-gray-200 bg-white h-[42mm] flex items-center justify-center">
      <div className="text-sm font-semibold text-gray-400">NoImage</div>
    </div>
  );
}

function FormationPitch({
  formationName,
  startersByPosition,
  fallbackPlayers,
}: {
  formationName: string | null;
  startersByPosition: Record<string, { id: string; number: string; name: string; photoUrl?: string } | null>;
  fallbackPlayers: Array<{ id: string; number: string; name: string; photoUrl?: string }>;
}) {
  const formation = useMemo(() => {
    const name = String(formationName || "").trim();
    return formations.find((f) => f.name === name) || formations[0];
  }, [formationName]);

  const padPitchCoord = useMemo(() => {
    const pad = 7;
    return (v: number) => {
      const n = Number(v);
      if (!Number.isFinite(n)) return 50;
      const clamped = Math.max(0, Math.min(100, n));
      return pad + ((100 - 2 * pad) * clamped) / 100;
    };
  }, []);

  const slotsByPositionId = useMemo(() => {
    const out: Record<string, { id: string; number: string; name: string; photoUrl?: string }> = {};

    const used = new Set<string>();
    for (const pos of formation.positions) {
      const p = startersByPosition?.[pos.id] || null;
      if (p) {
        out[pos.id] = p;
        used.add(p.id);
      }
    }

    const pool = Array.isArray(fallbackPlayers) ? fallbackPlayers : [];
    let poolIndex = 0;
    for (const pos of formation.positions) {
      if (out[pos.id]) continue;
      while (poolIndex < pool.length && used.has(pool[poolIndex].id)) poolIndex++;
      if (poolIndex < pool.length) {
        out[pos.id] = pool[poolIndex];
        used.add(pool[poolIndex].id);
        poolIndex++;
      } else {
        out[pos.id] = { id: `empty_${pos.id}`, number: "-", name: "-" };
      }
    }

    return out;
  }, [fallbackPlayers, formation.positions, startersByPosition]);

  return (
    <div className="rounded-md border bg-white p-3">
      <div className="text-sm font-semibold text-gray-900 mb-2">フォーメーション</div>
      <div className="relative w-full aspect-[16/10] rounded-md overflow-hidden bg-emerald-700">
        <svg viewBox="0 0 100 60" className="absolute inset-0 w-full h-full">
          <rect x="2" y="2" width="96" height="56" fill="none" stroke="rgba(255,255,255,0.65)" strokeWidth="0.7" />
          <line x1="2" y1="30" x2="98" y2="30" stroke="rgba(255,255,255,0.6)" strokeWidth="0.6" />
          <circle cx="50" cy="30" r="6" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="0.6" />
          <rect x="38" y="2" width="24" height="10" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="0.6" />
          <rect x="42" y="2" width="16" height="5" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="0.6" />
          <rect x="38" y="48" width="24" height="10" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="0.6" />
          <rect x="42" y="53" width="16" height="5" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="0.6" />
        </svg>

        {formation.positions.map((pos) => {
          const p = slotsByPositionId[pos.id];
          const x = padPitchCoord(pos.coordinates.x);
          const y = padPitchCoord(pos.coordinates.y);
          return (
          <div
            key={pos.id}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${100 - x}%`, top: `${100 - y}%` }}
          >
            <div className="flex flex-col items-center">
              <div className="w-14 h-14 rounded-full bg-white/90 border-2 border-white shadow-md overflow-hidden flex items-center justify-center">
                {p.photoUrl ? (
                  <Image src={p.photoUrl} alt={p.name} width={56} height={56} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-[10px] font-semibold text-gray-500">NoImage</span>
                )}
              </div>
              <div className="mt-1 px-2 py-1 rounded-full bg-white/90 text-[10px] leading-none font-bold text-gray-900 whitespace-nowrap shadow-sm">
                {p.number} {p.name}
              </div>
            </div>
          </div>
          );
        })}
      </div>
    </div>
  );
}

export function PrintPageLayout({
  teamName,
  season,
  logoUrl,
  bioTitle,
  bioBody,
  formationPlayers,
  formationName,
  formationStartersByPosition,
  leftCards,
  rightCards,
  additionalPlayers,
  getPositionColor,
  stats,
  cups,
  transfersIn,
  transfersOut,
  coach,
}: {
  teamName: string;
  season: string;
  logoUrl: string | null;
  bioTitle: string;
  bioBody: string;
  formationPlayers: Array<{ id: string; number: string; name: string; photoUrl?: string }>;
  formationName: string | null;
  formationStartersByPosition: Record<string, { id: string; number: string; name: string; photoUrl?: string } | null>;
  leftCards: Array<BookletResponse["players"][number] | null>;
  rightCards: Array<BookletResponse["players"][number] | null>;
  additionalPlayers: Array<BookletResponse["players"][number] | null>;
  getPositionColor: (position: string) => string;
  stats: StatRow[];
  cups: CupRow[];
  transfersIn: TransferRow[];
  transfersOut: TransferRow[];
  coach: CoachInfo;
}) {
  return (
    <div className="print-page">
      <div className="w-[420mm] min-h-[297mm] mx-auto bg-white">
        <div className="px-[8mm] pt-[8mm] pb-[8mm]">
          <div className="grid grid-cols-[1fr_1fr] gap-[6mm]">
            <div className="flex flex-col h-full">
              <div className="flex flex-col gap-[4mm]">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-3xl font-black leading-tight truncate">{teamName}</div>
                    <div className="text-sm text-gray-600 mt-1">{season}</div>
                  </div>
                  {logoUrl ? (
                    <div className="relative w-[46mm] h-[14mm] flex-shrink-0">
                      <Image src={logoUrl} alt={teamName} fill className="object-contain" sizes="240px" />
                    </div>
                  ) : null}
                </div>

                <div className="rounded-md border bg-white p-3">
                  <div className="text-sm font-semibold text-gray-900 mb-2">{String(bioTitle || "").trim() ? bioTitle : "\u00A0"}</div>
                  <div className="text-[12px] leading-relaxed text-gray-700">
                    {String(bioBody || "").trim() ? <div>{bioBody}</div> : <div>\u00A0</div>}
                  </div>
                </div>

                <FormationPitch
                  formationName={formationName}
                  startersByPosition={formationStartersByPosition}
                  fallbackPlayers={formationPlayers}
                />
              </div>

              <div className="mt-auto grid grid-cols-3 gap-[1.5mm]">
                {leftCards.map((p, idx) =>
                  p ? (
                    <BookletPlayerCard
                      key={`l_${p.id}_${idx}`}
                      player={p}
                      positionColorClass={getPositionColor(p.mainPosition || p.position)}
                    />
                  ) : (
                    <NoImageCard key={`l_no_${idx}`} />
                  )
                )}
              </div>
            </div>

            <div className="flex flex-col gap-[4mm]">
              <div>
                <div className="grid grid-cols-3 gap-[1.5mm]">
                  {rightCards.map((p, idx) =>
                    p ? (
                      <BookletPlayerCard
                        key={`r_${p.id}_${idx}`}
                        player={p}
                        positionColorClass={getPositionColor(p.mainPosition || p.position)}
                      />
                    ) : (
                      <NoImageCard key={`r_no_${idx}`} />
                    )
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-[4mm]">
                <div className="flex flex-col gap-[4mm]">
                  <div className="border border-gray-300">
                    <div className="bg-gray-50 px-3 py-2 text-sm font-semibold">OTHER MEMBERS</div>
                    <div className="p-2">
                      <table className="w-full text-[9px] table-fixed">
                        <thead>
                          <tr className="bg-gray-600 text-white">
                            <th className="border border-gray-300 pl-1 pr-1.5 py-1 text-left w-[8%] whitespace-nowrap text-[8px]">POS</th>
                            <th className="border border-gray-300 pl-1 pr-1.5 py-1 text-left w-[27%] whitespace-nowrap text-[8px]">選手名</th>
                            <th className="border border-gray-300 px-1.5 py-1 text-left w-[44%] text-[8px]">身長/体重/年齢/国籍</th>
                            <th className="border border-gray-300 pl-1.5 pr-1 py-1 text-right w-[21%] whitespace-nowrap text-[8px]">昨シーズン成績</th>
                          </tr>
                        </thead>
                        <tbody>
                          {additionalPlayers.map((p, idx) => (
                            <tr key={idx}>
                              <td className="border border-gray-300 pl-1 pr-1.5 py-[1px] align-top whitespace-nowrap">{p?.position || "\u00A0"}</td>
                              <td className="border border-gray-300 pl-1 pr-1.5 py-[1px] align-top whitespace-nowrap">{p?.name || "\u00A0"}</td>
                              <td className="border border-gray-300 px-1.5 py-[1px] align-top whitespace-nowrap">
                                {p ? `${p.height ?? ""}cm/${p.weight ?? ""}kg/${p.age ?? ""}歳/${p.nationality ?? ""}` : "\u00A0"}
                              </td>
                              <td className="border border-gray-300 pl-1.5 pr-1 py-[1px] align-top whitespace-nowrap text-right overflow-hidden text-ellipsis">
                                {p?.lastSeasonSummary || "\u00A0"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="border border-gray-300">
                    <div className="bg-gray-50 px-3 py-2 text-sm font-semibold">リーグ成績（過去5シーズン）</div>
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-white">
                          <th className="border border-gray-300 px-2 py-1 text-left">シーズン</th>
                          <th className="border border-gray-300 px-2 py-1 text-left">リーグ</th>
                          <th className="border border-gray-300 px-2 py-1 text-right">順位</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stats.map((row, idx) => (
                          <tr key={idx}>
                            <td className="border border-gray-300 px-2 py-1">{row.season}</td>
                            <td className="border border-gray-300 px-2 py-1">{row.league}</td>
                            <td className="border border-gray-300 px-2 py-1 text-right">{row.rank}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="border border-gray-300">
                    <div className="bg-gray-50 px-3 py-2 text-sm font-semibold">昨シーズン 他大会成績</div>
                    <div className="p-2">
                      <table className="w-full text-xs">
                        <thead>
                          <tr>
                            <th className="border border-gray-300 px-2 py-1 text-left">大会</th>
                            <th className="border border-gray-300 px-2 py-1 text-left">成績</th>
                          </tr>
                        </thead>
                        <tbody>
                          {cups.map((c, idx) => (
                            <tr key={idx}>
                              <td className="border border-gray-300 px-2 py-1">{c.tournament || "\u00A0"}</td>
                              <td className="border border-gray-300 px-2 py-1">{c.result || "\u00A0"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                <div className="border border-gray-300">
                  <div className="bg-gray-50 px-3 py-2 text-sm font-semibold">監督</div>
                  <div className="p-2 flex items-start gap-3">
                    <div className="relative w-[26mm] h-[22mm] bg-white border border-gray-200 flex-shrink-0 overflow-hidden">
                      {coach.photoUrl ? (
                        <Image src={coach.photoUrl} alt={coach.name} fill className="object-contain p-1" sizes="160px" />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center text-xs font-semibold text-gray-400">
                          NoImage
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold">{coach.name}</div>
                      <div
                        className="text-xs text-gray-700 leading-relaxed overflow-hidden"
                        style={{ display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical" }}
                      >
                        {coach.bio}
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-gray-200">
                    <div className="bg-gray-50 px-3 py-2 text-sm font-semibold">移籍情報</div>
                    <div className="p-2">
                      <div className="text-[9px] font-semibold mb-1">IN</div>
                      <table className="w-full text-[9px] table-fixed">
                        <thead>
                          <tr className="bg-white">
                            <th className="border border-gray-300 px-1 py-[1px] text-left w-[20%] whitespace-nowrap">種別</th>
                            <th className="border border-gray-300 px-1 py-[1px] text-left w-[10%] whitespace-nowrap">POS</th>
                            <th className="border border-gray-300 px-1 py-[1px] text-left w-[34%] whitespace-nowrap">選手名</th>
                            <th className="border border-gray-300 px-1 py-[1px] text-left w-[36%] whitespace-nowrap">移籍元</th>
                          </tr>
                        </thead>
                        <tbody>
                          {transfersIn.map((t, idx) => (
                            <tr key={`in_${idx}`}>
                              <td className="border border-gray-300 px-1 py-[1px] whitespace-nowrap">{t.type || "\u00A0"}</td>
                              <td className="border border-gray-300 px-1 py-[1px] whitespace-nowrap">{t.position || "\u00A0"}</td>
                              <td className="border border-gray-300 px-1 py-[1px] whitespace-nowrap overflow-hidden text-ellipsis">{t.playerName || "\u00A0"}</td>
                              <td className="border border-gray-300 px-1 py-[1px] whitespace-nowrap overflow-hidden text-ellipsis">{t.fromTo || "\u00A0"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>

                      <div className="text-[9px] font-semibold mt-2 mb-1">OUT</div>
                      <table className="w-full text-[9px] table-fixed">
                        <thead>
                          <tr className="bg-white">
                            <th className="border border-gray-300 px-1 py-[1px] text-left w-[20%] whitespace-nowrap">種別</th>
                            <th className="border border-gray-300 px-1 py-[1px] text-left w-[10%] whitespace-nowrap">POS</th>
                            <th className="border border-gray-300 px-1 py-[1px] text-left w-[34%] whitespace-nowrap">選手名</th>
                            <th className="border border-gray-300 px-1 py-[1px] text-left w-[36%] whitespace-nowrap">移籍先</th>
                          </tr>
                        </thead>
                        <tbody>
                          {transfersOut.map((t, idx) => (
                            <tr key={`out_${idx}`}>
                              <td className="border border-gray-300 px-1 py-[1px] whitespace-nowrap">{t.type || "\u00A0"}</td>
                              <td className="border border-gray-300 px-1 py-[1px] whitespace-nowrap">{t.position || "\u00A0"}</td>
                              <td className="border border-gray-300 px-1 py-[1px] whitespace-nowrap overflow-hidden text-ellipsis">{t.playerName || "\u00A0"}</td>
                              <td className="border border-gray-300 px-1 py-[1px] whitespace-nowrap overflow-hidden text-ellipsis">{t.fromTo || "\u00A0"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
