"use client";

import { useEffect, useState } from "react";
import { SeasonRecord, PlayerStats } from "../types";
import { Trophy, Target, Shield, TrendingUp, ChevronDown, ChevronUp, Users } from "lucide-react";
import Link from "next/link";

interface OverallSectionProps {
  matches: Array<{ isCompleted: boolean }>;
  filteredMatches: any[];
  seasonRecords: SeasonRecord[];
  mainStatsData: any[];
  topGoalscorers: PlayerStats[];
  topAssists: PlayerStats[];
}

export function OverallSection({
  matches,
  filteredMatches,
  seasonRecords,
  mainStatsData,
  topGoalscorers,
  topAssists
}: OverallSectionProps) {
  const [showMoreGoals, setShowMoreGoals] = useState(false);
  const [showMoreAssists, setShowMoreAssists] = useState(false);
  
  const completed = filteredMatches.filter((m: any) => m?.isCompleted && (m.result === 'win' || m.result === 'draw' || m.result === 'loss'));
  const totalWins = completed.filter((m: any) => m.result === 'win').length;
  const totalDraws = completed.filter((m: any) => m.result === 'draw').length;
  const totalLosses = completed.filter((m: any) => m.result === 'loss').length;
  const totalMatches = completed.length;
  const totalGoalsFor = completed.reduce((sum: number, m: any) => sum + (typeof m.goalsFor === 'number' ? m.goalsFor : 0), 0);
  const totalGoalsAgainst = completed.reduce((sum: number, m: any) => sum + (typeof m.goalsAgainst === 'number' ? m.goalsAgainst : 0), 0);
  const winRate = totalMatches > 0 ? ((totalWins / totalMatches) * 100).toFixed(1) : '0.0';
  const goalDifference = totalGoalsFor - totalGoalsAgainst;

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;

    const completedButNoResult = filteredMatches.filter((m: any) => m?.isCompleted && !(m.result === 'win' || m.result === 'draw' || m.result === 'loss'));
    const hasScoresButNotCompleted = filteredMatches.filter((m: any) => {
      const hasScores = m?.scoreHome !== null && m?.scoreHome !== undefined && m?.scoreAway !== null && m?.scoreAway !== undefined;
      return hasScores && !m?.isCompleted;
    });

    console.log("[OverallSection] filteredMatches:", filteredMatches.length);
    console.log("[OverallSection] completed (counted):", completed.length, { wins: totalWins, draws: totalDraws, losses: totalLosses });
    console.log(
      "[OverallSection] completedButNoResult:",
      completedButNoResult.length,
      completedButNoResult.slice(0, 5).map((m: any) => ({ id: m.id, scoreHome: m.scoreHome, scoreAway: m.scoreAway, result: m.result, isHome: m.isHome }))
    );
    console.log(
      "[OverallSection] hasScoresButNotCompleted:",
      hasScoresButNotCompleted.length,
      hasScoresButNotCompleted.slice(0, 5).map((m: any) => ({ id: m.id, scoreHome: m.scoreHome, scoreAway: m.scoreAway, isCompleted: m.isCompleted, result: m.result }))
    );
  }, [filteredMatches, completed.length, totalWins, totalDraws, totalLosses]);

  return (
    <div className="space-y-6">
      {/* 試合成績セクション */}
      <div className="rounded-3xl border border-slate-700 bg-slate-800/50 backdrop-blur-xl p-5 shadow-sm">
        <div className="text-sm font-medium text-slate-300">勝率</div>
        <div className="mt-2 flex items-end gap-3">
          <div className="text-4xl font-bold leading-none tracking-tight text-white">{winRate}%</div>
          <div className="pb-1 text-sm text-slate-400">{totalMatches}試合</div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          <div className="h-1.5 rounded-full bg-green-600" />
          <div className="h-1.5 rounded-full bg-slate-500" />
          <div className="h-1.5 rounded-full bg-red-500" />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
        <div className="rounded-2xl bg-slate-800/50 backdrop-blur-xl border border-slate-700 p-4 text-center shadow-sm">
          <div className="text-sm text-slate-300">勝</div>
          <div className="mt-2 text-xl font-bold text-green-400">{totalWins}</div>
        </div>
        <div className="rounded-2xl bg-slate-800/50 backdrop-blur-xl border border-slate-700 p-4 text-center shadow-sm">
          <div className="text-sm text-slate-300">分</div>
          <div className="mt-2 text-xl font-bold text-slate-300">{totalDraws}</div>
        </div>
        <div className="rounded-2xl bg-slate-800/50 backdrop-blur-xl border border-slate-700 p-4 text-center shadow-sm">
          <div className="text-sm text-slate-300">負</div>
          <div className="mt-2 text-xl font-bold text-red-400">{totalLosses}</div>
        </div>
        <div className="rounded-2xl bg-slate-800/50 backdrop-blur-xl border border-slate-700 p-4 text-center shadow-sm">
          <div className="text-sm text-slate-300">得点</div>
          <div className="mt-2 text-xl font-bold text-blue-400">{totalGoalsFor}</div>
        </div>
        <div className="rounded-2xl bg-slate-800/50 backdrop-blur-xl border border-slate-700 p-4 text-center shadow-sm">
          <div className="text-sm text-slate-300">失点</div>
          <div className="mt-2 text-xl font-bold text-orange-400">{totalGoalsAgainst}</div>
        </div>
        <div className="rounded-2xl bg-slate-800/50 backdrop-blur-xl border border-slate-700 p-4 text-center shadow-sm">
          <div className="text-sm text-slate-300">得失差</div>
          <div className={`mt-2 text-xl font-bold ${goalDifference >= 0 ? "text-green-400" : "text-red-400"}`}>{goalDifference}</div>
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
