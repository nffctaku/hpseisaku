"use client";

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { doc, getDoc, collection, query, where, getDocs, onSnapshot, orderBy, deleteDoc, collectionGroup } from "firebase/firestore";
import { Loader2, LifeBuoy, Square, ArrowUp, ArrowDown, Trash2 } from 'lucide-react';
import { FaFutbol } from 'react-icons/fa';
import Image from 'next/image';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EventForm } from '@/components/event-form';
import { SquadRegistrationForm } from '@/components/squad-registration-form';
import { MatchTeamStatsForm } from '@/components/match-team-stats-form';
import { MatchDetails, Player, MatchEvent } from '@/types/match';

interface LocalMatchEvent extends MatchEvent {
  substitutionReason?: string;
}

export default function MatchAdminPage() {
  const { user, ownerUid: ownerUidFromContext } = useAuth();
  const params = useParams();
  const { competitionId, matchId } = params;

  const ownerUid = ownerUidFromContext || user?.uid;

  const [match, setMatch] = useState<MatchDetails | null>(null);
  const [events, setEvents] = useState<LocalMatchEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [homePlayers, setHomePlayers] = useState<Player[]>([]);
  const [awayPlayers, setAwayPlayers] = useState<Player[]>([]);
  const [resolvedMatchDocPath, setResolvedMatchDocPath] = useState<string | null>(null);
  const [seasonId, setSeasonId] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !ownerUid || typeof competitionId !== 'string') return;
    let cancelled = false;
    const fetchSeason = async () => {
      try {
        const compSnap = await getDoc(doc(db, `clubs/${ownerUid}/competitions/${competitionId}`));
        if (cancelled) return;
        const s = compSnap.exists() ? (compSnap.data() as any)?.season : undefined;
        setSeasonId(typeof s === 'string' ? s : null);
      } catch {
        if (cancelled) return;
        setSeasonId(null);
      }
    };
    fetchSeason();
    return () => {
      cancelled = true;
    };
  }, [user, ownerUid, competitionId]);

  useEffect(() => {
    if (!user || !ownerUid || typeof matchId !== 'string' || typeof competitionId !== 'string') {
      setLoading(false);
      return;
    }

    let unsubscribeEvents: () => void = () => {};

    const fetchData = async () => {
      setLoading(true);
      try {
        const matchesGroupRef = collectionGroup(db, 'matches');
        const q = query(matchesGroupRef, where("id", "==", matchId));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
          console.log("No such document in collection group!");
          setMatch(null);
          setLoading(false);
          return;
        }
        
        const matchDoc = querySnapshot.docs[0];
        const matchPath = matchDoc.ref.path;
        const pathSegments = matchPath.split('/');
        const roundId = pathSegments[pathSegments.length - 3];

        setResolvedMatchDocPath(matchDoc.ref.path);

        const matchData = { 
          id: matchDoc.id, 
          ...matchDoc.data(), 
          roundId: roundId 
        } as MatchDetails;

        setMatch(matchData);

        // Fetch players (per-team collection path)
        if (matchData.homeTeam && matchData.awayTeam) {
          const fetchPlayers = async (teamId: string): Promise<Player[]> => {
            if (!teamId || !user || !ownerUid) return [];
            const primaryRef = collection(db, `clubs/${ownerUid}/teams/${teamId}/players`);
            const primarySnap = await getDocs(primaryRef);
            if (!primarySnap.empty) {
              return primarySnap.docs.map((d) => ({ id: d.id, ...d.data() } as Player));
            }

            const legacyUid = user.uid;
            if (!legacyUid || legacyUid === ownerUid) return [];
            const fallbackRef = collection(db, `clubs/${legacyUid}/teams/${teamId}/players`);
            const fallbackSnap = await getDocs(fallbackRef);
            return fallbackSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Player));
          };

          const [homePlayers, awayPlayers] = await Promise.all([
            fetchPlayers(matchData.homeTeam),
            fetchPlayers(matchData.awayTeam),
          ]);

          setHomePlayers(homePlayers);
          setAwayPlayers(awayPlayers);
        }

        // Subscribe to events
        const eventsRef = collection(db, matchDoc.ref.path, 'events');
        const eventsQuery = query(eventsRef, orderBy("minute"));
        unsubscribeEvents = onSnapshot(eventsQuery, (snapshot) => {
          setEvents(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as LocalMatchEvent)));
        });

      } catch (error) {
        console.error("Error fetching data: ", error);
        setMatch(null);
        setResolvedMatchDocPath(null);
      } finally {
        setLoading(false);
      }
    };

    fetchData();

    return () => {
      unsubscribeEvents();
    };
  }, [user, ownerUid, competitionId, matchId]);

  const handleDeleteEvent = async (eventId: string) => {
    if (!user || !match || !match.roundId || typeof matchId !== 'string') return;
    try {
      const base = resolvedMatchDocPath || `clubs/${ownerUid}/competitions/${competitionId}/rounds/${match.roundId}/matches/${matchId}`;
      const eventDocRef = doc(db, `${base}/events/${eventId}`);
      await deleteDoc(eventDocRef);
    } catch (error) {
      console.error("Error deleting event: ", error);
    }
  };

  if (loading) {
    return <div className="flex h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  if (!match) {
    return <div className="flex h-screen items-center justify-center">試合が見つかりませんでした。</div>;
  }

  if (!user) {
    return <div className="flex h-screen items-center justify-center">ログインしてください。</div>;
  }

  return (
    <div className="container mx-auto max-w-4xl py-6 sm:py-10">
      <div className="bg-card border rounded-lg p-6">
        <div className="flex flex-col sm:flex-row sm:justify-center sm:items-center gap-6 mb-6">
          <div className="flex items-center justify-between sm:justify-center sm:w-1/3">
            <div className="flex flex-col items-center gap-2">
              {match.homeTeamLogo && (
                <Image
                  src={match.homeTeamLogo}
                  alt={match.homeTeamName}
                  width={56}
                  height={56}
                  className="rounded-full object-contain"
                />
              )}
              <h2 className="text-base sm:text-2xl font-bold text-center leading-tight max-w-[10ch] break-words min-h-[2.5rem] sm:min-h-0">
                {match.homeTeamName}
              </h2>
            </div>

            <div className="flex flex-col items-center justify-center px-2 sm:hidden">
              <div className="text-center mb-1">
                {match.competitionName && match.roundName && (
                  <p className="text-xs text-muted-foreground">{match.competitionName} - {match.roundName}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  {new Date(match.matchDate).toLocaleDateString("ja-JP", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                    weekday: "long",
                  })}
                </p>
              </div>
              <div className="text-4xl font-bold">
                {typeof match.scoreHome === "number" ? match.scoreHome : "-"}
                <span className="mx-3">-</span>
                {typeof match.scoreAway === "number" ? match.scoreAway : "-"}
              </div>
            </div>

            <div className="flex flex-col items-center gap-2 sm:hidden">
              {match.awayTeamLogo && (
                <Image
                  src={match.awayTeamLogo}
                  alt={match.awayTeamName}
                  width={56}
                  height={56}
                  className="rounded-full object-contain"
                />
              )}
              <h2 className="text-base sm:text-2xl font-bold text-center leading-tight max-w-[10ch] break-words min-h-[2.5rem] sm:min-h-0">
                {match.awayTeamName}
              </h2>
            </div>
          </div>

          <div className="hidden sm:flex flex-col items-center justify-center px-4">
            <div className="text-center mb-2">
              {match.competitionName && match.roundName && (
                <p className="text-sm text-muted-foreground">{match.competitionName} - {match.roundName}</p>
              )}
              <p className="text-sm text-muted-foreground">
                {new Date(match.matchDate).toLocaleDateString("ja-JP", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                  weekday: "long",
                })}
              </p>
            </div>
            <div className="text-5xl font-bold">
              {typeof match.scoreHome === "number" ? match.scoreHome : "-"}
              <span className="mx-4">-</span>
              {typeof match.scoreAway === "number" ? match.scoreAway : "-"}
            </div>
          </div>

          <div className="hidden sm:flex flex-col items-center gap-2 w-1/3">
            {match.awayTeamLogo && (
              <Image
                src={match.awayTeamLogo}
                alt={match.awayTeamName}
                width={72}
                height={72}
                className="rounded-full object-contain"
              />
            )}
            <h2 className="text-2xl font-bold text-center">{match.awayTeamName}</h2>
          </div>
        </div>
      </div>

      <Tabs defaultValue="match-stats" className="mt-8">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="match-stats" className="px-2 text-xs sm:px-3 sm:text-sm">試合スタッツ</TabsTrigger>
          <TabsTrigger value="match-events" className="px-2 text-xs sm:px-3 sm:text-sm">試合イベント</TabsTrigger>
          <TabsTrigger value="player-stats" className="px-2 text-xs sm:px-3 sm:text-sm">選手スタッツ</TabsTrigger>
        </TabsList>
        <TabsContent value="match-stats">
          <MatchTeamStatsForm
            match={match}
            userId={ownerUid as string}
            competitionId={competitionId as string}
            roundId={match.roundId as string}
            matchDocPath={resolvedMatchDocPath ?? undefined}
          />
        </TabsContent>
        <TabsContent value="match-events">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-4">
            <div className="lg:col-span-2">
              <h3 className="text-2xl font-bold mb-4">タイムライン</h3>
              <div className="space-y-4">
                {events.length > 0 ? (
                  events.map(event => (
                    <div key={event.id} className="flex items-center gap-4 p-3 bg-card border rounded-md">
                      <div className="font-bold w-12">{event.minute}'</div>
                      <div className="flex-shrink-0">
                        <EventIcon type={event.type} />
                      </div>
                      <div className="flex-grow">
                        <p className="font-semibold">{event.playerName}</p>
                        <p className="text-sm text-muted-foreground">
                          {event.type === 'goal' && event.assistPlayerName ? `Goal (Assist: ${event.assistPlayerName})` : event.type}
                          {event.substitutionReason && ` (${event.substitutionReason})`}
                        </p>
                      </div>
                      <button onClick={() => handleDeleteEvent(event.id)} className="p-1 text-muted-foreground hover:text-red-500">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))
                ) : (
                  <p className="text-muted-foreground">まだイベントがありません。</p>
                )}
              </div>
            </div>
            <div>
              <Card>
                <CardHeader>
                  <CardTitle>イベントを追加</CardTitle>
                </CardHeader>
                <CardContent>
                  <EventForm homePlayers={homePlayers} awayPlayers={awayPlayers} match={match} matchDocPath={resolvedMatchDocPath ?? undefined} />
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>
        <TabsContent value="player-stats">
          <SquadRegistrationForm
            match={match}
            homePlayers={homePlayers}
            awayPlayers={awayPlayers}
            roundId={(match as any).roundId}
            competitionId={(match as any).competitionId}
            matchDocPath={resolvedMatchDocPath ?? undefined}
            seasonId={seasonId ?? undefined}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function EventIcon({ type }: { type: MatchEvent['type'] }) {
  switch (type) {
    case 'goal':
      return <FaFutbol className="h-5 w-5 text-green-500" />;
    case 'og':
      return <FaFutbol className="h-5 w-5 text-green-500" />;
    case 'yellow':
      return <Square className="h-5 w-5 text-yellow-500 fill-current" />;
    case 'red':
      return <Square className="h-5 w-5 text-red-500 fill-current" />;
    case 'sub_in':
    case 'sub_out':
      return <ArrowDown className="h-5 w-5 text-red-500" />;
    default:
      return <LifeBuoy className="h-5 w-5 text-muted-foreground" />;
  }
}