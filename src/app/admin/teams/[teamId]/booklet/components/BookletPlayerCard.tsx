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
  const hasData = labels.some((l) => l.trim()) || values.some((v) => v > 0);
  if (!hasData) {
    return <p className="text-sm text-gray-400">能力データ未登録</p>;
  }
  return (
    <div className="flex flex-col justify-center gap-2 h-full">
      {labels.map((label, i) => {
        const value = Math.max(0, Math.min(99, Number(values[i]) || 0));
        if (!label.trim() && value === 0) return null;
        return (
          <div key={i} className="flex items-center gap-2">
            <span className="w-16 shrink-0 text-xs font-medium text-gray-600 truncate">{label.trim() || "-"}</span>
            <div className="flex-1 h-2.5 rounded-full bg-gray-100 overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{ width: `${value}%`, backgroundColor: barColor }}
              />
            </div>
            <span className="w-8 text-right text-xs font-bold text-gray-800 tabular-nums">{value}</span>
          </div>
        );
      })}
    </div>
  );
}

export function BookletPlayerCard({
  player,
  positionColorClass,
  accentColor,
  showParameterGraph = true,
  mode = "compact",
}: {
  player: BookletPlayer;
  positionColorClass: string;
  accentColor?: string;
  showParameterGraph?: boolean;
  mode?: "compact" | "full";
}) {
  if (mode === "full") {
    return <FullBookletPlayerCard player={player} positionColorClass={positionColorClass} accentColor={accentColor} showParameterGraph={showParameterGraph} />;
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
  showParameterGraph = true,
}: {
  player: BookletPlayer;
  positionColorClass: string;
  accentColor?: string;
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
      {/* ヘッダー：クラブ名なし、選手のみ */}
      <div className="grid grid-cols-1 md:grid-cols-[1.1fr_1.6fr] gap-4 p-4 md:p-6">
        {/* 左側：縦帯＋写真 */}
        <div className="relative grid grid-cols-[48px_1fr] h-64 md:h-80 overflow-hidden rounded-xl bg-slate-100">
          {/* クラブカラー縦帯 */}
          <div
            className="booklet-color-strip flex flex-col items-center py-3 text-center z-10"
            style={stripStyle}
          >
            <div className="text-3xl font-black leading-none">{player.number ?? "-"}</div>
            <div className="my-2 h-px w-8 bg-current opacity-40" />
            <div className="text-sm font-black leading-none">{shortPosition(player.position)}</div>
            {player.nationality ? (
              <div className="mt-2 text-xs font-semibold opacity-90">{player.nationality}</div>
            ) : null}
            <div className="mt-auto w-full flex-1 flex items-end justify-center pb-3">
              <span
                className="max-h-full text-xs font-black tracking-wide"
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
                sizes="(max-width: 768px) 100vw, 50vw"
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
        <div className="flex flex-col gap-3">
          {/* 名前とポジションマップ */}
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h3 className="text-2xl font-black leading-tight text-gray-900 truncate">
                {player.name}
              </h3>
              {player.subName ? (
                <p className="text-sm font-semibold text-gray-500 truncate mt-1">{player.subName}</p>
              ) : null}
              <p className="text-sm text-gray-500 mt-0.5">{player.mainPosition || player.position}</p>
            </div>
            <div className="shrink-0 h-20 w-14">
              <PositionMap
                mainPosition={player.mainPosition}
                subPositions={player.subPositions}
                accentColor={color}
              />
            </div>
          </div>

          {/* 基本情報（2カラム） */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm border-b border-gray-100 pb-3">
            <div className="space-y-1">
              <div>
                <span className="text-gray-500 text-xs">身長 / 体重</span>
                <div className="font-bold text-gray-900">
                  {statValue(player.height, "cm")} / {statValue(player.weight, "kg")}
                </div>
              </div>
              <div>
                <span className="text-gray-500 text-xs">年齢</span>
                <div className="font-bold text-gray-900">{player.age != null ? `${player.age}歳` : "-"}</div>
              </div>
              <div>
                <span className="text-gray-500 text-xs">利き足</span>
                <div className="font-bold text-gray-900">{preferredFootLabel(player.preferredFoot)}</div>
              </div>
            </div>
            <div className="space-y-1 border-l border-gray-100 pl-4">
              <div>
                <span className="text-gray-500 text-xs">契約</span>
                <div className="font-bold text-gray-900">{contractEndLabel(player.contractEndDate) || "-"}</div>
              </div>
              <div>
                <span className="text-gray-500 text-xs">昨季成績</span>
                <div className="font-bold text-gray-900">
                  {player.lastSeasonSummary && player.lastSeasonSummary !== "-" ? player.lastSeasonSummary : "未登録"}
                </div>
              </div>
            </div>
          </div>

          {/* プロフィール */}
          <div className="text-sm leading-relaxed text-gray-700 line-clamp-3">
            {profile || "プロフィール未入力"}
          </div>

          {/* 能力パラメーター */}
          {showParameterGraph ? (
            <div className="mt-auto rounded-xl border border-gray-100 bg-gray-50 p-3 md:p-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 divide-y md:divide-y-0 md:divide-x divide-gray-200">
                <div className="md:pr-4">
                  <PublicPlayerHexChart
                    labels={labels}
                    values={values}
                    overall={overall}
                    className="h-40 w-auto"
                    accentColor={color}
                  />
                </div>
                <div className="md:pl-4 pt-3 md:pt-0">
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
