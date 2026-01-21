"use client";

import { useMemo } from "react";
import { Pie, PieChart, ResponsiveContainer, Cell, Tooltip } from "recharts";

type TransfersBalancePieProps = {
  inTotal: number;
  outTotal: number;
  balanceTotal: number;
  currencyLabel?: string;
};

const COLORS = {
  in: "#ef4444",
  out: "#10b981",
};

const formatAmount = (n: number, currencyLabel: string) => {
  const v0 = Number.isFinite(n) ? n : 0;
  const sign = v0 < 0 ? "-" : "";
  const abs = Math.abs(v0);

  const symbol = currencyLabel === "JPY" ? "￥" : currencyLabel === "EUR" ? "€" : currencyLabel === "GBP" ? "￡" : currencyLabel;

  if (currencyLabel === "JPY") {
    if (abs >= 10_000) {
      const man = abs / 10_000;
      const decimals = man >= 100 ? 0 : man >= 10 ? 1 : 2;
      const str = man.toFixed(decimals).replace(/\.0+$/, "").replace(/(\.\d*[1-9])0+$/, "$1");
      return `${sign}${symbol}${str}万`;
    }
    return `${sign}${symbol}${Math.round(abs).toLocaleString("ja-JP")}`;
  }

  // EUR/GBP etc: use M (and K for small numbers)
  if (abs >= 1_000_000) {
    const m = abs / 1_000_000;
    const decimals = m >= 100 ? 0 : m >= 10 ? 1 : 2;
    const str = m.toFixed(decimals).replace(/\.0+$/, "").replace(/(\.\d*[1-9])0+$/, "$1");
    return `${sign}${symbol}${str}M`;
  }
  if (abs >= 1_000) {
    const k = abs / 1_000;
    const decimals = k >= 100 ? 0 : k >= 10 ? 1 : 2;
    const str = k.toFixed(decimals).replace(/\.0+$/, "").replace(/(\.\d*[1-9])0+$/, "$1");
    return `${sign}${symbol}${str}K`;
  }
  return `${sign}${symbol}${Math.round(abs).toLocaleString("ja-JP")}`;
};

export function TransfersBalancePie({ inTotal, outTotal, balanceTotal, currencyLabel = "JPY" }: TransfersBalancePieProps) {
  const currencySymbol = currencyLabel === "JPY" ? "￥" : currencyLabel === "EUR" ? "€" : currencyLabel === "GBP" ? "￡" : currencyLabel;
  const data = useMemo(() => {
    const safeIn = Number.isFinite(inTotal) ? Math.max(0, inTotal) : 0;
    const safeOut = Number.isFinite(outTotal) ? Math.max(0, outTotal) : 0;
    return [
      { key: "in", name: "IN", value: safeIn },
      { key: "out", name: "OUT", value: safeOut },
    ];
  }, [inTotal, outTotal]);

  const total = (data[0].value || 0) + (data[1].value || 0);

  const toneClass = balanceTotal < 0 ? "text-red-600" : balanceTotal > 0 ? "text-emerald-600" : "";

  return (
    <div className="rounded-lg bg-white px-4 py-4 shadow-md">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="text-sm font-semibold">移籍収支（{currencySymbol}）</div>
      </div>

      {total <= 0 ? (
        <div className="py-10 text-sm text-muted-foreground text-center">金額データがありません。</div>
      ) : (
        <div className="relative h-56 w-full">
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <div className="text-xs text-muted-foreground">収支</div>
            <div className={`mt-1 text-base font-semibold ${toneClass}`}>{formatAmount(balanceTotal, currencyLabel)}</div>
          </div>

          <div className="h-full w-full drop-shadow-lg">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={2}
                  isAnimationActive={false}
                >
                  {data.map((entry) => (
                    <Cell
                      key={entry.key}
                      fill={entry.key === "in" ? COLORS.in : COLORS.out}
                      stroke="#ffffff"
                      strokeWidth={2}
                    />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v: any, name: any) => {
                    const value = typeof v === "number" ? v : Number(v);
                    return [formatAmount(value, currencyLabel), String(name)];
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {total > 0 && (
        <div className="mt-2 flex items-center justify-center gap-4 text-xs">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: COLORS.in }} />
            <span className="font-medium">IN</span>
            <span className="text-red-600 font-semibold">{formatAmount(inTotal, currencyLabel)}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: COLORS.out }} />
            <span className="font-medium">OUT</span>
            <span className="text-emerald-600 font-semibold">{formatAmount(outTotal, currencyLabel)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
