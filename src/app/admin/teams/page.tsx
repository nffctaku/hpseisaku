"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import { collection, query, onSnapshot, addDoc, doc, updateDoc, deleteDoc, writeBatch, deleteField, getDocs, where, limit, setDoc, getDoc } from "firebase/firestore";
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from "next/navigation";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Loader2, Pencil, Trash2, ImagePlus } from "lucide-react";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const teamSchema = z.object({
  name: z.string().min(1, { message: "チーム名は必須です。" }),
  categoryId: z.string().optional(),
});

interface Team extends z.infer<typeof teamSchema> {
  id: string;
  logoUrl?: string;
}

interface TeamCategory {
  id: string;
  name: string;
}

type TeamFormValues = z.infer<typeof teamSchema>;

export default function TeamsPage() {
  const { user, ownerUid } = useAuth();
  const router = useRouter();
  const clubUid = ownerUid || user?.uid;
  const isPro = user?.plan === "pro";
  const [teams, setTeams] = useState<Team[]>([]);
  const [categories, setCategories] = useState<TeamCategory[]>([]);
  const [isCategoryDialogOpen, setIsCategoryDialogOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [deletingTeam, setDeletingTeam] = useState<Team | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const getTeamInitial = (name: string) => {
    const s = (name || '').trim();
    if (!s) return '?';
    return s.slice(0, 1).toUpperCase();
  };

  const getCategoryFilterLabel = () => {
    if (categoryFilter === 'all') return 'すべて';
    if (categoryFilter === 'uncategorized') return '未分類';
    const found = categories.find((c) => c.id === categoryFilter);
    return found?.name || '（不明）';
  };

  const form = useForm<TeamFormValues>({
    resolver: zodResolver(teamSchema),
    defaultValues: { name: '', categoryId: undefined },
  });

  useEffect(() => {
    if (!clubUid) return;
    const teamsColRef = collection(db, `clubs/${clubUid}/teams`);
    const q = query(teamsColRef);

    const unsubscribe = onSnapshot(
      q,
      (querySnapshot) => {
        const teamsData = querySnapshot.docs.map(
          (doc) =>
            ({
              id: doc.id,
              ...doc.data(),
            } as Team)
        );
        setTeams(teamsData);
      },
      (error) => {
        console.error("[AdminTeamsPage] teams onSnapshot error", {
          code: (error as any)?.code,
          message: (error as any)?.message,
          path: `clubs/${clubUid}/teams`,
          uid: clubUid,
        });
        toast.error("チーム一覧の取得に失敗しました（permission-denied）。権限設定をご確認ください。", {
          id: "teams-permission-denied",
        });
      }
    );

    return () => unsubscribe();
  }, [clubUid]);

  useEffect(() => {
    if (!clubUid) return;
    const categoriesColRef = collection(db, `clubs/${clubUid}/team_categories`);
    const q = query(categoriesColRef);

    const unsubscribe = onSnapshot(
      q,
      (querySnapshot) => {
        const data = querySnapshot.docs
          .map((d) => ({ id: d.id, ...(d.data() as any) } as TeamCategory))
          .filter((c) => typeof c.name === 'string')
          .sort((a, b) => a.name.localeCompare(b.name));
        setCategories(data);
      },
      (error) => {
        console.error("[AdminTeamsPage] team_categories onSnapshot error", error, {
          code: (error as any)?.code,
          message: (error as any)?.message,
          path: `clubs/${clubUid}/team_categories`,
          uid: clubUid,
        });
        toast.error("カテゴリ一覧の取得に失敗しました（permission-denied）。権限設定をご確認ください。", {
          id: "team-categories-permission-denied",
        });
      }
    );

    return () => unsubscribe();
  }, [clubUid]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const primaryTeamId = teams[0]?.id;
    const isEditingPrimary = editingTeam && editingTeam.id === primaryTeamId;
    const isCreatingFirstTeam = !editingTeam && teams.length === 0;
    const canUseLogo = isPro || isEditingPrimary || isCreatingFirstTeam;

    if (!canUseLogo) {
      // 無料プランの2チーム目以降ではロゴ画像は設定できない
      toast.info("無料プランではメインチームのみロゴ画像を設定できます。");
      return;
    }

    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const handleOpenDialog = (team: Team | null) => {
    setEditingTeam(team);
    form.reset(team ? { name: team.name, categoryId: team.categoryId } : { name: '', categoryId: undefined });
    setPreviewUrl(team?.logoUrl || null);
    setSelectedFile(null);
    setIsDialogOpen(true);
  };

  const handleCreateCategory = async () => {
    if (!user || !clubUid) return;
    const name = newCategoryName.trim();
    if (!name) {
      toast.error("カテゴリ名を入力してください。");
      return;
    }
    if (name.length > 10) {
      toast.error("カテゴリ名は10文字以内にしてください。");
      return;
    }
    if (categories.length >= 5) {
      toast.error("カテゴリは最大5つまでです。");
      return;
    }
    if (categories.some((c) => c.name === name)) {
      toast.error("同じ名前のカテゴリが既にあります。");
      return;
    }

    try {
      const colRef = collection(db, `clubs/${clubUid}/team_categories`);
      await addDoc(colRef, { name });
      setNewCategoryName("");
      toast.success("カテゴリを追加しました。");
    } catch (error) {
      console.error("Error creating team category:", error);
      toast.error(error instanceof Error ? error.message : "カテゴリの追加に失敗しました。");
    }
  };

  const handleDeleteCategory = async (category: TeamCategory) => {
    if (!user || !clubUid) return;
    try {
      const batch = writeBatch(db);
      const teamsToUpdate = teams.filter((t) => t.categoryId === category.id);
      teamsToUpdate.forEach((t) => {
        const teamDocRef = doc(db, `clubs/${clubUid}/teams`, t.id);
        batch.update(teamDocRef, { categoryId: null } as any);
      });

      const catDocRef = doc(db, `clubs/${clubUid}/team_categories`, category.id);
      batch.delete(catDocRef);
      await batch.commit();

      if (categoryFilter === category.id) setCategoryFilter("all");
      toast.success("カテゴリを削除しました（紐づくチームは未分類に戻しました）。");
    } catch (error) {
      console.error("Error deleting team category:", error);
      toast.error("カテゴリの削除に失敗しました。");
    }
  };

  const handleFormSubmit = async (values: TeamFormValues) => {
    if (!user) return;
    if (!clubUid) return;
    setLoading(true);

    let logoUrl = editingTeam?.logoUrl || '';

    const primaryTeamId = teams[0]?.id;
    const isEditingPrimary = editingTeam && editingTeam.id === primaryTeamId;
    const isCreatingFirstTeam = !editingTeam && teams.length === 0;
    const canUseLogo = isPro || isEditingPrimary || isCreatingFirstTeam;

    try {
      if (selectedFile && canUseLogo) {
        const formData = new FormData();
        formData.append('file', selectedFile);
        formData.append('upload_preset', process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET!);

        const response = await fetch(`https://api.cloudinary.com/v1_1/${process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME}/image/upload`, {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) throw new Error('画像のアップロードに失敗しました。');
        const data = await response.json();
        logoUrl = data.secure_url;
      }

      const categoryId = typeof values.categoryId === 'string' && values.categoryId.trim() ? values.categoryId : undefined;
      const processedValues: any = {
        name: values.name,
        logoUrl,
        ...(categoryId ? { categoryId } : {}),
      };

      if (editingTeam) {
        const teamDocRef = doc(db, `clubs/${clubUid}/teams`, editingTeam.id);
        if (!categoryId) {
          processedValues.categoryId = deleteField();
        }
        await updateDoc(teamDocRef, processedValues);
        toast.success("チームを更新しました。");
      } else {
        const teamsColRef = collection(db, `clubs/${clubUid}/teams`);
        const creatingFirstTeam = teams.length === 0;
        const created = await addDoc(teamsColRef, processedValues);

        if (creatingFirstTeam) {
          try {
            const clubProfileByUidRef = doc(db, 'club_profiles', clubUid);
            const byUidSnap = await getDoc(clubProfileByUidRef);
            const hasMainTeamByUid = byUidSnap.exists() ? Boolean((byUidSnap.data() as any)?.mainTeamId) : false;

            const byOwnerQuery = query(collection(db, 'club_profiles'), where('ownerUid', '==', clubUid), limit(1));
            const ownerSnap = await getDocs(byOwnerQuery);
            const ownerDocRef = ownerSnap.empty ? null : ownerSnap.docs[0].ref;
            const hasMainTeamByOwner = ownerSnap.empty ? false : Boolean((ownerSnap.docs[0].data() as any)?.mainTeamId);

            if (!hasMainTeamByUid && !hasMainTeamByOwner) {
              const payload = { ownerUid: clubUid, mainTeamId: created.id };
              await setDoc(clubProfileByUidRef, payload, { merge: true });
              if (ownerDocRef && ownerDocRef.id !== clubUid) {
                await setDoc(ownerDocRef, payload, { merge: true });
              }
            }
          } catch (e) {
            console.warn('[AdminTeamsPage] failed to auto-set mainTeamId', e);
          }
        }

        toast.success("新しいチームを追加しました。");
      }
      setIsDialogOpen(false);
    } catch (error) {
      console.error("Error saving team: ", error);
      toast.error(error instanceof Error ? error.message : "保存に失敗しました。");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!user || !deletingTeam) return;
    if (!clubUid) return;
    try {
      const teamDocRef = doc(db, `clubs/${clubUid}/teams`, deletingTeam.id);
      await deleteDoc(teamDocRef);
      toast.success("チームを削除しました。");
      setDeletingTeam(null);
    } catch (error) {
      console.error("Error deleting team: ", error);
      toast.error("削除に失敗しました。");
    }
  };

  return (
    <div className="container mx-auto py-8 sm:py-10">
      <div className="mb-6 sm:mb-8 space-y-3 sm:space-y-0 sm:flex sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">チーム管理</h1>
          <p className="mt-1 text-xs sm:text-sm text-muted-foreground">
            先にカテゴリを作成して、チームを分類できます。
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          <Button
            type="button"
            variant="outline"
            onClick={() => setIsCategoryDialogOpen(true)}
            className="w-full sm:w-auto bg-white text-gray-900 border border-border hover:bg-gray-100"
          >
            カテゴリ作成/管理
          </Button>
          <Button
            onClick={() => handleOpenDialog(null)}
            className="w-full sm:w-auto bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 disabled:hover:bg-emerald-600"
          >
            新規チームを追加
          </Button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mb-4">
        <div className="text-xs sm:text-sm text-muted-foreground">表示カテゴリ</div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-full sm:w-[240px] bg-white text-gray-900 border border-border">
            <span className="text-sm text-gray-900">表示カテゴリ: {getCategoryFilterLabel()}</span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">すべて</SelectItem>
            <SelectItem value="uncategorized">未分類</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
        {teams
          .filter((t) => {
            if (categoryFilter === "all") return true;
            if (categoryFilter === "uncategorized") return !t.categoryId;
            return t.categoryId === categoryFilter;
          })
          .map(team => (
          <button
            type="button"
            key={team.id}
            onClick={() => handleOpenDialog(team)}
            className="bg-card border rounded-lg p-2 sm:p-3 lg:p-4 text-center transition-colors hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            <div className="w-16 h-16 sm:w-20 sm:h-20 mb-3 sm:mb-4 flex items-center justify-center mx-auto">
              {team.logoUrl ? (
                <Image
                  src={team.logoUrl}
                  alt={team.name}
                  width={80}
                  height={80}
                  className="rounded-full object-contain"
                />
              ) : (
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-gradient-to-br from-slate-100 to-slate-300 text-slate-800 flex items-center justify-center font-bold text-xl sm:text-2xl">
                  {getTeamInitial(team.name)}
                </div>
              )}
            </div>
            <span className="font-medium text-sm break-all">{team.name}</span>
          </button>
        ))}
      </div>

      <Dialog open={isCategoryDialogOpen} onOpenChange={setIsCategoryDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>カテゴリ管理</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="text-sm text-muted-foreground">カテゴリ（最大5つ / 10文字以内）</div>
              <div className="flex gap-2">
                <Input
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="例: プレミア"
                  maxLength={10}
                />
                <Button type="button" onClick={handleCreateCategory} disabled={categories.length >= 5}>
                  追加
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              {categories.length === 0 ? (
                <div className="text-sm text-muted-foreground">カテゴリがありません。</div>
              ) : (
                <div className="space-y-2">
                  {categories.map((c) => (
                    <div key={c.id} className="flex items-center justify-between gap-2 border rounded-md px-3 py-2">
                      <div className="min-w-0">
                        <div className="font-medium truncate">{c.name}</div>
                        <div className="text-xs text-muted-foreground">
                          紐づくチーム: {teams.filter((t) => t.categoryId === c.id).length}
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        className="border-red-500 text-red-600 hover:bg-red-50"
                        onClick={() => handleDeleteCategory(c)}
                      >
                        削除
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingTeam ? 'チームを編集' : '新規チームを追加'}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>チーム名</FormLabel>
                    <FormControl><Input placeholder="例: マンチェスター・ユナイテッド" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="categoryId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>カテゴリ</FormLabel>
                    <Select
                      value={field.value || "__none__"}
                      onValueChange={(v) => field.onChange(v === "__none__" ? undefined : v)}
                    >
                      <FormControl>
                        <SelectTrigger className="bg-white text-gray-900">
                          <SelectValue placeholder="未分類" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="__none__">未分類</SelectItem>
                        {categories.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormItem>
                <FormLabel>チームロゴ</FormLabel>
                <FormControl>
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-4">
                      {/* ロゴ画像アップロードは、無料プランではメインチーム（最初の1チーム）のみ許可 */}
                      {(() => {
                        const primaryTeamId = teams[0]?.id;
                        const isEditingPrimary = editingTeam && editingTeam.id === primaryTeamId;
                        const isCreatingFirstTeam = !editingTeam && teams.length === 0;
                        const canUseLogo = isPro || isEditingPrimary || isCreatingFirstTeam;

                        return (
                          <label
                            className={`border-2 border-dashed rounded-md w-24 h-24 flex flex-col items-center justify-center text-muted-foreground transition-colors ${
                              canUseLogo
                                ? 'cursor-pointer hover:bg-muted/50'
                                : 'opacity-50 cursor-not-allowed'
                            }`}
                          >
                            {previewUrl ? (
                              <Image src={previewUrl} alt="Preview" width={96} height={96} className="object-contain" />
                            ) : (
                              <>
                                <ImagePlus className="h-8 w-8" />
                                <span className="text-xs mt-1">画像を選択</span>
                              </>
                            )}
                            {canUseLogo && (
                              <Input type="file" className="hidden" accept="image/*" onChange={handleFileChange} />
                            )}
                          </label>
                        );
                      })()}
                    </div>
                    {!isPro && teams.length > 0 && !editingTeam && (
                      <p className="text-xs text-muted-foreground">
                        無料プランではメインチーム以外のロゴ画像は設定できません。
                      </p>
                    )}
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
              <div className="flex flex-col gap-2">
                {editingTeam ? (
                  <div className="flex gap-2">
                    <Button
                      type="submit"
                      disabled={loading}
                      variant="outline"
                      className="flex-1 border-gray-400 text-gray-900 hover:bg-gray-50"
                    >
                      {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      保存する
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="flex-1 border-red-500 text-red-600 hover:bg-red-50"
                      onClick={() => {
                        setIsDialogOpen(false);
                        setDeletingTeam(editingTeam);
                      }}
                    >
                      削除
                    </Button>
                  </div>
                ) : (
                  <Button
                    type="submit"
                    disabled={loading}
                    variant="outline"
                    className="w-full border-gray-400 text-gray-900 hover:bg-gray-50"
                  >
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    保存する
                  </Button>
                )}

                {editingTeam && (
                  <Link
                    href={`/admin/teams/${editingTeam.id}/season`}
                    className="block w-full"
                  >
                    <Button type="button" variant="outline" className="w-full">
                      選手管理へ
                    </Button>
                  </Link>
                )}
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingTeam} onOpenChange={() => setDeletingTeam(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>本当に削除しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              チーム「{deletingTeam?.name}」を削除します。この操作は元に戻せません。
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
