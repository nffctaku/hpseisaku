"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import { collection, query, onSnapshot, addDoc, doc, updateDoc, deleteDoc } from "firebase/firestore";
import Image from 'next/image';
import Link from 'next/link';
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

const teamSchema = z.object({
  name: z.string().min(1, { message: "チーム名は必須です。" }),
});

interface Team extends z.infer<typeof teamSchema> {
  id: string;
  logoUrl?: string;
}

type TeamFormValues = z.infer<typeof teamSchema>;

export default function TeamsPage() {
  const { user } = useAuth();
  const isPro = user?.plan === "pro";
  const [teams, setTeams] = useState<Team[]>([]);
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [deletingTeam, setDeletingTeam] = useState<Team | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const form = useForm<TeamFormValues>({
    resolver: zodResolver(teamSchema),
    defaultValues: { name: '' },
  });

  useEffect(() => {
    if (!user) return;
    const teamsColRef = collection(db, `clubs/${user.uid}/teams`);
    const q = query(teamsColRef);

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const teamsData = querySnapshot.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data() 
      } as Team));
      setTeams(teamsData);
    });

    return () => unsubscribe();
  }, [user]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const handleOpenDialog = (team: Team | null) => {
    setEditingTeam(team);
    form.reset(team ? { name: team.name } : { name: '' });
    setPreviewUrl(team?.logoUrl || null);
    setSelectedFile(null);
    setIsDialogOpen(true);
  };

  const handleFormSubmit = async (values: TeamFormValues) => {
    if (!user) return;
    setLoading(true);

    let logoUrl = editingTeam?.logoUrl || '';

    try {
      if (!isPro && !editingTeam && teams.length >= 24) {
        toast.error("無料プランではチームは最大24チームまで登録できます。");
        return;
      }
      if (selectedFile) {
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

      const processedValues = { ...values, logoUrl };

      if (editingTeam) {
        const teamDocRef = doc(db, `clubs/${user.uid}/teams`, editingTeam.id);
        await updateDoc(teamDocRef, processedValues);
        toast.success("チームを更新しました。");
      } else {
        const teamsColRef = collection(db, `clubs/${user.uid}/teams`);
        await addDoc(teamsColRef, processedValues);
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
    try {
      const teamDocRef = doc(db, `clubs/${user.uid}/teams`, deletingTeam.id);
      await deleteDoc(teamDocRef);
      toast.success("チームを削除しました。");
      setDeletingTeam(null);
    } catch (error) {
      console.error("Error deleting team: ", error);
      toast.error("削除に失敗しました。");
    }
  };

  return (
    <div className="container mx-auto py-10">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">チーム管理</h1>
        <div className="flex flex-col items-end gap-1">
          <Button
            onClick={() => handleOpenDialog(null)}
            disabled={!isPro && teams.length >= 24}
          >
            新規チームを追加
          </Button>
          {!isPro && (
            <p className="text-xs text-muted-foreground">
              無料プランでは最大24チームまで登録できます。
            </p>
          )}
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {teams.map(team => (
          <Link href={`/admin/teams/${team.id}`} key={team.id} className="block bg-card border rounded-lg p-4 text-center relative group transition-colors hover:bg-muted/50">
            <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
               <Button variant="destructive" size="icon" className="h-7 w-7" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDeletingTeam(team); }}><Trash2 className="h-4 w-4" /></Button>
            </div>
            <div className="w-20 h-20 mb-4 flex items-center justify-center mx-auto">
              {team.logoUrl ? (
                <Image src={team.logoUrl} alt={team.name} width={80} height={80} className="rounded-full object-contain" />
              ) : (
                <div className="w-20 h-20 bg-muted rounded-full" />
              )}
            </div>
            <span className="font-medium text-sm break-all">{team.name}</span>
          </Link>
        ))}
      </div>

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
              <FormItem>
                <FormLabel>チームロゴ</FormLabel>
                <FormControl>
                  <div className="flex items-center gap-4">
                    <label className="cursor-pointer border-2 border-dashed rounded-md w-24 h-24 flex flex-col items-center justify-center text-muted-foreground hover:bg-muted/50">
                      {previewUrl ? (
                        <Image src={previewUrl} alt="Preview" width={96} height={96} className="object-contain" />
                      ) : (
                        <><ImagePlus className="h-8 w-8" /><span className="text-xs mt-1">画像を選択</span></>
                      )}
                      <Input type="file" className="hidden" accept="image/*" onChange={handleFileChange} />
                    </label>
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
              <Button type="submit" disabled={loading} className="w-full">
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                保存する
              </Button>
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
