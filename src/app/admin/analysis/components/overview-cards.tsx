"use client";

import { SeasonRecord } from "../types";

interface OverviewCardsProps {
  matches: Array<{ isCompleted: boolean }>;
  seasonRecords: SeasonRecord[];
}

export function OverviewCards({ matches, seasonRecords }: OverviewCardsProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
      <div className="relative overflow-hidden rounded-lg bg-gradient-to-br from-slate-800/50 to-slate-900/50 backdrop-blur-xl border border-slate-700/50 shadow-lg md:col-span-1">
        <div className="relative p-3 md:p-4">
          <div className="mb-2">
            <p className="text-blue-200 text-xs font-medium">総試合</p>
          </div>
          <p className="text-xl md:text-2xl font-bold text-white">
            {matches.filter(m => m.isCompleted).length}
          </p>
        </div>
      </div>
      
      <div className="relative overflow-hidden rounded-lg bg-gradient-to-br from-slate-800/50 to-slate-900/50 backdrop-blur-xl border border-slate-700/50 shadow-lg md:col-span-1">
        <div className="relative p-3 md:p-4">
          <div className="mb-2">
            <p className="text-green-200 text-xs font-medium">ホーム勝</p>
          </div>
          <p className="text-xl md:text-2xl font-bold text-white">
            {seasonRecords.reduce((sum, r) => sum + r.homeWins, 0)}
          </p>
        </div>
      </div>
      
      <div className="relative overflow-hidden rounded-lg bg-gradient-to-br from-slate-800/50 to-slate-900/50 backdrop-blur-xl border border-slate-700/50 shadow-lg md:col-span-1">
        <div className="relative p-3 md:p-4">
          <div className="mb-2">
            <p className="text-purple-200 text-xs font-medium">アウェイ勝</p>
          </div>
          <p className="text-xl md:text-2xl font-bold text-white">
            {seasonRecords.reduce((sum, r) => sum + r.awayWins, 0)}
          </p>
        </div>
      </div>
      
      <div className="relative overflow-hidden rounded-lg bg-gradient-to-br from-slate-800/50 to-slate-900/50 backdrop-blur-xl border border-slate-700/50 shadow-lg md:col-span-1">
        <div className="relative p-3 md:p-4">
          <div className="mb-2">
            <p className="text-orange-200 text-xs font-medium">勝率</p>
          </div>
          <p className="text-xl md:text-2xl font-bold text-white">
            {(() => {
              const totalWins = seasonRecords.reduce((sum, r) => sum + r.wins, 0);
              const totalMatches = seasonRecords.reduce((sum, r) => sum + r.wins + r.draws + r.losses, 0);
              return totalMatches > 0 ? `${((totalWins / totalMatches) * 100).toFixed(0)}%` : '0%';
            })()}
          </p>
        </div>
      </div>
    </div>
  );
}
