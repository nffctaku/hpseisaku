"use client";

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { collection, addDoc, onSnapshot, query, deleteDoc, doc, updateDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Loader2, Trash2, Edit } from 'lucide-react';
import { toast } from 'sonner';

const videoSchema = z.object({
  title: z.string().min(1, 'タイトルは必須です。'),
  youtubeVideoId: z.string().length(11, 'YouTube動画IDは11文字です。'),
  description: z.string().optional(),
});

interface Video extends z.infer<typeof videoSchema> {
  id: string;
  publishedAt: Date;
}

const extractYouTubeId = (url: string) => {
  try {
    const urlObj = new URL(url);
    if (urlObj.hostname === 'youtu.be') {
      return urlObj.pathname.slice(1);
    }
    if (urlObj.hostname.includes('youtube.com')) {
      const videoId = urlObj.searchParams.get('v');
      if (videoId) return videoId;
    }
  } catch (e) {
    // Not a valid URL, return original string
  }
  return url;
};

export default function TvAdminPage() {
  const { user } = useAuth();
  const isPro = user?.plan === "pro";
  const [videos, setVideos] = useState<Video[]>([]);
  const [editingVideo, setEditingVideo] = useState<Video | null>(null);
  const [deletingVideo, setDeletingVideo] = useState<Video | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);

  const MAX_VIDEOS_FREE = 5;

  const form = useForm<z.infer<typeof videoSchema>>({
    resolver: zodResolver(videoSchema),
    defaultValues: { title: '', youtubeVideoId: '', description: '' },
  });

  useEffect(() => {
    if (!user) {
      setPageLoading(false);
      return;
    }
    const videosColRef = collection(db, `clubs/${user.uid}/videos`);
    const q = query(videosColRef);

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const videosData = querySnapshot.docs.map(doc => {
        const data = doc.data();
        const publishedAtTimestamp = data.publishedAt as Timestamp;
        return {
          id: doc.id,
          ...data,
          publishedAt: publishedAtTimestamp ? publishedAtTimestamp.toDate() : new Date(),
        } as Video;
      });
      videosData.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
      setVideos(videosData);
      setPageLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  const handleAddNew = () => {
    if (!isPro && videos.length >= MAX_VIDEOS_FREE) {
      toast.info('無料プランでは動画は5件まで登録できます。既存の動画を編集するか、不要な動画を削除してください。');
      return;
    }
    setEditingVideo(null);
    form.reset({ title: '', youtubeVideoId: '', description: '' });
    setIsDialogOpen(true);
  };

  const handleEdit = (video: Video) => {
    setEditingVideo(video);
    form.reset(video);
    setIsDialogOpen(true);
  };

  const onSubmit = async (values: z.infer<typeof videoSchema>) => {
    if (!user) return;
    setLoading(true);

    try {
      if (editingVideo) {
        const videoDocRef = doc(db, `clubs/${user.uid}/videos`, editingVideo.id);
        await updateDoc(videoDocRef, values);
        toast.success('動画を更新しました。');
      } else {
        if (!isPro && videos.length >= MAX_VIDEOS_FREE) {
          toast.info('無料プランでは動画は5件まで登録できます。既存の動画を編集するか、不要な動画を削除してください。');
          return;
        }
        await addDoc(collection(db, `clubs/${user.uid}/videos`), {
          ...values,
          publishedAt: serverTimestamp(),
        });
        toast.success('動画を追加しました。');
      }
      setIsDialogOpen(false);
    } catch (error) {
      console.error('Error saving video:', error);
      toast.error('保存に失敗しました。');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!user || !deletingVideo) return;
    try {
      await deleteDoc(doc(db, `clubs/${user.uid}/videos`, deletingVideo.id));
      toast.success('動画を削除しました。');
    } catch (error) {
      console.error('Error deleting video:', error);
      toast.error('削除に失敗しました。');
    }
    setDeletingVideo(null);
  };

  if (pageLoading) {
    return <div className="flex justify-center items-center h-screen"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  return (
    <div className="container mx-auto py-10">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">動画管理</h1>
        <div className="flex flex-col items-end gap-1">
          <Button onClick={handleAddNew} disabled={!isPro && videos.length >= MAX_VIDEOS_FREE}>
            新規追加
          </Button>
          {!isPro && (
            <p className="text-xs text-muted-foreground">
              無料プランでは動画は最大5件まで登録できます。
            </p>
          )}
        </div>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingVideo ? '動画を編集' : '動画を追加'}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField control={form.control} name="title" render={({ field }) => (
                <FormItem>
                  <FormLabel>タイトル</FormLabel>
                  <FormControl><Input placeholder="動画のタイトル" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="youtubeVideoId" render={({ field }) => (
                <FormItem>
                  <FormLabel>YouTube動画ID</FormLabel>
                  <FormControl><Input 
  placeholder="YouTubeのURLまたは動画ID" 
  {...field} 
  onChange={(e) => {
    const extractedId = extractYouTubeId(e.target.value);
    field.onChange(extractedId);
  }}
/></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="description" render={({ field }) => (
                <FormItem>
                  <FormLabel>概要</FormLabel>
                  <FormControl><Textarea placeholder="動画の概要" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <DialogFooter>
                <Button type="submit" disabled={loading}>
                  {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {editingVideo ? '更新' : '追加'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deletingVideo} onOpenChange={() => setDeletingVideo(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>削除の確認</DialogTitle>
            <DialogDescription>本当に「{deletingVideo?.title}」を削除しますか？この操作は元に戻せません。</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingVideo(null)}>キャンセル</Button>
            <Button variant="destructive" onClick={handleDeleteConfirm}>削除</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="space-y-4">
        {videos.map(video => (
          <div key={video.id} className="bg-card p-4 rounded-lg flex justify-between items-center">
            <div>
              <h2 className="font-bold">{video.title}</h2>
              <p className="text-sm text-muted-foreground">{video.publishedAt.toLocaleDateString()}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="icon" onClick={() => handleEdit(video)}><Edit className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon" onClick={() => setDeletingVideo(video)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
