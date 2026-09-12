"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import { collection, addDoc, writeBatch, doc, getDocs, query, setDoc, where } from "firebase/firestore";
import { setActivationOnce, trackEvent } from "@/lib/analytics";
import { useForm, useFieldArray, type SubmitHandler, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { getPlanLimit, getPlanTier } from "@/lib/plan-limits";
import { toDashSeason } from "@/lib/season";
import Image from "next/image";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormDescription, FormMessage } from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
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
import { Loader2, ChevronLeft, X, Plus, Trash2, Trophy, CalendarDays, Swords, Check, UploadCloud, Search } from "lucide-react";
import { toast } from "sonner";

// シーズン候補
const seasons = Array.from({ length: 91 }, (_, i) => {
  const startYear = 1960 + i;
  const endYear = startYear + 1;
  return `${startYear}/${String(endYear).slice(-2)}`;
});

const RANK_LABEL_COLORS = ["#1fd760", "#ef4444", "#facc15", "#3b82f6", "#a855f7"] as const;

const RANK_LABEL_COLOR_NAMES: Record<(typeof RANK_LABEL_COLORS)[number], string> = {
  "#1fd760": "緑",
  "#ef4444": "赤",
  "#facc15": "黄",
  "#3b82f6": "青",
  "#a855f7": "紫",
};

const RANK_LABEL_SUGGESTIONS = [
  "国際大会出場圏",
  "自動昇格圏",
  "昇格プレーオフ圏",
  "降格プレーオフ圏",
  "降格圏",
];

const hexToRgba = (hex: string, alpha: number) => {
  const n = parseInt(hex.replace("#", ""), 16);
  if (Number.isNaN(n)) return `rgba(0,0,0,${alpha})`;
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
};

const formSchema = z.object({
  name: z.string().min(1, "大会名は必須です。"),
  season: z.string().min(1, "シーズンを選択してください。"),
  format: z.enum(["league", "cup", "league_cup"]),
  leagueRounds: z.number().int().positive("1以上の数値を入力してください。").optional(),
  cupRounds: z.array(z.object({ name: z.string().min(1, "回戦名は必須です。") })).optional(),
  teams: z.array(z.string()).min(1, "最低1チームは選択してください。"),
  logoUrl: z.string().url().optional().or(z.literal("")),
  showOnHome: z.boolean().default(false),
  showOnTable: z.boolean().default(false),
  rankLabels: z
    .array(
      z.object({
        name: z.string().min(1, "ラベル名は必須です。"),
        startRank: z.coerce.number().int().positive("1以上の整数を入力してください。"),
        endRank: z.coerce.number().int().positive("1以上の整数を入力してください。"),
        color: z.enum(RANK_LABEL_COLORS, { message: "色を選択してください。" }),
      })
    )
    .max(5, "ラベルは最大5件までです。")
    .optional(),
}).refine((data) => {
  if (data.format === "league" || data.format === "league_cup") {
    return !!data.leagueRounds && data.leagueRounds > 0;
  }
  return true;
}, {
  message: "総節数を入力してください。",
  path: ["leagueRounds"],
}).refine((data) => {
  if (data.format === "cup" || data.format === "league_cup") {
    return !!data.cupRounds && data.cupRounds.length > 0;
  }
  return true;
}, {
  message: "最低1つの回戦を追加してください。",
  path: ["cupRounds"],
});

type FormValues = z.infer<typeof formSchema>;

interface Team {
  id: string;
  name: string;
  logoUrl?: string;
  categoryId?: string | null;
}

interface TeamCategory {
  id: string;
  name: string;
}

interface CompetitionTemplate {
  id: string;
  name: string;
  season?: string;
  format?: "league" | "cup" | "league_cup";
  teams?: string[];
  logoUrl?: string | null;
}

