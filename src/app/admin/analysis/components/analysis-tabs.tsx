"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Gauge, BarChart3, Calendar, TrendingUp, Users } from "lucide-react";
import { OverviewCards } from "./overview-cards";
import { MainStats } from "./main-stats";
import { StatsTab } from "./stats-tab";
import { SeasonTab } from "./season-tab";
import { PlayersTab } from "./players-tab";
import { MainStats as MainStatsType, SeasonRecord, PlayerStats } from "../types";

interface AnalysisTabsProps {
  matches: Array<{ isCompleted: boolean }>;
  seasonRecords: SeasonRecord[];
  mainStatsData: MainStatsType[];
  topGoalscorers: PlayerStats[];
  topAssists: PlayerStats[];
}

export function AnalysisTabs({
  matches,
  seasonRecords,
  mainStatsData,
  topGoalscorers,
  topAssists
}: AnalysisTabsProps) {
  console.log('[AnalysisTabs] Received data:', {
    matchesCount: matches?.length || 0,
    seasonRecordsCount: seasonRecords?.length || 0,
    mainStatsCount: mainStatsData?.length || 0,
    topGoalscorersCount: topGoalscorers?.length || 0,
    sampleMatch: matches?.[0],
    sampleMainStats: mainStatsData?.[0]
  });

  return (
    <Tabs defaultValue="overview" className="space-y-6">
      <TabsList className="relative overflow-hidden rounded-xl bg-gradient-to-br from-slate-800/95 via-slate-900/95 to-slate-800/95 backdrop-blur-xl border border-slate-700/50 shadow-xl p-2 mx-auto max-w-2xl">
        <div className="absolute inset-0 bg-gradient-to-r from-blue-600/10 to-transparent"></div>
        <div className="relative grid grid-cols-4 md:grid-cols-5 gap-1 w-full">
          <TabsTrigger value="overview" className="relative data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-600 data-[state=active]:to-blue-500 data-[state=active]:text-white text-slate-300 hover:text-white hover:bg-gradient-to-r hover:from-blue-600/50 hover:to-blue-500/50 transition-all duration-300 rounded-lg font-medium flex flex-col items-center gap-1 py-3 px-1 min-h-[60px]">
            <Gauge className="h-4 w-4 flex-shrink-0" />
            <span className="text-xs font-medium leading-tight">概要</span>
          </TabsTrigger>
          <TabsTrigger value="stats" className="relative data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-600 data-[state=active]:to-blue-500 data-[state=active]:text-white text-slate-300 hover:text-white hover:bg-gradient-to-r hover:from-blue-600/50 hover:to-blue-500/50 transition-all duration-300 rounded-lg font-medium flex flex-col items-center gap-1 py-3 px-1 min-h-[60px]">
            <BarChart3 className="h-4 w-4 flex-shrink-0" />
            <span className="text-xs font-medium leading-tight">スタッツ</span>
          </TabsTrigger>
          <TabsTrigger value="season" className="relative data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-600 data-[state=active]:to-blue-500 data-[state=active]:text-white text-slate-300 hover:text-white hover:bg-gradient-to-r hover:from-blue-600/50 hover:to-blue-500/50 transition-all duration-300 rounded-lg font-medium flex flex-col items-center gap-1 py-3 px-1 min-h-[60px]">
            <Calendar className="h-4 w-4 flex-shrink-0" />
            <span className="text-xs font-medium leading-tight">シーズン</span>
          </TabsTrigger>
          <TabsTrigger value="ranking" className="relative data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-600 data-[state=active]:to-blue-500 data-[state=active]:text-white text-slate-300 hover:text-white hover:bg-gradient-to-r hover:from-blue-600/50 hover:to-blue-500/50 transition-all duration-300 rounded-lg font-medium flex flex-col items-center gap-1 py-3 px-1 min-h-[60px] hidden md:flex">
            <TrendingUp className="h-4 w-4 flex-shrink-0" />
            <span className="text-xs font-medium leading-tight">順位</span>
          </TabsTrigger>
          <TabsTrigger value="players" className="relative data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-600 data-[state=active]:to-blue-500 data-[state=active]:text-white text-slate-300 hover:text-white hover:bg-gradient-to-r hover:from-blue-600/50 hover:to-blue-500/50 transition-all duration-300 rounded-lg font-medium flex flex-col items-center gap-1 py-3 px-1 min-h-[60px]">
            <Users className="h-4 w-4 flex-shrink-0" />
            <span className="text-xs font-medium leading-tight">選手</span>
          </TabsTrigger>
        </div>
      </TabsList>

      <TabsContent value="overview" className="space-y-6">
        <OverviewCards matches={matches} seasonRecords={seasonRecords} />
        <MainStats mainStatsData={mainStatsData} />
      </TabsContent>

      <TabsContent value="stats" className="space-y-6">
        <StatsTab mainStatsData={mainStatsData} />
      </TabsContent>

      <TabsContent value="season" className="space-y-6">
        <SeasonTab seasonRecords={seasonRecords} />
      </TabsContent>

      <TabsContent value="ranking" className="space-y-6">
        <div className="relative overflow-hidden rounded-xl bg-slate-800/50 backdrop-blur-xl border border-slate-700">
          <div className="relative p-6">
            <div className="text-center text-slate-400">
              <p className="text-lg font-medium mb-2">順位推移グラフ</p>
              <p className="text-sm">準備中...</p>
            </div>
          </div>
        </div>
      </TabsContent>

      <TabsContent value="players" className="space-y-6">
        <PlayersTab topGoalscorers={topGoalscorers} topAssists={topAssists} />
      </TabsContent>
    </Tabs>
  );
}
