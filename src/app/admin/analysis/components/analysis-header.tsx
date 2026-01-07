"use client";

import { Monitor } from "lucide-react";

export function AnalysisHeader() {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-800/50 to-slate-900/50 backdrop-blur-xl border border-slate-700/50 shadow-xl">
      <div className="relative p-4 md:p-8">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 md:p-3 bg-gradient-to-r from-blue-600 to-blue-500 rounded-lg shadow-lg">
              <Monitor className="h-6 w-6 md:h-8 md:w-8 text-white" />
            </div>
            <div className="space-y-1">
              <h1 className="text-xl md:text-3xl font-bold text-white">
                分析ダッシュボード
              </h1>
              <p className="text-blue-300 text-sm md:text-base">
                チームパフォーマンス分析
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
