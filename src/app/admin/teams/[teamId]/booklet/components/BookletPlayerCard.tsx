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

export function BookletPlayerCard({
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
              {isAlphabetName(player.name) ? player.name : player.name}
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
