"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useAuth } from "@/contexts/AuthContext";
import { useCareer } from "@/contexts/CareerContext";
import { db } from "@/lib/firebase";
import { collection, query, onSnapshot, doc, deleteDoc, updateDoc, getDocs, where } from "firebase/firestore";
import { getPlanLimit, getPlanTier } from "@/lib/plan-limits";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetClose,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Pencil, Trash2, MoreVertical, Plus, ChevronRight, ImageIcon, Home, X, Check, Table as TableIcon } from "lucide-react";

// Define the structure for a competition
interface Competition {
  id: string;
  name: string;
  season: string;
  format?: "league" | "cup" | "league_cup";
  teams?: string[];
  teamCount?: number;
  showOnHome?: boolean;
  showOnTable?: boolean;
  logoUrl?: string;
}

const formatLabel = (format?: string) => {
  switch (format) {
    case "league":
      return "リーグ戦";
    case "cup":
      return "カップ戦";
    case "league_cup":
      return "リーグカップ";
    default:
      return "";
  }
};

const supplementaryText = (comp: Competition) => {
  const parts: string[] = [];
  const f = formatLabel(comp.format);
  if (f) parts.push(f);
  const teamCount = comp.teams?.length ?? comp.teamCount;
  if (teamCount && teamCount > 0) parts.push(`参加 ${teamCount}チーム`);
  return parts.join(" ・ ");
};

