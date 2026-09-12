"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { auth, db } from "@/lib/firebase";
import { collection, addDoc, doc, updateDoc, serverTimestamp, Timestamp } from "firebase/firestore";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { format } from "date-fns";
import { toast } from "sonner";
import Image from "next/image";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Checkbox } from "@/components/ui/checkbox";
import { ImageUploader } from "@/components/image-uploader";
import { Bold, Heading, List, Link as LinkIcon, Loader2, Sparkles, Eye, Save, Send, X } from "lucide-react";
import { MatchDetails } from "@/types/match";
import { NewsArticle, NewsCreationMethod } from "@/types/news";
import { getMatchGoalSummary } from "@/lib/match-scorers";

const NEWS_LABELS = ["お知らせ", "イベント", "スポンサー", "試合情報", "試合結果", "インタビュー", "チケット"] as const;

const formSchema = z
  .object({
    title: z.string().min(1, { message: "タイトルは必須です。" }),
    category: z.enum(NEWS_LABELS),
    content: z.string().optional(),
    noteUrl: z
      .union([z.string().url({ message: "無効なURLです。" }), z.literal("")])
      .optional(),
    publishedAt: z.date(),
    imageUrl: z.string().url({ message: "無効なURLです。" }).optional(),
    featuredInHero: z.boolean().optional(),
    status: z.enum(["draft", "published"]).optional(),
  })
  .refine(
    (data) => {
      const hasContent = !!data.content && data.content.trim() !== "";
      const hasNoteUrl = !!data.noteUrl && data.noteUrl !== "";
      return hasContent || hasNoteUrl;
    },
    {
      path: ["noteUrl"],
      message: "本文または外部記事のURLを入力してください。",
    }
  );

type NewsFormValues = z.infer<typeof formSchema>;

type CreationMode = "manual" | "external" | "ai";

type EditableNews = {
  id: string;
  title: string;
  category: string;
  content?: string;
  noteUrl?: string;
  imageUrl?: string;
  publishedAt: Date;
  createdAt?: any;
  updatedAt?: any;
  featuredInHero?: boolean;
  status?: "draft" | "published";
  creationMethod?: NewsCreationMethod;
  sourceMatchId?: string;
};

interface NewsEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingArticle: EditableNews | null;
  clubUid: string;
  initialMode?: CreationMode;
}

