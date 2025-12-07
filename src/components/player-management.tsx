"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import { collection, addDoc, query, onSnapshot, doc, updateDoc, deleteDoc, where } from "firebase/firestore";
import Image from 'next/image';
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { PlayerForm, PlayerFormValues } from "./player-form";
import { Player } from "@/types/player";
import { columns } from "./players-columns";
import { PlayersDataTable } from "./players-data-table";

interface PlayerManagementProps {
  teamId: string;
}

export function PlayerManagement({ teamId }: PlayerManagementProps) {
  const { user } = useAuth();
  const isPro = user?.plan === "pro";
  const [players, setPlayers] = useState<Player[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);
  const [deletingPlayer, setDeletingPlayer] = useState<Player | null>(null);

  useEffect(() => {
    if (!user || !teamId) return;
    const playersColRef = collection(db, `clubs/${user.uid}/teams/${teamId}/players`);
    const q = query(playersColRef);

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const playersData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Player));
      setPlayers(playersData);
    });

    return () => unsubscribe();
  }, [user, teamId]);

  const handleFormSubmit = async (values: PlayerFormValues) => {
    if (!user || !teamId) return;
    try {
      const playersColRef = collection(db, `clubs/${user.uid}/teams/${teamId}/players`);
      if (editingPlayer) {
        const playerDocRef = doc(playersColRef, editingPlayer.id);
        await updateDoc(playerDocRef, values);
      } else {
        await addDoc(playersColRef, values);
      }
      setIsDialogOpen(false);
      setEditingPlayer(null);
    } catch (error) {
      console.error("Error saving player: ", error);
    }
  };


  const handleDeletePlayer = async () => {
    if (!user || !deletingPlayer || !teamId) return;
    try {
      const playerDocRef = doc(db, `clubs/${user.uid}/teams/${teamId}/players`, deletingPlayer.id);
      await deleteDoc(playerDocRef);
      setDeletingPlayer(null);
    } catch (error) {
      console.error("Error deleting player: ", error);
    }
  };

  const openEditDialog = (player: Player) => {
    setEditingPlayer(player);
    setIsDialogOpen(true);
  };

  const openAddDialog = () => {
    if (!isPro && players.length >= 26) {
      toast.error("無料プランでは1チームあたり選手は最大26人まで登録できます。");
      return;
    }
    setEditingPlayer(null);
    setIsDialogOpen(true);
  };

  return (
    <>
      <div className="mt-12">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold">選手管理</h2>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button
                onClick={openAddDialog}
                disabled={!isPro && players.length >= 26}
                className="bg-white text-gray-900 hover:bg-gray-100 border border-border"
              >
                選手を追加
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingPlayer ? '選手を編集' : '選手を追加'}</DialogTitle>
              </DialogHeader>
              <PlayerForm
                onSubmit={handleFormSubmit}
                defaultValues={editingPlayer || undefined}
              />
            </DialogContent>
          </Dialog>
        </div>

        <PlayersDataTable columns={columns(openEditDialog, setDeletingPlayer)} data={players} />
      </div>

      <AlertDialog open={!!deletingPlayer} onOpenChange={() => setDeletingPlayer(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>本当に削除しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              選手「{deletingPlayer?.name}」を削除します。この操作は元に戻せません。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeletePlayer}>削除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