export default function NewCompetitionPage() {
  const { user, ownerUid } = useAuth();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [loading, setLoading] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);

  const [allTeams, setAllTeams] = useState<Team[]>([]);
  const [categories, setCategories] = useState<TeamCategory[]>([]);
  const [teamCategoryFilters, setTeamCategoryFilters] = useState<string[]>([]);
  const [teamSearch, setTeamSearch] = useState("");
  const [competitionNameSuggestions, setCompetitionNameSuggestions] = useState<string[]>([]);
  const [competitionNameMode, setCompetitionNameMode] = useState<"existing" | "new">("new");
  const [selectedCompetitionName, setSelectedCompetitionName] = useState<string>("__new__");
  const [templateByName, setTemplateByName] = useState<Record<string, CompetitionTemplate>>({});
  const [competitionCountBySeason, setCompetitionCountBySeason] = useState<Record<string, number>>({});

  const clubUid = ownerUid || user?.uid;
  const planTier = getPlanTier(user?.plan);
  const maxCompetitions = getPlanLimit("competitions_per_season", planTier);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema) as unknown as Resolver<FormValues>,
    defaultValues: {
      name: "",
      season: `${new Date().getFullYear()}/${String(new Date().getFullYear() + 1).slice(-2)}`,
      format: "league",
      leagueRounds: undefined,
      cupRounds: [],
      teams: [],
      logoUrl: "",
      showOnHome: false,
      showOnTable: false,
      rankLabels: [],
    },
    mode: "onChange",
  });

  const {
    fields: cupRoundFields,
    append: appendCupRound,
    remove: removeCupRound,
  } = useFieldArray({
    control: form.control,
    name: "cupRounds",
  });

  const {
    fields: rankLabelFields,
    append: appendRankLabel,
    remove: removeRankLabel,
  } = useFieldArray({
    control: form.control,
    name: "rankLabels",
  });

  const [editingRankLabel, setEditingRankLabel] = useState<number | null>(null);

  const selectedFormat = form.watch("format");

  // カップ系の場合、最低1つ回戦を用意
  useEffect(() => {
    if ((selectedFormat === "cup" || selectedFormat === "league_cup") && cupRoundFields.length === 0) {
      appendCupRound({ name: "" });
    }
  }, [selectedFormat, cupRoundFields.length, appendCupRound]);

  // カップの場合、順位ラベルは不要なのでクリアしておく
  useEffect(() => {
    if (selectedFormat === "cup") {
      form.setValue("rankLabels", [], { shouldValidate: false });
    }
  }, [selectedFormat, form]);

  useEffect(() => {
    if (!user) return;
    if (!clubUid) return;
    const fetchTeams = async () => {
      const snap = await getDocs(query(collection(db, `clubs/${clubUid}/teams`)));
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Team));
      setAllTeams(data);
    };
    const fetchCategories = async () => {
      const snap = await getDocs(query(collection(db, `clubs/${clubUid}/team_categories`)));
      const data = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) } as TeamCategory))
        .filter((c) => typeof c.name === "string")
        .sort((a, b) => a.name.localeCompare(b.name));
      setCategories(data);
    };
    const fetchCompetitions = async () => {
      const snap = await getDocs(query(collection(db, `clubs/${clubUid}/competitions`)));
      const set = new Set<string>();
      const best: Record<string, CompetitionTemplate> = {};
      const count: Record<string, number> = {};
      for (const d of snap.docs) {
        const data = d.data() as Record<string, unknown>;
        const name = typeof data?.name === "string" ? String(data.name).trim() : "";
        if (!name) continue;
        set.add(name);
        const season = typeof data?.season === "string" ? String(data.season).trim() : "";
        if (season) count[season] = (count[season] ?? 0) + 1;
        const prev = best[name];
        const shouldReplace = !prev || String(season).localeCompare(String(prev.season || ""), "ja") > 0;
        if (shouldReplace) {
          best[name] = {
            id: d.id,
            name,
            season,
            format: (data?.format as FormValues["format"] | undefined) ?? undefined,
            teams: Array.isArray(data?.teams) ? data.teams : undefined,
            logoUrl: typeof data?.logoUrl === "string" ? data.logoUrl : null,
          };
        }
      }
      const list = Array.from(set).sort((a, b) => a.localeCompare(b, "ja"));
      setCompetitionNameSuggestions(list);
      setTemplateByName(best);
      setCompetitionCountBySeason(count);
    };
    fetchTeams();
    fetchCategories();
    fetchCompetitions();
  }, [user, clubUid]);

  useEffect(() => {
    if (teamCategoryFilters.length > 0) return;
    setTeamCategoryFilters(["uncategorized", ...categories.map((c) => c.id)]);
  }, [categories, teamCategoryFilters.length]);

  const applyTemplateFromCompetition = useCallback(async (template: CompetitionTemplate) => {
    if (!clubUid) return;
    if (!template?.id) return;

    const nextFormat = template.format ?? "league";
    form.setValue("format", nextFormat, { shouldDirty: true, shouldValidate: true });
    form.setValue("logoUrl", typeof template.logoUrl === "string" ? template.logoUrl : "", { shouldDirty: true, shouldValidate: true });
    form.setValue("teams", Array.isArray(template.teams) ? template.teams : [], { shouldDirty: true, shouldValidate: true });

    try {
      const roundsSnap = await getDocs(query(collection(db, `clubs/${clubUid}/competitions`, template.id, "rounds")));
      const roundNames = roundsSnap.docs.map((d) => (d.data() as Record<string, unknown>)?.name).filter((n): n is string => typeof n === "string");

      if (nextFormat === "league" || nextFormat === "league_cup") {
        const leagueNames = roundNames.filter((n) => /^第\d+節$/.test(String(n).trim()));
        form.setValue("leagueRounds", leagueNames.length > 0 ? leagueNames.length : undefined, { shouldDirty: true, shouldValidate: true });
      }

      if (nextFormat === "cup" || nextFormat === "league_cup") {
        const cupNames = roundNames.filter((n) => !/^第\d+節$/.test(String(n).trim()));
        form.setValue(
          "cupRounds",
          cupNames.length > 0 ? cupNames.map((name) => ({ name })) : [{ name: "" }],
          { shouldDirty: true, shouldValidate: true }
        );
      }
    } catch (e) {
      console.warn("[NewCompetitionPage] Failed to load rounds template:", e);
    }
  }, [clubUid, form]);

  useEffect(() => {
    if (competitionNameMode === "new") {
      setSelectedCompetitionName("__new__");
      form.setValue("name", "");
    }
  }, [competitionNameMode, form]);

  const filteredTeams = useMemo(() => {
    const search = teamSearch.trim().toLowerCase();
    return allTeams.filter((t) => {
      const inSearch = !search || t.name.toLowerCase().includes(search);
      const cat = typeof t.categoryId === "string" && t.categoryId.trim().length > 0 ? t.categoryId : null;
      const inCategory = teamCategoryFilters.includes(cat ? cat : "uncategorized");
      return inSearch && inCategory;
    });
  }, [allTeams, teamSearch, teamCategoryFilters]);

  const selectedTeamCount = form.watch("teams")?.length ?? 0;

  const getTeamInitial = (name: string) => {
    const s = (name || "").trim();
    if (!s) return "?";
    return s.slice(0, 1).toUpperCase();
  };

  const handleLogoUpload = async (file: File) => {
    setLogoUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET!);

    try {
      const response = await fetch(`https://api.cloudinary.com/v1_1/${process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME}/image/upload`, {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      const emblemUrl = data.secure_url as string | undefined;
      if (emblemUrl) {
        form.setValue("logoUrl", emblemUrl, { shouldDirty: true, shouldValidate: true });
      }
    } catch (error) {
      console.error("Error uploading emblem:", error);
      toast.error("エンブレムのアップロードに失敗しました。");
    } finally {
      setLogoUploading(false);
    }
  };

  const handleBack = () => {
    if (step === 1) {
      requestLeave();
    } else {
      setStep((s) => (s === 2 ? 1 : s === 3 ? 2 : 3) as 1 | 2 | 3 | 4);
    }
  };

  const requestLeave = () => {
    if (form.formState.isDirty) {
      setDiscardOpen(true);
    } else {
      doLeave();
    }
  };

  const doLeave = () => {
    setDiscardOpen(false);
    router.push("/admin/competitions");
  };

  const handleNext = async () => {
    if (step === 1) {
      const ok = await form.trigger(["name", "season", "format", "leagueRounds", "cupRounds"]);
      if (!ok) {
        toast.error("入力内容を確認してください。");
        return;
      }
      setStep(2);
    } else if (step === 2) {
      const ok = await form.trigger(["teams"]);
      if (!ok) {
        toast.error("参加チームを1つ以上選択してください。");
        return;
      }
      setStep(3);
    } else if (step === 3) {
      const ok = await form.trigger(["showOnHome", "showOnTable", "rankLabels"]);
      if (!ok) {
        toast.error("表示設定を確認してください。");
        return;
      }
      setStep(4);
    }
  };

  const onSubmit: SubmitHandler<FormValues> = async (data) => {
    if (!user) {
      toast.error("ログインしていません。");
      return;
    }
    if (!clubUid) return;

    const isValid = await form.trigger();
    if (!isValid) {
      toast.error("入力内容を確認してください。");
      return;
    }

    if (Number.isFinite(maxCompetitions)) {
      const seasonKey = typeof data?.season === "string" ? data.season.trim() : "";
      const currentCount = seasonKey ? (competitionCountBySeason[seasonKey] ?? 0) : 0;
      if (seasonKey && currentCount >= maxCompetitions) {
        toast.error(`このシーズンでは大会は${maxCompetitions}つまで作成できます。`);
        return;
      }
    }

    setLoading(true);
    try {
      if (data.season) {
        const seasonId = toDashSeason(data.season.trim());
        const seasonRef = doc(db, `clubs/${clubUid}/seasons`, seasonId);
        await setDoc(seasonRef, { id: seasonId }, { merge: true });
      }

      const competitionData: Record<string, unknown> = {
        name: String(data.name || "").trim(),
        season: String(data.season || ""),
        format: String(data.format || "league") as "league" | "cup" | "league_cup",
        teams: Array.isArray(data.teams) ? data.teams : [],
        logoUrl: data.logoUrl && data.logoUrl !== "" ? data.logoUrl : null,
        showOnHome: !!data.showOnHome,
        showOnTable: data.format === "cup" ? false : !!data.showOnTable,
        rankLabels: data.format === "cup" ? [] : (Array.isArray(data.rankLabels) ? data.rankLabels : []),
      };

      const removeUndefined = (obj: unknown): unknown => {
        if (obj === null || obj === undefined) return null;
        if (Array.isArray(obj)) return obj.map(removeUndefined);
        if (typeof obj === "object") {
          const cleaned: Record<string, unknown> = {};
          for (const key in obj as Record<string, unknown>) {
            if ((obj as Record<string, unknown>)[key] !== undefined) {
              cleaned[key] = removeUndefined((obj as Record<string, unknown>)[key]);
            }
          }
          return cleaned;
        }
        return obj;
      };

      const batch = writeBatch(db);

      if (data.showOnHome) {
        const homeSnap = await getDocs(
          query(collection(db, `clubs/${clubUid}/competitions`), where("showOnHome", "==", true))
        );
        homeSnap.docs.forEach((d) => {
          const ref = doc(db, `clubs/${clubUid}/competitions`, d.id);
          batch.update(ref, { showOnHome: false });
        });
      }

      const cleanedData = removeUndefined(competitionData) as Record<string, unknown>;
      const compRef = await addDoc(collection(db, `clubs/${clubUid}/competitions`), cleanedData);

      if (clubUid) {
        const first = await setActivationOnce(clubUid, 'firstCompetitionCreatedAt');
        if (first) {
          void trackEvent('competition_create_first', clubUid, {
            profileId: clubUid,
            ownerUid: clubUid,
            competitionId: compRef.id,
          });
        }
      }

      const roundsColRef = collection(db, `clubs/${clubUid}/competitions`, compRef.id, "rounds");
      if (data.format === "league" || data.format === "league_cup") {
        for (let i = 1; i <= data.leagueRounds!; i++) {
          const roundDoc = doc(roundsColRef);
          batch.set(roundDoc, { name: `第${i}節` });
        }
      }
      if (data.format === "cup" || data.format === "league_cup") {
        data.cupRounds?.forEach((round) => {
          const roundDoc = doc(roundsColRef);
          batch.set(roundDoc, { name: round.name });
        });
      }

      await batch.commit();
      toast.success("新しい大会が作成されました。");
      router.push(`/admin/competitions/${compRef.id}`);
    } catch (error) {
      console.error("Error creating competition:", error);
      let errorMessage = "大会の作成に失敗しました。";
      if (error instanceof Error) {
        errorMessage = `大会の作成に失敗しました: ${error.message}`;
      } else if (typeof error === "string") {
        errorMessage = `大会の作成に失敗しました: ${error}`;
      }
      toast.error(errorMessage, { duration: 5000 });
    } finally {
      setLoading(false);
    }
  };

  const formatOptions = [
    {
      value: "league" as const,
      title: "リーグ戦",
      desc: "順位表を使う通常のリーグ形式",
      icon: CalendarDays,
    },
    {
      value: "cup" as const,
      title: "カップ戦",
      desc: "ノックアウト形式",
      icon: Trophy,
    },
    {
      value: "league_cup" as const,
      title: "リーグ＋トーナメント",
      desc: "グループ戦後に決勝トーナメント",
      icon: Swords,
    },
  ];

  const toggleTeam = (teamId: string) => {
    const current = form.getValues("teams") || [];
    if (current.includes(teamId)) {
      form.setValue("teams", current.filter((id) => id !== teamId), { shouldDirty: true, shouldValidate: true });
    } else {
      form.setValue("teams", [...current, teamId], { shouldDirty: true, shouldValidate: true });
    }
  };

  const selectDisplayed = () => {
    const current = new Set(form.getValues("teams") || []);
    filteredTeams.forEach((t) => current.add(t.id));
    form.setValue("teams", Array.from(current), { shouldDirty: true, shouldValidate: true });
  };

  const clearDisplayed = () => {
    const displayed = new Set(filteredTeams.map((t) => t.id));
    const current = (form.getValues("teams") || []).filter((id) => !displayed.has(id));
    form.setValue("teams", current, { shouldDirty: true, shouldValidate: true });
  };

  const toggleCategory = (id: string) => {
    setTeamCategoryFilters((prev) => {
      const set = new Set(prev);
      if (set.has(id)) set.delete(id);
      else set.add(id);
      return Array.from(set);
    });
  };

  const isSelected = (teamId: string) => {
    const current = form.getValues("teams") || [];
    return current.includes(teamId);
  };

  const renderStep1 = () => (
    <div className="space-y-6 px-4 pb-8 pt-2">
      <div className="space-y-1">
        <h2 className="text-xl font-bold text-[#f0f4ff]">基本情報</h2>
        <p className="text-sm text-[#94a3b8]">大会の情報と形式を設定します</p>
      </div>

      {/* 大会ロゴ */}
      <FormField
        control={form.control}
        name="logoUrl"
        render={({ field }) => (
          <FormItem>
            <div className="flex items-center gap-4 rounded-2xl border border-white/[0.08] bg-[#111c2d] p-4">
              <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full bg-white/80">
                {field.value ? (
                  <Image src={field.value} alt="大会ロゴ" fill className="object-cover" unoptimized />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <UploadCloud className="h-6 w-6 text-[#94a3b8]" />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-[#f0f4ff]">大会ロゴ</p>
                <p className="text-xs text-[#94a3b8]">任意・あとから変更できます</p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleLogoUpload(file);
                  if (e.target) e.target.value = "";
                }}
                disabled={logoUploading}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={logoUploading}
                className="shrink-0 border-white/[0.08] bg-[#111c2d] text-[#f0f4ff] hover:bg-white/5"
              >
                {logoUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                画像を選択
              </Button>
              {field.value && (
                <Button
                  type="button"
                variant="ghost"
                  size="icon"
                  onClick={() => form.setValue("logoUrl", "", { shouldDirty: true, shouldValidate: true })}
                  aria-label="ロゴを削除"
                  className="shrink-0 text-[#f0f4ff] hover:bg-white/5"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
            <FormMessage />
          </FormItem>
        )}
      />

      {/* 大会名 */}
      <FormField
        control={form.control}
        name="name"
        render={({ field }) => (
          <FormItem>
            <FormLabel className="text-[#f0f4ff]">
              大会名 <span className="text-red-500 text-xs">必須</span>
            </FormLabel>
            <div className="space-y-2">
              <Select
                value={selectedCompetitionName}
                onValueChange={(v) => {
                  setSelectedCompetitionName(v);
                  if (v === "__new__") {
                    setCompetitionNameMode("new");
                    field.onChange("");
                    form.setValue("format", "league");
                    return;
                  }
                  setCompetitionNameMode("existing");
                  field.onChange(v);
                  const template = templateByName[v];
                  if (template) applyTemplateFromCompetition(template);
                }}
              >
                <FormControl>
                  <SelectTrigger className="h-12 w-full border-white/[0.08] bg-[#111c2d] text-[#f0f4ff]">
                    <SelectValue placeholder="大会名を選択" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent className="border-white/[0.08] bg-[#111c2d] text-[#f0f4ff]">
                  {competitionNameSuggestions.map((n) => (
                    <SelectItem key={n} value={n} className="focus:bg-[#1a2940] focus:text-[#f0f4ff]">
                      {n}
                    </SelectItem>
                  ))}
                  <SelectItem value="__new__" className="focus:bg-[#1a2940] focus:text-[#f0f4ff]">
                    （新しい大会名を追加）
                  </SelectItem>
                </SelectContent>
              </Select>

              {competitionNameMode === "new" ? (
                <FormControl>
                  <Input
                    placeholder="プレミアリーグ"
                    {...field}
                    className="h-12 w-full border-white/[0.08] bg-[#111c2d] text-[#f0f4ff] placeholder:text-[#94a3b8]"
                    onChange={(e) => field.onChange(e.target.value)}
                  />
                </FormControl>
              ) : (
                <FormControl>
                  <Input
                    placeholder="プレミアリーグ"
                    {...field}
                    disabled
                    className="h-12 w-full border-white/[0.08] bg-[#0d1520] text-[#94a3b8]"
                  />
                </FormControl>
              )}
            </div>
            <FormMessage />
          </FormItem>
        )}
      />

      {/* シーズン */}
      <FormField
        control={form.control}
        name="season"
        render={({ field }) => (
          <FormItem>
            <FormLabel className="text-[#f0f4ff]">
              シーズン <span className="text-red-500 text-xs">必須</span>
            </FormLabel>
            <Select onValueChange={field.onChange} defaultValue={field.value}>
              <FormControl>
                <SelectTrigger className="h-12 w-full border-white/[0.08] bg-[#111c2d] text-[#f0f4ff]">
                  <SelectValue placeholder="シーズンを選択" />
                </SelectTrigger>
              </FormControl>
              <SelectContent className="border-white/[0.08] bg-[#111c2d] text-[#f0f4ff]">
                {seasons.map((s) => (
                  <SelectItem key={s} value={s} className="focus:bg-[#1a2940] focus:text-[#f0f4ff]">
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />

      {/* 大会形式 */}
      <FormField
        control={form.control}
        name="format"
        render={({ field }) => (
          <FormItem>
            <FormLabel className="text-[#f0f4ff]">
              大会フォーマット <span className="text-red-500 text-xs">必須</span>
            </FormLabel>
            <div className="space-y-3">
              {formatOptions.map((opt) => {
                const checked = field.value === opt.value;
                const Icon = opt.icon;
                return (
                  <label
                    key={opt.value}
                    className={`flex cursor-pointer items-center gap-4 rounded-2xl border p-4 transition-colors ${
                      checked
                        ? "border-[#1fd760] bg-[#1fd760]/10"
                        : "border-white/[0.08] bg-[#111c2d] hover:bg-[#1a2940]"
                    }`}
                  >
                    <input
                      type="radio"
                      name="format"
                      value={opt.value}
                      checked={checked}
                      onChange={() => field.onChange(opt.value)}
                      className="sr-only"
                    />
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${checked ? "bg-[#1fd760] text-[#080c14]" : "bg-white/10 text-[#94a3b8]"}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-[#f0f4ff]">{opt.title}</p>
                      <p className="text-xs text-[#94a3b8]">{opt.desc}</p>
                    </div>
                    <div className={`h-5 w-5 shrink-0 rounded-full border ${checked ? "border-[#1fd760] bg-[#1fd760]" : "border-white/30"} flex items-center justify-center`}>
                      {checked && <Check className="h-3 w-3 text-[#080c14]" />}
                    </div>
                  </label>
                );
              })}
            </div>
            <FormMessage />
          </FormItem>
        )}
      />

      {/* 総節数 */}
      {(selectedFormat === "league" || selectedFormat === "league_cup") && (
        <FormField
          control={form.control}
          name="leagueRounds"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-[#f0f4ff]">総節数</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  placeholder="38"
                  value={field.value ?? ""}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    field.onChange(Number.isNaN(n) ? undefined : n);
                  }}
                  className="h-12 w-full border-white/[0.08] bg-[#111c2d] text-[#f0f4ff]"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      )}

      {/* 回戦名 */}
      {(selectedFormat === "cup" || selectedFormat === "league_cup") && (
        <div className="space-y-4 rounded-2xl border border-white/[0.08] bg-[#111c2d] p-4">
          <p className="text-sm font-medium text-[#f0f4ff]">回戦名</p>
          {cupRoundFields.map((field, index) => (
            <div key={field.id} className="flex items-center gap-2">
              <FormField
                control={form.control}
                name={`cupRounds.${index}.name`}
                render={({ field }) => (
                  <FormItem className="flex-1">
                    <FormControl>
                      <Input
                        placeholder="例: 準々決勝"
                        {...field}
                        className="h-12 w-full border-white/[0.08] bg-[#0d1520] text-[#f0f4ff]"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removeCupRound(index)}
                disabled={cupRoundFields.length <= 1}
                aria-label="回戦を削除"
                className="text-[#f0f4ff] hover:bg-white/5"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => appendCupRound({ name: "" })}
            className="w-full border-white/[0.08] bg-[#0d1520] text-[#f0f4ff] hover:bg-white/5"
          >
            <Plus className="mr-2 h-4 w-4" />
            回戦を追加
          </Button>
        </div>
      )}
    </div>
  );

  const renderStep2 = () => (
    <div className="space-y-4 px-4 pb-8 pt-2">
      <div className="space-y-1">
        <h2 className="text-xl font-bold text-[#f0f4ff]">参加チーム</h2>
        <p className="text-sm text-[#94a3b8]">大会に参加するチームを選択します</p>
      </div>

      <div className="space-y-3 rounded-2xl border border-white/[0.08] bg-[#111c2d] p-4">
        <div>
          <p className="whitespace-nowrap text-sm font-bold text-[#f0f4ff]">選択中 {selectedTeamCount}チーム</p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={selectDisplayed}
            disabled={filteredTeams.length === 0}
            className="border-white/[0.08] bg-[#0d1520] text-[#f0f4ff] hover:bg-white/5"
          >
            表示中をすべて選択
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={clearDisplayed}
            disabled={filteredTeams.length === 0}
            className="border-white/[0.08] bg-[#0d1520] text-[#f0f4ff] hover:bg-white/5"
          >
            選択を解除
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94a3b8]" />
          <Input
            type="text"
            placeholder="チーム名で検索"
            value={teamSearch}
            onChange={(e) => setTeamSearch(e.target.value)}
            className="h-12 w-full border-white/[0.08] bg-[#111c2d] pl-10 text-[#f0f4ff] placeholder:text-[#94a3b8]"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => toggleCategory("uncategorized")}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              teamCategoryFilters.includes("uncategorized")
                ? "border-[#1fd760] bg-[#1fd760]/10 text-[#1fd760]"
                : "border-white/[0.08] bg-[#111c2d] text-[#94a3b8]"
            }`}
          >
            未分類
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => toggleCategory(c.id)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                teamCategoryFilters.includes(c.id)
                  ? "border-[#1fd760] bg-[#1fd760]/10 text-[#1fd760]"
                  : "border-white/[0.08] bg-[#111c2d] text-[#94a3b8]"
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>
      </div>

      {allTeams.length === 0 ? (
        <div className="rounded-2xl border border-white/[0.08] bg-[#111c2d] p-8 text-center">
          <p className="mb-1 text-lg font-bold text-[#f0f4ff]">参加できるチームが登録されていません</p>
          <p className="mb-4 text-sm text-[#94a3b8]">先にチームを追加してください。</p>
          <Button
            type="button"
            onClick={() => router.push("/admin/teams")}
            className="bg-[#1fd760] font-bold text-[#080c14] hover:bg-[#17c054]"
          >
            チーム管理へ移動
          </Button>
        </div>
      ) : filteredTeams.length === 0 ? (
        <div className="rounded-2xl border border-white/[0.08] bg-[#111c2d] p-8 text-center">
          <p className="mb-1 text-lg font-bold text-[#f0f4ff]">条件に一致するチームがありません</p>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setTeamSearch("");
              setTeamCategoryFilters(["uncategorized", ...categories.map((c) => c.id)]);
            }}
            className="border-white/[0.08] bg-[#0d1520] text-[#f0f4ff] hover:bg-white/5"
          >
            検索条件を解除
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {filteredTeams.map((team) => {
            const selected = isSelected(team.id);
            return (
              <div
                key={team.id}
                role="checkbox"
                aria-checked={selected}
                tabIndex={0}
                onClick={() => toggleTeam(team.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    toggleTeam(team.id);
                  }
                }}
                className={`flex min-h-[48px] cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors ${
                  selected
                    ? "border-[#1fd760] bg-[#1fd760]/10"
                    : "border-white/[0.08] bg-[#111c2d] hover:bg-[#1a2940]"
                }`}
              >
                <div
                  aria-hidden="true"
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
                    selected
                      ? "border-[#1fd760] bg-[#1fd760] text-[#080c14]"
                      : "border-white/40 bg-transparent text-transparent"
                  }`}
                >
                  <Check className="h-3.5 w-3.5" />
                </div>
                {team.logoUrl ? (
                  <Image src={team.logoUrl} alt={team.name} width={28} height={28} className="shrink-0 rounded-full object-contain" unoptimized />
                ) : (
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-slate-100 to-slate-300 text-xs font-bold text-slate-800">
                    {getTeamInitial(team.name)}
                  </div>
                )}
                <span className="min-w-0 flex-1 truncate text-sm text-[#f0f4ff]">{team.name}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  const renderStep3 = () => {
    const data = form.getValues();
    const rankLabels = data.rankLabels || [];

    return (
      <div className="space-y-6 px-4 pb-8 pt-2">
        <div className="space-y-1">
          <h2 className="text-xl font-bold text-[#f0f4ff]">表示設定</h2>
          <p className="text-sm text-[#94a3b8]">公開ページでの表示方法を設定します</p>
        </div>

        <div className="rounded-2xl border border-white/[0.08] bg-[#111c2d] p-4">
          <p className="mb-4 text-sm font-bold text-[#f0f4ff]">公開ページ表示設定</p>
          <FormField
            control={form.control}
            name="showOnHome"
            render={({ field }) => (
              <FormItem className="mb-3 flex items-center justify-between">
                <div>
                  <FormLabel className="text-[#f0f4ff]">トップページのメイン大会にする</FormLabel>
                  <FormDescription className="text-xs text-[#94a3b8]">
                    既存のメイン大会がある場合は切り替わります。
                  </FormDescription>
                </div>
                <FormControl>
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="showOnTable"
            render={({ field }) => (
              <FormItem className="flex items-center justify-between">
                <div>
                  <FormLabel className={data.format === "cup" ? "text-[#94a3b8]" : "text-[#f0f4ff]"}>
                    公開ページの順位表に表示する
                  </FormLabel>
                </div>
                <FormControl>
                  <Switch checked={field.value} onCheckedChange={field.onChange} disabled={data.format === "cup"} />
                </FormControl>
              </FormItem>
            )}
          />
        </div>

        {data.format !== "cup" && (
          <div className="space-y-4 rounded-2xl border border-white/[0.08] bg-[#111c2d] p-4">
            <div className="space-y-1">
              <p className="text-sm font-bold text-[#f0f4ff]">順位ラベル（任意）</p>
              <p className="text-xs text-[#94a3b8]">
                国際大会への出場権や、昇格・降格の対象となる順位を色分けして表示できます。設定はあとから変更できます。
              </p>
            </div>

            <div className="space-y-2 rounded-xl border border-white/[0.08] bg-[#0d1520] p-3">
              <p className="text-xs font-bold text-[#f0f4ff]">順位表での表示イメージ</p>
              {rankLabels.length > 0 ? (
                <div className="mb-2 flex flex-wrap gap-x-3 gap-y-1">
                  {rankLabels.map((label, idx) => (
                    <span
                      key={idx}
                      className="text-xs font-bold"
                      style={{ color: label.color }}
                    >
                      {label.name || "（未設定）"} {label.startRank}位〜{label.endRank}位
                    </span>
                  ))}
                </div>
              ) : (
                <p className="mb-2 text-xs text-[#94a3b8]">ラベルが設定されていません</p>
              )}
              <div className="space-y-1">
                {["AFCレイソル", "ノーザンメアFC", "東部クラブ", "西部スポーツ", "サウスアイランド"].map((club, i) => {
                  const rank = i + 1;
                  const activeLabel = rankLabels.find((l) => l.startRank <= rank && rank <= l.endRank);
                  return (
                    <div
                      key={club}
                      className="flex items-center gap-2 rounded-lg px-2 py-1.5"
                      style={{
                        backgroundColor: activeLabel ? hexToRgba(activeLabel.color, 0.1) : "transparent",
                        borderLeft: `3px solid ${activeLabel ? activeLabel.color : "transparent"}`,
                      }}
                    >
                      <span className="w-5 text-xs font-bold text-[#94a3b8]">{rank}</span>
                      <span className="flex-1 text-xs text-[#f0f4ff]">{club}</span>
                      <span className="text-xs text-[#94a3b8]">{[42, 38, 31, 27, 22][i]}pt</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {rankLabelFields.map((field, index) => (
              <div key={field.id} className="rounded-xl border border-white/[0.08] bg-[#0d1520] p-3">
                {editingRankLabel === index ? (
                  <div className="space-y-3">
                    <FormField
                      control={form.control}
                      name={`rankLabels.${index}.name`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs text-[#94a3b8]">ラベル名</FormLabel>
                          <FormControl>
                            <Input
                              value={field.value}
                              onChange={field.onChange}
                              placeholder="例：国際大会出場圏"
                              className="h-10 border-white/[0.08] bg-[#111c2d] text-[#f0f4ff] placeholder:text-[#94a3b8]"
                            />
                          </FormControl>
                          <div className="flex flex-wrap gap-2 pt-1">
                            {RANK_LABEL_SUGGESTIONS.map((s) => (
                              <button
                                key={s}
                                type="button"
                                onClick={() => field.onChange(s)}
                                className="rounded-full border border-white/10 bg-[#111c2d] px-2.5 py-1 text-[10px] text-[#94a3b8] transition hover:bg-[#1a2940]"
                              >
                                {s}
                              </button>
                            ))}
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="space-y-1">
                      <p className="text-xs text-[#94a3b8]">順位範囲</p>
                      <div className="flex items-start gap-1">
                        <FormField
                          control={form.control}
                          name={`rankLabels.${index}.startRank`}
                          render={({ field }) => (
                            <FormItem className="space-y-1">
                              <FormLabel className="sr-only">開始順位</FormLabel>
                              <FormControl>
                                <div className="flex items-center gap-1">
                                  <Input
                                    type="number"
                                    min={1}
                                    value={field.value ?? ""}
                                    onChange={(e) => {
                              const raw = e.target.value;
                              if (raw === "") {
                                field.onChange("");
                                return;
                              }
                              const n = Number(raw);
                              field.onChange(Number.isNaN(n) ? 1 : n || "");
                            }}
                                    className="h-10 w-14 border-white/[0.08] bg-[#111c2d] text-center text-[#f0f4ff]"
                                  />
                                  <span className="text-sm text-[#f0f4ff]">位</span>
                                </div>
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <span className="mt-3 text-sm text-[#94a3b8]">〜</span>
                        <FormField
                          control={form.control}
                          name={`rankLabels.${index}.endRank`}
                          render={({ field }) => (
                            <FormItem className="space-y-1">
                              <FormLabel className="sr-only">終了順位</FormLabel>
                              <FormControl>
                                <div className="flex items-center gap-1">
                                  <Input
                                    type="number"
                                    min={1}
                                    value={field.value ?? ""}
                                    onChange={(e) => {
                              const raw = e.target.value;
                              if (raw === "") {
                                field.onChange("");
                                return;
                              }
                              const n = Number(raw);
                              field.onChange(Number.isNaN(n) ? 1 : n || "");
                            }}
                                    className="h-10 w-14 border-white/[0.08] bg-[#111c2d] text-center text-[#f0f4ff]"
                                  />
                                  <span className="text-sm text-[#f0f4ff]">位</span>
                                </div>
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>

                    <FormField
                      control={form.control}
                      name={`rankLabels.${index}.color`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs text-[#94a3b8]">表示色</FormLabel>
                          <FormControl>
                            <div className="flex flex-wrap gap-2">
                              {RANK_LABEL_COLORS.map((c) => (
                                <button
                                  key={c}
                                  type="button"
                                  onClick={() => field.onChange(c)}
                                  className={`h-8 w-8 rounded-full border-2 transition flex items-center justify-center ${
                                    field.value === c ? "border-white" : "border-transparent"
                                  }`}
                                  style={{ backgroundColor: c }}
                                  aria-label={RANK_LABEL_COLOR_NAMES[c]}
                                  aria-pressed={field.value === c}
                                >
                                  {field.value === c && <Check className="h-4 w-4 text-white" />}
                                </button>
                              ))}
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setEditingRankLabel(null)}
                        className="flex-1 border-white/[0.08] bg-[#111c2d] text-[#f0f4ff] hover:bg-white/5"
                      >
                        完了
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => {
                          removeRankLabel(index);
                          setEditingRankLabel(null);
                        }}
                        className="text-[#f0f4ff] hover:bg-white/5"
                      >
                        削除
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-sm text-[#f0f4ff]">
                      <span
                        className="h-3 w-3 shrink-0 rounded-full"
                        style={{ backgroundColor: rankLabels[index]?.color }}
                      />
                      <span className="min-w-0 break-words">
                        {rankLabels[index]?.name || "（未設定）"} {rankLabels[index]?.startRank}〜{rankLabels[index]?.endRank}位
                      </span>
                    </span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingRankLabel(index)}
                        className="text-xs text-[#1fd760] hover:underline"
                      >
                        編集
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          removeRankLabel(index);
                          setEditingRankLabel(null);
                        }}
                        className="text-xs text-[#94a3b8] hover:text-red-400"
                      >
                        削除
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}

            <Button
              type="button"
              variant="outline"
              onClick={() => {
                appendRankLabel({ name: "", startRank: 1, endRank: 1, color: RANK_LABEL_COLORS[0] });
                setEditingRankLabel(rankLabelFields.length);
              }}
              disabled={rankLabelFields.length >= 5}
              className="w-full border-white/[0.08] bg-[#0d1520] text-[#f0f4ff] hover:bg-white/5 disabled:opacity-50"
            >
              <Plus className="mr-2 h-4 w-4" />
              ＋ 順位ラベルを追加
            </Button>
          </div>
        )}
      </div>
    );
  };

  const renderStep4 = () => {
    const data = form.getValues();
    const selectedTeamNames = (data.teams || [])
      .map((id) => allTeams.find((t) => t.id === id)?.name)
      .filter(Boolean) as string[];
    const formatLabel = formatOptions.find((o) => o.value === data.format);
    const showLabels = data.format !== "cup";

    return (
      <div className="space-y-6 px-4 pb-8 pt-2">
        <div className="space-y-1">
          <h2 className="text-xl font-bold text-[#f0f4ff]">内容を確認</h2>
          <p className="text-sm text-[#94a3b8]">大会を作成する前に設定を確認してください</p>
        </div>

        <div className="space-y-4 rounded-2xl border border-white/[0.08] bg-[#111c2d] p-4">
          <div className="flex items-center gap-4">
            <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full bg-white/80">
              {data.logoUrl ? (
                <Image src={data.logoUrl} alt="" fill className="object-cover" unoptimized />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <UploadCloud className="h-6 w-6 text-[#94a3b8]" />
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-lg font-bold text-[#f0f4ff]">{data.name || "（未入力）"}</p>
              <p className="text-sm text-[#94a3b8]">{data.season}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl border border-white/[0.08] bg-[#0d1520] p-3">
              <p className="text-xs text-[#94a3b8]">大会形式</p>
              <p className="font-bold text-[#f0f4ff]">{formatLabel?.title}</p>
            </div>
            <div className="rounded-xl border border-white/[0.08] bg-[#0d1520] p-3">
              <p className="text-xs text-[#94a3b8]">参加チーム</p>
              <p className="font-bold text-[#f0f4ff]">{data.teams?.length ?? 0}チーム</p>
            </div>
            {(data.format === "league" || data.format === "league_cup") && (
              <div className="rounded-xl border border-white/[0.08] bg-[#0d1520] p-3">
                <p className="text-xs text-[#94a3b8]">総節数</p>
                <p className="font-bold text-[#f0f4ff]">{data.leagueRounds}節</p>
              </div>
            )}
            {(data.format === "cup" || data.format === "league_cup") && (
              <div className="rounded-xl border border-white/[0.08] bg-[#0d1520] p-3">
                <p className="text-xs text-[#94a3b8]">回戦数</p>
                <p className="font-bold text-[#f0f4ff]">{data.cupRounds?.length ?? 0}つ</p>
              </div>
            )}
          </div>

          <div>
            <p className="mb-2 text-xs text-[#94a3b8]">選択チーム</p>
            <div className="flex flex-wrap gap-2">
              {selectedTeamNames.map((name) => (
                <span key={name} className="inline-flex items-center rounded-full border border-white/[0.08] bg-[#0d1520] px-2.5 py-1 text-xs text-[#f0f4ff]">
                  {name}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-3 rounded-2xl border border-white/[0.08] bg-[#111c2d] p-4">
          <p className="text-sm font-bold text-[#f0f4ff]">公開ページ表示設定</p>
          <p className="text-sm text-[#f0f4ff]">
            トップページのメイン大会にする：{data.showOnHome ? "はい" : "いいえ"}
          </p>
          {data.format !== "cup" && (
            <p className="text-sm text-[#f0f4ff]">
              順位表に表示する：{data.showOnTable ? "はい" : "いいえ"}
            </p>
          )}
          {showLabels && data.rankLabels && data.rankLabels.length > 0 && (
            <div>
              <p className="mb-2 text-xs text-[#94a3b8]">順位ラベル</p>
              <div className="flex flex-wrap gap-2">
                {data.rankLabels.map((label, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold text-[#080c14]"
                    style={{ backgroundColor: label.color }}
                  >
                    {label.name} {label.startRank}-{label.endRank}位
                  </span>
                ))}
              </div>
            </div>
          )}
          {showLabels && (!data.rankLabels || data.rankLabels.length === 0) && (
            <p className="text-sm text-[#94a3b8]">順位ラベル：設定なし</p>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex min-h-[100dvh] flex-col bg-[#08111f] text-[#f0f4ff]">
      {/* ヘッダー */}
      <header className="shrink-0 sticky top-0 z-20 flex h-14 items-center justify-between border-b border-white/[0.08] bg-[#08111f]/95 px-4 backdrop-blur">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={handleBack}
          aria-label="戻る"
          className="text-[#f0f4ff] hover:bg-white/5"
        >
          {step === 1 ? <X className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
        </Button>
        <h1 className="text-base font-bold">大会を作成</h1>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => requestLeave()}
          aria-label="閉じる"
          className="text-[#f0f4ff] hover:bg-white/5"
        >
          <X className="h-5 w-5" />
        </Button>
      </header>

      {/* ステップ表示 */}
      <div className="shrink-0 border-b border-white/[0.08] bg-[#08111f] px-4 py-4">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          {[
            { num: 1, label: "基本情報" },
            { num: 2, label: "参加チーム" },
            { num: 3, label: "表示設定" },
            { num: 4, label: "確認" },
          ].map((s, idx, arr) => {
            const active = step === s.num;
            const done = step > s.num;
            const isLast = idx === arr.length - 1;
            return (
              <div key={s.num} className="flex flex-1 items-center">
                <button
                  type="button"
                  onClick={() => {
                    if (done) setStep(s.num as 1 | 2 | 3 | 4);
                  }}
                  className="flex flex-1 flex-col items-center gap-1"
                  aria-current={active ? "step" : undefined}
                >
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold transition-colors ${
                      active
                        ? "bg-[#1fd760] text-[#080c14]"
                        : done
                        ? "bg-[#1fd760]/20 text-[#1fd760]"
                        : "border border-white/20 text-[#94a3b8]"
                    }`}
                  >
                    {done ? <Check className="h-4 w-4" /> : s.num}
                  </div>
                  <span className={`whitespace-nowrap text-xs ${active || done ? "text-[#1fd760]" : "text-[#94a3b8]"}`}>{s.label}</span>
                </button>
                {!isLast && <div className={`mx-2 h-px flex-1 ${done ? "bg-[#1fd760]" : "bg-white/10"}`} />}
              </div>
            );
          })}
        </div>
      </div>

      {/* 本文 */}
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              {step === 1 && renderStep1()}
              {step === 2 && renderStep2()}
              {step === 3 && renderStep3()}
              {step === 4 && renderStep4()}
            </form>
          </Form>
        </div>
      </main>

      {/* フッター */}
      <footer className="shrink-0 border-t border-white/[0.08] bg-[#08111f] p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto flex max-w-2xl gap-3">
          {step > 1 && (
            <Button
              type="button"
              variant="outline"
              onClick={() => setStep((s) => (s === 2 ? 1 : s === 3 ? 2 : 3) as 1 | 2 | 3 | 4)}
              className="h-12 flex-1 border-white/[0.08] bg-transparent text-[#f0f4ff] hover:bg-white/5"
            >
              戻る
            </Button>
          )}
          {step < 4 ? (
            <Button
              type="button"
              onClick={handleNext}
              className="h-12 flex-[2] bg-[#1fd760] font-bold text-[#080c14] hover:bg-[#17c054]"
            >
              {step === 1 ? "次へ：参加チーム" : step === 2 ? "次へ：表示設定" : "次へ：確認"}
            </Button>
          ) : (
            <Button
              type="button"
              onClick={form.handleSubmit(onSubmit)}
              disabled={loading}
              className="h-12 flex-[2] bg-[#1fd760] font-bold text-[#080c14] hover:bg-[#17c054]"
            >
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {loading ? "作成中..." : "大会を作成"}
            </Button>
          )}
        </div>
      </footer>

      <AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <AlertDialogContent className="border-white/[0.08] bg-[#111c2d] text-[#f0f4ff]">
          <AlertDialogHeader>
            <AlertDialogTitle>入力内容を破棄しますか？</AlertDialogTitle>
            <AlertDialogDescription className="text-[#94a3b8]">
              作成中の内容は失われます。よろしいですか？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => setDiscardOpen(false)}
              className="border-white/[0.08] bg-transparent text-[#f0f4ff] hover:bg-white/5"
            >
              キャンセル
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={doLeave}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              破棄
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
