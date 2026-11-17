"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useCareer } from "@/contexts/CareerContext";
import { db } from "@/lib/firebase";
import { doc, getDoc, updateDoc, collection, query, getDocs } from "firebase/firestore";
import { useForm, useFieldArray, type SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormDescription, FormMessage } from "@/components/ui/form";
import Image from "next/image";
import { Loader2, Plus, Trash2, X, ChevronDown, ChevronUp, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { normalizeRankLabels } from "@/lib/rank-labels";
import { TeamSelectorPanel, type Team, type TeamCategory } from "./team-selector";

const seasons = Array.from({ length: 91 }, (_, i) => {
  const startYear = 1960 + i;
  const endYear = startYear + 1;
  return `${startYear}/${String(endYear).slice(-2)}`;
});

const rankLabelColors = [
  { name: "green", bg: "bg-green-500", border: "border-green-500" },
  { name: "red", bg: "bg-red-500", border: "border-red-500" },
  { name: "orange", bg: "bg-orange-500", border: "border-orange-500" },
  { name: "blue", bg: "bg-blue-500", border: "border-blue-500" },
  { name: "yellow", bg: "bg-yellow-500", border: "border-yellow-500" },
  { name: "purple", bg: "bg-purple-500", border: "border-purple-500" },
  { name: "pink", bg: "bg-pink-500", border: "border-pink-500" },
  { name: "gray", bg: "bg-gray-500", border: "border-gray-500" },
] as const;

const formSchema = z.object({
  name: z.string().min(1, "大会名は必須です。"),
  season: z.string().min(1, "シーズンを選択してください。"),
  teams: z.array(z.string()).min(1, "最低1チームは選択してください。"),
  teamCount: z.number().int().positive("1以上の整数を入力してください。").optional(),
  logoUrl: z.string().url().optional().or(z.literal("")),
  rankLabels: z
    .array(
      z
        .object({
          name: z.string().optional(),
          from: z.coerce.number().int().positive("1以上の数値を入力してください。"),
          to: z.coerce.number().int().positive("1以上の数値を入力してください。"),
          color: z.enum(["green", "red", "orange", "blue", "yellow", "purple", "pink", "gray"]),
        })
        .refine((v) => v.from <= v.to, {
          message: "開始順位は終了順位以下にしてください。",
          path: ["to"],
        })
    )
    .max(5, "ラベルは最大5つまでです。")
    .optional(),
});

type FormValues = z.infer<typeof formSchema>;

const formatLabel = (format?: string) => {
  switch (format) {
    case "league":
      return "リーグ戦";
    case "cup":
      return "カップ戦";
    case "league_cup":
      return "リーグカップ";
    default:
      return "";
  }
};

const getTeamInitial = (name: string) => {
  const s = (name || "").trim();
  if (!s) return "?";
  return s.slice(0, 1).toUpperCase();
};

export default function EditCompetitionPage() {
  const { user } = useAuth();
  const { activeCareer } = useCareer();
  const router = useRouter();
  const params = useParams();
  const competitionId = params.competitionId as string;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const clubUid = activeCareer?.clubUid;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [allTeams, setAllTeams] = useState<Team[]>([]);
  const [categories, setCategories] = useState<TeamCategory[]>([]);
  const [competitionFormat, setCompetitionFormat] = useState<string | undefined>(undefined);
  const [teamSelectorOpen, setTeamSelectorOpen] = useState(false);
  const [rankLabelsOpen, setRankLabelsOpen] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema) as any,
    defaultValues: {
      name: "",
      season: "",
      teams: [],
      teamCount: undefined,
      logoUrl: "",
      rankLabels: [],
    },
  });

  const {
    fields: rankLabelFields,
    append: appendRankLabel,
    remove: removeRankLabel,
  } = useFieldArray({
    control: form.control as any,
    name: "rankLabels",
  });

  useEffect(() => {
    setAllTeams([]);
    setCategories([]);
    if (!user || !competitionId) return;
    if (!clubUid) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    const fetchData = async () => {
      setLoading(true);
      try {
        const [teamsSnap] = await Promise.all([
          getDocs(query(collection(db, `clubs/${clubUid}/teams`))),
          getDocs(query(collection(db, `clubs/${clubUid}/team_categories`))).then((snap) => {
            if (cancelled) return;
            const data = snap.docs
              .map((d) => ({ id: d.id, ...(d.data() as any) } as TeamCategory))
              .filter((c) => typeof c.name === "string")
              .sort((a, b) => a.name.localeCompare(b.name));
            setCategories(data);
          }),
        ]);
        if (cancelled) return;
        const teamsData = teamsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Team));
        setAllTeams(teamsData);

        const docRef = doc(db, `clubs/${clubUid}/competitions`, competitionId);
        const docSnap = await getDoc(docRef);
        if (cancelled) return;
        if (docSnap.exists()) {
          const data = docSnap.data();
          const format = typeof data.format === "string" ? data.format : undefined;
          setCompetitionFormat(format);
          form.reset({
            name: data.name || "",
            season: data.season || "",
            teams: Array.isArray(data.teams) ? data.teams : [],
            teamCount: typeof data.teamCount === "number" && Number.isFinite(data.teamCount) ? data.teamCount : undefined,
            logoUrl: data.logoUrl || "",
            rankLabels: normalizeRankLabels((data as any).rankLabels),
          });
        } else {
          toast.error("大会が見つかりません。");
          router.push("/admin/competitions");
        }
      } catch (error) {
        console.error("Error fetching data: ", error);
        toast.error("データの読み込みに失敗しました。");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchData();
    return () => {
      cancelled = true;
    };
  }, [user, clubUid, competitionId, router, form]);

  const handleLogoUpload = async (file: File) => {
    setLogoUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET!);

    try {
      const response = await fetch(
        `https://api.cloudinary.com/v1_1/${process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME}/image/upload`,
        { method: "POST", body: formData }
      );
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

  const onSubmit: SubmitHandler<FormValues> = async (data) => {
    if (!user || !competitionId) return;
    if (!clubUid) return;
    setSaving(true);
    try {
      const compRef = doc(db, `clubs/${clubUid}/competitions`, competitionId);
      await updateDoc(compRef, {
        name: data.name,
        season: data.season,
        teams: data.teams,
        teamCount: data.teamCount ?? null,
        logoUrl: data.logoUrl || null,
        rankLabels: Array.isArray(data.rankLabels) ? data.rankLabels : [],
      });
      toast.success("大会情報が更新されました。");
      router.push("/admin/competitions");
    } catch (error) {
      console.error("Error updating competition: ", error);
      toast.error("更新に失敗しました。");
    } finally {
      setSaving(false);
    }
  };

  const selectedTeamIds = form.watch("teams") || [];
  const selectedTeamDetails = useMemo(() => {
    return selectedTeamIds
      .map((id) => allTeams.find((t) => t.id === id))
      .filter((t): t is Team => !!t);
  }, [selectedTeamIds, allTeams]);

  if (loading || !clubUid) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#08111f]">
        <Loader2 className="h-8 w-8 animate-spin text-[#f0f4ff]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#08111f] px-4 py-6 sm:py-10 pb-32">
      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-[28px] font-bold text-[#f0f4ff] sm:text-3xl">大会を編集</h1>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={() => router.push("/admin/competitions")}
            className="text-white hover:bg-white/10"
          >
            <X className="h-6 w-6" />
          </Button>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* 基本情報 */}
            <section className="rounded-2xl border border-white/[0.08] bg-[#111c2d] p-4">
              <h2 className="mb-4 text-sm font-semibold text-white/80">基本情報</h2>
              <div className="space-y-5">
                {/* 大会ロゴ */}
                <FormField
                  control={form.control}
                  name="logoUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-[#f0f4ff]">大会ロゴ</FormLabel>
                      <div className="flex items-center gap-3">
                        <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-white/80">
                          {field.value ? (
                            <Image src={field.value} alt="大会ロゴ" fill className="object-cover" sizes="48px" unoptimized />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center">
                              <UploadCloud className="h-6 w-6 text-[#94a3b8]" />
                            </div>
                          )}
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
                          className="border-white/[0.08] bg-[#111c2d] text-[#f0f4ff] hover:bg-white/5"
                        >
                          {logoUploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                          画像を選択
                        </Button>
                        {field.value && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => form.setValue("logoUrl", "", { shouldDirty: true, shouldValidate: true })}
                            className="text-white hover:bg-white/10"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                      <FormDescription className="text-xs text-[#94a3b8]">
                        大会ごとのロゴ画像を設定できます（任意）。
                      </FormDescription>
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
                        大会名 <span className="text-xs text-red-500">必須</span>
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder="プレミアリーグ"
                          {...field}
                          className="h-12 w-full border-white/[0.08] bg-[#111c2d] text-[#f0f4ff] placeholder:text-[#94a3b8]"
                        />
                      </FormControl>
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
                        シーズン <span className="text-xs text-red-500">必須</span>
                      </FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger className="h-12 w-full border-white/[0.08] bg-[#111c2d] text-[#f0f4ff]">
                            <SelectValue placeholder="シーズンを選択" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="border-white/[0.08] bg-[#111c2d] text-white">
                          {seasons.map((s) => (
                            <SelectItem key={s} value={s} className="focus:bg-[#1a2940] focus:text-white">
                              {s}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* 大会形式（読み取り専用） */}
                <div>
                  <FormLabel className="text-[#f0f4ff]">大会形式</FormLabel>
                  <div className="mt-1 h-12 w-full rounded-md border border-white/[0.08] bg-[#0d1520] px-3 py-2 text-sm text-[#94a3b8]">
                    {formatLabel(competitionFormat) || "—"}
                  </div>
                </div>

                {/* 参加チーム数 */}
                {(competitionFormat === "league" || competitionFormat === "league_cup") && (
                  <FormField
                    control={form.control}
                    name="teamCount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-[#f0f4ff]">
                          参加チーム数 <span className="text-xs text-red-500">必須</span>
                        </FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={1}
                            placeholder="20"
                            value={field.value ?? ""}
                            onChange={(e) => {
                              const n = e.target.value === "" ? undefined : Number(e.target.value);
                              field.onChange(Number.isNaN(n) ? undefined : n);
                            }}
                            className="h-12 w-full border-white/[0.08] bg-[#111c2d] text-[#f0f4ff] placeholder:text-[#94a3b8]"
                          />
                        </FormControl>
                        <FormDescription className="text-xs text-[#94a3b8]">
                          リーグ順位プルダウンの選択肢に使用します。
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </div>
            </section>

            {/* 参加チーム */}
            <FormField
              control={form.control}
              name="teams"
              render={({ field }) => (
                <FormItem>
                  <section className="rounded-2xl border border-white/[0.08] bg-[#111c2d] p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <h2 className="text-sm font-semibold text-white/80">
                        参加チーム <span className="text-xs text-red-500">必須</span>
                      </h2>
                      <span className="text-xs text-[#94a3b8]">選択中 {field.value?.length ?? 0} チーム</span>
                    </div>

                    {selectedTeamDetails.length === 0 ? (
                      <div className="mb-4 rounded-xl border border-white/[0.08] bg-[#0d1520] p-6 text-center">
                        <p className="text-sm text-[#94a3b8]">チームが選択されていません</p>
                      </div>
                    ) : (
                      <div className="mb-4 grid grid-cols-2 gap-3">
                        {selectedTeamDetails.map((team) => (
                          <div
                            key={team.id}
                            className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-[#0d1520] p-2"
                            title={team.name}
                          >
                            {team.logoUrl ? (
                              <Image
                                src={team.logoUrl}
                                alt={team.name}
                                width={28}
                                height={28}
                                className="shrink-0 rounded-full object-contain"
                                unoptimized
                              />
                            ) : (
                              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-slate-100 to-slate-300 text-xs font-bold text-slate-800">
                                {getTeamInitial(team.name)}
                              </div>
                            )}
                            <span className="line-clamp-2 min-w-0 flex-1 text-xs text-[#f0f4ff]">
                              {team.name}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setTeamSelectorOpen(true)}
                      className="w-full border-white/[0.08] bg-[#111c2d] text-[#f0f4ff] hover:bg-white/5"
                    >
                      チームを選択・変更
                    </Button>
                    <FormMessage />
                  </section>

                  <TeamSelectorPanel
                    open={teamSelectorOpen}
                    onOpenChange={setTeamSelectorOpen}
                    allTeams={allTeams}
                    categories={categories}
                    selectedTeamIds={field.value || []}
                    onConfirm={(ids) => field.onChange(ids)}
                  />
                </FormItem>
              )}
            />

            {/* 順位ラベル */}
            <section className="rounded-2xl border border-white/[0.08] bg-[#111c2d] p-4">
              <button
                type="button"
                onClick={() => setRankLabelsOpen((v) => !v)}
                className="flex w-full items-center justify-between"
              >
                <h2 className="text-sm font-semibold text-white/80">順位ラベル</h2>
                {rankLabelsOpen ? (
                  <ChevronUp className="h-5 w-5 text-[#94a3b8]" />
                ) : (
                  <ChevronDown className="h-5 w-5 text-[#94a3b8]" />
                )}
              </button>

              {rankLabelsOpen && (
                <div className="mt-4 space-y-4">
                  <FormDescription className="text-xs text-[#94a3b8]">
                    順位表の左端に色付きラベルを表示します（最大5つ）。
                  </FormDescription>

                  {/* プレビュー */}
                  <div className="rounded-xl border border-white/[0.08] bg-[#0d1520] p-3">
                    <p className="mb-2 text-xs font-bold text-[#f0f4ff]">順位表での表示イメージ</p>
                    <div className="space-y-1">
                      {[1, 2, 3, 4, 5].map((rank) => {
                        const rankLabels = form.getValues("rankLabels") || [];
                        const activeLabel = rankLabels.find((l: any) => l.from <= rank && rank <= l.to);
                        const colorObj = activeLabel ? rankLabelColors.find((c) => c.name === activeLabel.color) : null;
                        return (
                          <div key={rank} className="flex items-center gap-2 rounded bg-[#111c2d] h-8">
                            {colorObj && <div className={`w-1.5 h-6 rounded-l ${colorObj.bg}`} />}
                            <div className="flex flex-1 items-center gap-3 px-2">
                              <span className="w-4 text-[10px] text-[#94a3b8]">{rank}</span>
                              <span className="text-[10px] text-[#f0f4ff]">チーム {rank}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-3">
                    {rankLabelFields.map((f, idx) => (
                      <div key={f.id} className="grid grid-cols-12 gap-2 rounded-xl border border-white/[0.08] bg-[#0d1520] p-3">
                        <div className="col-span-6">
                          <FormField
                            control={form.control}
                            name={`rankLabels.${idx}.name`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-[10px] text-[#94a3b8]">ラベル名</FormLabel>
                                <FormControl>
                                  <Input
                                    placeholder="昇格圏"
                                    {...field}
                                    className="h-10 w-full border-white/[0.08] bg-[#111c2d] px-2 text-sm text-[#f0f4ff] placeholder:text-[#94a3b8]"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        <div className="col-span-2">
                          <FormField
                            control={form.control}
                            name={`rankLabels.${idx}.from`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-[10px] text-[#94a3b8]">開始</FormLabel>
                                <div className="flex items-center">
                                  <FormControl>
                                    <Input
                                      type="number"
                                      placeholder="1"
                                      className="h-10 w-full px-2 text-sm bg-[#111c2d] text-[#f0f4ff] border-white/[0.08]"
                                      {...field}
                                    />
                                  </FormControl>
                                  <span className="ml-1 text-xs text-[#94a3b8]">位</span>
                                </div>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        <div className="col-span-1 flex items-end justify-center pb-3 text-sm text-[#94a3b8]">〜</div>
                        <div className="col-span-2">
                          <FormField
                            control={form.control}
                            name={`rankLabels.${idx}.to`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-[10px] text-[#94a3b8]">終了</FormLabel>
                                <div className="flex items-center">
                                  <FormControl>
                                    <Input
                                      type="number"
                                      placeholder="4"
                                      className="h-10 w-full px-2 text-sm bg-[#111c2d] text-[#f0f4ff] border-white/[0.08]"
                                      {...field}
                                    />
                                  </FormControl>
                                  <span className="ml-1 text-xs text-[#94a3b8]">位</span>
                                </div>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        <div className="col-span-1" />
                        <div className="col-span-11">
                          <FormField
                            control={form.control}
                            name={`rankLabels.${idx}.color`}
                            render={({ field }) => (
                              <FormItem>
                                <div className="flex flex-wrap gap-1">
                                  {rankLabelColors.map((color) => (
                                    <button
                                      key={color.name}
                                      type="button"
                                      onClick={() => field.onChange(color.name)}
                                      className={`h-6 w-6 rounded-full ${color.bg} ${
                                        field.value === color.name
                                          ? `ring-2 ring-offset-1 ring-offset-gray-900 ${color.border}`
                                          : ""
                                      } transition-all`}
                                      aria-label={color.name}
                                    />
                                  ))}
                                </div>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        <div className="col-span-1 flex items-center justify-start">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => removeRankLabel(idx)}
                            className="text-white hover:bg-white/10"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (rankLabelFields.length >= 5) return;
                        appendRankLabel({ name: "", from: 1, to: 1, color: "green" } as any);
                      }}
                      disabled={rankLabelFields.length >= 5}
                      className="w-full border-white/[0.08] bg-[#0d1520] text-[#f0f4ff] hover:bg-white/5"
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      ラベルを追加
                    </Button>
                  </div>
                </div>
              )}
            </section>
          </form>
        </Form>
      </div>

      {/* 固定保存ボタン */}
      <div
        className="fixed bottom-0 left-0 right-0 z-40 border-t border-white/[0.08] bg-[#08111f] p-4"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="mx-auto w-full max-w-2xl">
          <Button
            type="button"
            onClick={form.handleSubmit(onSubmit)}
            disabled={saving}
            className="h-12 w-full bg-[#1fd760] font-bold text-[#080c14] hover:bg-[#17c054]"
          >
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            変更を保存
          </Button>
        </div>
      </div>
    </div>
  );
}
