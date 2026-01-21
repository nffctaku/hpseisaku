"use client";

import { useEffect, useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";

import type { Player } from "@/types/player";
import type { TransferDirection, TransferKind } from "@/types/transfer";

const UNSELECTED_PLAYER_VALUE = "__unselected__";

const parseMoneyValue = (value: unknown): unknown => {
  if (typeof value !== "string") return value;
  const normalized = value.replace(/,/g, "").trim();
  if (normalized.length === 0) return undefined;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : value;
};

const formSchema = z.object({
  direction: z.enum(["in", "out"]),
  kind: z.enum(["完全", "レンタル", "昇格", "満了", "解除"]),
  season: z.string().min(1),
  playerId: z.string().optional().or(z.literal("")),
  playerName: z.string().min(1, { message: "選手名は必須です。" }),
  age: z.coerce.number().int().optional(),
  position: z.string().optional(),
  counterparty: z.string().min(1, { message: "移籍先/元は必須です。" }),
  fee: z.preprocess(parseMoneyValue, z.number().nonnegative().optional()),
  feeCurrency: z.enum(["JPY", "GBP", "EUR"]).optional(),
  annualSalary: z.preprocess(parseMoneyValue, z.number().nonnegative().optional()),
  annualSalaryCurrency: z.enum(["JPY", "GBP", "EUR"]).optional(),
  contractYears: z.coerce.number().int().nonnegative().optional(),
});

export type TransferFormValues = z.infer<typeof formSchema>;

interface TransferFormProps {
  onSubmit: (values: TransferFormValues) => Promise<void>;
  defaultValues?: Partial<TransferFormValues>;
  season: string;
  direction: TransferDirection;
  players: Player[];
  fixedCurrency?: "JPY" | "EUR" | "GBP";
}

export function TransferForm({ onSubmit, defaultValues, season, direction, players, fixedCurrency }: TransferFormProps) {
  const [loading, setLoading] = useState(false);

  const playerOptions = useMemo(() => {
    return [...players].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }, [players]);

  const form = useForm<TransferFormValues>({
    resolver: zodResolver(formSchema) as any,
    defaultValues: {
      direction,
      kind: "完全" as TransferKind,
      season,
      playerId: "",
      playerName: "",
      age: undefined,
      position: "",
      counterparty: "",
      fee: undefined,
      feeCurrency: "JPY",
      annualSalary: undefined,
      annualSalaryCurrency: "JPY",
      contractYears: undefined,
      ...defaultValues,
    },
  });

  useEffect(() => {
    form.setValue("season", season);
    form.setValue("direction", direction);

    if (fixedCurrency) {
      form.setValue("feeCurrency", fixedCurrency as any);
      form.setValue("annualSalaryCurrency", fixedCurrency as any);
    }

    if (direction === "out") {
      form.setValue("annualSalary", undefined);
      form.setValue("annualSalaryCurrency", (fixedCurrency || "JPY") as any);
      form.setValue("contractYears", undefined);
    }
  }, [season, direction, form, fixedCurrency]);

  const label = direction === "in" ? "移籍元" : "移籍先";

  const handleSubmit = async (values: TransferFormValues) => {
    setLoading(true);
    await onSubmit(values);
    setLoading(false);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4 pb-10">
        <FormField
          control={form.control}
          name="kind"
          render={({ field }) => (
            <FormItem>
              <FormLabel>種類</FormLabel>
              <Select value={(field.value || "完全") as any} onValueChange={field.onChange as any}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="種類" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="完全">完全</SelectItem>
                  <SelectItem value="レンタル">レンタル</SelectItem>
                  <SelectItem value="昇格">昇格</SelectItem>
                  <SelectItem value="満了">満了</SelectItem>
                  <SelectItem value="解除">解除</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="playerId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>選手</FormLabel>
              <Select
                value={(field.value && field.value.trim().length > 0 ? field.value : UNSELECTED_PLAYER_VALUE) as any}
                onValueChange={(v) => {
                  const next = v === UNSELECTED_PLAYER_VALUE ? "" : v;
                  field.onChange(next);
                  const selected = playerOptions.find((p) => p.id === next);
                  if (selected) {
                    form.setValue("playerName", selected.name || "");
                    form.setValue("age", (selected as any).age ?? undefined);
                    form.setValue("position", (selected as any).position ?? "");
                  }
                }}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="選手を選択（任意）" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value={UNSELECTED_PLAYER_VALUE}>未選択</SelectItem>
                  {playerOptions.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
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
          name="playerName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>選手名</FormLabel>
              <FormControl>
                <Input placeholder="例: 山田 太郎" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-3">
          <FormField
            control={form.control}
            name="age"
            render={({ field }) => (
              <FormItem>
                <FormLabel>年齢</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    placeholder="20"
                    value={field.value ?? ""}
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
                <FormLabel>Pos</FormLabel>
                <FormControl>
                  <Input placeholder="GK/DF/MF/FW" value={field.value ?? ""} onChange={field.onChange} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="counterparty"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{label}</FormLabel>
              <FormControl>
                <Input placeholder="例: FC ○○" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="fee"
          render={({ field }) => (
            <FormItem>
              <FormLabel>金額</FormLabel>
              <FormControl>
                <div className="flex gap-2">
                  <FormField
                    control={form.control}
                    name="feeCurrency"
                    render={({ field: currencyField }) => (
                      <Select
                        value={(fixedCurrency || currencyField.value || "JPY") as any}
                        onValueChange={currencyField.onChange as any}
                        disabled={Boolean(fixedCurrency)}
                      >
                        <FormControl>
                          <SelectTrigger className="w-24" disabled={Boolean(fixedCurrency)}>
                            <SelectValue placeholder="通貨" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {fixedCurrency ? (
                            <SelectItem value={fixedCurrency as any}>
                              {fixedCurrency === "JPY" ? "JPY(￥)" : fixedCurrency === "GBP" ? "GBP(￡)" : "EUR(€)"}
                            </SelectItem>
                          ) : (
                            <>
                              <SelectItem value="JPY">JPY(￥)</SelectItem>
                              <SelectItem value="EUR">EUR(€)</SelectItem>
                              <SelectItem value="GBP">GBP(￡)</SelectItem>
                            </>
                          )}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  <Input
                    type="text"
                    inputMode="numeric"
                    placeholder="例: 10,000"
                    value={(field.value as any) ?? ""}
                    onChange={(e) => field.onChange(e.target.value)}
                  />
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {direction === "in" ? (
          <>
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
                          <Select
                            value={(fixedCurrency || currencyField.value || "JPY") as any}
                            onValueChange={currencyField.onChange as any}
                            disabled={Boolean(fixedCurrency)}
                          >
                            <FormControl>
                              <SelectTrigger className="w-24" disabled={Boolean(fixedCurrency)}>
                                <SelectValue placeholder="通貨" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {fixedCurrency ? (
                                <SelectItem value={fixedCurrency as any}>
                                  {fixedCurrency === "JPY" ? "JPY(￥)" : fixedCurrency === "GBP" ? "GBP(￡)" : "EUR(€)"}
                                </SelectItem>
                              ) : (
                                <>
                                  <SelectItem value="JPY">JPY(￥)</SelectItem>
                                  <SelectItem value="EUR">EUR(€)</SelectItem>
                                  <SelectItem value="GBP">GBP(￡)</SelectItem>
                                </>
                              )}
                            </SelectContent>
                          </Select>
                        )}
                      />
                      <Input
                        type="text"
                        inputMode="numeric"
                        placeholder="例: 10,000"
                        value={(field.value as any) ?? ""}
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
              name="contractYears"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>契約年数</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      inputMode="numeric"
                      placeholder="例: 3"
                      value={field.value ?? ""}
                      onChange={(e) => field.onChange(e.target.value === "" ? undefined : Number(e.target.value))}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </>
        ) : null}

        <Button type="submit" disabled={loading} className="w-full bg-emerald-600 text-white hover:bg-emerald-700">
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          保存する
        </Button>
      </form>
    </Form>
  );
}
