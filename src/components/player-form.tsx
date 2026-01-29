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
import { useMemo, useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { PlayerPhotoUploader } from "@/components/player-photo-uploader";
import type { SubmitHandler } from "react-hook-form";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";

import {
  BasicInfoSection,
  DetailedPositionsSection,
  OtherInfoSection,
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
}

export function PlayerForm({ onSubmit, defaultValues, defaultSeason, ownerUid }: PlayerFormProps) {
  const [loading, setLoading] = useState(false);
  const [competitions, setCompetitions] = useState<{ id: string; name: string; season?: string }[]>([]);

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
  }, [form, normalizedDefaults]);

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
                  <FormItem className="md:col-span-2">
                    <FormLabel>選手名 *</FormLabel>
                    <FormControl>
                      <Input placeholder="選手名" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4 md:col-span-2">
                <FormField
                  control={form.control}
                  name="number"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>背番号 *</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          inputMode="numeric"
                          min={1}
                          step={1}
                          placeholder="背番号"
                          value={(field.value ?? "") as any}
                          onChange={(e) => {
                            if (e.target.value === "") {
                              field.onChange(undefined);
                              return;
                            }
                            const n = Number(e.target.value);
                            field.onChange(Number.isFinite(n) ? Math.max(1, Math.trunc(n)) : undefined);
                          }}
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
                      <FormLabel>ポジション *</FormLabel>
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
              </div>

              <BasicInfoSection form={form} />
              <OtherInfoSection form={form} />
              <DetailedPositionsSection form={form} />
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
            <SnsLinksSection form={form} />
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
