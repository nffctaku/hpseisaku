import React from "react";
import Link from "next/link";

export function ProPlanNotice() {
  return (
    <div className="no-print rounded-lg border border-white/10 bg-white/5 p-4">
      <div className="text-sm font-semibold mb-1">A3出力は Pro プラン限定です</div>
      <div className="text-sm text-muted-foreground mb-3">
        Free プランでは A4 のみご利用いただけます。
      </div>
      <Link
        href="/admin/plan"
        className="inline-flex items-center justify-center px-4 py-2 rounded-md bg-emerald-600 text-white text-sm font-semibold"
      >
        Proプランを見る
      </Link>
    </div>
  );
}
