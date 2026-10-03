"use client";

import type { ReactNode } from "react";
import { FaFutbol } from "react-icons/fa";
import { GiRunningShoe } from "react-icons/gi";
import { formatMinute } from "@/lib/formatMinute";

export interface LineupPlayerDisplay {
  name: string;
  number?: number;
  photoUrl?: string;
  rating?: number | null;
  goals?: number;
  assists?: number;
  yellowCards?: number;
  redCards?: number;
  subInMinute?: number;
  subOutMinute?: number;
}

const ratingBadgeClass = (rating: number, hasRating: boolean, highestRating: number | null) =>
  !hasRating
    ? "bg-slate-700/80"
    : highestRating !== null && rating === highestRating
      ? "bg-violet-500/85"
      : rating >= 7
        ? "bg-emerald-500/90"
        : "bg-orange-500/90";

/**
 * 公開ページと共通のラインナップピッチ枠。
 * children には各スロットの絶対配置ノードを渡す。
 * formationBadge / topLeft を差し替えると管理画面側の編集UIを載せられる。
 */
export function LineupPitch({
  formation,
  children,
  formationBadge,
  topLeft,
}: {
  formation: string;
  children: ReactNode;
  formationBadge?: ReactNode;
  topLeft?: ReactNode;
}) {
  return (
    <div className="relative w-screen ml-[calc(50%-50vw)] md:ml-0 md:w-full">
      <div className="relative mx-auto aspect-[5/6.5] w-full overflow-hidden bg-[#0f1722] sm:aspect-[5/6.5] sm:max-w-[520px] rounded-lg">
        {formationBadge ?? (
          <div className="absolute right-3 top-3 z-20 rounded-full border border-slate-600 bg-slate-950/70 px-2 py-1 text-[10px] font-black tracking-wide text-white shadow-sm">
            {formation}
          </div>
        )}
        {topLeft}
        <div className="absolute inset-x-[4px] inset-y-[2px] border-2 border-slate-400/12" />
        <div className="absolute inset-x-[28%] top-[2px] h-[13%] border-x-2 border-b-2 border-slate-400/12" />
        <div className="absolute inset-x-[38%] top-[2px] h-[6%] border-x-2 border-b-2 border-slate-400/12" />
        <div className="absolute inset-x-[28%] bottom-[2px] h-[13%] border-x-2 border-t-2 border-slate-400/12" />
        <div className="absolute inset-x-[38%] bottom-[2px] h-[6%] border-x-2 border-t-2 border-slate-400/12" />
        <div className="absolute inset-x-[4px] top-1/2 h-px bg-slate-400/12" />
        <div className="absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-slate-400/12" />
        <div className="absolute inset-0 bg-[repeating-linear-gradient(0deg,rgba(255,255,255,0.018)_0px,rgba(255,255,255,0.018)_52px,transparent_52px,transparent_104px)]" />
        {children}
      </div>
    </div>
  );
}

/** スロットをピッチ座標に絶対配置するラッパー（公開・管理共通）。 */
export function PitchSlotAnchor({
  x,
  y,
  children,
}: {
  x: number;
  y: number;
  children: ReactNode;
}) {
  return (
    <div
      className="absolute -translate-x-1/2 -translate-y-1/2"
      style={{ left: `${x}%`, top: `${y}%` }}
    >
      {children}
    </div>
  );
}

/**
 * 公開ページと同一マークアップの PlayerNode。
 * overlay: ノード全体に被せる編集レイヤー（モバイルボタン/透明select等）
 * ratingOverlay: 評価点バッジ位置に被せる編集レイヤー
 * alwaysShowRating: 未評価でもバッジ枠を表示（管理画面で評価点を入力しやすくする用）
 */
