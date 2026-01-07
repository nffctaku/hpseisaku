"use client";

import { useState } from "react";
import { SeasonRecord, PlayerStats } from "../types";
import { Trophy, Target, Shield, TrendingUp, ChevronDown, ChevronUp, Users } from "lucide-react";
import Link from "next/link";

interface OverallSectionProps {
  matches: Array<{ isCompleted: boolean }>;
  seasonRecords: SeasonRecord[];
  mainStatsData: any[];
  topGoalscorers: PlayerStats[];
  topAssists: PlayerStats[];
}

export function OverallSection({
  matches,
  seasonRecords,
  mainStatsData,
  topGoalscorers,
  topAssists
}: OverallSectionProps) {
  const [showMoreGoals, setShowMoreGoals] = useState(false);
  const [showMoreAssists, setShowMoreAssists] = useState(false);
  
  const totalMatches = matches.filter(m => m.isCompleted).length;
  const totalWins = seasonRecords.reduce((sum, r) => sum + r.wins, 0);
  const totalDraws = seasonRecords.reduce((sum, r) => sum + r.draws, 0);
  const totalLosses = seasonRecords.reduce((sum, r) => sum + r.losses, 0);
  const totalGoalsFor = seasonRecords.reduce((sum, r) => sum + r.goalsFor, 0);
  const totalGoalsAgainst = seasonRecords.reduce((sum, r) => sum + r.goalsAgainst, 0);
  const winRate = totalMatches > 0 ? ((totalWins / totalMatches) * 100).toFixed(1) : '0.0';

  return (
    <div className="space-y-6">
      {/* 試合成績セクション */}
      <div className="relative overflow-hidden rounded-xl bg-slate-800/50 backdrop-blur-xl border border-slate-700">
        <div className="relative p-6">
          <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
            <Trophy className="h-5 w-5 text-yellow-400" />
            通算成績
          </h2>
          
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
            <div className="text-center">
              <p className="text-slate-400 text-sm mb-1">試合数</p>
              <p className="text-2xl font-bold text-white">{totalMatches}</p>
            </div>
            <div className="text-center">
              <p className="text-purple-400 text-sm mb-1 flex items-center justify-center gap-1">
                <TrendingUp className="h-4 w-4" />
                勝率
              </p>
              <p className="text-2xl font-bold text-purple-400">{winRate}%</p>
            </div>
            <div className="text-center hidden md:block"></div>
          </div>

          <div className="grid grid-cols-3 md:grid-cols-3 gap-4 mb-4">
            <div className="text-center">
              <p className="text-green-400 text-sm mb-1">勝</p>
              <p className="text-2xl font-bold text-green-400">{totalWins}</p>
            </div>
            <div className="text-center">
              <p className="text-yellow-400 text-sm mb-1">分</p>
              <p className="text-2xl font-bold text-yellow-400">{totalDraws}</p>
            </div>
            <div className="text-center">
              <p className="text-red-400 text-sm mb-1">負</p>
              <p className="text-2xl font-bold text-red-400">{totalLosses}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="text-center">
              <p className="text-blue-400 text-sm mb-1">得点</p>
              <p className="text-2xl font-bold text-blue-400">{totalGoalsFor}</p>
            </div>
            <div className="text-center">
              <p className="text-orange-400 text-sm mb-1">失点</p>
              <p className="text-2xl font-bold text-orange-400">{totalGoalsAgainst}</p>
            </div>
            <div className="text-center hidden md:block"></div>
          </div>
        </div>
      </div>

      {/* 歴代ゴール数 Top10 */}
      <div className="relative overflow-hidden rounded-xl bg-slate-800/50 backdrop-blur-xl border border-slate-700">
        <div className="relative p-6">
          <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
            <Target className="h-5 w-5 text-blue-400" />
            歴代ゴール数 Top10
          </h2>
          
          <div className="space-y-3">
            {/* トップ3のみ表示 */}
            {topGoalscorers.slice(0, 3).map((player, index) => (
              <div key={player.playerId} className="flex items-center justify-between p-3 bg-slate-700/30 rounded-lg border border-slate-600/50">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                    index === 0 ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/50' :
                    index === 1 ? 'bg-gray-400/20 text-gray-300 border border-gray-400/50' :
                    index === 2 ? 'bg-orange-600/20 text-orange-400 border border-orange-600/50' :
                    'bg-slate-600/20 text-slate-300 border border-slate-600/50'
                  }`}>
                    {index + 1}
                  </div>
                  <span className="text-white font-medium">{player.playerName}</span>
                </div>
                <div className="text-right">
                  <p className="text-blue-400 font-bold text-lg">{player.goals}</p>
                  <p className="text-slate-400 text-xs">{player.matches}試合</p>
                </div>
              </div>
            ))}
            
            {/* 4位以降（タップで表示） */}
            {showMoreGoals && topGoalscorers.slice(3, 10).map((player, index) => (
              <div key={player.playerId} className="flex items-center justify-between p-3 bg-slate-700/20 rounded-lg border border-slate-600/30">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm bg-slate-600/20 text-slate-300 border border-slate-600/50">
                    {index + 4}
                  </div>
                  <span className="text-white font-medium">{player.playerName}</span>
                </div>
                <div className="text-right">
                  <p className="text-blue-400 font-bold text-lg">{player.goals}</p>
                  <p className="text-slate-400 text-xs">{player.matches}試合</p>
                </div>
              </div>
            ))}
            
            {/* もっと見るボタン */}
            {topGoalscorers.length > 3 && (
              <button
                onClick={() => setShowMoreGoals(!showMoreGoals)}
                className="w-full flex items-center justify-center gap-2 p-3 bg-slate-700/30 rounded-lg border border-slate-600/50 hover:bg-slate-700/40 transition-colors"
              >
                <span className="text-slate-300 text-sm">
                  {showMoreGoals ? '閉じる' : `4位〜${Math.min(topGoalscorers.length, 10)}位を表示`}
                </span>
                {showMoreGoals ? (
                  <ChevronUp className="h-4 w-4 text-slate-300" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-slate-300" />
                )}
              </button>
            )}
            
            {topGoalscorers.length === 0 && (
              <div className="text-center text-slate-400 py-8">
                <p className="text-sm">データがありません</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 歴代アシスト数 Top10 */}
      <div className="relative overflow-hidden rounded-xl bg-slate-800/50 backdrop-blur-xl border border-slate-700">
        <div className="relative p-6">
          <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-green-400" />
            歴代アシスト数 Top10
          </h2>
          
          <div className="space-y-3">
            {/* トップ3のみ表示 */}
            {topAssists.slice(0, 3).map((player, index) => (
              <div key={player.playerId} className="flex items-center justify-between p-3 bg-slate-700/30 rounded-lg border border-slate-600/50">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                    index === 0 ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/50' :
                    index === 1 ? 'bg-gray-400/20 text-gray-300 border border-gray-400/50' :
                    index === 2 ? 'bg-orange-600/20 text-orange-400 border border-orange-600/50' :
                    'bg-slate-600/20 text-slate-300 border border-slate-600/50'
                  }`}>
                    {index + 1}
                  </div>
                  <span className="text-white font-medium">{player.playerName}</span>
                </div>
                <div className="text-right">
                  <p className="text-green-400 font-bold text-lg">{player.assists}</p>
                  <p className="text-slate-400 text-xs">{player.matches}試合</p>
                </div>
              </div>
            ))}
            
            {/* 4位以降（タップで表示） */}
            {showMoreAssists && topAssists.slice(3, 10).map((player, index) => (
              <div key={player.playerId} className="flex items-center justify-between p-3 bg-slate-700/20 rounded-lg border border-slate-600/30">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm bg-slate-600/20 text-slate-300 border border-slate-600/50">
                    {index + 4}
                  </div>
                  <span className="text-white font-medium">{player.playerName}</span>
                </div>
                <div className="text-right">
                  <p className="text-green-400 font-bold text-lg">{player.assists}</p>
                  <p className="text-slate-400 text-xs">{player.matches}試合</p>
                </div>
              </div>
            ))}
            
            {/* もっと見るボタン */}
            {topAssists.length > 3 && (
              <button
                onClick={() => setShowMoreAssists(!showMoreAssists)}
                className="w-full flex items-center justify-center gap-2 p-3 bg-slate-700/30 rounded-lg border border-slate-600/50 hover:bg-slate-700/40 transition-colors"
              >
                <span className="text-slate-300 text-sm">
                  {showMoreAssists ? '閉じる' : `4位〜${Math.min(topAssists.length, 10)}位を表示`}
                </span>
                {showMoreAssists ? (
                  <ChevronUp className="h-4 w-4 text-slate-300" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-slate-300" />
                )}
              </button>
            )}
            
            {topAssists.length === 0 && (
              <div className="text-center text-slate-400 py-8">
                <p className="text-sm">データがありません</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* チーム別対戦成績ボタン */}
      <div className="relative overflow-hidden rounded-xl bg-slate-800/50 backdrop-blur-xl border border-slate-700">
        <div className="relative p-6">
          <Link href="/admin/analysis/team-vs-team">
            <button className="w-full flex items-center justify-center gap-3 p-4 bg-gradient-to-r from-indigo-600/30 to-purple-600/30 border border-indigo-500/50 rounded-lg hover:from-indigo-600/40 hover:to-purple-600/40 transition-all duration-300 group">
              <Users className="h-5 w-5 text-indigo-300 group-hover:text-indigo-200" />
              <span className="text-indigo-200 font-medium text-lg group-hover:text-white">チーム別対戦成績</span>
            </button>
          </Link>
        </div>
      </div>
    </div>
  );
}
