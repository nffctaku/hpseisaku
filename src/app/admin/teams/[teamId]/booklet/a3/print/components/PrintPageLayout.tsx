"use client";

import { useMemo } from "react";
import Image from "next/image";
import type { BookletResponse } from "../../../types";
import { BookletPlayerCard } from "../../../components/BookletPlayerCard";

type StatRow = {
  season: string;
  league: string;
  rank: string;
};

type TransferRow = {
  date: string;
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
  players,
}: {
  players: Array<{ name: string; photoUrl?: string }>;
}) {
  const slots = useMemo(() => {
    const list = players.slice(0, 11);
    while (list.length < 11) list.push({ name: "-" });
    return list;
  }, [players]);

  const pos = [
    { x: 50, y: 88 },
    { x: 18, y: 70 },
    { x: 40, y: 70 },
    { x: 60, y: 70 },
    { x: 82, y: 70 },
    { x: 25, y: 50 },
    { x: 50, y: 50 },
    { x: 75, y: 50 },
    { x: 30, y: 28 },
    { x: 50, y: 22 },
    { x: 70, y: 28 },
  ];

  return (
    <div className="rounded-md border bg-white p-3">
      <div className="text-sm font-semibold text-gray-900 mb-2">フォーメーション</div>
      <div className="relative w-full aspect-[16/10] rounded-md overflow-hidden bg-emerald-700">
        <svg viewBox="0 0 100 60" className="absolute inset-0 w-full h-full">
          <rect x="2" y="2" width="96" height="56" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="1" />
          <line x1="50" y1="2" x2="50" y2="58" stroke="rgba(255,255,255,0.85)" strokeWidth="1" />
          <circle cx="50" cy="30" r="6" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="1" />
          <rect x="38" y="2" width="24" height="10" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="1" />
          <rect x="42" y="2" width="16" height="5" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="1" />
          <rect x="38" y="48" width="24" height="10" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="1" />
          <rect x="42" y="53" width="16" height="5" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="1" />
        </svg>

        {slots.map((p, i) => (
          <div
            key={i}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${pos[i].x}%`, top: `${pos[i].y}%` }}
          >
            <div className="w-10 h-10 rounded-full bg-white/90 border border-white shadow-sm overflow-hidden flex items-center justify-center">
              {p.photoUrl ? (
                <Image src={p.photoUrl} alt={p.name} width={40} height={40} className="w-full h-full object-cover" />
              ) : (
                <span className="text-xs font-bold text-emerald-900">{p.name.slice(0, 1)}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PrintPageLayout({
  teamName,
  season,
  logoUrl,
  teamBio,
  formationPlayers,
  leftCards,
  rightCards,
  additionalPlayers,
  stats,
  cups,
  transfers,
  coach,
}: {
  teamName: string;
  season: string;
  logoUrl: string | null;
  teamBio: string;
  formationPlayers: Array<{ name: string; photoUrl?: string }>;
  leftCards: Array<BookletResponse["players"][number] | null>;
  rightCards: Array<BookletResponse["players"][number] | null>;
  additionalPlayers: Array<BookletResponse["players"][number] | null>;
  stats: StatRow[];
  cups: CupRow[];
  transfers: TransferRow[];
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
                  <div className="text-sm font-semibold text-gray-900 mb-2">紹介文</div>
                  <div className="text-[12px] leading-relaxed text-gray-700">{teamBio}</div>
                </div>

                <FormationPitch players={formationPlayers} />
              </div>

              <div className="mt-auto grid grid-cols-3 gap-[1.5mm]">
                {leftCards.map((p, idx) =>
                  p ? (
                    <BookletPlayerCard key={`l_${p.id}_${idx}`} player={p} positionColorClass="bg-blue-300" />
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
                      <BookletPlayerCard key={`r_${p.id}_${idx}`} player={p} positionColorClass="bg-blue-300" />
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
                              <td className="border border-gray-300 px-2 py-1">{c.tournament}</td>
                              <td className="border border-gray-300 px-2 py-1">{c.result}</td>
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
                    <div className="relative w-[30mm] h-[22mm] bg-gray-100 border border-gray-200 flex-shrink-0 overflow-hidden">
                      {coach.photoUrl ? (
                        <Image src={coach.photoUrl} alt={coach.name} fill className="object-cover" sizes="160px" />
                      ) : null}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold">{coach.name}</div>
                      <div className="text-xs text-gray-700 leading-relaxed">{coach.bio}</div>
                    </div>
                  </div>

                  <div className="border-t border-gray-200">
                    <div className="bg-gray-50 px-3 py-2 text-sm font-semibold">移籍情報</div>
                    <div className="p-2">
                      <ul className="text-xs space-y-1">
                        {transfers.map((t, idx) => (
                          <li key={idx} className="border-b border-gray-200 pb-1">
                            <span className="font-semibold">{t.date}</span>
                            <span className="mx-2">{t.playerName}</span>
                            <span className="mx-2">{t.type}</span>
                            <span className="text-gray-600">{t.fromTo}</span>
                          </li>
                        ))}
                      </ul>
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