export default function CompetitionsPage() {
  const { user } = useAuth();
  const { activeCareer } = useCareer();
  const router = useRouter();
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<string>("all");
  const [deletingCompetition, setDeletingCompetition] = useState<Competition | null>(null);
  const [activeSheetId, setActiveSheetId] = useState<string | null>(null);
  const [limitDialogOpen, setLimitDialogOpen] = useState(false);
  const [limitDialogType, setLimitDialogType] = useState<"free" | "pro">("free");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  const lastMenuTriggerIdRef = useRef<string | null>(null);
  const menuButtonRefs = useRef<Map<string, HTMLButtonElement | null>>(new Map());

  const planTier = getPlanTier(user?.plan);
  const isPaid = planTier !== "free";
  const maxCompetitions = getPlanLimit("competitions_per_season", planTier);

  const clubUid = activeCareer?.clubUid;

  const activeSheetComp = useMemo(
    () => competitions.find((c) => c.id === activeSheetId) ?? null,
    [competitions, activeSheetId]
  );

  const seasonOptions = useMemo(() => {
    const set = new Set<string>();
    for (const c of competitions) {
      if (typeof c?.season === "string" && c.season.trim().length > 0) {
        set.add(c.season);
      }
    }
    const list = Array.from(set);
    list.sort((a, b) => b.localeCompare(a));
    return list;
  }, [competitions]);

  const filteredCompetitions = useMemo(() => {
    const list = selectedSeason === "all" ? competitions : competitions.filter((c) => c?.season === selectedSeason);
    return list.slice().sort((a, b) => {
      if (Number(!!b.showOnHome) !== Number(!!a.showOnHome)) return Number(!!b.showOnHome) - Number(!!a.showOnHome);
      return a.name.localeCompare(b.name);
    });
  }, [competitions, selectedSeason]);

  useEffect(() => {
    setCompetitions([]);
    setSelectedSeason("all");
    setError(null);
    if (!user) return;
    if (!clubUid) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const competitionsColRef = collection(db, `clubs/${clubUid}/competitions`);
    const q = query(competitionsColRef);

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const competitionsData = querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      } as Competition));
      setCompetitions(competitionsData);
      setLoading(false);
      setError(null);
    }, (err) => {
      console.error("Error fetching competitions:", err);
      setError(err);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user, clubUid, retryKey]);

  // Auto-select latest season on initial load
  useEffect(() => {
    if (competitions.length > 0 && selectedSeason === "all") {
      const seasons = new Set<string>();
      for (const c of competitions) {
        if (typeof c?.season === "string" && c.season.trim().length > 0) {
          seasons.add(c.season);
        }
      }
      const sortedSeasons = Array.from(seasons).sort((a, b) => b.localeCompare(a));
      if (sortedSeasons.length > 0) {
        setSelectedSeason(sortedSeasons[0]);
      }
    }
  }, [competitions, selectedSeason]);

  const handleSheetOpenChange = (open: boolean) => {
    if (!open) {
      setActiveSheetId(null);
      const id = lastMenuTriggerIdRef.current;
      window.setTimeout(() => {
        const el = id ? menuButtonRefs.current.get(id) : null;
        el?.focus();
      }, 0);
    }
  };

  const openSheet = (comp: Competition, trigger: HTMLButtonElement | null) => {
    lastMenuTriggerIdRef.current = comp.id;
    menuButtonRefs.current.set(comp.id, trigger);
    setActiveSheetId(comp.id);
  };

  const handleSetShowOnHome = async (target: Competition) => {
    if (!user || !clubUid) return;
    try {
      const nextValue = !target.showOnHome;
      const updates = competitions.map(async (comp) => {
        const ref = doc(db, `clubs/${clubUid}/competitions`, comp.id);
        const value = comp.id === target.id ? nextValue : false;
        if ((comp.showOnHome ?? false) !== value) {
          await updateDoc(ref, { showOnHome: value });
        }
      });
      await Promise.all(updates);
    } catch (error) {
      console.error("Error updating showOnHome: ", error);
    }
  };

  const handleToggleShowOnTable = async (target: Competition, nextValue: boolean) => {
    if (!user) return;
    if (!clubUid) return;
    try {
      const ref = doc(db, `clubs/${clubUid}/competitions`, target.id);
      await updateDoc(ref, { showOnTable: nextValue });
    } catch (error) {
      console.error("Error updating showOnTable: ", error);
    }
  };

  const handleCreateCompetition = () => {
    if (selectedSeason !== "all" && Number.isFinite(maxCompetitions) && filteredCompetitions.length >= maxCompetitions) {
      setLimitDialogType(isPaid ? "pro" : "free");
      setLimitDialogOpen(true);
      return;
    }
    router.push("/admin/competitions/new");
  };

  const handleDelete = async () => {
    if (!user || !deletingCompetition) return;
    if (!clubUid) return;
    try {
      const compBase = `clubs/${clubUid}/competitions/${deletingCompetition.id}`;
      // サブコレクション（rounds/matches/events, settings, standings）を先に削除
      const roundsSnap = await getDocs(collection(db, `${compBase}/rounds`));
      for (const roundDoc of roundsSnap.docs) {
        const matchesSnap = await getDocs(collection(db, `${compBase}/rounds/${roundDoc.id}/matches`));
        for (const matchDoc of matchesSnap.docs) {
          const eventsSnap = await getDocs(collection(db, `${compBase}/rounds/${roundDoc.id}/matches/${matchDoc.id}/events`));
          for (const ev of eventsSnap.docs) await deleteDoc(ev.ref);
          await deleteDoc(matchDoc.ref);
        }
        await deleteDoc(roundDoc.ref);
      }
      for (const sub of ["settings", "standings"] as const) {
        const subSnap = await getDocs(collection(db, `${compBase}/${sub}`));
        for (const d of subSnap.docs) await deleteDoc(d.ref);
      }
      // 関連する public_match_index を削除
      const indexSnap = await getDocs(
        query(collection(db, `clubs/${clubUid}/public_match_index`), where("competitionId", "==", deletingCompetition.id))
      );
      for (const d of indexSnap.docs) await deleteDoc(d.ref);

      const competitionDocRef = doc(db, `clubs/${clubUid}/competitions`, deletingCompetition.id);
      await deleteDoc(competitionDocRef);
      setDeletingCompetition(null);
    } catch (error) {
      console.error("Error deleting competition: ", error);
    }
  };

  const handleSheetEdit = () => {
    if (!activeSheetComp) return;
    setActiveSheetId(null);
    router.push(`/admin/competitions/${activeSheetComp.id}/edit`);
  };

  const handleSheetDelete = () => {
    if (!activeSheetComp) return;
    setDeletingCompetition(activeSheetComp);
    setActiveSheetId(null);
  };

  return (
    <div className="min-h-screen bg-[#08111f] px-4 py-6 sm:py-10">
      <div className="mx-auto w-full max-w-4xl">
        <div className="mb-6 space-y-2">
          <h1 className="text-[28px] font-bold text-[#f0f4ff] sm:text-3xl">大会管理</h1>
          <p className="text-[14px] text-[#94a3b8]">大会の日程・結果を管理</p>
        </div>

        <div className="mb-6 flex min-w-0 flex-row items-center gap-3">
          <div className="min-w-0 flex-1">
            <Select value={selectedSeason} onValueChange={setSelectedSeason}>
              <SelectTrigger className="w-full border-white/[0.08] bg-[#111c2d] text-white">
                <SelectValue placeholder="シーズン" />
              </SelectTrigger>
              <SelectContent className="border-white/[0.08] bg-[#111c2d] text-white">
                <SelectItem value="all" className="focus:bg-[#1a2940] focus:text-white">すべてのシーズン</SelectItem>
                {seasonOptions.map((s) => (
                  <SelectItem key={s} value={s} className="focus:bg-[#1a2940] focus:text-white">
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={handleCreateCompetition}
            variant="outline"
            className="shrink-0 border-emerald-500 text-emerald-500 hover:bg-emerald-500/10"
          >
            <Plus className="mr-2 h-4 w-4" />
            大会追加
          </Button>
        </div>

        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full rounded-2xl bg-white/5" />
            <Skeleton className="h-20 w-full rounded-2xl bg-white/5" />
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-white/[0.08] bg-[#111c2d] p-8 text-center">
            <p className="mb-6 text-[#f0f4ff]">大会情報を読み込めませんでした</p>
            <Button
              onClick={() => { setError(null); setLoading(true); setRetryKey(k => k + 1); }}
              className="bg-[#111c2d] border border-white/[0.08] text-[#f0f4ff] hover:bg-white/5"
            >
              もう一度試す
            </Button>
          </div>
        ) : filteredCompetitions.length === 0 ? (
          <div className="rounded-2xl border border-white/[0.08] bg-[#111c2d] p-8 text-center">
            {competitions.length === 0 ? (
              <>
                <p className="mb-1 text-lg font-bold text-[#f0f4ff]">大会がまだ登録されていません</p>
                <p className="mb-6 text-sm text-[#94a3b8]">リーグやカップ戦を追加すると、日程・結果を記録できます。</p>
                <Button onClick={handleCreateCompetition} className="bg-[#1fd760] font-bold text-[#080c14] hover:bg-[#17c054] h-12 px-6">
                  <Plus className="mr-2 h-4 w-4" />
                  最初の大会を追加
                </Button>
              </>
            ) : (
              <>
                <p className="mb-1 text-lg font-bold text-[#f0f4ff]">大会がありません</p>
                <p className="mb-6 text-sm text-[#94a3b8]">選択したシーズンに大会が登録されていません。</p>
                <Button onClick={handleCreateCompetition} className="bg-[#1fd760] font-bold text-[#080c14] hover:bg-[#17c054] h-12 px-6">
                  <Plus className="mr-2 h-4 w-4" />
                  大会を追加
                </Button>
              </>
            )}
          </div>
        ) : (
          <>
          <div className="space-y-3">
            {filteredCompetitions.map((comp) => {
              const sup = supplementaryText(comp);
              return (
                <div
                  key={comp.id}
                  className="relative flex items-center rounded-xl border border-white/[0.08] bg-[#111c2d] p-3"
                >
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => router.push(`/admin/competitions/${comp.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        router.push(`/admin/competitions/${comp.id}`);
                      }
                    }}
                    className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50"
                  >
                    <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full bg-white/80">
                      {comp.logoUrl ? (
                        <Image src={comp.logoUrl} alt={comp.name || ""} fill className="object-cover" sizes="40px" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <ImageIcon className="h-5 w-5 text-[#94a3b8]" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-base font-bold text-[#f0f4ff]">{comp.name}</h3>
                      {sup && <p className="truncate text-xs text-[#94a3b8]">{sup}</p>}
                    </div>
                    <ChevronRight className="h-5 w-5 shrink-0 text-[#94a3b8]" />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      openSheet(comp, e.currentTarget);
                    }}
                    className="ml-1 size-11 shrink-0 text-white hover:bg-white/10"
                    aria-label="大会メニューを開く"
                  >
                    <MoreVertical className="h-5 w-5" />
                  </Button>
                </div>
              );
            })}
          </div>
          <p className="px-1 pt-2 text-center text-xs text-[#64748b]">大会をタップして日程・スコアを登録</p>
          </>
        )}

        {/* Bottom Sheet Menu */}
        <Sheet open={!!activeSheetId} onOpenChange={handleSheetOpenChange}>
          <SheetContent className="sm:max-w-2xl">
            {activeSheetComp && (
              <div className="flex flex-col">
                <SheetHeader className="relative pb-4">
                  <div className="mb-4 flex justify-center">
                    <div className="h-1 w-10 rounded-full bg-white/20" />
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full bg-white/80">
                      {activeSheetComp.logoUrl ? (
                        <Image src={activeSheetComp.logoUrl} alt={activeSheetComp.name || ""} fill className="object-cover" sizes="40px" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <ImageIcon className="h-5 w-5 text-[#94a3b8]" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <SheetTitle className="truncate text-white">{activeSheetComp.name}</SheetTitle>
                      <SheetDescription className="text-xs text-[#94a3b8]">大会メニュー</SheetDescription>
                    </div>
                    <SheetClose asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-11 shrink-0 text-white hover:bg-white/10"
                        aria-label="閉じる"
                      >
                        <X className="h-5 w-5" />
                      </Button>
                    </SheetClose>
                  </div>
                </SheetHeader>
                <div className="mt-2 space-y-1">
                  <button
                    type="button"
                    onClick={handleSheetEdit}
                    className="flex h-14 w-full items-center gap-2 rounded-lg px-2 text-[#f0f4ff] transition-colors hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50"
                  >
                    <span className="flex size-11 shrink-0 items-center justify-center text-[#94a3b8]">
                      <Pencil className="h-5 w-5" />
                    </span>
                    <span className="flex-1 text-left text-base font-medium">大会設定を編集</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => activeSheetComp && handleSetShowOnHome(activeSheetComp)}
                    className="flex h-14 w-full items-center gap-2 rounded-lg px-2 text-[#f0f4ff] transition-colors hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50"
                  >
                    <span className="flex size-11 shrink-0 items-center justify-center text-[#94a3b8]">
                      <Home className="h-5 w-5" />
                    </span>
                    <span className="flex-1 text-left text-base font-medium">トップページの大会に設定</span>
                    {activeSheetComp.showOnHome && (
                      <Check className="h-5 w-5 shrink-0 text-emerald-500" />
                    )}
                  </button>

                  <div className="flex h-14 w-full items-center gap-2 rounded-lg px-2 text-[#f0f4ff]">
                    <span className="flex size-11 shrink-0 items-center justify-center text-[#94a3b8]">
                      <TableIcon className="h-5 w-5" />
                    </span>
                    <span className="flex-1 text-left text-base font-medium">順位表に表示</span>
                    <Switch
                      checked={!!activeSheetComp.showOnTable}
                      onCheckedChange={(checked) => activeSheetComp && handleToggleShowOnTable(activeSheetComp, checked)}
                      aria-label="順位表に表示"
                    />
                  </div>

                  <div className="my-2 h-px bg-white/10" />

                  <button
                    type="button"
                    onClick={handleSheetDelete}
                    className="flex h-14 w-full items-center gap-2 rounded-lg px-2 text-red-400 transition-colors hover:bg-red-500/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/50"
                  >
                    <span className="flex size-11 shrink-0 items-center justify-center text-red-400">
                      <Trash2 className="h-5 w-5" />
                    </span>
                    <span className="flex-1 text-left text-base font-medium">大会を削除</span>
                  </button>
                </div>
              </div>
            )}
          </SheetContent>
        </Sheet>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={!!deletingCompetition} onOpenChange={() => setDeletingCompetition(null)}>
          <AlertDialogContent className="border-white/[0.08] bg-[#111c2d] text-[#f0f4ff]">
            <AlertDialogHeader>
              <AlertDialogTitle>本当に削除しますか？</AlertDialogTitle>
              <AlertDialogDescription className="text-[#94a3b8]">
                大会「{deletingCompetition?.name}」を削除します。この操作は元に戻せません。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="border-white/[0.08] bg-transparent text-[#f0f4ff] hover:bg-white/5">キャンセル</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-red-600 text-white hover:bg-red-700">削除</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={limitDialogOpen} onOpenChange={setLimitDialogOpen}>
          <AlertDialogContent className="border-white/[0.08] bg-[#111c2d] text-[#f0f4ff]">
            <AlertDialogHeader>
              <AlertDialogTitle>{limitDialogType === "free" ? "無料プランの上限に達しました" : "Proプランの上限に達しました"}</AlertDialogTitle>
              <AlertDialogDescription className="text-[#94a3b8]">
                {Number.isFinite(maxCompetitions)
                  ? `${limitDialogType === "free" ? "無料" : "Pro"}プランでは1シーズンあたり大会は${maxCompetitions}つまで作成できます。既存の大会を編集するか、不要な大会を削除してください。`
                  : "現在のプランでは大会数の上限はありません。"}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogAction onClick={() => setLimitDialogOpen(false)} className="bg-[#1fd760] text-[#080c14] hover:bg-[#17c054]">OK</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
