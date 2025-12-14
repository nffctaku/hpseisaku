"use client";

import { useMemo, useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import { collection, addDoc, query, onSnapshot, doc, updateDoc, deleteDoc } from "firebase/firestore";
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
import { StaffForm, StaffFormValues } from "./staff-form";
import { Staff } from "@/types/staff";
import { staffColumns } from "./staff-columns";
import { PlayersDataTable } from "./players-data-table";

interface StaffManagementProps {
  teamId: string;
  selectedSeason?: string;
}

export function StaffManagement({ teamId, selectedSeason }: StaffManagementProps) {
  const { user } = useAuth();
  const isPro = user?.plan === "pro";
  const [staff, setStaff] = useState<Staff[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
  const [deletingStaff, setDeletingStaff] = useState<Staff | null>(null);

  const staffFormKey = editingStaff ? editingStaff.id : `new-${selectedSeason || ""}`;

  const filteredStaff = useMemo(() => {
    if (!selectedSeason) return staff;
    return staff.filter((p) => (p.seasons || []).includes(selectedSeason));
  }, [staff, selectedSeason]);

  useEffect(() => {
    if (!user || !teamId) return;
    const staffColRef = collection(db, `clubs/${user.uid}/teams/${teamId}/staff`);
    const q = query(staffColRef);

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const list = querySnapshot.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as Staff));
      setStaff(list);
    });

    return () => unsubscribe();
  }, [user, teamId]);

  const handleFormSubmit = async (values: StaffFormValues) => {
    if (!user || !teamId) return;
    try {
      const staffColRef = collection(db, `clubs/${user.uid}/teams/${teamId}/staff`);

      const resolvedValues: StaffFormValues = editingStaff
        ? ({
            ...values,
            seasons: (editingStaff as any)?.seasons || values.seasons,
          } as StaffFormValues)
        : ({
            ...values,
            seasons: selectedSeason ? [selectedSeason] : [],
          } as StaffFormValues);

      if (editingStaff) {
        const staffDocRef = doc(staffColRef, editingStaff.id);
        await updateDoc(staffDocRef, resolvedValues);
        toast.success("スタッフを更新しました。");
      } else {
        if (!isPro && filteredStaff.length >= 26) {
          toast.error("無料プランでは1シーズンあたりスタッフは最大26人まで登録できます。");
          return;
        }
        await addDoc(staffColRef, resolvedValues);
        toast.success("スタッフを追加しました。");
      }

      setIsDialogOpen(false);
      setEditingStaff(null);
    } catch (error) {
      console.error("Error saving staff: ", error);
      toast.error("スタッフの保存に失敗しました。権限（permission-denied）や入力内容をご確認ください。");
    }
  };

  const handleDeleteStaff = async () => {
    if (!user || !deletingStaff || !teamId) return;
    try {
      const staffDocRef = doc(db, `clubs/${user.uid}/teams/${teamId}/staff`, deletingStaff.id);
      await deleteDoc(staffDocRef);
      toast.success("スタッフを削除しました。");
      setDeletingStaff(null);
    } catch (error) {
      console.error("Error deleting staff: ", error);
      toast.error("スタッフの削除に失敗しました。");
    }
  };

  const openEditDialog = (s: Staff) => {
    setEditingStaff(s);
    setIsDialogOpen(true);
  };

  const openAddDialog = () => {
    if (!isPro && filteredStaff.length >= 26) {
      toast.error("無料プランでは1シーズンあたりスタッフは最大26人まで登録できます。");
      return;
    }
    setEditingStaff(null);
    setIsDialogOpen(true);
  };

  return (
    <>
      <div className="mt-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold">スタッフ管理</h2>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button
                onClick={openAddDialog}
                className="bg-white text-gray-900 hover:bg-gray-100 border border-border"
              >
                スタッフを追加
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-h-[80vh]">
              <DialogHeader>
                <DialogTitle>{editingStaff ? "スタッフを編集" : "スタッフを追加"}</DialogTitle>
              </DialogHeader>
              <StaffForm
                key={staffFormKey}
                onSubmit={handleFormSubmit}
                defaultValues={editingStaff || undefined}
                defaultSeason={selectedSeason}
              />
            </DialogContent>
          </Dialog>
        </div>

        <PlayersDataTable
          columns={staffColumns(openEditDialog, setDeletingStaff)}
          data={filteredStaff}
        />
      </div>

      <AlertDialog open={!!deletingStaff} onOpenChange={() => setDeletingStaff(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>本当に削除しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              スタッフ「{deletingStaff?.name}」を削除します。この操作は元に戻せません。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteStaff}>削除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
