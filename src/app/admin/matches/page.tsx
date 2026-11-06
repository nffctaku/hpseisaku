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
    console.log(`[MatchesPage] mount: t=${Math.round(performance.now())}ms, clubUid=${clubUid ?? ""}`);
  }, []);

  useEffect(() => {
    console.log(`[MatchesPage] flags: t=${Math.round(performance.now())}ms, careerLoading=${careerLoading}, loadingBootstrap=${loadingBootstrap}, clubUid=${clubUid ?? ""}`);
  }, [careerLoading, loadingBootstrap, clubUid]);

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
          {/* 濃紺ヘッダー: タイトル＋絞り込みパネル＋案内行 */}
          <div className="rounded-2xl bg-[#0b1a3a] px-4 py-4 sm:px-5 max-sm:relative max-sm:left-1/2 max-sm:w-screen max-sm:-translate-x-1/2">
            <div className="mb-3 flex items-center gap-3">
              <span className="h-9 w-[3px] shrink-0 rounded bg-emerald-400" />
              <div>
                <div className="text-[10px] font-semibold tracking-[0.3em] text-slate-400">MATCH RECORD</div>
                <div className="text-[20px] font-bold leading-tight text-white">試合記録シート</div>
              </div>
            </div>

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
                <SelectTrigger className="h-11 w-full rounded-lg border border-[#4a5b80] bg-[#0d1f4c] px-3 text-[13px] text-white">
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

            {/* パネル下の案内行 */}
            <div className="mt-3 flex items-center justify-between text-[11px] text-slate-300">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                自動保存
              </span>
              <span>横にスワイプ →</span>
            </div>
          </div>

          {/* 試合記録シート（公式戦）: フィルター直下に埋め込み。シーズン・大会・チームは上部フィルターに追従 */}
          <div className="mt-8">
            <MatchSheet
              key={selectedSeason}
              initialSeason={selectedSeason}
              filterCompetitionId={sheetFilters.competitionId}
              filterTeamId={sheetFilters.teamId}
              hideSeasonSelect
              competitions={competitions}
              teams={teams}
              mainTeamId={mainTeamId}
            />
          </div>
        </>
      )}

    </div>
  );
}
