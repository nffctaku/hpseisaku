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
}

export function LeagueTable({ competitions }: LeagueTableProps) {
  const [standings, setStandings] = useState<Standing[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCompetition, setSelectedCompetition] = useState<{ name: string; logoUrl?: string } | null>(null);

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

        // 1. Fetch all teams for the club to get their details
        const teamsMap = new Map<string, { name: string; logoUrl?: string }>();
        const allTeamsSnap = await getDocs(query(collection(db, `clubs/${selectedComp.ownerUid}/teams`)));
        allTeamsSnap.forEach(doc => {
          teamsMap.set(doc.id, { name: doc.data().name, logoUrl: doc.data().logoUrl });
        });

        // 2. Fetch the competition document to get the list of participating teams
        const competitionDocRef = doc(db, `clubs/${selectedComp.ownerUid}/competitions`, selectedComp.id);
        const competitionSnap = await getDoc(competitionDocRef);
        const competitionData = competitionSnap.data();

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

        // 4. Fetch all matches and calculate results
        console.log('Calculating standings...');
        const roundsSnap = await getDocs(collection(competitionDocRef, 'rounds'));
        console.log(`Found ${roundsSnap.size} rounds.`);
        let processedMatches = 0;

        for (const roundDoc of roundsSnap.docs) {
            const matchesSnap = await getDocs(collection(roundDoc.ref, 'matches'));
            console.log(`Round ${roundDoc.id} has ${matchesSnap.size} matches.`);
            matchesSnap.forEach(matchDoc => {
                const match = matchDoc.data();
                if (match.scoreHome == null || match.scoreAway == null || match.scoreHome === '' || match.scoreAway === '') {
                    return;
                }
                processedMatches++;

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
            });
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

        console.log('Processed matches with scores:', processedMatches);
        console.log('Final calculated standings:', rankedStandings);

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
    <div className="bg-white p-2 sm:p-4 rounded-lg shadow-sm">
      {selectedCompetition && (
        <div className="flex items-center gap-2 mb-3">
          {selectedCompetition.logoUrl && (
            <Image
              src={selectedCompetition.logoUrl}
              alt={selectedCompetition.name}
              width={28}
              height={28}
              className="rounded-full object-contain"
            />
          )}
          <h3 className="text-sm sm:text-base font-semibold truncate">
            {selectedCompetition.name}
          </h3>
        </div>
      )}
      {loading ? (
        <div className="flex justify-center items-center h-48">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      ) : standings.length > 0 ? (
        <div className="overflow-x-auto">
          <Table className="min-w-[480px]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[28px] p-1 sm:w-[40px] sm:p-2">#</TableHead>
                <TableHead className="p-1 sm:p-2">Club</TableHead>
                <TableHead className="text-right p-1 sm:p-2">試</TableHead>
                <TableHead className="text-right p-1 sm:p-2">勝</TableHead>
                <TableHead className="text-right p-1 sm:p-2">分</TableHead>
                <TableHead className="text-right p-1 sm:p-2">負</TableHead>
                <TableHead className="text-right p-1 sm:p-2">得失</TableHead>
                <TableHead className="text-right p-1 sm:p-2">点</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {standings.map((team) => (
                <TableRow key={team.id}>
                  <TableCell className="font-medium p-1 sm:p-2">{team.rank}</TableCell>
                  <TableCell className="p-1 sm:p-2">
                    <div className="flex items-center gap-2">
                      {team.logoUrl ? (
                        <Image
                          src={team.logoUrl}
                          alt={team.teamName}
                          width={24}
                          height={24}
                          className="rounded-full object-contain"
                        />
                      ) : (
                        <div className="w-6 h-6 bg-muted rounded-full" />
                      )}
                      <span className="truncate max-w-[140px] sm:max-w-none">{team.teamName}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right p-1 sm:p-2">{team.played}</TableCell>
                  <TableCell className="text-right p-1 sm:p-2">{team.wins}</TableCell>
                  <TableCell className="text-right p-1 sm:p-2">{team.draws}</TableCell>
                  <TableCell className="text-right p-1 sm:p-2">{team.losses}</TableCell>
                  <TableCell className="text-right p-1 sm:p-2">{team.goalDifference}</TableCell>
                  <TableCell className="text-right p-1 sm:p-2 font-bold">{team.points}</TableCell>
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
