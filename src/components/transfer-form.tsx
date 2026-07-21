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
  dateOfBirth: z.string().optional(),
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
  const [playerInputMode, setPlayerInputMode] = useState<"existing" | "new">("existing");

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
      dateOfBirth: undefined,
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
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4 pb-20">
        <FormField
          control={form.control}
          name="kind"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-[#8b93a7]">種類</FormLabel>
              <Select value={(field.value || "完全") as any} onValueChange={field.onChange as any}>
                <FormControl>
                  <SelectTrigger className="bg-[#101827] text-white border-[#263149]">
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

        {/* Player Input Mode Toggle */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPlayerInputMode("existing")}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              playerInputMode === "existing"
                ? "bg-[#141d2e] text-[#60a5fa] border border-[#60a5fa]"
                : "bg-[#141d2e] text-[#8b93a7] border border-[#263149] hover:text-white"
            }`}
          >
            登録済み選手から選ぶ
          </button>
          <button
            type="button"
            onClick={() => setPlayerInputMode("new")}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              playerInputMode === "new"
                ? "bg-[#141d2e] text-[#60a5fa] border border-[#60a5fa]"
                : "bg-[#141d2e] text-[#8b93a7] border border-[#263149] hover:text-white"
            }`}
          >
            新規選手を追加
          </button>
        </div>

        {playerInputMode === "existing" ? (
          <FormField
            control={form.control}
            name="playerId"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-[#8b93a7]">選手</FormLabel>
                <Select
                  value={(field.value && field.value.trim().length > 0 ? field.value : UNSELECTED_PLAYER_VALUE) as any}
                  onValueChange={(v) => {
                    const next = v === UNSELECTED_PLAYER_VALUE ? "" : v;
                    field.onChange(next);
                    const selected = playerOptions.find((p) => p.id === next);
                    if (selected) {
                      form.setValue("playerName", selected.name || "");
                      form.setValue("dateOfBirth", (selected as any).dateOfBirth ?? undefined);
                      form.setValue("position", (selected as any).position ?? "");
                    }
                  }}
                >
                  <FormControl>
                    <SelectTrigger className="bg-[#101827] text-white border-[#263149]">
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
        ) : (
          <>
            <FormField
              control={form.control}
              name="playerName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-[#8b93a7]">選手名</FormLabel>
                  <FormControl>
                    <Input placeholder="例: 山田 太郎" {...field} className="bg-[#101827] text-white border-[#263149]" />
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
                  <FormItem>
                    <FormLabel className="text-[#8b93a7]">生年月日</FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        placeholder="2000-05-01"
                        value={field.value ?? ""}
                        onChange={field.onChange}
                        className="bg-[#101827] text-white border-[#263149]"
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
                    <FormLabel className="text-[#8b93a7]">Pos</FormLabel>
                    <Select value={(field.value || "") as any} onValueChange={field.onChange as any}>
                      <FormControl>
                        <SelectTrigger className="bg-[#101827] text-white border-[#263149]">
                          <SelectValue placeholder="選択" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="GK">GK</SelectItem>
                        <SelectItem value="DF">DF</SelectItem>
                        <SelectItem value="MF">MF</SelectItem>
                        <SelectItem value="FW">FW</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </>
        )}

        <FormField
          control={form.control}
          name="counterparty"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-[#8b93a7]">{label}</FormLabel>
              <FormControl>
                <Input placeholder="例: FC ○○" {...field} className="bg-[#101827] text-white border-[#263149]" />
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
              <FormLabel className="text-[#8b93a7]">金額</FormLabel>
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
                          <SelectTrigger className="w-24 bg-[#101827] text-white border-[#263149]" disabled={Boolean(fixedCurrency)}>
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
                    className="bg-[#101827] text-white border-[#263149]"
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
                  <FormLabel className="text-[#8b93a7]">年俸</FormLabel>
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
                              <SelectTrigger className="w-24 bg-[#101827] text-white border-[#263149]" disabled={Boolean(fixedCurrency)}>
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
                        className="bg-[#101827] text-white border-[#263149]"
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
                  <FormLabel className="text-[#8b93a7]">契約年数</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      inputMode="numeric"
                      placeholder="例: 3"
                      value={field.value ?? ""}
                      onChange={(e) => field.onChange(e.target.value === "" ? undefined : Number(e.target.value))}
                      className="bg-[#101827] text-white border-[#263149]"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </>
        ) : null}

        {/* Fixed Save Button */}
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-[#101827] border-t border-[#263149]">
          <Button type="submit" disabled={loading} className="w-full bg-[#4ade80] text-[#052e13] hover:bg-[#22c55e] font-medium">
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            保存する
          </Button>
        </div>
      </form>
    </Form>
  );
}
