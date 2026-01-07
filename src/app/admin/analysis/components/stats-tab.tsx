"use client";

import { useState } from "react";
import { Layers, Command, Activity, Database, Gauge } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { MainStats } from "../types";

const MAIN_STATS = [
  { id: "possession", name: "ボール支配率", isPercentage: true },
  { id: "shots", name: "シュート数", isPercentage: false },
  { id: "xg", name: "xG", isPercentage: false },
  { id: "passes", name: "パス数", isPercentage: false },
  { id: "passAccuracy", name: "パス成功率", isPercentage: true },
];

interface StatsTabProps {
  mainStatsData: MainStats[];
}

export function StatsTab({ mainStatsData }: StatsTabProps) {
  const [selectedStats, setSelectedStats] = useState<string[]>(MAIN_STATS.map(s => s.id));

  return (
    <div className="relative overflow-hidden rounded-xl bg-slate-800/50 backdrop-blur-xl border border-slate-700">
      <div className="relative p-4 md:p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-slate-700" style={{clipPath: 'polygon(15% 0, 100% 0, 85% 100%, 0 100%)'}}>
            <Layers className="h-5 w-5 md:h-6 md:w-6 text-slate-400" />
          </div>
          <div className="space-y-1">
            <h3 className="text-lg md:text-xl font-bold text-white">スタッツ集計</h3>
            <p className="text-slate-400 text-xs md:text-sm">15項目から抜粋した主要スタッツのAI分析</p>
          </div>
        </div>
        <div className="space-y-6">
          <div className="p-3 md:p-4 bg-slate-700/50 rounded-lg border border-slate-600">
            <p className="text-white font-medium mb-3 flex items-center gap-2 text-sm md:text-base">
              <Command className="h-3 w-3 md:h-4 md:w-4 text-slate-400" />
              表示項目選択：
            </p>
            <div className="flex flex-wrap gap-2">
              {MAIN_STATS.map((stat) => (
                <Badge
                  key={stat.id}
                  variant={selectedStats.includes(stat.id) ? "default" : "outline"}
                  className={`cursor-pointer transition-all duration-300 text-xs ${
                    selectedStats.includes(stat.id) 
                      ? "bg-slate-700 text-white border-slate-600 hover:bg-slate-600" 
                      : "border-slate-600 text-slate-400 hover:text-white hover:border-slate-500"
                  }`}
                  onClick={() => {
                    if (selectedStats.includes(stat.id)) {
                      setSelectedStats(selectedStats.filter(s => s !== stat.id));
                    } else {
                      setSelectedStats([...selectedStats, stat.id]);
                    }
                  }}
                >
                  <div className="flex items-center gap-1">
                    <Activity className="h-2 w-2 md:h-3 md:w-3" />
                    {stat.name}
                  </div>
                </Badge>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
            <div className="relative overflow-hidden rounded-lg bg-slate-700/50 backdrop-blur-sm border border-slate-600">
              <div className="relative p-3 md:p-4">
                <h4 className="font-bold text-white mb-4 flex items-center gap-2 text-sm md:text-base">
                  <Database className="h-4 w-4 md:h-5 md:w-5 text-slate-400" style={{clipPath: 'polygon(0 0, 80% 0, 100% 50%, 80% 100%, 0 100%)'}} />
                  合計値
                </h4>
                <div className="space-y-3">
                  {mainStatsData.map((stat) => (
                    <div key={stat.id} className="flex justify-between items-center p-3 bg-slate-800/50 rounded-lg border border-slate-600 hover:bg-slate-800 transition-all">
                      <span className="font-medium text-white text-sm">{stat.name}</span>
                      <span className="font-bold text-slate-300 text-sm">
                        {stat.isPercentage ? 
                          `${stat.total.toFixed(1)}%` : 
                          Math.round(stat.total)
                        }
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="relative overflow-hidden rounded-lg bg-slate-700/50 backdrop-blur-sm border border-slate-600">
              <div className="relative p-3 md:p-4">
                <h4 className="font-bold text-white mb-4 flex items-center gap-2 text-sm md:text-base">
                  <Gauge className="h-4 w-4 md:h-5 md:w-5 text-slate-400" style={{clipPath: 'polygon(20% 0, 100% 0, 100% 100%, 0 100%)'}} />
                  1試合平均
                </h4>
                <div className="space-y-3">
                  {mainStatsData.map((stat) => (
                    <div key={stat.id} className="flex justify-between items-center p-3 bg-slate-800/50 rounded-lg border border-slate-600 hover:bg-slate-800 transition-all">
                      <span className="font-medium text-white text-sm">{stat.name}</span>
                      <span className="font-bold text-slate-300 text-sm">
                        {stat.isPercentage ? 
                          `${stat.average.toFixed(1)}%` : 
                          stat.average.toFixed(1)
                        }
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
