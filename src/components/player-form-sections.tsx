"use client";

import { useState, useEffect } from "react";
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
  { key: "LW", label: "LW", x: "17%", y: "14%" },
  { key: "ST", label: "ST", x: "50%", y: "12%" },
  { key: "RW", label: "RW", x: "83%", y: "14%" },
  { key: "AM", label: "AM", x: "50%", y: "28%" },
  { key: "LM", label: "LM", x: "17%", y: "43%" },
  { key: "CM", label: "CM", x: "50%", y: "46%" },
  { key: "RM", label: "RM", x: "83%", y: "43%" },
  { key: "DM", label: "DM", x: "50%", y: "61%" },
  { key: "LB", label: "LB", x: "17%", y: "77%" },
  { key: "CB", label: "CB", x: "50%", y: "80%" },
  { key: "RB", label: "RB", x: "83%", y: "77%" },
  { key: "GK", label: "GK", x: "50%", y: "93%" },
];

export function DetailedPositionsSection({
  form,
  defaultOpen = false,
}: {
  form: UseFormReturn<PlayerFormValues>;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    setOpen(defaultOpen);
  }, [defaultOpen]);

  return (
    <FormItem className="md:col-span-2">
      <FormControl>
        <div className="rounded-lg border bg-muted/10 p-3">
          <div className="flex items-center justify-between gap-3">
            <FormLabel className="m-0">適正ポジション（メイン1 / サブ最大3）</FormLabel>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => setOpen((v) => !v)}
            >
              <ChevronDown className={open ? "h-4 w-4 transition-transform rotate-180" : "h-4 w-4 transition-transform"} />
            </Button>
          </div>

          {open ? (
            <div className="mt-4">
              <div className="relative mx-auto h-[430px] w-full max-w-[360px] overflow-hidden rounded-xl border border-gray-300 bg-white">
                <div className="absolute left-1/2 top-0 h-[52px] w-[42%] -translate-x-1/2 border-x border-b border-gray-200" />
                <div className="absolute left-0 top-1/2 h-px w-full bg-gray-200" />
                <div className="absolute left-1/2 top-1/2 h-20 w-20 -translate-x-1/2 -translate-y-1/2 rounded-full border border-gray-200" />
                <div className="absolute bottom-0 left-1/2 h-[52px] w-[42%] -translate-x-1/2 border-x border-t border-gray-200" />
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

                  const colorClass = isMain
                    ? "border-blue-600 bg-blue-600 text-white shadow-sm"
                    : isSub
                      ? "border-blue-300 bg-blue-100 text-blue-700"
                      : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50";
                  const disabledClass = !selected && (form.watch("mainPosition") != null) && ((form.watch("subPositions") || []).length >= 3)
                    ? "opacity-60"
                    : "";

                  return (
                    <button
                      key={p.key}
                      type="button"
                      onClick={onToggle}
                      className={`absolute flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 select-none items-center justify-center rounded-full border text-sm font-semibold transition-colors ${colorClass} ${disabledClass}`}
                      style={{ left: p.x, top: p.y }}
                      aria-pressed={selected}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="mt-4 rounded-md bg-muted/30 p-3 text-sm">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-muted-foreground">メイン</div>
                <div className="font-semibold">{(form.watch("mainPosition") as any) || "未選択"}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">サブ</div>
                <div className="font-semibold">
                  {((form.watch("subPositions") as any[]) || []).length > 0
                    ? ((form.watch("subPositions") as any[]) || []).join(", ")
                    : "未選択"}
                </div>
              </div>
            </div>
          </div>
        </div>
      </FormControl>
    </FormItem>
  );
}

export function BasicInfoSection({
  form,
  defaultOpen = false,
  seasons = [],
}: {
  form: UseFormReturn<PlayerFormValues>;
  defaultOpen?: boolean;
  seasons?: string[];
}) {
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    setOpen(defaultOpen);
  }, [defaultOpen]);

  return (
    <div className="space-y-3 rounded-lg border bg-muted/10 p-3 md:col-span-2">
      <div className="flex items-center justify-between gap-3 px-1">
        <div className="space-y-0.5">
          <FormLabel>基本情報</FormLabel>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={() => setOpen((v) => !v)}
        >
          <ChevronDown className={open ? "h-4 w-4 transition-transform rotate-180" : "h-4 w-4 transition-transform"} />
        </Button>
      </div>

      {open ? (
        <>
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
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="180"
                    {...field}
                    value={(field.value ?? "") as any}
                    onChange={(e) => field.onChange(e.target.value)}
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
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="75"
                    {...field}
                    value={(field.value ?? "") as any}
                    onChange={(e) => field.onChange(e.target.value)}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-2 gap-3">
            <FormField
              control={form.control}
              name="dateOfBirth"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>生年月日</FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant={"outline"}
                          className={cn(
                            "w-full pl-3 text-left font-normal",
                            !field.value && "text-muted-foreground"
                          )}
                        >
                          {field.value ? (
                            new Date(field.value).toLocaleDateString("ja-JP")
                          ) : (
                            <span>日付を選択</span>
                          )}
                          <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 bg-white" align="start">
                      <Calendar
                        mode="single"
                        selected={field.value ? new Date(field.value) : undefined}
                        onSelect={(date) => field.onChange(date?.toISOString().split('T')[0])}
                        disabled={(date) =>
                          date > new Date() || date < new Date("1900-01-01")
                        }
                        initialFocus
                        fromYear={1950}
                        toYear={new Date().getFullYear() + 5}
                        captionLayout="dropdown"
                      />
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="joinedSeason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>加入シーズン</FormLabel>
                  <FormControl>
                    <Select value={field.value || ""} onValueChange={field.onChange}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="選択" />
                      </SelectTrigger>
                      <SelectContent>
                        {seasons.map((season: string) => (
                          <SelectItem key={season} value={season}>
                            {season}
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
        </>
      ) : null}
    </div>
  );
}

export function OtherInfoSection({
  form,
  defaultOpen = false,
  seasons = [],
}: {
  form: UseFormReturn<PlayerFormValues>;
  defaultOpen?: boolean;
  seasons?: string[];
}) {
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    setOpen(defaultOpen);
  }, [defaultOpen]);

  return (
    <div className="space-y-3 rounded-lg border bg-muted/10 p-3 md:col-span-2">
      <div className="flex items-center justify-between gap-3 px-1">
        <div className="space-y-0.5">
          <FormLabel>その他</FormLabel>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={() => setOpen((v) => !v)}
        >
          <ChevronDown className={open ? "h-4 w-4 transition-transform rotate-180" : "h-4 w-4 transition-transform"} />
        </Button>
      </div>

      {open ? (
        <>
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
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        placeholder="例: 10000"
                        value={(field.value ?? "") as any}
                        onChange={(e) => field.onChange(e.target.value)}
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
        </>
      ) : null}
    </div>
  );
}

export function SnsLinksSection({
  form,
}: {
  form: UseFormReturn<PlayerFormValues>;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-3 rounded-lg border bg-muted/10 p-3">
      <div className="flex items-center justify-between gap-3 px-1">
        <div className="space-y-0.5">
          <FormLabel>SNSリンク</FormLabel>
          <p className="text-xs text-muted-foreground">入力したSNSのみHPの選手詳細に表示されます。</p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={() => setOpen((v) => !v)}
        >
          <ChevronDown className={open ? "h-4 w-4 transition-transform rotate-180" : "h-4 w-4 transition-transform"} />
        </Button>
      </div>

      {open ? (
        <>
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
        </>
      ) : null}
    </div>
  );
}
