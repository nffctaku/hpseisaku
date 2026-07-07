"use client";

import { useMemo, useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import { collection, addDoc, query, onSnapshot, doc, updateDoc, deleteDoc } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { getPlanLimit, getPlanTier } from "@/lib/plan-limits";
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
  const { user, ownerUid } = useAuth();
  const clubUid = ownerUid || user?.uid;
  const isPro = user?.plan === "pro";
  const [staff, setStaff] = useState<Staff[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
  const [deletingStaff, setDeletingStaff] = useState<Staff | null>(null);

  const planTier = getPlanTier(user?.plan);
  const maxStaff = getPlanLimit("staff_per_season", planTier);

  const staffFormKey = editingStaff ? editingStaff.id : `new-${selectedSeason || ""}`;

  const staffDraftStorageKey = useMemo(() => {
    if (!clubUid || !teamId) return "";
    const sid = editingStaff?.id ? `edit_${editingStaff.id}` : `new_${selectedSeason || ""}`;
    return `staff_draft_${clubUid}_${teamId}_${sid}`;
  }, [clubUid, editingStaff?.id, selectedSeason, teamId]);

  const filteredStaff = useMemo(() => {
    if (!selectedSeason) return staff;
    return staff.filter((p) => (p.seasons || []).includes(selectedSeason));
  }, [staff, selectedSeason]);

  useEffect(() => {
    if (!clubUid || !teamId) return;
    const staffColRef = collection(db, `clubs/${clubUid}/teams/${teamId}/staff`);
    const q = query(staffColRef);

    const unsubscribe = onSnapshot(
      q,
      (querySnapshot) => {
        const list = querySnapshot.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as Staff));
        setStaff(list);
      },
      (error) => {
        const code = (error as any)?.code;
        const message = (error as any)?.message;
        console.error(
          "[StaffManagement] staff onSnapshot error",
          error,
          {
            code,
            message,
            errorString: String(error),
            path: `clubs/${clubUid}/teams/${teamId}/staff`,
            uid: clubUid,
            teamId,
          }
        );
        toast.error(
          code === "permission-denied"
            ? "スタッフデータの取得に失敗しました（permission-denied）。権限設定をご確認ください。"
            : "スタッフデータの取得に失敗しました。",
          {
            id: "staff-onSnapshot-error",
          }
        );
      }
    );

    return () => unsubscribe();
  }, [clubUid, teamId]);

  const handleFormSubmit = async (values: StaffFormValues) => {
    if (!clubUid || !teamId) return;
    try {
      const staffColRef = collection(db, `clubs/${clubUid}/teams/${teamId}/staff`);

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
        if (Number.isFinite(maxStaff) && filteredStaff.length >= maxStaff) {
          toast.error(`現在のプランでは1シーズンあたりスタッフは最大${maxStaff}人まで登録できます。`);
          return;
        }
        await addDoc(staffColRef, resolvedValues);
        toast.success("スタッフを追加しました。");
      }

      if (staffDraftStorageKey) {
        localStorage.removeItem(staffDraftStorageKey);
      }

      setIsDialogOpen(false);
      setEditingStaff(null);
    } catch (error) {
      console.error("Error saving staff: ", error);
      toast.error("スタッフの保存に失敗しました。権限（permission-denied）や入力内容をご確認ください。");
    }
  };

  const handleDeleteStaff = async () => {
    if (!clubUid || !deletingStaff || !teamId) return;
    try {
      const staffDocRef = doc(db, `clubs/${clubUid}/teams/${teamId}/staff`, deletingStaff.id);
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
    if (Number.isFinite(maxStaff) && filteredStaff.length >= maxStaff) {
      toast.error(`現在のプランでは1シーズンあたりスタッフは最大${maxStaff}人まで登録できます。`);
      return;
    }
    setEditingStaff(null);
    setIsDialogOpen(true);
  };

  return (
    <>
      <div className="mt-2">
        <div className="w-full mb-4">
          <div className="grid grid-cols-2 gap-1">
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button
                  onClick={openAddDialog}
                  disabled={Number.isFinite(maxStaff) && filteredStaff.length >= maxStaff}
                  className="w-full bg-blue-600 text-white hover:bg-blue-700 border border-blue-700"
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
                  draftStorageKey={staffDraftStorageKey}
                />
              </DialogContent>
            </Dialog>

            <div className="w-full bg-white/10 text-white border border-white/15 flex items-center justify-center">
              <Button
                type="button"
                disabled={Number.isFinite(maxStaff) && filteredStaff.length >= maxStaff}
                className="w-full bg-transparent text-white/80 hover:bg-white/5 border-0"
              >
                CSVで追加（準備中）
              </Button>
            </div>
          </div>
        </div>

        <div className="sm:hidden space-y-3">
          {filteredStaff.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white/70">
              スタッフがいません。
            </div>
          ) : (
            filteredStaff.map((s) => {
              return (
                <div
                  key={s.id}
                  className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3 shadow-[0_0_0_1px_rgba(255,255,255,0.02)] backdrop-blur"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-3">
                      <div className="min-w-0 flex-1 truncate text-sm font-semibold text-white">{s.name}</div>
                    </div>
                  </div>
                </div>
              );
            })
          )}

          {filteredStaff.length > 0 ? (
            <button
              type="button"
              onClick={() => {
                toast.info('並び替え機能はPC表示でご利用いただけます。');
              }}
              className="text-xs text-white/50 hover:text-white/70 underline cursor-pointer"
            >
              ※並び替えはPC表示で行えます。
            </button>
          ) : null}
        </div>

        <div className="hidden sm:block">
          <PlayersDataTable
            columns={staffColumns(openEditDialog, setDeletingStaff)}
            data={filteredStaff}
            emptyState={filteredStaff.length === 0 ? {
              title: 'まだスタッフが登録されていません',
              description: '最初の1人を追加してチームを始めましょう',
              actionLabel: 'スタッフを追加',
              onAction: openAddDialog
            } : undefined}
          />
        </div>
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
