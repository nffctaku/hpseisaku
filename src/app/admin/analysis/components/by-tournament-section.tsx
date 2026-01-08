"use client";

import { SeasonRecord } from "../types";
import { OverviewCards } from "./overview-cards";
import { MainStats } from "./main-stats";
import { PlayersTab } from "./players-tab";

interface ByTournamentSectionProps {
  matches: Array<{ isCompleted: boolean }>;
  seasonRecords: SeasonRecord[];
  mainStatsData: any[];
  topGoalscorers: any[];
  topAssists: any[];
  selectedTournament: string;
  selectedTournamentType: string;
}

export function ByTournamentSection({
  matches,
  seasonRecords,
  mainStatsData,
  topGoalscorers,
  topAssists,
  selectedTournament,
  selectedTournamentType
}: ByTournamentSectionProps) {
  const getTournamentTitle = () => {
    if (selectedTournamentType === "league") {
      return "リーグ戦";
    } else if (selectedTournamentType === "league-cup") {
      return "リーグ&カップ戦";
    } else if (selectedTournamentType === "cup") {
      return "カップ戦";
    }
    return "リーグ&カップ戦";
  };

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-xl bg-slate-800/50 backdrop-blur-xl border border-slate-700">
        <div className="relative p-6">
          <h2 className="text-xl font-bold text-white mb-4">
            {getTournamentTitle()} 成績
          </h2>
          <OverviewCards matches={matches} seasonRecords={seasonRecords} />
        </div>
      </div>

      <div className="relative overflow-hidden rounded-xl bg-slate-800/50 backdrop-blur-xl border border-slate-700">
        <div className="relative p-6">
          <h2 className="text-xl font-bold text-white mb-4">主要スタッツ</h2>
          <MainStats mainStatsData={mainStatsData} />
        </div>
      </div>

      <div className="relative overflow-hidden rounded-xl bg-slate-800/50 backdrop-blur-xl border border-slate-700">
        <div className="relative p-6">
          <h2 className="text-xl font-bold text-white mb-4">選手成績</h2>
          <PlayersTab topGoalscorers={topGoalscorers} topAssists={topAssists} />
        </div>
      </div>
    </div>
  );
}
