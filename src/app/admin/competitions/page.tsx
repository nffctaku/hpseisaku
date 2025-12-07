"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import { collection, query, onSnapshot, doc, deleteDoc, updateDoc } from "firebase/firestore";
import { z } from "zod";

import { Button } from "@/components/ui/button";
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
}

const MAX_COMPETITIONS_FREE = 1;

export default function CompetitionsPage() {
  const { user } = useAuth();
  const isPro = user?.plan === "pro";
  const router = useRouter();
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [deletingCompetition, setDeletingCompetition] = useState<Competition | null>(null);
  const [limitDialogOpen, setLimitDialogOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    const competitionsColRef = collection(db, `clubs/${user.uid}/competitions`);
    const q = query(competitionsColRef);

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const competitionsData = querySnapshot.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data() 
      } as Competition));
      setCompetitions(competitionsData);
    });

    return () => unsubscribe();
  }, [user]);


  const handleSetShowOnHome = async (target: Competition) => {
    if (!user) return;
    try {
      // すべての大会の showOnHome を一旦 false にし、選択した大会だけ true にする
      const updates = competitions.map(async (comp) => {
        const ref = doc(db, `clubs/${user.uid}/competitions`, comp.id);
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

  const handleCreateCompetition = () => {
    if (!isPro && competitions.length >= MAX_COMPETITIONS_FREE) {
      setLimitDialogOpen(true);
      return;
    }
    router.push("/admin/competitions/new");
  };


  const handleDelete = async () => {
    if (!user || !deletingCompetition) return;
    try {
      const competitionDocRef = doc(db, `clubs/${user.uid}/competitions`, deletingCompetition.id);
      await deleteDoc(competitionDocRef);
      setDeletingCompetition(null);
    } catch (error) {
      console.error("Error deleting competition: ", error);
    }
  };

  return (
    <div className="container mx-auto py-10">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-white">大会管理</h1>
        <Button
          variant="outline"
          className="bg-white text-gray-900 hover:bg-gray-100"
          onClick={handleCreateCompetition}
        >
          新規大会を追加
        </Button>
      </div>
      <div className="bg-white text-gray-900 border rounded-lg">
        {competitions.length === 0 ? (
          <div className="p-8 text-center">
            <p className="mb-4">まだ大会が登録されていません。</p>
            <Button onClick={handleCreateCompetition}>最初の大会を作成する</Button>
          </div>
        ) : (
          <div className="divide-y">
            {competitions.map(comp => (
              <div key={comp.id} className="p-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex flex-col">
                    <Link href={`/admin/competitions/${comp.id}`} className="hover:underline">
                      <span className="font-medium">{comp.name}</span>
                      <span className="text-sm text-muted-foreground ml-2">({comp.season})</span>
                    </Link>
                    <label className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground cursor-pointer select-none">
                      <input
                        type="radio"
                        name="showOnHome"
                        className="h-3 w-3"
                        checked={!!comp.showOnHome}
                        onChange={() => handleSetShowOnHome(comp)}
                      />
                      <span>HPに表示</span>
                    </label>
                  </div>
                </div>
                <div className="flex items-center gap-2 self-end sm:self-auto">
                  <Link href={`/admin/competitions/${comp.id}`}>
                    <Button variant="outline" size="icon"><CalendarDays className="h-4 w-4" /></Button>
                  </Link>
                  <Link href={`/admin/competitions/${comp.id}/edit`}>
                    <Button variant="outline" size="icon"><Pencil className="h-4 w-4" /></Button>
                  </Link>
                  <Button
                    variant="outline"
                    size="icon"
                    className="border-red-500 text-red-500 hover:bg-red-50"
                    onClick={() => setDeletingCompetition(comp)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
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
            <AlertDialogTitle>無料プランの上限に達しました</AlertDialogTitle>
            <AlertDialogDescription>
              無料プランでは大会は1つまで作成できます。既存の大会を編集するか、不要な大会を削除してください。
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
