"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import { collection, addDoc, query, onSnapshot, doc, updateDoc, deleteDoc, where } from "firebase/firestore";
import Image from 'next/image';
import { Button } from "@/components/ui/button";
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
  season: string;
}

export function PlayerManagement({ season }: PlayerManagementProps) {
  const { user } = useAuth();
  const [players, setPlayers] = useState<Player[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);
  const [deletingPlayer, setDeletingPlayer] = useState<Player | null>(null);

  useEffect(() => {
    if (!user || !season) return;
    const rosterColRef = collection(db, `clubs/${user.uid}/seasons/${season}/roster`);
    const q = query(rosterColRef);

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const playersData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Player));
      setPlayers(playersData);
    });

    return () => unsubscribe();
  }, [user, season]);

  const handleFormSubmit = async (values: PlayerFormValues) => {
    if (!user || !season) return;
    try {
      const rosterColRef = collection(db, `clubs/${user.uid}/seasons/${season}/roster`);
      if (editingPlayer) {
        const playerDocRef = doc(rosterColRef, editingPlayer.id);
        await updateDoc(playerDocRef, values);
      } else {
        await addDoc(rosterColRef, values);
      }
      setIsDialogOpen(false);
      setEditingPlayer(null);
    } catch (error) {
      console.error("Error saving player: ", error);
    }
  };


  const handleDeletePlayer = async () => {
    if (!user || !deletingPlayer) return;
    try {
      if (!user || !season || !deletingPlayer) return;
      const playerDocRef = doc(db, `clubs/${user.uid}/seasons/${season}/roster`, deletingPlayer.id);
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
              <Button onClick={openAddDialog}>選手を追加</Button>
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
