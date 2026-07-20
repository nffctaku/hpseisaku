"use client";

import { BarChart3 } from "lucide-react";

export function AnalysisHeader() {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
        <BarChart3 className="h-6 w-6" />
      </div>
      <div>
        <h1 className="text-xl font-bold leading-tight text-white">分析ダッシュボード</h1>
        <p className="mt-0.5 text-sm text-slate-300">チームパフォーマンス分析</p>
      </div>
    </div>
  );
}
