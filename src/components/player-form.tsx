"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useFieldArray, useForm } from "react-hook-form";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { useMemo, useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { PlayerPhotoUploader } from "@/components/player-photo-uploader";
import type { SubmitHandler } from "react-hook-form";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";

const POSITIONS = ["GK", "DF", "MF", "FW"] as const;

const DETAILED_POSITIONS = ["ST", "RW", "LW", "AM", "RM", "LM", "CM", "DM", "CB", "RB", "LB", "GK"] as const;
type DetailedPosition = (typeof DETAILED_POSITIONS)[number];

const snsLinkSchema = z
  .string()
  .url({ message: "無効なURLです。" })
  .optional()
  .or(z.literal(""));

const paramItemSchema = z.object({
  label: z
    .string()
    .max(8, { message: "項目名は8文字以内です。" })
    .optional()
    .or(z.literal("")),
  value: z
    .union([z.coerce.number().min(0).max(99), z.nan()])
    .optional()
    .transform((v) => (typeof v === "number" && Number.isFinite(v) ? v : undefined)),
});

const overallSchema = z
  .union([z.coerce.number().min(0).max(99), z.nan()])
  .optional()
  .transform((v) => (typeof v === "number" && Number.isFinite(v) ? v : undefined));

const statNumberSchema = z
  .preprocess((v) => {
    if (v === "" || v == null) return undefined;
    return v;
  }, z.union([z.coerce.number().min(0), z.nan()]).optional())
  .transform((v) => (typeof v === "number" && Number.isFinite(v) ? v : undefined));

const contractEndYearSchema = z
  .preprocess((v) => {
    if (v === "" || v == null) return undefined;
    return v;
  }, z.union([z.coerce.number().int().min(1900), z.nan()]).optional())
  .transform((v) => (typeof v === "number" && Number.isFinite(v) ? v : undefined));

const contractEndMonthSchema = z
  .preprocess((v) => {
    if (v === "" || v == null) return undefined;
    return v;
  }, z.union([z.coerce.number().int().min(1).max(12), z.nan()]).optional())
  .transform((v) => (typeof v === "number" && Number.isFinite(v) ? v : undefined));

const tenureYearsSchema = z
  .preprocess((v) => {
    if (v === "" || v == null) return undefined;
    return v;
  }, z.coerce.number().int().min(0).max(50).optional())
  .transform((v) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : undefined));

const ratingSchema = z
  .preprocess((v) => {
    if (v === "" || v == null) return undefined;
    return v;
  }, z.union([z.coerce.number().min(0).max(10), z.nan()]).optional())
  .transform((v) => (typeof v === "number" && Number.isFinite(v) ? v : undefined));

const manualCompetitionStatSchema = z.object({
  competitionId: z.string().optional().or(z.literal("")),
  matches: statNumberSchema,
  minutes: statNumberSchema,
  goals: statNumberSchema,
  assists: statNumberSchema,
  yellowCards: statNumberSchema,
  redCards: statNumberSchema,
  avgRating: ratingSchema,
});

const formSchema = z.object({
  name: z.string().min(2, { message: "選手名は2文字以上で入力してください。" }),
  number: z.preprocess(
    (v) => {
      if (v === "" || v == null) return undefined;
      return v;
    },
    z.coerce
      .number()
      .int()
      .min(1, { message: "背番号は1以上です。" })
      .max(99, { message: "背番号は99以下です。" })
  ),
  position: z.enum(POSITIONS),
  mainPosition: z.enum(DETAILED_POSITIONS).optional(),
  subPositions: z.array(z.enum(DETAILED_POSITIONS)).max(3).optional(),
  photoUrl: z.string().url({ message: "無効なURLです。" }).optional().or(z.literal('')), 
  height: z.coerce.number().optional(),
  weight: z.coerce.number().optional(),
  preferredFoot: z.enum(["left", "right", "both"]).optional(),
  age: z.coerce.number().int().optional(),
  tenureYears: tenureYearsSchema,
  annualSalary: statNumberSchema,
  annualSalaryCurrency: z.enum(["JPY", "GBP", "EUR"]).optional(),
  contractEndYear: contractEndYearSchema,
  contractEndMonth: contractEndMonthSchema,
  profile: z.string().max(200, { message: "プロフィールは200文字以内です。" }).optional(),
  nationality: z.string().optional(),
  snsLinks: z
    .object({
      x: snsLinkSchema,
      youtube: snsLinkSchema,
      tiktok: snsLinkSchema,
      instagram: snsLinkSchema,
    })
    .optional(),
  params: z
    .object({
      overall: overallSchema,
      items: z.array(paramItemSchema).length(6),
    })
    .optional(),
  manualCompetitionStats: z.array(manualCompetitionStatSchema).optional(),
  teamId: z.string().optional(),
  seasons: z.array(z.string()).optional(),
  isPublished: z.boolean().optional(),
});

