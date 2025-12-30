"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import { collection, query, getDocs } from "firebase/firestore";
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

interface CompetitionOption {
  id: string;
  name: string;
  season?: string;
}

interface EnrichedMatch {
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

export default function MatchesPage() {
  const { user } = useAuth();
  const [allMatches, setAllMatches] = useState<EnrichedMatch[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [competitions, setCompetitions] = useState<CompetitionOption[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<string>('all');
  const [selectedTeamId, setSelectedTeamId] = useState<string>('all');
  const [selectedCompetitionId, setSelectedCompetitionId] = useState<string>('all');
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
        const teamsQueryRef = query(collection(db, `clubs/${user.uid}/teams`));
        const teamsSnap = await getDocs(teamsQueryRef);
        teamsSnap.forEach(doc => teamsMap.set(doc.id, { id: doc.id, ...doc.data() } as Team));

        // 2. Fetch all competitions, rounds, and matches
        const enrichedMatches: EnrichedMatch[] = [];
        const competitionsQueryRef = query(collection(db, `clubs/${user.uid}/competitions`));
        const competitionsSnap = await getDocs(competitionsQueryRef);

        const competitionOptions: CompetitionOption[] = competitionsSnap.docs.map(doc => ({
          id: doc.id,
          name: (doc.data().name as string) || doc.id,
          season: doc.data().season as string | undefined,
        }));
        competitionOptions.sort((a, b) => a.name.localeCompare(b.name));
        setCompetitions(competitionOptions);

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
                competitionSeason: competitionData.season,
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
    (selectedSeason === 'all' || match.competitionSeason === selectedSeason) &&
    (selectedTeamId === 'all' || match.homeTeamId === selectedTeamId || match.awayTeamId === selectedTeamId) &&
    (selectedCompetitionId === 'all' || match.competitionId === selectedCompetitionId)
  );

  const seasons = ['all', ...Array.from(new Set(competitions.map((c) => c.season).filter((s): s is string => typeof s === 'string' && s.length > 0)))].sort((a, b) => {
    if (a === 'all') return 1;
    if (b === 'all') return -1;
    return String(b).localeCompare(String(a));
  });

  const visibleCompetitions = selectedSeason === 'all'
    ? competitions
    : competitions.filter((c) => c.season === selectedSeason);

  useEffect(() => {
    if (selectedCompetitionId === 'all') return;
    const isVisible = visibleCompetitions.some((c) => c.id === selectedCompetitionId);
    if (!isVisible) {
      setSelectedCompetitionId('all');
    }
  }, [selectedSeason, selectedCompetitionId, visibleCompetitions]);

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
    <div className="w-full mx-auto py-8 sm:py-10 px-4 md:px-0">
      <div className="mb-6 sm:mb-8 space-y-4 sm:space-y-0 sm:flex sm:items-end sm:justify-between">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">試合管理</h1>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4 w-full sm:w-auto">
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 flex-1">
            <Select value={selectedSeason} onValueChange={setSelectedSeason}>
              <SelectTrigger className="w-full sm:w-[220px] bg-white text-gray-900">
                <SelectValue placeholder="すべてのシーズン" />
              </SelectTrigger>
              <SelectContent>
                {seasons.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s === 'all' ? 'すべてのシーズン' : s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedCompetitionId} onValueChange={setSelectedCompetitionId}>
              <SelectTrigger className="w-full sm:w-[220px] bg-white text-gray-900">
                <SelectValue placeholder="すべての大会" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">すべての大会</SelectItem>
                {visibleCompetitions.map(comp => (
                  <SelectItem key={comp.id} value={comp.id}>
                    {comp.season ? `${comp.name} (${comp.season})` : comp.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedTeamId} onValueChange={setSelectedTeamId}>
              <SelectTrigger className="w-full sm:w-[220px] bg-white text-gray-900">
                <SelectValue placeholder="すべてのチーム" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">すべてのチーム</SelectItem>
                {teams.map(team => (
                  <SelectItem key={team.id} value={team.id}>
                    <div className="flex items-center gap-2">
                      {team.logoUrl && (
                        <Image
                          src={team.logoUrl}
                          alt={team.name}
                          width={20}
                          height={20}
                          className="rounded-full object-contain"
                        />
                      )}
                      <span>{team.name}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Link
            href="/admin/competitions"
            className="bg-emerald-600 text-white hover:bg-emerald-700 px-4 py-2 rounded-md whitespace-nowrap text-center text-sm"
          >
            大会管理へ
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
                  const resultColor = 'bg-gray-500';

                  return (
                    <div
                      id={match.id}
                      key={match.id}
                      className="flex items-center p-3 sm:p-4 bg-card rounded-lg"
                    >
                      <div className="flex flex-col flex-grow gap-1">
                        <div className="flex items-center justify-between gap-2 w-full">
                          <div className="flex items-center gap-2 min-w-0 flex-1 justify-end">
                            <span className="font-medium text-sm truncate text-right">{match.homeTeamName}</span>
                            {match.homeTeamLogo ? (
                              <Image src={match.homeTeamLogo} alt={match.homeTeamName} width={22} height={22} className="rounded-full object-contain" />
                            ) : (
                              <div className="w-[22px] h-[22px] bg-muted rounded-full" />
                            )}
                          </div>
                          {isFinished ? (
                            <div className={`inline-block min-w-[60px] px-2 py-1 rounded-md font-bold text-white text-sm text-center ${resultColor}`}>
                              {match.scoreHome} - {match.scoreAway}
                            </div>
                          ) : (
                            <div className="text-xs text-muted-foreground text-center min-w-[60px]">
                              {match.matchTime || 'VS'}
                            </div>
                          )}
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            {match.awayTeamLogo ? (
                              <Image src={match.awayTeamLogo} alt={match.awayTeamName} width={22} height={22} className="rounded-full object-contain" />
                            ) : (
                              <div className="w-[22px] h-[22px] bg-muted rounded-full" />
                            )}
                            <span className="font-medium text-sm truncate">{match.awayTeamName}</span>
                          </div>
                        </div>

                        <div className="text-[11px] text-muted-foreground text-center mt-1">
                          {match.competitionName} / {match.roundName}
                        </div>
                      </div>
                      <Link
                        href={`/admin/competitions/${match.competitionId}/rounds/${match.roundId}/matches/${match.id}`}
                        className="ml-1 px-1 py-1 text-muted-foreground hover:text-primary transition-colors flex items-center justify-center"
                      >
                        <FilePenLine className="h-4 w-4" />
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
