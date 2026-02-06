"use client";

import { useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import { ChevronDown } from "lucide-react";

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

import {
  type DetailedPosition,
  type PlayerFormValues,
} from "./player-form.schema";

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

export function DetailedPositionsSection({
  form,
}: {
  form: UseFormReturn<PlayerFormValues>;
}) {
  const [open, setOpen] = useState(false);

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
            </div>
          ) : null}

          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div className="rounded-md bg-muted/30 p-3">
              <div className="text-xs text-muted-foreground">メイン</div>
              <div className="font-semibold">{(form.watch("mainPosition") as any) || "未選択"}</div>
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
  );
}

export function BasicInfoSection({
  form,
}: {
  form: UseFormReturn<PlayerFormValues>;
}) {
  const [open, setOpen] = useState(false);

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
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="25"
                    {...field}
                    value={(field.value ?? "") as any}
                    onChange={(e) => field.onChange(e.target.value)}
                  />
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

export function OtherInfoSection({
  form,
}: {
  form: UseFormReturn<PlayerFormValues>;
}) {
  const [open, setOpen] = useState(false);

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
          <FormField
            control={form.control}
            name="tenureYears"
            render={({ field }) => (
              <FormItem>
                <FormLabel>在籍年数</FormLabel>
                <FormControl>
                  <Input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="0"
                    {...field}
                    value={(field.value ?? "") as any}
                    onChange={(e) => field.onChange(e.target.value)}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

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
