import React from "react";
import Image from "next/image";
import { PublicPlayerHexChart } from "@/components/public-player-hex-chart";
import { getContrastTextColor } from "@/lib/utils";
import type { BookletPlayer } from "../types";
import { clampText, contractEndLabel, isAlphabetName, preferredFootLabel } from "../lib/booklet-utils";
import { PositionMap } from "./PositionMap";

function PlayerSilhouette() {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-slate-400">
      <svg viewBox="0 0 48 48" className="h-8 w-8" aria-hidden="true">
        <circle cx="24" cy="16" r="8" fill="currentColor" opacity="0.55" />
        <path d="M9 42c1.8-9 7.6-14 15-14s13.2 5 15 14" fill="currentColor" opacity="0.35" />
      </svg>
      <div className="text-[7px] font-semibold tracking-wide">PLAYER</div>
    </div>
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
  const parts: string[] = [];
  if (typeof player.tenureYears === "number" && Number.isFinite(player.tenureYears)) {
    parts.push(`${player.tenureYears}年目`);
  }
  const end = contractEndLabel(player.contractEndDate);
  if (end) parts.push(end);
  return parts.join(" ") || "-";
}

function PlayerAbilityBarList({
  labels,
  values,
  accentColor,
}: {
  labels: string[];
  values: number[];
  accentColor?: string;
}) {
  const barColor = accentColor || "#4A90D9";
  const rows = labels
    .map((label, i) => ({ label, value: Math.max(0, Math.min(99, Number(values[i]) || 0)) }))
    .filter((r) => r.label.trim());
  if (rows.length === 0) {
    return <p className="text-sm text-gray-400">能力データ未登録</p>;
  }
  return (
    <div className="flex flex-col justify-center gap-3 h-full">
      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-3">
          <span className="w-20 shrink-0 text-sm font-medium text-gray-700 truncate">{r.label}</span>
          <div className="flex-1 h-3 rounded-full bg-gray-100 overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{ width: `${r.value}%`, backgroundColor: barColor }}
            />
          </div>
          <span className="w-8 text-right text-sm font-bold text-gray-900 tabular-nums">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

export function BookletPlayerCard({
  player,
  positionColorClass,
  accentColor,
  clubLogo,
  showParameterGraph = true,
  mode = "compact",
}: {
  player: BookletPlayer;
  positionColorClass: string;
  accentColor?: string;
  clubLogo?: string | null;
  showParameterGraph?: boolean;
  mode?: "compact" | "full";
}) {
  if (mode === "full") {
    return <FullBookletPlayerCard player={player} positionColorClass={positionColorClass} accentColor={accentColor} clubLogo={clubLogo} showParameterGraph={showParameterGraph} />;
  }
  return <CompactBookletPlayerCard player={player} positionColorClass={positionColorClass} accentColor={accentColor} showParameterGraph={showParameterGraph} />;
}

function CompactBookletPlayerCard({
  player,
  positionColorClass,
  accentColor,
  showParameterGraph = true,
}: {
  player: BookletPlayer;
  positionColorClass: string;
  accentColor?: string;
  showParameterGraph?: boolean;
}) {
  const labels = player.params?.items?.map((i) => i.label) ?? ["", "", "", "", "", ""];
  const values = player.params?.items?.map((i) => i.value) ?? [0, 0, 0, 0, 0, 0];
  const overall = typeof player.params?.overall === "number" ? player.params.overall : 0;
  const desc = clampText((player.memo || "").trim() || (player.profile || ""), showParameterGraph ? 60 : 120);
  const contrastColor = accentColor ? getContrastTextColor(accentColor) : "#FFFFFF";

  const stripStyle = accentColor ? { backgroundColor: accentColor, color: contrastColor } : undefined;

  return (
    <div
      className="relative h-[42mm] overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm"
    >
      {player.isNew ? (
        <div className="absolute right-0 top-0 z-[100] h-4 w-4 translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-400 text-[6px] font-black text-white shadow-sm flex items-center justify-center">
          NEW
        </div>
      ) : null}

      <div className="grid h-full" style={{ gridTemplateColumns: "8mm 1fr 1.5fr" }}>
        {/* 左：カラー縦帯 */}
        <div
          className={`booklet-color-strip flex h-full flex-col items-center justify-start py-1.5 text-white ${!accentColor ? positionColorClass : ""}`}
          style={stripStyle}
        >
          <div className="text-[11px] font-black leading-none">{player.number ?? "-"}</div>
          <div className="mt-0.5 h-px w-4 bg-current opacity-40" />
          <div className="mt-0.5 text-[8px] font-black leading-none">
            {shortPosition(player.position)}
          </div>
          {player.nationality ? (
            <div className="mt-1 text-[6px] font-semibold leading-none opacity-90">{player.nationality}</div>
          ) : null}
          <div className="mt-auto flex w-full flex-1 items-end justify-center pb-1">
            <span
              className="max-h-full text-[6px] font-black tracking-wide"
              style={{ writingMode: "vertical-rl" }}
            >
              {player.name}
            </span>
          </div>
        </div>

        {/* 中央：選手写真 */}
        <div className="relative h-full bg-slate-100">
          {player.photoUrl ? (
            <Image src={player.photoUrl} alt={player.name} fill className="object-cover" sizes="200px" />
          ) : (
            <PlayerSilhouette />
          )}
        </div>

        {/* 右：選手情報 */}
        <div className="relative flex h-full flex-col p-[2mm]">
          <div className="flex items-start justify-between gap-1">
            <div className="min-w-0">
              <div className="truncate text-[9px] font-black leading-tight text-gray-900">
                {player.name}
              </div>
              {player.subName ? (
                <div className="truncate text-[6px] font-semibold text-gray-500">{player.subName}</div>
              ) : null}
            </div>
            <div className="h-8 w-5 shrink-0">
              <PositionMap
                mainPosition={player.mainPosition}
                subPositions={player.subPositions}
                accentColor={accentColor}
              />
            </div>
          </div>

          <div className="mt-1 grid grid-cols-2 gap-x-2 gap-y-0.5 text-[5px]">
            <div>
              <span className="text-gray-500">身長/体重</span>
              <span className="ml-1 font-bold text-gray-900">
                {statValue(player.height, "cm")} / {statValue(player.weight, "kg")}
              </span>
            </div>
            <div>
              <span className="text-gray-500">年齢</span>
              <span className="ml-1 font-bold text-gray-900">{player.age != null ? `${player.age}歳` : "-"}</span>
            </div>
            <div>
              <span className="text-gray-500">利き足</span>
              <span className="ml-1 font-bold text-gray-900">{preferredFootLabel(player.preferredFoot)}</span>
            </div>
            <div>
              <span className="text-gray-500">契約</span>
              <span className="ml-1 font-bold text-gray-900">{contractEndLabel(player.contractEndDate) || "-"}</span>
            </div>
          </div>

          <div className="mt-1 text-[5px] leading-tight text-gray-700">
            <span className="text-gray-500">昨季:</span>{" "}
            <span className="font-bold">
              {player.lastSeasonSummary && player.lastSeasonSummary !== "-" ? player.lastSeasonSummary : "未登録"}
            </span>
          </div>

          <div className={`mt-0.5 text-[5px] leading-tight text-gray-700 ${showParameterGraph ? "line-clamp-2" : "line-clamp-4"}`}>
            {desc || ""}
          </div>

          {showParameterGraph ? (
            <div className="mt-auto flex items-center justify-center">
              <div className="h-12 w-auto">
                <PublicPlayerHexChart labels={labels} values={values} overall={overall} className="h-12 w-auto" accentColor={accentColor} />
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function FullBookletPlayerCard({
  player,
  accentColor,
  clubLogo,
  showParameterGraph = true,
}: {
  player: BookletPlayer;
  positionColorClass: string;
  accentColor?: string;
  clubLogo?: string | null;
  showParameterGraph?: boolean;
}) {
  const color = accentColor || "#E0574C";
  const contrastColor = getContrastTextColor(color);
  const stripStyle = { backgroundColor: color, color: contrastColor };

  const labels = player.params?.items?.map((i) => i.label) ?? ["", "", "", "", "", ""];
  const values = player.params?.items?.map((i) => i.value) ?? [0, 0, 0, 0, 0, 0];
  const overall = typeof player.params?.overall === "number" ? player.params.overall : 0;

  const profile = (player.memo || "").trim() || (player.profile || "");

  return (
    <div className="w-full overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="grid grid-cols-1 md:grid-cols-[1.1fr_1.8fr] gap-4 md:gap-6 p-4 md:p-6">
        {/* 左側：縦帯＋写真 */}
        <div className="relative grid grid-cols-[72px_1fr] h-72 md:h-96 overflow-hidden rounded-xl bg-slate-100">
          {/* クラブカラー縦帯 */}
          <div
            className="booklet-color-strip flex flex-col items-center py-4 text-center z-10"
            style={stripStyle}
          >
            <div className="text-5xl md:text-6xl font-black leading-none">{player.number ?? "-"}</div>
            <div className="my-3 h-px w-10 bg-current opacity-40" />
            <div className="text-base md:text-lg font-black leading-none">{shortPosition(player.position)}</div>
            {player.nationality ? (
              <div className="mt-2 text-xs md:text-sm font-semibold opacity-90">{player.nationality}</div>
            ) : null}
            <div className="mt-auto w-full flex-1 flex items-end justify-center pb-4">
              <span
                className="max-h-full text-sm md:text-base font-black tracking-wide"
                style={{ writingMode: "vertical-rl" }}
              >
                {player.name}
              </span>
            </div>
          </div>

          {/* 選手写真 */}
          <div className="relative h-full w-full bg-slate-100">
            {player.photoUrl ? (
              <Image
                src={player.photoUrl}
                alt={player.name}
                fill
                className="object-cover"
                sizes="(max-width: 768px) 100vw, 45vw"
              />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-400">
                <svg viewBox="0 0 64 64" className="h-16 w-16" aria-hidden="true">
                  <circle cx="32" cy="22" r="10" fill="currentColor" opacity="0.55" />
                  <path d="M12 56c2.4-12 10.2-20 20-20s17.6 8 20 20" fill="currentColor" opacity="0.35" />
                </svg>
                <div className="text-sm font-semibold tracking-wide">NO PHOTO</div>
              </div>
            )}
          </div>
        </div>

        {/* 右側：選手情報 */}
        <div className="flex flex-col gap-4">
          {/* 名前 / クラブエンブレム / ポジションマップ */}
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h3 className="text-3xl md:text-4xl font-black leading-tight text-gray-900 truncate">
                {player.name}
              </h3>
              {player.subName ? (
                <p className="text-base md:text-lg font-semibold text-gray-500 truncate mt-1">{player.subName}</p>
              ) : null}
            </div>
            <div className="shrink-0 flex items-start gap-2">
              {clubLogo ? (
                <div className="relative h-14 w-14 md:h-16 md:w-16">
                  <Image src={clubLogo} alt="club" fill className="object-contain" sizes="64px" />
                </div>
              ) : null}
              <div className="h-20 w-14 md:h-24 md:w-18 rounded-md border border-gray-200 bg-white overflow-hidden">
                <PositionMap
                  mainPosition={player.mainPosition}
                  subPositions={player.subPositions}
                  accentColor={color}
                />
              </div>
            </div>
          </div>

          {/* 基本情報 */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm md:text-base border-b border-gray-100 pb-4">
            <div className="space-y-2">
              <div className="flex items-baseline gap-2">
                <span className="text-gray-500 w-20 shrink-0">身長 / 体重</span>
                <span className="font-bold text-gray-900">
                  {statValue(player.height, "cm")} / {statValue(player.weight, "kg")}
                </span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-gray-500 w-20 shrink-0">年齢</span>
                <span className="font-bold text-gray-900">{player.age != null ? `${player.age}歳` : "-"}</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-gray-500 w-20 shrink-0">利き足</span>
                <span className="font-bold text-gray-900">{preferredFootLabel(player.preferredFoot)}</span>
              </div>
            </div>
            <div className="space-y-2 border-l border-gray-100 pl-6">
              <div className="flex items-baseline gap-2">
                <span className="text-gray-500 w-14 shrink-0">契約</span>
                <span className="font-bold text-gray-900">{contractDisplay(player)}</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-gray-500 w-14 shrink-0">昨季成績</span>
                <span className="font-bold text-gray-900">
                  {player.lastSeasonSummary && player.lastSeasonSummary !== "-" ? player.lastSeasonSummary : "未登録"}
                </span>
              </div>
            </div>
          </div>

          {/* プロフィール */}
          <div className="text-sm md:text-base leading-relaxed text-gray-700 line-clamp-3">
            {profile || "プロフィール未入力"}
          </div>

          {/* 能力パラメーター */}
          {showParameterGraph ? (
            <div className="mt-auto rounded-xl border border-gray-100 bg-gray-50 p-4 md:p-5">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-6 rounded-full" style={{ backgroundColor: color }} />
                  <div>
                    <div className="text-base md:text-lg font-black text-gray-900 leading-none">能力パラメーター</div>
                    <div className="text-[10px] md:text-xs text-gray-400 tracking-wider mt-0.5">PLAYER ANALYSIS</div>
                  </div>
                </div>
                <div className="text-xs text-gray-400 font-medium">/ 100</div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 divide-y md:divide-y-0 md:divide-x divide-gray-200">
                <div className="md:pr-6">
                  <PublicPlayerHexChart
                    labels={labels}
                    values={values}
                    overall={overall}
                    className="mx-auto block h-48 md:h-52 w-auto max-w-[240px]"
                    accentColor={color}
                  />
                </div>
                <div className="md:pl-6 pt-4 md:pt-0">
                  <PlayerAbilityBarList labels={labels} values={values} accentColor={color} />
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
