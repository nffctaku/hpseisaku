"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronRight, User, ArrowLeft } from "lucide-react";
import { useAnalysisData } from "@/app/admin/analysis/hooks/use-analysis-data";

function getPositionColor(position?: string) {
  const p = position?.toUpperCase() || "";
  if (p.includes("GK")) return "bg-cyan-500";
  if (p.includes("DF")) return "bg-amber-500";
  if (p.includes("MF")) return "bg-emerald-500";
  if (p.includes("FW")) return "bg-blue-500";
  return "bg-slate-500";
}

function getPositionLabel(position?: string) {
  const p = position?.toUpperCase() || "";
  if (p.includes("GK")) return "GK";
  if (p.includes("DF")) return "DF";
  if (p.includes("MF")) return "MF";
  if (p.includes("FW")) return "FW";
  return position || "-";
}

export default function AllTimeRankingsPage() {
  const { playerStatsList, loading, error } = useAnalysisData();
  const [activeTab, setActiveTab] = useState<"matches" | "goals" | "assists" | "cleanSheets">("matches");

  const tabs = [
    { key: "matches", label: "出場数", unit: "試合" },
    { key: "goals", label: "得点", unit: "得点" },
    { key: "assists", label: "アシスト", unit: "アシスト" },
    { key: "cleanSheets", label: "CS", unit: "CS" },
  ] as const;

  const activeTabObj = tabs.find((t) => t.key === activeTab)!;

  const rankings = useMemo(() => {
    if (activeTab === "cleanSheets") {
      return playerStatsList
        .filter((p) => (p.position || "").toUpperCase().includes("GK"))
        .sort((a, b) => b.cleanSheets - a.cleanSheets)
        .slice(0, 15);
    }
    const metric = activeTab as "matches" | "goals" | "assists";
    return [...playerStatsList]
      .sort((a, b) => (b[metric] as number) - (a[metric] as number))
      .slice(0, 15);
  }, [playerStatsList, activeTab]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#020A14] text-white">
        <p className="text-sm font-bold">読み込み中...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#020A14] text-white">
        <p className="text-sm font-bold text-red-400">{error}</p>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen bg-[#020A14] text-white"
      style={{
        backgroundImage:
          "linear-gradient(to bottom, rgba(5,20,40,0.5), rgba(2,10,20,0.5) 50%, rgba(0,0,0,0.5)), repeating-linear-gradient(to bottom, transparent, transparent 99px, rgba(255,255,255,0.02) 99px, rgba(255,255,255,0.02) 100px), repeating-linear-gradient(to right, transparent, transparent 159px, rgba(255,255,255,0.015) 159px, rgba(255,255,255,0.015) 160px), repeating-linear-gradient(45deg, transparent, transparent 39px, rgba(255,255,255,0.01) 39px, rgba(255,255,255,0.01) 40px), url('/選手背景.jpg')",
        backgroundSize: "cover, 100% 100px, 160px 100%, 40px 40px, cover",
        backgroundPosition: "center, 0 0, 0 0, 0 0, center",
        backgroundAttachment: "fixed, fixed, fixed, fixed, fixed",
        backgroundRepeat: "no-repeat, repeat, repeat, repeat, no-repeat",
      }}
    >
      <section className="relative h-[200px] overflow-hidden sm:h-[240px]">
        <Image
          src="/選手記録背景.jpg"
          alt=""
          fill
          priority
          className="pointer-events-none object-cover"
          style={{ objectPosition: "50% 70%" }}
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#020A14]/15 to-[#020A14]/85" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#020A14]/70 to-transparent" />

        <div className="pointer-events-auto absolute left-4 top-4 z-50">
          <Link
            href="/admin/club/history/players"
            aria-label="戻る"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </div>

        <div className="relative z-10 flex h-full flex-col justify-end px-4 pb-5 sm:px-6">
          <h1 className="text-[34px] font-black uppercase leading-[0.92] tracking-[-0.02em] text-white sm:text-[38px]">
            RANKINGS
          </h1>
          <p className="mt-1 text-[14px] font-bold text-slate-100">
            歴代ランキング
          </p>
          <p className="mt-1 text-[10px] font-black tracking-[0.18em] text-[#8295AA]">
            ALL-TIME TOP 15
          </p>
        </div>
      </section>

      <div className="px-4 pb-24 pt-5 sm:px-6">
        <div className="grid grid-cols-4 gap-2 pb-2">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setActiveTab(t.key)}
              className={`w-full whitespace-nowrap rounded-full px-2 py-2 text-center text-xs font-black transition ${
                activeTab === t.key
                  ? "bg-blue-500 text-slate-950"
                  : "border border-white/10 bg-slate-900/80 text-slate-300"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="mt-5">
          {rankings.map((p, i) => {
            const value = p[activeTab as keyof typeof p] as number;
            return (
              <Link
                key={p.playerId}
                href={`/admin/club/history/players/${p.playerId}`}
                className="group flex items-center gap-3 border-b border-white/[0.07] py-3 transition active:opacity-70"
              >
                <span className="w-6 flex-shrink-0 text-right text-sm font-black text-[#8295AA]">
                  {i + 1}
                </span>

                <div className="relative h-[72px] w-14 flex-shrink-0 overflow-hidden rounded-lg bg-slate-900">
                  {p.photoUrl ? (
                    <Image
                      src={p.photoUrl}
                      alt={p.playerName}
                      fill
                      className="object-cover"
                      sizes="64px"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-slate-500">
                      <User className="h-6 w-6" />
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-[15px] font-bold text-white">
                      {p.playerName}
                    </p>
                    <span
                      className={`rounded px-[6px] py-[2px] text-[9px] font-black text-white ${getPositionColor(
                        p.position
                      )}`}
                    >
                      {getPositionLabel(p.position)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-[#8295AA]">
                    {p.tenureStart ? `${p.tenureStart} - ${p.tenureEnd || p.tenureStart}` : "在籍期間未設定"}
                  </p>
                  <p className="mt-0.5 text-[11px] text-[#AAB7C4]">
                    <span className="font-black text-white">{p.matches}</span> 試合 ｜{" "}
                    <span className="font-black text-white">{p.goals}</span> 得点 ｜{" "}
                    <span className="font-black text-white">{p.assists}</span> アシスト
                  </p>
                </div>

                <div className="text-right">
                  <p className="text-xl font-black leading-none text-white">{value}</p>
                  <p className="text-[10px] font-bold text-[#8295AA]">{activeTabObj.unit}</p>
                </div>

                <ChevronRight className="h-5 w-5 flex-shrink-0 text-[#91A4B8]" />
              </Link>
            );
          })}
          {rankings.length === 0 && (
            <p className="py-8 text-center text-xs font-bold text-slate-500">
              該当する選手が見つかりません
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
