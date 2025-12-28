import { useState, useEffect, useCallback } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, getDocs } from 'firebase/firestore';

// Type definitions (consider moving to a shared types file)
export interface PlayerStats {
  appearances: number;
  minutes: number;
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
}

type ManualCompetitionStat = {
  competitionId: string;
  matches?: number;
  minutes?: number;
  goals?: number;
  assists?: number;
  yellowCards?: number;
  redCards?: number;
  avgRating?: number;
};

export function usePlayerStats(ownerUid: string | null, seasonId: string = 'all', competitionId: string = 'all') {
  const [stats, setStats] = useState<Record<string, PlayerStats>>({});
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    if (!ownerUid) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const aggregatedStats: Record<string, PlayerStats> = {};

    try {
      const manualByCompetition = new Map<string, Map<string, ManualCompetitionStat>>();
      const teamsSnapshot = await getDocs(query(collection(db, `clubs/${ownerUid}/teams`)));
      for (const teamDoc of teamsSnapshot.docs) {
        const playersSnapshot = await getDocs(query(collection(db, `clubs/${ownerUid}/teams/${teamDoc.id}/players`)));
        for (const pDoc of playersSnapshot.docs) {
          const pdata = pDoc.data() as any;
          const rows = Array.isArray(pdata?.manualCompetitionStats) ? (pdata.manualCompetitionStats as any[]) : [];
          for (const r of rows) {
            const compId = typeof r?.competitionId === 'string' ? r.competitionId : '';
            if (!compId) continue;
            const compMap = manualByCompetition.get(compId) ?? new Map<string, ManualCompetitionStat>();
            compMap.set(pDoc.id, {
              competitionId: compId,
              matches: typeof r?.matches === 'number' ? r.matches : undefined,
              minutes: typeof r?.minutes === 'number' ? r.minutes : undefined,
              goals: typeof r?.goals === 'number' ? r.goals : undefined,
              assists: typeof r?.assists === 'number' ? r.assists : undefined,
              yellowCards: typeof r?.yellowCards === 'number' ? r.yellowCards : undefined,
              redCards: typeof r?.redCards === 'number' ? r.redCards : undefined,
              avgRating: typeof r?.avgRating === 'number' ? r.avgRating : undefined,
            });
            manualByCompetition.set(compId, compMap);
          }
        }
      }

      const competitionsQuery = query(collection(db, `clubs/${ownerUid}/competitions`));
      const competitionsSnapshot = await getDocs(competitionsQuery);

      for (const competitionDoc of competitionsSnapshot.docs) {
        // Filter by season first, if a specific season is selected
        if (seasonId !== 'all' && competitionDoc.data().season !== seasonId) {
          continue;
        }

        // Then, filter by competition, if a specific competition is selected
        if (competitionId !== 'all' && competitionDoc.id !== competitionId) {
          continue;
        }

        const manualForThisCompetition = manualByCompetition.get(competitionDoc.id) ?? new Map<string, ManualCompetitionStat>();
        if (manualForThisCompetition.size > 0) {
          for (const [playerId, m] of manualForThisCompetition.entries()) {
            if (!aggregatedStats[playerId]) {
              aggregatedStats[playerId] = { appearances: 0, minutes: 0, goals: 0, assists: 0, yellowCards: 0, redCards: 0 };
            }
            aggregatedStats[playerId].appearances += Number.isFinite(m.matches as any) ? Number(m.matches) : 0;
            aggregatedStats[playerId].minutes += Number.isFinite(m.minutes as any) ? Number(m.minutes) : 0;
            aggregatedStats[playerId].goals += Number.isFinite(m.goals as any) ? Number(m.goals) : 0;
            aggregatedStats[playerId].assists += Number.isFinite(m.assists as any) ? Number(m.assists) : 0;
            aggregatedStats[playerId].yellowCards += Number.isFinite(m.yellowCards as any) ? Number(m.yellowCards) : 0;
            aggregatedStats[playerId].redCards += Number.isFinite(m.redCards as any) ? Number(m.redCards) : 0;
          }
        }

        const roundsQuery = query(collection(db, `clubs/${ownerUid}/competitions/${competitionDoc.id}/rounds`));
        const roundsSnapshot = await getDocs(roundsQuery);

        for (const roundDoc of roundsSnapshot.docs) {
          const matchesQuery = query(collection(db, `clubs/${ownerUid}/competitions/${competitionDoc.id}/rounds/${roundDoc.id}/matches`));
          const matchesSnapshot = await getDocs(matchesQuery);

          for (const matchDoc of matchesSnapshot.docs) {
            const matchData = matchDoc.data();
            if (matchData.playerStats && Array.isArray(matchData.playerStats)) {
              for (const stat of matchData.playerStats) {
                const playerId = stat.playerId;
                if (manualForThisCompetition.has(playerId)) {
                  continue;
                }
                if (!aggregatedStats[playerId]) {
                  aggregatedStats[playerId] = { appearances: 0, minutes: 0, goals: 0, assists: 0, yellowCards: 0, redCards: 0 };
                }
                const minutesPlayed = Number(stat.minutesPlayed) || 0;
                aggregatedStats[playerId].appearances += minutesPlayed > 0 ? 1 : 0;
                aggregatedStats[playerId].minutes += minutesPlayed;
                aggregatedStats[playerId].goals += Number(stat.goals) || 0;
                aggregatedStats[playerId].assists += Number(stat.assists) || 0;
                aggregatedStats[playerId].yellowCards += Number(stat.yellowCards) || 0;
                aggregatedStats[playerId].redCards += Number(stat.redCards) || 0;
              }
            }
          }
        }
      }
      setStats(aggregatedStats);
    } catch (error) {
      console.error("Error fetching player stats:", error);
    } finally {
      setLoading(false);
    }
  }, [ownerUid, seasonId, competitionId]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return { stats, loading, refetch: fetchStats };
}
