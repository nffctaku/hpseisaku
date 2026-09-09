"use client";

import { useEffect, useMemo, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAnalysisData } from "@/app/admin/analysis/hooks/use-analysis-data";
import { useAuth } from "@/contexts/AuthContext";
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
  const { user, ownerUid } = useAuth();
  const { filteredMatches: matches, competitions, allPlayers, mainTeamId, loading: analysisLoading, error: analysisError } = useAnalysisData();
  const [clubTitles, setClubTitles] = useState<ClubTitleItem[]>([]);
  const [titlesLoading, setTitlesLoading] = useState(true);

  const clubUid = ownerUid || user?.uid;

  useEffect(() => {
    if (!clubUid) {
      setTitlesLoading(false);
      return;
    }

    const run = async () => {
      setTitlesLoading(true);
      try {
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

        setClubTitles(titles);
      } catch (e) {
        console.error("[useSeasonRecordsData] fetch club titles failed", e);
      } finally {
        setTitlesLoading(false);
      }
    };

    void run();
  }, [clubUid]);

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