const PREPARED_IMAGES = [
  "/ニュース画像１.jpg",
  "/ニュース画像２.jpg",
  "/ニュース画像３.jpg",
  "/ニュース画像４.jpg",
  "/ニュース画像５.jpg",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isApiError(value: unknown): value is { error: string } {
  return isRecord(value) && typeof value.error === "string";
}

function isMatchDetails(value: unknown): value is MatchDetails {
  if (!isRecord(value)) return false;
  const required = ["id", "competitionId", "roundId", "homeTeam", "awayTeam", "homeTeamName", "awayTeamName", "matchDate"];
  return required.every((key) => typeof value[key] === "string");
}

function isDraftListResponse(value: unknown): value is { matches: MatchDetails[]; mainSeason?: string } {
  return isRecord(value) && Array.isArray(value.matches) && value.matches.every(isMatchDetails);
}

function isDraftGenerateResponse(value: unknown): value is { title: string; content: string } {
  return isRecord(value) && typeof value.title === "string" && typeof value.content === "string";
}

export function NewsEditor({ open, onOpenChange, editingArticle, clubUid, initialMode }: NewsEditorProps) {
  const { user, loading: authLoading, clubProfileId } = useAuth();
  const [mode, setMode] = useState<CreationMode>("manual");
  const [aiMatches, setAiMatches] = useState<MatchDetails[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<string>("");
  const [selectedCompetition, setSelectedCompetition] = useState<string>("all");
  const [selectedMatchId, setSelectedMatchId] = useState<string>("");
  const [aiMemo, setAiMemo] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiMatchesLoading, setAiMatchesLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiLoaded, setAiLoaded] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewArticle, setPreviewArticle] = useState<Partial<NewsArticle> | null>(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [aiGenerated, setAiGenerated] = useState(false);
  const contentRef = useRef<HTMLTextAreaElement | null>(null);

  const form = useForm<NewsFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      category: "お知らせ",
      content: "",
      noteUrl: "",
      publishedAt: new Date(),
      imageUrl: "",
      featuredInHero: false,
      status: "published",
    },
  });

  const resetToArticle = () => {
    if (editingArticle) {
      const article = editingArticle;
      const isExternal = !!article.noteUrl && article.noteUrl !== "";
      setMode(isExternal ? "external" : "manual");
      form.reset({
        title: article.title || "",
        category: (NEWS_LABELS.includes(article.category as any) ? article.category : "お知らせ") as any,
        content: article.content || "",
        noteUrl: article.noteUrl || "",
        publishedAt: article.publishedAt instanceof Date ? article.publishedAt : new Date(),
        imageUrl: article.imageUrl || "",
        featuredInHero: article.featuredInHero || false,
        status: article.status || "published",
      });
    } else {
      setMode(initialMode ?? "manual");
      form.reset({
        title: "",
        category: "お知らせ",
        content: "",
        noteUrl: "",
        publishedAt: new Date(),
        imageUrl: "",
        featuredInHero: false,
        status: "published",
      });
    }
    setSelectedMatchId("");
    setSelectedSeason("");
    setSelectedCompetition("all");
    setAiMemo("");
    setAiMatches([]);
    setAiGenerated(false);
    setAiError(null);
    setAiLoaded(false);
    setAiMatchesLoading(false);
  };

  useEffect(() => {
    if (open) {
      resetToArticle();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editingArticle?.id]);

  const loadAiMatches = useCallback(async () => {
    if (!auth.currentUser) {
      setAiError("ログインが確認できません。再度ログインしてください。");
      setAiLoaded(true);
      setAiMatchesLoading(false);
      return;
    }
    if (!clubUid) {
      setAiError("クラブIDが設定されていません。");
      setAiLoaded(true);
      setAiMatchesLoading(false);
      return;
    }
    setAiMatchesLoading(true);
    setAiError(null);
    try {
      const token = await auth.currentUser.getIdToken();
      const res = await fetch(`/api/admin/news/draft?clubUid=${encodeURIComponent(clubUid)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const raw: unknown = await res.json().catch(() => ({ error: "レスポンスの解析に失敗しました" }));
      if (!res.ok) {
        throw new Error(isApiError(raw) ? raw.error : "試合の取得に失敗しました");
      }
      if (!isDraftListResponse(raw)) {
        throw new Error("試合データの形式が正しくありません");
      }
      const initialSeason = raw.mainSeason || "";
      setAiMatches(raw.matches);
      setSelectedSeason(initialSeason);
      setSelectedCompetition("all");
      setAiLoaded(true);
      const initialMatches = initialSeason
        ? raw.matches.filter((m) => m.season === initialSeason)
        : raw.matches;
      if (initialMatches.length > 0) {
        setSelectedMatchId(initialMatches[0].id);
      } else if (raw.matches.length > 0) {
        setSelectedMatchId(raw.matches[0].id);
      }
    } catch (e) {
      console.error(e);
      const message = e instanceof Error ? e.message : "試合の取得に失敗しました";
      setAiError(message);
      setAiLoaded(true);
      toast.error(message);
    } finally {
      setAiMatchesLoading(false);
    }
  }, [clubUid]);

  useEffect(() => {
    if (open && mode === "ai" && !aiLoaded && !authLoading && !aiMatchesLoading) {
      loadAiMatches();
    }
  }, [open, mode, aiLoaded, authLoading, aiMatchesLoading, loadAiMatches]);

  const parseSeasonStart = (season: string) => {
    const match = String(season).match(/^(\d{4})/);
    return match ? Number(match[1]) : 0;
  };

  const seasons = useMemo(() => {
    const set = new Set<string>();
    aiMatches.forEach((m) => { if (m.season) set.add(m.season); });
    return Array.from(set).sort((a, b) => parseSeasonStart(b) - parseSeasonStart(a) || b.localeCompare(a));
  }, [aiMatches]);

  const competitionsForSeason = useMemo(() => {
    if (!selectedSeason) return [];
    const map = new Map<string, string>();
    aiMatches
      .filter((m) => m.season === selectedSeason)
      .forEach((m) => { if (!map.has(m.competitionId)) map.set(m.competitionId, m.competitionName || m.competitionId); });
    return Array.from(map.entries());
  }, [aiMatches, selectedSeason]);

  const filteredMatches = useMemo(() => {
    return aiMatches
      .filter((m) => (!selectedSeason || m.season === selectedSeason) && (selectedCompetition === "all" || m.competitionId === selectedCompetition))
      .sort((a, b) => {
        const aDate = new Date(a.matchDate.replace(/\//g, "-")).getTime();
        const bDate = new Date(b.matchDate.replace(/\//g, "-")).getTime();
        return bDate - aDate;
      });
  }, [aiMatches, selectedSeason, selectedCompetition]);

  useEffect(() => {
    if (filteredMatches.length === 0) {
      setSelectedMatchId("");
      return;
    }
    if (!filteredMatches.find((m) => m.id === selectedMatchId)) {
      setSelectedMatchId(filteredMatches[0].id);
    }
  }, [filteredMatches, selectedMatchId]);

  const selectedMatch = useMemo(
    () => filteredMatches.find((m) => m.id === selectedMatchId) || null,
    [filteredMatches, selectedMatchId]
  );

  const matchLabel = (match: MatchDetails) => {
    const date = match.matchDate ? format(new Date(match.matchDate.replace(/\//g, "-")), "yyyy/MM/dd") : "";
    const score =
      match.scoreHome != null && match.scoreAway != null ? `${match.scoreHome}-${match.scoreAway}` : "-";
    return `${match.competitionName || ""} ${match.roundName || ""} | ${date} ${match.homeTeamName} ${score} ${match.awayTeamName}`;
  };

  const matchSummary = (match: MatchDetails) => {
    const date = match.matchDate ? format(new Date(match.matchDate.replace(/\//g, "-")), "yyyy/MM/dd") : "";
    const score =
      match.scoreHome != null && match.scoreAway != null ? `${match.scoreHome} - ${match.scoreAway}` : "未終了";
    const eventsText = `得点者情報：${getMatchGoalSummary(match, "未登録", "得点なし")}`;
    return `${date}\n${match.homeTeamName} ${score} ${match.awayTeamName}\n大会：${match.competitionName || "-"}\n節：${match.roundName || "-"}\n${eventsText}`;
  };

  const handleGenerate = async () => {
    if (!selectedMatch) {
      toast.error("試合を選択してください。");
      return;
    }
    const title = form.getValues("title") || "";
    const content = form.getValues("content") || "";
    if ((title || content) && !window.confirm("生成済みのタイトル・本文を上書きしますか？")) {
      return;
    }
    if (!auth.currentUser) {
      toast.error("ログインが確認できません。再度ログインしてください。");
      return;
    }
    setAiLoading(true);
    try {
      const token = await auth.currentUser.getIdToken();
      const res = await fetch("/api/admin/news/draft", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          clubUid,
          competitionId: selectedMatch.competitionId,
          roundId: selectedMatch.roundId,
          matchId: selectedMatch.id,
          memo: aiMemo,
        }),
      });
      const raw: unknown = await res.json().catch(() => ({ error: "レスポンスの解析に失敗しました" }));
      if (!res.ok) {
        throw new Error(isApiError(raw) ? raw.error : "AI生成に失敗しました");
      }
      if (!isDraftGenerateResponse(raw)) {
        throw new Error("AI生成データの形式が正しくありません");
      }
      form.setValue("title", raw.title, { shouldDirty: true });
      form.setValue("content", raw.content, { shouldDirty: true });
      setAiGenerated(true);
      toast.success("AI下書きを生成しました。");
    } catch (e) {
      console.error(e);
      const message = e instanceof Error ? e.message : "AI生成に失敗しました";
      toast.error(message);
    } finally {
      setAiLoading(false);
    }
  };

  const insertMarkdown = (before: string, after: string, placeholder?: string) => {
    const el = contentRef.current;
    if (!el) return;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    const value = form.getValues("content") || "";
    const selected = value.slice(start, end);
    const insertion = selected ? `${before}${selected}${after}` : `${before}${placeholder ?? ""}${after}`;
    const newValue = value.slice(0, start) + insertion + value.slice(end);
    form.setValue("content", newValue, { shouldDirty: true });
    const nextStart = start + before.length;
    const nextEnd = selected ? start + insertion.length - after.length : nextStart + (placeholder?.length ?? 0);
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(nextStart, nextEnd);
    }, 0);
  };

  const insertAtLineStart = (prefix: string) => {
    const el = contentRef.current;
    if (!el) return;
    const start = el.selectionStart ?? 0;
    const value = form.getValues("content") || "";
    const before = value.slice(0, start);
    const after = value.slice(start);
    const lines = before.split("\n");
    const lastLine = lines[lines.length - 1];
    if (!lastLine.startsWith(prefix)) {
      lines[lines.length - 1] = prefix + lastLine;
    }
    const newValue = lines.join("\n") + after;
    form.setValue("content", newValue, { shouldDirty: true });
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + prefix.length, start + prefix.length);
    }, 0);
  };

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen && form.formState.isDirty) {
      setDiscardOpen(true);
      return;
    }
    onOpenChange(nextOpen);
  };

  const handleDiscard = () => {
    setDiscardOpen(false);
    onOpenChange(false);
  };

  const onSave = async (status: "draft" | "published") => {
    if (status === "published") {
      const ok = await form.trigger();
      if (!ok) {
        toast.error("公開するにはタイトルと本文（または外部URL）を入力してください。");
        return;
      }
    } else {
      const title = form.getValues("title");
      if (!title?.trim()) {
        toast.error("タイトルを入力してください。");
        return;
      }
    }
    setIsSaving(true);
    try {
      const values = form.getValues();
      const creationMethod: NewsCreationMethod =
        editingArticle?.creationMethod ?? (mode === "ai" ? "ai_match" : mode === "external" ? "external" : "manual");
      const sourceMatchId =
        mode === "ai" && selectedMatch
          ? selectedMatch.id
          : editingArticle?.sourceMatchId;
      const payload: any = {
        title: values.title,
        category: values.category,
        content: mode !== "external" ? (values.content?.trim() || "") : "",
        noteUrl: mode === "external" ? (values.noteUrl?.trim() || "") : "",
        imageUrl: values.imageUrl?.trim() || "",
        featuredInHero: values.featuredInHero || false,
        status,
        creationMethod,
        sourceMatchId: sourceMatchId ?? null,
        ownerUid: clubUid,
        clubProfileId: clubProfileId || null,
        publishedAt: Timestamp.fromDate(values.publishedAt),
        updatedAt: serverTimestamp(),
      };
      if (editingArticle) {
        await updateDoc(doc(db, `clubs/${clubUid}/news`, editingArticle.id), payload);
        toast.success(status === "draft" ? "下書きを更新しました。" : "ニュースを公開しました。");
      } else {
        await addDoc(collection(db, `clubs/${clubUid}/news`), { ...payload, createdAt: serverTimestamp() });
        toast.success(status === "draft" ? "下書きを保存しました。" : "ニュースを公開しました。");
      }
      onOpenChange(false);
    } catch (e) {
      console.error(e);
      toast.error("保存に失敗しました。");
    } finally {
      setIsSaving(false);
    }
  };

  const openPreview = () => {
    const values = form.getValues();
    setPreviewArticle({
      title: values.title,
      content: mode === "external" ? "" : values.content,
      noteUrl: mode === "external" ? values.noteUrl : "",
      imageUrl: values.imageUrl,
      category: values.category,
      publishedAt: Timestamp.fromDate(values.publishedAt),
    });
    setPreviewOpen(true);
  };

  const modeButtons: { key: CreationMode; label: string }[] = [
    { key: "manual", label: "自分で書く" },
    { key: "external", label: "外部記事" },
    { key: "ai", label: "AIで作る" },
  ];

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent
          className="!flex !flex-col p-0 !overflow-hidden !h-full sm:!h-auto !max-h-full sm:!max-h-[90vh] !max-w-3xl border-slate-800 bg-slate-950 text-white sm:rounded-lg"
          onPointerDownOutside={(e) => {
            if (form.formState.isDirty) e.preventDefault();
          }}
        >
          <Form {...form}>
            <form className="flex flex-col h-full" onSubmit={(e) => e.preventDefault()}>
              <DialogHeader className="shrink-0 p-4 border-b border-slate-800 text-left">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <DialogTitle className="text-white">
                      {editingArticle ? "ニュースを編集" : "新規ニュースを追加"}
                    </DialogTitle>
                    <DialogDescription className="text-slate-400">
                      管理画面のニュースを作成・編集します。
                    </DialogDescription>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={openPreview}
                    className="border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800 shrink-0"
                  >
                    <Eye className="mr-2 h-4 w-4" />
                    プレビュー
                  </Button>
                </div>
              </DialogHeader>

              <div className="flex-1 overflow-y-auto p-4 pb-24 space-y-6">
                {/* 作成方法 */}
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-200">作成方法</label>
                  <div className="grid grid-cols-3 gap-2">
                    {modeButtons.map((m) => (
                      <button
                        key={m.key}
                        type="button"
                        onClick={() => setMode(m.key)}
                        className={`rounded-lg px-2 py-2 text-xs sm:text-sm font-bold transition ${
                          mode === m.key
                            ? "bg-blue-600 text-white"
                            : "bg-slate-900 text-slate-300 hover:bg-slate-800"
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* AI 試合選択 */}
                {mode === "ai" && (
                  <div className="space-y-3 rounded-lg border border-slate-800 bg-slate-900 p-3">
                    <div className="space-y-2">
                      <div className="flex items-start gap-2 rounded-lg border border-purple-500/20 bg-[#6D4AFF]/15 p-3 text-[13px] text-purple-100">
                        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-purple-300" />
                        <div className="space-y-1 leading-relaxed">
                          <p className="font-bold">現在、AI試合記事生成を無料開放中！</p>
                          <p>今後は利用回数に上限を設け、Proプラン向けに提供する予定です。</p>
                        </div>
                      </div>
                      <label className="text-sm font-semibold text-slate-200">試合を選択</label>
                      {aiMatchesLoading ? (
                        <div className="flex items-center gap-2 text-sm text-slate-400">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          試合を読み込んでいます...
                        </div>
                      ) : aiError ? (
                        <div className="space-y-3">
                          <p className="text-sm text-red-400">試合の取得に失敗しました。</p>
                          {aiError && <p className="text-xs text-slate-500">{aiError}</p>}
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => { setAiError(null); setAiLoaded(false); }}
                            className="w-full border-slate-700 bg-slate-950 text-white hover:bg-slate-800"
                          >
                            再試行
                          </Button>
                        </div>
                      ) : aiMatches.length === 0 ? (
                        <div className="space-y-3">
                          <p className="text-sm text-slate-400">
                            完了済みの試合がありません。
                          </p>
                          <p className="text-xs text-slate-500">
                            大会・練習試合を登録・完了すると、ここに表示されます。
                          </p>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => (window.location.href = "/admin/competitions")}
                            className="w-full border-slate-700 bg-slate-950 text-white hover:bg-slate-800"
                          >
                            試合を登録する
                          </Button>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <Select value={selectedSeason} onValueChange={(v) => { setSelectedSeason(v); setSelectedCompetition("all"); }}>
                            <SelectTrigger className="w-full min-w-0 truncate bg-slate-950 border-slate-700 text-white text-xs">
                              <SelectValue placeholder="シーズンを選択" className="min-w-0 flex-1 truncate" />
                            </SelectTrigger>
                            <SelectContent className="bg-slate-950 border-slate-700 text-white text-xs max-w-[calc(100vw-2rem)] max-h-60">
                              {seasons.map((s) => (
                                <SelectItem key={s} value={s} className="focus:bg-slate-800 text-xs whitespace-normal break-words">
                                  {s}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Select value={selectedCompetition} onValueChange={setSelectedCompetition}>
                            <SelectTrigger className="w-full min-w-0 truncate bg-slate-950 border-slate-700 text-white text-xs">
                              <SelectValue placeholder="大会を選択" className="min-w-0 flex-1 truncate" />
                            </SelectTrigger>
                            <SelectContent className="bg-slate-950 border-slate-700 text-white text-xs max-w-[calc(100vw-2rem)] max-h-60">
                              <SelectItem value="all" className="focus:bg-slate-800 text-xs whitespace-normal break-words">すべて</SelectItem>
                              {competitionsForSeason.map(([id, name]) => (
                                <SelectItem key={id} value={id} className="focus:bg-slate-800 text-xs whitespace-normal break-words">
                                  {name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {filteredMatches.length === 0 ? (
                            <p className="text-sm text-slate-400">この条件に該当する試合がありません。</p>
                          ) : (
                            <Select value={selectedMatchId} onValueChange={setSelectedMatchId}>
                              <SelectTrigger className="w-full min-w-0 truncate bg-slate-950 border-slate-700 text-white text-xs">
                                <SelectValue placeholder="試合を選択" className="min-w-0 flex-1 truncate" />
                              </SelectTrigger>
                              <SelectContent className="bg-slate-950 border-slate-700 text-white text-xs max-w-[calc(100vw-2rem)] max-h-60">
                                {filteredMatches.map((m) => (
                                  <SelectItem
                                    key={`${m.competitionId}:${m.roundId}:${m.id}`}
                                    value={m.id}
                                    className="focus:bg-slate-800 text-xs whitespace-normal break-words"
                                  >
                                    {matchLabel(m)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </div>
                      )}
                    </div>
                    {selectedMatch && (
                      <div className="whitespace-pre-wrap break-words rounded bg-slate-950 p-3 text-xs text-slate-300 border border-slate-800">
                        {matchSummary(selectedMatch)}
                      </div>
                    )}
                    <FormItem>
                      <FormLabel className="text-slate-200">ひと言メモ（任意）</FormLabel>
                      <FormControl>
                        <Textarea
                          value={aiMemo}
                          onChange={(e) => setAiMemo(e.target.value)}
                          rows={2}
                          className="bg-slate-950 border-slate-700 text-white placeholder:text-slate-500"
                          placeholder="記事に反映したい補足があれば入力"
                        />
                      </FormControl>
                    </FormItem>
                    <Button
                      type="button"
                      onClick={handleGenerate}
                      disabled={aiLoading || !selectedMatch}
                      className="w-full bg-indigo-600 hover:bg-indigo-700 text-white"
                    >
                      {aiLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                      下書きを生成
                    </Button>
                  </div>
                )}

                {/* タイトル */}
                {(mode !== "ai" || aiGenerated) && (
                  <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-slate-200">タイトル</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            className="bg-slate-900 border-slate-700 text-white placeholder:text-slate-500"
                            placeholder="タイトルを入力"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                {/* 本文 */}
                {(mode === "manual" || (mode === "ai" && aiGenerated)) && (
                  <FormField
                    control={form.control}
                    name="content"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-slate-200">本文</FormLabel>
                        <div className="rounded-lg border border-slate-800 bg-slate-900 p-2">
                          <div className="mb-2 flex flex-wrap gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => insertMarkdown("**", "**", "太字")}
                              className="h-8 w-8 p-0 text-slate-300 hover:bg-slate-800 hover:text-white"
                            >
                              <Bold className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => insertAtLineStart("### ")}
                              className="h-8 w-8 p-0 text-slate-300 hover:bg-slate-800 hover:text-white"
                            >
                              <Heading className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => insertAtLineStart("- ")}
                              className="h-8 w-8 p-0 text-slate-300 hover:bg-slate-800 hover:text-white"
                            >
                              <List className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => insertMarkdown("[", "](https://)", "リンク")}
                              className="h-8 w-8 p-0 text-slate-300 hover:bg-slate-800 hover:text-white"
                            >
                              <LinkIcon className="h-4 w-4" />
                            </Button>
                          </div>
                          <FormControl>
                            <Textarea
                              {...field}
                              ref={(node) => {
                                contentRef.current = node;
                                field.ref(node);
                              }}
                              value={field.value || ""}
                              onChange={(e) => field.onChange(e.target.value)}
                              rows={14}
                              className="min-h-[280px] resize-y border-0 bg-slate-950 text-white placeholder:text-slate-500 focus-visible:ring-1 focus-visible:ring-blue-600"
                              placeholder="本文を入力（Markdown対応）"
                            />
                          </FormControl>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                {/* 外部URL */}
                {mode === "external" && (
                  <FormField
                    control={form.control}
                    name="noteUrl"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-slate-200">外部記事URL</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="url"
                            className="bg-slate-900 border-slate-700 text-white placeholder:text-slate-500"
                            placeholder="https://..."
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                {/* 記事画像 */}
                <FormField
                  control={form.control}
                  name="imageUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-slate-200">記事画像</FormLabel>
                      <FormControl>
                        <ImageUploader
                          value={field.value || ""}
                          onChange={field.onChange}
                          cropWidth={1600}
                          cropHeight={900}
                          cropTitle="ニュース画像をトリミング"
                          preparedImages={PREPARED_IMAGES}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* 公開設定 */}
                <div className="space-y-4 rounded-lg border border-slate-800 bg-slate-900 p-4">
                  <div className="text-sm font-semibold text-slate-200">公開設定</div>
                  <FormField
                    control={form.control}
                    name="category"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-slate-200">ラベル</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger className="bg-slate-950 border-slate-700 text-white">
                              <SelectValue placeholder="ラベルを選択" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent className="bg-slate-950 border-slate-700 text-white">
                            {NEWS_LABELS.map((label) => (
                              <SelectItem key={label} value={label} className="focus:bg-slate-800">
                                {label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="publishedAt"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-slate-200">公開日</FormLabel>
                        <FormControl>
                          <Input
                            type="date"
                            value={format(field.value, "yyyy-MM-dd")}
                            onChange={(e) => field.onChange(new Date(e.target.value))}
                            className="bg-slate-950 border-slate-700 text-white"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="featuredInHero"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                        <FormControl>
                          <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel className="text-slate-200">トップページのヒーローに掲載</FormLabel>
                          <p className="text-xs text-slate-500">最大3件まで表示されます。</p>
                        </div>
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              {/* フッター */}
              <DialogFooter className="shrink-0 border-t border-slate-800 bg-slate-950 p-4">
                <div className="flex w-full gap-2 sm:gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => onSave("draft")}
                    disabled={isSaving || (mode === "ai" && !aiGenerated)}
                    className="flex-1 border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"
                  >
                    {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    下書き保存
                  </Button>
                  <Button
                    type="button"
                    onClick={() => onSave("published")}
                    disabled={isSaving || (mode === "ai" && !aiGenerated)}
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                  >
                    {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                    公開
                  </Button>
                </div>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <AlertDialogContent className="bg-slate-950 text-white border-slate-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">変更を破棄しますか？</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              未保存の変更があります。閉じると内容が失われます。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDiscardOpen(false)} className="bg-slate-900 text-white border-slate-700 hover:bg-slate-800">
              キャンセル
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleDiscard} className="bg-red-600 hover:bg-red-700 text-white">
              破棄する
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* プレビュー */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent
          className="!max-w-3xl border-slate-800 bg-slate-950 text-white"
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="text-white">プレビュー</DialogTitle>
          </DialogHeader>
          <div className="max-h-[70vh] overflow-y-auto p-1">
            {previewArticle?.imageUrl && (
              <div className="relative w-full aspect-video mb-6 overflow-hidden rounded-lg bg-slate-900">
                <Image
                src={previewArticle.imageUrl}
                alt={previewArticle.title || ""}
                fill
                className="object-contain"
              />
              </div>
            )}
            <h1 className="text-2xl font-bold mb-4">{previewArticle?.title || "（無題）"}</h1>
            {previewArticle?.noteUrl ? (
              <Link href={previewArticle.noteUrl} target="_blank" rel="noopener noreferrer" className="text-blue-400 underline break-all">
                {previewArticle.noteUrl}
              </Link>
            ) : (
              <div className="whitespace-pre-wrap text-slate-200">{previewArticle?.content || ""}</div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" onClick={() => setPreviewOpen(false)} className="bg-slate-800 hover:bg-slate-700 text-white">
              閉じる
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
