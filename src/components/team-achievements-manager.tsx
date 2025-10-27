"use client";

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { db } from '@/lib/firebase';
import { collection, query, onSnapshot, addDoc, doc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { TeamAchievement } from '@/types/team';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PlusCircle, Edit, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

const achievementSchema = z.object({
  season: z.string().min(1, 'シーズンは必須です。例: 2023-24'),
  competitionName: z.string().min(1, '大会名は必須です。'),
  result: z.string().min(1, '結果は必須です。例: 優勝'),
  competitionLogo: z.string().url('有効なURLを入力してください。').optional().or(z.literal(''))
});

interface TeamAchievementsManagerProps {
  clubId: string;
  teamId: string;
}

export function TeamAchievementsManager({ clubId, teamId }: TeamAchievementsManagerProps) {
  const [achievements, setAchievements] = useState<TeamAchievement[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingAchievement, setEditingAchievement] = useState<TeamAchievement | null>(null);

  const form = useForm<z.infer<typeof achievementSchema>>({
    resolver: zodResolver(achievementSchema),
    defaultValues: {
      season: '',
      competitionName: '',
      result: '',
      competitionLogo: '',
    },
  });

  useEffect(() => {
    if (!clubId || !teamId) return;
    const achievementsColRef = collection(db, `clubs/${clubId}/teams/${teamId}/achievements`);
    const q = query(achievementsColRef);
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const data = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as TeamAchievement));
      setAchievements(data);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching achievements: ", error);
      toast.error('成績の取得に失敗しました。');
      setLoading(false);
    });
    return () => unsubscribe();
  }, [teamId]);

  const handleDialogOpen = (achievement: TeamAchievement | null = null) => {
    setEditingAchievement(achievement);
    if (achievement) {
      form.reset(achievement);
    } else {
      form.reset({ season: '', competitionName: '', result: '', competitionLogo: '' });
    }
    setIsDialogOpen(true);
  };

  const onSubmit = async (values: z.infer<typeof achievementSchema>) => {
    try {
      if (editingAchievement) {
        const achievementDocRef = doc(db, `clubs/${clubId}/teams/${teamId}/achievements`, editingAchievement.id);
        await updateDoc(achievementDocRef, values);
        toast.success('成績を更新しました。');
      } else {
        const achievementsColRef = collection(db, `clubs/${clubId}/teams/${teamId}/achievements`);
        await addDoc(achievementsColRef, values);
        toast.success('成績を追加しました。');
      }
      setIsDialogOpen(false);
      setEditingAchievement(null);
    } catch (error) {
      console.error("Error saving achievement: ", error);
      toast.error('保存に失敗しました。');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('本当にこの成績を削除しますか？')) return;
    try {
      const achievementDocRef = doc(db, `clubs/${clubId}/teams/${teamId}/achievements`, id);
      await deleteDoc(achievementDocRef);
      toast.success('成績を削除しました。');
    } catch (error) {
      console.error("Error deleting achievement: ", error);
      toast.error('削除に失敗しました。');
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>チーム成績</CardTitle>
        <Button onClick={() => handleDialogOpen()}> 
          <PlusCircle className="mr-2 h-4 w-4" />
          成績を追加
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p>読み込み中...</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>シーズン</TableHead>
                <TableHead>大会</TableHead>
                <TableHead>結果</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {achievements.length > 0 ? (
                achievements.map((ach) => (
                  <TableRow key={ach.id}>
                    <TableCell>{ach.season}</TableCell>
                    <TableCell>{ach.competitionName}</TableCell>
                    <TableCell>{ach.result}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => handleDialogOpen(ach)}><Edit className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(ach.id)}><Trash2 className="h-4 w-4" /></Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={4} className="text-center">成績がありません。</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingAchievement ? '成績を編集' : '成績を追加'}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField control={form.control} name="season" render={({ field }) => (
                <FormItem>
                  <FormLabel>シーズン</FormLabel>
                  <FormControl><Input placeholder="2023-24" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="competitionName" render={({ field }) => (
                <FormItem>
                  <FormLabel>大会名</FormLabel>
                  <FormControl><Input placeholder="プレミアリーグ" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="result" render={({ field }) => (
                <FormItem>
                  <FormLabel>結果</FormLabel>
                  <FormControl><Input placeholder="優勝" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="competitionLogo" render={({ field }) => (
                <FormItem>
                  <FormLabel>大会ロゴURL (任意)</FormLabel>
                  <FormControl><Input placeholder="https://example.com/logo.png" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="flex justify-end">
                <Button type="submit">保存</Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
