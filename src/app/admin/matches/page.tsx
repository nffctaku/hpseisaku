"use client";

import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { auth, db } from "@/lib/firebase";
import { collection, query, getDocs, orderBy, where } from "firebase/firestore";
import { format, isToday, isYesterday, isTomorrow, parseISO } from 'date-fns';
import { ja } from 'date-fns/locale';
import { ChevronUp, FilePenLine, Loader2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import Image from 'next/image';
import Link from 'next/link';
import { useMemo } from "react";

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

export default function MatchesPage() {
  const { user } = useAuth();
  const [allMatches, setAllMatches] = useState<EnrichedMatch[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [competitions, setCompetitions] = useState<CompetitionOption[]>([]);
  const [competitionTeamIds, setCompetitionTeamIds] = useState<Map<string, string[]>>(new Map());
  const [selectedSeason, setSelectedSeason] = useState<string>('all');
  const [selectedTeamId, setSelectedTeamId] = useState<string>('all');
  const [selectedCompetitionId, setSelectedCompetitionId] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [initialFocusMatchId, setInitialFocusMatchId] = useState<string | null>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);

  const didInitPreferredTeamRef = useRef(false);
  const bootstrapDoneRef = useRef(false);
  const teamsMapRef = useRef<Map<string, Team>>(new Map());
  const competitionMetaRef = useRef<Map<string, { name: string; season?: string }>>(new Map());
  const activeFetchIdRef = useRef(0);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const bootstrap = async () => {
      setLoading(true);
      try {
        // 1. Fetch teams once
        const teamsMap = new Map<string, Team>();
        const teamsQueryRef = query(collection(db, `clubs/${user.uid}/teams`));
        const teamsSnap = await getDocs(teamsQueryRef);
        teamsSnap.forEach((doc) => teamsMap.set(doc.id, { id: doc.id, ...doc.data() } as Team));
        teamsMapRef.current = teamsMap;

        // 2. Fetch competitions once
        const competitionsQueryRef = query(collection(db, `clubs/${user.uid}/competitions`));
        const competitionsSnap = await getDocs(competitionsQueryRef);

        const competitionMeta = new Map<string, { name: string; season?: string }>();
        competitionsSnap.docs.forEach((d) => {
          const data = d.data() as any;
          competitionMeta.set(d.id, {
            name: (data?.name as string) || d.id,
            season: typeof data?.season === 'string' ? data.season : undefined,
          });
        });
        competitionMetaRef.current = competitionMeta;

        const competitionOptions: CompetitionOption[] = competitionsSnap.docs.map((doc) => ({
          id: doc.id,
          name: (doc.data().name as string) || doc.id,
          season: doc.data().season as string | undefined,
        }));
        competitionOptions.sort((a, b) => a.name.localeCompare(b.name));
        setCompetitions(competitionOptions);

        const compTeams = new Map<string, string[]>();
        competitionsSnap.docs.forEach((d) => {
          const data = d.data() as any;
          const ids = Array.isArray(data?.teams) ? data.teams.filter((x: any) => typeof x === 'string') : [];
          compTeams.set(d.id, ids);
        });
        setCompetitionTeamIds(compTeams);

        // 3. Prepare dropdown teams
        const teamsForDropdown = Array.from(teamsMap.values());
        teamsForDropdown.sort((a, b) => a.name.localeCompare(b.name));
        setTeams(teamsForDropdown);

        // 4. Initialize preferred team only once (do not override user's selection)
        if (!didInitPreferredTeamRef.current) {
          const main = typeof (user as any)?.mainTeamId === 'string' ? String((user as any).mainTeamId).trim() : '';
          if (selectedTeamId === 'all' && main && teamsMap.has(main)) {
            setSelectedTeamId(main);
          }
          didInitPreferredTeamRef.current = true;
        }

        bootstrapDoneRef.current = true;
      } catch (error) {
        console.error("Error fetching data: ", error);
        toast.error("試合データの読み込みに失敗しました。");
      } finally {
        setLoading(false);
      }
    };

    bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    if (!user) return;
    if (!bootstrapDoneRef.current) return;

    const fetchMatches = async () => {
      const fetchId = ++activeFetchIdRef.current;
      setLoading(true);
      try {
        const fetchIndexDocs = async (teamId: string) => {
          const indexRef = collection(db, `clubs/${user.uid}/public_match_index`);
          if (teamId === 'all') {
            return getDocs(query(indexRef, orderBy('matchDate')));
          }
          const [homeSnap, awaySnap] = await Promise.all([
            getDocs(query(indexRef, where('homeTeam', '==', teamId))),
            getDocs(query(indexRef, where('awayTeam', '==', teamId))),
          ]);

          const docsMap = new Map<string, any>();
          for (const d of homeSnap.docs) docsMap.set(d.id, d);
          for (const d of awaySnap.docs) docsMap.set(d.id, d);

          const docs = Array.from(docsMap.values());
          docs.sort((a: any, b: any) => {
            const ad = typeof a?.data === 'function' ? a.data() : (a?._data ?? {});
            const bd = typeof b?.data === 'function' ? b.data() : (b?._data ?? {});
            const am = typeof ad?.matchDate === 'string' ? ad.matchDate : '';
            const bm = typeof bd?.matchDate === 'string' ? bd.matchDate : '';
            return String(am).localeCompare(String(bm));
          });

          return { docs } as any;
        };

        const isIndexEmpty = (snap: any) => {
          if (!snap || !Array.isArray(snap.docs) || snap.docs.length === 0) return true;
          const hasRow = snap.docs.some((d: any) => d?.id && d.id !== '_meta');
          return !hasRow;
        };

        let indexSnap = await fetchIndexDocs(selectedTeamId);
        if (fetchId !== activeFetchIdRef.current) return;

        if (isIndexEmpty(indexSnap)) {
          try {
            const token = await auth.currentUser?.getIdToken();
            if (!token) throw new Error('No auth token');
            const res = await fetch('/api/club/backfill-public-match-index', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
              },
            });
            if (!res.ok) {
              const body = await res.json().catch(() => ({}));
              const msg = typeof body?.message === 'string' ? body.message : `Failed (${res.status})`;
              const detail = typeof body?.detail === 'string' ? ` / ${body.detail}` : '';
              throw new Error(`${msg}${detail}`);
            }

            const okBody = await res.json().catch(() => ({} as any));
            const count = typeof okBody?.count === 'number' ? okBody.count : null;
            if (count != null) {
              toast.success(`試合インデックスを生成しました（${count}件）`);
            } else {
              toast.success('試合インデックスを生成しました');
            }

            indexSnap = await fetchIndexDocs(selectedTeamId);
            if (fetchId !== activeFetchIdRef.current) return;
          } catch (e) {
            const msg = e instanceof Error ? e.message : 'unknown error';
            console.warn('Failed to backfill public_match_index:', e);
            toast.error(`試合インデックス生成に失敗: ${msg}`);
          }
        }

        const teamsMap = teamsMapRef.current;
        const competitionMeta = competitionMetaRef.current;

        const enrichedMatches: EnrichedMatch[] = indexSnap.docs
          .map((d: any) => d.data() as any)
          .map((row: MatchIndexRow): EnrichedMatch | null => {
            const compId = typeof row.competitionId === 'string' ? row.competitionId : '';
            const meta = competitionMeta.get(compId);
            const homeTeamId = typeof row.homeTeam === 'string' ? row.homeTeam : '';
            const awayTeamId = typeof row.awayTeam === 'string' ? row.awayTeam : '';
            const matchId = typeof row.matchId === 'string' ? row.matchId : '';
            const roundId = typeof row.roundId === 'string' ? row.roundId : '';
            const matchDate = typeof row.matchDate === 'string' ? row.matchDate : '';
            if (!matchId || !compId || !roundId || !matchDate) return null;

            const homeTeamInfo = homeTeamId ? teamsMap.get(homeTeamId) : undefined;
            const awayTeamInfo = awayTeamId ? teamsMap.get(awayTeamId) : undefined;

            return {
              id: matchId,
              competitionId: compId,
              competitionName: meta?.name || row.competitionName || compId,
              competitionSeason: meta?.season,
              roundId,
              roundName: row.roundName || '',
              matchDate,
              matchTime: typeof row.matchTime === 'string' ? row.matchTime : undefined,
              homeTeamId,
              awayTeamId,
              homeTeamName: homeTeamInfo?.name || row.homeTeamName || '不明なチーム',
              awayTeamName: awayTeamInfo?.name || row.awayTeamName || '不明なチーム',
              homeTeamLogo: homeTeamInfo?.logoUrl || row.homeTeamLogo,
              awayTeamLogo: awayTeamInfo?.logoUrl || row.awayTeamLogo,
              scoreHome: typeof row.scoreHome === 'number' ? row.scoreHome : (row.scoreHome ?? null),
              scoreAway: typeof row.scoreAway === 'number' ? row.scoreAway : (row.scoreAway ?? null),
            };
          })
          .filter(Boolean) as EnrichedMatch[];

        setAllMatches(enrichedMatches);

        const hasMissingScore = (m: EnrichedMatch) => m.scoreHome == null || m.scoreAway == null;
        const isOwnMatch = (m: EnrichedMatch) => m.homeTeamId === user.uid || m.awayTeamId === user.uid;
        const ownMissing = enrichedMatches.find((m) => isOwnMatch(m) && hasMissingScore(m));
        const anyMissing = enrichedMatches.find((m) => hasMissingScore(m));

        let focusId: string | null = null;
        if (ownMissing) {
          focusId = ownMissing.id;
        } else if (anyMissing) {
          focusId = anyMissing.id;
        } else {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const upcomingMatch = enrichedMatches.find((m) => new Date(m.matchDate) >= today);
          if (upcomingMatch) focusId = upcomingMatch.id;
        }

        setInitialFocusMatchId(focusId);
      } catch (error) {
        console.error("Error fetching matches: ", error);
        toast.error("試合データの読み込みに失敗しました。");
      } finally {
        if (fetchId === activeFetchIdRef.current) {
          setLoading(false);
        }
      }
    };

    fetchMatches();
  }, [user, selectedTeamId]);

  useEffect(() => {
    if (initialFocusMatchId) {
      const element = document.getElementById(initialFocusMatchId);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [initialFocusMatchId]);

  useEffect(() => {
    const onScroll = () => {
      setShowScrollTop(window.scrollY > 400);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

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

  const visibleTeams = useMemo(() => {
    if (selectedCompetitionId === 'all') return teams;
    const ids = competitionTeamIds.get(selectedCompetitionId) || [];
    const idSet = new Set(ids);
    return teams.filter((t) => idSet.has(t.id));
  }, [teams, competitionTeamIds, selectedCompetitionId]);

  useEffect(() => {
    if (selectedCompetitionId === 'all') return;
    const isVisible = visibleCompetitions.some((c) => c.id === selectedCompetitionId);
    if (!isVisible) {
      setSelectedCompetitionId('all');
    }
  }, [selectedSeason, selectedCompetitionId, visibleCompetitions]);

  useEffect(() => {
    if (selectedTeamId === 'all') return;
    const isVisible = visibleTeams.some((t) => t.id === selectedTeamId);
    if (!isVisible) {
      setSelectedTeamId('all');
    }
  }, [selectedTeamId, visibleTeams]);

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
                {visibleTeams.map(team => (
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
                        <div className="grid grid-cols-[1fr_72px_1fr] items-center gap-2 w-full">
                          <div className="flex items-center gap-2 min-w-0 justify-end">
                            <span className="font-medium text-sm truncate text-right">{match.homeTeamName}</span>
                            {match.homeTeamLogo ? (
                              <Image src={match.homeTeamLogo} alt={match.homeTeamName} width={22} height={22} className="rounded-full object-contain" />
                            ) : (
                              <div className="w-[22px] h-[22px] bg-muted rounded-full" />
                            )}
                          </div>
                          <div className="flex items-center justify-center">
                            {isFinished ? (
                              <div className={`w-[72px] px-2 py-1 rounded-md font-bold text-white text-sm text-center ${resultColor}`}>
                                {match.scoreHome} - {match.scoreAway}
                              </div>
                            ) : (
                              <div className="w-[72px] text-xs text-muted-foreground text-center">
                                {match.matchTime || 'VS'}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-2 min-w-0">
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

      {showScrollTop ? (
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="fixed bottom-6 right-5 z-50 inline-flex h-9 w-9 items-center justify-center rounded-full border bg-white text-gray-900 shadow-md hover:bg-gray-50"
          aria-label="一番上へ戻る"
        >
          <ChevronUp className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}
