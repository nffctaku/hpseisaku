/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useFieldArray, useForm } from "react-hook-form";
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
import { useMemo, useState, useEffect, useId } from "react";
import { Loader2, X } from "lucide-react";
import { PlayerPhotoUploader } from "@/components/player-photo-uploader";
import type { SubmitHandler } from "react-hook-form";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { toast } from "sonner";
import { DialogTitle } from "@/components/ui/dialog";

import {
  BasicInfoSection,
  ContractInfoSection,
  DetailedPositionsSection,
  ProfileSection,
  SnsLinksSection,
} from "./player-form-sections";

import {
  POSITIONS,
  type PlayerFormValues,
  formSchema,
} from "./player-form.schema";

interface PlayerFormProps {
  onSubmit: (values: PlayerFormValues) => Promise<void>;
  defaultValues?: Partial<PlayerFormValues>;
  defaultSeason?: string;
  ownerUid?: string | null;
  isEdit?: boolean;
  onDirtyChange?: (dirty: boolean) => void;
  onClose?: () => void;
}

export function PlayerForm({
  onSubmit,
  defaultValues,
  defaultSeason,
  ownerUid,
  isEdit = false,
  onDirtyChange,
  onClose,
}: PlayerFormProps) {
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"profile" | "params" | "stats">("profile");
  const [openSections, setOpenSections] = useState({
    basic: false,
    contract: false,
    positions: false,
    profile: false,
    sns: false,
  });
  const [competitions, setCompetitions] = useState<{ id: string; name: string; season?: string }[]>([]);

  const formId = useId();

  const normalizeSeason = (s: string): string => {
    const v = (s || "").trim();
    if (!v) return "";
    const replaced = v.replace("/", "-");
    const m = replaced.match(/^(\d{4})[-–](\d{2})$/);
    if (m) return `${m[1]}-${m[2]}`;
    return replaced;
  };

  const parseSeasonStartYear = (season: string): number | null => {
    const m = String(season || "").trim().match(/^(\d{4})[/-](\d{2})$/);
    if (!m) return null;
    const year = Number(m[1]);
    return Number.isFinite(year) ? year : null;
  };

  const formatSeason = (startYear: number): string => `${startYear}/${String((startYear + 1) % 100).padStart(2, "0")}`;

  const baseDefaults: PlayerFormValues = useMemo(
    () => ({
      name: "",
      subName: "",
      number: undefined as any,
      position: "MF" as any,
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
      showParamsOnPublic: true,
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
        typeof (defaultValues as any)?.contractEndDate === "string" && /^\d{4}-\d{2}$/.test((defaultValues as any)?.contractEndDate)
          ? Number(String((defaultValues as any)?.contractEndDate).slice(0, 4))
          : (defaultValues as any)?.contractEndYear,
      contractEndMonth:
        typeof (defaultValues as any)?.contractEndDate === "string" && /^\d{4}-\d{2}$/.test((defaultValues as any)?.contractEndDate)
          ? Number(String((defaultValues as any)?.contractEndDate).slice(5, 7))
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
  }, [form, normalizedDefaults]);

  useEffect(() => {
    onDirtyChange?.(form.formState.isDirty);
  }, [form.formState.isDirty, onDirtyChange]);

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

  const seasonsList = useMemo(() => {
    const seasonSet = new Set<string>();
    competitions.forEach((c) => {
      if (c.season && typeof c.season === "string" && c.season.trim() !== "") {
        seasonSet.add(c.season);
      }
    });
    if (defaultSeason) seasonSet.add(defaultSeason);
    const activeStartYear = parseSeasonStartYear(defaultSeason || "") ?? new Date().getFullYear();
    const minStartYear = Math.min(activeStartYear - 30, 1990);
    const maxStartYear = Math.max(activeStartYear + 5, new Date().getFullYear() + 5);
    for (let year = maxStartYear; year >= minStartYear; year -= 1) {
      seasonSet.add(formatSeason(year));
    }
    return Array.from(seasonSet).sort((a, b) => b.localeCompare(a));
  }, [competitions, defaultSeason]);

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

  const FIELD_ORDER = [
    "name",
    "subName",
    "number",
    "position",
    "photoUrl",
    "mainPosition",
    "subPositions",
    "nationality",
    "height",
    "weight",
    "preferredFoot",
    "dateOfBirth",
    "joinedSeason",
    "annualSalary",
    "annualSalaryCurrency",
    "contractEndYear",
    "contractEndMonth",
    "profile",
    "snsLinks.x",
    "snsLinks.youtube",
    "snsLinks.tiktok",
    "snsLinks.instagram",
    "showParamsOnPublic",
    "params.overall",
    "params.items",
    "manualCompetitionStats",
  ];

  const flattenErrors = (errors: any, prefix = ""): string[] => {
    if (!errors || typeof errors !== "object") return [];
    if (Array.isArray(errors)) {
      const out: string[] = [];
      errors.forEach((item, idx) => {
        out.push(...flattenErrors(item, prefix ? `${prefix}[${idx}]` : `${idx}`));
      });
      return out;
    }
    if (errors.message) return prefix ? [prefix] : [];
    const out: string[] = [];
    Object.keys(errors).forEach((key) => {
      const next = prefix ? `${prefix}.${key}` : key;
      out.push(...flattenErrors(errors[key], next));
    });
    return out;
  };

  const findFirstErrorPath = (errors: any): string | null => {
    const flat = flattenErrors(errors);
    if (flat.length === 0) return null;
    for (const prefix of FIELD_ORDER) {
      const found = flat.find((p) => p === prefix || p.startsWith(`${prefix}.`) || p.startsWith(`${prefix}[`));
      if (found) return found;
    }
    return flat[0];
  };

  const getSectionForPath = (path: string): { tab: "profile" | "params" | "stats"; section?: keyof typeof openSections } | null => {
    if (path.startsWith("params") || path === "showParamsOnPublic") return { tab: "params" };
    if (path.startsWith("manualCompetitionStats")) return { tab: "stats" };
    if (path.startsWith("snsLinks")) return { tab: "profile", section: "sns" };
    const sectionMap: Record<string, keyof typeof openSections> = {
      nationality: "basic",
      height: "basic",
      weight: "basic",
      preferredFoot: "basic",
      dateOfBirth: "basic",
      joinedSeason: "basic",
      annualSalary: "contract",
      annualSalaryCurrency: "contract",
      contractEndYear: "contract",
      contractEndMonth: "contract",
      mainPosition: "positions",
      subPositions: "positions",
      profile: "profile",
    };
    if (sectionMap[path]) return { tab: "profile", section: sectionMap[path] };
    return { tab: "profile" };
  };

  const onError = (errors: any) => {
    const first = findFirstErrorPath(errors);
    if (first) {
      const mapped = getSectionForPath(first);
      if (mapped) {
        setActiveTab(mapped.tab);
        if (mapped.section) {
          const section = mapped.section;
          setOpenSections((s) => ({ ...s, [section]: true }));
        }
      }
    }
    toast.error("入力内容を確認してください。");
    setTimeout(() => {
      const el = document.querySelector('[aria-invalid="true"]');
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 150);
  };

  const handleSubmit: SubmitHandler<PlayerFormValues> = async (values) => {
    setLoading(true);
    try {
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
    } catch (e) {
      console.error("[PlayerForm] submit failed", e);
      throw e;
    } finally {
      setLoading(false);
    }
  };

  const HexChart = ({ labels, values, overall }: { labels: string[]; values: number[]; overall: number }) => {
    const size = 240;
    const pad = 44;
    const c = size / 2;
    const r = 86;
    const max = 99;
    const angles = Array.from({ length: 6 }, (_, i) => (-Math.PI / 2) + (i * (Math.PI * 2)) / 6);
    const outerPoints = angles.map((a) => `${c + r * Math.cos(a)},${c + r * Math.sin(a)}`).join(" ");
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
      <svg width="100%" viewBox={`${-pad} ${-pad} ${size + pad * 2} ${size + pad * 2}`} className="max-w-[360px]">
        <polygon points={outerPoints} fill="none" stroke="#334155" strokeWidth="2" />
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
            stroke="#1e293b"
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
            stroke="#1e293b"
            strokeWidth="2"
          />
        ))}
        <polygon points={valuePoints} fill="rgba(31,215,96,0.25)" stroke="#1FD760" strokeWidth="2" />
        <text x={c} y={c - 6} textAnchor="middle" fontSize="12" fill="#A8B5C8">
          総合
        </text>
        <text x={c} y={c + 24} textAnchor="middle" fontSize="32" fontWeight="700" fill="#F1F5F9">
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
            fill="#A8B5C8"
          >
            {(labels[i] || "").slice(0, 8) || `項目${i + 1}`}
          </text>
        ))}
      </svg>
    );
  };

  return (
    <Form {...form}>
      <form
        id={formId}
        onSubmit={form.handleSubmit(handleSubmit, onError)}
        className="grid h-full grid-rows-[auto_1fr_auto] overflow-hidden"
      >
        <header className="flex items-center justify-between border-b border-[#334155] bg-[#0C1422] px-4 py-3">
          <DialogTitle asChild>
            <h2 className="text-lg font-semibold text-[#F1F5F9]">{isEdit ? "選手を編集" : "選手を追加"}</h2>
          </DialogTitle>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="閉じる"
              className="rounded-full p-2 text-[#A8B5C8] transition hover:bg-white/10 hover:text-[#F1F5F9] focus-visible:ring-2 focus-visible:ring-[#1FD760] focus-visible:outline-none"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </header>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="flex min-h-0 flex-col">
          <TabsList className="grid h-11 w-full shrink-0 grid-cols-3 gap-1 bg-[#172334] p-1">
            <TabsTrigger
              value="profile"
              className="text-sm data-[state=active]:bg-[#1FD760] data-[state=active]:text-[#08111F] data-[state=inactive]:text-[#A8B5C8]"
            >
              プロフィール
            </TabsTrigger>
            <TabsTrigger
              value="params"
              className="text-sm data-[state=active]:bg-[#1FD760] data-[state=active]:text-[#08111F] data-[state=inactive]:text-[#A8B5C8]"
            >
              パラメーター
            </TabsTrigger>
            <TabsTrigger
              value="stats"
              className="text-sm data-[state=active]:bg-[#1FD760] data-[state=active]:text-[#08111F] data-[state=inactive]:text-[#A8B5C8]"
            >
              成績
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto px-4 py-4" role="region" aria-label="入力エリア">
            <TabsContent value="profile" className="space-y-4">
              <FormField
                control={form.control}
                name="photoUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-[#F1F5F9]">選手写真</FormLabel>
                    <FormControl>
                      <PlayerPhotoUploader value={field.value || ""} onChange={field.onChange} />
                    </FormControl>
                    <FormMessage className="text-[#FCA5A5]" />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-[#F1F5F9]">
                      選手名
                      <span className="ml-1 text-[10px] font-medium text-[#FCA5A5]">必須</span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder="選手名"
                        {...field}
                        className="h-11 bg-[#172334] border-[#334155] text-[#F1F5F9] placeholder:text-slate-500"
                      />
                    </FormControl>
                    <FormMessage className="text-[#FCA5A5]" />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name="number"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-[#F1F5F9]">
                        背番号
                        <span className="ml-1 text-[10px] font-medium text-[#FCA5A5]">必須</span>
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          placeholder="背番号"
                          value={(field.value ?? "") as any}
                          onChange={(e) => field.onChange(e.target.value)}
                          className="h-11 bg-[#172334] border-[#334155] text-[#F1F5F9] placeholder:text-slate-500"
                        />
                      </FormControl>
                      <FormMessage className="text-[#FCA5A5]" />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="position"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-[#F1F5F9]">
                        ポジション
                        <span className="ml-1 text-[10px] font-medium text-[#FCA5A5]">必須</span>
                      </FormLabel>
                      <FormControl>
                        <Select value={field.value as any} onValueChange={field.onChange as any}>
                          <SelectTrigger className="h-11 w-full bg-[#172334] border-[#334155] text-[#F1F5F9]">
                            <SelectValue placeholder="選択" />
                          </SelectTrigger>
                          <SelectContent className="bg-[#172334] border-[#334155] text-[#F1F5F9]">
                            {POSITIONS.map((p) => (
                              <SelectItem key={p} value={p}>
                                {p}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormControl>
                      <FormMessage className="text-[#FCA5A5]" />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="subName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-[#F1F5F9]">
                      サブネーム
                      <span className="ml-1 text-[10px] font-medium text-[#A8B5C8]">任意</span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder="例: フリガナなど"
                        {...field}
                        value={(field.value as any) ?? ""}
                        className="h-11 bg-[#172334] border-[#334155] text-[#F1F5F9] placeholder:text-slate-500"
                      />
                    </FormControl>
                    <FormMessage className="text-[#FCA5A5]" />
                  </FormItem>
                )}
              />

              <BasicInfoSection
                form={form}
                open={openSections.basic}
                onOpenChange={(v: boolean) => setOpenSections((s) => ({ ...s, basic: v }))}
                seasons={seasonsList}
              />
              <ContractInfoSection
                form={form}
                open={openSections.contract}
                onOpenChange={(v: boolean) => setOpenSections((s) => ({ ...s, contract: v }))}
              />
              <DetailedPositionsSection
                form={form}
                open={openSections.positions}
                onOpenChange={(v: boolean) => setOpenSections((s) => ({ ...s, positions: v }))}
              />
              <ProfileSection
                form={form}
                open={openSections.profile}
                onOpenChange={(v: boolean) => setOpenSections((s) => ({ ...s, profile: v }))}
              />
              <SnsLinksSection
                form={form}
                open={openSections.sns}
                onOpenChange={(v: boolean) => setOpenSections((s) => ({ ...s, sns: v }))}
              />
            </TabsContent>

            <TabsContent value="params" className="space-y-4">
              <FormField
                control={form.control}
                name="showParamsOnPublic"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-xl border border-[#334155] bg-[#172334] p-3">
                    <div className="space-y-0.5">
                      <FormLabel className="text-[#F1F5F9]">HPでパラメーターを表示</FormLabel>
                    </div>
                    <FormControl>
                      <Switch checked={field.value ?? true} onCheckedChange={field.onChange} className="data-[state=checked]:bg-[#1FD760] data-[state=unchecked]:bg-slate-600" />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="params.overall"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-[#F1F5F9]">総合値</FormLabel>
                    <FormControl>
                      <Input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        placeholder="未入力なら自動計算"
                        {...field}
                        value={(field.value ?? "") as any}
                        onChange={(e) => field.onChange(e.target.value)}
                        className="h-11 bg-[#172334] border-[#334155] text-[#F1F5F9] placeholder:text-slate-500"
                      />
                    </FormControl>
                    <FormMessage className="text-[#FCA5A5]" />
                  </FormItem>
                )}
              />
              <div className="flex flex-col items-center gap-4 rounded-xl border border-[#334155] bg-[#172334] p-4">
                <HexChart labels={labels} values={values} overall={overall} />
              </div>
              <div className="space-y-3 rounded-xl border border-[#334155] bg-[#172334] p-4">
                {Array.from({ length: 6 }, (_, i) => (
                  <div key={i} className="grid grid-cols-3 gap-3 items-end">
                    <FormField
                      control={form.control}
                      name={`params.items.${i}.label` as any}
                      render={({ field }) => (
                        <FormItem className="col-span-2">
                          <FormLabel className="text-[#F1F5F9]">項目名{i + 1}</FormLabel>
                          <FormControl>
                            <Input
                              placeholder={`例: スピード`}
                              {...field}
                              value={(field.value as any) ?? ""}
                              onChange={(e) => field.onChange((e.target.value || "").slice(0, 8))}
                              className="h-11 bg-[#172334] border-[#334155] text-[#F1F5F9] placeholder:text-slate-500"
                            />
                          </FormControl>
                          <FormMessage className="text-[#FCA5A5]" />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`params.items.${i}.value` as any}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-[#F1F5F9]">数値</FormLabel>
                          <FormControl>
                            <Input
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              placeholder="0-99"
                              {...field}
                              value={(field.value ?? "") as any}
                              onChange={(e) => field.onChange(e.target.value)}
                              className="h-11 bg-[#172334] border-[#334155] text-[#F1F5F9] placeholder:text-slate-500"
                            />
                          </FormControl>
                          <FormMessage className="text-[#FCA5A5]" />
                        </FormItem>
                      )}
                    />
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="stats" className="space-y-4">
              <div className="rounded-xl border border-[#334155] bg-[#172334] p-3 text-sm text-[#A8B5C8]">
                <p>公開ページには手入力の数値が優先的に表示されます。試合イベントからの記録は引き続き行われており、「自動集計に戻す」を押せばいつでも元に戻せます。</p>
              </div>
              <div className="space-y-3">
                {statsFieldArray.fields.length === 0 && (
                  <div className="text-sm text-[#A8B5C8]">未入力（自動集計が表示されます）</div>
                )}
                {statsFieldArray.fields.map((f, idx) => (
                  <div key={f.id} className="rounded-xl border border-[#334155] bg-[#172334] p-3 space-y-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <FormField
                        control={form.control}
                        name={`manualCompetitionStats.${idx}.competitionId` as const}
                        render={({ field }) => (
                          <FormItem className="flex-1 min-w-0">
                            <FormLabel className="text-[#F1F5F9]">大会</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value || ""}>
                              <FormControl>
                                <SelectTrigger className="h-11 w-full bg-[#172334] border-[#334155] text-[#F1F5F9]">
                                  <SelectValue placeholder="大会を選択" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent className="bg-[#172334] border-[#334155] text-[#F1F5F9]">
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
                            <FormMessage className="text-[#FCA5A5]" />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <FormField
                        control={form.control}
                        name={`manualCompetitionStats.${idx}.matches` as const}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-[#F1F5F9]">試合数</FormLabel>
                            <FormControl>
                              <Input
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                placeholder="0"
                                value={field.value ?? ""}
                                onChange={(e) => field.onChange(e.target.value)}
                                className="h-11 bg-[#172334] border-[#334155] text-[#F1F5F9] placeholder:text-slate-500"
                              />
                            </FormControl>
                            <FormMessage className="text-[#FCA5A5]" />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name={`manualCompetitionStats.${idx}.minutes` as const}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-[#F1F5F9]">時間</FormLabel>
                            <FormControl>
                              <Input
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                placeholder="0"
                                value={field.value ?? ""}
                                onChange={(e) => field.onChange(e.target.value)}
                                className="h-11 bg-[#172334] border-[#334155] text-[#F1F5F9] placeholder:text-slate-500"
                              />
                            </FormControl>
                            <FormMessage className="text-[#FCA5A5]" />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name={`manualCompetitionStats.${idx}.goals` as const}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-[#F1F5F9]">ゴール</FormLabel>
                            <FormControl>
                              <Input
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                placeholder="0"
                                value={field.value ?? ""}
                                onChange={(e) => field.onChange(e.target.value)}
                                className="h-11 bg-[#172334] border-[#334155] text-[#F1F5F9] placeholder:text-slate-500"
                              />
                            </FormControl>
                            <FormMessage className="text-[#FCA5A5]" />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name={`manualCompetitionStats.${idx}.assists` as const}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-[#F1F5F9]">アシスト</FormLabel>
                            <FormControl>
                              <Input
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                placeholder="0"
                                value={field.value ?? ""}
                                onChange={(e) => field.onChange(e.target.value)}
                                className="h-11 bg-[#172334] border-[#334155] text-[#F1F5F9] placeholder:text-slate-500"
                              />
                            </FormControl>
                            <FormMessage className="text-[#FCA5A5]" />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name={`manualCompetitionStats.${idx}.yellowCards` as const}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-[#F1F5F9]">警告</FormLabel>
                            <FormControl>
                              <Input
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                placeholder="0"
                                value={field.value ?? ""}
                                onChange={(e) => field.onChange(e.target.value)}
                                className="h-11 bg-[#172334] border-[#334155] text-[#F1F5F9] placeholder:text-slate-500"
                              />
                            </FormControl>
                            <FormMessage className="text-[#FCA5A5]" />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name={`manualCompetitionStats.${idx}.redCards` as const}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-[#F1F5F9]">退場</FormLabel>
                            <FormControl>
                              <Input
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                placeholder="0"
                                value={field.value ?? ""}
                                onChange={(e) => field.onChange(e.target.value)}
                                className="h-11 bg-[#172334] border-[#334155] text-[#F1F5F9] placeholder:text-slate-500"
                              />
                            </FormControl>
                            <FormMessage className="text-[#FCA5A5]" />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name={`manualCompetitionStats.${idx}.avgRating` as const}
                        render={({ field }) => (
                          <FormItem className="col-span-2">
                            <FormLabel className="text-[#F1F5F9]">評価点</FormLabel>
                            <div className="flex gap-2">
                              <FormControl className="flex-1">
                                <Input
                                  type="text"
                                  inputMode="decimal"
                                  step="0.1"
                                  placeholder="6.5"
                                  value={field.value ?? ""}
                                  onChange={(e) => field.onChange(e.target.value)}
                                  className="h-11 bg-[#172334] border-[#334155] text-[#F1F5F9] placeholder:text-slate-500"
                                />
                              </FormControl>
                              <Button
                                type="button"
                                variant="outline"
                                className="h-11 shrink-0 border-[#334155] bg-[#172334] text-[#F1F5F9] hover:bg-[#1e293b]"
                                onClick={() => {
                                  const ok = window.confirm("この手入力成績を削除して、自動集計に戻しますか？");
                                  if (!ok) return;
                                  statsFieldArray.remove(idx);
                                }}
                              >
                                自動集計に戻す
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                className="h-11 shrink-0 border-[#FCA5A5] text-[#FCA5A5] hover:bg-red-950/30"
                                onClick={() => {
                                  const ok = window.confirm("この成績を削除しますか？");
                                  if (!ok) return;
                                  statsFieldArray.remove(idx);
                                }}
                              >
                                削除
                              </Button>
                            </div>
                            <FormMessage className="text-[#FCA5A5]" />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <Button
                type="button"
                variant="outline"
                className="h-11 w-full border-[#334155] bg-[#172334] text-[#F1F5F9] hover:bg-[#1e293b]"
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
            </TabsContent>
          </div>
        </Tabs>

        <footer className="flex flex-col gap-3 border-t border-[#334155] bg-[#0C1422] px-4 py-3 sm:flex-row sm:items-center">
          <FormField
            control={form.control}
            name="isPublished"
            render={({ field }) => (
              <FormItem className="flex flex-1 items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <FormLabel className="text-sm text-[#F1F5F9]">HPで表示する</FormLabel>
                  <p className="text-xs text-[#A8B5C8]">OFFにすると、この選手はHPの選手一覧に表示されません。</p>
                </div>
                <FormControl>
                  <Switch
                    checked={field.value ?? true}
                    onCheckedChange={field.onChange}
                    className="data-[state=checked]:bg-[#1FD760] data-[state=unchecked]:bg-slate-600"
                  />
                </FormControl>
              </FormItem>
            )}
          />
          <Button
            type="submit"
            disabled={loading}
            className="h-12 w-full shrink-0 bg-[#1FD760] px-6 text-[#08111F] font-semibold hover:bg-[#17c054] sm:w-auto"
          >
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            保存する
          </Button>
        </footer>
      </form>
    </Form>
  );
}
