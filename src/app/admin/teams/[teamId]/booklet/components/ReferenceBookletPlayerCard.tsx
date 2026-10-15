"use client";

import React, { useLayoutEffect, useRef, useState } from "react";
import Image from "next/image";
import { PublicPlayerHexChart } from "@/components/public-player-hex-chart";
import { getContrastTextColor } from "@/lib/utils";
import { getFlagUrl } from "@/lib/flag-url";
import { clampText, preferredFootLabel } from "@/app/admin/teams/[teamId]/booklet/lib/booklet-utils";
import { JOIN_BADGE_STYLE } from "@/lib/join-status";
import type { BookletPlayer } from "@/app/admin/teams/[teamId]/booklet/types";

const PITCH_BOXES: Array<{ key: string; style: { left: string; top: string; width: string; height: string } }> = [
  { key: "ST", style: { left: "24%", top: "4%", width: "52%", height: "16%" } },
  { key: "LW", style: { left: "4%", top: "4%", width: "21%", height: "26%" } },
  { key: "RW", style: { left: "75%", top: "4%", width: "21%", height: "26%" } },
  { key: "AM", style: { left: "24%", top: "20%", width: "52%", height: "16%" } },
  { key: "LM", style: { left: "4%", top: "30%", width: "21%", height: "26%" } },
  { key: "RM", style: { left: "75%", top: "30%", width: "21%", height: "26%" } },
  { key: "CM", style: { left: "24%", top: "36%", width: "52%", height: "16%" } },
  { key: "DM", style: { left: "24%", top: "52%", width: "52%", height: "16%" } },
  { key: "LB", style: { left: "4%", top: "56%", width: "21%", height: "28%" } },
  { key: "RB", style: { left: "75%", top: "56%", width: "21%", height: "28%" } },
  { key: "CB", style: { left: "24%", top: "68%", width: "52%", height: "16%" } },
  { key: "GK", style: { left: "33%", top: "84%", width: "34%", height: "8%" } },
];

function ReferencePositionMap({
  mainPosition,
  subPositions,
}: {
  mainPosition?: string;
  subPositions?: string[];
  accentColor?: string;
}) {
  const main = (mainPosition || "").trim();
  const subs = Array.isArray(subPositions) ? subPositions : [];
  const VIEW_W = 100;
  const VIEW_H = 160;
  const INSET = 4;
  const pct = (v: string) => (Number.parseFloat(v) || 0) / 100;
  const toX = (v: string) => INSET + pct(v) * (VIEW_W - INSET * 2);
  const toY = (v: string) => INSET + pct(v) * (VIEW_H - INSET * 2);
  const toW = (v: string) => pct(v) * (VIEW_W - INSET * 2);
  const toH = (v: string) => pct(v) * (VIEW_H - INSET * 2);

  const lineColor = "#D8D4CC";
  const dividerColor = "#E8E4DC";
  return (
    <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="h-full w-auto">
      <rect x="0" y="0" width={VIEW_W} height={VIEW_H} rx="4" fill="#F7F5F0" />

      {[26, 52, 76].map((y) => (
        <line
          key={y}
          x1={6}
          y1={(y / 100) * VIEW_H}
          x2={VIEW_W - 6}
          y2={(y / 100) * VIEW_H}
          stroke={dividerColor}
          strokeWidth="0.8"
          strokeDasharray="3 2"
        />
      ))}

      {PITCH_BOXES.map((p) => {
        const isMain = main === p.key;
        const isSub = subs.includes(p.key);
        const fill = isMain ? "#E11D48" : isSub ? "#F7B8CD" : "rgba(0,0,0,0.025)";
        return (
          <rect
            key={p.key}
            x={toX(p.style.left)}
            y={toY(p.style.top)}
            width={toW(p.style.width)}
            height={toH(p.style.height)}
            rx={2}
            fill={fill}
          />
        );
      })}

      <rect x="6" y="6" width={VIEW_W - 12} height={VIEW_H - 12} rx="2" fill="none" stroke={lineColor} strokeWidth="1.2" />
      <line x1="6" y1={VIEW_H / 2} x2={VIEW_W - 6} y2={VIEW_H / 2} stroke={lineColor} strokeWidth="1" />
      <circle cx={VIEW_W / 2} cy={VIEW_H / 2} r="10" fill="none" stroke={lineColor} strokeWidth="1" />
      <rect x="28" y="6" width="44" height="16" fill="none" stroke={lineColor} strokeWidth="1" />
      <rect x="28" y={VIEW_H - 22} width="44" height="16" fill="none" stroke={lineColor} strokeWidth="1" />
    </svg>
  );
}

