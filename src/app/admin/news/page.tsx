"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import { collection, query, onSnapshot, addDoc, doc, updateDoc, deleteDoc, serverTimestamp, Timestamp, getDoc, setDoc } from "firebase/firestore";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { format } from 'date-fns';

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
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

const newsSchema = z.object({
  title: z.string().min(1, { message: "タイトルは必須です。" }),
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

interface NewsArticle extends z.infer<typeof newsSchema> {
  id: string;
  createdAt: Timestamp;
  featuredInHero?: boolean;
}

type NewsFormValues = z.infer<typeof newsSchema>;

export default function NewsAdminPage() {
  const { user } = useAuth();
  const isPro = user?.plan === "pro";
  const [news, setNews] = useState<NewsArticle[]>([]);
  const [editingArticle, setEditingArticle] = useState<NewsArticle | null>(null);
  const [deletingArticle, setDeletingArticle] = useState<NewsArticle | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [heroLimit, setHeroLimit] = useState<number>(3);

  const MAX_NEWS_FREE = 5;

  const form = useForm<NewsFormValues>({
    resolver: zodResolver(newsSchema),
    defaultValues: { title: '', content: '', noteUrl: '', publishedAt: new Date(), imageUrl: '' },
  });

  useEffect(() => {
    if (!user) {
        setPageLoading(false);
        return;
    }

    const newsColRef = collection(db, `clubs/${user.uid}/news`);
    const q = query(newsColRef);

    const unsubscribeNews = onSnapshot(q, (querySnapshot) => {
      const articlesData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        publishedAt: (doc.data().publishedAt as Timestamp).toDate(),
      } as NewsArticle));
      articlesData.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
      setNews(articlesData);
      setPageLoading(false);
    });

    // Fetch hero news limit from club profile
    const fetchHeroLimit = async () => {
      try {
        const clubDocRef = doc(db, "clubs", user.uid);
        const snap = await getDoc(clubDocRef);
        if (snap.exists()) {
          const data = snap.data() as any;
          if (typeof data.heroNewsLimit === "number" && data.heroNewsLimit >= 1 && data.heroNewsLimit <= 5) {
            setHeroLimit(data.heroNewsLimit);
          }
        }
      } catch (e) {
        console.error("Failed to load hero news limit", e);
      }
    };

    fetchHeroLimit();

    return () => {
      unsubscribeNews();
    };
  }, [user]);

  const handleHeroLimitChange = async (value: number) => {
    if (!user) return;
    try {
      const clubDocRef = doc(db, "clubs", user.uid);
      const snap = await getDoc(clubDocRef);
      if (snap.exists()) {
        await updateDoc(clubDocRef, { heroNewsLimit: value });
      } else {
        await setDoc(
          clubDocRef,
          { heroNewsLimit: value },
          { merge: true }
        );
      }
      setHeroLimit(value);
      toast.success("スライドに表示するニュース枚数を更新しました。");
    } catch (e) {
      console.error("Failed to update hero news limit", e);
      toast.error("スライド枚数の更新に失敗しました。");
    }
  };

  const handleToggleFeatured = async (article: NewsArticle, next: boolean) => {
    if (!user) return;
    const currentFeaturedCount = news.filter(n => n.featuredInHero).length;
    if (next && !article.featuredInHero && currentFeaturedCount >= heroLimit) {
      toast.info(`スライドに設定できるニュースは最大${heroLimit}件までです。`);
      return;
    }
    try {
      const articleDocRef = doc(db, `clubs/${user.uid}/news`, article.id);
      await updateDoc(articleDocRef, { featuredInHero: next });
    } catch (e) {
      console.error("Failed to update featuredInHero", e);
      toast.error("スライド表示フラグの更新に失敗しました。");
    }
  };

  const handleOpenDialog = (article: NewsArticle | null) => {
    if (!isPro && !article && news.length >= MAX_NEWS_FREE) {
      toast.info("無料プランではニュースは5件まで登録できます。既存のニュースを編集するか、不要なニュースを削除してください。");
      return;
    }
    setEditingArticle(article);
    form.reset(
      article
        ? { ...article, imageUrl: article.imageUrl || '', noteUrl: (article as any).noteUrl || '' }
        : { title: '', content: '', noteUrl: '', publishedAt: new Date(), imageUrl: '' }
    );
    setIsDialogOpen(true);
  };

  const handleFormSubmit = async (values: NewsFormValues) => {
    if (!user) return;
    setLoading(true);

    try {
      const processedValues = { 
        ...values, 
        content: values.content?.trim() || "",
        noteUrl: values.noteUrl?.toString().trim() || "",
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
      <div className="flex flex-col gap-4 mb-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold">ニュース管理</h1>
          <Button onClick={() => handleOpenDialog(null)}>新規ニュースを追加</Button>
        </div>
        <div className="flex flex-col gap-2 text-sm max-w-xs">
          <span className="font-medium">トップのスライドに表示するニュース数</span>
          <Select
            value={String(heroLimit)}
            onValueChange={(val) => handleHeroLimitChange(Number(val))}
          >
            <SelectTrigger className="bg-white text-gray-900 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[1, 2, 3, 4, 5].map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n}件
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">※ 最新ニュースまたはチェックされたニュースが表示されます。</span>
        </div>
      </div>
      <div className="bg-card border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>画像</TableHead>
              <TableHead className="w-[50%]">タイトル</TableHead>
              <TableHead>公開日</TableHead>
              <TableHead>スライド</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {news.map(article => (
              <TableRow key={article.id}>
                <TableCell>
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
                <TableCell className="font-medium">{article.title}</TableCell>
                <TableCell>{format(article.publishedAt, 'yyyy/MM/dd')}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={!!article.featuredInHero}
                      onCheckedChange={(checked) => handleToggleFeatured(article, checked)}
                    />
                  </div>
                </TableCell>
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