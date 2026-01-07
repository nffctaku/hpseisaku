"use client";

import { Bot, Activity } from "lucide-react";
import type { MainStats } from "../types";

interface MainStatsProps {
  mainStatsData: MainStats[];
}

export function MainStats({ mainStatsData }: MainStatsProps) {
  return (
    <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-slate-900/95 via-slate-800/95 to-slate-900/95 backdrop-blur-xl border border-slate-700/50 shadow-2xl">
      <div className="absolute inset-0 bg-gradient-to-r from-blue-600/10 to-transparent"></div>
      <div className="relative p-4 md:p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-gradient-to-r from-blue-600 to-blue-500 rounded-lg shadow-lg" style={{clipPath: 'polygon(0 0, 85% 0, 100% 15%, 100% 85%, 85% 100%, 0 100%)'}}>
            <Bot className="h-5 w-5 md:h-6 md:w-6 text-white" />
          </div>
          <div className="space-y-1">
            <h3 className="text-lg md:text-xl font-bold text-white">主要スタッツ</h3>
            <p className="text-blue-300 text-xs md:text-sm">チームパフォーマンス分析</p>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 md:gap-4">
          {mainStatsData.map((stat, index) => (
            <div key={stat.id} className="relative overflow-hidden rounded-lg bg-gradient-to-br from-slate-800/50 to-slate-900/50 backdrop-blur-sm border border-slate-700/30 hover:border-blue-500/50 transition-all duration-300 group">
              <div className="absolute inset-0 bg-gradient-to-r from-blue-600/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
              <div className="relative p-3 md:p-4 text-center">
                <div className="w-6 h-6 md:w-8 md:h-8 mx-auto mb-2 md:mb-3 bg-gradient-to-r from-blue-600 to-blue-500 rounded-lg shadow-md flex items-center justify-center">
                  <span className="text-white font-bold text-xs md:text-sm">{index + 1}</span>
                </div>
                <p className="text-blue-200 text-xs md:text-sm font-medium mb-1 md:mb-2">{stat.name}</p>
                <p className="text-lg md:text-2xl font-bold text-white mb-1">
                  {stat.isPercentage ? 
                    `${stat.average.toFixed(1)}%` : 
                    stat.average.toFixed(1)
                  }
                </p>
                <div className="flex items-center justify-center gap-1 text-xs text-blue-400">
                  <Activity className="h-2 w-2 md:h-3 md:w-3" />
                  <span className="hidden md:inline">平均</span>
                  <span className="md:hidden">平均</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
