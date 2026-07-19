"use client";

import type React from "react";
import { useState } from "react";
import Link from "next/link";
import type { BookletPlayer, BookletResponse } from "../../types";
import { ProPlanNotice } from "../../components/ProPlanNotice";
import { SlotButton } from "./SlotButton";
import { PreviewPanel } from "./PreviewPanel";
import { createEmptyLayout, normalizeA3Text, toCompetitionSeasonLabel } from "../lib/a3-layout";
import { formations } from "@/lib/formations";
import type { ActiveKey, LayoutState, SlotKey, StaffDoc, StatRow, TransferRow, CoachInfo } from "../types";

export function A3EditorView({
  isPro,
  embedded,
  teamId,
  season,
  data,
  loading,
  error,
  layout,
  setLayout,
  activeSlot,
  setActiveSlot,
  activeFormationPosId,
  setActiveFormationPosId,
  players,
  playersById,
  usedCardPlayerIds,
  formation,
  padPitchCoord,
  getAvailableStarters,
  colorOptions,
  getPositionColor,
  staffList,
  competitionNames,
  cupCompetitionNames,
  stats,
  transfers,
  coach,
  handleAssignTo,
  handleClear,
  handleClearAll,
  setExtraAt,
}: {
  isPro: boolean;
  embedded?: boolean;
  teamId: string;
  season: string;
  data: BookletResponse | null;
  loading: boolean;
  error: string | null;
  layout: LayoutState;
  setLayout: React.Dispatch<React.SetStateAction<LayoutState>>;
  activeSlot: ActiveKey;
  setActiveSlot: (v: ActiveKey) => void;
  activeFormationPosId: string | null;
  setActiveFormationPosId: (v: string | null) => void;
  players: BookletPlayer[];
  playersById: Map<string, BookletPlayer>;
  usedCardPlayerIds: Set<string>;
  formation: (typeof formations)[number];
  padPitchCoord: (v: number) => number;
  getAvailableStarters: (currentId: string | null) => BookletPlayer[];
  colorOptions: Array<{ name: string; value: string }>;
  getPositionColor: (position: string) => string;
  staffList: StaffDoc[];
  competitionNames: string[];
  cupCompetitionNames: string[];
  stats: StatRow[];
  transfers: TransferRow[];
  coach: CoachInfo;
  handleAssignTo: (slot: SlotKey, playerId: string | null) => void;
  handleClear: (slot: SlotKey) => void;
  handleClearAll: () => void;
  setExtraAt: (index: number, playerId: string | null) => void;
}) {
  const getAvailablePlayers = (currentId: string | null) => {
    return players.filter((p) => !usedCardPlayerIds.has(p.id) || p.id === currentId);
  };

  const steps = [
    { key: "intro", label: "紹介文" },
    { key: "formation", label: "フォーメーション" },
    { key: "colors", label: "帯色" },
    { key: "cards", label: "カード配置" },
    { key: "preview", label: "印刷プレビュー" },
  ] as const;
  const [activeStep, setActiveStep] = useState<(typeof steps)[number]["key"]>("intro");
  const activeStepIndex = steps.findIndex((step) => step.key === activeStep);
  const goPrevStep = () => setActiveStep(steps[Math.max(0, activeStepIndex - 1)].key);
  const goNextStep = () => setActiveStep(steps[Math.min(steps.length - 1, activeStepIndex + 1)].key);

  if (!isPro) {
    return <ProPlanNotice />;
  }

  return (
    <div className="min-h-screen bg-[#F3F4F7] px-4 py-8 text-[#1B1F27]">
      <div className={`mx-auto w-full transition-[max-width] duration-200 ${activeStep === "cards" ? "max-w-[1360px]" : "max-w-[640px]"}`}>
      {!embedded ? (
        <>
          <div className="mb-5">
            <h1 className="text-[22px] font-bold leading-tight">選手名鑑を作成</h1>
            <div className="mt-2 text-[14px] font-semibold text-[#8A93A3]">
              {data?.teamName || ""} / {season}シーズン
            </div>
          </div>
        </>
      ) : null}

      {loading && <div className="text-sm text-muted-foreground">読み込み中...</div>}
      {error && <div className="text-sm text-red-600">{error}</div>}

      {!loading && !error && data ? (
        <div className="pb-24">
          <div className="no-print mb-7 overflow-x-auto pb-2">
            <div className="flex min-w-[620px] items-center gap-2">
              {steps.map((step, index) => {
                const isActive = activeStep === step.key;
                const isDone = index < activeStepIndex;
                return (
                  <div key={step.key} className="flex flex-1 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setActiveStep(step.key)}
                      className={`flex items-center gap-2 whitespace-nowrap text-[13px] font-bold transition ${isActive ? "text-[#1B1F27]" : isDone ? "text-[#6B7280]" : "text-[#9CA3AF]"}`}
                    >
                      <span className={`flex h-8 w-8 items-center justify-center rounded-full border text-[13px] font-bold ${isActive ? "border-[#3355FF] bg-[#3355FF] text-white" : isDone ? "border-[#39A66A] bg-[#39A66A] text-white" : "border-[#D9DDE5] bg-white text-[#9CA3AF]"}`}>
                        {isDone ? "✓" : index + 1}
                      </span>
                      {step.label}
                    </button>
                    {index < steps.length - 1 ? <div className="h-px flex-1 bg-[#E2E4EA]" /> : null}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6">
          {activeStep === "intro" ? (
          <div className="border rounded-lg bg-white p-4">
            <div className="text-sm font-semibold mb-3">紹介文</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="text-xs text-gray-700 block">
                <div className="font-semibold mb-1">タイトル</div>
                <input
                  className="w-full border border-gray-300 rounded-md px-2 py-1 text-sm"
                  value={layout.bioTitle || ""}
                  onChange={(e) =>
                    setLayout((prev) => ({
                      ...prev,
                      bioTitle: normalizeA3Text(e.target.value),
                    }))
                  }
                  placeholder="例：今季の目標"
                />
              </label>
              <label className="text-xs text-gray-700 block">
                <div className="font-semibold mb-1">本文</div>
                <textarea
                  className="w-full border border-gray-300 rounded-md px-2 py-1 text-sm min-h-[92px]"
                  value={layout.bioBody || ""}
                  onChange={(e) =>
                    setLayout((prev) => ({
                      ...prev,
                      bioBody: normalizeA3Text(e.target.value),
                    }))
                  }
                  placeholder="チームの特徴や今季の目標など"
                />
              </label>
            </div>
          </div>
          ) : null}

          {activeStep === "formation" ? (
          <div className="rounded-xl border border-[#DDE2EA] bg-white p-7 shadow-sm">
            <div className="mb-6">
              <div className="text-[16px] font-bold text-[#1B1F27]">配置(A3横・概略)</div>
              <p className="mt-2 text-[13px] font-semibold text-[#8A93A3]">フォーメーションを選び、ピッチ上のポジションをクリックして選手を割り当てます。</p>
            </div>

            <label className="mb-5 block">
              <div className="mb-2 text-[13px] font-bold text-[#1B1F27]">フォーメーション選択</div>
              <select
                className="h-12 w-full rounded-lg border border-[#DDE2EA] bg-white px-4 text-[15px] font-semibold text-[#1B1F27]"
                value={formation.name}
                onChange={(e) => {
                  const nextFormationName = String(e.target.value || "").trim();
                  const nextFormation = formations.find((f) => f.name === nextFormationName) || formations[0];

                  setLayout((prev) => {
                    const prevStarters = prev.starters || {};
                    const selectedIds = Object.values(prevStarters).map((v) => String(v || "").trim()).filter((v) => !!v);
                    const uniqSelected: string[] = [];
                    for (const id of selectedIds) {
                      if (!uniqSelected.includes(id)) uniqSelected.push(id);
                    }
                    const nextStarters: Record<string, string | null> = {};
                    const used = new Set<string>();
                    for (const pos of nextFormation.positions) {
                      const existing = String(prevStarters[pos.id] || "").trim();
                      if (existing && !used.has(existing)) {
                        nextStarters[pos.id] = existing;
                        used.add(existing);
                      }
                    }
                    let poolIndex = 0;
                    for (const pos of nextFormation.positions) {
                      if (nextStarters[pos.id]) continue;
                      while (poolIndex < uniqSelected.length && used.has(uniqSelected[poolIndex])) poolIndex++;
                      if (poolIndex < uniqSelected.length) {
                        nextStarters[pos.id] = uniqSelected[poolIndex];
                        used.add(uniqSelected[poolIndex]);
                        poolIndex++;
                      } else {
                        nextStarters[pos.id] = null;
                      }
                    }
                    return { ...prev, formationName: nextFormationName, starters: nextStarters };
                  });

                  if (nextFormation.positions.length > 0) setActiveFormationPosId(nextFormation.positions[0].id);
                }}
              >
                {formations.map((f) => (
                  <option key={f.name} value={f.name}>{f.name}</option>
                ))}
              </select>
            </label>

            <div className="mb-5 text-[13px] font-bold text-[#1B1F27]">ポジション選択(〇をクリック)</div>
            <div className="relative mb-5 aspect-[16/11] w-full overflow-hidden rounded-lg border-2 border-[#B7C3CE] bg-[#276B4B] shadow-inner">
              <svg viewBox="0 0 100 66" className="absolute inset-0 h-full w-full">
                <rect x="0" y="0" width="100" height="66" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="0.7" />
                <line x1="0" y1="33" x2="100" y2="33" stroke="rgba(255,255,255,0.45)" strokeWidth="0.7" />
                <circle cx="50" cy="33" r="8" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="0.7" />
              </svg>
              {formation.positions.map((pos) => {
                const isActive = activeFormationPosId === pos.id;
                const x = padPitchCoord(pos.coordinates.x);
                const y = padPitchCoord(pos.coordinates.y);
                return (
                  <button
                    key={pos.id}
                    type="button"
                    onClick={() => setActiveFormationPosId(pos.id)}
                    className={`absolute flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-[10px] font-bold shadow-md transition ${isActive ? "bg-[#FFC53D] text-[#1B1F27] ring-2 ring-white" : "bg-white text-[#25313D] hover:scale-105"}`}
                    style={{ left: `${100 - x}%`, top: `${100 - y}%` }}
                  >
                    {pos.label}
                  </button>
                );
              })}
            </div>

            {(() => {
              const pos = formation.positions.find((p) => p.id === activeFormationPosId) || null;
              const currentId = pos ? (layout.starters || {})[pos.id] || null : null;
              return (
                <div className="mb-6 grid grid-cols-[auto_1fr_auto] items-center gap-3">
                  <div className="rounded-md bg-[#EEF2FF] px-3 py-3 text-[13px] font-bold text-[#3355FF]">選択中: {pos?.label || "-"}</div>
                  <select
                    className="h-12 min-w-0 rounded-lg border border-[#DDE2EA] bg-white px-4 text-[14px] font-semibold text-[#1B1F27]"
                    value={currentId || ""}
                    disabled={!pos}
                    onChange={(e) => {
                      if (!pos) return;
                      const v = String(e.target.value || "").trim();
                      setLayout((prev) => ({
                        ...prev,
                        starters: { ...(prev.starters || {}), [pos.id]: v || null },
                      }));
                    }}
                  >
                    <option value="">未設定</option>
                    {getAvailableStarters(currentId).map((p) => (
                      <option key={p.id} value={p.id}>{(p.number != null ? String(p.number) : "-") + " " + p.name}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="h-12 rounded-lg border border-[#DDE2EA] bg-white px-4 text-[14px] font-bold text-[#1B1F27]"
                    onClick={() => {
                      if (!pos) return;
                      setLayout((prev) => ({
                        ...prev,
                        starters: { ...(prev.starters || {}), [pos.id]: null },
                      }));
                    }}
                  >
                    クリア
                  </button>
                </div>
              );
            })()}

            <div>
              <div className="mb-3 text-[13px] font-bold text-[#1B1F27]">先発11人(選択中ポジションに割当)</div>
              <div className="space-y-2">
                {formation.positions.map((pos) => {
                  const currentId = (layout.starters || {})[pos.id] || null;
                  const player = currentId ? playersById.get(currentId) || null : null;
                  const isActive = activeFormationPosId === pos.id;
                  return (
                    <button
                      key={pos.id}
                      type="button"
                      onClick={() => setActiveFormationPosId(pos.id)}
                      className={`flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left transition ${isActive ? "border-[#3355FF] bg-[#EEF2FF] ring-1 ring-[#3355FF]" : "border-[#E2E4EA] bg-white hover:bg-[#F8F9FB]"}`}
                    >
                      <span className={`flex h-6 min-w-10 items-center justify-center rounded px-2 text-[11px] font-bold text-white ${isActive ? "bg-[#F27D8B]" : "bg-[#5E83F1]"}`}>{pos.label}</span>
                      <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-[#8A93A3]">
                        {player ? `${player.number != null ? String(player.number) : "-"} ${player.name}` : "未設定"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          ) : null}

          {activeStep === "colors" ? (
          <div className="border rounded-lg bg-white p-4">
            <div className="text-sm font-semibold mb-3">帯色設定</div>
            <div className="rounded-md border bg-white p-3">
              <div className="text-xs font-semibold text-gray-700 mb-2">帯の色（ポジション別）</div>
              <div className="grid grid-cols-2 gap-2">
                {([
                  ["GK", (layout as any).positionColors?.GK],
                  ["DF", (layout as any).positionColors?.DF],
                  ["MF", (layout as any).positionColors?.MF],
                  ["FW", (layout as any).positionColors?.FW],
                ] as Array<["GK" | "DF" | "MF" | "FW", string]>).map(([k, v]) => (
                  <label key={k} className="flex items-center gap-2">
                    <span className="w-10 text-[11px] font-semibold text-gray-700">{k}</span>
                    <select
                      className="flex-1 border border-gray-300 rounded-md px-2 py-1 text-[11px]"
                      value={v || (createEmptyLayout() as any).positionColors[k]}
                      onChange={(e) =>
                        setLayout((prev) => ({
                          ...prev,
                          positionColors: {
                            ...(prev as any).positionColors,
                            [k]: e.target.value,
                          },
                        }))
                      }
                    >
                      {colorOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.name}
                        </option>
                      ))}
                    </select>
                    <div className={`w-5 h-5 rounded ${v || (createEmptyLayout() as any).positionColors[k]}`} />
                  </label>
                ))}
              </div>
            </div>
          </div>
          ) : null}

          {activeStep === "cards" ? (
          <div className="rounded-xl border border-[#DDE2EA] bg-white p-4 shadow-sm md:p-6">
            <div className="mb-4 flex flex-col gap-1 md:mb-5 md:flex-row md:items-end md:justify-between">
              <div>
                <div className="text-[16px] font-bold text-[#1B1F27]">カード配置</div>
                <p className="mt-1 text-[12px] font-semibold text-[#8A93A3] md:hidden">横にスライドして左右の配置を編集できます。</p>
              </div>
            </div>
            <div className="-mx-4 overflow-x-auto px-4 pb-3 md:mx-0 md:px-0">
            <div className="grid min-w-[1100px] grid-cols-[1fr_1fr] gap-5 lg:min-w-0 xl:gap-6">
              <div className="relative rounded-xl border border-[#DDE2EA] bg-[#F8F9FB] p-4 min-h-[600px]">
                <div className="text-xs font-semibold text-gray-600 mb-2">左側（下から3×4 / 12枚）</div>
                <div className="mt-3 absolute left-4 right-4 bottom-4">
                  <div className="grid grid-cols-3 gap-3">
                    {Array.from({ length: 12 }).map((_, i) => {
                      const key = `l${i}` as SlotKey;
                      const pid = layout.slots[key];
                      const player = pid ? playersById.get(pid) || null : null;
                      const pos = player?.mainPosition || player?.position || "";
                      return (
                        <SlotButton
                          key={key}
                          active={activeSlot === key}
                          label={`L${i + 1}`}
                          player={player}
                          positionColorClass={getPositionColor(pos)}
                          options={getAvailablePlayers(pid || null)}
                          onClick={() => setActiveSlot(key)}
                          onAssign={(playerId) => handleAssignTo(key, playerId)}
                          onClear={() => handleClear(key)}
                        />
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="relative rounded-xl border border-[#DDE2EA] bg-[#F8F9FB] p-4 min-h-[600px]">
                <div className="text-xs font-semibold text-gray-600 mb-3">右側（上から3×4 / 12枠）</div>
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-3">
                    {Array.from({ length: 12 }).map((_, i) => {
                      const key = `r${i}` as SlotKey;
                      const pid = layout.slots[key];
                      const player = pid ? playersById.get(pid) || null : null;
                      const pos = player?.mainPosition || player?.position || "";
                      return (
                        <SlotButton
                          key={key}
                          active={activeSlot === key}
                          label={`R${i + 1}`}
                          player={player}
                          positionColorClass={getPositionColor(pos)}
                          options={getAvailablePlayers(pid || null)}
                          onClick={() => setActiveSlot(key)}
                          onAssign={(playerId) => handleAssignTo(key, playerId)}
                          onClear={() => handleClear(key)}
                        />
                      );
                    })}
                  </div>

                  <div className="rounded-md border bg-white p-3">
                    <div className="text-xs font-semibold text-gray-700 mb-2">追加選手（最大5名）</div>
                    <div className="grid grid-cols-5 gap-3">
                      {Array.from({ length: 5 }).map((_, i) => {
                        const pid = layout.extras[i] || null;
                        const player = pid ? playersById.get(pid) || null : null;
                        const key = `e${i}` as ActiveKey;
                        const pos = player?.mainPosition || player?.position || "";
                        return (
                          <SlotButton
                            key={key}
                            active={activeSlot === key}
                            label={`E${i + 1}`}
                            player={player}
                            positionColorClass={getPositionColor(pos)}
                            options={getAvailablePlayers(pid)}
                            onClick={() => setActiveSlot(key)}
                            onAssign={(playerId) => setExtraAt(i, playerId)}
                            onClear={() => setExtraAt(i, null)}
                          />
                        );
                      })}
                    </div>
                  </div>

                  <div className="rounded-md border bg-white p-3">
                    <div className="text-xs font-semibold text-gray-700 mb-2">監督（スタッフから選択）</div>
                    <select
                      className="w-full border border-gray-300 rounded-md px-2 py-1 text-sm"
                      value={layout.coachStaffId || ""}
                      onChange={(e) => {
                        const v = String(e.target.value || "").trim();
                        setLayout((prev) => ({
                          ...prev,
                          coachStaffId: v ? v : null,
                        }));
                      }}
                    >
                      <option value="">自動（position=監督を優先）</option>
                      {(() => {
                        const seasonRaw = String(season || "").trim();
                        const seasonLabel = toCompetitionSeasonLabel(seasonRaw) || seasonRaw;
                        const published = (s: StaffDoc) => s.isPublished !== false;
                        const inSeason = (s: StaffDoc) => {
                          const arr = Array.isArray(s.seasons) ? s.seasons : [];
                          if (!seasonLabel) return true;
                          return arr.includes(seasonLabel) || arr.includes(seasonRaw);
                        };
                        const list = staffList
                          .filter((s) => published(s))
                          .sort((a, b) => {
                            const as = inSeason(a) ? 0 : 1;
                            const bs = inSeason(b) ? 0 : 1;
                            if (as !== bs) return as - bs;
                            return String(a.name || "").localeCompare(String(b.name || ""));
                          });
                        return list.map((s) => (
                          <option key={s.id} value={s.id}>
                            {String(s.name || "-")}
                            {String(s.position || "").trim() ? `（${String(s.position || "").trim()}）` : ""}
                          </option>
                        ));
                      })()}
                    </select>
                  </div>

                  <div className="rounded-md border bg-white p-3 text-xs text-gray-600">
                    印刷プレビューで表示内容を確認できます。大会・カップ戦などの補足情報は次のステップで設定してください。
                  </div>
                </div>
              </div>
            </div>
            </div>
          </div>
          ) : null}

          {activeStep === "preview" ? (
          <div className="border rounded-lg bg-white p-4">
            <div className="text-sm font-semibold mb-3">印刷プレビュー</div>
            <div className="mb-4 rounded-md border bg-gray-50 p-3">
              <PreviewPanel
                leagueCompetitionName={layout.leagueCompetitionName}
                competitionNames={competitionNames}
                onLeagueCompetitionNameChange={(next) =>
                  setLayout((prev) => ({
                    ...prev,
                    leagueCompetitionName: next,
                  }))
                }
                stats={stats}
                cupCompetitionNames={cupCompetitionNames}
                cups={layout.cups}
                onCupsChange={(next) =>
                  setLayout((prev) => ({
                    ...prev,
                    cups: next,
                  }))
                }
                transfers={transfers}
                coach={coach}
              />
            </div>
            <Link
              href={`/admin/teams/${encodeURIComponent(teamId)}/booklet/a3/print?season=${encodeURIComponent(season)}`}
              className="inline-flex w-full items-center justify-center rounded-md bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              印刷プレビューを開く
            </Link>
          </div>
          ) : null}
          </div>

          <div className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 px-4 py-3 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur">
            <div className="mx-auto flex max-w-4xl items-center justify-between gap-3">
              <button
                type="button"
                onClick={goPrevStep}
                disabled={activeStepIndex === 0}
                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 disabled:opacity-40"
              >
                戻る
              </button>
              <div className="min-w-0 text-center text-xs text-gray-500">
                <span className="font-mono">{activeStepIndex + 1}/{steps.length}</span>
                <span className="ml-2 font-semibold text-gray-700">{steps[activeStepIndex]?.label}</span>
              </div>
              <button
                type="button"
                onClick={goNextStep}
                disabled={activeStepIndex === steps.length - 1}
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
              >
                次へ
              </button>
            </div>
          </div>
        </div>
      ) : null}
      </div>
    </div>
  );
}
