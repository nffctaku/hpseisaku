"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import { collection, query, onSnapshot, addDoc, doc, updateDoc, deleteDoc, serverTimestamp, Timestamp } from "firebase/firestore";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { format } from 'date-fns';
import { getPlanLimit, getPlanTier } from "@/lib/plan-limits";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { ImageUploader } from "@/components/image-uploader";
import Image from 'next/image';

function toCloudinaryPadded16x9(url: string, width: number) {
  if (!url) return url;
  if (!url.includes('/image/upload/')) return url;
  return url.replace(
    '/image/upload/',
    `/image/upload/c_pad,ar_16:9,w_${width},b_auto,f_auto,q_auto/`
  );
}

const NEWS_LABELS = ["お知らせ", "イベント", "スポンサー", "試合情報", "試合結果", "インタビュー", "チケット"] as const;

const newsSchema = z.object({
  title: z.string().min(1, { message: "タイトルは必須です。" }),
  category: z.enum(NEWS_LABELS),
  content: z.string().optional(),
  noteUrl: z.union([
    z.string().url({ message: "無効なURLです。" }),
    z.literal("")
  ]).optional(),
  publishedAt: z.date(),
  imageUrl: z.string().url({ message: "無効なURLです。" }).optional(),
}).refine((data) => {
  const hasContent = !!data.content && data.content.trim() !== "";
  const hasNoteUrl = !!data.noteUrl && data.noteUrl !== "";
  return hasContent || hasNoteUrl;
}, {
  path: ["noteUrl"],
  message: "本文または外部記事のURLを入力してください。",
});

type NewsLabel = (typeof NEWS_LABELS)[number];

function normalizeNewsLabel(value: string | undefined): NewsLabel {
  return NEWS_LABELS.includes(value as NewsLabel) ? (value as NewsLabel) : "お知らせ";
}

interface NewsArticle extends z.infer<typeof newsSchema> {
  id: string;
  createdAt: Timestamp;
  category: NewsLabel;
}

type NewsFormValues = z.infer<typeof newsSchema>;

