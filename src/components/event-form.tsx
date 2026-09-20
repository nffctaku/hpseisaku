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
  type: z.enum(['goal', 'card', 'substitution']),
  minute: z.coerce.number().min(0, "時間は0以上で入力してください。"),
  teamId: z.string().min(1, "チームを選択してください。"),
  playerId: z.string().optional(),
  manualPlayerName: z.string().optional(),
  assistPlayerId: z.string().optional(),
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
  const { user, ownerUid: ownerUidFromContext } = useAuth();
  const ownerUid = ownerUidFromContext || user?.uid;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [assistPlayerName, setAssistPlayerName] = useState('');
  const [mobilePicker, setMobilePicker] = useState<null | {
    title: string;
    value: string;
    options: Array<{ value: string; label: string }>;
    onSelect: (value: string) => void;
  }>(null);
  const [pressedPickerValue, setPressedPickerValue] = useState<string | null>(null);

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
    },
  });

  const selectedTeamId = form.watch('teamId');
  const eventType = form.watch('type');
  const selectedPlayerId = form.watch('playerId');
  const selectedAssistPlayerId = form.watch('assistPlayerId');

  // OG選択時は相手チームの選手を表示
  const isOGSelection = selectedAssistPlayerId === 'og';

  // 得点者用の選手リスト（OG選択時は相手チームの選手）
  const scorerTeamPlayers = isOGSelection 
    ? (selectedTeamId === match?.homeTeam ? awayPlayers : homePlayers)
    : (selectedTeamId === match?.homeTeam ? homePlayers : awayPlayers);

  const assistTeamPlayers = selectedTeamId === match?.homeTeam 
    ? (isOGSelection ? awayPlayers : homePlayers)
    : (isOGSelection ? homePlayers : awayPlayers);

  useEffect(() => {
    form.reset({
      ...form.getValues(),
      playerId: '',
      manualPlayerName: '',
      assistPlayerId: '',
    });
  }, [selectedTeamId, eventType, form]);

  const onSubmit = async (values: EventFormValues) => {
    if (!user || !ownerUid || !match) return;
    setIsSubmitting(true);

    const player = scorerTeamPlayers.find((p: Player) => p.id === values.playerId);
    
    const eventData: Partial<MatchEvent> = {
      type: values.type,
      minute: values.minute,
      teamId: values.teamId,
      // PK/OG選択時はmanualPlayerNameを使用
      playerId: values.playerId === 'pk' || values.playerId === 'og' || values.isManual ? undefined : player?.id,
      playerName: values.playerId === 'pk' ? `PK(${values.manualPlayerName || ''})` : values.playerId === 'og' ? `OG(${values.manualPlayerName || ''})` : values.isManual ? values.manualPlayerName : player?.name,
      assistPlayerId: values.assistPlayerId && values.assistPlayerId !== 'none' ? values.assistPlayerId : undefined,
      assistPlayerName: values.assistPlayerId && values.assistPlayerId !== 'none' ? assistTeamPlayers.find((p: Player) => p.id === values.assistPlayerId)?.name : undefined,
    };

    try {
      const eventsCollection = collection(
        db,
        `${matchDocPath || `clubs/${ownerUid}/competitions/${match.competitionId}/rounds/${match.roundId}/matches/${match.id}`}/events`
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
        {mobilePicker ? (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 px-4 sm:hidden" onClick={() => setMobilePicker(null)}>
            <div className="w-full max-w-md overflow-hidden rounded-[28px] bg-[#f4f4f6] shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex h-12 items-center justify-between border-b border-slate-300/80 bg-white px-4">
                <button type="button" className="text-base font-bold text-blue-500" onClick={() => setMobilePicker(null)}>
                  キャンセル
                </button>
                <div className="text-sm font-bold text-slate-500">{mobilePicker.title}</div>
                <button type="button" className="text-base font-bold text-blue-500" onClick={() => setMobilePicker(null)}>
                  完了
                </button>
              </div>
              <div className="relative h-[56vh] overflow-y-auto px-5 py-[22vh] [scroll-snap-type:y_mandatory]">
                {mobilePicker.options.map((option) => {
                  const isPressed = pressedPickerValue === option.value;
                  const isSelected = option.value === mobilePicker.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onPointerDown={() => setPressedPickerValue(option.value)}
                      onClick={() => {
                        setPressedPickerValue(option.value);
                        window.setTimeout(() => {
                          mobilePicker.onSelect(option.value);
                          setMobilePicker(null);
                          setPressedPickerValue(null);
                        }, 140);
                      }}
                      className={`block h-14 w-full scroll-mt-[22vh] [scroll-snap-align:center] truncate rounded-xl text-center text-[22px] font-bold leading-[56px] transition-colors ${isPressed ? 'bg-blue-500/25 text-blue-700' : isSelected ? 'bg-blue-500/10 text-blue-600' : 'text-slate-400'}`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ) : null}
        <FormField
          control={form.control}
          name="type"
          render={({ field }) => (
            <FormItem>
              <FormLabel>イベントタイプ</FormLabel>
              <button
                type="button"
                onClick={() => {
                  const options = [
                    { value: 'goal', label: 'ゴール' },
                    { value: 'card', label: 'カード' },
                    { value: 'substitution', label: '交代' },
                  ];
                  setMobilePicker({
                    title: 'イベントタイプを選択',
                    value: field.value,
                    options,
                    onSelect: field.onChange,
                  });
                }}
                className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-left text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              >
                {field.value === 'goal' ? 'ゴール' : field.value === 'card' ? 'カード' : field.value === 'substitution' ? '交代' : 'イベントを選択'}
              </button>
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
              <button
                type="button"
                onClick={() => {
                  const options = [
                    { value: match?.homeTeam || '', label: match?.homeTeamName || '' },
                    { value: match?.awayTeam || '', label: match?.awayTeamName || '' },
                  ];
                  setMobilePicker({
                    title: 'チームを選択',
                    value: field.value,
                    options,
                    onSelect: field.onChange,
                  });
                }}
                className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-left text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              >
                {field.value === match?.homeTeam ? match.homeTeamName : field.value === match?.awayTeam ? match.awayTeamName : 'チームを選択'}
              </button>
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
                <FormLabel>得点者</FormLabel>
                <button
                  type="button"
                  onClick={() => {
                    const options = [
                      { value: 'pk', label: 'PK(ペナルティキック)' },
                      { value: 'og', label: 'OG(オウンゴール)' },
                      { value: 'none', label: '未選択' },
                      ...scorerTeamPlayers.map((p: Player) => ({ value: p.id, label: p.name })),
                      { value: 'custom', label: 'その他(自由入力)' },
                    ];
                    setMobilePicker({
                      title: '得点者を選択',
                      value: field.value || '',
                      options,
                      onSelect: (val) => {
                        field.onChange(val);
                        if (val !== "custom") form.setValue('manualPlayerName', '');
                      },
                    });
                  }}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-left text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                >
                  {field.value === 'pk' ? 'PK(ペナルティキック)' : field.value === 'og' ? 'OG(オウンゴール)' : field.value === 'custom' ? form.watch('manualPlayerName') || 'その他(自由入力)' : field.value === 'none' || !field.value ? '得点者を選択' : scorerTeamPlayers.find((p: Player) => p.id === field.value)?.name || '得点者を選択'}
                </button>
                {field.value === 'custom' && (
                  <Input
                    value={form.watch('manualPlayerName') || ''}
                    onChange={(e) => form.setValue('manualPlayerName', e.target.value)}
                    placeholder="自由入力"
                    className="mt-2"
                  />
                )}
                {field.value === 'pk' && (
                  <div className="mt-2">
                    <div className="mb-1 text-xs text-slate-400">PK得点者</div>
                    <button
                      type="button"
                      onClick={() => {
                        const options = scorerTeamPlayers.map((p: Player) => ({ value: p.id, label: p.name }));
                        setMobilePicker({
                          title: 'PK得点者を選択',
                          value: '',
                          options,
                          onSelect: (val) => form.setValue('manualPlayerName', scorerTeamPlayers.find((p: Player) => p.id === val)?.name || ''),
                        });
                      }}
                      className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-left text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                    >
                      {form.watch('manualPlayerName') || 'PK得点者を選択'}
                    </button>
                  </div>
                )}
                {field.value === 'og' && (
                  <div className="mt-2">
                    <div className="mb-1 text-xs text-slate-400">OG選手</div>
                    <Input
                      value={form.watch('manualPlayerName') || ''}
                      onChange={(e) => form.setValue('manualPlayerName', e.target.value)}
                      placeholder="自由入力"
                      className="mt-2"
                    />
                  </div>
                )}
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
                <button
                  type="button"
                  disabled={field.value === 'pk' || field.value === 'og'}
                  onClick={() => {
                    const options = [
                      { value: 'none', label: '未選択' },
                      ...assistTeamPlayers.filter((p: Player) => p.id !== selectedPlayerId).map((p: Player) => ({ value: p.id, label: p.name })),
                      { value: 'custom', label: 'その他(自由入力)' },
                    ];
                    setMobilePicker({
                      title: 'アシストを選択',
                      value: field.value || '',
                      options,
                      onSelect: (val) => {
                        field.onChange(val);
                        if (val !== 'custom') setAssistPlayerName('');
                      },
                    });
                  }}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-left text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {field.value === 'none' ? '未選択' : field.value === 'custom' ? 'その他(自由入力)' : assistTeamPlayers.find((p: Player) => p.id === field.value)?.name || 'アシスト選手を選択'}
                </button>
                {field.value === 'custom' && (
                  <Input
                    value={assistPlayerName || ''}
                    onChange={(e) => setAssistPlayerName(e.target.value)}
                    placeholder="選手名を入力"
                    className="mt-2"
                  />
                )}
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
