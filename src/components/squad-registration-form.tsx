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
import { MatchEventsTable } from './match-events-table';

const formSchema = z.object({
  customStatHeaders: z.array(z.object({ id: z.string(), name: z.string().min(1, '必須') })).max(15, '最大15項目です。'),
  playerStats: z.array(
    z.object({
      playerId: z.string(),
      playerName: z.string(),
      position: z.string(),
      role: z.string().optional(),
      rating: z.coerce.number().min(0).max(10).step(0.1).optional(),
      minutesPlayed: z.coerce.number().min(0).optional(),
      goals: z.coerce.number().min(0).optional(),
      assists: z.coerce.number().min(0).optional(),
      yellowCards: z.coerce.number().min(0).optional(),
      redCards: z.coerce.number().min(0).optional(),
      customStats: z.array(z.object({ id: z.string(), name: z.string(), value: z.string().optional() })).optional(),
    })
  ),
  events: z
    .array(
      z.object({
        id: z.string(),
        minute: z.coerce.number().min(0).max(145),
        teamId: z.string(),
        type: z.enum(['goal', 'card', 'substitution', 'note']),
        playerId: z.string().optional(),
        assistPlayerId: z.string().optional(),
        cardColor: z.enum(['yellow', 'red']).optional(),
        inPlayerId: z.string().optional(),
        outPlayerId: z.string().optional(),
        text: z.string().optional(),
      })
    )
    .optional(),
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
      events: [],
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
            events: data.events || [],
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

      // イベントから G/A/Y/R を集計
      const goalCounts = new Map<string, number>();
      const assistCounts = new Map<string, number>();
      const yellowCounts = new Map<string, number>();
      const redCounts = new Map<string, number>();

      (data.events || []).forEach((ev) => {
        if (ev.type === 'goal') {
          if (ev.playerId) {
            goalCounts.set(ev.playerId, (goalCounts.get(ev.playerId) || 0) + 1);
          }
          if (ev.assistPlayerId) {
            assistCounts.set(ev.assistPlayerId, (assistCounts.get(ev.assistPlayerId) || 0) + 1);
          }
        }
        if (ev.type === 'card' && ev.playerId) {
          if (ev.cardColor === 'yellow') {
            yellowCounts.set(ev.playerId, (yellowCounts.get(ev.playerId) || 0) + 1);
          }
          if (ev.cardColor === 'red') {
            redCounts.set(ev.playerId, (redCounts.get(ev.playerId) || 0) + 1);
          }
        }
      });

      // 選手ID → 名前のマップ（得点者表示用にイベントへ埋め込む）
      const playerNameMap = new Map<string, string>();
      [...homePlayers, ...awayPlayers].forEach((p) => {
        if (p.id && p.name) {
          playerNameMap.set(p.id, p.name);
        }
      });

      const normalizedPlayerStats = data.playerStats.map((ps) => {
        const playerId = ps.playerId;
        return {
          role: 'role' in ps && ps.role ? ps.role : 'starter',
          ...ps,
          goals: goalCounts.get(playerId) ?? 0,
          assists: assistCounts.get(playerId) ?? 0,
          yellowCards: yellowCounts.get(playerId) ?? 0,
          redCards: redCounts.get(playerId) ?? 0,
        };
      });

      // Firestore は undefined を許可しないため、events から undefined のフィールドを取り除く
      // 併せて playerName / assistPlayerName もイベントに埋め込む
      const sanitizedEvents = (data.events || []).map((ev) => {
        const {
          id,
          minute,
          teamId,
          type,
          playerId,
          assistPlayerId,
          cardColor,
          inPlayerId,
          outPlayerId,
          text,
        } = ev;

        const base: any = { id, minute, teamId, type };
        if (playerId) {
          base.playerId = playerId;
          const name = playerNameMap.get(playerId);
          if (name) base.playerName = name;
        }
        if (assistPlayerId) {
          base.assistPlayerId = assistPlayerId;
          const aName = playerNameMap.get(assistPlayerId);
          if (aName) base.assistPlayerName = aName;
        }
        if (cardColor) base.cardColor = cardColor;
        if (inPlayerId) base.inPlayerId = inPlayerId;
        if (outPlayerId) base.outPlayerId = outPlayerId;
        if (text) base.text = text;
        return base;
      });

      await setDoc(matchDocRef, {
        customStatHeaders: data.customStatHeaders,
        playerStats: normalizedPlayerStats,
        events: sanitizedEvents,
      }, { merge: true });
      toast.success('出場選手・スタッツ・イベントを更新しました。');
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

            <div className="mt-10">
              <MatchEventsTable
                match={match}
                homePlayers={homePlayers}
                awayPlayers={awayPlayers}
              />
            </div>
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