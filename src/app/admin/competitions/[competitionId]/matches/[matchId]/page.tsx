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
  const { user } = useAuth();
  const params = useParams();
  const { competitionId, matchId } = params;

  const [match, setMatch] = useState<MatchDetails | null>(null);
  const [events, setEvents] = useState<LocalMatchEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [homePlayers, setHomePlayers] = useState<Player[]>([]);
  const [awayPlayers, setAwayPlayers] = useState<Player[]>([]);

  useEffect(() => {
    if (!user || typeof matchId !== 'string' || typeof competitionId !== 'string') {
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

        const matchData = { 
          id: matchDoc.id, 
          ...matchDoc.data(), 
          roundId: roundId 
        } as MatchDetails;

        setMatch(matchData);

        // Fetch players
        if (matchData.homeTeamId && matchData.awayTeamId) {
          const playersRef = collection(db, `clubs/${user.uid}/players`);
          const homeQuery = query(playersRef, where("teamId", "==", matchData.homeTeamId));
          const awayQuery = query(playersRef, where("teamId", "==", matchData.awayTeamId));
          const [homeSnapshot, awaySnapshot] = await Promise.all([getDocs(homeQuery), getDocs(awayQuery)]);
          setHomePlayers(homeSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Player)));
          setAwayPlayers(awaySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Player)));
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
      } finally {
        setLoading(false);
      }
    };

    fetchData();

    return () => {
      unsubscribeEvents();
    };
  }, [user, competitionId, matchId]);

  const handleDeleteEvent = async (eventId: string) => {
    if (!user || !match || !match.roundId || typeof matchId !== 'string') return;
    try {
      const eventDocRef = doc(db, `clubs/${user.uid}/competitions/${competitionId}/rounds/${match.roundId}/matches/${matchId}/events/${eventId}`);
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

  return (
    <div className="container mx-auto max-w-4xl py-10">
      <div className="bg-card border rounded-lg p-6">
        <div className="flex justify-center items-center mb-6">
          <div className="flex flex-col items-center gap-2 w-1/3">
            {match.homeTeamLogo && <Image src={match.homeTeamLogo} alt={match.homeTeamName} width={80} height={80} className="rounded-full object-contain" />}
            <h2 className="text-2xl font-bold text-center">{match.homeTeamName}</h2>
          </div>
          <div className="flex flex-col items-center justify-center px-4">
            <div className="text-center mb-2">
              {match.competitionName && match.roundName && <p className="text-sm text-muted-foreground">{match.competitionName} - {match.roundName}</p>}
              <p className="text-sm text-muted-foreground">{new Date(match.matchDate).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}</p>
            </div>
            <div className="text-5xl font-bold">
              {typeof match.scoreHome === 'number' ? match.scoreHome : '-'}
              <span className="mx-4">-</span>
              {typeof match.scoreAway === 'number' ? match.scoreAway : '-'}
            </div>
          </div>
          <div className="flex flex-col items-center gap-2 w-1/3">
            {match.awayTeamLogo && <Image src={match.awayTeamLogo} alt={match.awayTeamName} width={80} height={80} className="rounded-full object-contain" />}
            <h2 className="text-2xl font-bold text-center">{match.awayTeamName}</h2>
          </div>
        </div>
      </div>

      <Tabs defaultValue="match-stats" className="mt-8">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="match-stats">試合スタッツ</TabsTrigger>
          <TabsTrigger value="match-events">試合イベント</TabsTrigger>
          <TabsTrigger value="player-stats">選手スタッツ</TabsTrigger>
        </TabsList>
        <TabsContent value="match-stats">
          <MatchTeamStatsForm match={match} />
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
                  <EventForm homePlayers={homePlayers} awayPlayers={awayPlayers} match={match} />
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>
        <TabsContent value="player-stats">
          <SquadRegistrationForm match={match} homePlayers={homePlayers} awayPlayers={awayPlayers} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function EventIcon({ type }: { type: MatchEvent['type'] }) {
  switch (type) {
    case 'goal':
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