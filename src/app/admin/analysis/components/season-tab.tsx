"use client";

import { Calendar, Flag, TrendingUp, Home, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SeasonRecord } from "../types";

interface SeasonTabProps {
  seasonRecords: SeasonRecord[];
}

export function SeasonTab({ seasonRecords }: SeasonTabProps) {
  return (
    <div className="relative overflow-hidden rounded-xl bg-slate-800/50 backdrop-blur-xl border border-slate-700">
      <div className="relative p-4 md:p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-slate-700" style={{clipPath: 'polygon(0 0, 85% 0, 100% 15%, 100% 85%, 85% 100%, 0 100%)'}}>
            <Calendar className="h-5 w-5 md:h-6 md:w-6 text-slate-400" />
          </div>
          <div className="space-y-1">
            <h3 className="text-lg md:text-xl font-bold text-white">シーズン別成績</h3>
            <p className="text-slate-400 text-xs md:text-sm">各シーズンの詳細戦績とAI分析結果</p>
          </div>
        </div>
        <div className="space-y-4">
          {seasonRecords.map((record) => (
            <div key={record.season} className="relative overflow-hidden rounded-lg bg-slate-700/50 backdrop-blur-sm border border-slate-600 hover:border-slate-500 transition-all">
              <div className="relative p-4 md:p-6">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-slate-700" style={{clipPath: 'polygon(25% 0, 100% 0, 75% 100%, 0 100%)'}}>
                      <Flag className="h-4 w-4 md:h-5 md:w-5 text-slate-400" />
                    </div>
                    <h4 className="font-bold text-lg md:text-xl text-white">{record.season}</h4>
                  </div>
                  <Badge className="bg-slate-700 text-slate-300 border border-slate-600">
                    <TrendingUp className="h-3 w-3 mr-1" />
                    勝率 {record.winRate.toFixed(1)}%
                  </Badge>
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  <div className="text-center p-3 bg-slate-800/50 rounded-lg border border-slate-600">
                    <p className="text-slate-400 text-sm mb-1">勝点</p>
                    <p className="text-xl md:text-2xl font-bold text-white">{record.points}</p>
                  </div>
                  <div className="text-center p-3 bg-slate-800/50 rounded-lg border border-slate-600">
                    <p className="text-slate-400 text-sm mb-1">勝-分-負</p>
                    <p className="text-xl md:text-2xl font-bold text-white">{record.wins}-{record.draws}-{record.losses}</p>
                  </div>
                  <div className="text-center p-3 bg-slate-800/50 rounded-lg border border-slate-600">
                    <p className="text-slate-400 text-sm mb-1">得点-失点</p>
                    <p className="text-xl md:text-2xl font-bold text-white">{record.goalsFor}-{record.goalsAgainst}</p>
                  </div>
                  <div className="text-center p-3 bg-slate-800/50 rounded-lg border border-slate-600">
                    <p className="text-slate-400 text-sm mb-1">得失点差</p>
                    <p className="text-xl md:text-2xl font-bold text-white">{record.goalDifference > 0 ? '+' : ''}{record.goalDifference}</p>
                  </div>
                </div>

                <div className="flex gap-4 md:gap-6 text-sm">
                  <div className="flex items-center gap-2 px-3 py-1 bg-slate-800/50 rounded-lg border border-slate-600">
                    <Home className="h-4 w-4 text-slate-400" />
                    <span className="text-slate-300">ホーム勝利: {record.homeWins}</span>
                  </div>
                  <div className="flex items-center gap-2 px-3 py-1 bg-slate-800/50 rounded-lg border border-slate-600">
                    <MapPin className="h-4 w-4 text-slate-400" />
                    <span className="text-slate-300">アウェイ勝利: {record.awayWins}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
