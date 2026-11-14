"use client";

import { useEffect, useMemo, useState } from "react";
import { db } from "@/lib/firebase";
import { useCareer } from "@/contexts/CareerContext";
import { useClub } from "@/contexts/ClubContext";
import { collection, getDocs, type DocumentData, type QueryDocumentSnapshot } from "firebase/firestore";
import {
  fetchSheetCompetitions,
  fetchSheetRounds,
  fetchSheetMatches,
  type SheetMatchRow,
  type SheetCompetition,
} from "@/lib/match-sheet";
import {
  buildMatchViews,
  filterMatchViews,
  getSeasonOptions,
  getCompetitionFilterOptions,
  computeOverviewStats,
  computeMatchStats,
  computeGoalAnalysis,
  computePlayerRanking,
  computeMonthlyStats,
  type DashboardFilter,
} from "@/lib/dashboard-stats";
import { toSlashSeason } from "@/lib/season";
import { pickPlayerPhotoUrl } from "@/lib/player-photo";

export interface DashboardPlayer {
  id: string;
  name: string;
  photoURL?: string;
}

interface RawDashboardPlayer {
  id: string;
  name: string;
  photoUrl?: string;
  photoURL?: string;
  seasonData?: unknown;
}

export function useDashboardData() {
  const { activeCareer, careers, loading: careerLoading, switchCareer } = useCareer();
  const { mainTeamId } = useClub();
  const clubUid = activeCareer?.clubUid;

  const selfTeamIds = useMemo(
    () => [mainTeamId, clubUid].filter((x): x is string => !!x),
    [mainTeamId, clubUid]
  );

  const [competitions, setCompetitions] = useState<SheetCompetition[]>([]);
  const [rawPlayers, setRawPlayers] = useState<RawDashboardPlayer[]>([]);
  const [matches, setMatches] = useState<SheetMatchRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedSeason, setSelectedSeason] = useState<string>("");
  const [selectedCompetition, setSelectedCompetition] = useState<string>("all");

  const seasons = useMemo(() => getSeasonOptions(competitions), [competitions]);
  const competitionOptions = useMemo(() => {
    const filtered = selectedSeason
      ? competitions.filter((c) => !c.season || toSlashSeason(c.season) === toSlashSeason(selectedSeason))
      : competitions;
    return getCompetitionFilterOptions(filtered);
  }, [competitions, selectedSeason]);

  useEffect(() => {
    if (selectedCompetition === "all" || selectedCompetition === "league") return;
    const exists = competitionOptions.some((c) => c.id === selectedCompetition);
    if (!exists) setSelectedCompetition("all");
  }, [selectedCompetition, competitionOptions, setSelectedCompetition]);

  useEffect(() => {
    if (!selectedSeason && seasons.length > 0) {
      setSelectedSeason(seasons[0]);
    }
  }, [seasons, selectedSeason]);

  useEffect(() => {
    if (!clubUid) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const [comps, playersSnap] = await Promise.all([
          fetchSheetCompetitions(db, clubUid),
          fetchPlayers(clubUid, mainTeamId),
        ]);
        if (cancelled) return;
        setCompetitions(comps);
        setRawPlayers(playersSnap);
      } finally {
        setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [clubUid, mainTeamId]);

  useEffect(() => {
    if (!clubUid || !selectedSeason) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const targetSeason = toSlashSeason(selectedSeason);
        const seasonComps = competitions.filter(
          (c) => !c.season || toSlashSeason(c.season) === targetSeason
        );
        const roundResults = await Promise.all(
          seasonComps.map(async (comp) => {
            const rounds = await fetchSheetRounds(db, clubUid, comp.id);
            return { comp, rounds };
          })
        );
        const matchPromises = roundResults.flatMap(({ comp, rounds }) =>
          rounds.map((round) => fetchSheetMatches(db, clubUid, comp, round))
        );
        const matchResults = await Promise.all(matchPromises);
        const allRows: SheetMatchRow[] = [];
        for (const rows of matchResults) allRows.push(...rows);
        if (cancelled) return;

        const ownIds = new Set(selfTeamIds);
        const ownRows = allRows.filter(
          (r) => ownIds.has(r.homeTeam) || ownIds.has(r.awayTeam)
        );
        ownRows.sort((a, b) =>
          (a.matchDate || "9999").localeCompare(b.matchDate || "9999")
        );
        setMatches(ownRows);
      } finally {
        setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [clubUid, selectedSeason, competitions, selfTeamIds]);

  const players = useMemo<DashboardPlayer[]>(
    () =>
      rawPlayers.map((p) => ({
        id: p.id,
        name: p.name,
        photoURL: pickPlayerPhotoUrl(
          { photoUrl: p.photoUrl || p.photoURL, seasonData: p.seasonData },
          selectedSeason
        ),
      })),
    [rawPlayers, selectedSeason]
  );

  const views = useMemo(
    () => buildMatchViews(matches, competitions, selfTeamIds),
    [matches, competitions, selfTeamIds]
  );

  const filteredViews = useMemo(() => {
    const filter: DashboardFilter = {
      season: selectedSeason,
      competitionId: selectedCompetition as DashboardFilter["competitionId"],
    };
    return filterMatchViews(views, competitions, filter);
  }, [views, competitions, selectedSeason, selectedCompetition]);

  const overview = useMemo(() => computeOverviewStats(filteredViews), [filteredViews]);
  const matchStats = useMemo(() => computeMatchStats(filteredViews), [filteredViews]);
  const goalAnalysis = useMemo(() => computeGoalAnalysis(filteredViews), [filteredViews]);
  const playerRanking = useMemo(() => computePlayerRanking(filteredViews, players), [filteredViews, players]);
  const monthly = useMemo(() => computeMonthlyStats(filteredViews), [filteredViews]);

  return {
    loading: loading || careerLoading,
    clubUid,
    activeCareer,
    careers,
    switchCareer,
    seasons,
    selectedSeason,
    setSelectedSeason,
    competitionOptions,
    selectedCompetition,
    setSelectedCompetition,
    overview,
    matchStats,
    goalAnalysis,
    playerRanking,
    monthly,
    players,
  };
}

async function fetchPlayers(clubUid: string, mainTeamId: string | null): Promise<RawDashboardPlayer[]> {
  const paths = new Set<string>();
  if (mainTeamId) paths.add(`clubs/${clubUid}/teams/${mainTeamId}/players`);
  paths.add(`clubs/${clubUid}/teams/${clubUid}/players`);
  const snaps = await Promise.all(
    [...paths].map((p) =>
      getDocs(collection(db, p)).catch((): { docs: QueryDocumentSnapshot<DocumentData>[] } => ({ docs: [] }))
    )
  );
  const merged = new Map<string, RawDashboardPlayer>();
  for (const snap of snaps) {
    for (const d of snap.docs) {
      const data = d.data() as Record<string, unknown>;
      merged.set(d.id, {
        id: d.id,
        name: typeof data.name === "string" ? data.name : d.id,
        photoUrl: typeof data.photoUrl === "string" ? data.photoUrl : undefined,
        photoURL: typeof data.photoURL === "string" ? data.photoURL : undefined,
        seasonData: data.seasonData,
      });
    }
  }
  return [...merged.values()].sort((a, b) => a.name.localeCompare(b.name));
}
