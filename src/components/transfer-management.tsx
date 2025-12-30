"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";

import { toast } from "sonner";

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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import type { Player } from "@/types/player";
import type { TransferDirection, TransferLog } from "@/types/transfer";

import { TransferForm, TransferFormValues } from "@/components/transfer-form";
import { PlayersDataTable } from "@/components/players-data-table";
import { transferColumns } from "@/components/transfers-columns";

interface TransferManagementProps {
  teamId: string;
  seasons: string[];
  selectedSeason: string;
  onChangeSeason: (seasonId: string) => void;
}

export function TransferManagement({ teamId, seasons, selectedSeason, onChangeSeason }: TransferManagementProps) {
  const { user } = useAuth();
  const clubUid = (user as any)?.ownerUid || user?.uid;

  const [direction, setDirection] = useState<TransferDirection>("in");
  const [items, setItems] = useState<TransferLog[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TransferLog | null>(null);
  const [deleting, setDeleting] = useState<TransferLog | null>(null);

  const transferFormKey = editing ? editing.id : `new-${selectedSeason}-${direction}`;

  useEffect(() => {
    if (!clubUid || !teamId) return;
    const colRef = collection(db, `clubs/${clubUid}/teams/${teamId}/transfers`);
    const q = query(colRef);

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as TransferLog));
        setItems(list);
      },
      (error) => {
        const code = (error as any)?.code;
        console.error("[TransferManagement] transfers onSnapshot error", error, {
          code,
          path: `clubs/${clubUid}/teams/${teamId}/transfers`,
        });
        toast.error(code === "permission-denied" ? "移籍ログの取得に失敗しました（permission-denied）。" : "移籍ログの取得に失敗しました。", {
          id: "transfer-onSnapshot-error",
        });
      }
    );

    return () => unsubscribe();
  }, [clubUid, teamId]);

  useEffect(() => {
    if (!clubUid || !teamId) return;
    const colRef = collection(db, `clubs/${clubUid}/teams/${teamId}/players`);
    const q = query(colRef);

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as Player));
        setPlayers(list);
      },
      (error) => {
        const code = (error as any)?.code;
        console.error("[TransferManagement] players onSnapshot error", error, {
          code,
          path: `clubs/${clubUid}/teams/${teamId}/players`,
        });
      }
    );

    return () => unsubscribe();
  }, [clubUid, teamId]);

  const filteredPlayers = useMemo(() => {
    if (!selectedSeason) return players;
    return players
      .filter((p) => (p.seasons || []).includes(selectedSeason))
      .map((p) => {
        const season = (p.seasonData || {})[selectedSeason] as any;
        return {
          ...p,
          age: season?.age ?? (p as any).age,
          position: season?.position ?? (p as any).position,
        } as Player;
      });
  }, [players, selectedSeason]);

  const filteredItems = useMemo(() => {
    return items
      .filter((t) => t.season === selectedSeason)
      .filter((t) => t.direction === direction)
      .sort((a, b) => (a.playerName || "").localeCompare(b.playerName || ""));
  }, [items, selectedSeason, direction]);

  const openAddDialog = () => {
    setEditing(null);
    setIsDialogOpen(true);
  };

  const openEditDialog = (row: TransferLog) => {
    setEditing(row);
    setIsDialogOpen(true);
  };

  const handleFormSubmit = async (values: TransferFormValues) => {
    if (!clubUid || !teamId) return;

    const payload: any = {
      season: values.season,
      direction: values.direction,
      kind: (values as any).kind || "完全",
      playerName: values.playerName,
      counterparty: values.counterparty,
      updatedAt: serverTimestamp(),
    };

    if (values.playerId && values.playerId.trim().length > 0) {
      payload.playerId = values.playerId;
    }
    if (values.age != null) {
      payload.age = values.age;
    }
    if (values.position && values.position.trim().length > 0) {
      payload.position = values.position;
    }
    if (values.fee != null) {
      payload.fee = values.fee;
      payload.feeCurrency = values.feeCurrency || "JPY";
    }

    if (values.direction === "in") {
      if (values.annualSalary != null) {
        payload.annualSalary = values.annualSalary;
        payload.annualSalaryCurrency = values.annualSalaryCurrency || "JPY";
      }
      if (values.contractYears != null) {
        payload.contractYears = values.contractYears;
      }
    }

    try {
      const colRef = collection(db, `clubs/${clubUid}/teams/${teamId}/transfers`);
      if (editing) {
        const ref = doc(colRef, editing.id);
        await updateDoc(ref, payload);
        toast.success("移籍ログを更新しました。");
      } else {
        await addDoc(colRef, { ...payload, createdAt: serverTimestamp() });
        toast.success("移籍ログを追加しました。");
      }
      setIsDialogOpen(false);
      setEditing(null);
    } catch (error) {
      console.error("Error saving transfer: ", error);
      toast.error("移籍ログの保存に失敗しました。権限や入力内容をご確認ください。");
    }
  };

  const handleDelete = async () => {
    if (!clubUid || !teamId || !deleting) return;
    try {
      const ref = doc(db, `clubs/${clubUid}/teams/${teamId}/transfers`, deleting.id);
      await deleteDoc(ref);
      toast.success("移籍ログを削除しました。");
      setDeleting(null);
    } catch (error) {
      console.error("Error deleting transfer: ", error);
      toast.error("移籍ログの削除に失敗しました。");
    }
  };

  return (
    <>
      <div className="mt-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between mb-4">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">シーズン</span>
              <Select value={selectedSeason} onValueChange={onChangeSeason}>
                <SelectTrigger className="w-40 bg-white text-gray-900">
                  <SelectValue placeholder="シーズン" />
                </SelectTrigger>
                <SelectContent>
                  {seasons.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-2">
              <Button
                type="button"
                variant={direction === "in" ? "default" : "outline"}
                onClick={() => setDirection("in")}
                className={
                  direction === "in"
                    ? "bg-green-600 text-white hover:bg-green-700"
                    : "bg-white text-gray-900 border border-border hover:bg-gray-100"
                }
              >
                IN
              </Button>
              <Button
                type="button"
                variant={direction === "out" ? "default" : "outline"}
                onClick={() => setDirection("out")}
                className={
                  direction === "out"
                    ? "bg-red-600 text-white hover:bg-red-700"
                    : "bg-white text-gray-900 border border-border hover:bg-gray-100"
                }
              >
                OUT
              </Button>
            </div>
          </div>

          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={openAddDialog} className="bg-white text-gray-900 hover:bg-gray-100 border border-border">
                追加
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-h-[80vh]">
              <DialogHeader>
                <DialogTitle>{editing ? "移籍ログを編集" : "移籍ログを追加"}</DialogTitle>
              </DialogHeader>
              <TransferForm
                key={transferFormKey}
                onSubmit={handleFormSubmit}
                defaultValues={editing || undefined}
                season={selectedSeason}
                direction={direction}
                players={filteredPlayers}
              />
            </DialogContent>
          </Dialog>
        </div>

        <PlayersDataTable columns={transferColumns(direction, openEditDialog, setDeleting)} data={filteredItems} />
      </div>

      <AlertDialog open={!!deleting} onOpenChange={() => setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>本当に削除しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              移籍ログ「{deleting?.playerName}」を削除します。この操作は元に戻せません。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>削除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
