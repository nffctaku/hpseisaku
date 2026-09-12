"use client";

import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { useCallback, useEffect } from "react";
import { logProCtaClick, logProPaywallView, type PlanLimitType } from "@/lib/plan-analytics";

interface ProPaywallProps {
  uid: string;
  limitType: PlanLimitType;
  label: string;
  current: number;
  limit: number;
  proLabel?: string;
  sourcePage: string;
  onClose?: () => void;
}

export function ProPaywall({
  uid,
  limitType,
  label,
  current,
  limit,
  proLabel = "無制限",
  sourcePage,
  onClose,
}: ProPaywallProps) {
  const router = useRouter();

  useEffect(() => {
    void logProPaywallView({ uid, limitType, sourcePage });
  }, [uid, limitType, sourcePage]);

  const handleClick = useCallback(async () => {
    await logProCtaClick({ uid, limitType, sourcePage });
    router.push("/admin/plan");
  }, [uid, limitType, sourcePage, router]);

  return (
    <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-100">
      <p className="mb-2 font-bold">Freeプランでは{label}は{limit}まで登録できます</p>
      <div className="mb-3 flex items-center gap-3 text-xs">
        <span className="text-slate-300">現在：</span>
        <span className="font-black">{current} / {limit}</span>
        <span className="text-slate-400">Pro：</span>
        <span className="font-black text-emerald-300">{proLabel}</span>
      </div>
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          onClick={handleClick}
          className="rounded-xl bg-emerald-500 font-bold text-white hover:bg-emerald-600"
        >
          Proを見る
        </Button>
        {onClose && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            className="rounded-xl border-slate-600 bg-slate-800 text-slate-100 hover:bg-slate-700"
          >
            閉じる
          </Button>
        )}
      </div>
    </div>
  );
}
