"use client";

import { useState, useEffect } from 'react';
import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { db } from '@/lib/firebase';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { Player, MatchDetails } from '@/types/match';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { PlayerStatsTable } from './player-stats-table';

const formSchema = z.object({
  customStatHeaders: z.array(z.object({ id: z.string(), name: z.string().min(1, '必須') })).max(15, '最大15項目です。'),
  playerStats: z.array(
    z.object({
      playerId: z.string(),
      playerName: z.string(),
      position: z.string(),
      rating: z.coerce.number().min(0).max(10).step(0.1).optional(),
      minutesPlayed: z.coerce.number().min(0).optional(),
      goals: z.coerce.number().min(0).optional(),
      assists: z.coerce.number().min(0).optional(),
      yellowCards: z.coerce.number().min(0).optional(),
      redCards: z.coerce.number().min(0).optional(),
      customStats: z.array(z.object({ id: z.string(), name: z.string(), value: z.string().optional() })).optional(),
    })
  ),
});

type FormValues = z.infer<typeof formSchema>;

interface SquadRegistrationFormProps {
  match: MatchDetails;
  homePlayers: Player[];
  awayPlayers: Player[];
  roundId: string;
  competitionId: string;
}

export function SquadRegistrationForm({ match, homePlayers, awayPlayers, roundId, competitionId }: SquadRegistrationFormProps) {
  console.log('SquadForm: Received homePlayers', homePlayers);
  console.log('SquadForm: Received awayPlayers', awayPlayers);
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('home');

  const methods = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      customStatHeaders: [],
      playerStats: [],
    },
  });

  useEffect(() => {
    const fetchMatchData = async () => {
      if (!user || !roundId || !competitionId) {
        setLoading(false);
        return;
      }
      try {
        const matchDocRef = doc(db, `clubs/${user.uid}/competitions/${competitionId}/rounds/${roundId}/matches/${match.id}`);
        const matchDoc = await getDoc(matchDocRef);
        if (matchDoc.exists()) {
          const data = matchDoc.data();
          methods.reset({
            customStatHeaders: data.customStatHeaders || [],
            playerStats: data.playerStats || [],
          });
        }
      } catch (error) {
        console.error("Error fetching match data:", error);
        toast.error("選手データの読み込みに失敗しました。");
      } finally {
        setLoading(false);
      }
    };
    fetchMatchData();
  }, [match.id, roundId, competitionId, user, methods]);

  const onSubmit = async (data: FormValues) => {
    if (!user || !roundId || !competitionId) {
      toast.error('データが不完全なため保存できません。');
      return;
    }
    setSaving(true);
    try {
      const matchDocRef = doc(db, `clubs/${user.uid}/competitions/${competitionId}/rounds/${roundId}/matches/${match.id}`);
      await setDoc(matchDocRef, { 
        customStatHeaders: data.customStatHeaders,
        playerStats: data.playerStats
      }, { merge: true });
      toast.success('出場選手とスタッツを更新しました。');
    } catch (error) {
      console.error("Error saving squad data:", error);
      toast.error('更新に失敗しました。');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center items-center h-64"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  return (
    <FormProvider {...methods}>
      <Card>
        <CardHeader>
          <CardTitle>出場選手登録 & スタッツ</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={methods.handleSubmit(onSubmit)}>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList>
                <TabsTrigger value="home">{match.homeTeamName}</TabsTrigger>
                <TabsTrigger value="away">{match.awayTeamName}</TabsTrigger>
              </TabsList>
              <TabsContent value="home">
                <PlayerStatsTable teamId={match.homeTeam} allPlayers={homePlayers} />
              </TabsContent>
              <TabsContent value="away">
                <PlayerStatsTable teamId={match.awayTeam} allPlayers={awayPlayers} />
              </TabsContent>
            </Tabs>
            <div className="mt-8 flex justify-end">
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                更新
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </FormProvider>
  );
}