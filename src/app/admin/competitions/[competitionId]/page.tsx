"use client";

import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import { collection, doc, getDoc, getDocs, query, where, updateDoc, addDoc, deleteDoc } from "firebase/firestore";
import Image from 'next/image';
import { useParams } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Loader2, ChevronLeft, ChevronRight, PlusCircle, Trash2, CalendarIcon } from 'lucide-react';
import Link from 'next/link';
import { toast } from "sonner";
import { cn } from '@/lib/utils';
import { format, isToday, isYesterday, isTomorrow, parseISO } from 'date-fns';
import { ja } from 'date-fns/locale';
import { MatchEditor } from '@/components/match-editor';
import { Match, Team } from '@/types/match';

// Define TypeScript interfaces
interface Competition {
  id: string;
  name: string;
  season: string;
  teams?: string[]; // Array of team IDs
}

interface Round {
  id: string;
  name: string;
  matches: Match[];
}

export default function CompetitionDetailPage() {
  const { user } = useAuth();
  const params = useParams();
  const competitionId = params.competitionId as string;

  const [competition, setCompetition] = useState<Competition | null>(null);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [allTeams, setAllTeams] = useState<Map<string, Team>>(new Map());
  const [competitionTeams, setCompetitionTeams] = useState<Team[]>([]);
  const [currentRoundIndex, setCurrentRoundIndex] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchAllData = async () => {
    if (!user || !competitionId) return;
    setLoading(true);
    try {
      // Fetch all teams first to create a map
      const allTeamsQuery = query(collection(db, `clubs/${user.uid}/teams`));
      const allTeamsSnap = await getDocs(allTeamsQuery);
      const teamsMap = new Map<string, Team>();
      allTeamsSnap.forEach(doc => teamsMap.set(doc.id, { id: doc.id, ...doc.data() } as Team));
      setAllTeams(teamsMap);


      // Then fetch the competition
      const compRef = doc(db, `clubs/${user.uid}/competitions`, competitionId);
      const compSnap = await getDoc(compRef);
      let fetchedCompetition: Competition | null = null;
      if (compSnap.exists()) {
        fetchedCompetition = { id: compSnap.id, ...compSnap.data() } as Competition;
        setCompetition(fetchedCompetition);
      }

      // Filter teams for the current competition
      if (fetchedCompetition && fetchedCompetition.teams) {
        const compTeams = fetchedCompetition.teams.map(id => teamsMap.get(id)).filter(Boolean) as Team[];
        // Also add the user's own team to the list, as it's now in the teamsMap
        const ownTeam = teamsMap.get(user.uid);
        if (ownTeam && !compTeams.some(t => t.id === user.uid)) {
          compTeams.push(ownTeam);
        }
        setCompetitionTeams(compTeams);
      }

      const roundsColRef = collection(db, `clubs/${user.uid}/competitions`, competitionId, 'rounds');
      const roundsSnap = await getDocs(query(roundsColRef));
      const roundsData = await Promise.all(roundsSnap.docs.map(async (roundDoc) => {
        const matchesColRef = collection(roundDoc.ref, 'matches');
        const matchesSnap = await getDocs(query(matchesColRef));
        const matchesData = matchesSnap.docs.map(matchDoc => ({ id: matchDoc.id, ...matchDoc.data() } as Match));
        matchesData.sort((a, b) => new Date(a.matchDate).getTime() - new Date(b.matchDate).getTime());
        return { id: roundDoc.id, name: roundDoc.data().name, matches: matchesData };
      }));
      roundsData.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
      setRounds(roundsData);
      if (roundsData.length > 0) {
        setCurrentRoundIndex(0);
      }
    } catch (error) {
      console.error("Error fetching data: ", error);
      toast.error("データの読み込みに失敗しました。");
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchAllData();
  }, [user, competitionId]);

  const currentRound = useMemo(() => rounds[currentRoundIndex], [rounds, currentRoundIndex]);

  const groupedMatches = useMemo(() => {
    if (!currentRound) return [];
    const groups = currentRound.matches.reduce((acc, match) => {
      const date = parseISO(match.matchDate);
      let groupName = format(date, 'M月d日(E)', { locale: ja });
      if (isToday(date)) groupName = '今日';
      if (isYesterday(date)) groupName = '昨日';
      if (isTomorrow(date)) groupName = '明日';
      
      if (!acc[groupName]) {
        acc[groupName] = [];
      }
      acc[groupName].push(match);
      return acc;
    }, {} as Record<string, Match[]>);
    return Object.entries(groups).sort(([a], [b]) => new Date(a.split('(')[0]).getTime() - new Date(b.split('(')[0]).getTime()) as [string, Match[]][];
  }, [currentRound]);

  const handleMatchUpdate = async (matchId: string, field: keyof Match, value: any) => {
    if (!user || !currentRound) return;
    const roundId = currentRound.id;
    const matchRef = doc(db, `clubs/${user.uid}/competitions/${competitionId}/rounds/${roundId}/matches`, matchId);
    try {
      const normalizedValue =
        (field === 'scoreHome' || field === 'scoreAway') && typeof value === 'number'
          ? Math.max(0, value)
          : value;

      await updateDoc(matchRef, { [field]: normalizedValue });
      setRounds(prevRounds => prevRounds.map(r => r.id === roundId ? {
        ...r,
        matches: r.matches.map(m => m.id === matchId ? { ...m, [field]: normalizedValue } : m)
      } : r));
      toast.success('更新しました。');
    } catch (error) {
      console.error(`Error updating match ${field}:`, error);
      toast.error('更新に失敗しました。');
    }
  };

  const handleAddRound = async () => {
    if (!user) return;
    const newRoundName = `第${rounds.length + 1}節`;
    const roundRef = await addDoc(collection(db, `clubs/${user.uid}/competitions`, competitionId, 'rounds'), { name: newRoundName });
    setRounds([...rounds, { id: roundRef.id, name: newRoundName, matches: [] }]);
    setCurrentRoundIndex(rounds.length);
    toast.success(`${newRoundName}を追加しました。`);
  };

  const handleAddMatch = async () => {
    if (!currentRound || !user) return;
    const lastMatchDate =
      Array.isArray(currentRound.matches) && currentRound.matches.length > 0
        ? currentRound.matches[currentRound.matches.length - 1]?.matchDate
        : undefined;
    const defaultMatchDate =
      typeof lastMatchDate === 'string' && lastMatchDate.trim().length > 0
        ? lastMatchDate
        : format(new Date(), 'yyyy-MM-dd');
    const newMatchData = { 
      homeTeam: '', awayTeam: '', 
      matchDate: defaultMatchDate, 
      competitionId, 
      scoreHome: null, scoreAway: null 
    };
    const matchRef = await addDoc(collection(db, `clubs/${user.uid}/competitions/${competitionId}/rounds/${currentRound.id}/matches`), newMatchData);
    const newMatch = { id: matchRef.id, ...newMatchData };
    setRounds(prev => prev.map(r => r.id === currentRound.id ? {...r, matches: [...r.matches, newMatch] } : r));
    toast.success('新しい試合を追加しました。');
  };

  
  if (loading) {
    return <div className="flex justify-center items-center h-screen"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  return (
    <div className="container mx-auto py-10">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h1 className="text-2xl font-bold">{competition?.name}</h1>
          <p className="text-muted-foreground">{competition?.season}</p>
        </div>
        <Link href={`/admin/competitions/${competitionId}/standings`}>
          <Button variant="outline" className="text-gray-900">順位表</Button>
        </Link>
      </div>

      <div className="flex justify-between items-center bg-card p-2 rounded-lg mb-8">
        <Button variant="ghost" size="icon" onClick={() => setCurrentRoundIndex(p => Math.max(0, p - 1))} disabled={currentRoundIndex === 0}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <Select value={currentRound?.id} onValueChange={(roundId) => setCurrentRoundIndex(rounds.findIndex(r => r.id === roundId))}>
          <SelectTrigger className="w-[180px] font-semibold text-lg">
            <SelectValue placeholder="節を選択" />
          </SelectTrigger>
          <SelectContent>
            {rounds.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="ghost" size="icon" onClick={() => setCurrentRoundIndex(p => Math.min(rounds.length - 1, p + 1))} disabled={currentRoundIndex >= rounds.length - 1}>
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>

      {currentRound && competition ? (
        <div className="space-y-6">
          {groupedMatches.map(([groupName, matchesInGroup]) => (
            <div key={groupName}>
              <h3 className="font-semibold mb-2 text-muted-foreground">{groupName}</h3>
              <div className="space-y-2">
                {matchesInGroup.map(match => (
                  <MatchEditor 
                    key={match.id} 
                    match={match} 
                    teams={competitionTeams} 
                    allTeamsMap={allTeams}
                    roundId={currentRound.id} 
                    season={competition.season} 
                    onUpdate={handleMatchUpdate} 
                    onDelete={fetchAllData} 
                  />
                ))}
              </div>
            </div>
          ))}
          <Button variant="outline" className="w-full text-gray-900" onClick={handleAddMatch}><PlusCircle className="mr-2 h-4 w-4" />試合を追加</Button>
        </div>
      ) : (
        <div className="text-center py-10 text-muted-foreground">
          <p>表示する節がありません。</p>
          <Button className="mt-4" onClick={handleAddRound}>最初の節を追加</Button>
        </div>
      )}
    </div>
  );
}
