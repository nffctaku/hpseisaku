"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useCareer } from "@/contexts/CareerContext";
import { db } from "@/lib/firebase";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { format } from "date-fns";
import { getPlanLimit, getPlanTier } from "@/lib/plan-limits";
import Image from "next/image";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Eye,
  FileText,
  Filter,
  Image as ImageIcon,
  Link as LinkIcon,
  Loader2,
  MoreVertical,
  Search,
  Sparkles,
  SquarePen,
  Star,
  StarOff,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { NewsArticle, NewsCreationMethod } from "@/types/news";
import { NewsEditor } from "./_components/NewsEditor";

function toCloudinaryPadded16x9(url: string, width: number) {
  if (!url) return url;
  if (!url.includes("/image/upload/")) return url;
  return url.replace(
    "/image/upload/",
    `/image/upload/c_pad,ar_16:9,w_${width},b_auto,f_auto,q_auto/`
  );
}

const NEWS_LABELS = ["お知らせ", "イベント", "スポンサー", "試合情報", "試合結果", "インタビュー", "チケット"] as const;

type NewsLabel = (typeof NEWS_LABELS)[number];

function normalizeNewsLabel(value: string | undefined): NewsLabel {
  return NEWS_LABELS.includes(value as NewsLabel) ? (value as NewsLabel) : "お知らせ";
}

type NewsListItem = Omit<NewsArticle, "publishedAt" | "createdAt" | "updatedAt" | "category"> & {
  publishedAt: Date;
  createdAt: Date;
  updatedAt?: Date;
  category: NewsLabel;
};

type StatusFilter = "all" | "published" | "draft";

function resolveTimestamp(value: unknown): Date | undefined {
  if (value == null) return undefined;
  if (value instanceof Date) return value;
  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value);
    return isNaN(d.getTime()) ? undefined : d;
  }
  if (typeof value === "object") {
    const v = value as { toDate?: () => Date; seconds?: number; _seconds?: number };
    if (typeof v.toDate === "function") return v.toDate();
    if (typeof v.seconds === "number") return new Date(v.seconds * 1000);
    if (typeof v._seconds === "number") return new Date(v._seconds * 1000);
  }
  return undefined;
}

function getSortDate(article: NewsListItem): Date {
  return article.publishedAt || article.updatedAt || article.createdAt || new Date(0);
}

function formatDateLabel(date: Date | undefined): string {
  if (!date) return "";
  try {
    return format(date, "yyyy/MM/dd");
  } catch {
    return "";
  }
}

function isDraft(article: NewsListItem): boolean {
  return article.status !== "published";
}

