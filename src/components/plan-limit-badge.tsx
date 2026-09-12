"use client";

import { Info } from "lucide-react";

interface PlanLimitBadgeProps {
  plan: string;
  current: number;
  limit: number;
  label: string;
  unit?: string;
}

export function PlanLimitBadge({ plan, current, limit, label, unit = "" }: PlanLimitBadgeProps) {
  const tier = typeof plan === "string" ? plan.trim().toLowerCase() : "free";
  const isUnlimited = !Number.isFinite(limit);

  if (tier === "pro" || tier === "officia" || isUnlimited) {
    return (
      <div className="inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-500">
        <Info className="h-3 w-3" />
        <span>Proプラン：{label}は無制限</span>
      </div>
    );
  }

  const remaining = Math.max(0, limit - current);
  const nearLimit = remaining <= 1;

  return (
    <div
      className={`inline-flex flex-col gap-0.5 rounded-md border px-2.5 py-1.5 text-xs ${
        nearLimit
          ? "border-amber-200/50 bg-amber-500/10 text-amber-100"
          : "border-slate-200/50 bg-slate-100/50 text-slate-500"
      }`}
    >
      <div className="inline-flex items-center gap-1.5">
        <Info className="h-3 w-3" />
        <span className={nearLimit ? "font-semibold" : ""}>
          Freeプラン：{label}は{limit}{unit}まで
        </span>
      </div>
      <div className="pl-4.5 text-[11px]">
        現在 {current} / {limit} {unit}
        {remaining > 0 ? `（残り${remaining}${unit}）` : "（上限です）"}
      </div>
    </div>
  );
}
