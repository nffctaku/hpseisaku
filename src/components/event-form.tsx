"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Player, MatchDetails, MatchEvent } from '@/types/match';

const eventFormSchema = z.object({
  type: z.enum(['goal', 'yellow', 'red', 'sub_in', 'sub_out']),
  minute: z.coerce.number().min(0, "時間は0以上で入力してください。"),
  teamId: z.string().min(1, "チームを選択してください。"),
  playerId: z.string().optional(),
  manualPlayerName: z.string().optional(),
  assistPlayerId: z.string().optional(),
  substitutionReason: z.string().max(20, "理由は20文字以内で入力してください。").optional(),
  isManual: z.boolean().default(false),
}).refine(data => {
  if (data.isManual) return !!data.manualPlayerName && data.manualPlayerName.length > 0;
  if (!data.isManual) return !!data.playerId && data.playerId.length > 0;
  return true;
}, {
  message: "選手を選択または入力してください。",
  path: ["playerId"], 
});

type EventFormValues = z.infer<typeof eventFormSchema>;

interface EventFormProps {
  homePlayers: Player[];
  awayPlayers: Player[];
  match: MatchDetails | null;
  matchDocPath?: string;
}

export function EventForm({ homePlayers, awayPlayers, match, matchDocPath }: EventFormProps) {
  const { user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<EventFormValues>({
    resolver: zodResolver(eventFormSchema) as any,
    defaultValues: {
      type: 'goal',
      minute: 0,
      teamId: '',
      isManual: false,
      playerId: '',
      manualPlayerName: '',
      assistPlayerId: '',
      substitutionReason: '',
    },
  });

  const selectedTeamId = form.watch('teamId');
  const teamPlayers = selectedTeamId === match?.homeTeam ? homePlayers : awayPlayers;
  const eventType = form.watch('type');
  const selectedPlayerId = form.watch('playerId');

  useEffect(() => {
    form.reset({
      ...form.getValues(),
      playerId: '',
      manualPlayerName: '',
      assistPlayerId: '',
    });
  }, [selectedTeamId, form]);

  const onSubmit = async (values: EventFormValues) => {
    if (!user || !match) return;
    setIsSubmitting(true);

    const player = teamPlayers.find(p => p.id === values.playerId);
    const assistPlayer = values.assistPlayerId ? teamPlayers.find(p => p.id === values.assistPlayerId) : null;

    const eventData: Partial<MatchEvent> = {
      type: values.type,
      minute: values.minute,
      teamId: values.teamId,
      playerId: values.isManual ? undefined : player?.id,
      playerName: values.isManual ? values.manualPlayerName : player?.name,
      assistPlayerId: assistPlayer ? assistPlayer.id : null,
      assistPlayerName: assistPlayer ? assistPlayer.name : null,
      substitutionReason: values.substitutionReason,
      timestamp: serverTimestamp(),
    };

    try {
      const eventsCollection = collection(
        db,
        `${matchDocPath || `clubs/${user.uid}/competitions/${match.competitionId}/rounds/${match.roundId}/matches/${match.id}`}/events`
      );
      await addDoc(eventsCollection, eventData);
      toast.success("イベントを追加しました。");
      form.reset();
    } catch (error) {
      console.error("Error adding event: ", error);
      toast.error("イベントの追加に失敗しました。");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={(form.handleSubmit as any)(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="type"
          render={({ field }) => (
            <FormItem>
              <FormLabel>種類</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="種類を選択" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="goal">ゴール</SelectItem>
                  <SelectItem value="yellow">イエローカード</SelectItem>
                  <SelectItem value="red">レッドカード</SelectItem>
                  <SelectItem value="sub_in">選手交代 (IN)</SelectItem>
                  <SelectItem value="sub_out">選手交代 (OUT)</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="minute"
          render={({ field }) => (
            <FormItem>
              <FormLabel>時間 (分)</FormLabel>
              <FormControl>
                <Input type="number" placeholder="例: 21" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="teamId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>チーム</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="チームを選択" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {match && <SelectItem value={match.homeTeam}>{match.homeTeamName}</SelectItem>}
                  {match && <SelectItem value={match.awayTeam}>{match.awayTeamName}</SelectItem>}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="isManual"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
              <div className="space-y-0.5">
                <FormLabel>選手を手入力する</FormLabel>
              </div>
              <FormControl>
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
            </FormItem>
          )}
        />

        {form.watch('isManual') ? (
          <FormField
            control={form.control}
            name="manualPlayerName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>選手名</FormLabel>
                <FormControl>
                  <Input placeholder="選手名を入力" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        ) : (
          <FormField
            control={form.control}
            name="playerId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>選手</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="選手を選択" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {teamPlayers.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        {eventType === 'goal' && !form.watch('isManual') && (
          <FormField
            control={form.control}
            name="assistPlayerId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>アシスト</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="アシスト選手を選択" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {teamPlayers.filter(p => p.id !== selectedPlayerId).map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormItem>
            )}
          />
        )}

        {eventType === 'sub_out' && (
          <FormField
            control={form.control}
            name="substitutionReason"
            render={({ field }) => (
              <FormItem>
                <FormLabel>交代理由</FormLabel>
                <FormControl>
                  <Input placeholder="例: 怪我" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        <Button type="submit" className="w-full mt-4" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          追加
        </Button>
      </form>
    </Form>
  );
}
