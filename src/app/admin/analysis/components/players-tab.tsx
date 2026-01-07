"use client";

import { Goal, Users, Trophy } from "lucide-react";
import { PlayerStats } from "../types";

interface PlayersTabProps {
  topGoalscorers: PlayerStats[];
  topAssists: PlayerStats[];
}

export function PlayersTab({ topGoalscorers, topAssists }: PlayersTabProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
      <div className="relative overflow-hidden rounded-xl bg-slate-800/50 backdrop-blur-xl border border-slate-700">
        <div className="relative p-4 md:p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-slate-700" style={{clipPath: 'polygon(0 0, 80% 0, 100% 20%, 100% 80%, 80% 100%, 0 100%)'}}>
              <Goal className="h-5 w-5 md:h-6 md:w-6 text-slate-400" />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg md:text-xl font-bold text-white">ゴールランキング</h3>
              <p className="text-slate-400 text-xs md:text-sm">AI分析によるTop 3ゴールスコアラー</p>
            </div>
          </div>
          <div className="space-y-3 md:space-y-4">
            {topGoalscorers.map((player, index) => (
              <div key={player.playerId} className="relative overflow-hidden rounded-lg bg-slate-700/50 backdrop-blur-sm border border-slate-600 hover:border-slate-500 transition-all">
                <div className="relative p-3 md:p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 md:gap-3">
                      <div className={`relative w-8 h-8 md:w-10 md:h-10 flex items-center justify-center font-bold text-white ${
                        index === 0 ? 'bg-slate-600' : 
                        index === 1 ? 'bg-slate-700' : 
                        'bg-slate-800'
                      }`} style={{clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)'}}>
                        <div className="absolute inset-0 bg-white/20 blur-sm"></div>
                        <span className="relative text-sm md:text-base">{index + 1}</span>
                      </div>
                      <div className="space-y-0.5 md:space-y-1">
                        <p className="font-semibold text-white text-sm md:text-base">{player.playerName}</p>
                        <div className="flex items-center gap-1 text-xs text-slate-400">
                          <Trophy className="h-2 w-2 md:h-3 md:w-3" />
                          <span className="hidden md:inline">Top Scorer</span>
                          <span className="md:hidden">得点王</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-lg md:text-2xl text-slate-300">{player.goals}</p>
                      <p className="text-xs text-slate-400">{player.matches}試合</p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="relative overflow-hidden rounded-xl bg-slate-800/50 backdrop-blur-xl border border-slate-700">
        <div className="relative p-4 md:p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-slate-700" style={{clipPath: 'polygon(20% 0, 100% 0, 80% 100%, 0 100%)'}}>
              <Users className="h-5 w-5 md:h-6 md:w-6 text-slate-400" />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg md:text-xl font-bold text-white">アシストランキング</h3>
              <p className="text-slate-400 text-xs md:text-sm">AI分析によるTop 3アシストプロバイダー</p>
            </div>
          </div>
          <div className="space-y-3 md:space-y-4">
            {topAssists.map((player, index) => (
              <div key={player.playerId} className="relative overflow-hidden rounded-lg bg-slate-700/50 backdrop-blur-sm border border-slate-600 hover:border-slate-500 transition-all">
                <div className="relative p-3 md:p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 md:gap-3">
                      <div className={`relative w-8 h-8 md:w-10 md:h-10 flex items-center justify-center font-bold text-white ${
                        index === 0 ? 'bg-slate-600' : 
                        index === 1 ? 'bg-slate-700' : 
                        'bg-slate-800'
                      }`} style={{clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)'}}>
                        <div className="absolute inset-0 bg-white/20 blur-sm"></div>
                        <span className="relative text-sm md:text-base">{index + 1}</span>
                      </div>
                      <div className="space-y-0.5 md:space-y-1">
                        <p className="font-semibold text-white text-sm md:text-base">{player.playerName}</p>
                        <div className="flex items-center gap-1 text-xs text-slate-400">
                          <Users className="h-2 w-2 md:h-3 md:w-3" />
                          <span className="hidden md:inline">Top Provider</span>
                          <span className="md:hidden">アシスト王</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-lg md:text-2xl text-slate-300">{player.assists}</p>
                      <p className="text-xs text-slate-400">{player.matches}試合</p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
