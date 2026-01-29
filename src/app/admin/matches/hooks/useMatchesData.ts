"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { db } from "@/lib/firebase";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { toast } from "sonner";

export interface Team {
  id: string;
  name: string;
  logoUrl?: string;
}

export interface CompetitionOption {
  id: string;
  name: string;
  season?: string;
}

export interface EnrichedMatch {
  id: string;
  competitionId: string;
  competitionName: string;
  competitionSeason?: string;
  roundId: string;
  roundName: string;
  matchDate: string;
  matchTime?: string;
  homeTeamId: string;
  awayTeamId: string;
  homeTeamName: string;
  awayTeamName: string;
  homeTeamLogo?: string;
  awayTeamLogo?: string;
  scoreHome?: number | null;
  scoreAway?: number | null;
}

type MatchIndexRow = {
  matchId: string;
  competitionId: string;
  roundId: string;
  matchDate: string;
  matchTime?: string;
  competitionName?: string;
  roundName?: string;
  homeTeam?: string;
  awayTeam?: string;
  homeTeamName?: string;
  awayTeamName?: string;
  homeTeamLogo?: string;
  awayTeamLogo?: string;
  scoreHome?: number | null;
  scoreAway?: number | null;
};

export type MatchesFilters = {
  season: string;
  teamId: string;
  competitionId: string;
};

export type UseMatchesDataResult = {
  teams: Team[];
  competitions: CompetitionOption[];
  competitionTeamIds: Map<string, string[]>;
  mainTeamId: string | null;

  matches: EnrichedMatch[];
  loadingBootstrap: boolean;
  loadingMatches: boolean;

  runSearch: (filters: MatchesFilters) => Promise<void>;
  clearMatches: () => void;
};

