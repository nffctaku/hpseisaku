"use client";

import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { AnalysisHeader, AnalysisFilters, AnalysisTabs } from "./components";
import { useAnalysisData } from "./hooks";
import { LoadingState, ErrorState, NoTeamState } from "./utils";

export default function AnalysisPage() {
  const { user, clubProfileExists, ownerUid } = useAuth();
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
        
        <AnalysisFilters
          selectedSeason={selectedSeason}
          setSelectedSeason={setSelectedSeason}
          selectedCompetitionId={selectedCompetitionId}
          setSelectedCompetitionId={setSelectedCompetitionId}
          selectedCompetitionType={selectedCompetitionType}
          setSelectedCompetitionType={setSelectedCompetitionType}
          seasons={seasons}
          competitions={competitions}
        />

        <AnalysisTabs
          matches={filteredMatches}
          seasonRecords={seasonRecords}
          mainStatsData={mainStats}
          topGoalscorers={topGoalscorers}
          topAssists={topAssists}
        />
      </div>
    </div>
  );
}
