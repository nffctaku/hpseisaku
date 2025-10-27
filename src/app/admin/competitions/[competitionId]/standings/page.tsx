'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { collection, doc, getDoc, getDocs, writeBatch } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface Standing {
  id: string;
  rank: number;
  teamName: string;
  logoUrl?: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
}

export default function StandingsPage() {
  const params = useParams();
  const competitionId = params.competitionId as string;
  const { user } = useAuth();
  const [standings, setStandings] = useState<Standing[]>([]);
  const [loading, setLoading] = useState(true);
  const [competitionName, setCompetitionName] = useState('');

  const fetchStandingsAndTeams = async () => {
    if (!user || !competitionId) return;
    setLoading(true);
    try {
      const competitionDocRef = doc(db, `clubs/${user.uid}/competitions`, competitionId);
      const competitionSnap = await getDoc(competitionDocRef);
      const competitionData = competitionSnap.data();
      if (competitionSnap.exists()) {
        setCompetitionName(competitionData?.name || '');
      }

      const teamsMap = new Map<string, { name: string; logoUrl?: string }>();
      const teamsSnap = await getDocs(collection(db, `clubs/${user.uid}/teams`));
      teamsSnap.forEach(doc => {
          teamsMap.set(doc.id, { name: doc.data().name, logoUrl: doc.data().logoUrl });
      });

      const standingsSnap = await getDocs(collection(db, `clubs/${user.uid}/competitions/${competitionId}/standings`));
      const fetchedStandings = standingsSnap.docs.map(doc => {
        const data = doc.data();
        const teamInfo = teamsMap.get(doc.id);
        return {
          id: doc.id,
          rank: data.rank || 0,
          teamName: teamInfo?.name || data.teamName || 'Unknown Team',
          logoUrl: teamInfo?.logoUrl,
          played: data.played || 0,
          wins: data.wins || 0,
          draws: data.draws || 0,
          losses: data.losses || 0,
          goalsFor: data.goalsFor || 0,
          goalsAgainst: data.goalsAgainst || 0,
          goalDifference: data.goalDifference || 0,
          points: data.points || 0,
        } as Standing;
      });

      if (fetchedStandings.length > 0) {
        fetchedStandings.sort((a, b) => a.rank - b.rank);
        setStandings(fetchedStandings);
      } else {
        if (competitionData && competitionData.teams) {
          const initialStandings = competitionData.teams.map((teamId: string, index: number) => {
            const teamInfo = teamsMap.get(teamId);
            return {
              id: teamId,
              rank: index + 1,
              teamName: teamInfo?.name || 'Unknown Team',
              logoUrl: teamInfo?.logoUrl,
              played: 0, wins: 0, draws: 0, losses: 0,
              goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0,
            };
          });
          setStandings(initialStandings);
        } else {
           setStandings([]);
        }
      }
    } catch (error) {
      console.error("Error fetching data: ", error);
      toast.error("データの取得に失敗しました。");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStandingsAndTeams();
  }, [user, competitionId]);

  const handleInputChange = (teamId: string, field: keyof Standing, value: string) => {
    const numericValue = parseInt(value, 10);
    setStandings(prev =>
      prev.map(s => (s.id === teamId ? { ...s, [field]: isNaN(numericValue) ? 0 : numericValue } : s))
    );
  };

  const handleRecalculate = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const competitionDocRef = doc(db, `clubs/${user.uid}/competitions`, competitionId);
      const competitionSnap = await getDoc(competitionDocRef);
      const competitionData = competitionSnap.data();

      if (!competitionData) {
        toast.error('大会データが見つかりません。');
        console.log('No competition data found.');
        setLoading(false);
        return;
      }

      if (!competitionData.teams || competitionData.teams.length === 0) {
        toast.error('大会にチームが登録されていません。');
        console.log('No teams in competition.');
        setLoading(false);
        return;
      }
      console.log(`Found ${competitionData.teams.length} teams in the competition.`);

      const teamDetailsSnap = await getDocs(collection(db, `clubs/${user.uid}/teams`));
      const teamDetailsMap = new Map(teamDetailsSnap.docs.map(d => [d.id, d.data()]));

      const standingsMap = new Map<string, Standing>();
      for (const teamId of competitionData.teams) {
        const teamDetails = teamDetailsMap.get(teamId);
        standingsMap.set(teamId, {
          id: teamId,
          teamName: teamDetails?.name || 'Unknown Team',
          logoUrl: teamDetails?.logoUrl,
          rank: 0, played: 0, wins: 0, draws: 0, losses: 0,
          goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0,
        });
      }

      const roundsSnap = await getDocs(collection(db, `clubs/${user.uid}/competitions/${competitionId}/rounds`));
      console.log(`Found ${roundsSnap.size} rounds.`);

      if (roundsSnap.empty) {
        toast.info('試合ラウンドがありません。順位はリセットされます。');
      }

      for (const roundDoc of roundsSnap.docs) {
        const matchesSnap = await getDocs(collection(roundDoc.ref, 'matches'));
        console.log(`Round ${roundDoc.id} has ${matchesSnap.size} matches.`);
        for (const matchDoc of matchesSnap.docs) {
          const match = matchDoc.data();
          if (match.scoreHome == null || match.scoreAway == null) continue;

          const homeTeamId = match.homeTeam;
          const awayTeamId = match.awayTeam;
          const homeScore = Number(match.scoreHome || 0);
          const awayScore = Number(match.scoreAway || 0);

          const homeStanding = standingsMap.get(homeTeamId);
          if (homeStanding) {
            homeStanding.played += 1;
            homeStanding.goalsFor += homeScore;
            homeStanding.goalsAgainst += awayScore;
            if (homeScore > awayScore) homeStanding.wins += 1;
            else if (homeScore < awayScore) homeStanding.losses += 1;
            else homeStanding.draws += 1;
          }

          const awayStanding = standingsMap.get(awayTeamId);
          if (awayStanding) {
            awayStanding.played += 1;
            awayStanding.goalsFor += awayScore;
            awayStanding.goalsAgainst += homeScore;
            if (awayScore > homeScore) awayStanding.wins += 1;
            else if (awayScore < homeScore) awayStanding.losses += 1;
            else awayStanding.draws += 1;
          }
        }
      }

      const finalStandings = Array.from(standingsMap.values());
      finalStandings.forEach(s => {
        s.points = (s.wins * 3) + s.draws;
        s.goalDifference = s.goalsFor - s.goalsAgainst;
      });

      finalStandings.sort((a, b) => {
        if (a.points !== b.points) return b.points - a.points;
        if (a.goalDifference !== b.goalDifference) return b.goalDifference - a.goalDifference;
        if (a.goalsFor !== b.goalsFor) return b.goalsFor - a.goalsFor;
        return a.teamName.localeCompare(b.teamName);
      });

      finalStandings.forEach((s, index) => s.rank = index + 1);

      setStandings(finalStandings);
      toast.success('順位表を再計算しました。内容を確認して保存してください。');

    } catch (error) {
      console.error('Error recalculating standings:', error);
      toast.error('再計算に失敗しました。');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;
    setLoading(true);

    const batch = writeBatch(db);
    standings.forEach(standing => {
      const docRef = doc(db, `clubs/${user.uid}/competitions/${competitionId}/standings`, standing.id);
      const { logoUrl, ...dataToSave } = standing;
      batch.set(docRef, dataToSave);
    });

    try {
      await batch.commit();
      toast.success("順位表を保存しました。");
    } catch (error) {
      console.error("Error saving standings: ", error);
      toast.error("保存に失敗しました。");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center items-center h-screen"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }
  return (
    <div className="container mx-auto py-10">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">順位表編集: {competitionName}</h1>
        <div>
          <Button onClick={handleRecalculate} disabled={loading || !user} variant="outline" className="mr-2">
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            全試合結果から順位を再計算
          </Button>
          <Button onClick={handleSave} disabled={loading || !user}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            保存
          </Button>
        </div>
      </div>
      <div className="bg-card rounded-lg p-4">
        <Table>
          <TableHeader>
            <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Club</TableHead>
                <TableHead>P</TableHead>
                <TableHead>W</TableHead>
                <TableHead>D</TableHead>
                <TableHead>L</TableHead>
                <TableHead>GF</TableHead>
                <TableHead>GA</TableHead>
                <TableHead>GD</TableHead>
                <TableHead>Pts</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {standings.map(s => (
              <TableRow key={s.id}>
                <TableCell>
                  <Input value={s.rank} onChange={e => handleInputChange(s.id, 'rank', e.target.value)} className="w-16" />
                </TableCell>
                <TableCell className="font-medium flex items-center">
                  {s.logoUrl && <img src={s.logoUrl} alt={s.teamName} className="w-6 h-6 mr-2" />}
                  {s.teamName}
                </TableCell>
                <TableCell><Input value={s.played} onChange={e => handleInputChange(s.id, 'played', e.target.value)} className="w-16" /></TableCell>
                <TableCell><Input value={s.wins} onChange={e => handleInputChange(s.id, 'wins', e.target.value)} className="w-16" /></TableCell>
                <TableCell><Input value={s.draws} onChange={e => handleInputChange(s.id, 'draws', e.target.value)} className="w-16" /></TableCell>
                <TableCell><Input value={s.losses} onChange={e => handleInputChange(s.id, 'losses', e.target.value)} className="w-16" /></TableCell>
                <TableCell><Input value={s.goalsFor} onChange={e => handleInputChange(s.id, 'goalsFor', e.target.value)} className="w-16" /></TableCell>
                <TableCell><Input value={s.goalsAgainst} onChange={e => handleInputChange(s.id, 'goalsAgainst', e.target.value)} className="w-16" /></TableCell>
                <TableCell>{s.goalDifference}</TableCell>
                <TableCell>{s.points}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}