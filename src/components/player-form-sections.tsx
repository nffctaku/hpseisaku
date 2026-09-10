/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useEffect, useId } from "react";
import type { UseFormReturn } from "react-hook-form";
import { ChevronDown, CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import {
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
import { Calendar } from "@/components/ui/calendar";
import { Textarea } from "@/components/ui/textarea";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

import {
  type DetailedPosition,
  type PlayerFormValues,
} from "./player-form.schema";

const detailedPositionLayout: Array<{ key: DetailedPosition; label: string; x: string; y: string }> = [
  { key: "LW", label: "LW", x: "16%", y: "12%" },
  { key: "ST", label: "ST", x: "50%", y: "10%" },
  { key: "RW", label: "RW", x: "84%", y: "12%" },
  { key: "AM", label: "AM", x: "50%", y: "27%" },
  { key: "LM", label: "LM", x: "16%", y: "42%" },
  { key: "CM", label: "CM", x: "50%", y: "45%" },
  { key: "RM", label: "RM", x: "84%", y: "42%" },
  { key: "DM", label: "DM", x: "50%", y: "61%" },
  { key: "LB", label: "LB", x: "16%", y: "76%" },
  { key: "CB", label: "CB", x: "50%", y: "80%" },
  { key: "RB", label: "RB", x: "84%", y: "76%" },
  { key: "GK", label: "GK", x: "50%", y: "92%" },
];

function SectionCard({
  title,
  summary,
  open,
  onOpenChange,
  children,
}: {
  title: string;
  summary: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  children: React.ReactNode;
}) {
  const panelId = useId();
  return (
    <div className="rounded-xl border border-[#334155] bg-[#172334]">
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left focus-visible:rounded-xl focus-visible:ring-2 focus-visible:ring-[#1FD760] focus-visible:outline-none"
        aria-expanded={open}
        aria-controls={panelId}
      >
        <div className="min-w-0">
          <div className="text-sm font-semibold text-[#F1F5F9]">{title}</div>
          <div className="text-xs text-[#A8B5C8]">{summary}</div>
        </div>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-[#A8B5C8] transition-transform",
            open && "rotate-180"
          )}
        />
      </button>
      <div id={panelId} className={cn("px-4 pb-4", !open && "hidden")}>
        {children}
      </div>
    </div>
  );
}

export function DetailedPositionsSection({
  form,
  open,
  onOpenChange,
}: {
  form: UseFormReturn<PlayerFormValues>;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [mode, setMode] = useState<"main" | "sub">("main");
  const [guidance, setGuidance] = useState<string | null>(null);

  useEffect(() => {
    if (!guidance) return;
    const t = setTimeout(() => setGuidance(null), 2500);
    return () => clearTimeout(t);
  }, [guidance]);

  const mainPosition = form.watch("mainPosition") as DetailedPosition | undefined;
  const subPositions = (form.watch("subPositions") || []) as DetailedPosition[];

  const handleToggle = (p: DetailedPosition) => {
    const currentMain = form.getValues("mainPosition") as DetailedPosition | undefined;
    const currentSubs = ((form.getValues("subPositions") || []) as DetailedPosition[]).filter(Boolean);
    const isMain = currentMain === p;
    const isSub = currentSubs.includes(p);

    if (mode === "main") {
      if (isMain) {
        form.setValue("mainPosition", undefined as any, { shouldDirty: true, shouldTouch: true, shouldValidate: true });
        return;
      }
      if (isSub) {
        const next = currentSubs.filter((x) => x !== p);
        form.setValue("subPositions", next as any, { shouldDirty: true, shouldTouch: true, shouldValidate: true });
        form.setValue("mainPosition", p as any, { shouldDirty: true, shouldTouch: true, shouldValidate: true });
        return;
      }
      form.setValue("mainPosition", p as any, { shouldDirty: true, shouldTouch: true, shouldValidate: true });
      return;
    }

    if (isMain) {
      setGuidance("メインに選択中です。サブに追加する場合は、まずメインを解除してください。");
      return;
    }
    if (isSub) {
      const next = currentSubs.filter((x) => x !== p);
      form.setValue("subPositions", next as any, { shouldDirty: true, shouldTouch: true, shouldValidate: true });
      return;
    }
    if (currentSubs.length >= 3) {
      setGuidance("サブポジションは3つまで選択できます。");
      return;
    }
    form.setValue("subPositions", [...currentSubs, p] as any, { shouldDirty: true, shouldTouch: true, shouldValidate: true });
  };

  return (
    <SectionCard title="適正ポジション" summary="メイン1／サブ最大3" open={open} onOpenChange={onOpenChange}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setMode("main")}
            className={cn(
              "rounded-lg px-3 py-2 text-sm font-medium transition",
              mode === "main"
                ? "bg-[#1FD760] text-[#08111F]"
                : "border border-[#334155] bg-[#172334] text-[#A8B5C8] hover:bg-[#1e293b]"
            )}
          >
            メイン
          </button>
          <button
            type="button"
            onClick={() => setMode("sub")}
            className={cn(
              "rounded-lg px-3 py-2 text-sm font-medium transition",
              mode === "sub"
                ? "bg-[#60A5FA] text-[#08111F]"
                : "border border-[#334155] bg-[#172334] text-[#A8B5C8] hover:bg-[#1e293b]"
            )}
          >
            サブ
          </button>
        </div>

        {guidance && (
          <div role="status" aria-live="polite" className="text-xs text-[#FCA5A5]">
            {guidance}
          </div>
        )}

        <div className="relative mx-auto aspect-[3/4] w-full max-w-[320px] rounded-xl border border-[#334155] bg-[#0f172a]">
          <div className="absolute left-1/2 top-0 h-[14%] w-[40%] -translate-x-1/2 border-x border-b border-white/10" />
          <div className="absolute left-0 top-1/2 h-px w-full bg-white/10" />
          <div className="absolute left-1/2 top-1/2 h-20 w-20 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/10" />
          <div className="absolute bottom-0 left-1/2 h-[14%] w-[40%] -translate-x-1/2 border-x border-t border-white/10" />
          {detailedPositionLayout.map((p) => {
            const isMain = mainPosition === p.key;
            const isSub = subPositions.includes(p.key);
            const colorClass = isMain
              ? "border-[#1FD760] bg-[#1FD760] text-[#08111F] shadow"
              : isSub
              ? "border-[#60A5FA] bg-transparent text-[#60A5FA]"
              : "border-[#475569] bg-[#172334] text-[#A8B5C8] hover:border-[#64748B]";
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => handleToggle(p.key as DetailedPosition)}
                className={cn(
                  "absolute flex min-h-[44px] min-w-[44px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border text-sm font-semibold transition",
                  colorClass
                )}
                style={{ left: p.x, top: p.y }}
                aria-pressed={isMain || isSub}
                aria-label={p.label}
              >
                {p.label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className="inline-flex items-center gap-1 text-[#A8B5C8]">
            <span className="h-3 w-3 rounded-full bg-[#1FD760]" />
            メイン
          </span>
          <span className="inline-flex items-center gap-1 text-[#A8B5C8]">
            <span className="h-3 w-3 rounded-full border border-[#60A5FA]" />
            サブ
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          {mainPosition ? (
            <span className="inline-flex items-center rounded-full bg-[#1FD760] px-2.5 py-1 text-xs font-medium text-[#08111F]">
              メイン: {mainPosition}
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full border border-[#334155] px-2.5 py-1 text-xs text-[#A8B5C8]">
              メイン: 未選択
            </span>
          )}
          {subPositions.length > 0 ? (
            subPositions.map((pos) => (
              <span
                key={pos}
                className="inline-flex items-center rounded-full border border-[#60A5FA] px-2.5 py-1 text-xs font-medium text-[#60A5FA]"
              >
                サブ: {pos}
              </span>
            ))
          ) : (
            <span className="inline-flex items-center rounded-full border border-[#334155] px-2.5 py-1 text-xs text-[#A8B5C8]">
              サブ: 未選択
            </span>
          )}
        </div>
      </div>
    </SectionCard>
  );
}

export function BasicInfoSection({
  form,
  open,
  onOpenChange,
  seasons = [],
}: {
  form: UseFormReturn<PlayerFormValues>;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  seasons?: string[];
}) {
  const formatDateToLocal = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const parseLocalDate = (dateString: string) => {
    const [year, month, day] = dateString.split("-").map(Number);
    return new Date(year, month - 1, day);
  };

  return (
    <SectionCard title="基本情報" summary="国籍・身長・利き足など" open={open} onOpenChange={onOpenChange}>
      <div className="space-y-3">
        <FormField
          control={form.control}
          name="nationality"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-[#F1F5F9]">国籍</FormLabel>
              <FormControl>
                <Input
                  placeholder="例: 日本"
                  {...field}
                  value={(field.value as any) ?? ""}
                  className="h-11 bg-[#172334] border-[#334155] text-[#F1F5F9] placeholder:text-slate-500"
                />
              </FormControl>
              <FormMessage className="text-[#FCA5A5]" />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="height"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-[#F1F5F9]">身長 (cm)</FormLabel>
                <FormControl>
                  <Input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="180"
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

          <FormField
            control={form.control}
            name="weight"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-[#F1F5F9]">体重 (kg)</FormLabel>
                <FormControl>
                  <Input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="75"
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

        <FormField
          control={form.control}
          name="preferredFoot"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-[#F1F5F9]">利き足</FormLabel>
              <FormControl>
                <Select value={field.value || ""} onValueChange={field.onChange}>
                  <SelectTrigger className="h-11 w-full bg-[#172334] border-[#334155] text-[#F1F5F9]">
                    <SelectValue placeholder="選択" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#172334] border-[#334155] text-[#F1F5F9]">
                    <SelectItem value="right">右足</SelectItem>
                    <SelectItem value="left">左足</SelectItem>
                    <SelectItem value="both">両足</SelectItem>
                  </SelectContent>
                </Select>
              </FormControl>
              <FormMessage className="text-[#FCA5A5]" />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="dateOfBirth"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel className="text-[#F1F5F9]">生年月日</FormLabel>
                <Popover>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button
                        variant="outline"
                        className={cn(
                          "h-11 w-full justify-start bg-[#172334] border-[#334155] text-[#F1F5F9] font-normal hover:bg-[#1e293b]",
                          !field.value && "text-[#A8B5C8]"
                        )}
                      >
                        {field.value ? (
                          formatDateToLocal(parseLocalDate(field.value))
                        ) : (
                          <span>日付を選択</span>
                        )}
                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 bg-[#172334] border-[#334155]" align="start">
                    <Calendar
                      mode="single"
                      selected={field.value ? parseLocalDate(field.value) : undefined}
                      onSelect={(date) => field.onChange(date ? formatDateToLocal(date) : undefined)}
                      disabled={(date) => date > new Date() || date < new Date("1900-01-01")}
                      initialFocus
                      fromYear={1950}
                      toYear={new Date().getFullYear() + 5}
                      captionLayout="dropdown"
                      className="text-[#F1F5F9]"
                    />
                  </PopoverContent>
                </Popover>
                <FormMessage className="text-[#FCA5A5]" />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="joinedSeason"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-[#F1F5F9]">加入シーズン</FormLabel>
                <FormControl>
                  <Select value={field.value || ""} onValueChange={field.onChange}>
                    <SelectTrigger className="h-11 w-full bg-[#172334] border-[#334155] text-[#F1F5F9]">
                      <SelectValue placeholder="選択" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#172334] border-[#334155] text-[#F1F5F9]">
                      {seasons.map((season: string) => (
                        <SelectItem key={season} value={season}>
                          {season}
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
      </div>
    </SectionCard>
  );
}

export function ContractInfoSection({
  form,
  open,
  onOpenChange,
}: {
  form: UseFormReturn<PlayerFormValues>;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 15 }, (_, i) => currentYear + i);

  return (
    <SectionCard title="契約情報" summary="年俸・契約満了日" open={open} onOpenChange={onOpenChange}>
      <div className="space-y-3">
        <FormField
          control={form.control}
          name="annualSalary"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-[#F1F5F9]">年俸</FormLabel>
              <FormControl>
                <div className="flex gap-2">
                  <FormField
                    control={form.control}
                    name="annualSalaryCurrency"
                    render={({ field: currencyField }) => (
                      <Select value={(currencyField.value || "JPY") as any} onValueChange={currencyField.onChange as any}>
                        <SelectTrigger className="h-11 w-24 shrink-0 bg-[#172334] border-[#334155] text-[#F1F5F9]">
                          <SelectValue placeholder="通貨" />
                        </SelectTrigger>
                        <SelectContent className="bg-[#172334] border-[#334155] text-[#F1F5F9]">
                          <SelectItem value="JPY">￥</SelectItem>
                          <SelectItem value="GBP">￡</SelectItem>
                          <SelectItem value="EUR">€</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                  <Input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="例: 10000"
                    {...field}
                    value={(field.value ?? "") as any}
                    onChange={(e) => field.onChange(e.target.value)}
                    className="h-11 bg-[#172334] border-[#334155] text-[#F1F5F9] placeholder:text-slate-500"
                  />
                </div>
              </FormControl>
              <FormMessage className="text-[#FCA5A5]" />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="contractEndYear"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-[#F1F5F9]">契約満了年月</FormLabel>
              <FormControl>
                <div className="grid grid-cols-2 gap-2">
                  <Select
                    value={field.value != null ? String(field.value) : ""}
                    onValueChange={(v) => field.onChange(v === "" ? undefined : Number(v))}
                  >
                    <SelectTrigger className="h-11 bg-[#172334] border-[#334155] text-[#F1F5F9]">
                      <SelectValue placeholder="年" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#172334] border-[#334155] text-[#F1F5F9]">
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
                        <SelectTrigger className="h-11 bg-[#172334] border-[#334155] text-[#F1F5F9]">
                          <SelectValue placeholder="月" />
                        </SelectTrigger>
                        <SelectContent className="bg-[#172334] border-[#334155] text-[#F1F5F9]">
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
              <FormMessage className="text-[#FCA5A5]" />
            </FormItem>
          )}
        />
      </div>
    </SectionCard>
  );
}

export function ProfileSection({
  form,
  open,
  onOpenChange,
}: {
  form: UseFormReturn<PlayerFormValues>;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  return (
    <SectionCard title="プロフィール" summary="選手の経歴・特徴" open={open} onOpenChange={onOpenChange}>
      <FormField
        control={form.control}
        name="profile"
        render={({ field }) => (
          <FormItem>
            <FormLabel className="text-[#F1F5F9]">プロフィール</FormLabel>
            <p className="text-xs text-[#A8B5C8]">
              最大200文字まで入力できます。選手名鑑では通常80文字、パラメーターグラフOFF時は200文字まで表示されます。
            </p>
            <FormControl>
              <Textarea
                placeholder="選手の経歴や特徴など"
                maxLength={200}
                {...field}
                value={(field.value as any) ?? ""}
                className="min-h-[120px] bg-[#172334] border-[#334155] text-[#F1F5F9] placeholder:text-slate-500"
              />
            </FormControl>
            <div className="text-right text-xs text-[#A8B5C8]">
              {String(field.value || "").length}/200
            </div>
            <FormMessage className="text-[#FCA5A5]" />
          </FormItem>
        )}
      />
    </SectionCard>
  );
}

const snsPlaceholders: Record<string, string> = {
  x: "https://x.com/...",
  youtube: "https://www.youtube.com/...",
  tiktok: "https://www.tiktok.com/@...",
  instagram: "https://www.instagram.com/...",
};

const snsLabels: Record<string, string> = {
  x: "X",
  youtube: "YouTube",
  tiktok: "TikTok",
  instagram: "Instagram",
};

export function SnsLinksSection({
  form,
  open,
  onOpenChange,
}: {
  form: UseFormReturn<PlayerFormValues>;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  return (
    <SectionCard title="SNSリンク" summary="入力したSNSのみ表示されます" open={open} onOpenChange={onOpenChange}>
      <div className="space-y-3">
        {["x", "youtube", "tiktok", "instagram"].map((service) => (
          <FormField
            key={service}
            control={form.control}
            name={`snsLinks.${service}` as any}
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-[#F1F5F9]">{snsLabels[service]}</FormLabel>
                <FormControl>
                  <Input
                    type="url"
                    inputMode="url"
                    placeholder={snsPlaceholders[service]}
                    {...field}
                    value={(field.value as any) ?? ""}
                    className="h-11 bg-[#172334] border-[#334155] text-[#F1F5F9] placeholder:text-slate-500"
                  />
                </FormControl>
                <FormMessage className="text-[#FCA5A5]" />
              </FormItem>
            )}
          />
        ))}
      </div>
    </SectionCard>
  );
}
