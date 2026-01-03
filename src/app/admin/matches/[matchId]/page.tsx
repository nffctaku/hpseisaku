"use client";

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { doc, getDoc, collection, getDocs, serverTimestamp, setDoc } from 'firebase/firestore';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useFieldArray } from 'react-hook-form';
import type { SubmitHandler } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

// Define structures
interface Match {
  id: string;
  competitionId: string;
  matchDate: string;
  opponent: string;
  homeAway: 'Home' | 'Away';
  scoreHome?: number;
  scoreAway?: number;
}

interface Player {
  id: string;
  name: string;
  number: number;
}

const playerStatsSchema = z.object({
  playerId: z.string(),
  minutesPlayed: z.coerce.number().int().min(0).max(120).optional(),
  goals: z.coerce.number().int().min(0).optional(),
  assists: z.coerce.number().int().min(0).optional(),
});

const matchStatsSchema = z.object({
  playerStats: z.array(playerStatsSchema),
});

type MatchStatsFormValues = z.infer<typeof matchStatsSchema>;

export default function MatchStatsPage() {
  const { user } = useAuth();
  const params = useParams();
  const matchId = params.matchId as string;

  const [match, setMatch] = useState<Match | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const form = useForm<MatchStatsFormValues>({
    resolver: zodResolver(matchStatsSchema) as any,
  });

  const { fields, replace } = useFieldArray({
    control: form.control,
    name: 'playerStats',
  });

  useEffect(() => {
    if (!user || !matchId) return;

    const fetchMatchAndPlayers = async () => {
      setLoading(true);
      try {
        // Fetch match details
        const matchDocRef = doc(db, `clubs/${user.uid}/matches`, matchId);
        const matchSnap = await getDoc(matchDocRef);
        if (matchSnap.exists()) {
          const data = matchSnap.data() as any;
          setMatch({ id: matchSnap.id, ...data } as Match);

          const existingPlayerStats = Array.isArray(data?.playerStats) ? data.playerStats : null;
          if (existingPlayerStats) {
            const normalized = existingPlayerStats
              .filter((ps: any) => ps && typeof ps.playerId === 'string')
              .map((ps: any) => ({
                playerId: String(ps.playerId),
                minutesPlayed: typeof ps.minutesPlayed === 'number' ? ps.minutesPlayed : (ps.minutesPlayed ?? 0),
                goals: typeof ps.goals === 'number' ? ps.goals : (ps.goals ?? 0),
                assists: typeof ps.assists === 'number' ? ps.assists : (ps.assists ?? 0),
              }));
            form.reset({ playerStats: normalized });
          }
        } else {
          console.error("Match not found");
        }

        // Fetch players
        const playersColRef = collection(db, `clubs/${user.uid}/players`);
        const playersSnap = await getDocs(playersColRef);
        const playersData = playersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Player));
        setPlayers(playersData);
        
        // Initialize form with players only if no existing values were loaded
        const current = form.getValues('playerStats');
        if (!Array.isArray(current) || current.length === 0) {
          replace(playersData.map(p => ({ playerId: p.id, minutesPlayed: 0, goals: 0, assists: 0 })));
        }

      } catch (error) {
        console.error("Error fetching data: ", error);
      } finally {
        setLoading(false);
      }
    };

    fetchMatchAndPlayers();
  }, [user, matchId, replace, form]);

  const handleFormSubmit: SubmitHandler<MatchStatsFormValues> = async (values) => {
    if (!user || !matchId) return;
    setSaving(true);
    try {
      const matchDocRef = doc(db, `clubs/${user.uid}/matches`, matchId);
      const payload = {
        playerStats: values.playerStats.map((ps) => ({
          playerId: ps.playerId,
          minutesPlayed: typeof ps.minutesPlayed === 'number' ? ps.minutesPlayed : 0,
          goals: typeof ps.goals === 'number' ? ps.goals : 0,
          assists: typeof ps.assists === 'number' ? ps.assists : 0,
        })),
        updatedAt: serverTimestamp(),
      };
      await setDoc(matchDocRef, payload as any, { merge: true });
      toast.success('スタッツを保存しました。');
    } catch (e: any) {
      console.error(e);
      const code = typeof e?.code === 'string' ? e.code : '';
      toast.error(`保存に失敗しました。${code ? ` (${code})` : ''}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center items-center h-screen"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  if (!match) {
    return <div className="text-center py-10">Match not found.</div>;
  }

  return (
    <div className="container mx-auto py-10">
      <h1 className="text-3xl font-bold mb-2">スタッツ入力</h1>
      <div className="text-lg text-muted-foreground mb-6">
        {new Date(match.matchDate).toLocaleDateString('ja-JP')} vs {match.opponent}
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-6">
          <div className="bg-card border rounded-lg">
            <div className="grid grid-cols-5 gap-4 p-4 font-semibold border-b">
              <div className="col-span-2">選手名</div>
              <div>出場時間</div>
              <div>ゴール</div>
              <div>アシスト</div>
            </div>
            <div className="divide-y">
              {fields.map((field, index) => {
                const player = players.find(p => p.id === field.playerId);
                return (
                  <div key={field.id} className="grid grid-cols-5 gap-4 p-4 items-center">
                    <div className="col-span-2 font-medium">
                      <span className="text-sm text-muted-foreground mr-2">{player?.number}</span>
                      {player?.name}
                    </div>
                    <FormField
                      control={form.control}
                      name={`playerStats.${index}.minutesPlayed`}
                      render={({ field }) => (
                        <FormItem>
                          <FormControl><Input type="number" placeholder="0" {...field} /></FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`playerStats.${index}.goals`}
                      render={({ field }) => (
                        <FormItem>
                          <FormControl><Input type="number" placeholder="0" {...field} /></FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`playerStats.${index}.assists`}
                      render={({ field }) => (
                        <FormItem>
                          <FormControl><Input type="number" placeholder="0" {...field} /></FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          <Button
            type="submit"
            className="w-full bg-emerald-600 text-white hover:bg-emerald-700"
            disabled={saving}
          >
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            スタッツを保存
          </Button>
        </form>
      </Form>
    </div>
  );
}
