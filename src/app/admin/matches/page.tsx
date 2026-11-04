"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useCareer } from "@/contexts/CareerContext";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MatchSheet } from "./sheet/match-sheet";
import { MatchesFilters } from "./components/MatchesFilters";
import { useMatchesData } from "./hooks/useMatchesData";
import { toSlashSeason } from "@/lib/season";

export default function MatchesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { activeCareer, loading: careerLoading } = useCareer();
  const clubUid = activeCareer?.clubUid;
  const { teams, competitions, competitionTeamIds, mainTeamId, loadingBootstrap } =
    useMatchesData(clubUid);

  const [selectedSeason, setSelectedSeason] = useState<string | null>(null);
  // 上部フィルターの条件を記録シートへ連動させるための保持値
  const [sheetFilters, setSheetFilters] = useState({ competitionId: "all", teamId: "all" });

  useEffect(() => {
    setSelectedSeason(null);
    setSheetFilters({ competitionId: "all", teamId: "all" });
  }, [clubUid]);

  const initialTeamId = useMemo(() => {
    if (typeof mainTeamId === 'string' && mainTeamId.length > 0) return mainTeamId;
    return 'all';
  }, [mainTeamId]);

  const seasonButtons = useMemo(() => {
    const set = new Set<string>();
    for (const c of competitions) {
      if (typeof c?.season === "string" && c.season.trim().length > 0) {
        // DB上の dash 形式("2027-28")が ?season= URLへ流出しないよう正規化
        set.add(toSlashSeason(c.season.trim()));
      }
    }
    const list = Array.from(set);
    list.sort((a, b) => b.localeCompare(a));
    return list;
  }, [competitions]);

  useEffect(() => {
    if (loadingBootstrap) return;
    const qSeason = toSlashSeason((searchParams?.get("season") || "").trim());
    if (selectedSeason !== null) {
      // 選択中シーズンが候補に無い（Career切替等）場合は選び直す
      if (!seasonButtons.includes(selectedSeason)) {
        setSelectedSeason(null);
      }
      return;
    }
    if (qSeason && seasonButtons.includes(qSeason)) {
      setSelectedSeason(qSeason);
      return;
    }
    // season未指定・無効指定は有効な最新シーズンへ。候補が無ければ空表示のまま
    if (seasonButtons.length > 0) {
      setSelectedSeason(seasonButtons[0]);
      if (qSeason !== seasonButtons[0]) {
        router.replace(`/admin/matches?season=${encodeURIComponent(seasonButtons[0])}`);
      }
    }
  }, [loadingBootstrap, searchParams, seasonButtons, selectedSeason, router]);

  if (careerLoading || loadingBootstrap) {
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
          <div className="w-full sm:w-[220px]">
            <Select value="" onValueChange={(value) => {
              setSelectedSeason(value);
              setSheetFilters({ competitionId: "all", teamId: "all" });
              router.replace(`/admin/matches?season=${encodeURIComponent(value)}`);
            }}>
              <SelectTrigger className="w-full bg-white text-gray-900">
                <SelectValue placeholder="シーズンを選択" />
              </SelectTrigger>
              <SelectContent>
                {seasonButtons.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      ) : (
        <>
          <MatchesFilters
            teams={teams}
            competitions={competitions}
            competitionTeamIds={competitionTeamIds}
            initialTeamId={initialTeamId}
            fixedSeason={selectedSeason}
            hideSeasonSelect
            leading={
              <Select value={selectedSeason} onValueChange={(value) => {
                setSelectedSeason(value);
                setSheetFilters({ competitionId: "all", teamId: "all" });
                router.replace(`/admin/matches?season=${encodeURIComponent(value)}`);
              }}>
                <SelectTrigger className="w-full min-w-[130px] flex-1 sm:w-[200px] sm:flex-none bg-white text-gray-900">
                  <SelectValue placeholder="シーズン" />
                </SelectTrigger>
                <SelectContent>
                  {seasonButtons.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            }
            loading={false}
            onSearch={(v) => {
              setSheetFilters({ competitionId: v.competitionId, teamId: v.teamId });
            }}
            onClear={() => {
              setSheetFilters({ competitionId: "all", teamId: "all" });
            }}
          />

          {/* 試合記録シート（公式戦）: フィルター直下に埋め込み。シーズン・大会・チームは上部フィルターに追従 */}
          <div className="mt-8">
            <MatchSheet
              key={selectedSeason}
              initialSeason={selectedSeason}
              filterCompetitionId={sheetFilters.competitionId}
              filterTeamId={sheetFilters.teamId}
              hideSeasonSelect
            />
          </div>
        </>
      )}

    </div>
  );
}