function shortPosition(position: string): string {
  const pos = String(position || "").toUpperCase();
  return (pos.match(/^(FW|MF|DF|GK)$/)?.[1] as string) || pos || "-";
}

function statValue(value: number | null | undefined, suffix = ""): string {
  return typeof value === "number" && Number.isFinite(value) ? `${value}${suffix}` : "-";
}

function contractDisplay(player: BookletPlayer): string {
  return typeof player.tenureYears === "number" && Number.isFinite(player.tenureYears)
    ? `${player.tenureYears}年目`
    : "-";
}

function lastSeasonCompact(summary: string | null | undefined): string {
  const s = (summary || "").trim();
  if (!s || s === "-" || s === "未登録") return "-";
  const m = s.match(/(\d+)試合\s*(\d+)ゴール\s*(\d+)アシスト/);
  if (m) return `${m[1]}M｜${m[2]}G｜${m[3]}A`;
  return s;
}

// 長いクラブ名は段階的に縮小し、1行省略でカードからはみ出さない
function previousClubTextSize(previousClub: string | null | undefined): string {
  const len = (previousClub || "").trim().length;
  if (len > 28) return "text-xs";
  if (len > 18) return "text-sm";
  return "text-base";
}

function ReferenceAbilityBars({
  labels,
  values,
  accentColor,
}: {
  labels: string[];
  values: number[];
  accentColor?: string;
}) {
  const rows = labels
    .map((label, i) => ({
      label: label.trim(),
      value: Math.max(0, Math.min(99, Number(values[i]) || 0)),
    }))
    .filter((r) => r.label);
  if (rows.length === 0) return null;
  return (
    <div className="flex h-full flex-col justify-center gap-1">
      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-3 text-sm">
          <span className="w-20 shrink-0 truncate text-sm text-gray-600">{r.label}</span>
          <div className="h-3 flex-1 rounded-full bg-gray-200 overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{ width: `${r.value}%`, backgroundColor: accentColor || "#C8102E" }}
            />
          </div>
          <span className="w-10 shrink-0 text-right text-lg font-bold leading-none tabular-nums">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

const CARD_NATURAL_WIDTH = 900;

export function ReferenceBookletPlayerCard({
  player,
  accentColor = "#C8102E",
  showParameterGraph = true,
  fixedWidth = false,
  fixedHeight,
  stripClassName,
  fitToWidth = false,
}: {
  player: BookletPlayer;
  accentColor?: string;
  showParameterGraph?: boolean;
  fixedWidth?: boolean;
  fixedHeight?: number;
  stripClassName?: string;
  fitToWidth?: boolean;
}) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<{ scale: number; height: number | null }>({ scale: 1, height: null });

  useLayoutEffect(() => {
    if (fixedWidth) return;
    const outer = outerRef.current;
    if (!outer) return;
    const update = () => {
      const w = outer.clientWidth;
      const isMd = window.matchMedia("(min-width: 768px)").matches;
      const scale =
        (fitToWidth || !isMd) && w > 0 && w < CARD_NATURAL_WIDTH ? w / CARD_NATURAL_WIDTH : 1;
      const inner = innerRef.current;
      const h = inner ? inner.offsetHeight : 0;
      const height = scale < 1 && h > 0 ? h * scale : null;
      setFit((prev) => (prev.scale === scale && prev.height === height ? prev : { scale, height }));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(outer);
    const inner = innerRef.current;
    if (inner) ro.observe(inner);
    return () => ro.disconnect();
  }, [fixedWidth, fitToWidth]);
  const color = accentColor || "#C8102E";
  const contrastColor = getContrastTextColor(color);
  const labels = player.params?.items?.map((i) => i.label) ?? ["", "", "", "", "", ""];
  const values = player.params?.items?.map((i) => i.value) ?? [0, 0, 0, 0, 0, 0];
  const computedOverall = (() => {
    const nums = (player.params?.items ?? [])
      .filter((i) => i.label.trim())
      .map((i) => Math.max(0, Math.min(99, Number(i.value) || 0)));
    return nums.length ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length) : 0;
  })();
  const overall =
    typeof player.params?.overall === "number" && player.params.overall > 0
      ? player.params.overall
      : computedOverall;
  const hasAbility = labels.some((l) => l.trim());
  const flagUrl = player.nationality ? getFlagUrl(player.nationality) : null;

  const scaled = !fixedWidth && fit.scale < 1;
  return (
    <div
      ref={outerRef}
      className={fixedWidth ? undefined : "reference-card-outer w-full"}
      style={scaled && fit.height != null ? { height: fit.height, overflow: "hidden" } : undefined}
    >
    <div
      ref={innerRef}
      className={`reference-card${scaled ? " reference-card-fit" : ""} grid grid-cols-[400px_1fr] rounded-2xl border border-gray-200 bg-white shadow-md overflow-hidden ${
        fixedWidth
          ? "w-[900px]"
          : scaled
            ? "w-[900px]"
            : "w-[900px] md:w-full md:max-w-6xl mx-auto"
      }`}
      style={{
        ...(typeof fixedHeight === "number" && fixedHeight > 0 ? { height: fixedHeight } : {}),
        ...(scaled ? { transform: `scale(${fit.scale})`, transformOrigin: "top left" } : {}),
      }}
    >
      <div className="relative grid h-full overflow-hidden grid-cols-[52px_1fr]">
        <div
          className={`flex flex-col items-center py-4 text-center ${stripClassName || ""}`}
          style={stripClassName ? { color: "#FFFFFF" } : { backgroundColor: color, color: contrastColor }}
        >
          <div className="text-3xl font-black leading-none">{player.number ?? "-"}</div>
          <div className="my-2 h-px w-8 bg-current opacity-40" />
          <div className="text-lg font-black leading-none">{shortPosition(player.position)}</div>
          {player.nationality ? (
            flagUrl ? (
              <div className="mt-3 rounded-sm overflow-hidden shadow-sm relative w-7 h-5">
                <Image src={flagUrl} alt={player.nationality} fill className="object-cover" sizes="48px" unoptimized />
              </div>
            ) : (
              <div className="mt-3 text-[10px] font-semibold opacity-90">{player.nationality}</div>
            )
          ) : null}
          <div className="mt-auto flex w-full items-end justify-center pb-1">
            {player.joinBadge ? (
              <span
                className="whitespace-nowrap rounded px-1 py-0.5 text-[9px] font-black leading-none tracking-tight"
                style={{
                  backgroundColor: JOIN_BADGE_STYLE[player.joinBadge].bg,
                  color: JOIN_BADGE_STYLE[player.joinBadge].fg,
                }}
              >
                {player.joinBadge}
              </span>
            ) : null}
          </div>
        </div>

        <div className="relative h-full bg-slate-100">
          {player.photoUrl ? (
            <Image
              src={player.photoUrl}
              alt={player.name}
              fill
              className="object-cover object-top"
              sizes="400px"
            />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-400">
              <svg viewBox="0 0 48 48" className="h-16 w-16" aria-hidden="true">
                <circle cx="24" cy="16" r="8" fill="currentColor" opacity="0.55" />
                <path d="M9 42c1.8-9 7.6-14 15-14s13.2 5 15 14" fill="currentColor" opacity="0.35" />
              </svg>
              <div className="text-base font-semibold tracking-wide">NO PHOTO</div>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 className="text-5xl font-black leading-none text-gray-900">{player.name}</h3>
            {player.subName ? <p className="mt-1 text-xl text-gray-500">{player.subName}</p> : null}
          </div>
          <div className="h-24 w-16 shrink-0 rounded border border-gray-200 bg-white overflow-hidden">
            <ReferencePositionMap
              mainPosition={player.mainPosition}
              subPositions={player.subPositions}
              accentColor={color}
            />
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-x-4 text-lg">
          <div className="space-y-1.5 min-w-0">
            <div className="flex items-baseline gap-2">
              <span className="w-24 shrink-0 text-base text-gray-500 whitespace-nowrap">身長 / 体重</span>
              <span className="min-w-0 font-bold text-gray-900 whitespace-nowrap">
                {statValue(player.height, "cm")} / {statValue(player.weight, "kg")}
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="w-24 shrink-0 text-base text-gray-500 whitespace-nowrap">年齢</span>
              <span className="min-w-0 font-bold text-gray-900 whitespace-nowrap">{player.age != null ? `${player.age}歳` : "-"}</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="w-24 shrink-0 text-base text-gray-500 whitespace-nowrap">利き足</span>
              <span className="min-w-0 font-bold text-gray-900 whitespace-nowrap">{preferredFootLabel(player.preferredFoot)}</span>
            </div>
          </div>
          <div className="space-y-1.5 min-w-0 border-l border-gray-200 pl-4">
            <div className="flex items-baseline gap-2">
              <span className="w-16 shrink-0 text-base text-gray-500 whitespace-nowrap">契約</span>
              <span className="min-w-0 font-bold text-gray-900 leading-tight">{contractDisplay(player)}</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="w-16 shrink-0 text-base text-gray-500 whitespace-nowrap">昨季成績</span>
              <span className="min-w-0 truncate font-bold text-gray-900 leading-tight whitespace-nowrap">{lastSeasonCompact(player.lastSeasonSummary)}</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="w-16 shrink-0 text-base text-gray-500 whitespace-nowrap">前所属</span>
              <span className={`min-w-0 truncate font-bold text-gray-900 leading-tight ${previousClubTextSize(player.previousClub)}`}>
                {(player.previousClub || "").trim() || "-"}
              </span>
            </div>
          </div>
        </div>

        {player.memo || player.profile ? (
          <p className="mt-3 text-base leading-relaxed text-gray-700 line-clamp-[16]">
            {clampText((player.memo || player.profile || "").trim(), 300)}
          </p>
        ) : null}

        {showParameterGraph ? (
          <div className="mt-auto bg-gray-50 rounded-xl px-3 py-2">
            <div className="flex items-center mb-1">
              <div className="flex items-center gap-2">
                <div className="h-4 w-1.5 rounded-full" style={{ backgroundColor: color }} />
                <span className="text-sm font-bold text-gray-900 leading-none">能力パラメーター</span>
                <span className="text-[10px] text-gray-400 tracking-wider">PLAYER ANALYSIS</span>
              </div>
            </div>
            {hasAbility ? (
              <div className="grid grid-cols-2 items-center gap-4">
                <div className="flex h-36 items-center justify-center">
                  <PublicPlayerHexChart
                    labels={labels}
                    values={values}
                    overall={overall}
                    accentColor={color}
                    dense
                    className="h-full w-full"
                  />
                </div>
                <ReferenceAbilityBars labels={labels} values={values} accentColor={color} />
              </div>
            ) : (
              <span className="text-base text-gray-400">能力データ未登録</span>
            )}
          </div>
        ) : null}
      </div>
    </div>
    </div>
  );
}