export function useMatchesData(clubUid: string | null | undefined): UseMatchesDataResult {
  const [teams, setTeams] = useState<Team[]>([]);
  const [competitions, setCompetitions] = useState<CompetitionOption[]>([]);
  const [competitionTeamIds, setCompetitionTeamIds] = useState<Map<string, string[]>>(new Map());
  const [mainTeamId, setMainTeamId] = useState<string | null>(null);

  const [matches, setMatches] = useState<EnrichedMatch[]>([]);
  const [loadingBootstrap, setLoadingBootstrap] = useState<boolean>(true);
  const [loadingMatches, setLoadingMatches] = useState<boolean>(false);

  const teamsMapRef = useRef<Map<string, Team>>(new Map());
  const competitionMetaRef = useRef<Map<string, { name: string; season?: string }>>(new Map());
  const activeFetchIdRef = useRef(0);

  const getMatchKey = useCallback((m: Pick<EnrichedMatch, "competitionId" | "roundId" | "id">) => {
    return `${m.competitionId}__${m.roundId}__${m.id}`;
  }, []);

  useEffect(() => {
    if (!clubUid) {
      setLoadingBootstrap(false);
      return;
    }

    const bootstrap = async () => {
      setLoadingBootstrap(true);
      try {
        const teamsMap = new Map<string, Team>();
        const teamsQueryRef = query(collection(db, `clubs/${clubUid}/teams`));
        const teamsSnap = await getDocs(teamsQueryRef);
        teamsSnap.forEach((d) => teamsMap.set(d.id, { id: d.id, ...(d.data() as any) } as Team));
        teamsMapRef.current = teamsMap;

        const competitionsQueryRef = query(collection(db, `clubs/${clubUid}/competitions`));
        const competitionsSnap = await getDocs(competitionsQueryRef);

        const competitionMeta = new Map<string, { name: string; season?: string }>();
        competitionsSnap.docs.forEach((d) => {
          const data = d.data() as any;
          competitionMeta.set(d.id, {
            name: (data?.name as string) || d.id,
            season: typeof data?.season === "string" ? data.season : undefined,
          });
        });
        competitionMetaRef.current = competitionMeta;

        const competitionOptions: CompetitionOption[] = competitionsSnap.docs.map((d) => ({
          id: d.id,
          name: ((d.data() as any)?.name as string) || d.id,
          season: ((d.data() as any)?.season as string) || undefined,
        }));
        competitionOptions.sort((a, b) => a.name.localeCompare(b.name));
        setCompetitions(competitionOptions);

        const compTeams = new Map<string, string[]>();
        competitionsSnap.docs.forEach((d) => {
          const data = d.data() as any;
          const ids = Array.isArray(data?.teams) ? data.teams.filter((x: any) => typeof x === "string") : [];
          compTeams.set(d.id, ids);
        });
        setCompetitionTeamIds(compTeams);

        const teamsForDropdown = Array.from(teamsMap.values());
        teamsForDropdown.sort((a, b) => a.name.localeCompare(b.name));
        setTeams(teamsForDropdown);

        // mainTeamId (new schema docId == clubUid, old schema ownerUid==clubUid)
        let main: string | null = null;
        try {
          const p = await getDoc(doc(db, "club_profiles", clubUid));
          if (p.exists()) {
            const data = p.data() as any;
            if (typeof data?.mainTeamId === "string") main = String(data.mainTeamId).trim();
          }
          if (!main) {
            const q = query(collection(db, "club_profiles"), where("ownerUid", "==", clubUid));
            const snap = await getDocs(q);
            if (!snap.empty) {
              const data = snap.docs[0].data() as any;
              if (typeof data?.mainTeamId === "string") main = String(data.mainTeamId).trim();
            }
          }
        } catch (e) {
          console.warn("[useMatchesData] mainTeamId load failed", e);
        }
        setMainTeamId(main);
      } catch (error) {
        console.error("[useMatchesData] bootstrap failed", error);
        toast.error("試合データの読み込みに失敗しました。");
      } finally {
        setLoadingBootstrap(false);
      }
    };

    void bootstrap();
  }, [clubUid]);

  const fetchMatchesFromTree = useCallback(
    async (clubUidInner: string, competitionMeta: Map<string, { name: string; season?: string }>): Promise<EnrichedMatch[]> => {
      // Heavy fallback path only. Prefer public_match_index for performance.
      const teamsMap = teamsMapRef.current;
      const result: EnrichedMatch[] = [];

      const competitionsSnap = await getDocs(query(collection(db, `clubs/${clubUidInner}/competitions`)));
      for (const compDoc of competitionsSnap.docs) {
        const compId = compDoc.id;
        const compData = compDoc.data() as any;
        const meta = competitionMeta.get(compId);
        const compName = meta?.name || (compData?.name as string) || compId;
        const compSeason = meta?.season || (typeof compData?.season === "string" ? compData.season : undefined);

        const roundsSnap = await getDocs(query(collection(db, `clubs/${clubUidInner}/competitions/${compId}/rounds`)));
        for (const roundDoc of roundsSnap.docs) {
          const roundId = roundDoc.id;
          const roundName = ((roundDoc.data() as any)?.name as string) || "";
          const matchesSnap = await getDocs(query(collection(db, `clubs/${clubUidInner}/competitions/${compId}/rounds/${roundId}/matches`)));

          for (const matchDoc of matchesSnap.docs) {
            const m = matchDoc.data() as any;
            const matchId = matchDoc.id;
            const matchDate = typeof m?.matchDate === "string" ? m.matchDate : "";
            if (!matchId || !matchDate) continue;

            const homeTeamId = typeof m?.homeTeam === "string" ? m.homeTeam : "";
            const awayTeamId = typeof m?.awayTeam === "string" ? m.awayTeam : "";
            const homeTeamInfo = homeTeamId ? teamsMap.get(homeTeamId) : undefined;
            const awayTeamInfo = awayTeamId ? teamsMap.get(awayTeamId) : undefined;

            result.push({
              id: matchId,
              competitionId: compId,
              competitionName: compName,
              competitionSeason: compSeason,
              roundId,
              roundName,
              matchDate,
              matchTime: typeof m?.matchTime === "string" ? m.matchTime : undefined,
              homeTeamId,
              awayTeamId,
              homeTeamName: homeTeamInfo?.name || (typeof m?.homeTeamName === "string" ? m.homeTeamName : "不明なチーム"),
              awayTeamName: awayTeamInfo?.name || (typeof m?.awayTeamName === "string" ? m.awayTeamName : "不明なチーム"),
              homeTeamLogo: homeTeamInfo?.logoUrl || (typeof m?.homeTeamLogo === "string" ? m.homeTeamLogo : undefined),
              awayTeamLogo: awayTeamInfo?.logoUrl || (typeof m?.awayTeamLogo === "string" ? m.awayTeamLogo : undefined),
              scoreHome: typeof m?.scoreHome === "number" ? m.scoreHome : (m?.scoreHome ?? null),
              scoreAway: typeof m?.scoreAway === "number" ? m.scoreAway : (m?.scoreAway ?? null),
            });
          }
        }
      }

      result.sort((a, b) => String(a.matchDate).localeCompare(String(b.matchDate)));
      return result;
    },
    []
  );

  const runSearch = useCallback(
    async (filters: MatchesFilters) => {
      if (!clubUid) return;
      if (!filters?.teamId || filters.teamId === "all") {
        toast.error("チームを選択してください");
        return;
      }

      const fetchId = ++activeFetchIdRef.current;
      setLoadingMatches(true);
      try {
        const competitionMeta = competitionMetaRef.current;

        const fetchIndexDocs = async (teamId: string) => {
          const indexRef = collection(db, `clubs/${clubUid}/public_match_index`);
          if (teamId === "all") {
            return getDocs(query(indexRef, orderBy("matchDate")));
          }

          const [homeSnap, awaySnap] = await Promise.all([
            getDocs(query(indexRef, where("homeTeam", "==", teamId))),
            getDocs(query(indexRef, where("awayTeam", "==", teamId))),
          ]);

          const docsMap = new Map<string, any>();
          for (const d of homeSnap.docs) docsMap.set(d.id, d);
          for (const d of awaySnap.docs) docsMap.set(d.id, d);

          const docs = Array.from(docsMap.values());
          docs.sort((a: any, b: any) => {
            const ad = typeof a?.data === "function" ? a.data() : (a?._data ?? {});
            const bd = typeof b?.data === "function" ? b.data() : (b?._data ?? {});
            const am = typeof ad?.matchDate === "string" ? ad.matchDate : "";
            const bm = typeof bd?.matchDate === "string" ? bd.matchDate : "";
            return String(am).localeCompare(String(bm));
          });

          return { docs } as any;
        };

        const indexSnap = await fetchIndexDocs(filters.teamId);
        if (fetchId !== activeFetchIdRef.current) return;

        const teamsMap = teamsMapRef.current;

        const enrichedMatchesFromIndex: EnrichedMatch[] = (indexSnap as any).docs
          .map((d: any) => d.data() as any)
          .map((row: MatchIndexRow): EnrichedMatch | null => {
            const compId = typeof row.competitionId === "string" ? row.competitionId : "";
            const meta = competitionMeta.get(compId);
            const homeTeamId = typeof row.homeTeam === "string" ? row.homeTeam : "";
            const awayTeamId = typeof row.awayTeam === "string" ? row.awayTeam : "";
            const matchId = typeof row.matchId === "string" ? row.matchId : "";
            const roundId = typeof row.roundId === "string" ? row.roundId : "";
            const matchDate = typeof row.matchDate === "string" ? row.matchDate : "";
            if (!matchId || !compId || !roundId || !matchDate) return null;

            const homeTeamInfo = homeTeamId ? teamsMap.get(homeTeamId) : undefined;
            const awayTeamInfo = awayTeamId ? teamsMap.get(awayTeamId) : undefined;

            return {
              id: matchId,
              competitionId: compId,
              competitionName: meta?.name || row.competitionName || compId,
              competitionSeason: meta?.season,
              roundId,
              roundName: row.roundName || "",
              matchDate,
              matchTime: typeof row.matchTime === "string" ? row.matchTime : undefined,
              homeTeamId,
              awayTeamId,
              homeTeamName: homeTeamInfo?.name || row.homeTeamName || "不明なチーム",
              awayTeamName: awayTeamInfo?.name || row.awayTeamName || "不明なチーム",
              homeTeamLogo: homeTeamInfo?.logoUrl || row.homeTeamLogo,
              awayTeamLogo: awayTeamInfo?.logoUrl || row.awayTeamLogo,
              scoreHome: typeof row.scoreHome === "number" ? row.scoreHome : (row.scoreHome ?? null),
              scoreAway: typeof row.scoreAway === "number" ? row.scoreAway : (row.scoreAway ?? null),
            };
          })
          .filter(Boolean) as EnrichedMatch[];

        const indexIsEmpty = !Array.isArray((indexSnap as any)?.docs) || (indexSnap as any).docs.length === 0;

        const filtered = enrichedMatchesFromIndex
          .slice()
          .sort((a, b) => String(a.matchDate).localeCompare(String(b.matchDate)))
          .filter((m) => {
          const seasonOk = filters.season === "all" || m.competitionSeason === filters.season;
          const competitionOk = filters.competitionId === "all" || m.competitionId === filters.competitionId;

          const teamsUnset = !m.homeTeamId && !m.awayTeamId;
          const teamOk =
            filters.teamId === "all" || m.homeTeamId === filters.teamId || m.awayTeamId === filters.teamId || teamsUnset;

          return seasonOk && competitionOk && teamOk;
          });

        // If index query returned any docs, never run the expensive tree fallback.
        // Showing 0 results should be fast.
        if (!indexIsEmpty) {
          setMatches(filtered);
          return;
        }

        // Fallback: only when index is truly empty.
        const treeMatches = await fetchMatchesFromTree(clubUid, competitionMeta);
        if (fetchId !== activeFetchIdRef.current) return;
        const fallbackFiltered = treeMatches.filter((m) => {
          const seasonOk = filters.season === "all" || m.competitionSeason === filters.season;
          const competitionOk = filters.competitionId === "all" || m.competitionId === filters.competitionId;
          const teamOk = m.homeTeamId === filters.teamId || m.awayTeamId === filters.teamId;
          return seasonOk && competitionOk && teamOk;
        });
        setMatches(fallbackFiltered);
      } catch (e) {
        console.error("[useMatchesData] runSearch failed", e);
        toast.error("試合データの読み込みに失敗しました。");
      } finally {
        if (fetchId === activeFetchIdRef.current) setLoadingMatches(false);
      }
    },
    [clubUid, fetchMatchesFromTree]
  );

  const clearMatches = useCallback(() => {
    activeFetchIdRef.current++;
    setMatches([]);
    setLoadingMatches(false);
  }, []);

  return useMemo(
    () => ({
      teams,
      competitions,
      competitionTeamIds,
      mainTeamId,
      matches,
      loadingBootstrap,
      loadingMatches,
      runSearch,
      clearMatches,
    }),
    [
      teams,
      competitions,
      competitionTeamIds,
      mainTeamId,
      matches,
      loadingBootstrap,
      loadingMatches,
      runSearch,
      clearMatches,
    ]
  );
}