export function PlayerNode({
  player,
  highestRating,
  alwaysShowRating = false,
  overlay,
  ratingOverlay,
}: {
  player: LineupPlayerDisplay;
  highestRating: number | null;
  alwaysShowRating?: boolean;
  overlay?: ReactNode;
  ratingOverlay?: ReactNode;
}) {
  const goalsValue = Number(player.goals) || 0;
  const assistsValue = Number(player.assists) || 0;
  const yellowValue = Number(player.yellowCards) || 0;
  const redValue = Number(player.redCards) || 0;
  const showRedCard = redValue > 0 || yellowValue >= 2;
  const subOutMinute = player.subOutMinute;
  const subInMinute = player.subInMinute;
  const ratingNumber = Number(player.rating) || 0;
  const hasRating = Number.isFinite(ratingNumber) && ratingNumber > 0;
  const ratingValue = hasRating ? ratingNumber.toFixed(1) : "-";
  const ratingClassName = ratingBadgeClass(ratingNumber, hasRating, highestRating);

  return (
    <div className="relative flex w-[72px] flex-col items-center gap-0.5 overflow-visible sm:w-[96px]">
      {overlay}
      <div className="relative flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full border-2 border-white/90 bg-slate-500/30 shadow-[0_0_0_2px_rgba(255,255,255,0.12)] sm:h-[54px] sm:w-[54px]">
        {player.photoUrl ? (
          <div
            className="h-full w-full rounded-full bg-slate-600/70 bg-cover bg-center"
            style={{ backgroundImage: `url(${player.photoUrl})` }}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-slate-200/90">
            <div className="relative h-5 w-5 rounded-full border border-current before:absolute before:left-1/2 before:top-[62%] before:h-2.5 before:w-5 before:-translate-x-1/2 before:rounded-t-full before:border before:border-b-0 before:border-current sm:h-6 sm:w-6 sm:before:h-3 sm:before:w-5" />
          </div>
        )}
        {/* 左上: 交代OUT / IN */}
        {typeof subOutMinute === "number" ? (
          <div className="absolute -left-1 -top-2 z-20 flex flex-col items-center gap-0.5">
            <span className="text-[9px] font-bold leading-none text-white/90 tabular-nums sm:text-[10px]">
              {formatMinute(subOutMinute)}&apos;
            </span>
            <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-red-500 shadow-sm ring-1 ring-white/15" aria-label="交代OUT">
              <svg viewBox="0 0 10 10" className="h-2.5 w-2.5 fill-none stroke-white" aria-hidden="true">
                <path d="M2 3h6L6 1M8 7H2l2 2" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </div>
        ) : typeof subInMinute === "number" ? (
          <div className="absolute -left-1 -top-2 z-20 flex flex-col items-center gap-0.5">
            <span className="text-[9px] font-bold leading-none text-white/90 tabular-nums sm:text-[10px]">
              {formatMinute(subInMinute)}&apos;
            </span>
            <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-emerald-500 shadow-sm ring-1 ring-white/15" aria-label="交代IN">
              <svg viewBox="0 0 10 10" className="h-2.5 w-2.5 fill-none stroke-white" aria-hidden="true">
                <path d="M8 3H2l2-2M2 7h6L6 9" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </div>
        ) : null}
        {/* 右上: 評価点 */}
        {hasRating || alwaysShowRating ? (
          <span aria-label={`評価点 ${ratingValue}`} className={`absolute -right-1.5 -top-1 z-20 inline-flex h-4 min-w-[24px] items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none text-white shadow-sm ${ratingClassName}`}>
            {ratingValue}
          </span>
        ) : null}
        {ratingOverlay}
      </div>
      <div className="w-[72px] truncate text-center text-[10px] font-extrabold uppercase leading-none text-slate-50 sm:w-[96px] sm:text-[11px]">
        {player.number ? <span className="font-semibold text-slate-400">{player.number} </span> : null}{player.name}
      </div>
      {/* EVENT BAR（固定高で選手配置のズレを防ぐ） */}
      <div className="flex h-[18px] shrink-0 items-center justify-center">
        {goalsValue > 0 || assistsValue > 0 || yellowValue > 0 || showRedCard ? (
          <div className="flex items-center gap-px" aria-label="試合イベント">
            {goalsValue > 0 ? (
              <span aria-label={`ゴール ${goalsValue}`} className="inline-flex h-[18px] shrink-0 items-center gap-px rounded-[4px] border border-white/5 bg-slate-950/65 px-0.5 text-[10px] font-bold leading-none text-white tabular-nums">
                <span className="inline-flex h-3 w-3 shrink-0 items-center justify-center rounded-full bg-white">
                  <FaFutbol className="h-3 w-3 shrink-0 text-[#0b111d]" aria-hidden="true" />
                </span>
                <span>{goalsValue}</span>
              </span>
            ) : null}
            {assistsValue > 0 ? (
              <span aria-label={`アシスト ${assistsValue}`} className="inline-flex h-[18px] shrink-0 items-center gap-px rounded-[4px] border border-white/5 bg-slate-950/65 px-0.5 text-[10px] font-bold leading-none text-white tabular-nums">
                <GiRunningShoe className="h-3 w-3 shrink-0 rotate-[35deg]" aria-hidden="true" />
                <span>{assistsValue}</span>
              </span>
            ) : null}
            {yellowValue > 0 ? (
              <span aria-label="イエローカード" className="inline-flex h-[18px] w-[13px] shrink-0 items-center justify-center rounded-[4px] border border-white/5 bg-slate-950/65">
                <span className="h-3 w-[9px] rounded-[1px] bg-yellow-400" />
              </span>
            ) : null}
            {showRedCard ? (
              <span aria-label="レッドカード" className="inline-flex h-[18px] w-[13px] shrink-0 items-center justify-center rounded-[4px] border border-white/5 bg-slate-950/65">
                <span className="h-3 w-[9px] rounded-[1px] bg-red-500" />
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * 空きスロット（選手未登録）。PlayerNodeと同じ占有領域に「＋」を表示する。
 * overlay に編集レイヤー（選手追加用ボタン/透明select）を渡す。
 */
export function EmptySlotNode({
  label,
  overlay,
}: {
  label: string;
  overlay?: ReactNode;
}) {
  return (
    <div className="relative flex w-[72px] flex-col items-center gap-0.5 overflow-visible sm:w-[96px]">
      {overlay}
      <div className="relative flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full border-2 border-dashed border-white/35 bg-slate-500/20 shadow-[0_0_0_2px_rgba(255,255,255,0.12)] sm:h-[54px] sm:w-[54px]">
        <span className="text-2xl font-light leading-none text-white/75">+</span>
      </div>
      <div className="w-[72px] truncate text-center text-[10px] font-extrabold uppercase leading-none text-slate-400 sm:w-[96px] sm:text-[11px]">
        {label}
      </div>
      <div className="flex h-[18px] shrink-0 items-center justify-center" />
    </div>
  );
}

/**
 * 公開ページと同一マークアップの控え選手カード。
 * overlay / ratingOverlay は PlayerNode と同じ編集拡張点。
 */
export function SubstituteCard({
  player,
  highestRating,
  overlay,
  ratingOverlay,
}: {
  player: LineupPlayerDisplay;
  highestRating: number | null;
  overlay?: ReactNode;
  ratingOverlay?: ReactNode;
}) {
  const rating = Number(player.rating) || 0;
  const goals = Number(player.goals) || 0;
  const assists = Number(player.assists) || 0;
  const yellow = Number(player.yellowCards) || 0;
  const red = Number(player.redCards) || 0;
  const showRedCard = red > 0 || yellow >= 2;
  const hasRating = Number.isFinite(rating) && rating > 0;
  const hasSubIn = typeof player.subInMinute === "number";
  const hasSubOut = typeof player.subOutMinute === "number";
  const ratingText = hasRating ? rating.toFixed(1) : "-";
  const ratingClassName = ratingBadgeClass(rating, hasRating, highestRating);

  return (
    <div className="relative flex h-[138px] w-[86px] shrink-0 snap-start flex-col items-center justify-between rounded-lg border border-slate-700 bg-slate-900/50 p-2">
      {overlay}
      <div className="relative h-14 w-14 shrink-0">
        <div className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-white/90 bg-slate-500/30 shadow-[0_0_0_2px_rgba(255,255,255,0.12)]">
          {player.photoUrl ? (
            <div className="h-full w-full rounded-full bg-slate-600/70 bg-cover bg-center" style={{ backgroundImage: `url(${player.photoUrl})` }} />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-slate-200/90">
              <div className="relative h-5 w-5 rounded-full border border-current before:absolute before:left-1/2 before:top-[62%] before:h-2.5 before:w-5 before:-translate-x-1/2 before:rounded-t-full before:border before:border-b-0 before:border-current" />
            </div>
          )}
        </div>
        <span className={`absolute -right-1 -top-1 z-10 inline-flex h-4 min-w-[22px] items-center justify-center rounded-full px-1 text-[9px] font-bold leading-none text-white shadow-sm ${ratingClassName}`}>
          {ratingText}
        </span>
        {ratingOverlay}
      </div>
      <div className="w-full truncate text-center text-[10px] font-extrabold uppercase leading-none text-slate-50">
        {player.number ? <span className="font-semibold text-slate-400">{player.number} </span> : null}{player.name}
      </div>
      <div className="flex h-4 shrink-0 items-center justify-center gap-1 text-[9px] leading-none">
        {hasSubIn ? (
          <>
            <span className="text-emerald-500">↑</span>
            <span className="text-white/80 tabular-nums">{formatMinute(player.subInMinute as number)}&apos;</span>
          </>
        ) : null}
        {hasSubOut ? (
          <>
            <span className={`${hasSubIn ? "ml-1" : ""} text-red-500`}>↓</span>
            <span className="text-white/80 tabular-nums">{formatMinute(player.subOutMinute as number)}&apos;</span>
          </>
        ) : null}
        {!hasSubIn && !hasSubOut ? <span className="text-slate-400">－</span> : null}
      </div>
      <div className="flex h-[14px] shrink-0 items-center justify-center gap-px">
        {goals > 0 ? (
          <span className="inline-flex h-[14px] shrink-0 items-center gap-px rounded-[3px] border border-white/5 bg-slate-950/65 px-0.5 text-[8px] font-bold leading-none text-white tabular-nums">
            <span className="inline-flex h-2.5 w-2.5 shrink-0 items-center justify-center rounded-full bg-white">
              <FaFutbol className="h-2.5 w-2.5 shrink-0 text-[#0b111d]" aria-hidden="true" />
            </span>
            {goals}
          </span>
        ) : null}
        {assists > 0 ? (
          <span className="inline-flex h-[14px] shrink-0 items-center gap-px rounded-[3px] border border-white/5 bg-slate-950/65 px-0.5 text-[8px] font-bold leading-none text-white tabular-nums">
            <GiRunningShoe className="h-2.5 w-2.5 shrink-0 rotate-[35deg]" aria-hidden="true" />
            {assists}
          </span>
        ) : null}
        {yellow > 0 ? (
          <span className="inline-flex h-[14px] w-[11px] shrink-0 items-center justify-center rounded-[3px] border border-white/5 bg-slate-950/65">
            <span className="h-2.5 w-[7px] rounded-[1px] bg-yellow-400" />
          </span>
        ) : null}
        {showRedCard ? (
          <span className="inline-flex h-[14px] w-[11px] shrink-0 items-center justify-center rounded-[3px] border border-white/5 bg-slate-950/65">
            <span className="h-2.5 w-[7px] rounded-[1px] bg-red-500" />
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** Substitutes 一覧の末尾に置く管理画面用の「選手追加」カード。 */
export function AddSubCard({
  label = "選手追加",
  overlay,
}: {
  label?: string;
  overlay?: ReactNode;
}) {
  return (
    <div className="relative flex h-[138px] w-[86px] shrink-0 snap-start flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-600 bg-slate-900/30 p-2 text-slate-400">
      {overlay}
      <span className="pointer-events-none text-2xl font-light leading-none">+</span>
      <span className="pointer-events-none text-[10px] font-bold">{label}</span>
    </div>
  );
}
