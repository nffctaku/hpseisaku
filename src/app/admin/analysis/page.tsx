"use client";

import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { AnalysisHeader } from "./components";
import { useAnalysisData } from "./hooks";
import { LoadingState, ErrorState, NoTeamState } from "./utils";
import { OverallSection } from "./components/overall-section";
import { TournamentTypeSelection } from "./components/tournament-type-selection";
import { TournamentSelection } from "./components/tournament-selection";
import { ByTournamentSection } from "./components/by-tournament-section";

export default function AnalysisPage() {
  const { user, clubProfileExists, ownerUid } = useAuth();
  const [activeView, setActiveView] = useState<"overall" | "tournament" | "headtohead">("overall");
  const [selectedTournamentType, setSelectedTournamentType] = useState("league-cup");
  
  const {
    matches,
    competitions,
    selectedSeason,
    setSelectedSeason,
    selectedCompetitionId,
    setSelectedCompetitionId,
    selectedCompetitionType,
    setSelectedCompetitionType,
    seasons,
    loading,
    error,
    filteredMatches,
    seasonRecords,
    mainStats,
    topGoalscorers,
    topAssists,
  } = useAnalysisData();

  if (!user) {
    return <div className="min-h-screen flex items-center justify-center">
      <Card className="w-96">
        <CardContent className="pt-6">
          <div className="text-center text-muted-foreground">ログインが必要です。</div>
        </CardContent>
      </Card>
    </div>;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 p-4 md:p-6">
        <div className="max-w-7xl mx-auto">
          <LoadingState />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-900 p-4 md:p-6">
        <div className="max-w-7xl mx-auto">
          <ErrorState error={error} />
        </div>
      </div>
    );
  }

  if (!clubProfileExists) {
    return (
      <div className="min-h-screen bg-slate-900 p-4 md:p-6">
        <div className="max-w-7xl mx-auto">
          <NoTeamState />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-4 md:space-y-6">
        <AnalysisHeader />
        
        <div className="relative overflow-hidden rounded-xl bg-slate-800/50 backdrop-blur-xl border border-slate-700">
          <div className="relative p-6">
            <div className="flex flex-col sm:flex-row gap-4">
              <button
                onClick={() => setActiveView("overall")}
                className={`flex-1 sm:flex-none px-6 py-3 rounded-lg font-medium transition-all duration-300 ${
                  activeView === "overall"
                    ? "bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-lg"
                    : "bg-slate-700/50 text-slate-300 hover:bg-slate-700/70 hover:text-white"
                }`}
              >
                通算
              </button>
              <button
                onClick={() => setActiveView("tournament")}
                className={`flex-1 sm:flex-none px-6 py-3 rounded-lg font-medium transition-all duration-300 ${
                  activeView === "tournament"
                    ? "bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-lg"
                    : "bg-slate-700/50 text-slate-300 hover:bg-slate-700/70 hover:text-white"
                }`}
              >
                大会別
              </button>
            </div>
          </div>
        </div>

        {activeView === "overall" && (
          <OverallSection
            matches={matches}
            filteredMatches={filteredMatches}
            seasonRecords={seasonRecords}
            mainStatsData={mainStats}
            topGoalscorers={topGoalscorers}
            topAssists={topAssists}
          />
        )}

        {activeView === "tournament" && (
          <div className="space-y-6">
            <TournamentTypeSelection
              selectedType={selectedTournamentType}
              onTypeChange={setSelectedTournamentType}
            />
            
            <TournamentSelection
              selectedTournament={selectedCompetitionId}
              onTournamentChange={setSelectedCompetitionId}
              tournaments={competitions}
              selectedSeason={selectedSeason}
              onSeasonChange={setSelectedSeason}
              seasons={seasons}
            />

            <ByTournamentSection
              matches={filteredMatches}
              seasonRecords={seasonRecords}
              mainStatsData={mainStats}
              topGoalscorers={topGoalscorers}
              topAssists={topAssists}
              selectedTournament={selectedCompetitionId}
              selectedTournamentType={selectedTournamentType}
            />
          </div>
        )}
      </div>
    </div>
  );
}
