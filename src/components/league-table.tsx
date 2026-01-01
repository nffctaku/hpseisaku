"use client";

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, getDocs, doc, getDoc } from 'firebase/firestore';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2 } from 'lucide-react';
import Image from 'next/image';

interface Competition {
  id: string;
  name: string;
  ownerUid: string;
}

interface Standing {
  id: string;
  rank: number;
  teamName: string;
  logoUrl?: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
}

interface LeagueTableProps {
  competitions: Competition[];
  variant?: 'home' | 'table';
}

export function LeagueTable({ competitions, variant = 'home' }: LeagueTableProps) {
  const [standings, setStandings] = useState<Standing[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCompetition, setSelectedCompetition] = useState<{ name: string; logoUrl?: string } | null>(null);

  const formatGoalDifference = (value: number) => {
    if (value > 0) return `+${value}`;
    return `${value}`;
  };

  useEffect(() => {
    if (!competitions || competitions.length === 0) {
      setLoading(false);
      return;
    }

    const fetchStandings = async () => {
      setLoading(true);
      try {
        const selectedComp =
          (competitions.find((c) => (c as any).showOnHome) as Competition | undefined) ||
          competitions[0];
        if (!selectedComp) return;

        const competitionDocRef = doc(db, `clubs/${selectedComp.ownerUid}/competitions`, selectedComp.id);

        // 1. Fetch teams + competition doc + (optional) manually saved standings in parallel
        const [allTeamsSnap, competitionSnap, standingsSnap] = await Promise.all([
          getDocs(query(collection(db, `clubs/${selectedComp.ownerUid}/teams`))),
          getDoc(competitionDocRef),
          getDocs(collection(competitionDocRef, 'standings')),
        ]);

        const teamsMap = new Map<string, { name: string; logoUrl?: string }>();
        allTeamsSnap.forEach((d) => {
          teamsMap.set(d.id, { name: (d.data() as any).name, logoUrl: (d.data() as any).logoUrl });
        });

        const competitionData = competitionSnap.data() as any;

        // Save selected competition info (name/logo) for display
        setSelectedCompetition({
          name: (competitionData && (competitionData as any).name) || selectedComp.name,
          logoUrl: competitionData ? (competitionData as any).logoUrl : undefined,
        });

        if (!competitionData || !competitionData.teams) {
            console.log("No teams in this competition");
            setStandings([]);
            setLoading(false);
            return;
        }

        // Prefer manually saved standings if present
        if (!standingsSnap.empty) {
          const fetchedStandings = standingsSnap.docs
            .map((d) => {
              const data = d.data() as any;
              const teamInfo = teamsMap.get(d.id);
              const wins = typeof data.wins === 'number' ? data.wins : 0;
              const draws = typeof data.draws === 'number' ? data.draws : 0;
              const goalsFor = typeof data.goalsFor === 'number' ? data.goalsFor : 0;
              const goalsAgainst = typeof data.goalsAgainst === 'number' ? data.goalsAgainst : 0;

              const points = typeof data.points === 'number' ? data.points : (wins * 3 + draws);
              const goalDifference =
                typeof data.goalDifference === 'number' ? data.goalDifference : (goalsFor - goalsAgainst);

              return {
                id: d.id,
                rank: typeof data.rank === 'number' ? data.rank : 0,
                teamName: teamInfo?.name || data.teamName || 'Unknown Team',
                logoUrl: teamInfo?.logoUrl,
                played: typeof data.played === 'number' ? data.played : 0,
                wins,
                draws,
                losses: typeof data.losses === 'number' ? data.losses : 0,
                goalsFor,
                goalsAgainst,
                goalDifference,
                points,
              } as Standing;
            })
            .sort((a, b) => a.rank - b.rank);

          setStandings(fetchedStandings);
          setLoading(false);
          return;
        }

        // 3. Initialize standings for all participating teams
        const standingsMap = new Map<string, Standing>();
        for (const teamId of competitionData.teams) {
            const teamInfo = teamsMap.get(teamId);
            standingsMap.set(teamId, {
                id: teamId,
                teamName: teamInfo?.name || 'Unknown Team',
                logoUrl: teamInfo?.logoUrl,
                rank: 0, played: 0, wins: 0, draws: 0, losses: 0,
                goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0,
            });
        }

        // 4. Fetch all matches and calculate results (rounds->matches in parallel)
        const roundsSnap = await getDocs(collection(competitionDocRef, 'rounds'));

        const matchesByRound = await Promise.all(
          roundsSnap.docs.map(async (roundDoc) => {
            const matchesSnap = await getDocs(collection(roundDoc.ref, 'matches'));
            return matchesSnap.docs.map((matchDoc) => matchDoc.data() as any);
          })
        );

        for (const match of matchesByRound.flat()) {
          if (match.scoreHome == null || match.scoreAway == null || match.scoreHome === '' || match.scoreAway === '') {
            continue;
          }

          const homeTeamId = match.homeTeam;
          const awayTeamId = match.awayTeam;
          const homeScore = Number(match.scoreHome);
          const awayScore = Number(match.scoreAway);

          const homeStanding = standingsMap.get(homeTeamId);
          const awayStanding = standingsMap.get(awayTeamId);

          if (homeStanding) {
            homeStanding.played += 1;
            homeStanding.goalsFor += homeScore;
            homeStanding.goalsAgainst += awayScore;
            if (homeScore > awayScore) homeStanding.wins += 1;
            else if (homeScore < awayScore) homeStanding.losses += 1;
            else homeStanding.draws += 1;
          }

          if (awayStanding) {
            awayStanding.played += 1;
            awayStanding.goalsFor += awayScore;
            awayStanding.goalsAgainst += homeScore;
            if (awayScore > homeScore) awayStanding.wins += 1;
            else if (awayScore < homeScore) awayStanding.losses += 1;
            else awayStanding.draws += 1;
          }
        }

        // 5. Finalize points and goal difference, then sort
        const finalStandings = Array.from(standingsMap.values()).map(s => {
            s.points = (s.wins * 3) + s.draws;
            s.goalDifference = s.goalsFor - s.goalsAgainst;
            return s;
        });

        finalStandings.sort((a, b) => {
            if (a.points !== b.points) return b.points - a.points;
            if (a.goalDifference !== b.goalDifference) return b.goalDifference - a.goalDifference;
            if (a.goalsFor !== b.goalsFor) return b.goalsFor - a.goalsFor;
            return a.teamName.localeCompare(b.teamName);
        });

        // 6. Assign ranks
        const rankedStandings = finalStandings.map((s, index) => ({ ...s, rank: index + 1 }));

        setStandings(rankedStandings);
      } catch (error) {
        console.error("Error calculating standings: ", error);
        setStandings([]);
      } finally {
        setLoading(false);
      }
    };

    fetchStandings();
  }, [competitions]);

  if (!competitions || competitions.length === 0) {
    return (
      <div className="bg-white p-4 rounded-lg text-center text-muted-foreground shadow-sm">
        <p>表示できる大会がありません。</p>
      </div>
    );
  }

  return (
    <div className="bg-white p-2 sm:p-3 rounded-lg shadow-sm">
      {selectedCompetition && (
        <div className="flex items-center gap-2 mb-2">
          {selectedCompetition.logoUrl && (
            <Image
              src={selectedCompetition.logoUrl}
              alt={selectedCompetition.name}
              width={22}
              height={22}
              className="rounded-full object-contain"
            />
          )}
          <h3 className="text-xs sm:text-sm font-semibold truncate">
            {selectedCompetition.name}
          </h3>
        </div>
      )}
      {loading ? (
        <div className="flex justify-center items-center h-48">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      ) : standings.length > 0 ? (
        <div className={variant === 'table' ? 'overflow-x-auto' : 'overflow-x-hidden sm:overflow-x-auto'}>
          <Table
            className={
              variant === 'table'
                ? 'min-w-[640px] text-xs'
                : 'w-full table-fixed sm:table-auto sm:min-w-[440px] text-xs'
            }
          >
            <TableHeader>
              <TableRow>
                <TableHead className="w-[24px] px-1 py-0.5 sm:w-[32px] sm:px-2 sm:py-1">#</TableHead>
                <TableHead className="px-1 py-0.5 sm:px-2 sm:py-1">Club</TableHead>
                <TableHead className="w-[36px] text-right tabular-nums px-1 py-0.5 sm:w-auto sm:px-2 sm:py-1">試</TableHead>
                {variant === 'table' ? (
                  <>
                    <TableHead className="text-right tabular-nums px-1 py-0.5 sm:px-2 sm:py-1">勝</TableHead>
                    <TableHead className="text-right tabular-nums px-1 py-0.5 sm:px-2 sm:py-1">分</TableHead>
                    <TableHead className="text-right tabular-nums px-1 py-0.5 sm:px-2 sm:py-1">負</TableHead>
                    <TableHead className="text-right tabular-nums px-1 py-0.5 sm:px-2 sm:py-1">得</TableHead>
                    <TableHead className="text-right tabular-nums px-1 py-0.5 sm:px-2 sm:py-1">失</TableHead>
                  </>
                ) : (
                  <>
                    <TableHead className="hidden sm:table-cell text-right px-1 py-0.5 sm:px-2 sm:py-1">勝</TableHead>
                    <TableHead className="hidden sm:table-cell text-right px-1 py-0.5 sm:px-2 sm:py-1">分</TableHead>
                    <TableHead className="hidden sm:table-cell text-right px-1 py-0.5 sm:px-2 sm:py-1">負</TableHead>
                  </>
                )}
                <TableHead className="w-[44px] text-right tabular-nums px-1 py-0.5 sm:w-auto sm:px-2 sm:py-1">±</TableHead>
                <TableHead className="w-[36px] text-right tabular-nums px-1 py-0.5 sm:w-auto sm:px-2 sm:py-1">点</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {standings.map((team) => (
                <TableRow key={team.id}>
                  <TableCell className="font-medium px-1 py-0.5 sm:px-2 sm:py-1">{team.rank}</TableCell>
                  <TableCell className="px-1 py-0.5 sm:px-2 sm:py-1">
                    <div className="flex items-center gap-1.5">
                      {team.logoUrl ? (
                        <Image
                          src={team.logoUrl}
                          alt={team.teamName}
                          width={18}
                          height={18}
                          className="rounded-full object-contain"
                        />
                      ) : (
                        <div className="w-[18px] h-[18px] bg-muted rounded-full" />
                      )}
                      <span className="truncate max-w-[130px] sm:max-w-none">{team.teamName}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums px-1 py-0.5 sm:px-2 sm:py-1">{team.played}</TableCell>
                  {variant === 'table' ? (
                    <>
                      <TableCell className="text-right tabular-nums px-1 py-0.5 sm:px-2 sm:py-1">{team.wins}</TableCell>
                      <TableCell className="text-right tabular-nums px-1 py-0.5 sm:px-2 sm:py-1">{team.draws}</TableCell>
                      <TableCell className="text-right tabular-nums px-1 py-0.5 sm:px-2 sm:py-1">{team.losses}</TableCell>
                      <TableCell className="text-right tabular-nums px-1 py-0.5 sm:px-2 sm:py-1">{team.goalsFor}</TableCell>
                      <TableCell className="text-right tabular-nums px-1 py-0.5 sm:px-2 sm:py-1">{team.goalsAgainst}</TableCell>
                    </>
                  ) : (
                    <>
                      <TableCell className="hidden sm:table-cell text-right px-1 py-0.5 sm:px-2 sm:py-1">{team.wins}</TableCell>
                      <TableCell className="hidden sm:table-cell text-right px-1 py-0.5 sm:px-2 sm:py-1">{team.draws}</TableCell>
                      <TableCell className="hidden sm:table-cell text-right px-1 py-0.5 sm:px-2 sm:py-1">{team.losses}</TableCell>
                    </>
                  )}
                  <TableCell className="text-right tabular-nums px-1 py-0.5 sm:px-2 sm:py-1">{formatGoalDifference(team.goalDifference)}</TableCell>
                  <TableCell className="text-right tabular-nums px-1 py-0.5 sm:px-2 sm:py-1 font-bold">{team.points}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="text-center py-10 border-2 border-dashed border-border rounded-lg">
          <p className="text-muted-foreground">表示できる順位情報がありません</p>
        </div>
      )}
    </div>
  );
}
