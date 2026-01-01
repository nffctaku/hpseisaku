"use client";

import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import { collection, doc, getDoc, getDocs, query, where, updateDoc, addDoc, deleteDoc, setDoc, increment } from "firebase/firestore";
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
import { format, isToday, isValid, isYesterday, isTomorrow, parseISO } from 'date-fns';
import { ja } from 'date-fns/locale';
import { MatchEditor } from '@/components/match-editor';
import { Match, Team } from '@/types/match';

// Define TypeScript interfaces
interface Competition {
  id: string;
  name: string;
  season: string;
  format?: 'league' | 'cup' | 'league_cup';
  teams?: string[]; // Array of team IDs
}

interface Round {
  id: string;
  name: string;
  matches: Match[];
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

function getRoundSortKey(name: string): number {
  const s = (name || '').trim();
  if (!s) return Number.POSITIVE_INFINITY;

  const league = s.match(/^第?\s*(\d+)\s*節$/);
  if (league) return Number(league[1]);

  const cup = s.match(/^第?\s*(\d+)\s*回戦$/);
  if (cup) return 100 + Number(cup[1]);

  const special: Record<string, number> = {
    '予選': 10,
    '予備予選': 5,
    'プレーオフ': 700,
    'ラウンド16': 800,
    'ベスト16': 800,
    '準々決勝': 900,
    '準決勝': 950,
    '3位決定戦': 975,
    '決勝': 1000,
  };
  if (s in special) return special[s];

  return 100000;
}

function isLeagueRoundName(name: string | undefined): boolean {
  const s = (name || '').trim();
  if (!s) return false;
  return /^第?\s*(\d+)\s*節$/.test(s);
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
      roundsData.sort((a, b) => {
        const ka = getRoundSortKey(a.name);
        const kb = getRoundSortKey(b.name);
        if (ka !== kb) return ka - kb;
        return a.name.localeCompare(b.name, undefined, { numeric: true });
      });
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

  const canEditStandings = useMemo(() => {
    const fmt = competition?.format;
    if (fmt === 'cup') return false;
    if (fmt === 'league_cup') return isLeagueRoundName(currentRound?.name);
    return true;
  }, [competition?.format, currentRound?.name]);

  const syncPublicMatchIndex = async (roundId: string, matchId: string, patch?: Partial<Match>) => {
    if (!user) return;

    const round = rounds.find((r) => r.id === roundId);
    const match = round?.matches.find((m) => m.id === matchId);
    const merged = { ...(match as any), ...(patch as any) } as any;

    const compName = competition?.name;
    const roundName = round?.name;

    const homeTeamId = typeof merged.homeTeam === 'string' ? merged.homeTeam : '';
    const awayTeamId = typeof merged.awayTeam === 'string' ? merged.awayTeam : '';
    const homeTeamInfo = homeTeamId ? allTeams.get(homeTeamId) : undefined;
    const awayTeamInfo = awayTeamId ? allTeams.get(awayTeamId) : undefined;

    const row: MatchIndexRow = {
      matchId,
      competitionId,
      roundId,
      matchDate: typeof merged.matchDate === 'string' ? merged.matchDate : '',
      matchTime: typeof merged.matchTime === 'string' ? merged.matchTime : undefined,
      competitionName: compName,
      roundName,
      homeTeam: homeTeamId,
      awayTeam: awayTeamId,
      homeTeamName: homeTeamInfo?.name || merged.homeTeamName,
      awayTeamName: awayTeamInfo?.name || merged.awayTeamName,
      homeTeamLogo: homeTeamInfo?.logoUrl || merged.homeTeamLogo,
      awayTeamLogo: awayTeamInfo?.logoUrl || merged.awayTeamLogo,
      scoreHome: typeof merged.scoreHome === 'number' ? merged.scoreHome : (merged.scoreHome ?? null),
      scoreAway: typeof merged.scoreAway === 'number' ? merged.scoreAway : (merged.scoreAway ?? null),
    };

    const rowForFirestore: any = { ...(row as any) };
    for (const k of Object.keys(rowForFirestore)) {
      if (rowForFirestore[k] === undefined) delete rowForFirestore[k];
    }

    const indexDocId = `${competitionId}__${roundId}__${matchId}`;
    const indexRef = doc(db, `clubs/${user.uid}/public_match_index`, indexDocId);
    await setDoc(indexRef, rowForFirestore, { merge: true });
  };

  const groupedMatches = useMemo(() => {
    if (!currentRound) return [];
    const reduced = currentRound.matches.reduce(
      (acc, match) => {
        const raw = typeof match.matchDate === 'string' ? match.matchDate : '';
        const date = parseISO(raw);

        let groupName = '日付未設定';
        let sortMs = Number.POSITIVE_INFINITY;

        if (isValid(date)) {
          groupName = format(date, 'M月d日(E)', { locale: ja });
          if (isToday(date)) groupName = '今日';
          if (isYesterday(date)) groupName = '昨日';
          if (isTomorrow(date)) groupName = '明日';
          sortMs = date.getTime();
        }

        if (!acc.groups[groupName]) {
          acc.groups[groupName] = [];
          acc.sortMs[groupName] = sortMs;
        } else {
          // 同一グループで複数試合が来た場合、最小の日時を採用
          acc.sortMs[groupName] = Math.min(acc.sortMs[groupName], sortMs);
        }

        acc.groups[groupName].push(match);
        return acc;
      },
      { groups: {} as Record<string, Match[]>, sortMs: {} as Record<string, number> }
    );

    return Object.entries(reduced.groups)
      .sort(([a], [b]) => (reduced.sortMs[a] ?? Number.POSITIVE_INFINITY) - (reduced.sortMs[b] ?? Number.POSITIVE_INFINITY)) as [string, Match[]][];
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

      await syncPublicMatchIndex(roundId, matchId, { [field]: normalizedValue } as any);
      await setDoc(doc(db, `clubs/${user.uid}`), { statsCacheVersion: increment(1) }, { merge: true });
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

    await syncPublicMatchIndex(currentRound.id, matchRef.id, newMatch as any);
    await setDoc(doc(db, `clubs/${user.uid}`), { statsCacheVersion: increment(1) }, { merge: true });
    toast.success('新しい試合を追加しました。');
  };

  
  if (loading) {
    return <div className="flex justify-center items-center h-screen"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  return (
    <div className="container mx-auto py-10">
      <div className="flex justify-between items-start mb-8">
        <div>
          <h1 className="text-2xl font-bold">{competition?.name}</h1>
          <p className="text-muted-foreground">{competition?.season}</p>
        </div>
        {canEditStandings ? (
          <Link href={`/admin/competitions/${competitionId}/standings`}>
            <Button className="bg-green-600 text-white hover:bg-green-700">順位表を更新・編集</Button>
          </Link>
        ) : null}
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
          {canEditStandings ? (
            <Link href={`/admin/competitions/${competitionId}/standings`}>
              <Button className="w-full bg-green-600 text-white hover:bg-green-700">順位表を更新・編集</Button>
            </Link>
          ) : null}
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
