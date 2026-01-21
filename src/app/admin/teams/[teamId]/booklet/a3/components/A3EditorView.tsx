"use client";

import type React from "react";
import Link from "next/link";
import type { BookletPlayer, BookletResponse } from "../../types";
import { ProPlanNotice } from "../../components/ProPlanNotice";
import { SlotButton } from "./SlotButton";
import { PreviewPanel } from "./PreviewPanel";
import { createEmptyLayout, toCompetitionSeasonLabel } from "../lib/a3-layout";
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

  if (!isPro) {
    return <ProPlanNotice />;
  }

  return (
    <div className="text-gray-900">
      {!embedded ? (
        <>
          <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={`/admin/teams/${encodeURIComponent(teamId)}/booklet?season=${encodeURIComponent(season)}`}
                className="px-3 py-2 rounded-md bg-gray-700 text-white text-sm font-semibold"
              >
                名鑑へ戻る
              </Link>
              <Link
                href={`/admin/teams/${encodeURIComponent(teamId)}/booklet/a3/print?season=${encodeURIComponent(season)}`}
                className="px-3 py-2 rounded-md bg-emerald-600 text-white text-sm font-semibold"
              >
                印刷プレビュー
              </Link>
            </div>
            <button
              type="button"
              onClick={handleClearAll}
              className="px-3 py-2 rounded-md bg-white text-gray-900 text-sm font-semibold border border-gray-300"
            >
              全クリア
            </button>
          </div>

          <div className="mb-4">
            <h1 className="text-2xl font-bold">A3 選手名鑑（配置編集）</h1>
            <div className="text-sm text-muted-foreground">
              {data?.club?.clubName || ""} / {data?.teamName || ""} / {season}
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              変更内容は自動保存されます。大会（リーグ）は右下プレビュー内で選択します。
              {layout.leagueCompetitionName ? `（選択中: ${layout.leagueCompetitionName}）` : ""}
            </div>
          </div>
        </>
      ) : null}

      {loading && <div className="text-sm text-muted-foreground">読み込み中...</div>}
      {error && <div className="text-sm text-red-600">{error}</div>}

      {!loading && !error && data ? (
        <div className="grid grid-cols-1 gap-6">
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
                      bioTitle: String(e.target.value || ""),
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
                      bioBody: String(e.target.value || ""),
                    }))
                  }
                  placeholder="チームの特徴や今季の目標など"
                />
              </label>
            </div>
          </div>

          <div className="border rounded-lg bg-white p-4">
            <div className="text-sm font-semibold mb-3">配置（A3横・概略）</div>

            <div className="mb-4 rounded-md border bg-white p-3">
              <div className="text-sm font-semibold text-gray-900 mb-2">フォーメーション</div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="space-y-3">
                  <label className="text-xs text-gray-700 block">
                    <div className="font-semibold mb-1">フォーメーション選択</div>
                    <select
                      className="w-full border border-gray-300 rounded-md px-2 py-1 text-sm"
                      value={formation.name}
                      onChange={(e) => {
                        const nextFormationName = String(e.target.value || "").trim();
                        const nextFormation = formations.find((f) => f.name === nextFormationName) || formations[0];

                        setLayout((prev) => {
                          const prevStarters = prev.starters || {};

                          const selectedIds = Object.values(prevStarters)
                            .map((v) => String(v || "").trim())
                            .filter((v) => !!v);

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

                          return {
                            ...prev,
                            formationName: nextFormationName,
                            starters: nextStarters,
                          };
                        });

                        if (nextFormation.positions.length > 0) {
                          setActiveFormationPosId(nextFormation.positions[0].id);
                        }
                      }}
                    >
                      {formations.map((f) => (
                        <option key={f.name} value={f.name}>
                          {f.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="text-xs text-gray-600">
                    <div className="font-semibold mb-1">ポジション選択（〇をクリック）</div>
                    <div className="relative w-full aspect-[16/10] rounded-md overflow-hidden bg-emerald-700 border border-emerald-800">
                      <svg viewBox="0 0 100 60" className="absolute inset-0 w-full h-full">
                        <rect x="2" y="2" width="96" height="56" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="1" />
                        <line x1="2" y1="30" x2="98" y2="30" stroke="rgba(255,255,255,0.85)" strokeWidth="1" />
                        <circle cx="50" cy="30" r="6" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="1" />
                        <rect x="38" y="2" width="24" height="10" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="1" />
                        <rect x="42" y="2" width="16" height="5" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="1" />
                        <rect x="38" y="48" width="24" height="10" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="1" />
                        <rect x="42" y="53" width="16" height="5" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="1" />
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
                            className={
                              "absolute -translate-x-1/2 -translate-y-1/2 rounded-full border text-[10px] font-semibold px-2 py-1 transition-all " +
                              (isActive
                                ? "bg-amber-300 text-emerald-950 border-amber-200 shadow-lg ring-4 ring-white/80 scale-110"
                                : "bg-white/90 text-emerald-900 border-white/80 shadow-sm hover:scale-105")
                            }
                            style={{ left: `${100 - x}%`, top: `${100 - y}%` }}
                          >
                            {pos.label}
                          </button>
                        );
                      })}
                    </div>
                    <div className="mt-2 text-[11px] text-gray-500">
                      選択中: {formation.positions.find((p) => p.id === activeFormationPosId)?.label || "-"}
                    </div>
                  </div>

                  <div className="rounded-md border bg-white p-3">
                    <div className="text-xs font-semibold text-gray-700 mb-2">割当（選択中）</div>
                    {(() => {
                      const pos = formation.positions.find((p) => p.id === activeFormationPosId) || null;
                      if (!pos) return <div className="text-[11px] text-gray-500">ポジションがありません</div>;
                      const currentId = (layout.starters || {})[pos.id] || null;
                      return (
                        <label className="flex items-center gap-2">
                          <span className="w-10 text-[11px] font-semibold text-gray-700">{pos.label}</span>
                          <select
                            className="flex-1 border border-gray-300 rounded-md px-2 py-1 text-[11px]"
                            value={currentId || ""}
                            onChange={(e) => {
                              const v = String(e.target.value || "").trim();
                              setLayout((prev) => ({
                                ...prev,
                                starters: {
                                  ...(prev.starters || {}),
                                  [pos.id]: v || null,
                                },
                              }));
                            }}
                          >
                            <option value="">未設定</option>
                            {getAvailableStarters(currentId).map((p) => (
                              <option key={p.id} value={p.id}>
                                {(p.number != null ? String(p.number) : "-") + " " + p.name}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            className="px-2 py-1 rounded-md border border-gray-300 text-[11px] font-semibold text-gray-700"
                            onClick={() =>
                              setLayout((prev) => ({
                                ...prev,
                                starters: {
                                  ...(prev.starters || {}),
                                  [pos.id]: null,
                                },
                              }))
                            }
                          >
                            クリア
                          </button>
                        </label>
                      );
                    })()}
                  </div>
                </div>

                <div className="md:col-span-2 text-xs text-gray-600">
                  <div className="font-semibold mb-1">先発11人（選択中ポジションに割当）</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {formation.positions.map((pos) => {
                      const currentId = (layout.starters || {})[pos.id] || null;
                      const player = currentId ? playersById.get(currentId) || null : null;
                      const isActive = activeFormationPosId === pos.id;
                      return (
                        <button
                          key={pos.id}
                          type="button"
                          onClick={() => setActiveFormationPosId(pos.id)}
                          className={
                            "flex items-center justify-between gap-2 rounded-md border px-2 py-2 text-left transition-colors " +
                            (isActive ? "border-amber-500 bg-amber-50 ring-2 ring-amber-200" : "border-gray-200 bg-white hover:bg-gray-50")
                          }
                        >
                          <span className="w-10 text-[11px] font-semibold text-gray-700">{pos.label}</span>
                          <span className="flex-1 text-[11px] text-gray-700 truncate">
                            {player ? `${player.number != null ? String(player.number) : "-"} ${player.name}` : "未設定"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-md border bg-white p-3 mt-4">
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="relative rounded-md border bg-gray-50 p-3 min-h-[360px] md:min-h-[520px]">
                <div className="text-xs font-semibold text-gray-600 mb-2">左側（下から3×4 / 12枚）</div>
                <div className="mt-3 md:absolute md:left-3 md:right-3 md:bottom-3">
                  <div className="grid grid-cols-3 gap-2">
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

              <div className="relative rounded-md border bg-gray-50 p-3 min-h-[360px] md:min-h-[520px]">
                <div className="text-xs font-semibold text-gray-600 mb-2">右側（上から3×4 / 12枠）</div>
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-2">
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
                    <div className="grid grid-cols-5 gap-2">
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
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
