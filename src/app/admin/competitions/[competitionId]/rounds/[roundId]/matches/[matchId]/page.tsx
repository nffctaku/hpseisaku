"use client";

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { Loader2 } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { MatchDetails, Player } from '@/types/match';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MatchTeamStatsForm } from '@/components/match-team-stats-form';
import { SquadRegistrationForm } from '@/components/squad-registration-form';
import { MatchEventsPreview } from '@/components/match-events-preview';

export default function MatchAdminPage() {
  const { user } = useAuth();
  const params = useParams();
  const { competitionId, roundId, matchId } = params;

  const [match, setMatch] = useState<MatchDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [homePlayers, setHomePlayers] = useState<Player[]>([]);
  const [awayPlayers, setAwayPlayers] = useState<Player[]>([]);

  useEffect(() => {
    if (!user || typeof matchId !== 'string' || typeof competitionId !== 'string' || typeof roundId !== 'string') {
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      setLoading(true);
      try {
        const matchDocRef = doc(db, `clubs/${user.uid}/competitions/${competitionId}/rounds/${roundId}/matches/${matchId}`);
        let matchDoc = await getDoc(matchDocRef);

        // Fallback: if not found under competitions/rounds, try legacy top-level matches collection
        if (!matchDoc.exists()) {
          const legacyMatchRef = doc(db, `clubs/${user.uid}/matches`, matchId as string);
          const legacySnap = await getDoc(legacyMatchRef);
          if (!legacySnap.exists()) {
            console.error("Match document not found in either competitions/rounds or legacy matches collection");
            setMatch(null);
            return;
          }
          console.log("Loaded match from legacy collection:", legacySnap.data());
          matchDoc = legacySnap;
        }

        console.log("Raw data from Firestore:", matchDoc.data());

        let matchData = { id: matchDoc.id, ...matchDoc.data() } as MatchDetails;

        // To ensure team names and logos are present, fetch them if not already on the match doc
        const fetchTeamData = async (teamId: string) => {
          if (!teamId) return null;
          const teamDocRef = doc(db, `clubs/${user.uid}/teams`, teamId);
          const teamDoc = await getDoc(teamDocRef);
          return teamDoc.exists() ? { name: teamDoc.data().name, logoUrl: teamDoc.data().logoUrl } : null;
        };

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
        
        console.log("Final match data being set:", matchData);
        setMatch(matchData);

        // Fetch players for both teams (per-team collection path)
        const fetchPlayers = async (teamId: string): Promise<Player[]> => {
          if (!teamId || !user) return [];
          const playersRef = collection(db, `clubs/${user.uid}/teams/${teamId}/players`);
          const querySnapshot = await getDocs(playersRef);
          return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Player));
        };

        const home = await fetchPlayers(matchData.homeTeam);
        const away = await fetchPlayers(matchData.awayTeam);

        setHomePlayers(home);
        setAwayPlayers(away);

      } catch (error) {
        console.error("Error fetching match data: ", error);
        setMatch(null);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user, competitionId, roundId, matchId]);

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
              <p className="text-xs text-muted-foreground">
                {new Date(match.matchDate).toLocaleDateString("ja-JP", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                  weekday: "long",
                })}
              </p>
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
            <p className="text-sm text-muted-foreground">
              {new Date(match.matchDate).toLocaleDateString("ja-JP", {
                year: "numeric",
                month: "long",
                day: "numeric",
                weekday: "long",
              })}
            </p>
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
            userId={user.uid}
            competitionId={competitionId as string}
            roundId={roundId as string}
          />
        </TabsContent>
        <TabsContent value="match-events">
          <MatchEventsPreview
            match={match}
            homePlayers={homePlayers}
            awayPlayers={awayPlayers}
          />
        </TabsContent>
        <TabsContent value="player-stats">
          <SquadRegistrationForm 
            match={match} 
            homePlayers={homePlayers} 
            awayPlayers={awayPlayers} 
            roundId={roundId as string} 
            competitionId={competitionId as string} 
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
