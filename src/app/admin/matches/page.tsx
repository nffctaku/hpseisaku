"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { MatchesFilters } from "./components/MatchesFilters";
import { MatchesList } from "./components/MatchesList";
import { useMatchesData } from "./hooks/useMatchesData";

export default function MatchesPage() {
  const { user, ownerUid } = useAuth();
  const clubUid = ownerUid || user?.uid;
  const { teams, competitions, competitionTeamIds, mainTeamId, matches, loadingBootstrap, loadingMatches, runSearch, clearMatches } =
    useMatchesData(clubUid);

  const [hasSearched, setHasSearched] = useState(false);

  useEffect(() => {
    setHasSearched(false);
    clearMatches();
  }, [clubUid, clearMatches]);

  const initialTeamId = useMemo(() => {
    if (typeof mainTeamId === 'string' && mainTeamId.length > 0) return mainTeamId;
    return 'all';
  }, [mainTeamId]);

  if (loadingBootstrap) {
    return (
      <div className="container mx-auto py-10 flex justify-center items-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="w-full mx-auto py-8 sm:py-10 px-4 md:px-0">
      <div className="mb-6 sm:mb-8 space-y-4 sm:space-y-0 sm:flex sm:items-end sm:justify-between">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">試合管理</h1>
        <Link
          href="/admin/competitions"
          className="bg-emerald-600 text-white hover:bg-emerald-700 px-4 py-2 rounded-md whitespace-nowrap text-center text-sm"
        >
          大会管理へ
        </Link>
      </div>

      <MatchesFilters
        teams={teams}
        competitions={competitions}
        competitionTeamIds={competitionTeamIds}
        initialTeamId={initialTeamId}
        loading={loadingMatches}
        onSearch={async (v) => {
          setHasSearched(true);
          await runSearch(v);
        }}
        onClear={() => {
          setHasSearched(false);
          clearMatches();
        }}
      />

      <div className="mt-6">
        {loadingMatches ? (
          <div className="flex justify-center items-center py-10">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : hasSearched ? (
          <MatchesList matches={matches} />
        ) : (
          <div className="text-center py-10 text-muted-foreground">条件を選択して「表示」を押してください。</div>
        )}
      </div>
    </div>
  );
}