export type PlayerFormValues = z.infer<typeof formSchema>;

interface PlayerFormProps {
  onSubmit: (values: PlayerFormValues) => Promise<void>;
  defaultValues?: Partial<PlayerFormValues>;
  defaultSeason?: string;
  ownerUid?: string | null;
}

export function PlayerForm({ onSubmit, defaultValues, defaultSeason, ownerUid }: PlayerFormProps) {
  const [loading, setLoading] = useState(false);
  const [competitions, setCompetitions] = useState<{ id: string; name: string; season?: string }[]>([]);

  const detailedPositionLayout: Array<{ key: DetailedPosition; label: string; grid: string }> = [
    { key: "ST", label: "ST", grid: "col-start-3 row-start-1" },
    { key: "LW", label: "LW", grid: "col-start-1 row-start-1" },
    { key: "RW", label: "RW", grid: "col-start-5 row-start-1" },
    { key: "AM", label: "AM", grid: "col-start-3 row-start-2" },
    { key: "LM", label: "LM", grid: "col-start-1 row-start-3" },
    { key: "CM", label: "CM", grid: "col-start-3 row-start-3" },
    { key: "RM", label: "RM", grid: "col-start-5 row-start-3" },
    { key: "DM", label: "DM", grid: "col-start-3 row-start-4" },
    { key: "LB", label: "LB", grid: "col-start-1 row-start-5" },
    { key: "CB", label: "CB", grid: "col-start-3 row-start-5" },
    { key: "RB", label: "RB", grid: "col-start-5 row-start-5" },
    { key: "GK", label: "GK", grid: "col-start-3 row-start-6" },
  ];

  const normalizeSeason = (s: string): string => {
    const v = (s || "").trim();
    if (!v) return "";
    const replaced = v.replace("/", "-");
    const m = replaced.match(/^(\d{4})[-–](\d{2})$/);
    if (m) return `${m[1]}-${m[2]}`;
    return replaced;
  };

  const baseDefaults: PlayerFormValues = useMemo(
    () => ({
      name: "",
      number: undefined as any,
      position: "MF",
      mainPosition: undefined,
      subPositions: [],
      photoUrl: "",
      height: undefined,
      weight: undefined,
      preferredFoot: undefined,
      age: undefined,
      tenureYears: undefined,
      annualSalary: undefined,
      annualSalaryCurrency: "JPY" as any,
      contractEndYear: undefined,
      contractEndMonth: undefined,
      profile: "",
      nationality: "",
      snsLinks: {
        x: "",
        youtube: "",
        tiktok: "",
        instagram: "",
      },
      params: {
        overall: undefined,
        items: Array.from({ length: 6 }, () => ({ label: "", value: undefined })),
      },
      manualCompetitionStats: [],
      teamId: "",
      seasons: defaultSeason ? [defaultSeason] : [],
      isPublished: true,
    }),
    [defaultSeason]
  );

  const normalizedDefaults: PlayerFormValues = useMemo(
    () => ({
      ...baseDefaults,
      ...(defaultValues as any),
      mainPosition: (defaultValues as any)?.mainPosition ?? (baseDefaults as any).mainPosition,
      subPositions: Array.isArray((defaultValues as any)?.subPositions)
        ? ((defaultValues as any)?.subPositions as any[]).filter((p) => typeof p === "string")
        : ((baseDefaults as any).subPositions ?? []),
      contractEndYear:
        typeof (defaultValues as any)?.contractEndDate === "string" && /^\d{4}-\d{2}$/.test((defaultValues as any).contractEndDate)
          ? Number(String((defaultValues as any).contractEndDate).slice(0, 4))
          : (defaultValues as any)?.contractEndYear,
      contractEndMonth:
        typeof (defaultValues as any)?.contractEndDate === "string" && /^\d{4}-\d{2}$/.test((defaultValues as any).contractEndDate)
          ? Number(String((defaultValues as any).contractEndDate).slice(5, 7))
          : (defaultValues as any)?.contractEndMonth,
      snsLinks: {
        ...(baseDefaults.snsLinks as any),
        ...(((defaultValues as any)?.snsLinks || {}) as any),
      },
      params: {
        ...(baseDefaults.params as any),
        ...(((defaultValues as any)?.params || {}) as any),
        overall:
          typeof (defaultValues as any)?.params?.overall === "number"
            ? (defaultValues as any)?.params?.overall
            : (baseDefaults as any)?.params?.overall,
        items: Array.from({ length: 6 }, (_, i) => {
          const baseItem = (baseDefaults as any)?.params?.items?.[i] ?? { label: "", value: undefined };
          const dvItem = (defaultValues as any)?.params?.items?.[i] ?? {};
          return { ...baseItem, ...dvItem };
        }),
      },
      manualCompetitionStats: Array.isArray((defaultValues as any)?.manualCompetitionStats)
        ? ((defaultValues as any)?.manualCompetitionStats as any[]).map((r) => ({
            competitionId: typeof (r as any)?.competitionId === "string" ? (r as any).competitionId : "",
            matches: typeof (r as any)?.matches === "number" ? (r as any).matches : undefined,
            minutes: typeof (r as any)?.minutes === "number" ? (r as any).minutes : undefined,
            goals: typeof (r as any)?.goals === "number" ? (r as any).goals : undefined,
            assists: typeof (r as any)?.assists === "number" ? (r as any).assists : undefined,
            yellowCards: typeof (r as any)?.yellowCards === "number" ? (r as any).yellowCards : undefined,
            redCards: typeof (r as any)?.redCards === "number" ? (r as any).redCards : undefined,
            avgRating: typeof (r as any)?.avgRating === "number" ? (r as any).avgRating : undefined,
          }))
        : [],
    }),
    [baseDefaults, defaultValues]
  );

  const form = useForm<PlayerFormValues>({
    resolver: zodResolver(formSchema) as any,
    defaultValues: normalizedDefaults,
  });

  useEffect(() => {
    form.reset(normalizedDefaults);
  }, [defaultValues, defaultSeason]);

  useEffect(() => {
    if (!ownerUid) return;
    const fetchCompetitions = async () => {
      const snap = await getDocs(collection(db, `clubs/${ownerUid}/competitions`));
      const comps = snap.docs
        .map((d) => {
          const data = d.data() as any;
          return {
            id: d.id,
            name: (data?.name as string) || d.id,
            season: typeof data?.season === "string" ? data.season : undefined,
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name));
      setCompetitions(comps);
    };
    fetchCompetitions();
  }, [ownerUid]);

  const seasonsWatch = form.watch("seasons") || [];
  const activeSeason = (defaultSeason || seasonsWatch[0] || "").trim();
  const activeSeasonNorm = normalizeSeason(activeSeason);
  const filteredCompetitions = useMemo(() => {
    if (!activeSeasonNorm) return competitions;
    return competitions.filter((c) => normalizeSeason(c.season || "") === activeSeasonNorm);
  }, [competitions, activeSeasonNorm]);

  const items = form.watch("params.items") || [];
  const manualOverall = form.watch("params.overall");
  const labels = Array.from({ length: 6 }, (_, i) => (items?.[i]?.label || "").slice(0, 8));
  const values = Array.from({ length: 6 }, (_, i) => {
    const v = items?.[i]?.value;
    return typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(99, v)) : 0;
  });
  const computedOverall = (() => {
    const nums = Array.from({ length: 6 }, (_, i) => {
      const v = items?.[i]?.value;
      return typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(99, v)) : undefined;
    }).filter((v): v is number => typeof v === "number");
    if (nums.length === 0) return 0;
    return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
  })();

  const overall =
    typeof manualOverall === "number" && Number.isFinite(manualOverall)
      ? Math.max(0, Math.min(99, manualOverall))
      : computedOverall;

  const statsFieldArray = useFieldArray({
    control: form.control,
    name: "manualCompetitionStats",
  });

  const HexChart = ({ labels, values, overall }: { labels: string[]; values: number[]; overall: number }) => {
    const size = 240;
    const pad = 44;
    const c = size / 2;
    const r = 86;
    const max = 99;
    const angles = Array.from({ length: 6 }, (_, i) => (-Math.PI / 2) + (i * (Math.PI * 2)) / 6);
    const outerPoints = angles
      .map((a) => `${c + r * Math.cos(a)},${c + r * Math.sin(a)}`)
      .join(" ");

    const valuePoints = angles
      .map((a, i) => {
        const rr = r * (Math.max(0, Math.min(max, values[i] ?? 0)) / max);
        return `${c + rr * Math.cos(a)},${c + rr * Math.sin(a)}`;
      })
      .join(" ");

    const labelPoints = angles.map((a) => {
      const rr = r + 36;
      return {
        x: c + rr * Math.cos(a),
        y: c + rr * Math.sin(a),
        anchor: Math.abs(Math.cos(a)) < 0.2 ? "middle" : Math.cos(a) > 0 ? "start" : "end",
      } as const;
    });

    return (
      <svg
        width="100%"
        viewBox={`${-pad} ${-pad} ${size + pad * 2} ${size + pad * 2}`}
        className="max-w-[360px]"
      >
        <polygon points={outerPoints} fill="none" stroke="#E5E7EB" strokeWidth="2" />
        {[0.2, 0.4, 0.6, 0.8].map((k) => (
          <polygon
            key={k}
            points={angles
              .map((a) => {
                const rr = r * k;
                return `${c + rr * Math.cos(a)},${c + rr * Math.sin(a)}`;
              })
              .join(" ")}
            fill="none"
            stroke="#F3F4F6"
            strokeWidth="2"
          />
        ))}
        {angles.map((a, idx) => (
          <line
            key={idx}
            x1={c}
            y1={c}
            x2={c + r * Math.cos(a)}
            y2={c + r * Math.sin(a)}
            stroke="#F3F4F6"
            strokeWidth="2"
          />
        ))}
        <polygon points={valuePoints} fill="rgba(37,99,235,0.25)" stroke="#2563EB" strokeWidth="2" />
        <text x={c} y={c - 6} textAnchor="middle" fontSize="12" fill="#6B7280">
          総合
        </text>
        <text x={c} y={c + 24} textAnchor="middle" fontSize="32" fontWeight="700" fill="#111827">
          {overall}
        </text>
        {labelPoints.map((p, i) => (
          <text
            key={i}
            x={p.x}
            y={p.y}
            textAnchor={p.anchor}
            dominantBaseline="middle"
            fontSize="11"
            fill="#111827"
          >
            {(labels[i] || "").slice(0, 8) || `項目${i + 1}`}
          </text>
        ))}
      </svg>
    );
  };

  const handleSubmit: SubmitHandler<PlayerFormValues> = async (values) => {
    setLoading(true);
    const cleaned: PlayerFormValues = {
      ...values,
      mainPosition: values.mainPosition,
      subPositions: Array.isArray(values.subPositions) ? values.subPositions.slice(0, 3) : [],
      manualCompetitionStats: Array.isArray(values.manualCompetitionStats)
        ? values.manualCompetitionStats
            .filter((r) => typeof r?.competitionId === "string" && r.competitionId.trim().length > 0)
            .map((r) => ({
              competitionId: r.competitionId,
              matches: r.matches,
              minutes: r.minutes,
              goals: r.goals,
              assists: r.assists,
              yellowCards: r.yellowCards,
              redCards: r.redCards,
              avgRating: r.avgRating,
            }))
        : [],
    };
    await onSubmit(cleaned);
    setLoading(false);
  };

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(handleSubmit)}
        className="space-y-4 pb-24 max-h-[80vh] overflow-y-auto"
      >
        <Tabs defaultValue="profile" className="space-y-4">
          <TabsList>
            <TabsTrigger value="profile">プロフィール</TabsTrigger>
            <TabsTrigger value="params">パラメーター</TabsTrigger>
            <TabsTrigger value="stats">成績</TabsTrigger>
          </TabsList>
          <TabsContent value="profile" className="space-y-4">
            <FormField
              control={form.control}
              name="photoUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>選手写真</FormLabel>
                  <FormControl>
                    <PlayerPhotoUploader value={field.value || ""} onChange={field.onChange} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>選手名</FormLabel>
                    <FormControl>
                      <Input placeholder="選手名" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="number"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>背番号</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        inputMode="numeric"
                        placeholder="背番号"
                        value={(field.value ?? "") as any}
                        onChange={(e) => field.onChange(e.target.value === "" ? undefined : Number(e.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="position"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>ポジション</FormLabel>
                    <FormControl>
                      <Select value={field.value as any} onValueChange={field.onChange as any}>
                        <SelectTrigger>
                          <SelectValue placeholder="選択" />
                        </SelectTrigger>
                        <SelectContent>
                          {POSITIONS.map((p) => (
                            <SelectItem key={p} value={p}>
                              {p}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormItem className="md:col-span-2">
                <FormLabel>適正ポジション（メイン1 / サブ最大3）</FormLabel>
                <FormControl>
                  <div className="rounded-lg border p-4">
                    <div className="grid grid-cols-5 grid-rows-6 gap-3 max-w-[520px] mx-auto">
                      {detailedPositionLayout.map((p) => {
                        const main = form.watch("mainPosition") as DetailedPosition | undefined;
                        const subs = (form.watch("subPositions") || []) as DetailedPosition[];
                        const isMain = main === p.key;
                        const isSub = subs.includes(p.key);
                        const selected = isMain || isSub;

                        const onToggle = () => {
                          const currentMain = (form.getValues("mainPosition") as DetailedPosition | undefined) ?? undefined;
                          const currentSubs = ((form.getValues("subPositions") as DetailedPosition[] | undefined) ?? []).filter(Boolean);
                          const isMainNow = currentMain === p.key;
                          const isSubNow = currentSubs.includes(p.key);

                          if (isMainNow) {
                            form.setValue("mainPosition", undefined as any, { shouldDirty: true, shouldTouch: true, shouldValidate: true });
                            return;
                          }

                          if (isSubNow) {
                            const next = currentSubs.filter((x) => x !== p.key);
                            form.setValue("subPositions", next as any, { shouldDirty: true, shouldTouch: true, shouldValidate: true });
                            return;
                          }

                          if (currentMain == null) {
                            form.setValue("mainPosition", p.key as any, { shouldDirty: true, shouldTouch: true, shouldValidate: true });
                            return;
                          }

                          if (currentSubs.length >= 3) {
                            return;
                          }

                          form.setValue("subPositions", [...currentSubs, p.key] as any, { shouldDirty: true, shouldTouch: true, shouldValidate: true });
                        };

                        const baseClass = "relative select-none rounded-md border text-sm font-semibold h-12 flex items-center justify-center transition-colors";
                        const colorClass = isMain
                          ? "bg-rose-500/90 text-white border-rose-500"
                          : isSub
                            ? "bg-rose-500/25 text-foreground border-rose-500/40"
                            : "bg-muted/30 hover:bg-muted/50";
                        const disabledClass = !selected && (form.watch("mainPosition") != null) && ((form.watch("subPositions") || []).length >= 3)
                          ? "opacity-60"
                          : "";

                        return (
                          <button
                            key={p.key}
                            type="button"
                            onClick={onToggle}
                            className={`${p.grid} ${baseClass} ${colorClass} ${disabledClass}`}
                            aria-pressed={selected}
                          >
                            <span className="text-base tracking-wide">{p.label}</span>
                            {selected && (
                              <span className="absolute top-1 right-1 text-[10px] font-bold">
                                {isMain ? "MAIN" : "SUB"}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>

                    <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                      <div className="rounded-md bg-muted/30 p-3">
                        <div className="text-xs text-muted-foreground">メイン</div>
                        <div className="font-semibold">
                          {(form.watch("mainPosition") as any) || "未選択"}
                        </div>
                      </div>
                      <div className="rounded-md bg-muted/30 p-3">
                        <div className="text-xs text-muted-foreground">サブ</div>
                        <div className="font-semibold">
                          {((form.watch("subPositions") as any[]) || []).length > 0
                            ? ((form.watch("subPositions") as any[]) || []).join(", ")
                            : "未選択"}
                        </div>
                      </div>
                    </div>
                  </div>
                </FormControl>
              </FormItem>

              <FormField
                control={form.control}
                name="nationality"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>国籍</FormLabel>
                    <FormControl>
                      <Input placeholder="例: 日本" {...field} value={(field.value as any) ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="height"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>身長 (cm)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="180"
                        {...field}
                        value={(field.value ?? "") as any}
                        onChange={(e) => field.onChange(e.target.value === "" ? undefined : Number(e.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="weight"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>体重 (kg)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="75"
                        {...field}
                        value={(field.value ?? "") as any}
                        onChange={(e) => field.onChange(e.target.value === "" ? undefined : Number(e.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="preferredFoot"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>利き足</FormLabel>
                    <FormControl>
                      <Select value={(field.value as any) ?? ""} onValueChange={(v) => field.onChange(v === "" ? undefined : v)}>
                        <SelectTrigger>
                          <SelectValue placeholder="選択" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="left">左</SelectItem>
                          <SelectItem value="right">右</SelectItem>
                          <SelectItem value="both">両</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="age"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>年齢</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="25"
                        {...field}
                        value={(field.value ?? "") as any}
                        onChange={(e) => field.onChange(e.target.value === "" ? undefined : Number(e.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="tenureYears"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>在籍年数</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        inputMode="numeric"
                        placeholder="0"
                        min="0"
                        max="50"
                        {...field}
                        value={(field.value ?? "") as any}
                        onChange={(e) => {
                          const value = e.target.value;
                          if (value === "" || value === "-") {
                            field.onChange(undefined);
                          } else {
                            const num = Number(value);
                            field.onChange(num >= 0 ? num : undefined);
                          }
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="annualSalary"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>年俸</FormLabel>
                    <FormControl>
                      <div className="flex gap-2">
                        <FormField
                          control={form.control}
                          name="annualSalaryCurrency"
                          render={({ field: currencyField }) => (
                            <Select value={(currencyField.value || "JPY") as any} onValueChange={currencyField.onChange as any}>
                              <FormControl>
                                <SelectTrigger className="w-24">
                                  <SelectValue placeholder="通貨" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="JPY">￥</SelectItem>
                                <SelectItem value="GBP">￡</SelectItem>
                                <SelectItem value="EUR">€</SelectItem>
                              </SelectContent>
                            </Select>
                          )}
                        />
                        <Input
                          type="number"
                          inputMode="numeric"
                          placeholder="例: 10000"
                          min="0"
                          step="1"
                          value={(field.value ?? "") as any}
                          onChange={(e) => {
                            const value = e.target.value;
                            if (value === "" || value === "-") {
                              field.onChange(undefined);
                            } else {
                              const num = Number(value);
                              field.onChange(num >= 0 ? num : undefined);
                            }
                          }}
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="contractEndYear"
                render={({ field }) => {
                  const currentYear = new Date().getFullYear();
                  const years = Array.from({ length: 15 }, (_, i) => currentYear + i);
                  return (
                    <FormItem>
                      <FormLabel>契約満了日</FormLabel>
                      <FormControl>
                        <div className="grid grid-cols-2 gap-2">
                          <Select
                            value={field.value != null ? String(field.value) : ""}
                            onValueChange={(v) => field.onChange(v === "" ? undefined : Number(v))}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="年" />
                            </SelectTrigger>
                            <SelectContent>
                              {years.map((y) => (
                                <SelectItem key={y} value={String(y)}>
                                  {y}年
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>

                          <FormField
                            control={form.control}
                            name="contractEndMonth"
                            render={({ field: monthField }) => (
                              <Select
                                value={monthField.value != null ? String(monthField.value) : ""}
                                onValueChange={(v) => monthField.onChange(v === "" ? undefined : Number(v))}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="月" />
                                </SelectTrigger>
                                <SelectContent>
                                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                                    <SelectItem key={m} value={String(m)}>
                                      {m}月
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  );
                }}
              />
            </div>
            <FormField
              control={form.control}
              name="profile"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>プロフィール</FormLabel>
                  <FormControl>
                    <Textarea placeholder="選手の経歴や特徴など" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="space-y-3 rounded-lg border p-3">
              <div className="space-y-0.5">
                <FormLabel>SNSリンク</FormLabel>
                <p className="text-xs text-muted-foreground">入力したSNSのみHPの選手詳細に表示されます。</p>
              </div>
              <FormField
                control={form.control}
                name="snsLinks.x"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>X</FormLabel>
                    <FormControl>
                      <Input placeholder="https://x.com/..." {...field} value={(field.value as any) ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="snsLinks.youtube"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>YouTube</FormLabel>
                    <FormControl>
                      <Input placeholder="https://www.youtube.com/..." {...field} value={(field.value as any) ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="snsLinks.tiktok"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>TikTok</FormLabel>
                    <FormControl>
                      <Input placeholder="https://www.tiktok.com/@..." {...field} value={(field.value as any) ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="snsLinks.instagram"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Instagram</FormLabel>
                    <FormControl>
                      <Input placeholder="https://www.instagram.com/..." {...field} value={(field.value as any) ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="isPublished"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                  <div className="space-y-0.5">
                    <FormLabel>HPで表示する</FormLabel>
                    <p className="text-xs text-muted-foreground">
                      OFF にすると、この選手はHPの選手一覧には表示されません。
                    </p>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value ?? true}
                      onCheckedChange={(checked) => field.onChange(checked)}
                      className="data-[state=checked]:bg-emerald-500 data-[state=unchecked]:bg-gray-300"
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </TabsContent>

          <TabsContent value="stats" className="space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-medium">大会別成績（手入力）</div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    statsFieldArray.append({
                      competitionId: "",
                      matches: undefined,
                      minutes: undefined,
                      goals: undefined,
                      assists: undefined,
                      yellowCards: undefined,
                      redCards: undefined,
                      avgRating: undefined,
                    })
                  }
                >
                  追加
                </Button>
              </div>

              {statsFieldArray.fields.length === 0 && (
                <div className="text-sm text-muted-foreground">未入力（自動集計が表示されます）</div>
              )}

              <div className="space-y-4">
                {statsFieldArray.fields.map((f, idx) => (
                  <div key={f.id} className="rounded-lg border p-3 space-y-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <FormField
                        control={form.control}
                        name={`manualCompetitionStats.${idx}.competitionId` as const}
                        render={({ field }) => (
                          <FormItem className="flex-1">
                            <FormLabel>大会</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value || ""}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="大会を選択" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {(() => {
                                  const selectedId = (field.value || "").trim();
                                  const selected = selectedId ? competitions.find((c) => c.id === selectedId) : undefined;
                                  const options = selected && !filteredCompetitions.some((c) => c.id === selected.id)
                                    ? [selected, ...filteredCompetitions]
                                    : filteredCompetitions;
                                  return options.map((c) => (
                                    <SelectItem key={c.id} value={c.id}>
                                      {c.name}
                                    </SelectItem>
                                  ));
                                })()}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <Button
                        type="button"
                        variant="outline"
                        className="w-full sm:w-auto border-destructive text-destructive hover:bg-destructive/10"
                        onClick={() => {
                          const ok = window.confirm('この手入力成績を削除して、自動集計に戻しますか？');
                          if (!ok) return;
                          statsFieldArray.remove(idx);
                        }}
                      >
                        自動集計に戻す
                      </Button>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <FormField
                        control={form.control}
                        name={`manualCompetitionStats.${idx}.matches` as const}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>試合数</FormLabel>
                            <FormControl>
                              <Input
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                placeholder="0"
                                value={field.value ?? ""}
                                onChange={(e) => field.onChange(e.target.value)}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name={`manualCompetitionStats.${idx}.minutes` as const}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>時間</FormLabel>
                            <FormControl>
                              <Input
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                placeholder="0"
                                value={field.value ?? ""}
                                onChange={(e) => field.onChange(e.target.value)}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name={`manualCompetitionStats.${idx}.goals` as const}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>ゴール</FormLabel>
                            <FormControl>
                              <Input
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                placeholder="0"
                                value={field.value ?? ""}
                                onChange={(e) => field.onChange(e.target.value)}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name={`manualCompetitionStats.${idx}.assists` as const}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>アシスト</FormLabel>
                            <FormControl>
                              <Input
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                placeholder="0"
                                value={field.value ?? ""}
                                onChange={(e) => field.onChange(e.target.value)}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name={`manualCompetitionStats.${idx}.yellowCards` as const}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>警告</FormLabel>
                            <FormControl>
                              <Input
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                placeholder="0"
                                value={field.value ?? ""}
                                onChange={(e) => field.onChange(e.target.value)}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name={`manualCompetitionStats.${idx}.redCards` as const}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>退場</FormLabel>
                            <FormControl>
                              <Input
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                placeholder="0"
                                value={field.value ?? ""}
                                onChange={(e) => field.onChange(e.target.value)}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name={`manualCompetitionStats.${idx}.avgRating` as const}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>評価点</FormLabel>
                            <FormControl>
                              <Input
                                type="text"
                                inputMode="decimal"
                                step="0.1"
                                placeholder="6.5"
                                value={field.value ?? ""}
                                onChange={(e) => field.onChange(e.target.value)}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>
          <TabsContent value="params" className="space-y-4">
            <FormField
              control={form.control}
              name="params.overall"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>総合値</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      placeholder="未入力なら自動計算"
                      {...field}
                      value={(field.value ?? "") as any}
                      onChange={(e) => field.onChange(e.target.value === "" ? undefined : Number(e.target.value))}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex flex-col items-center gap-4 rounded-lg border p-4">
              <HexChart labels={labels} values={values} overall={overall} />
            </div>
            <div className="space-y-3 rounded-lg border p-4">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="grid grid-cols-3 gap-3 items-end">
                  <FormField
                    control={form.control}
                    name={`params.items.${i}.label` as any}
                    render={({ field }) => (
                      <FormItem className="col-span-2">
                        <FormLabel>項目名{i + 1}</FormLabel>
                        <FormControl>
                          <Input
                            placeholder={`例: スピード`}
                            {...field}
                            value={(field.value as any) ?? ""}
                            onChange={(e) => field.onChange((e.target.value || "").slice(0, 8))}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name={`params.items.${i}.value` as any}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>数値</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            placeholder="0-99"
                            {...field}
                            value={(field.value ?? "") as any}
                            onChange={(e) => field.onChange(e.target.value === "" ? undefined : Number(e.target.value))}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
        <Button
          type="submit"
          disabled={loading}
          className="w-full bg-emerald-600 text-white hover:bg-emerald-700"
        >
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          保存
        </Button>
      </form>
    </Form>
  );
}
