import React from "react";
import Image from "next/image";
import { PublicPlayerHexChart } from "@/components/public-player-hex-chart";
import type { BookletPlayer } from "../types";
import { clampText, contractEndLabel, isAlphabetName, preferredFootLabel } from "../lib/booklet-utils";
import { PositionMap } from "./PositionMap";

export function BookletPlayerCard({
  player,
  positionColorClass,
}: {
  player: BookletPlayer;
  positionColorClass: string;
}) {
  const labels = player.params?.items?.map((i) => i.label) ?? ["", "", "", "", "", ""];
  const values = player.params?.items?.map((i) => i.value) ?? [0, 0, 0, 0, 0, 0];
  const overall = typeof player.params?.overall === "number" ? player.params.overall : 0;
  const desc = clampText((player.memo || "").trim() || (player.profile || ""), 80);

  return (
    <div className="relative border border-gray-200 bg-white h-[42mm]">
      {player.isNew ? (
        <div className="absolute top-0 right-0 z-[100] w-6 h-6 rounded-full bg-emerald-400 text-white flex items-center justify-center font-black shadow-sm translate-x-1/2 -translate-y-1/2 text-[8px]">
          NEW
        </div>
      ) : null}
      <div className="grid h-full" style={{ gridTemplateColumns: "6mm 1.1fr 1.2fr" }}>
        <div
          className={`booklet-color-strip ${positionColorClass} text-white flex flex-col items-center justify-start py-2 h-full rounded-l-md`}
        >
          <div className="flex flex-col items-center leading-none">
            <div className="text-base font-black leading-none font-source-han">{player.number ?? "-"}</div>
            <div className="mt-0.5 text-xs font-black tracking-wide font-source-han">
              {((player.position || "").toUpperCase().match(/^(FW|MF|DF|GK)$/)?.[1] as any) || ""}
            </div>
          </div>
          {isAlphabetName(player.name) ? (
            <div className="relative mt-auto w-full flex-1 overflow-visible">
              <span
                className="text-[10px] font-black tracking-wide leading-none font-source-han"
                style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%) rotate(-90deg)", transformOrigin: "center", whiteSpace: "nowrap", zIndex: 10 }}
              >
                {player.name}
              </span>
            </div>
          ) : (
            <div className="booklet-vertical-name text-[10px] font-black tracking-wide leading-none mt-auto font-source-han">
              {player.name}
            </div>
          )}
        </div>

        <div className="relative bg-gray-200 h-full">
          {player.photoUrl ? (
            <Image src={player.photoUrl} alt={player.name} fill className="object-cover" sizes="360px" />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-sm font-semibold text-gray-500">NoImage</div>
            </div>
          )}
        </div>

        <div className="relative bg-amber-50/60 pl-1 pr-0 py-1 h-full overflow-hidden flex flex-col">
          <div className="relative">
            <div className="text-[5px] font-semibold text-gray-800 leading-tight">
              <div className="text-[7px] leading-tight">
                {player.height != null ? `${player.height}cm` : "-"}/{player.weight != null ? `${player.weight}kg` : "-"}
              </div>
              <div className="font-semibold text-[7px] leading-tight">{player.age != null ? `${player.age}歳` : "-"}</div>
              <div className="font-semibold text-[7px] leading-tight">{preferredFootLabel(player.preferredFoot)}</div>
              <div className="font-semibold text-[7px] leading-tight flex gap-2">
                {player.tenureYears != null ? `${player.tenureYears}年目` : "-"}
                {contractEndLabel(player.contractEndDate)}
              </div>
              <div className="font-semibold text-[7px] leading-tight">{player.nationality ? <span className="font-semibold">{player.nationality}</span> : "-"}</div>
              <div className="font-semibold text-[7px] leading-tight">{player.lastSeasonSummary || "-"}</div>
            </div>
            <div className="absolute -top-1 right-0 p-1">
              <div className="w-6 h-10">
                <PositionMap mainPosition={player.mainPosition} subPositions={player.subPositions} />
              </div>
            </div>
          </div>

          <div className="text-[6px] text-gray-800 leading-tight overflow-hidden flex-none mt-1">{desc || ""}</div>

          <div className="mt-auto flex items-center justify-center">
            <div className="w-full max-w-[60px] h-auto">
              <PublicPlayerHexChart labels={labels} values={values} overall={overall} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
