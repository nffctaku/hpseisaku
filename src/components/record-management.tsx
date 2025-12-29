"use client";

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { collection, getDocs, query } from 'firebase/firestore';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { TeamStat } from '@/types/match';

interface TeamOption {
  id: string;
  name: string;
}

interface CompetitionDoc {
  id: string;
  name: string;
  season?: string;
}

interface MatchForRecords {
  id: string;
  competitionId: string;
  competitionName: string;
  competitionSeason?: string;
  homeTeamId: string;
  awayTeamId: string;
  matchDate: string;
  scoreHome?: number | null;
  scoreAway?: number | null;
  teamStats?: TeamStat[];
}

interface CompetitionRecordRow {
  competitionId: string;
  competitionName: string;
  competitionSeason?: string;
  matches: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  shots?: number;
  shotsOnTarget?: number;
  possessionAvg?: number;
}

export function RecordManagement() {
  const { user } = useAuth();
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string>('');
  const [seasons, setSeasons] = useState<string[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<string>('all');
  const [competitions, setCompetitions] = useState<CompetitionDoc[]>([]);
  const [selectedCompetitionId, setSelectedCompetitionId] = useState<string>('all');
  const [matches, setMatches] = useState<MatchForRecords[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      setLoading(true);
      try {
        // 1. Fetch teams for the club
        const teamsQueryRef = query(collection(db, `clubs/${user.uid}/teams`));
        const teamsSnap = await getDocs(teamsQueryRef);
        const teamsData: TeamOption[] = teamsSnap.docs.map(doc => ({
          id: doc.id,
          name: (doc.data().name as string) || doc.id,
        }));
        teamsData.sort((a, b) => a.name.localeCompare(b.name));
        setTeams(teamsData);

        // 2. Fetch competitions, rounds, and matches
        const competitionsQueryRef = query(collection(db, `clubs/${user.uid}/competitions`));
        const competitionsSnap = await getDocs(competitionsQueryRef);

        const competitionsData: CompetitionDoc[] = competitionsSnap.docs.map(doc => {
          const data = doc.data() as any;
          return {
            id: doc.id,
            name: (data.name as string) || doc.id,
            season: data.season as string | undefined,
          };
        });

        // Build season and competition options
        const seasonSet = new Set<string>();
        competitionsData.forEach(comp => {
          if (comp.season && typeof comp.season === 'string' && comp.season.trim() !== '') {
            seasonSet.add(comp.season);
          }
        });
        const seasonList = Array.from(seasonSet).sort((a, b) => a.localeCompare(b));
        setSeasons(seasonList);
        setCompetitions(competitionsData);

        const allMatches: MatchForRecords[] = [];

        for (const compDoc of competitionsData) {
          // Filter by selected season
          if (selectedSeason !== 'all' && compDoc.season && compDoc.season !== selectedSeason) {
            continue;
          }

          // Filter by selected competition
          if (selectedCompetitionId !== 'all' && compDoc.id !== selectedCompetitionId) {
            continue;
          }

          const roundsQueryRef = query(collection(db, `clubs/${user.uid}/competitions/${compDoc.id}/rounds`));
          const roundsSnap = await getDocs(roundsQueryRef);

          for (const roundDoc of roundsSnap.docs) {
            const matchesQueryRef = query(collection(db, `clubs/${user.uid}/competitions/${compDoc.id}/rounds/${roundDoc.id}/matches`));
            const matchesSnap = await getDocs(matchesQueryRef);

            for (const matchDoc of matchesSnap.docs) {
              const matchData = matchDoc.data() as any;
              allMatches.push({
                id: matchDoc.id,
                competitionId: compDoc.id,
                competitionName: compDoc.name,
                competitionSeason: compDoc.season,
                homeTeamId: matchData.homeTeam,
                awayTeamId: matchData.awayTeam,
                matchDate: matchData.matchDate,
                scoreHome: matchData.scoreHome,
                scoreAway: matchData.scoreAway,
                teamStats: matchData.teamStats as TeamStat[] | undefined,
              });
            }
          }
        }

        // Sort matches by date for stable processing
        allMatches.sort((a, b) => new Date(a.matchDate).getTime() - new Date(b.matchDate).getTime());
        setMatches(allMatches);

        // If no team selected yet, default to first team
        if (!selectedTeamId && teamsData.length > 0) {
          setSelectedTeamId(teamsData[0].id);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user, selectedSeason, selectedCompetitionId]);

  const recordsByCompetition: CompetitionRecordRow[] = useMemo(() => {
    if (!selectedTeamId) return [];

    const byComp = new Map<string, CompetitionRecordRow>();

    for (const match of matches) {
      const isHome = match.homeTeamId === selectedTeamId;
      const isAway = match.awayTeamId === selectedTeamId;
      if (!isHome && !isAway) continue;

      const key = match.competitionId;
      if (!byComp.has(key)) {
        byComp.set(key, {
          competitionId: match.competitionId,
          competitionName: match.competitionName,
          competitionSeason: match.competitionSeason,
          matches: 0,
          wins: 0,
          draws: 0,
          losses: 0,
          goalsFor: 0,
          goalsAgainst: 0,
          shots: 0,
          shotsOnTarget: 0,
          possessionAvg: undefined,
        });
      }

      const row = byComp.get(key)!;
      row.matches += 1;

      // Goals and W/D/L only when scores are present
      if (typeof match.scoreHome === 'number' && typeof match.scoreAway === 'number') {
        const gf = isHome ? match.scoreHome : match.scoreAway;
        const ga = isHome ? match.scoreAway : match.scoreHome;
        row.goalsFor += gf;
        row.goalsAgainst += ga;

        if (gf > ga) row.wins += 1;
        else if (gf === ga) row.draws += 1;
        else row.losses += 1;
      }

      // Aggregate key teamStats: shots, shotsOnTarget, possession
      if (match.teamStats && Array.isArray(match.teamStats)) {
        const sideKey = isHome ? 'homeValue' : 'awayValue';

        for (const stat of match.teamStats) {
          const rawVal = (stat as any)[sideKey];
          const numVal = typeof rawVal === 'number' ? rawVal : parseFloat(String(rawVal));
          if (isNaN(numVal)) {
            continue;
          }

          if (stat.id === 'shots') {
            row.shots = (row.shots || 0) + numVal;
          } else if (stat.id === 'shotsOnTarget') {
            row.shotsOnTarget = (row.shotsOnTarget || 0) + numVal;
          } else if (stat.id === 'possession') {
            // For possession we later convert to average
            row.possessionAvg = (row.possessionAvg || 0) + numVal;
          }
        }
      }
    }

    // Finalize possession average per competition
    for (const row of byComp.values()) {
      if (row.matches > 0 && typeof row.possessionAvg === 'number') {
        row.possessionAvg = row.possessionAvg / row.matches;
      } else {
        row.possessionAvg = undefined;
      }
    }

    return Array.from(byComp.values()).sort((a, b) => a.competitionName.localeCompare(b.competitionName));
  }, [matches, selectedTeamId]);

  if (!user) {
    return <div className="py-6 text-center text-muted-foreground">ログインが必要です。</div>;
  }

  return (
    <div className="py-6 space-y-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2">
        <div className="font-semibold">チームごとの大会記録</div>
        <div className="flex flex-wrap items-center gap-2 justify-end">
          <Select value={selectedSeason} onValueChange={setSelectedSeason}>
            <SelectTrigger className="w-[180px] bg-white text-gray-900">
              <SelectValue placeholder="シーズンを選択" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">すべてのシーズン</SelectItem>
              {seasons.map(s => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={selectedTeamId} onValueChange={setSelectedTeamId}>
            <SelectTrigger className="w-[180px] bg-white text-gray-900">
              <SelectValue placeholder="チームを選択" />
            </SelectTrigger>
            <SelectContent>
              {teams.map(team => (
                <SelectItem key={team.id} value={team.id}>{team.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={selectedCompetitionId} onValueChange={setSelectedCompetitionId}>
            <SelectTrigger className="w-[180px] bg-white text-gray-900">
              <SelectValue placeholder="大会を選択" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">すべての大会</SelectItem>
              {competitions.map(c => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          <span>集計中...</span>
        </div>
      ) : !selectedTeamId ? (
        <div className="text-center py-10 text-muted-foreground">チームを選択すると大会ごとの成績が表示されます。</div>
      ) : recordsByCompetition.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground">選択したチームの試合記録がありません。</div>
      ) : (
        <div className="bg-white text-gray-900 border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>大会</TableHead>
                <TableHead>シーズン</TableHead>
                <TableHead className="text-right">順位</TableHead>
                <TableHead className="text-right">試合</TableHead>
                <TableHead className="text-right">勝</TableHead>
                <TableHead className="text-right">分</TableHead>
                <TableHead className="text-right">敗</TableHead>
                <TableHead className="text-right">得点</TableHead>
                <TableHead className="text-right">失点</TableHead>
                <TableHead className="text-right">±</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recordsByCompetition.map((row, idx) => {
                const goalDiff = row.goalsFor - row.goalsAgainst;

                return (
                  <TableRow key={row.competitionId}>
                    <TableCell>{row.competitionName}</TableCell>
                    <TableCell>{row.competitionSeason || '-'}</TableCell>
                    <TableCell className="text-right tabular-nums">{idx + 1}</TableCell>
                    <TableCell className="text-right">{row.matches}</TableCell>
                    <TableCell className="text-right">{row.wins}</TableCell>
                    <TableCell className="text-right">{row.draws}</TableCell>
                    <TableCell className="text-right">{row.losses}</TableCell>
                    <TableCell className="text-right">{row.goalsFor}</TableCell>
                    <TableCell className="text-right">{row.goalsAgainst}</TableCell>
                    <TableCell className="text-right">{goalDiff}</TableCell>
                  </TableRow>
                );
              })}

              {(() => {
                const totals = recordsByCompetition.reduce(
                  (acc, row) => {
                    acc.matches += row.matches;
                    acc.wins += row.wins;
                    acc.draws += row.draws;
                    acc.losses += row.losses;
                    acc.goalsFor += row.goalsFor;
                    acc.goalsAgainst += row.goalsAgainst;
                    return acc;
                  },
                  {
                    matches: 0,
                    wins: 0,
                    draws: 0,
                    losses: 0,
                    goalsFor: 0,
                    goalsAgainst: 0,
                  }
                );

                const totalGoalDiff = totals.goalsFor - totals.goalsAgainst;

                return (
                  <TableRow className="font-semibold bg-gray-50">
                    <TableCell>合計</TableCell>
                    <TableCell>-</TableCell>
                    <TableCell className="text-right">-</TableCell>
                    <TableCell className="text-right">{totals.matches}</TableCell>
                    <TableCell className="text-right">{totals.wins}</TableCell>
                    <TableCell className="text-right">{totals.draws}</TableCell>
                    <TableCell className="text-right">{totals.losses}</TableCell>
                    <TableCell className="text-right">{totals.goalsFor}</TableCell>
                    <TableCell className="text-right">{totals.goalsAgainst}</TableCell>
                    <TableCell className="text-right">{totalGoalDiff}</TableCell>
                  </TableRow>
                );
              })()}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
