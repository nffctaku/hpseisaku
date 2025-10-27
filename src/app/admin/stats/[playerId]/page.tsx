"use client";

import { useState, useEffect, useMemo } from 'react';
import { useParams, notFound } from 'next/navigation';
import { db } from '@/lib/firebase';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { MatchDetails, Player } from '@/types/match';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from 'lucide-react';

interface Competition {
  id: string;
  name: string;
  season: string;
}

export default function PlayerStatsPage() {
  const params = useParams();
  const { user } = useAuth();
  const playerId = params.playerId as string;

  const [playerInfo, setPlayerInfo] = useState<Player | null>(null);
  const [allStats, setAllStats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCompetition, setSelectedCompetition] = useState('all');

  useEffect(() => {
    if (!playerId || !user) return;

    const fetchData = async () => {
      setLoading(true);
      const ownerUid = user.uid;

      // 1. Get Player Info
      const seasonsRef = collection(db, `clubs/${ownerUid}/seasons`);
      const seasonsSnap = await getDocs(seasonsRef);
      let pInfo: Player | null = null;
      for (const seasonDoc of seasonsSnap.docs) {
        const playerDocRef = doc(db, `clubs/${ownerUid}/seasons/${seasonDoc.id}/roster/${playerId}`);
        const playerDocSnap = await getDoc(playerDocRef);
        if (playerDocSnap.exists()) {
          pInfo = { id: playerDocSnap.id, ...playerDocSnap.data() } as Player;
          break;
        }
      }

      if (!pInfo) {
        setLoading(false);
        return;
      }
      setPlayerInfo(pInfo);

      // 2. Pre-fetch all teams for efficient lookup
      const teamsRef = collection(db, `clubs/${ownerUid}/teams`);
      const teamsSnap = await getDocs(teamsRef);
      const teamsMap = new Map(teamsSnap.docs.map((doc) => [doc.id, doc.data().name]));

      // 3. Get all competitions
      const competitionsRef = collection(db, `clubs/${ownerUid}/competitions`);
      const competitionsSnap = await getDocs(competitionsRef);
      const competitions = competitionsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Competition));

      // 4. Get all matches and filter
      const matchStats: any[] = [];
      for (const comp of competitions) {
        const roundsRef = collection(db, `clubs/${ownerUid}/competitions/${comp.id}/rounds`);
        const roundsSnap = await getDocs(roundsRef);
        for (const roundDoc of roundsSnap.docs) {
          const matchesRef = collection(db, `clubs/${ownerUid}/competitions/${comp.id}/rounds/${roundDoc.id}/matches`);
          const matchesSnap = await getDocs(matchesRef);
          for (const matchDoc of matchesSnap.docs) {
                        const roundName = roundDoc.data().name;
            const match = matchDoc.data() as MatchDetails;
            if (!match.playerStats) continue;

            const playerStat = match.playerStats.find(p => p.playerId === playerId);

            if (playerStat) {
              const isHomeMatch = match.homeTeam === pInfo.teamId;
              const opponentId = isHomeMatch ? match.awayTeam : match.homeTeam;
              const opponentName = teamsMap.get(opponentId || "") || (isHomeMatch ? match.awayTeamName : match.homeTeamName) || "Unknown Team";

                            matchStats.push({
                roundName: roundName,
                competitionName: comp.name,
                date: match.matchDate,
                home: isHomeMatch,
                opponent: opponentName,
                result: `${match.scoreHome}-${match.scoreAway}`,
                position: playerStat.position,
                goals: playerStat.goals || 0,
                assists: playerStat.assists || 0,
                yellowCards: playerStat.yellowCards || 0,
                redCards: playerStat.redCards || 0,
                minutesPlayed: playerStat.minutesPlayed || 0,
              });
            }
          }
        }
      }

      matchStats.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setAllStats(matchStats);
      setLoading(false);
    };

    fetchData();
  }, [playerId, user]);

  const competitionNames = useMemo(() => {
    const names = new Set(allStats.map(s => s.competitionName));
    return ['all', ...Array.from(names)];
  }, [allStats]);

  const filteredStats = useMemo(() => {
    if (selectedCompetition === 'all') return allStats;
    return allStats.filter(s => s.competitionName === selectedCompetition);
  }, [allStats, selectedCompetition]);

  const totalStats = useMemo(() => {
    return filteredStats.reduce((acc, stat) => {
        acc.appearances += 1;
        acc.goals += stat.goals;
        acc.assists += stat.assists;
        acc.yellowCards += stat.yellowCards;
        acc.redCards += stat.redCards;
        acc.minutesPlayed += stat.minutesPlayed;
        return acc;
    }, { appearances: 0, goals: 0, assists: 0, yellowCards: 0, redCards: 0, minutesPlayed: 0 });
  }, [filteredStats]);

  if (loading) {
    return <div className="flex justify-center items-center h-screen"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  if (!playerInfo) {
    return notFound();
  }

  return (
    <div className="container mx-auto py-8">
        <div className="flex justify-between items-center mb-6">
            <h1 className="text-3xl font-bold">{playerInfo.name} - 試合別スタッツ</h1>
            <Select value={selectedCompetition} onValueChange={setSelectedCompetition}>
                <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="大会で絞り込み" />
                </SelectTrigger>
                <SelectContent>
                    {competitionNames.map(name => (
                        <SelectItem key={name} value={name}>{name === 'all' ? 'すべての大会' : name}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
        <div className="rounded-md border">
            <Table>
                <TableHeader>
                    <TableRow>
                                                <TableHead>大会</TableHead>
                        <TableHead>節</TableHead>
                        <TableHead>日付</TableHead>
                        <TableHead>会場</TableHead>
                        <TableHead>対戦相手</TableHead>
                        <TableHead>結果</TableHead>
                        <TableHead>ポジション</TableHead>
                        <TableHead className="text-center">⚽</TableHead>
                        <TableHead className="text-center">🅰️</TableHead>
                        <TableHead className="text-center">🟨</TableHead>
                        <TableHead className="text-center">🟥</TableHead>
                        <TableHead className="text-right">出場時間</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {filteredStats.map((stat, index) => (
                        <TableRow key={index}>
                                                        <TableCell>{stat.competitionName}</TableCell>
                            <TableCell>{stat.roundName}</TableCell>
                            <TableCell>{new Date(stat.date).toLocaleDateString('ja-JP')}</TableCell>
                            <TableCell>{stat.home ? 'H' : 'A'}</TableCell>
                            <TableCell>{stat.opponent}</TableCell>
                            <TableCell>{stat.result}</TableCell>
                            <TableCell>{stat.position}</TableCell>
                            <TableCell className="text-center">{stat.goals > 0 ? stat.goals : '-'}</TableCell>
                            <TableCell className="text-center">{stat.assists > 0 ? stat.assists : '-'}</TableCell>
                            <TableCell className="text-center">{stat.yellowCards > 0 ? stat.yellowCards : '-'}</TableCell>
                            <TableCell className="text-center">{stat.redCards > 0 ? stat.redCards : '-'}</TableCell>
                            <TableCell className="text-right">{stat.minutesPlayed > 0 ? `${stat.minutesPlayed}'` : '-'}</TableCell>
                        </TableRow>
                    ))}
                </TableBody>
                <TableFooter>
                    <TableRow>
                                                <TableCell colSpan={7} className="font-bold">合計 ({totalStats.appearances}試合)</TableCell>
                        <TableCell className="text-center font-bold">{totalStats.goals}</TableCell>
                        <TableCell className="text-center font-bold">{totalStats.assists}</TableCell>
                        <TableCell className="text-center font-bold">{totalStats.yellowCards}</TableCell>
                        <TableCell className="text-center font-bold">{totalStats.redCards}</TableCell>
                        <TableCell className="text-right font-bold">{totalStats.minutesPlayed}'</TableCell>
                    </TableRow>
                </TableFooter>
            </Table>
        </div>
    </div>
  );
}
