"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import { collection, query, getDocs, collectionGroup, doc, getDoc } from "firebase/firestore";
import { format, isToday, isYesterday, isTomorrow, parseISO } from 'date-fns';
import { ja } from 'date-fns/locale';
import { Loader2, FilePenLine } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import Image from 'next/image';
import Link from 'next/link';

// Define structures
interface Team {
  id: string;
  name: string;
  logoUrl?: string;
}

interface EnrichedMatch {
  id: string;
  competitionId: string;
  competitionName: string;
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

export default function MatchesPage() {
  const { user } = useAuth();
  const [allMatches, setAllMatches] = useState<EnrichedMatch[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [upcomingMatchId, setUpcomingMatchId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);

    const fetchData = async () => {
      try {
        // 1. Fetch all teams into a single map
        const teamsMap = new Map<string, Team>();
        const teamsQuery = query(collection(db, `clubs/${user.uid}/teams`));
        const teamsSnap = await getDocs(teamsQuery);
        teamsSnap.forEach(doc => teamsMap.set(doc.id, { id: doc.id, ...doc.data() } as Team));

        // 2. Fetch all competitions, rounds, and matches
        const enrichedMatches: EnrichedMatch[] = [];
        const competitionsQuery = query(collection(db, `clubs/${user.uid}/competitions`));
        const competitionsSnap = await getDocs(competitionsQuery);

        for (const compDoc of competitionsSnap.docs) {
          const competitionData = compDoc.data();
          const roundsQuery = query(collection(db, `clubs/${user.uid}/competitions/${compDoc.id}/rounds`));
          const roundsSnap = await getDocs(roundsQuery);

          for (const roundDoc of roundsSnap.docs) {
            const roundData = roundDoc.data();
            const matchesQuery = query(collection(db, `clubs/${user.uid}/competitions/${compDoc.id}/rounds/${roundDoc.id}/matches`));
            const matchesSnap = await getDocs(matchesQuery);

            for (const matchDoc of matchesSnap.docs) {
              const matchData = matchDoc.data();
              const homeTeam = teamsMap.get(matchData.homeTeam);
              const awayTeam = teamsMap.get(matchData.awayTeam);

              enrichedMatches.push({
                id: matchDoc.id,
                competitionId: compDoc.id,
                competitionName: competitionData.name,
                roundId: roundDoc.id,
                roundName: roundData.name,
                matchDate: matchData.matchDate,
                matchTime: matchData.matchTime,
                homeTeamId: matchData.homeTeam,
                awayTeamId: matchData.awayTeam,
                homeTeamName: homeTeam?.name || '不明なチーム',
                awayTeamName: awayTeam?.name || '不明なチーム',
                homeTeamLogo: homeTeam?.logoUrl,
                awayTeamLogo: awayTeam?.logoUrl,
                scoreHome: matchData.scoreHome,
                scoreAway: matchData.scoreAway,
              });
            }
          }
        }

        // 3. Sort all matches by date and update state
        enrichedMatches.sort((a, b) => new Date(a.matchDate).getTime() - new Date(b.matchDate).getTime());
        setAllMatches(enrichedMatches);

        // Find the first upcoming match
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Set to start of today
        const upcomingMatch = enrichedMatches.find(match => new Date(match.matchDate) >= today);
        if (upcomingMatch) {
          setUpcomingMatchId(upcomingMatch.id);
        }

        // 4. Create a sorted list of teams for the dropdown
        const teamsForDropdown = Array.from(teamsMap.values());
        teamsForDropdown.sort((a, b) => a.name.localeCompare(b.name));
        setTeams(teamsForDropdown);

      } catch (error) {
        console.error("Error fetching data: ", error);
        toast.error("試合データの読み込みに失敗しました。");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user]);

  useEffect(() => {
    if (upcomingMatchId) {
      const element = document.getElementById(upcomingMatchId);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [upcomingMatchId]);

  const getFormattedDateGroup = (dateString: string) => {
      const date = parseISO(dateString);
      if (isToday(date)) return '今日';
      if (isYesterday(date)) return '昨日';
      if (isTomorrow(date)) return '明日';
      return format(date, 'M月d日(E)', { locale: ja });
  };

  const filteredMatches = allMatches.filter(match => 
    selectedTeamId === 'all' || match.homeTeamId === selectedTeamId || match.awayTeamId === selectedTeamId
  );

  const groupedMatches = filteredMatches.reduce((acc, match) => {
    const dateGroup = getFormattedDateGroup(match.matchDate);
    if (!acc[dateGroup]) {
      acc[dateGroup] = [];
    }
    acc[dateGroup].push(match);
    return acc;
  }, {} as Record<string, EnrichedMatch[]>);


  if (loading) {
    return <div className="container mx-auto py-10 flex justify-center items-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  return (
    <div className="container mx-auto py-10 px-4 md:px-0">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">試合日程・結果</h1>
        <div className="flex items-center gap-4">
          <Select value={selectedTeamId} onValueChange={setSelectedTeamId}>
            <SelectTrigger className="w-[280px]">
              <SelectValue placeholder="チームを選択" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">すべてのチーム</SelectItem>
              {teams.map(team => (
                <SelectItem key={team.id} value={team.id}>
                  <div className="flex items-center gap-2">
                    {team.logoUrl && <Image src={team.logoUrl} alt={team.name} width={20} height={20} className="rounded-full object-contain" />}
                    <span>{team.name}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Link href="/admin/matches/new" className="bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 rounded-md whitespace-nowrap">
            新しい試合を追加
          </Link>
        </div>
      </div>
      {Object.keys(groupedMatches).length === 0 ? (
        <div className="text-center py-10 text-muted-foreground">表示する試合がありません。</div>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedMatches).map(([dateGroup, matchesInGroup]) => (
            <div key={dateGroup}>
              <h2 className="font-semibold text-lg mb-3 text-muted-foreground">{dateGroup}</h2>
              <div className="space-y-3">
                {matchesInGroup.map(match => {
                  const isFinished = typeof match.scoreHome === 'number' && typeof match.scoreAway === 'number';
                  const isHomeGame = match.homeTeamId === user?.uid;
                  const resultColor = 'bg-gray-500';

                  return (
                    <div id={match.id} key={match.id} className="flex items-center p-4 bg-card rounded-lg border">
                      <div className="grid grid-cols-12 items-center gap-2 flex-grow">
                        <div className="col-span-12 md:col-span-5 flex items-center justify-end gap-2">
                          <span className="font-medium text-right flex-1 truncate">{match.homeTeamName}</span>
                          {match.homeTeamLogo ? (
                            <Image src={match.homeTeamLogo} alt={match.homeTeamName} width={28} height={28} className="rounded-full object-contain" />
                          ) : (
                            <div className="w-7 h-7 bg-muted rounded-full" />
                          )}
                        </div>

                        <div className="col-span-12 md:col-span-2 text-center">
                          {isFinished ? (
                            <div className={`px-2 py-1 rounded-md font-bold text-white text-lg ${resultColor}`}>
                              {match.scoreHome} - {match.scoreAway}
                            </div>
                          ) : (
                            <div className="text-sm text-muted-foreground">{match.matchTime || 'VS'}</div>
                          )}
                        </div>

                        <div className="col-span-12 md:col-span-5 flex items-center gap-2">
                          {match.awayTeamLogo ? (
                            <Image src={match.awayTeamLogo} alt={match.awayTeamName} width={28} height={28} className="rounded-full object-contain" />
                          ) : (
                            <div className="w-7 h-7 bg-muted rounded-full" />
                          )}
                          <span className="font-medium flex-1 truncate">{match.awayTeamName}</span>
                        </div>
                        <div className="col-span-12 text-xs text-muted-foreground text-center mt-2">
                          {match.competitionName} / {match.roundName}
                        </div>
                      </div>
                      <Link href={`/admin/competitions/${match.competitionId}/rounds/${match.roundId}/matches/${match.id}`} className="ml-4 p-2 text-muted-foreground hover:text-primary transition-colors">
                        <FilePenLine className="h-5 w-5" />
                      </Link>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
