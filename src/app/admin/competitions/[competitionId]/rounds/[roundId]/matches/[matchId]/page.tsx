"use client";

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { Loader2 } from 'lucide-react';
import Image from 'next/image';
import { MatchDetails, Player } from '@/types/match';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MatchTeamStatsForm } from '@/components/match-team-stats-form';
import { SquadRegistrationForm } from '@/components/squad-registration-form';

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
        const matchDoc = await getDoc(matchDocRef);

        if (!matchDoc.exists()) {
          console.error("Match document not found!");
          setMatch(null);
          return;
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

        // Fetch players for both teams
        const fetchPlayers = async (teamId: string): Promise<Player[]> => {
          if (!teamId || !user) return [];
          const playersRef = collection(db, `clubs/${user.uid}/players`);
          const q = query(playersRef, where('teamId', '==', teamId));
          const querySnapshot = await getDocs(q);
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
    return <div className="flex h-screen items-center justify-center">試合データが見つかりませんでした。URLを確認してください。</div>;
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
            <p className="text-sm text-muted-foreground">{new Date(match.matchDate).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}</p>
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
          <TabsTrigger value="match-events" disabled>試合イベント</TabsTrigger>
          <TabsTrigger value="player-stats">選手スタッツ</TabsTrigger>
        </TabsList>
        <TabsContent value="match-stats">
          <MatchTeamStatsForm 
            match={match} 
            userId={user.uid}
            competitionId={competitionId as string}
            roundId={roundId as string}
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
