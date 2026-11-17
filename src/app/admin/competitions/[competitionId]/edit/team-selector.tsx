"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, ChevronLeft, Check } from "lucide-react";

export interface Team {
  id: string;
  name: string;
  logoUrl?: string;
  categoryId?: string | null;
}

export interface TeamCategory {
  id: string;
  name: string;
}

interface TeamSelectorPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  allTeams: Team[];
  categories: TeamCategory[];
  selectedTeamIds: string[];
  onConfirm: (selectedIds: string[]) => void;
}

const getInitial = (name: string) => {
  const s = (name || "").trim();
  if (!s) return "?";
  return s.slice(0, 1).toUpperCase();
};

export function TeamSelectorPanel({
  open,
  onOpenChange,
  allTeams,
  categories,
  selectedTeamIds,
  onConfirm,
}: TeamSelectorPanelProps) {
  const [panelSelected, setPanelSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"all" | "selected">("all");
  const [activeCategories, setActiveCategories] = useState<Set<string>>(new Set());

  useEffect(() => {
    const all = new Set<string>(["uncategorized", ...categories.map((c) => c.id)]);
    setActiveCategories(all);
  }, [categories]);

  useEffect(() => {
    if (open) {
      setPanelSelected(new Set(selectedTeamIds));
      setSearch("");
      setActiveTab("all");
    }
  }, [open, selectedTeamIds]);

  const toggleCategory = (id: string) => {
    setActiveCategories((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllCategories = () => {
    setActiveCategories(new Set(["uncategorized", ...categories.map((c) => c.id)]));
  };

  const deselectAllCategories = () => {
    setActiveCategories(new Set());
  };

  const allCategoriesSelected =
    activeCategories.size === categories.length + 1 &&
    categories.every((c) => activeCategories.has(c.id)) &&
    activeCategories.has("uncategorized");

  const toggleTeam = (teamId: string) => {
    setPanelSelected((prev) => {
      const next = new Set(prev);
      if (next.has(teamId)) next.delete(teamId);
      else next.add(teamId);
      return next;
    });
  };

  const selectedCount = panelSelected.size;

  const filteredTeams = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allTeams.filter((t) => {
      const inSearch = !q || t.name.toLowerCase().includes(q);
      const inTab = activeTab === "all" || panelSelected.has(t.id);
      const cat = t.categoryId && t.categoryId.trim() ? t.categoryId : "uncategorized";
      const inCategory = activeCategories.has(cat);
      return inSearch && inTab && inCategory;
    });
  }, [allTeams, search, activeTab, panelSelected, activeCategories]);

  const categoryMap = useMemo(() => {
    const map = new Map<string, string>();
    map.set("uncategorized", "未分類");
    for (const c of categories) map.set(c.id, c.name);
    return map;
  }, [categories]);

  const groups = useMemo(() => {
    const orderedIds = ["uncategorized", ...categories.map((c) => c.id)];
    const map = new Map<string, Team[]>();
    for (const id of orderedIds) {
      map.set(id, []);
    }
    for (const t of filteredTeams) {
      const cat = t.categoryId && t.categoryId.trim() ? t.categoryId : "uncategorized";
      const list = map.get(cat);
      if (list) list.push(t);
    }
    const result: [string, Team[]][] = [];
    for (const id of orderedIds) {
      const list = map.get(id)!;
      if (list.length > 0) result.push([id, list]);
    }
    return result;
  }, [filteredTeams, categories]);

  const handleConfirm = () => {
    onConfirm(Array.from(panelSelected));
    onOpenChange(false);
  };

  const chipBase =
    "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors";
  const chipInactive = "border-white/[0.08] bg-[#111c2d] text-[#94a3b8]";
  const chipActive =
    "border-emerald-500 bg-emerald-500/10 text-emerald-500";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="!h-[100dvh] !max-w-none !rounded-none !p-0 flex flex-col overflow-hidden sm:!h-auto sm:!max-w-2xl sm:!rounded-t-2xl">
        <div className="flex h-full flex-col">
          <SheetHeader className="shrink-0 border-b border-white/[0.08] p-4">
            <div className="flex items-center gap-2">
              <SheetClose asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-9 text-white hover:bg-white/10"
                  aria-label="戻る"
                >
                  <ChevronLeft className="h-5 w-5" />
                </Button>
              </SheetClose>
              <SheetTitle className="text-lg font-semibold text-white">
                参加チームを選択
              </SheetTitle>
            </div>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto p-4">
            {/* 検索 */}
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94a3b8]" />
              <Input
                type="text"
                placeholder="チーム名で検索"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-12 w-full border-white/[0.08] bg-[#111c2d] pl-10 text-[#f0f4ff] placeholder:text-[#94a3b8]"
              />
            </div>

            {/* タブ */}
            <div className="mb-3 flex gap-2">
              <button
                type="button"
                onClick={() => setActiveTab("all")}
                className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
                  activeTab === "all"
                    ? "bg-emerald-500 text-[#080c14]"
                    : "border border-white/[0.08] bg-[#111c2d] text-[#f0f4ff]"
                }`}
              >
                すべて
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("selected")}
                className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
                  activeTab === "selected"
                    ? "bg-emerald-500 text-[#080c14]"
                    : "border border-white/[0.08] bg-[#111c2d] text-[#f0f4ff]"
                }`}
              >
                選択中 {selectedCount}
              </button>
            </div>

            {/* カテゴリー絞り込み */}
            <div className="mb-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() =>
                  allCategoriesSelected ? deselectAllCategories() : selectAllCategories()
                }
                className={`${chipBase} ${
                  allCategoriesSelected ? chipActive : chipInactive
                }`}
              >
                全カテゴリ
              </button>
              <button
                type="button"
                onClick={() => toggleCategory("uncategorized")}
                className={`${chipBase} ${
                  activeCategories.has("uncategorized") ? chipActive : chipInactive
                }`}
              >
                未分類
              </button>
              {categories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggleCategory(c.id)}
                  className={`${chipBase} ${
                    activeCategories.has(c.id) ? chipActive : chipInactive
                  }`}
                >
                  {c.name}
                </button>
              ))}
            </div>

            {/* 空表示 */}
            {allTeams.length === 0 ? (
              <div className="rounded-2xl border border-white/[0.08] bg-[#111c2d] p-8 text-center">
                <p className="mb-1 text-lg font-bold text-[#f0f4ff]">
                  参加できるチームが登録されていません
                </p>
                <p className="mb-4 text-sm text-[#94a3b8]">
                  先にチームを追加してください。
                </p>
              </div>
            ) : groups.length === 0 ? (
              <div className="rounded-2xl border border-white/[0.08] bg-[#111c2d] p-8 text-center">
                <p className="mb-1 text-lg font-bold text-[#f0f4ff]">
                  条件に一致するチームがありません
                </p>
                <p className="text-sm text-[#94a3b8]">
                  検索・カテゴリー絞り込みを確認してください。
                </p>
              </div>
            ) : (
              groups.map(([catId, teams]) => {
                const catName = categoryMap.get(catId) || "未分類";
                const selectedInGroup = teams.filter((t) =>
                  panelSelected.has(t.id)
                ).length;
                return (
                  <div key={catId} className="mb-5">
                    <h3 className="mb-2 text-sm font-bold text-[#f0f4ff]">
                      {catName}{" "}
                      <span className="font-normal text-[#94a3b8]">
                        ({selectedInGroup}/{teams.length})
                      </span>
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                      {teams.map((team) => {
                        const selected = panelSelected.has(team.id);
                        return (
                          <div
                            key={team.id}
                            role="checkbox"
                            aria-checked={selected}
                            tabIndex={0}
                            onClick={() => toggleTeam(team.id)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                toggleTeam(team.id);
                              }
                            }}
                            className={`flex cursor-pointer items-center gap-2 rounded-xl border p-3 transition-colors ${
                              selected
                                ? "border-emerald-500 bg-emerald-500/10"
                                : "border-white/[0.08] bg-[#111c2d] hover:bg-[#1a2940]"
                            }`}
                          >
                            <div
                              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
                                selected
                                  ? "border-emerald-500 bg-emerald-500 text-[#080c14]"
                                  : "border-white/40 bg-transparent text-transparent"
                              }`}
                            >
                              <Check className="h-3.5 w-3.5" />
                            </div>
                            {team.logoUrl ? (
                              <Image
                                src={team.logoUrl}
                                alt={team.name}
                                width={28}
                                height={28}
                                className="shrink-0 rounded-full object-contain"
                                unoptimized
                              />
                            ) : (
                              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-slate-100 to-slate-300 text-xs font-bold text-slate-800">
                                {getInitial(team.name)}
                              </div>
                            )}
                            <span className="line-clamp-2 min-w-0 flex-1 text-xs font-medium text-[#f0f4ff]">
                              {team.name}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="shrink-0 border-t border-white/[0.08] bg-[#111c2d] p-4">
            <p className="mb-3 text-sm font-medium text-[#f0f4ff]">
              選択中{" "}
              <span className="text-emerald-500">{selectedCount}</span> チーム
            </p>
            <Button
              type="button"
              onClick={handleConfirm}
              className="h-12 w-full bg-[#1fd760] font-bold text-[#080c14] hover:bg-[#17c054]"
            >
              選択を反映
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
