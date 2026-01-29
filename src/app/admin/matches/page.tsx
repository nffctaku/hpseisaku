"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { MatchesFilters } from "./components/MatchesFilters";
import { MatchesList } from "./components/MatchesList";
import { useMatchesData } from "./hooks/useMatchesData";

export default function MatchesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, ownerUid } = useAuth();
  const clubUid = ownerUid || user?.uid;
  const { teams, competitions, competitionTeamIds, mainTeamId, matches, loadingBootstrap, loadingMatches, runSearch, clearMatches } =
    useMatchesData(clubUid);

  const [hasSearched, setHasSearched] = useState(false);
  const [selectedSeason, setSelectedSeason] = useState<string | null>(null);

  useEffect(() => {
    setHasSearched(false);
    clearMatches();
  }, [clubUid, clearMatches]);

  const initialTeamId = useMemo(() => {
    if (typeof mainTeamId === 'string' && mainTeamId.length > 0) return mainTeamId;
    return 'all';
  }, [mainTeamId]);

  const seasonButtons = useMemo(() => {
    const set = new Set<string>();
    for (const c of competitions) {
      if (typeof c?.season === "string" && c.season.trim().length > 0) {
        set.add(c.season);
      }
    }
    const list = Array.from(set);
    list.sort((a, b) => b.localeCompare(a));
    return list;
  }, [competitions]);

  useEffect(() => {
    if (loadingBootstrap) return;
    const qSeason = (searchParams?.get("season") || "").trim();
    if (!qSeason) return;
    if (selectedSeason !== null) return;
    if (!seasonButtons.includes(qSeason)) return;
    setSelectedSeason(qSeason);
    setHasSearched(false);
    clearMatches();
  }, [loadingBootstrap, searchParams, seasonButtons, selectedSeason, clearMatches]);

  if (loadingBootstrap) {
    return (
      <div className="container mx-auto py-10 flex justify-center items-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="w-full mx-auto py-8 sm:py-10 px-4 md:px-0">
      {selectedSeason === null ? (
        <div className="rounded-lg border bg-card p-4">
          <div className="text-sm text-muted-foreground mb-3">シーズンを選択してください</div>
          <div className="grid grid-cols-3 gap-2">
            {seasonButtons.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  setSelectedSeason(s);
                  setHasSearched(false);
                  clearMatches();
                  router.replace(`/admin/matches?season=${encodeURIComponent(s)}`);
                }}
                className="rounded-md bg-blue-600 px-3 py-2 text-xs font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400/60"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="mb-3 flex items-center justify-between gap-2">
            <button
              type="button"
              className="rounded-md bg-blue-600 px-3 py-2 text-xs font-medium text-white shadow-sm"
            >
              {selectedSeason}
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedSeason(null);
                setHasSearched(false);
                clearMatches();
                router.replace("/admin/matches");
              }}
              className="rounded-md border bg-white px-3 py-2 text-xs text-gray-900 shadow-sm hover:bg-gray-50"
            >
              シーズン選択に戻る
            </button>
          </div>

          <MatchesFilters
            teams={teams}
            competitions={competitions}
            competitionTeamIds={competitionTeamIds}
            initialTeamId={initialTeamId}
            fixedSeason={selectedSeason}
            hideSeasonSelect
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
        </>
      )}

      <div className="mt-6">
        {loadingMatches ? (
          <div className="flex justify-center items-center py-10">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : hasSearched ? (
          <MatchesList matches={matches} />
        ) : selectedSeason === null ? (
          <div className="text-center py-10 text-muted-foreground">上でシーズンを選択してください。</div>
        ) : (
          <div className="text-center py-6 text-xs text-muted-foreground whitespace-nowrap">大会とチームを選択して「表示」を押してください。</div>
        )}
      </div>
    </div>
  );
}
