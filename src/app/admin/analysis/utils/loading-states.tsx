"use client";

import { Cpu, Terminal } from "lucide-react";

export function LoadingState() {
  return (
    <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-blue-600/10 via-cyan-600/10 to-teal-600/10 backdrop-blur-xl border border-blue-500/20">
      <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 to-cyan-500/5"></div>
      <div className="relative p-8">
        <div className="flex flex-col items-center justify-center space-y-4">
          <div className="relative">
            <div className="absolute inset-0 bg-cyan-500/30 blur-xl"></div>
            <div className="relative p-3 bg-gradient-to-r from-blue-600 to-cyan-600 rounded-xl">
              <Cpu className="h-8 w-8 text-white animate-pulse" />
            </div>
          </div>
          <div className="text-center space-y-2">
            <p className="text-white font-medium">システム処理中</p>
            <p className="text-cyan-200 text-sm">データを分析しています...</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ErrorState({ error }: { error: string }) {
  return (
    <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-red-600/10 via-orange-600/10 to-red-600/10 backdrop-blur-xl border border-red-500/20">
      <div className="absolute inset-0 bg-gradient-to-r from-red-500/5 to-orange-500/5"></div>
      <div className="relative p-8">
        <div className="flex flex-col items-center justify-center space-y-4">
          <div className="relative">
            <div className="absolute inset-0 bg-red-500/30 blur-xl"></div>
            <div className="relative p-3 bg-gradient-to-r from-red-600 to-orange-600 rounded-xl">
              <Terminal className="h-8 w-8 text-white" />
            </div>
          </div>
          <div className="text-center space-y-2">
            <p className="text-red-300 font-medium">エラーが発生しました</p>
            <p className="text-red-200 text-sm">{error}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function NoTeamState() {
  return (
    <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-slate-600/10 via-slate-700/10 to-slate-600/10 backdrop-blur-xl border border-slate-500/20">
      <div className="absolute inset-0 bg-gradient-to-r from-slate-500/5 to-slate-600/5"></div>
      <div className="relative p-8">
        <div className="flex flex-col items-center justify-center space-y-4">
          <div className="text-center space-y-2">
            <p className="text-slate-300 font-medium">チームが設定されていません</p>
            <p className="text-slate-400 text-sm">まずチームを設定してください</p>
          </div>
        </div>
      </div>
    </div>
  );
}