export default function NewsAdminPage() {
  const { user, ownerUid } = useAuth();
  const clubUid = ownerUid || user?.uid;
  const isPro = user?.plan === "pro";
  const [news, setNews] = useState<NewsArticle[]>([]);
  const [editingArticle, setEditingArticle] = useState<NewsArticle | null>(null);
  const [deletingArticle, setDeletingArticle] = useState<NewsArticle | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);

  const planTier = getPlanTier(user?.plan);
  const maxNews = getPlanLimit("news_per_club", planTier);

  const form = useForm<NewsFormValues>({
    resolver: zodResolver(newsSchema),
    defaultValues: { title: '', category: 'お知らせ', content: '', noteUrl: '', publishedAt: new Date(), imageUrl: '' },
  });

  useEffect(() => {
    if (!clubUid) {
      setPageLoading(false);
      return;
    }

    const newsColRef = collection(db, `clubs/${clubUid}/news`);
    const q = query(newsColRef);

    const unsubscribeNews = onSnapshot(
      q,
      (querySnapshot) => {
        const articlesData = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          category: normalizeNewsLabel((doc.data().category as string | undefined)),
          publishedAt: (doc.data().publishedAt as Timestamp).toDate(),
        } as NewsArticle));
        articlesData.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
        setNews(articlesData);
        setPageLoading(false);
      },
      (error) => {
        console.error('[NewsAdminPage] onSnapshot error', {
          code: (error as any)?.code,
          message: (error as any)?.message,
          path: `clubs/${clubUid}/news`,
        });
        toast.error(
          (error as any)?.code === 'permission-denied'
            ? 'ニュースの取得に失敗しました（permission-denied）。権限設定をご確認ください。'
            : 'ニュースの取得に失敗しました。'
        );
        setPageLoading(false);
      }
    );

    return () => {
      unsubscribeNews();
    };
  }, [clubUid]);

  const handleOpenDialog = (article: NewsArticle | null) => {
    if (!isPro && !article && news.length >= maxNews) {
      toast.info(`無料プランではニュースは${maxNews}件まで登録できます。既存のニュースを編集するか、不要なニュースを削除してください。`);
      return;
    }
    setEditingArticle(article);
    form.reset(
      article
        ? { ...article, category: normalizeNewsLabel(article.category), imageUrl: article.imageUrl || '', noteUrl: article.noteUrl || '' }
        : { title: '', category: 'お知らせ', content: '', noteUrl: '', publishedAt: new Date(), imageUrl: '' }
    );
    setIsDialogOpen(true);
  };

  const handleFormSubmit = async (values: NewsFormValues) => {
    if (!clubUid) return;
    setLoading(true);

    try {
      const processedValues = { 
        ...values, 
        category: normalizeNewsLabel(values.category),
        content: values.content?.trim() || "",
        noteUrl: values.noteUrl?.toString().trim() || "",
        publishedAt: Timestamp.fromDate(values.publishedAt),
        updatedAt: serverTimestamp(),
      };

      if (editingArticle) {
        const articleDocRef = doc(db, `clubs/${clubUid}/news`, editingArticle.id);
        await updateDoc(articleDocRef, processedValues);
        toast.success("ニュースを更新しました。");
      } else {
        const newsColRef = collection(db, `clubs/${clubUid}/news`);
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
    if (!clubUid || !deletingArticle) return;
    try {
      const articleDocRef = doc(db, `clubs/${clubUid}/news`, deletingArticle.id);
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
      <div className="flex flex-col gap-4 mb-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold">ニュース管理</h1>
          <Button onClick={() => handleOpenDialog(null)} className="bg-blue-600 hover:bg-blue-700 text-white">新規ニュースを追加</Button>
        </div>
      </div>
      <div className="bg-card border rounded-lg">
        <Table className="table-auto">
          <TableHeader>
            <TableRow className="bg-gray-100 border-b">
              <TableHead className="w-16 text-gray-900 font-semibold">画像</TableHead>
              <TableHead className="w-64 text-gray-900 font-semibold">タイトル</TableHead>
              <TableHead className="w-24 text-gray-900 font-semibold">ラベル</TableHead>
              <TableHead className="w-28 text-gray-900 font-semibold">公開日</TableHead>
              <TableHead className="w-24 text-right text-gray-900 font-semibold">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {news.map(article => (
              <TableRow key={article.id}>
                <TableCell className="w-16">
                  {article.imageUrl ? (
                    <Image
                      src={toCloudinaryPadded16x9(article.imageUrl, 256)}
                      alt={article.title}
                      width={64}
                      height={36}
                      className="object-contain rounded-md"
                    />
                  ) : (
                    <div className="w-16 h-9 bg-muted rounded-md" />
                  )}
                </TableCell>
                <TableCell className="font-medium w-64 max-w-64 truncate">{article.title}</TableCell>
                <TableCell className="w-24">{article.category || 'お知らせ'}</TableCell>
                <TableCell className="w-28">{format(article.publishedAt, 'yyyy/MM/dd')}</TableCell>
                <TableCell className="w-24 text-right">
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
              <FormField control={form.control} name="category" render={({ field }) => (
                <FormItem>
                  <FormLabel>ラベル</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="ラベルを選択" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {NEWS_LABELS.map((label) => (
                        <SelectItem key={label} value={label}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="text-xs text-muted-foreground">
                    公開ページのニュース画像右上に表示されます。
                  </div>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="imageUrl" render={({ field }) => (
                <FormItem>
                  <FormLabel>アイキャッチ画像</FormLabel>
                  <FormControl>
                    <ImageUploader value={field.value || ''} onChange={field.onChange} />
                  </FormControl>
                  <div className="text-xs text-muted-foreground">
                    推奨: 16:9（例: 1600×900px以上）。表示時に16:9へ調整されます。
                  </div>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="content" render={({ field }) => (
                <FormItem>
                  <FormLabel>本文 (Markdown対応・任意)</FormLabel>
                  <FormControl><Textarea {...field} rows={10} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="noteUrl" render={({ field }) => (
                <FormItem>
                  <FormLabel>外部記事URL（本文の代わりに外部の記事へリンクする場合）</FormLabel>
                  <FormControl>
                    <Input
                      type="url"
                      placeholder="https://example.com/..."
                      {...field}
                    />
                  </FormControl>
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
                <Button type="submit" disabled={loading} className="bg-green-600 hover:bg-green-700 text-white">
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