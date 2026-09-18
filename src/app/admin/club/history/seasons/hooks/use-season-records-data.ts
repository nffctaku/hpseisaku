"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAnalysisData } from "@/app/admin/analysis/hooks/use-analysis-data";
import { useCareer } from "@/contexts/CareerContext";
import {
  buildAllPlayersMap,
  ClubTitleItem,
  computeSeasonSummary,
  PlayerRef,
  SeasonRecordMatch,
  SeasonSummary,
  toSlashSeason,
} from "../lib/season-records";

export interface UseSeasonRecordsDataReturn {
  matches: SeasonRecordMatch[];
  competitions: any[];
  allPlayersMap: Map<string, PlayerRef>;
  mainTeamId: string | null;
  clubTitles: ClubTitleItem[];
  seasons: string[];
  seasonSummaries: SeasonSummary[];
  loading: boolean;
  error: string | null;
}

export function useSeasonRecordsData(): UseSeasonRecordsDataReturn {
  const { activeCareer } = useCareer();
  const clubUid = activeCareer?.clubUid;
  const careerId = activeCareer?.id;
  const { filteredMatches: matches, competitions, allPlayers, mainTeamId, loading: analysisLoading, error: analysisError } = useAnalysisData();
  const [clubTitles, setClubTitles] = useState<ClubTitleItem[]>([]);
  const [titlesLoading, setTitlesLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setClubTitles([]);
    if (!clubUid || !careerId) {
      setTitlesLoading(false);
      return;
    }

    const run = async () => {
      setTitlesLoading(true);
      try {
        // 新Trophyデータ優先。未移行ユーザー（このCareerのtrophiesが空）のみ legacy clubTitles へフォールバック。
        const trophySnap = await getDocs(collection(db, `clubs/${clubUid}/trophies`));
        const trophyTitles = trophySnap.docs
          .map((d) => d.data() as Record<string, unknown>)
          .filter((t) => t.careerId === careerId)
          .map((t) => ({
            competitionName: typeof t.titleName === "string" ? t.titleName : "",
            seasons: Array.isArray(t.winningSeasons)
              ? (t.winningSeasons as unknown[])
                  .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
                  .map((s) => toSlashSeason(s))
              : [],
          }))
          .filter((t: ClubTitleItem) => t.competitionName && (t.seasons || []).length > 0);

        if (trophyTitles.length > 0) {
          if (!cancelled) setClubTitles(trophyTitles);
          return;
        }

        const clubSnap = await getDoc(doc(db, "clubs", clubUid));
        const data = clubSnap.exists() ? (clubSnap.data() as any) : {};
        const clubProfileTitles = Array.isArray(data?.clubTitles) ? data.clubTitles : [];

        const profileSnap = await getDoc(doc(db, "club_profiles", clubUid));
        const pdata = profileSnap.exists() ? (profileSnap.data() as any) : {};
        const profileTitles = Array.isArray(pdata?.clubTitles) ? pdata.clubTitles : [];

        const source = clubProfileTitles.length > 0 ? clubProfileTitles : profileTitles;

        const titles = source
          .map((t: any) => ({
            competitionName: typeof t?.competitionName === "string" ? t.competitionName : "",
            seasons: Array.isArray(t?.seasons)
              ? t.seasons
                  .filter((s: any) => typeof s === "string")
                  .map((s: string) => toSlashSeason(s))
              : typeof t?.season === "string"
                ? [toSlashSeason(t.season)]
                : [],
          }))
          .filter((t: ClubTitleItem) => t.competitionName && (t.seasons || []).length > 0);

        if (!cancelled) setClubTitles(titles);
      } catch (e) {
        console.error("[useSeasonRecordsData] fetch club titles failed", e);
      } finally {
        if (!cancelled) setTitlesLoading(false);
      }
    };

    void run();
    return () => { cancelled = true; };
  }, [clubUid, careerId]);

  const allPlayersMap = useMemo(() => buildAllPlayersMap(allPlayers), [allPlayers]);

  const competitionSeasonMap = useMemo(() => {
    const map = new Map<string, string>();
    if (Array.isArray(competitions)) {
      for (const c of competitions) {
        const anyC = c as any;
        const id = anyC?.id || "";
        const name = anyC?.name || "";
        const raw = anyC?.season ?? "";
        const season = toSlashSeason(String(raw).trim());
        if (season && season !== "undefined" && season !== "null") {
          if (id) map.set(String(id), season);
          if (name) map.set(String(name), season);
        }
      }
    }
    return map;
  }, [competitions]);

  const normalizedMatches = useMemo<SeasonRecordMatch[]>(() => {
    return (matches as any[]).map((m: any) => {
      const raw = m?.competitionSeason ?? m?.season ?? "";
      let competitionSeason = toSlashSeason(String(raw).trim());
      if (!competitionSeason || competitionSeason === "undefined" || competitionSeason === "null") {
        const key = m?.competitionId || m?.competitionName || "";
        if (key) competitionSeason = competitionSeasonMap.get(String(key)) || "";
      }
      return competitionSeason ? ({ ...m, competitionSeason } as SeasonRecordMatch) : (m as SeasonRecordMatch);
    });
  }, [matches, competitionSeasonMap]);

  const seasonSummaries = useMemo(() => {
    const seasonsSet = new Set<string>();
    for (const m of normalizedMatches) {
      const s = m.competitionSeason || "";
      if (s && s !== "undefined" && s !== "null") seasonsSet.add(toSlashSeason(s));
    }
    if (Array.isArray(competitions)) {
      for (const c of competitions) {
        const raw = c?.season ?? "";
        const s = String(raw).trim();
        if (s && s !== "undefined" && s !== "null") seasonsSet.add(toSlashSeason(s));
      }
    }
    const seasons = Array.from(seasonsSet).sort((a, b) => b.localeCompare(a, "ja"));

    return seasons.map((season) =>
      computeSeasonSummary(normalizedMatches, competitions, clubTitles, allPlayersMap, mainTeamId, season)
    );
  }, [normalizedMatches, competitions, clubTitles, allPlayersMap, mainTeamId]);

  return {
    matches: normalizedMatches,
    competitions,
    allPlayersMap,
    mainTeamId,
    clubTitles,
    seasons: seasonSummaries.map((s) => s.season),
    seasonSummaries,
    loading: analysisLoading || titlesLoading,
    error: analysisError,
  };
}