export default function NewsAdminPage() {
  const { user } = useAuth();
  const { activeCareer } = useCareer();
  // Data root must follow the active Career (ownerUid points at the old/pre-separation path).
  const clubUid = activeCareer?.clubUid || user?.uid;
  const isPro = getPlanTier(user?.plan) !== "free";
  const [news, setNews] = useState<NewsListItem[]>([]);
  const [editingArticle, setEditingArticle] = useState<NewsListItem | null>(null);
  const [deletingArticle, setDeletingArticle] = useState<NewsListItem | null>(null);
  const [previewArticle, setPreviewArticle] = useState<NewsListItem | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editorInitialMode, setEditorInitialMode] = useState<"manual" | "external" | "ai">("manual");
  const [pageLoading, setPageLoading] = useState(true);
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [creationMethodFilter, setCreationMethodFilter] = useState<string>("all");
  const [heroFilter, setHeroFilter] = useState(false);
  const [heroLimit, setHeroLimit] = useState(3);
  const [currentPage, setCurrentPage] = useState(1);

  const planTier = getPlanTier(user?.plan);
  const maxNews = getPlanLimit("news_per_club", planTier);

  useEffect(() => {
    if (!clubUid) {
      setHeroLimit(3);
      return;
    }
    getDoc(doc(db, "clubs", clubUid))
      .then((snap) => {
        const raw = (snap.data() as { heroNewsLimit?: number } | undefined)?.heroNewsLimit;
        setHeroLimit(typeof raw === "number" && raw >= 1 && raw <= 5 ? raw : 3);
      })
      .catch(() => setHeroLimit(3));
  }, [clubUid]);

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
        const articlesData: NewsListItem[] = querySnapshot.docs.map((docSnap) => {
          const data = docSnap.data();
          return {
            ...data,
            id: docSnap.id,
            title: (data.title as string) || "",
            category: normalizeNewsLabel(data.category as string | undefined),
            publishedAt: resolveTimestamp(data.publishedAt) || new Date(),
            createdAt: resolveTimestamp(data.createdAt) || new Date(),
            updatedAt: resolveTimestamp(data.updatedAt),
            featuredInHero: !!data.featuredInHero,
            status: (data.status as "draft" | "published") || "draft",
            creationMethod: (data.creationMethod as NewsCreationMethod) || undefined,
            sourceMatchId: (data.sourceMatchId as string) || undefined,
          } as NewsListItem;
        });
        articlesData.sort((a, b) => getSortDate(b).getTime() - getSortDate(a).getTime());
        setNews(articlesData);
        setPageLoading(false);
      },
      (error) => {
        console.error("[NewsAdminPage] onSnapshot error", {
          code: (error as any)?.code,
          message: (error as any)?.message,
          path: `clubs/${clubUid}/news`,
        });
        toast.error(
          (error as any)?.code === "permission-denied"
            ? "ニュースの取得に失敗しました（permission-denied）。権限設定をご確認ください。"
            : "ニュースの取得に失敗しました。"
        );
        setPageLoading(false);
      }
    );

    return () => unsubscribeNews();
  }, [clubUid]);

  const { publishedCount, draftCount, heroCount } = useMemo(() => {
    let published = 0;
    let draft = 0;
    let hero = 0;
    news.forEach((article) => {
      if (article.status === "published") published++;
      else draft++;
      if (article.featuredInHero) hero++;
    });
    return { publishedCount: published, draftCount: draft, heroCount: hero };
  }, [news]);

  const filteredNews = useMemo(() => {
    let result = [...news];
    if (statusFilter !== "all") {
      result = result.filter((article) =>
        statusFilter === "published" ? article.status === "published" : article.status !== "published"
      );
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((article) => article.title.toLowerCase().includes(q));
    }
    if (categoryFilter) {
      result = result.filter((article) => article.category === categoryFilter);
    }
    if (creationMethodFilter !== "all") {
      result = result.filter((article) => article.creationMethod === creationMethodFilter);
    }
    if (heroFilter) {
      result = result.filter((article) => article.featuredInHero);
    }
    result.sort((a, b) => getSortDate(b).getTime() - getSortDate(a).getTime());
    return result;
  }, [news, statusFilter, searchQuery, categoryFilter, creationMethodFilter, heroFilter]);

  const activeExtraFilterCount = useMemo(() => {
    let count = 0;
    if (categoryFilter) count++;
    if (creationMethodFilter !== "all") count++;
    if (heroFilter) count++;
    return count;
  }, [categoryFilter, creationMethodFilter, heroFilter]);

  const PAGE_SIZE = 10;

  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter, searchQuery, categoryFilter, creationMethodFilter, heroFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredNews.length / PAGE_SIZE));
  const pagedNews = useMemo(() => {
    const safePage = Math.max(1, Math.min(currentPage, totalPages));
    const start = (safePage - 1) * PAGE_SIZE;
    return filteredNews.slice(start, start + PAGE_SIZE);
  }, [filteredNews, currentPage, totalPages]);

  const handleOpenEditor = (article: NewsListItem | null, mode?: "manual" | "external" | "ai") => {
    if (!isPro && !article && news.length >= maxNews) {
      toast.info(`無料プランではニュースは${maxNews}件まで登録できます。既存のニュースを編集するか、不要なニュースを削除してください。`);
      return;
    }
    setEditorInitialMode(mode || "manual");
    setEditingArticle(article);
    setIsDialogOpen(true);
  };

  const handlePreview = (article: NewsListItem) => {
    setPreviewArticle(article);
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

  const withProcessing = async (articleId: string, fn: () => Promise<void>) => {
    setProcessingIds((prev) => new Set(prev).add(articleId));
    try {
      await fn();
    } finally {
      setProcessingIds((prev) => {
        const next = new Set(prev);
        next.delete(articleId);
        return next;
      });
    }
  };

  const handleToggleHero = async (article: NewsListItem) => {
    if (!clubUid) return;
    const next = !article.featuredInHero;
    if (next) {
      const currentHeroCount = news.filter((n) => n.featuredInHero).length;
      if (currentHeroCount >= heroLimit) {
        toast.info(`ヒーロー表示は最大${heroLimit}件までです。既存のヒーロー記事を解除してください。`);
        return;
      }
    }
    await withProcessing(article.id, async () => {
      const articleDocRef = doc(db, `clubs/${clubUid}/news`, article.id);
      await updateDoc(articleDocRef, {
        featuredInHero: next,
        updatedAt: serverTimestamp(),
      });
      toast.success(`ヒーロー表示を${next ? "設定" : "解除"}しました。`);
    });
  };

  const handleToggleStatus = async (article: NewsListItem) => {
    if (!clubUid) return;
    const next = isDraft(article) ? "published" : "draft";
    await withProcessing(article.id, async () => {
      const articleDocRef = doc(db, `clubs/${clubUid}/news`, article.id);
      await updateDoc(articleDocRef, {
        status: next,
        updatedAt: serverTimestamp(),
      });
      toast.success(`記事を${next === "published" ? "公開" : "非公開"}にしました。`);
    });
  };

  const clearFilters = () => {
    setStatusFilter("all");
    setSearchQuery("");
    setCategoryFilter("");
    setCreationMethodFilter("all");
    setHeroFilter(false);
  };

  if (pageLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#91A0B6]" />
      </div>
    );
  }

  const creationMethodLabel: Record<string, string> = {
    manual: "手動",
    ai_match: "AI生成",
    external: "外部記事",
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-2 py-6 sm:px-4 sm:py-8 md:px-6">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#F4F7FB] sm:text-2xl">ニュース管理</h1>
          <p className="mt-1 text-sm text-[#91A0B6]">クラブからのお知らせを作成・公開します。</p>
        </div>
      </div>

      <div className="mb-6 flex flex-col gap-3 sm:flex-row">
        <Button
          onClick={() => handleOpenEditor(null, "ai")}
          className="h-12 w-full rounded-xl bg-[#18C987] font-bold text-white hover:bg-[#14a76c] sm:w-auto sm:px-6"
        >
          <Sparkles className="mr-2 h-4 w-4" />
          AIで試合記事を作る
        </Button>
        <Button
          variant="outline"
          onClick={() => handleOpenEditor(null, "manual")}
          className="h-12 w-full rounded-xl border-[#26364C] bg-[#121F32] font-bold text-[#F4F7FB] hover:bg-[#1a2940] hover:text-white sm:w-auto sm:px-6"
        >
          <SquarePen className="mr-2 h-4 w-4" />
          自分で記事を書く
        </Button>
      </div>

      <div className="mb-6 grid grid-cols-3 gap-3 rounded-xl border border-[#26364C] bg-[#121F32] p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#18C987]/20 text-[#18C987]">
            <FileText className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="text-lg font-bold leading-none text-[#F4F7FB]">{publishedCount}</div>
            <div className="mt-1 text-xs text-[#91A0B6]">公開中</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#F4C34E]/20 text-[#F4C34E]">
            <Star className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="text-lg font-bold leading-none text-[#F4C34E]">{heroCount}</div>
            <div className="mt-1 text-xs text-[#91A0B6]">ヒーロー</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#6D4AFF]/20 text-[#9b8aff]">
            <ImageIcon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="text-lg font-bold leading-none text-[#F4F7FB]">{draftCount}</div>
            <div className="mt-1 text-xs text-[#91A0B6]">下書き</div>
          </div>
        </div>
      </div>
      <p className="mt-2 text-xs text-[#91A0B6]">
        ヒーローに設定した記事はトップページのスライドに表示されます（最大{heroLimit}件）。
      </p>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex rounded-xl border border-[#26364C] bg-[#121F32] p-1">
          {(["all", "published", "draft"] as StatusFilter[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setStatusFilter(key)}
              className={`flex-1 rounded-lg px-4 py-2 text-sm font-bold transition ${
                statusFilter === key
                  ? "bg-[#18C987] text-white"
                  : "text-[#91A0B6] hover:text-white"
              }`}
            >
              {key === "all" ? "すべて" : key === "published" ? "公開中" : "下書き"}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#91A0B6]" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="記事を検索"
              className="h-11 rounded-xl border-[#26364C] bg-[#0D1728] pl-10 pr-9 text-[#F4F7FB] placeholder:text-[#91A0B6]"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#91A0B6] hover:text-white"
                aria-label="検索をクリア"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className="relative h-11 rounded-xl border-[#26364C] bg-[#121F32] px-3 text-[#F4F7FB] hover:bg-[#1a2940] hover:text-white"
                aria-label="追加フィルター"
              >
                <Filter className="h-4 w-4" />
                {activeExtraFilterCount > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#18C987] text-[10px] font-bold text-white">
                    {activeExtraFilterCount}
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              className="w-72 border-[#26364C] bg-[#121F32] text-[#F4F7FB]"
            >
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs text-[#91A0B6]">ラベル</Label>
                  <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className="w-full rounded-lg border border-[#26364C] bg-[#0D1728] p-2 text-sm text-[#F4F7FB]"
                  >
                    <option value="">すべて</option>
                    {NEWS_LABELS.map((label) => (
                      <option key={label} value={label}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-[#91A0B6]">作成方法</Label>
                  <select
                    value={creationMethodFilter}
                    onChange={(e) => setCreationMethodFilter(e.target.value)}
                    className="w-full rounded-lg border border-[#26364C] bg-[#0D1728] p-2 text-sm text-[#F4F7FB]"
                  >
                    <option value="all">すべて</option>
                    <option value="manual">手動</option>
                    <option value="ai_match">AI生成</option>
                    <option value="external">外部記事</option>
                  </select>
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-[#91A0B6]">ヒーロー表示中のみ</Label>
                  <Checkbox
                    checked={heroFilter}
                    onCheckedChange={(v) => setHeroFilter(Boolean(v))}
                    className="border-[#91A0B6] data-[state=checked]:border-[#F4C34E] data-[state=checked]:bg-[#F4C34E] data-[state=checked]:text-[#080c14]"
                  />
                </div>
                {activeExtraFilterCount > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setCategoryFilter("");
                      setCreationMethodFilter("all");
                      setHeroFilter(false);
                    }}
                    className="w-full rounded-lg border-[#26364C] bg-[#0D1728] text-[#F4F7FB] hover:bg-[#1a2940] hover:text-white"
                  >
                    条件をクリア
                  </Button>
                )}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {news.length === 0 ? (
        <div className="rounded-xl border border-[#26364C] bg-[#121F32] p-8 text-center">
          <h2 className="text-lg font-bold text-[#F4F7FB]">まだニュースがありません</h2>
          <p className="mt-2 text-sm text-[#91A0B6]">
            試合記録から記事を作るか、自分でクラブのお知らせを書いてみましょう。
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Button
              onClick={() => handleOpenEditor(null, "ai")}
              className="h-12 rounded-xl bg-[#18C987] font-bold text-white hover:bg-[#14a76c]"
            >
              <Sparkles className="mr-2 h-4 w-4" />
              AIで試合記事を作る
            </Button>
            <Button
              variant="outline"
              onClick={() => handleOpenEditor(null, "manual")}
              className="h-12 rounded-xl border-[#26364C] bg-[#0D1728] font-bold text-[#F4F7FB] hover:bg-[#1a2940] hover:text-white"
            >
              <SquarePen className="mr-2 h-4 w-4" />
              自分で記事を書く
            </Button>
          </div>
        </div>
      ) : filteredNews.length === 0 ? (
        <div className="rounded-xl border border-[#26364C] bg-[#121F32] py-12 text-center">
          <p className="text-sm text-[#91A0B6]">条件に一致する記事がありません。</p>
          <Button
            variant="outline"
            onClick={clearFilters}
            className="mt-4 rounded-lg border-[#26364C] bg-[#0D1728] text-[#F4F7FB] hover:bg-[#1a2940] hover:text-white"
          >
            条件をクリア
          </Button>
        </div>
      ) : (<>
        <div className="space-y-3">
          {pagedNews.map((article) => (
            <div
              key={article.id}
              onClick={() => handleOpenEditor(article)}
              className="group flex cursor-pointer gap-3 rounded-xl border border-[#26364C] bg-[#121F32] p-3 transition hover:border-[#18C987] hover:bg-[#1a2940] sm:gap-4 sm:p-4"
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleOpenEditor(article);
                }
              }}
              aria-label={`${article.title} を編集`}
            >
              <div className="relative h-[76px] w-[112px] shrink-0 overflow-hidden rounded-lg bg-[#0D1728]">
                {article.imageUrl ? (
                  <Image
                    src={toCloudinaryPadded16x9(article.imageUrl, 256)}
                    alt={article.title}
                    fill
                    className="object-cover"
                    sizes="112px"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-[#91A0B6]">
                    <ImageIcon className="h-6 w-6" />
                  </div>
                )}
              </div>

              <div className="flex min-w-0 flex-1 flex-col justify-between">
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      {article.category && (
                        <Badge
                          variant="outline"
                          className="border-[#26364C] bg-[#0D1728] text-xs font-normal text-[#91A0B6]"
                        >
                          {article.category}
                        </Badge>
                      )}
                      {article.featuredInHero && (
                        <Badge className="border-transparent bg-[#F4C34E]/20 text-xs font-bold text-[#F4C34E]">
                          <Star className="mr-1 h-3 w-3 fill-current" />
                          ヒーロー
                        </Badge>
                      )}
                      {article.creationMethod === "ai_match" && (
                        <Badge className="border-transparent bg-[#6D4AFF]/20 text-xs font-bold text-[#9b8aff]">
                          <Sparkles className="mr-1 h-3 w-3" />
                          AI生成
                        </Badge>
                      )}
                      {article.noteUrl && (
                        <Badge className="border-transparent bg-blue-500/20 text-xs font-bold text-blue-300">
                          <LinkIcon className="mr-1 h-3 w-3" />
                          外部記事
                        </Badge>
                      )}
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0 text-[#91A0B6] hover:text-white"
                          onClick={(e) => e.stopPropagation()}
                          aria-label="記事メニュー"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        className="border-[#26364C] bg-[#121F32] text-[#F4F7FB]"
                      >
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            handlePreview(article);
                          }}
                          className="cursor-pointer focus:bg-[#1a2940]"
                        >
                          <Eye className="mr-2 h-4 w-4" />
                          プレビュー
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenEditor(article);
                          }}
                          className="cursor-pointer focus:bg-[#1a2940]"
                        >
                          <SquarePen className="mr-2 h-4 w-4" />
                          編集
                        </DropdownMenuItem>
                        <DropdownMenuSeparator className="bg-[#26364C]" />
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleHero(article);
                          }}
                          disabled={processingIds.has(article.id)}
                          className="cursor-pointer focus:bg-[#1a2940]"
                        >
                          {article.featuredInHero ? (
                            <>
                              <StarOff className="mr-2 h-4 w-4" />
                              ヒーローから外す
                            </>
                          ) : (
                            <>
                              <Star className="mr-2 h-4 w-4" />
                              ヒーローに設定
                            </>
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleStatus(article);
                          }}
                          disabled={processingIds.has(article.id)}
                          className="cursor-pointer focus:bg-[#1a2940]"
                        >
                          {isDraft(article) ? (
                            <>
                              <Check className="mr-2 h-4 w-4" />
                              公開する
                            </>
                          ) : (
                            <>
                              <X className="mr-2 h-4 w-4" />
                              非公開にする
                            </>
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator className="bg-[#26364C]" />
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeletingArticle(article);
                          }}
                          className="cursor-pointer text-[#FF5C67] focus:bg-[#1a2940] focus:text-[#FF5C67]"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          削除
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <p className="mt-1 text-xs text-[#91A0B6]">
                    {formatDateLabel(getSortDate(article))}
                    {article.creationMethod && article.creationMethod !== "manual" ? (
                      <span className="ml-2">{creationMethodLabel[article.creationMethod]}</span>
                    ) : null}
                  </p>
                  <h3 className="mt-1 line-clamp-2 break-words text-sm font-bold leading-snug text-[#F4F7FB]">
                    {article.title}
                  </h3>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  {isDraft(article) ? (
                    <Badge className="border-transparent bg-yellow-500/20 text-xs font-bold text-yellow-400">
                      下書き
                    </Badge>
                  ) : (
                    <Badge className="border-transparent bg-[#18C987]/20 text-xs font-bold text-[#18C987]">
                      公開中
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
        {filteredNews.length > PAGE_SIZE && (
          <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-[#26364C] bg-[#121F32] p-3">
            <Button
              variant="outline"
              onClick={() => setCurrentPage((p) => p - 1)}
              disabled={currentPage <= 1}
              className="rounded-lg border-[#26364C] bg-[#0D1728] px-3 text-[#F4F7FB] hover:bg-[#1a2940] hover:text-white disabled:opacity-40"
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              前へ
            </Button>
            <span className="text-sm font-bold text-[#F4F7FB]">
              {currentPage} / {totalPages}
            </span>
            <Button
              variant="outline"
              onClick={() => setCurrentPage((p) => p + 1)}
              disabled={currentPage >= totalPages}
              className="rounded-lg border-[#26364C] bg-[#0D1728] px-3 text-[#F4F7FB] hover:bg-[#1a2940] hover:text-white disabled:opacity-40"
            >
              次へ
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        )}
      </>)}

      <NewsEditor
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        editingArticle={editingArticle}
        clubUid={clubUid || ""}
        initialMode={editorInitialMode}
      />

      <AlertDialog open={!!deletingArticle} onOpenChange={() => setDeletingArticle(null)}>
        <AlertDialogContent className="border-[#26364C] bg-[#121F32] text-[#F4F7FB]">
          <AlertDialogHeader>
            <AlertDialogTitle>本当に削除しますか？</AlertDialogTitle>
            <AlertDialogDescription className="text-[#91A0B6]">
              ニュース「{deletingArticle?.title}」を削除します。この操作は元に戻せません。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-[#26364C] bg-[#0D1728] text-[#F4F7FB] hover:bg-[#1a2940] hover:text-white">
              キャンセル
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-[#FF5C67] text-white hover:bg-[#e64c57]"
            >
              削除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!previewArticle} onOpenChange={() => setPreviewArticle(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto border-[#26364C] bg-[#121F32] p-0 text-[#F4F7FB]">
          {previewArticle?.imageUrl ? (
            <div className="relative aspect-video w-full">
              <Image
                src={toCloudinaryPadded16x9(previewArticle.imageUrl, 720)}
                alt={previewArticle.title}
                fill
                className="object-cover"
                sizes="(max-width: 768px) 100vw, 672px"
              />
            </div>
          ) : (
            <div className="flex aspect-video w-full items-center justify-center bg-[#0D1728] text-[#91A0B6]">
              <ImageIcon className="h-10 w-10" />
            </div>
          )}
          <div className="p-5 sm:p-6">
            <DialogHeader>
              <div className="flex flex-wrap items-center gap-2">
                {previewArticle?.category && (
                  <Badge variant="outline" className="border-[#26364C] bg-[#0D1728] text-[#91A0B6]">
                    {previewArticle.category}
                  </Badge>
                )}
                {previewArticle?.featuredInHero && (
                  <Badge className="border-transparent bg-[#F4C34E]/20 text-[#F4C34E]">
                    <Star className="mr-1 h-3 w-3 fill-current" />
                    ヒーロー
                  </Badge>
                )}
              </div>
              <DialogTitle className="mt-2 text-lg text-[#F4F7FB]">{previewArticle?.title}</DialogTitle>
            </DialogHeader>
            <p className="mt-2 text-sm text-[#91A0B6]">
              {previewArticle && formatDateLabel(getSortDate(previewArticle))}
            </p>
            {previewArticle?.noteUrl ? (
              <a
                href={previewArticle.noteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-[#18C987] underline"
              >
                <LinkIcon className="h-4 w-4" />
                外部サイトで読む
              </a>
            ) : (
              <div className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-[#F4F7FB]">
                {previewArticle?.content || "（本文がありません）"}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}