"use client";

import { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useAuth } from "@/contexts/AuthContext";
import { useCareer } from "@/contexts/CareerContext";
import { db } from "@/lib/firebase";
import { collection, query, onSnapshot, doc, deleteDoc, updateDoc } from "firebase/firestore";
import { getPlanLimit, getPlanTier } from "@/lib/plan-limits";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Pencil, Trash2, CalendarDays, MoreVertical, Plus, ChevronRight, ImageIcon } from "lucide-react";

// Define the structure for a competition
interface Competition {
  id: string;
  name: string;
  season: string;
  teams?: string[];
  showOnHome?: boolean;
  showOnTable?: boolean;
  logoUrl?: string;
}

export default function CompetitionsPage() {
  const { user } = useAuth();
  const { activeCareer } = useCareer();
  const router = useRouter();
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<string>("all");
  const [deletingCompetition, setDeletingCompetition] = useState<Competition | null>(null);
  const [limitDialogOpen, setLimitDialogOpen] = useState(false);
  const [limitDialogType, setLimitDialogType] = useState<"free" | "pro">("free");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  const planTier = getPlanTier(user?.plan);
  const isPaid = planTier !== "free";
  const maxCompetitions = getPlanLimit("competitions_per_season", planTier);

  const clubUid = activeCareer?.clubUid;

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
      const competitionsData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
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
      const competitionDocRef = doc(db, `clubs/${clubUid}/competitions`, deletingCompetition.id);
      await deleteDoc(competitionDocRef);
      setDeletingCompetition(null);
    } catch (error) {
      console.error("Error deleting competition: ", error);
    }
  };

  return (
    <div className="min-h-screen bg-[#08111f] px-4 py-6 sm:py-10">
      <div className="mx-auto w-full max-w-4xl">
        <div className="mb-6 space-y-2">
          <h1 className="text-[28px] font-bold text-[#f0f4ff] sm:text-3xl">大会管理</h1>
          <p className="text-[14px] text-white">大会の日程・結果を管理</p>
        </div>

        <div className="mb-6 flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 w-full sm:w-[260px]">
            <Select value={selectedSeason} onValueChange={setSelectedSeason}>
              <SelectTrigger className="min-w-0 w-full border-white/[0.08] bg-[#111c2d] text-white">
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
            className="min-w-0 w-full shrink-0 bg-[#1fd760] font-bold text-white hover:bg-[#17c054] sm:w-auto sm:px-6 h-12"
          >
            <Plus className="mr-2 h-4 w-4" />
            大会を追加
          </Button>
        </div>

        {loading ? (
          <div className="space-y-4">
            <Skeleton className="h-48 w-full rounded-2xl bg-white/5" />
            <Skeleton className="h-48 w-full rounded-2xl bg-white/5" />
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
          <div className="space-y-4">
            {filteredCompetitions.map((comp) => (
              <div
                key={comp.id}
                className="rounded-2xl border border-white/[0.08] bg-[#111c2d] p-4"
              >
                <div className="flex items-start gap-3">
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
                    <h3 className="min-w-0 truncate text-lg font-bold text-[#f0f4ff]">{comp.name}</h3>
                    <p className="text-sm text-[#94a3b8]">{comp.season}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {comp.showOnHome && (
                        <span className="inline-flex items-center rounded-full border border-[#1fd760] px-2 py-0.5 text-xs font-medium text-[#1fd760]">
                          メイン大会
                        </span>
                      )}
                      {comp.showOnTable && (
                        <span className="inline-flex items-center rounded-full border border-white/20 px-2 py-0.5 text-xs font-medium text-[#94a3b8]">
                          順位表に表示
                        </span>
                      )}
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="shrink-0 text-white hover:bg-white/10"
                        aria-label="大会メニューを開く"
                      >
                        <MoreVertical className="h-5 w-5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="border-white/[0.08] bg-[#111c2d] text-white">
                      <DropdownMenuItem onClick={() => router.push(`/admin/competitions/${comp.id}/edit`)} className="text-white focus:bg-[#1a2940] focus:text-white cursor-pointer">
                        <Pencil className="mr-2 h-4 w-4" />
                        大会設定を編集
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleSetShowOnHome(comp)} className="text-white focus:bg-[#1a2940] focus:text-white cursor-pointer">
                        {comp.showOnHome ? "トップページから外す" : "トップページの大会に設定"}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleToggleShowOnTable(comp, !comp.showOnTable)} className="text-white focus:bg-[#1a2940] focus:text-white cursor-pointer">
                        {comp.showOnTable ? "順位表から外す" : "順位表に表示"}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator className="bg-white/10" />
                      <DropdownMenuItem onClick={() => setDeletingCompetition(comp)} className="text-red-400 focus:bg-red-950/30 focus:text-red-400 cursor-pointer">
                        <Trash2 className="mr-2 h-4 w-4" />
                        大会を削除
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <div className="mt-4 space-y-3">
                  <Button
                    type="button"
                    onClick={() => router.push(`/admin/competitions/${comp.id}`)}
                    className="h-14 w-full rounded-xl bg-[#1fd760] font-bold text-white hover:bg-[#17c054]"
                  >
                    <span className="flex w-full items-center justify-between">
                      <span className="flex items-center">
                        <CalendarDays className="mr-2 h-5 w-5" />
                        日程・結果を管理
                      </span>
                      <ChevronRight className="h-5 w-5" />
                    </span>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}


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
