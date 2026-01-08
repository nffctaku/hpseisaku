"use client";

import { useState, useEffect, useMemo } from "react";
import { collection, query, where, getDocs, orderBy, getDoc, doc, limit } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { MainStats, SeasonRecord, PlayerStats, Competition } from "../types";
import { useAuth } from "@/contexts/AuthContext";
import { useClub } from "@/contexts/ClubContext";

const MAIN_STATS = [
  { id: "possession", name: "ボール支配率", isPercentage: true },
  { id: "shots", name: "シュート数", isPercentage: false },
  { id: "xg", name: "xG", isPercentage: false },
  { id: "passes", name: "パス数", isPercentage: false },
  { id: "passAccuracy", name: "パス成功率", isPercentage: true },
];

export function useAnalysisData() {
  const { ownerUid, user } = useAuth();
  const { clubInfo } = useClub();
  const [matches, setMatches] = useState<any[]>([]);
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [selectedSeason, setSelectedSeason] = useState("all");
  const [selectedCompetitionId, setSelectedCompetitionId] = useState("all");
  const [selectedCompetitionType, setSelectedCompetitionType] = useState("league-cup");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mainTeamId, setMainTeamId] = useState<string | null>(null);

  useEffect(() => {
    // Try both clubId and ownerUid to find the data
    const clubId = clubInfo.id;
    const firestoreClubDocId = ownerUid || user?.uid || null;
    console.log(`[useAnalysisData] Hook called with clubId: ${clubId}, firestoreClubDocId: ${firestoreClubDocId}, ownerUid: ${ownerUid}, user:`, user);
    
    if (!firestoreClubDocId) {
      console.log('[useAnalysisData] No clubId or ownerUid, returning');
      setLoading(false);
      return;
    }

    // Fetch mainTeamId from club profile
    const fetchMainTeamId = async () => {
      try {
        const profilesQuery = query(
          collection(db, "club_profiles"),
          where("ownerUid", "==", ownerUid),
          limit(1)
        );
        const profilesSnapshot = await getDocs(profilesQuery);
        
        if (!profilesSnapshot.empty) {
          const profileData = profilesSnapshot.docs[0].data() as any;
          const teamId = profileData.mainTeamId as string | undefined;
          console.log(`[useAnalysisData] Found mainTeamId: ${teamId}`);
          setMainTeamId(teamId || ownerUid || null);
        } else {
          console.log(`[useAnalysisData] No club profile found, using ownerUid: ${ownerUid}`);
          setMainTeamId(ownerUid || null);
        }
      } catch (err) {
        console.error('[useAnalysisData] Error fetching mainTeamId:', err);
        setMainTeamId(ownerUid || null);
      }
    };

    fetchMainTeamId();

    const fetchData = async () => {
      try {
        setLoading(true);
        
        console.log('[useAnalysisData] Starting data fetch with firestoreClubDocId:', firestoreClubDocId, 'ownerUid:', ownerUid);
        
        // Firestore上のclubs/{docId}は ownerUid / uid を使う（clubId(例:nffctaku)は公開URL用スラッグ）
        const possibleIds = [firestoreClubDocId].filter((id): id is string => Boolean(id));
        let competitionsData: Competition[] = [];
        let foundPath = '';
        
        for (const id of possibleIds) {
          try {
            console.log(`[useAnalysisData] Trying path: clubs/${id}`);
            
            // Check if club doc exists
            const clubDoc = await getDoc(doc(db, "clubs", id));
            console.log(`[useAnalysisData] Club doc exists for ${id}:`, clubDoc.exists());
            if (clubDoc.exists()) {
              console.log(`[useAnalysisData] Club doc data for ${id}:`, clubDoc.data());
            }
            
            // Try to access competitions
            const competitionsQuery = query(
              collection(db, "clubs", id, "competitions")
            );
            const competitionsSnapshot = await getDocs(competitionsQuery);
            console.log(`[useAnalysisData] Competitions snapshot size for ${id}:`, competitionsSnapshot.size);
            
            if (competitionsSnapshot.size > 0) {
              competitionsData = competitionsSnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
              })) as Competition[];
              foundPath = id;
              console.log(`[useAnalysisData] Found competitions using path: clubs/${id}`);
              console.log(`[useAnalysisData] Competition data:`, competitionsData);
              
              // Check if competitions have embedded matches
              competitionsData.forEach((comp, index) => {
                console.log(`[useAnalysisData] Competition ${index + 1} (${comp.id}):`, comp);
                console.log(`[useAnalysisData] Competition ${index + 1} keys:`, Object.keys(comp));
                
                // Look for possible match fields
                const possibleMatchFields = ['matches', 'games', 'fixtures', 'matchData', 'matchIds'];
                possibleMatchFields.forEach(field => {
                  if (comp[field as keyof typeof comp]) {
                    console.log(`[useAnalysisData] Found ${field} in competition ${comp.id}:`, comp[field as keyof typeof comp]);
                  }
                });
              });
              
              break;
            }
          } catch (err) {
            console.error(`[useAnalysisData] Error accessing path clubs/${id}:`, err);
          }
        }
        
        if (competitionsData.length === 0) {
          console.log('[useAnalysisData] No competitions found in any path');
          setCompetitions([]);
          setMatches([]);
          setLoading(false);
          return;
        }
        
        setCompetitions(competitionsData);
        console.log('[useAnalysisData] Fetched competitions:', competitionsData.length, 'from path:', foundPath);
        
        // Fetch all matches from all competitions using the found path
        const allMatches: any[] = [];
        for (const comp of competitionsData) {
          try {
            // Add competition type info
            const competitionType = (comp as any).type || (comp.name?.includes('カップ') || comp.name?.includes('杯') ? 'cup' : 'league');
            
            // First check for rounds under this competition
            const roundsPath = `clubs/${foundPath}/competitions/${comp.id}/rounds`;
            console.log(`[useAnalysisData] Querying rounds path: ${roundsPath}`);
            
            const roundsQuery = query(
              collection(db, "clubs", foundPath, "competitions", comp.id, "rounds")
            );
            const roundsSnapshot = await getDocs(roundsQuery);
            console.log(`[useAnalysisData] Rounds for competition ${comp.id}:`, roundsSnapshot.size);
            
            // For each round, get matches
            for (const roundDoc of roundsSnapshot.docs) {
              const roundId = roundDoc.id;
              const matchesPath = `clubs/${foundPath}/competitions/${comp.id}/rounds/${roundId}/matches`;
              console.log(`[useAnalysisData] Querying matches path: ${matchesPath}`);
              
              const matchesQuery = query(
                collection(db, "clubs", foundPath, "competitions", comp.id, "rounds", roundId, "matches")
                // Temporarily removed filters to see all matches
              );
              const matchesSnapshot = await getDocs(matchesQuery);
              console.log(`[useAnalysisData] Matches for competition ${comp.id}, round ${roundId}:`, matchesSnapshot.size);
              
              if (matchesSnapshot.size > 0) {
                const matchesData = matchesSnapshot.docs.map(doc => ({
                  id: doc.id,
                  competitionId: comp.id,
                  competitionName: comp.name,
                  competitionType: competitionType,
                  roundId: roundId,
                  ...doc.data()
                }));
                console.log(`[useAnalysisData] Sample match data:`, matchesData[0]);
                allMatches.push(...matchesData);
              }
            }
          } catch (matchErr) {
            console.error(`[useAnalysisData] Error fetching matches for competition ${comp.id}:`, matchErr);
          }
        }

        // Also check friendly_matches
        try {
          console.log(`[useAnalysisData] Checking friendly_matches...`);
          const friendlyMatchesQuery = query(
            collection(db, "clubs", foundPath, "friendly_matches")
          );
          const friendlyMatchesSnapshot = await getDocs(friendlyMatchesQuery);
          console.log(`[useAnalysisData] Friendly matches found:`, friendlyMatchesSnapshot.size);
          
          if (friendlyMatchesSnapshot.size > 0) {
            const friendlyMatchesData = friendlyMatchesSnapshot.docs.map(doc => ({
              id: doc.id,
              competitionId: 'friendly',
              ...doc.data()
            }));
            console.log(`[useAnalysisData] Sample friendly match data:`, friendlyMatchesData[0]);
            allMatches.push(...friendlyMatchesData);
          }
        } catch (friendlyErr) {
          console.error(`[useAnalysisData] Error fetching friendly matches:`, friendlyErr);
        }

        // Also check direct matches collection
        try {
          console.log(`[useAnalysisData] Checking direct matches collection...`);
          const directMatchesQuery = query(
            collection(db, "clubs", foundPath, "matches")
          );
          const directMatchesSnapshot = await getDocs(directMatchesQuery);
          console.log(`[useAnalysisData] Direct matches found:`, directMatchesSnapshot.size);
          
          if (directMatchesSnapshot.size > 0) {
            const directMatchesData = directMatchesSnapshot.docs.map(doc => ({
              id: doc.id,
              competitionId: 'direct',
              ...doc.data()
            }));
            console.log(`[useAnalysisData] Sample direct match data:`, directMatchesData[0]);
            allMatches.push(...directMatchesData);
          }
        } catch (directErr) {
          console.error(`[useAnalysisData] Error fetching direct matches:`, directErr);
        }

        // Also check teams collection for matches
        try {
          console.log(`[useAnalysisData] Checking teams collection...`);
          const teamsQuery = query(
            collection(db, "clubs", foundPath, "teams")
          );
          const teamsSnapshot = await getDocs(teamsQuery);
          console.log(`[useAnalysisData] Teams found:`, teamsSnapshot.size);
          
          for (const teamDoc of teamsSnapshot.docs) {
            const teamId = teamDoc.id;
            console.log(`[useAnalysisData] Checking matches for team ${teamId}...`);
            
            try {
              const teamMatchesQuery = query(
                collection(db, "clubs", foundPath, "teams", teamId, "matches")
              );
              const teamMatchesSnapshot = await getDocs(teamMatchesQuery);
              console.log(`[useAnalysisData] Team ${teamId} matches found:`, teamMatchesSnapshot.size);
              
              if (teamMatchesSnapshot.size > 0) {
                const teamMatchesData = teamMatchesSnapshot.docs.map(doc => ({
                  id: doc.id,
                  competitionId: `team-${teamId}`,
                  teamId: teamId,
                  ...doc.data()
                }));
                console.log(`[useAnalysisData] Sample team match data:`, teamMatchesData[0]);
                allMatches.push(...teamMatchesData);
              }
            } catch (teamMatchErr) {
              console.error(`[useAnalysisData] Error fetching matches for team ${teamId}:`, teamMatchErr);
            }
          }
        } catch (teamsErr) {
          console.error(`[useAnalysisData] Error fetching teams:`, teamsErr);
        }

        // Also check rounds collection which might contain matches
        try {
          console.log(`[useAnalysisData] Checking rounds collection...`);
          const roundsQuery = query(
            collection(db, "clubs", foundPath, "rounds")
          );
          const roundsSnapshot = await getDocs(roundsQuery);
          console.log(`[useAnalysisData] Rounds found:`, roundsSnapshot.size);
          
          for (const roundDoc of roundsSnapshot.docs) {
            const roundId = roundDoc.id;
            console.log(`[useAnalysisData] Checking matches for round ${roundId}...`);
            
            try {
              const roundMatchesQuery = query(
                collection(db, "clubs", foundPath, "rounds", roundId, "matches")
              );
              const roundMatchesSnapshot = await getDocs(roundMatchesQuery);
              console.log(`[useAnalysisData] Round ${roundId} matches found:`, roundMatchesSnapshot.size);
              
              if (roundMatchesSnapshot.size > 0) {
                const roundMatchesData = roundMatchesSnapshot.docs.map(doc => ({
                  id: doc.id,
                  competitionId: `round-${roundId}`,
                  roundId: roundId,
                  ...doc.data()
                }));
                console.log(`[useAnalysisData] Sample round match data:`, roundMatchesData[0]);
                allMatches.push(...roundMatchesData);
              }
            } catch (roundMatchErr) {
              console.error(`[useAnalysisData] Error fetching matches for round ${roundId}:`, roundMatchErr);
            }
          }
        } catch (roundsErr) {
          console.error(`[useAnalysisData] Error fetching rounds:`, roundsErr);
        }

        // Check for global matches collection
        try {
          console.log(`[useAnalysisData] Checking global matches collection...`);
          const globalMatchesQuery = query(
            collection(db, "matches")
          );
          const globalMatchesSnapshot = await getDocs(globalMatchesQuery);
          console.log(`[useAnalysisData] Global matches found:`, globalMatchesSnapshot.size);
          
          if (globalMatchesSnapshot.size > 0) {
            const globalMatchesData = globalMatchesSnapshot.docs.map(doc => ({
              id: doc.id,
              competitionId: 'global',
              ...doc.data()
            }));
            console.log(`[useAnalysisData] Sample global match data:`, globalMatchesData[0]);
            allMatches.push(...globalMatchesData);
          }
        } catch (globalErr) {
          console.error(`[useAnalysisData] Error fetching global matches:`, globalErr);
        }

        // Check teams field in competitions for match references
        competitionsData.forEach((comp, index) => {
          const compData = comp as any; // Type assertion to access dynamic fields
          if (compData.teams && Array.isArray(compData.teams)) {
            console.log(`[useAnalysisData] Competition ${comp.id} has teams:`, compData.teams);
            compData.teams.forEach((team: any, teamIndex: number) => {
              console.log(`[useAnalysisData] Team ${teamIndex}:`, team);
              if (team.matches) {
                console.log(`[useAnalysisData] Found matches in team ${teamIndex}:`, team.matches);
              }
            });
          }
        });

        setMatches(allMatches);
        console.log('[useAnalysisData] Total matches fetched:', allMatches.length);
        
      } catch (err) {
        console.error("Error fetching data:", err);
        setError("データの取得に失敗しました");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const filteredMatches = useMemo(() => {
    let filtered = matches;

    if (selectedSeason !== "all") {
      filtered = filtered.filter(m => {
        const season = m.matchDate ? new Date(m.matchDate).getFullYear().toString() : null;
        return season === selectedSeason;
      });
    }

    if (selectedCompetitionId !== "all") {
      filtered = filtered.filter(m => m.competitionId === selectedCompetitionId);
    }

    if (selectedCompetitionType === "league") {
      filtered = filtered.filter(m => m.competitionType === "league");
    }

    if (selectedCompetitionType === "cup") {
      filtered = filtered.filter(m => m.competitionType === "cup");
    }

    // Filter for home team only (mainTeamId matches)
    console.log(`[useAnalysisData] Filtering matches for mainTeamId: ${mainTeamId}`);
    console.log(`[useAnalysisData] Sample match team IDs:`, matches.slice(0, 3).map(m => ({
      homeTeam: m.homeTeam,
      awayTeam: m.awayTeam,
      homeTeamType: typeof m.homeTeam,
      awayTeamType: typeof m.awayTeam
    })));
    
    if (!mainTeamId) {
      console.log('[useAnalysisData] No mainTeamId available, using all matches');
      return filtered.map(match => ({
        ...match,
        isCompleted: match.isCompleted !== undefined ? match.isCompleted : (
          match.scoreHome !== null && match.scoreAway !== null && 
          typeof match.scoreHome === 'number' && typeof match.scoreAway === 'number'
        ),
        result: match.result || (
          match.scoreHome !== null && match.scoreAway !== null ? 
            (match.scoreHome > match.scoreAway ? 'win' : 
             match.scoreHome < match.scoreAway ? 'loss' : 'draw') : undefined
        ),
        goalsFor: match.goalsFor || match.scoreHome,
        goalsAgainst: match.goalsAgainst || match.scoreAway,
        isHome: false
      }));
    }
    
    const homeTeamMatches = filtered.filter(match => {
      const homeTeamId = match.homeTeam;
      const awayTeamId = match.awayTeam;
      const isHomeMatch = homeTeamId === mainTeamId || awayTeamId === mainTeamId;
      
      if (filtered.indexOf(match) < 5) {
        console.log(`[useAnalysisData] Match check: home=${homeTeamId}, away=${awayTeamId}, isHome=${isHomeMatch}, mainTeam=${mainTeamId}`);
      }
      
      return isHomeMatch;
    });

    console.log(`[useAnalysisData] Filtered ${filtered.length} total matches to ${homeTeamMatches.length} home team matches`);
    
    // Log sample match data for debugging
    if (homeTeamMatches.length > 0) {
      console.log(`[useAnalysisData] Sample filtered match:`, homeTeamMatches[0]);
      console.log(`[useAnalysisData] Match fields:`, Object.keys(homeTeamMatches[0]));
    }

    // Transform match data to expected structure
    return homeTeamMatches.map(match => {
      const isHome = match.homeTeam === mainTeamId;

      const parseScore = (value: any): number | null => {
        if (typeof value === 'number' && Number.isFinite(value)) return value;
        if (typeof value === 'string') {
          const trimmed = value.trim();
          if (trimmed === '') return null;
          const num = Number(trimmed);
          return Number.isFinite(num) ? num : null;
        }
        return null;
      };

      const scoreHome = parseScore(match.scoreHome);
      const scoreAway = parseScore(match.scoreAway);
      const hasScores = scoreHome !== null && scoreAway !== null;
      const isCompleted = match.isCompleted === true ? true : hasScores;

      const goalsFor = isCompleted
        ? (isHome ? scoreHome! : scoreAway!)
        : (match.goalsFor ?? null);
      const goalsAgainst = isCompleted
        ? (isHome ? scoreAway! : scoreHome!)
        : (match.goalsAgainst ?? null);

      const derivedResult = isCompleted
        ? (goalsFor! > goalsAgainst! ? 'win' : goalsFor! < goalsAgainst! ? 'loss' : 'draw')
        : undefined;

      return {
        ...match,
        isHome,
        isCompleted,
        result: match.result || derivedResult,
        goalsFor: match.goalsFor ?? goalsFor,
        goalsAgainst: match.goalsAgainst ?? goalsAgainst,
      };
    });
  }, [matches, selectedSeason, selectedCompetitionId, selectedCompetitionType, mainTeamId]);

  const seasons = useMemo(() => {
    const uniqueSeasons = Array.from(new Set(matches.map(m => {
      // Extract season from matchDate (e.g., "2025-08-17" -> "2025")
      const year = m.matchDate ? new Date(m.matchDate).getFullYear().toString() : null;
      return year;
    }).filter(Boolean))) as string[];
    return uniqueSeasons.sort((a, b) => b.localeCompare(a));
  }, [matches]);

  const seasonRecords = useMemo(() => {
    const records: { [key: string]: SeasonRecord } = {};

    filteredMatches.forEach(match => {
      // Extract season from matchDate
      const season = match.matchDate ? new Date(match.matchDate).getFullYear().toString() : null;
      if (!season) return;

      // Only count completed matches with a known result
      if (!match.isCompleted) return;
      const result = match.result;
      if (result !== "win" && result !== "draw" && result !== "loss") return;

      if (!records[season]) {
        records[season] = {
          season,
          points: 0,
          wins: 0,
          draws: 0,
          losses: 0,
          goalsFor: 0,
          goalsAgainst: 0,
          goalDifference: 0,
          winRate: 0,
          homeWins: 0,
          awayWins: 0,
        };
      }

      const record = records[season];
      const isHome = match.isHome;

      if (result === "win") {
        record.points += 3;
        record.wins += 1;
        if (isHome) record.homeWins += 1;
        else record.awayWins += 1;
      } else if (result === "draw") {
        record.points += 1;
        record.draws += 1;
      } else {
        record.losses += 1;
      }

      record.goalsFor += typeof match.goalsFor === 'number' ? match.goalsFor : 0;
      record.goalsAgainst += typeof match.goalsAgainst === 'number' ? match.goalsAgainst : 0;
      record.goalDifference = record.goalsFor - record.goalsAgainst;
    });

    Object.values(records).forEach(record => {
      const totalMatches = record.wins + record.draws + record.losses;
      record.winRate = totalMatches > 0 ? (record.wins / totalMatches) * 100 : 0;
    });

    return Object.values(records).sort((a, b) => b.season.localeCompare(a.season));
  }, [filteredMatches]);

  const mainStatsData = useMemo(() => {
    const stats: { [key: string]: MainStats } = {};
    
    MAIN_STATS.forEach(stat => {
      stats[stat.id] = {
        id: stat.id,
        name: stat.name,
        isPercentage: stat.isPercentage,
        total: 0,
        average: 0,
      };
    });

    filteredMatches.forEach(match => {
      MAIN_STATS.forEach(stat => {
        const value = match[stat.id as keyof typeof match];
        if (typeof value === 'number') {
          stats[stat.id].total += value;
        }
      });
    });

    const matchCount = filteredMatches.length;
    MAIN_STATS.forEach(stat => {
      stats[stat.id].average = matchCount > 0 ? stats[stat.id].total / matchCount : 0;
    });

    return Object.values(stats);
  }, [filteredMatches]);

  const topGoalscorers = useMemo(() => {
    const goals: { [key: string]: PlayerStats } = {};

    filteredMatches.forEach(match => {
      // Extract goalscorers from playerStats
      if (match.playerStats && Array.isArray(match.playerStats)) {
        match.playerStats.forEach((player: any) => {
          if (!goals[player.playerId]) {
            goals[player.playerId] = {
              playerId: player.playerId,
              playerName: player.playerName || 'Unknown',
              goals: 0,
              assists: 0,
              matches: 0,
            };
          }
          goals[player.playerId].goals += player.goals || 0;
          goals[player.playerId].assists += player.assists || 0;
          goals[player.playerId].matches += 1;
        });
      }
    });

    return Object.values(goals)
      .sort((a, b) => b.goals - a.goals)
      .slice(0, 10);
  }, [filteredMatches]);

  const topAssists = useMemo(() => {
    const assists: { [key: string]: PlayerStats } = {};

    filteredMatches.forEach(match => {
      // Extract assists from playerStats
      if (match.playerStats && Array.isArray(match.playerStats)) {
        match.playerStats.forEach((player: any) => {
          if (!assists[player.playerId]) {
            assists[player.playerId] = {
              playerId: player.playerId,
              playerName: player.playerName || 'Unknown',
              goals: 0,
              assists: 0,
              matches: 0,
            };
          }
          assists[player.playerId].goals += player.goals || 0;
          assists[player.playerId].assists += player.assists || 0;
          assists[player.playerId].matches += 1;
        });
      }
    });

    return Object.values(assists)
      .sort((a, b) => b.assists - a.assists)
      .slice(0, 10);
  }, [filteredMatches]);

  return {
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
    mainStats: mainStatsData,
    topGoalscorers,
    topAssists,
    mainTeamId,
  };
}
