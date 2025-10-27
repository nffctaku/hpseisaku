"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import { collection, query, onSnapshot, doc, deleteDoc } from "firebase/firestore";
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
}

export default function CompetitionsPage() {
  const { user } = useAuth();
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [deletingCompetition, setDeletingCompetition] = useState<Competition | null>(null);

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
        <h1 className="text-3xl font-bold">大会管理</h1>
        <Link href="/admin/competitions/new">
          <Button>新規大会を追加</Button>
        </Link>
      </div>
      <div className="bg-card border rounded-lg">
        <div className="divide-y">
          {competitions.map(comp => (
            <div key={comp.id} className="p-4 flex justify-between items-center">
              <Link href={`/admin/competitions/${comp.id}`} className="hover:underline">
                <span className="font-medium">{comp.name}</span>
                <span className="text-sm text-muted-foreground ml-2">({comp.season})</span>
              </Link>
              <div className="flex items-center gap-2">
                <Link href={`/admin/competitions/${comp.id}`}>
                  <Button variant="outline" size="icon"><CalendarDays className="h-4 w-4" /></Button>
                </Link>
                <Link href={`/admin/competitions/${comp.id}/edit`}>
                  <Button variant="outline" size="icon"><Pencil className="h-4 w-4" /></Button>
                </Link>
                <Button variant="destructive" size="icon" onClick={() => setDeletingCompetition(comp)}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </div>
          ))}
        </div>
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
    </div>
  );
}
