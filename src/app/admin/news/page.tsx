"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import { collection, query, onSnapshot, addDoc, doc, updateDoc, deleteDoc, serverTimestamp, Timestamp } from "firebase/firestore";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { format } from 'date-fns';

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { ImageUploader } from "@/components/image-uploader";
import Image from 'next/image';

const newsSchema = z.object({
  title: z.string().min(1, { message: "タイトルは必須です。" }),
  content: z.string().min(1, { message: "本文は必須です。" }),
  publishedAt: z.date(),
  imageUrl: z.string().url({ message: "無効なURLです。" }).optional(),
});

interface NewsArticle extends z.infer<typeof newsSchema> {
  id: string;
  createdAt: Timestamp;
}

type NewsFormValues = z.infer<typeof newsSchema>;

export default function NewsAdminPage() {
  const { user } = useAuth();
  const [news, setNews] = useState<NewsArticle[]>([]);
  const [editingArticle, setEditingArticle] = useState<NewsArticle | null>(null);
  const [deletingArticle, setDeletingArticle] = useState<NewsArticle | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);

  const form = useForm<NewsFormValues>({
    resolver: zodResolver(newsSchema),
    defaultValues: { title: '', content: '', publishedAt: new Date(), imageUrl: '' },
  });

  useEffect(() => {
    if (!user) {
        setPageLoading(false);
        return;
    };
    const newsColRef = collection(db, `clubs/${user.uid}/news`);
    const q = query(newsColRef);

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const articlesData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        publishedAt: (doc.data().publishedAt as Timestamp).toDate(),
      } as NewsArticle));
      articlesData.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
      setNews(articlesData);
      setPageLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  const handleOpenDialog = (article: NewsArticle | null) => {
    setEditingArticle(article);
    form.reset(article ? { ...article, imageUrl: article.imageUrl || '' } : { title: '', content: '', publishedAt: new Date(), imageUrl: '' });
    setIsDialogOpen(true);
  };

  const handleFormSubmit = async (values: NewsFormValues) => {
    if (!user) return;
    setLoading(true);

    try {
      const processedValues = { 
        ...values, 
        publishedAt: Timestamp.fromDate(values.publishedAt),
        updatedAt: serverTimestamp(),
      };

      if (editingArticle) {
        const articleDocRef = doc(db, `clubs/${user.uid}/news`, editingArticle.id);
        await updateDoc(articleDocRef, processedValues);
        toast.success("ニュースを更新しました。");
      } else {
        const newsColRef = collection(db, `clubs/${user.uid}/news`);
        await addDoc(newsColRef, { ...processedValues, createdAt: serverTimestamp() });
        toast.success("新しいニュースを追加しました。");
      }
      setIsDialogOpen(false);
    } catch (error) {
      console.error("Error saving news: ", error);
      toast.error("保存に失敗しました。");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!user || !deletingArticle) return;
    try {
      const articleDocRef = doc(db, `clubs/${user.uid}/news`, deletingArticle.id);
      await deleteDoc(articleDocRef);
      toast.success("ニュースを削除しました。");
      setDeletingArticle(null);
    } catch (error) {
      console.error("Error deleting news: ", error);
      toast.error("削除に失敗しました。");
    }
  };

  if (pageLoading) {
    return <div className="container mx-auto py-10 flex justify-center items-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  return (
    <div className="container mx-auto py-10">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">ニュース管理</h1>
        <Button onClick={() => handleOpenDialog(null)}>新規ニュースを追加</Button>
      </div>
      <div className="bg-card border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>画像</TableHead>
              <TableHead className="w-[50%]">タイトル</TableHead>
              <TableHead>公開日</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {news.map(article => (
              <TableRow key={article.id}>
                <TableCell>
                  {article.imageUrl ? (
                    <Image src={article.imageUrl} alt={article.title} width={64} height={36} className="object-cover rounded-md" />
                  ) : (
                    <div className="w-16 h-9 bg-muted rounded-md" />
                  )}
                </TableCell>
                <TableCell className="font-medium">{article.title}</TableCell>
                <TableCell>{format(article.publishedAt, 'yyyy/MM/dd')}</TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" onClick={() => handleOpenDialog(article)}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => setDeletingArticle(article)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[625px]">
          <DialogHeader>
            <DialogTitle>{editingArticle ? 'ニュースを編集' : '新規ニュースを追加'}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-4">
              <FormField control={form.control} name="title" render={({ field }) => (
                <FormItem>
                  <FormLabel>タイトル</FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="imageUrl" render={({ field }) => (
                <FormItem>
                  <FormLabel>アイキャッチ画像</FormLabel>
                  <FormControl>
                    <ImageUploader value={field.value || ''} onChange={field.onChange} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="content" render={({ field }) => (
                <FormItem>
                  <FormLabel>本文 (Markdown対応)</FormLabel>
                  <FormControl><Textarea {...field} rows={10} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="publishedAt" render={({ field }) => (
                <FormItem>
                  <FormLabel>公開日</FormLabel>
                  <FormControl><Input type="date" value={format(field.value, 'yyyy-MM-dd')} onChange={e => field.onChange(new Date(e.target.value))} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <DialogFooter>
                <Button type="submit" disabled={loading}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  保存する
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingArticle} onOpenChange={() => setDeletingArticle(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>本当に削除しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              ニュース「{deletingArticle?.title}」を削除します。この操作は元に戻せません。
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