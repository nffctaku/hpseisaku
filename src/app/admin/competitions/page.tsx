"use client";

import { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import { collection, query, onSnapshot, doc, deleteDoc, updateDoc } from "firebase/firestore";
import { z } from "zod";
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
import { Loader2, Pencil, Trash2, CalendarDays } from "lucide-react";
import Link from 'next/link';

// Generate a list of seasons from 1960/61 to 2050/51
const seasons = Array.from({ length: 91 }, (_, i) => {
  const startYear = 1960 + i;
  const endYear = startYear + 1;
  return `${startYear}/${String(endYear).slice(-2)}`;
});

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
  const { user, ownerUid } = useAuth();
  const router = useRouter();
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<string>("all");
  const [deletingCompetition, setDeletingCompetition] = useState<Competition | null>(null);
  const [limitDialogOpen, setLimitDialogOpen] = useState(false);
  const [limitDialogType, setLimitDialogType] = useState<"free" | "pro">("free");

  const planTier = getPlanTier(user?.plan);
  const isPaid = planTier !== "free";
  const maxCompetitions = getPlanLimit("competitions_per_club", planTier);

  const clubUid = ownerUid || user?.uid;

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
    if (selectedSeason === "all") return competitions;
    return competitions.filter((c) => c?.season === selectedSeason);
  }, [competitions, selectedSeason]);

  useEffect(() => {
    if (!user) return;
    if (!clubUid) return;
    const competitionsColRef = collection(db, `clubs/${clubUid}/competitions`);
    const q = query(competitionsColRef);

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const competitionsData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Competition));
      setCompetitions(competitionsData);
    });

    return () => unsubscribe();
  }, [user, clubUid]);

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
  }, [competitions]);


  const handleSetShowOnHome = async (target: Competition) => {
    if (!user) return;
    if (!clubUid) return;
    try {
      // すべての大会の showOnHome を一旦 false にし、選択した大会だけ true にする
      const updates = competitions.map(async (comp) => {
        const ref = doc(db, `clubs/${clubUid}/competitions`, comp.id);
        const value = comp.id === target.id;
        // 変更がある大会だけ更新
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
    <div className="container mx-auto py-10">
      <div className="flex flex-col gap-4 mb-6">
        <h1 className="text-3xl font-bold text-white leading-none">大会管理</h1>
        <div className="grid grid-cols-2 gap-2">
          <Select value={selectedSeason} onValueChange={setSelectedSeason}>
            <SelectTrigger className="w-full bg-white text-gray-900">
              <SelectValue placeholder="シーズン" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">すべてのシーズン</SelectItem>
              {seasonOptions.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            className="w-full bg-white text-gray-900 hover:bg-gray-100"
            onClick={handleCreateCompetition}
          >
            新規大会を追加
          </Button>
        </div>
      </div>
      <div className="space-y-3">
        {filteredCompetitions.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-white/5 p-8 text-center text-white/70">
            <p className="mb-4">
              {competitions.length === 0 ? "まだ大会が登録されていません。" : "選択したシーズンの大会がありません。"}
            </p>
            <Button onClick={handleCreateCompetition}>最初の大会を作成する</Button>
          </div>
        ) : (
          filteredCompetitions.map(comp => (
            <div key={comp.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full bg-white/10">
                    {comp.logoUrl ? (
                      <Image src={comp.logoUrl} alt={comp.name || ""} fill className="object-cover" />
                    ) : (
                      <div className="h-full w-full" />
                    )}
                  </div>
                  <div className="flex flex-col min-w-0 flex-1">
                    <Link href={`/admin/competitions/${comp.id}`} className="hover:underline">
                      <span className="font-medium text-white text-sm">{comp.name}</span>
                      <span className="text-xs text-white/60 ml-2">({comp.season})</span>
                    </Link>
                  </div>
                </div>
                <div className="flex flex-row gap-2 items-center justify-between">
                  <div className="flex flex-row gap-2 flex-1">
                    <div className="flex items-center gap-1">
                      <input
                        type="radio"
                        name="showOnHome"
                        className="h-3 w-3 shrink-0"
                        checked={!!comp.showOnHome}
                        onChange={() => handleSetShowOnHome(comp)}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-white truncate">HPに表示</div>
                        <div className="text-[10px] text-white/50 truncate">トップページのメイン大会</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        className="h-3 w-3 shrink-0"
                        checked={!!comp.showOnTable}
                        onChange={(e) => handleToggleShowOnTable(comp, e.target.checked)}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-white truncate">HPのTABLEに表示</div>
                        <div className="text-[10px] text-white/50 truncate">順位表に含める</div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 border-t border-white/10 pt-3">
                  <Link href={`/admin/competitions/${comp.id}`} className="block">
                    <Button type="button" variant="outline" className="h-9 w-full border-orange-200 bg-orange-50 text-xs text-orange-700 hover:bg-orange-100 hover:text-orange-800">
                      <CalendarDays className="mr-1 h-3.5 w-3.5" />
                      試合日程
                    </Button>
                  </Link>
                  <Link href={`/admin/competitions/${comp.id}/edit`} className="block">
                    <Button type="button" variant="outline" className="h-9 w-full bg-white text-xs text-gray-900 hover:bg-gray-100">
                      <Pencil className="mr-1 h-3.5 w-3.5" />
                      編集
                    </Button>
                  </Link>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 w-full border-red-200 bg-red-50 text-xs text-red-600 hover:bg-red-100 hover:text-red-700"
                    onClick={() => setDeletingCompetition(comp)}
                  >
                    <Trash2 className="mr-1 h-3.5 w-3.5" />
                    削除
                  </Button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>


      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deletingCompetition} onOpenChange={() => setDeletingCompetition(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>本当に削除しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              大会「{deletingCompetition?.name}」を削除します。この操作は元に戻せません。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>削除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={limitDialogOpen} onOpenChange={setLimitDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{limitDialogType === "free" ? "無料プランの上限に達しました" : "Proプランの上限に達しました"}</AlertDialogTitle>
            <AlertDialogDescription>
              {Number.isFinite(maxCompetitions)
                ? `${limitDialogType === "free" ? "無料" : "Pro"}プランでは1シーズンあたり大会は${maxCompetitions}つまで作成できます。既存の大会を編集するか、不要な大会を削除してください。`
                : "現在のプランでは大会数の上限はありません。"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setLimitDialogOpen(false)}>OK</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
