"use client";

import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useClub } from '@/contexts/ClubContext';
import { db } from '@/lib/firebase';
import { doc, getDoc, collection, query, where, getDocs, onSnapshot } from 'firebase/firestore';
import { Loader2 } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { MatchDetails, Player } from '@/types/match';
import { toDashSeason, toSlashSeason } from '@/lib/season';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MatchTeamStatsForm } from '@/components/match-team-stats-form';
import { SquadRegistrationForm } from '@/components/squad-registration-form';
import { MatchEventsPreview } from '@/components/match-events-preview';
import { formatMinute } from '@/lib/formatMinute';

export default function MatchAdminPage() {
  const { user, ownerUid: ownerUidFromContext } = useAuth();
  const { mainTeamId } = useClub();
  const params = useParams();
  const searchParams = useSearchParams();
  const { competitionId, roundId, matchId } = params;

  const ownerUid = ownerUidFromContext || user?.uid;
  const myTeamId = mainTeamId;

  const [match, setMatch] = useState<MatchDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [homePlayers, setHomePlayers] = useState<Player[]>([]);
  const [awayPlayers, setAwayPlayers] = useState<Player[]>([]);
  const [resolvedMatchDocPath, setResolvedMatchDocPath] = useState<string | null>(null);
  const [seasonId, setSeasonId] = useState<string | null>(null);
  const [debugPanel, setDebugPanel] = useState<any>(null);
  const [competitionName, setCompetitionName] = useState<string>('');
  const [roundName, setRoundName] = useState<string>('');
  const [roundMatches, setRoundMatches] = useState<any[]>([]);

  const debugEnabled =
    searchParams?.get('debug') === '1' ||
    searchParams?.get('debug') === 'true' ||
    searchParams?.get('debug') === 'yes';

  useEffect(() => {
    if (!user || !ownerUid || typeof competitionId !== 'string' || typeof roundId !== 'string') return;
    let cancelled = false;
    const fetchSeason = async () => {
      try {
        const [roundSnap, compSnap] = await Promise.all([
          getDoc(doc(db, `clubs/${ownerUid}/competitions/${competitionId}/rounds/${roundId}`)),
          getDoc(doc(db, `clubs/${ownerUid}/competitions/${competitionId}`)),
        ]);
        if (cancelled) return;
        const roundSeasonRaw = roundSnap.exists() ? (roundSnap.data() as any)?.season : undefined;
        const compSeasonRaw = compSnap.exists() ? (compSnap.data() as any)?.season : undefined;
        const roundSeason = typeof roundSeasonRaw === 'string' ? roundSeasonRaw.trim() : '';
        const compSeason = typeof compSeasonRaw === 'string' ? compSeasonRaw.trim() : '';
        const s = roundSeason || compSeason;
        setSeasonId(s ? s : null);
        
        // Set competition name and round name
        if (compSnap.exists()) {
          setCompetitionName((compSnap.data() as any)?.name || '');
        }
        if (roundSnap.exists()) {
          setRoundName((roundSnap.data() as any)?.name || '');
        }
      } catch {
        if (cancelled) return;
        setSeasonId(null);
      }
    };
    fetchSeason();
    return () => {
      cancelled = true;
    };
  }, [user, ownerUid, competitionId, roundId]);

  useEffect(() => {
    console.log('Competition matches useEffect called:', { user, ownerUid, competitionId, roundId, matchId, myTeamId });
    if (!user || !ownerUid || typeof competitionId !== 'string' || typeof roundId !== 'string' || typeof matchId !== 'string' || !myTeamId) {
      console.log('Early return from useEffect: missing required values', { myTeamId });
      return;
    }
    let cancelled = false;
    const fetchCompetitionMatches = async () => {
      try {
        console.log('Fetching all rounds in competition...');
        // Fetch all rounds in the competition
        const roundsRef = collection(db, `clubs/${ownerUid}/competitions/${competitionId}/rounds`);
        const roundsSnap = await getDocs(roundsRef);
        if (cancelled) return;
        
        console.log(`Found ${roundsSnap.docs.length} rounds`);
        const allMatches: any[] = [];
        
        // Fetch matches from each round
        for (const roundDoc of roundsSnap.docs) {
          const roundId = roundDoc.id;
          const matchesRef = collection(db, `clubs/${ownerUid}/competitions/${competitionId}/rounds/${roundId}/matches`);
          const matchesSnap = await getDocs(matchesRef);
          const matches = matchesSnap.docs.map(doc => ({ id: doc.id, roundId, ...doc.data() }));
          allMatches.push(...matches);
        }
        
        console.log(`Total matches fetched: ${allMatches.length}`);
        
        // Filter to only include matches where my team is playing
        const myTeamMatches = allMatches.filter((m: any) => 
          m.homeTeam === myTeamId || m.awayTeam === myTeamId
        );
        
        console.log('Team filter debug:', { myTeamId, totalMatches: allMatches.length, filteredMatches: myTeamMatches.length });
        console.log('Filtered matches:', myTeamMatches.map(m => ({ id: m.id, homeTeam: m.homeTeam, awayTeam: m.awayTeam, roundId: m.roundId })));
        
        // Sort by matchDate ascending
        myTeamMatches.sort((a: any, b: any) => {
          const dateA = new Date(a.matchDate || 0).getTime();
          const dateB = new Date(b.matchDate || 0).getTime();
          return dateA - dateB;
        });
        
        setRoundMatches(myTeamMatches);
      } catch (error) {
        console.error('Error fetching competition matches:', error);
      }
    };
    fetchCompetitionMatches();
    return () => {
      cancelled = true;
    };
  }, [user, ownerUid, competitionId, roundId, matchId, myTeamId]);

  useEffect(() => {
    if (!user || !ownerUid || typeof matchId !== 'string' || typeof competitionId !== 'string' || typeof roundId !== 'string') {
      setLoading(false);
      return;
    }

    // competition season is needed to filter players by roster
    if (seasonId === null) {
      return;
    }

    let unsubscribe: null | (() => void) = null;
    let cancelled = false;

    setLoading(true);

    const start = async () => {
      try {
        const matchDocRef = doc(db, `clubs/${ownerUid}/competitions/${competitionId}/rounds/${roundId}/matches/${matchId}`);
        const primarySnap = await getDoc(matchDocRef);

        // Fallback: if not found under competitions/rounds, try legacy top-level matches collection
        const resolvedRef = primarySnap.exists() ? matchDocRef : doc(db, `clubs/${ownerUid}/matches`, matchId as string);
        const resolvedSnap = primarySnap.exists() ? primarySnap : await getDoc(resolvedRef);
        if (!resolvedSnap.exists()) {
          console.error("Match document not found in either competitions/rounds or legacy matches collection");
          setMatch(null);
          setResolvedMatchDocPath(null);
          setLoading(false);
          return;
        }

        setResolvedMatchDocPath(resolvedRef.path);

        // To ensure team names and logos are present, fetch them if not already on the match doc
        const fetchTeamData = async (teamId: string) => {
          if (!teamId) return null;
          const teamDocRef = doc(db, `clubs/${ownerUid}/teams`, teamId);
          const teamDoc = await getDoc(teamDocRef);
          return teamDoc.exists() ? { name: teamDoc.data().name, logoUrl: teamDoc.data().logoUrl } : null;
        };

        const fetchPlayers = async (teamId: string): Promise<Player[]> => {
          if (!teamId || !user || !ownerUid) return [];
          const primaryRef = collection(db, `clubs/${ownerUid}/teams/${teamId}/players`);
          const primarySnap = await getDocs(primaryRef);
          if (!primarySnap.empty) {
            console.warn('[MatchAdminPage] fetchPlayers primary hit', {
              ownerUid,
              teamId,
              count: primarySnap.size,
              path: `clubs/${ownerUid}/teams/${teamId}/players`,
            });
            return primarySnap.docs.map((d) => ({ id: d.id, ...d.data() } as Player));
          }

          const legacyUid = user.uid;
          if (!legacyUid || legacyUid === ownerUid) return [];
          const fallbackRef = collection(db, `clubs/${legacyUid}/teams/${teamId}/players`);
          const fallbackSnap = await getDocs(fallbackRef);
          console.warn('[MatchAdminPage] fetchPlayers fallback result', {
            ownerUid,
            legacyUid,
            teamId,
            count: fallbackSnap.size,
            path: `clubs/${legacyUid}/teams/${teamId}/players`,
          });
          return fallbackSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Player));
        };

        const filterTeamPlayersBySeason = (players: Player[], rawSeason: string | null): Player[] => {
          // Disable season filtering to ensure all players are loaded
          return players || [];
        };

        const fetchRosterPlayersForTeam = async (
          teamId: string,
          teamPlayers: Player[],
          effectiveSeason: string | null
        ): Promise<{ players: Player[]; debug: any }> => {
          if (!ownerUid) return { players: [], debug: { reason: 'noOwnerUid' } };
          const rawSeason = typeof effectiveSeason === 'string' ? effectiveSeason.trim() : '';
          if (!rawSeason) return { players: [], debug: { reason: 'noSeason' } };
          const seasonDash = toDashSeason(rawSeason);
          if (!seasonDash) return { players: [], debug: { reason: 'badSeason', rawSeason } };
          const seasonSlash = toSlashSeason(rawSeason);
          const seasonKeyCandidates = Array.from(
            new Set(
              [rawSeason, seasonDash, seasonSlash].filter(
                (v): v is string => typeof v === 'string' && v.trim().length > 0
              )
            )
          );
          try {
            const rosterSnap = await getDocs(collection(db, `clubs/${ownerUid}/seasons/${seasonDash}/roster`));
            if (rosterSnap.empty) {
              return {
                players: [],
                debug: {
                  teamId,
                  seasonId: rawSeason,
                  seasonDash,
                  rosterCount: 0,
                  teamPlayersCount: teamPlayers.length,
                  allowedCount: 0,
                  skipped: { notThisTeam: 0, noSeasonMembership: 0, missingFromTeam: 0 },
                  examples: { notThisTeam: [], noSeasonMembership: [], missingFromTeam: [] },
                },
              };
            }
            const teamPlayerIdSet = new Set(teamPlayers.map((p) => p.id));
            const teamPlayersById = new Map<string, Player>();
            for (const p of teamPlayers) {
              if (!p || !p.id) continue;
              teamPlayersById.set(p.id, p);
            }

            const debugMeta = {
              teamId,
              seasonId: rawSeason,
              seasonDash,
              rosterCount: rosterSnap.size,
              teamPlayersCount: teamPlayers.length,
            };

            const allowedRosterIds: string[] = [];
            const skipped = {
              notThisTeam: 0,
              noSeasonMembership: 0,
              missingFromTeam: 0,
            };
            const examples = {
              notThisTeam: [] as string[],
              noSeasonMembership: [] as string[],
              missingFromTeam: [] as string[],
            };
            rosterSnap.docs.forEach((d) => {
              const data = d.data() as any;
              const tid = typeof data?.teamId === 'string' ? data.teamId.trim() : '';

              const sd = (data?.seasonData && typeof data.seasonData === 'object' ? data.seasonData : null) as any;
              const hasSeasonData = Boolean(sd && typeof sd === 'object' && Object.keys(sd).length > 0);
              const seasonsArr = Array.isArray(data?.seasons) ? (data.seasons as any[]) : null;
              const hasSeasonsArr = Boolean(seasonsArr && seasonsArr.length > 0);

              // Relaxed season membership check - include if:
              // 1. Has explicit season membership (strict check), OR
              // 2. Has no season data (legacy roster in season-scoped collection)
              const hasExplicitSeasonMembership = (() => {
                if (hasSeasonData) {
                  return seasonKeyCandidates.some((k) => sd && typeof sd === 'object' && k in sd);
                }
                if (hasSeasonsArr) {
                  return seasonKeyCandidates.some((k) => (seasonsArr as any[]).includes(k));
                }
                // Legacy roster docs may not have seasonData/seasons.
                // Since they live under season-scoped roster collection, treat them as belonging to this season.
                return true;
              })();

              const isForThisTeam = tid
                ? tid === teamId
                : teamPlayerIdSet.has(d.id); // legacy roster without teamId

              if (!isForThisTeam) {
                skipped.notThisTeam += 1;
                if (examples.notThisTeam.length < 5) examples.notThisTeam.push(d.id);
                return;
              }

              // Relax season membership check - always include if team matches
              // This fixes the issue where registered players don't show up
              if (!hasExplicitSeasonMembership) {
                // Include players without season data (legacy roster)
                // Only skip if they have seasons data but none match
                if (hasSeasonsArr) {
                  skipped.noSeasonMembership += 1;
                  if (examples.noSeasonMembership.length < 5) examples.noSeasonMembership.push(d.id);
                  return;
                }
              }

              if (!teamPlayersById.has(d.id)) {
                skipped.missingFromTeam += 1;
                if (examples.missingFromTeam.length < 5) examples.missingFromTeam.push(d.id);
                return;
              }

              allowedRosterIds.push(d.id);
            });

            if (allowedRosterIds.length !== rosterSnap.size) {
              const missingTeamId = rosterSnap.docs
                .filter((d) => {
                  const data = d.data() as any;
                  const tid = typeof data?.teamId === 'string' ? data.teamId.trim() : '';
                  return !tid;
                })
                .slice(0, 5)
                .map((d) => d.id);

              const mismatchedTeamId = rosterSnap.docs
                .filter((d) => {
                  const data = d.data() as any;
                  const tid = typeof data?.teamId === 'string' ? data.teamId.trim() : '';
                  return tid && tid !== teamId;
                })
                .slice(0, 5)
                .map((d) => ({ id: d.id, teamId: String((d.data() as any)?.teamId || '') }));

              console.warn('[MatchAdminPage] roster filter debug', {
                ...debugMeta,
                allowedCount: allowedRosterIds.length,
                exampleMissingTeamIdPlayerIds: missingTeamId,
                exampleMismatchedTeamId: mismatchedTeamId,
              });
            }

            const allowedSet = new Set(allowedRosterIds);
            const byId = new Map<string, Player>();

            // Build only from allowed roster members (prevents cross-season players from leaking in)
            rosterSnap.docs.forEach((d) => {
              if (!allowedSet.has(d.id)) return;
              const data = d.data() as any;
              const tid = typeof data?.teamId === 'string' ? data.teamId.trim() : '';

              const fromTeam = teamPlayersById.get(d.id);
              if (fromTeam) {
                byId.set(d.id, { ...fromTeam, teamId: fromTeam.teamId ?? tid ?? teamId } as Player);
                return;
              }
              return;
            });

            const out = Array.from(byId.values());
            out.sort((a, b) => {
              const na = typeof a?.number === 'number' && Number.isFinite(a.number) ? a.number : 9999;
              const nb = typeof b?.number === 'number' && Number.isFinite(b.number) ? b.number : 9999;
              if (na !== nb) return na - nb;
              const an = typeof a?.name === 'string' ? a.name : '';
              const bn = typeof b?.name === 'string' ? b.name : '';
              return an.localeCompare(bn, 'ja');
            });
            return {
              players: out,
              debug: {
                teamId,
                seasonId: rawSeason,
                seasonDash,
                rosterCount: rosterSnap.size,
                teamPlayersCount: teamPlayers.length,
                allowedCount: allowedRosterIds.length,
                skipped,
                examples,
              },
            };
          } catch {
            return { players: [], debug: { reason: 'error' } };
          }
        };

        unsubscribe = onSnapshot(
          resolvedRef,
          async (snap) => {
            if (cancelled) return;
            if (!snap.exists()) {
              setMatch(null);
              setLoading(false);
              return;
            }

            const raw = snap.data() as any;
            let matchData = { id: snap.id, ...raw } as MatchDetails;

            const matchSeasonRaw = (matchData as any)?.season;
            const matchSeason = typeof matchSeasonRaw === 'string' ? matchSeasonRaw.trim() : '';
            const effectiveSeasonId = matchSeason || seasonId;

            console.warn('[MatchAdminPage] match team ids', {
              ownerUid,
              competitionId,
              roundId,
              matchId,
              effectiveSeasonId,
              homeTeam: (matchData as any)?.homeTeam ?? null,
              awayTeam: (matchData as any)?.awayTeam ?? null,
            });

            const [homeTeamData, awayTeamData] = await Promise.all([
              fetchTeamData(matchData.homeTeam),
              fetchTeamData(matchData.awayTeam)
            ]);

            matchData = {
              ...matchData,
              homeTeamName: homeTeamData?.name || matchData.homeTeamName || 'Home Team',
              homeTeamLogo: homeTeamData?.logoUrl || matchData.homeTeamLogo,
              awayTeamName: awayTeamData?.name || matchData.awayTeamName || 'Away Team',
              awayTeamLogo: awayTeamData?.logoUrl || matchData.awayTeamLogo,
            };

            setMatch(matchData);

            if (matchData.homeTeam && matchData.awayTeam) {
              const [home, away] = await Promise.all([
                fetchPlayers(matchData.homeTeam),
                fetchPlayers(matchData.awayTeam),
              ]);

              console.warn('[MatchAdminPage] fetched team players', {
                ownerUid,
                homeTeam: matchData.homeTeam,
                awayTeam: matchData.awayTeam,
                homeCount: home.length,
                awayCount: away.length,
              });

              const [homeRosterPlayers, awayRosterPlayers] = await Promise.all([
                fetchRosterPlayersForTeam(matchData.homeTeam, home, effectiveSeasonId),
                fetchRosterPlayersForTeam(matchData.awayTeam, away, effectiveSeasonId),
              ]);

              console.warn('[MatchAdminPage] roster filtered players', {
                ownerUid,
                seasonId: typeof effectiveSeasonId === 'string' ? effectiveSeasonId : null,
                homeTeam: matchData.homeTeam,
                awayTeam: matchData.awayTeam,
                homeRosterCount: homeRosterPlayers.players.length,
                awayRosterCount: awayRosterPlayers.players.length,
              });

              const homeSeasonPlayers = filterTeamPlayersBySeason(home, effectiveSeasonId);
              const awaySeasonPlayers = filterTeamPlayersBySeason(away, effectiveSeasonId);

              const nextHomePlayers = homeRosterPlayers.players.length > 0 ? homeRosterPlayers.players : homeSeasonPlayers;
              const nextAwayPlayers = awayRosterPlayers.players.length > 0 ? awayRosterPlayers.players : awaySeasonPlayers;

              setHomePlayers(nextHomePlayers);
              setAwayPlayers(nextAwayPlayers);

              if (debugEnabled) {
                setDebugPanel({
                  ownerUid,
                  competitionId,
                  roundId,
                  matchId,
                  effectiveSeasonId,
                  home: {
                    teamId: matchData.homeTeam,
                    teamPlayersCount: home.length,
                    seasonPlayersCount: homeSeasonPlayers.length,
                    rosterPlayersCount: homeRosterPlayers.players.length,
                    rosterDebug: homeRosterPlayers.debug,
                  },
                  away: {
                    teamId: matchData.awayTeam,
                    teamPlayersCount: away.length,
                    seasonPlayersCount: awaySeasonPlayers.length,
                    rosterPlayersCount: awayRosterPlayers.players.length,
                    rosterDebug: awayRosterPlayers.debug,
                  },
                });
              }
            }

            setLoading(false);
          },
          (error) => {
            if (cancelled) return;
            console.error("Error fetching match data: ", error);
            setMatch(null);
            setResolvedMatchDocPath(null);
            setLoading(false);
          }
        );
      } catch (error) {
        if (cancelled) return;
        console.error("Error fetching match data: ", error);
        setMatch(null);
        setResolvedMatchDocPath(null);
        setLoading(false);
      }
    };

    start();

    return () => {
      cancelled = true;
      if (unsubscribe) unsubscribe();
    };
  }, [user, ownerUid, competitionId, roundId, matchId, seasonId]);

  if (loading) {
    return <div className="flex h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  if (!user) {
    return <div className="flex h-screen items-center justify-center">ログインしてください。</div>;
  }

  if (!match) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="bg-white text-gray-900 rounded-lg shadow p-8 text-center space-y-4">
          <p>試合データが見つかりませんでした。</p>
          <p className="text-sm text-gray-500">URLが古いか、試合が削除された可能性があります。</p>
          <Link href={`/admin/competitions/${competitionId}`}>
            <span className="inline-flex items-center px-4 py-2 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700">大会ページに戻る</span>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-4xl py-6 sm:py-10">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex gap-2">
          {(() => {
            const currentIndex = roundMatches.findIndex(m => m.id === matchId);
            const prevMatch = currentIndex > 0 ? roundMatches[currentIndex - 1] : null;
            
            return prevMatch ? (
              <Link
                href={`/admin/competitions/${competitionId}/rounds/${prevMatch.roundId}/matches/${prevMatch.id}`}
                className="inline-flex items-center rounded-md border bg-white px-3 py-2 text-xs text-gray-900 shadow-sm hover:bg-gray-50"
              >
                ← 前の試合
              </Link>
            ) : (
              <span className="inline-flex items-center rounded-md border bg-gray-100 px-3 py-2 text-xs text-gray-400 shadow-sm cursor-not-allowed">
                ← 前の試合
              </span>
            );
          })()}
        </div>
        <Link
          href={(() => {
            const s = typeof seasonId === "string" ? seasonId.trim() : "";
            return s ? `/admin/matches?season=${encodeURIComponent(s)}` : "/admin/matches";
          })()}
          className="inline-flex items-center rounded-md border bg-white px-3 py-2 text-xs text-gray-900 shadow-sm hover:bg-gray-50"
        >
          試合管理へ戻る
        </Link>
        <div className="flex gap-2">
          {(() => {
            const currentIndex = roundMatches.findIndex(m => m.id === matchId);
            const nextMatch = currentIndex < roundMatches.length - 1 ? roundMatches[currentIndex + 1] : null;
            
            return nextMatch ? (
              <Link
                href={`/admin/competitions/${competitionId}/rounds/${nextMatch.roundId}/matches/${nextMatch.id}`}
                className="inline-flex items-center rounded-md border bg-white px-3 py-2 text-xs text-gray-900 shadow-sm hover:bg-gray-50"
              >
                次の試合 →
              </Link>
            ) : (
              <span className="inline-flex items-center rounded-md border bg-gray-100 px-3 py-2 text-xs text-gray-400 shadow-sm cursor-not-allowed">
                次の試合 →
              </span>
            );
          })()}
        </div>
      </div>
      {debugEnabled && debugPanel ? (
        <div className="mb-4 rounded-lg border bg-white p-3 text-xs text-gray-900">
          <div className="font-semibold">DEBUG</div>
          <pre className="mt-2 whitespace-pre-wrap break-words text-[10px] leading-snug text-gray-700">
            {(() => {
              try {
                return JSON.stringify(debugPanel, null, 2);
              } catch {
                return String(debugPanel);
              }
            })()}
          </pre>
        </div>
      ) : null}
      <div className="bg-white border rounded-lg p-6">
        <div className="grid grid-cols-3 items-start gap-6 mb-6">
          <div className="flex flex-col items-center gap-2">
            <div className="h-[72px] w-[72px] flex items-center justify-center flex-shrink-0">
              {match.homeTeamLogo && (
                <Image
                  src={match.homeTeamLogo}
                  alt={match.homeTeamName}
                  width={72}
                  height={72}
                  className="rounded-full object-cover"
                />
              )}
            </div>
            <h2 className="text-sm font-bold text-center leading-tight text-gray-900 whitespace-nowrap">
              {match.homeTeamName}
            </h2>
            <div className="text-xs space-y-1 text-left">
              {(match as any).events && (match as any).events.filter((e: any) => e.teamId === match.homeTeam && (e.type === 'goal' || e.type === 'og')).length > 0 && (
                (match as any).events
                  .filter((e: any) => e.teamId === match.homeTeam && (e.type === 'goal' || e.type === 'og'))
                  .sort((a: any, b: any) => (a.minute ?? 0) - (b.minute ?? 0))
                  .map((event: any) => {
                    const getPlayerName = (playerId: string | undefined, playerName?: string) => {
                      if (!playerId) return "";
                      if (playerName) return playerName;
                      const player = [...homePlayers, ...awayPlayers].find(p => p.id === playerId);
                      return player?.name || "";
                    };
                    const scorer = getPlayerName(event.playerId, event.playerName);
                    return (
                      <div key={event.id} className="text-gray-600">
                        {formatMinute(event.minute)}' {scorer}{event.type === 'og' ? ' (OG)' : ''}
                      </div>
                    );
                  })
              )}
            </div>
          </div>

          <div className="flex flex-col items-center justify-center">
            <p className="text-xs sm:text-sm text-gray-600 text-center whitespace-nowrap">
              {competitionName} - {roundName}
            </p>
            <p className="text-xs sm:text-sm text-gray-600 text-center whitespace-nowrap">
              {new Date(match.matchDate).toLocaleDateString("ja-JP", {
                year: "numeric",
                month: "long",
                day: "numeric",
                weekday: "long",
              })}
            </p>
            <div className="text-4xl sm:text-5xl font-bold text-gray-900 flex items-center justify-center gap-4">
              <span>{typeof match.scoreHome === "number" ? match.scoreHome : "-"}</span>
              <span>-</span>
              <span>{typeof match.scoreAway === "number" ? match.scoreAway : "-"}</span>
            </div>
          </div>

          <div className="flex flex-col items-center gap-2">
            <div className="h-[72px] w-[72px] flex items-center justify-center flex-shrink-0">
              {match.awayTeamLogo && (
                <Image
                  src={match.awayTeamLogo}
                  alt={match.awayTeamName}
                  width={72}
                  height={72}
                  className="rounded-full object-cover"
                />
              )}
            </div>
            <h2 className="text-sm font-bold text-center text-gray-900 whitespace-nowrap">{match.awayTeamName}</h2>
            <div className="text-xs space-y-1 text-left">
                {(match as any).events && (match as any).events.filter((e: any) => e.teamId === match.awayTeam && (e.type === 'goal' || e.type === 'og')).length > 0 && (
                  (match as any).events
                    .filter((e: any) => e.teamId === match.awayTeam && (e.type === 'goal' || e.type === 'og'))
                    .sort((a: any, b: any) => (a.minute ?? 0) - (b.minute ?? 0))
                    .map((event: any) => {
                      const getPlayerName = (playerId: string | undefined, playerName?: string) => {
                        if (!playerId) return "";
                        if (playerName) return playerName;
                        const player = [...homePlayers, ...awayPlayers].find(p => p.id === playerId);
                        return player?.name || "";
                      };
                      const scorer = getPlayerName(event.playerId, event.playerName);
                      return (
                        <div key={event.id} className="text-gray-600">
                          {formatMinute(event.minute)}' {scorer}{event.type === 'og' ? ' (OG)' : ''}
                        </div>
                      );
                    })
                )}
            </div>
          </div>
        </div>
      </div>

      <Tabs defaultValue="player-stats" className="mt-8">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="player-stats" className="px-2 text-xs sm:px-3 sm:text-sm">ラインナップ</TabsTrigger>
          <TabsTrigger value="match-events" className="px-2 text-xs sm:px-3 sm:text-sm">試合イベント</TabsTrigger>
          <TabsTrigger value="match-stats" className="px-2 text-xs sm:px-3 sm:text-sm">試合スタッツ</TabsTrigger>
        </TabsList>
        <TabsContent value="match-stats">
          <MatchTeamStatsForm 
            match={match} 
            userId={ownerUid as string}
            competitionId={competitionId as string}
            roundId={roundId as string}
            matchDocPath={resolvedMatchDocPath ?? undefined}
          />
        </TabsContent>
        <TabsContent value="player-stats">
          <SquadRegistrationForm 
            match={match} 
            homePlayers={homePlayers} 
            awayPlayers={awayPlayers} 
            roundId={roundId as string} 
            competitionId={competitionId as string} 
            matchDocPath={resolvedMatchDocPath ?? undefined}
            seasonId={seasonId ?? undefined}
            view="player"
          />
        </TabsContent>
        <TabsContent value="match-events">
          <SquadRegistrationForm 
            match={match} 
            homePlayers={homePlayers} 
            awayPlayers={awayPlayers} 
            roundId={roundId as string} 
            competitionId={competitionId as string} 
            matchDocPath={resolvedMatchDocPath ?? undefined}
            seasonId={seasonId ?? undefined}
            view="events"
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
