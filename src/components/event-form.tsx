"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/contexts/AuthContext";
import { useCareer } from "@/contexts/CareerContext";
import { db } from "@/lib/firebase";
import { Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Player, MatchDetails, MatchEvent } from '@/types/match';
import { appendMatchEvent } from '@/lib/match-event-sync';
import { MobilePickerModal, type PickerRequest } from '@/components/mobile-picker-modal';

const eventFormSchema = z.object({
  type: z.enum(['goal', 'card', 'substitution']),
  // アディショナルタイム表現（"45+2"）も許容する
  minute: z.union([
    z.coerce.number().min(0, "時間は0以上で入力してください。"),
    z.string().regex(/^\d{1,3}\+\d{1,2}$/, "例: 45+2 の形式で入力してください。"),
  ]),
  teamId: z.string().min(1, "チームを選択してください。"),
  playerId: z.string().optional(),
  manualPlayerName: z.string().optional(),
  assistPlayerId: z.string().optional(),
  isManual: z.boolean().default(false),
  outPlayerId: z.string().optional(),
  inPlayerId: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.type === 'substitution') {
    if (!data.outPlayerId && !data.inPlayerId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "OUT/IN選手を選択してください。",
        path: ["outPlayerId"],
      });
    }
    return;
  }
  if (data.isManual ? !(data.manualPlayerName && data.manualPlayerName.length > 0) : !(data.playerId && data.playerId.length > 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "選手を選択または入力してください。",
      path: ["playerId"],
    });
  }
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
  const { activeCareer } = useCareer();
  // matchDocPath 未指定時のフォールバックもアクティブCareerのclubUidを使う（auth uid は旧Careerルートを指すため不可）
  const ownerUid = activeCareer?.clubUid || user?.uid;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [assistPlayerName, setAssistPlayerName] = useState('');
  const [mobilePicker, setMobilePicker] = useState<PickerRequest | null>(null);

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

  // 交代イベント用: 選択チームのスタメン/控え（match.playerStatsのroleで判定）
  const rawTeamPlayers = selectedTeamId === match?.homeTeam ? homePlayers : awayPlayers;
  const teamStats = (match?.playerStats || []).filter((ps: any) => ps?.teamId === selectedTeamId && ps?.playerId);
  const starterIds = teamStats.filter((ps: any) => (ps.role ?? 'starter') === 'starter').map((ps: any) => ps.playerId);
  const subIds = teamStats.filter((ps: any) => ps.role === 'sub').map((ps: any) => ps.playerId);
  const starterPlayers = starterIds.length > 0 ? rawTeamPlayers.filter((p) => starterIds.includes(p.id)) : rawTeamPlayers;
  const subPlayers = subIds.length > 0 ? rawTeamPlayers.filter((p) => subIds.includes(p.id)) : rawTeamPlayers;

  useEffect(() => {
    form.reset({
      ...form.getValues(),
      playerId: '',
      manualPlayerName: '',
      assistPlayerId: '',
      outPlayerId: '',
      inPlayerId: '',
    });
  }, [selectedTeamId, eventType, form]);

  const onSubmit = async (values: EventFormValues) => {
    if (!user || !ownerUid || !match) return;
    setIsSubmitting(true);

    const player = scorerTeamPlayers.find((p: Player) => p.id === values.playerId);
    const outPlayer = rawTeamPlayers.find((p: Player) => p.id === values.outPlayerId);
    const inPlayer = rawTeamPlayers.find((p: Player) => p.id === values.inPlayerId);

    const eventData: MatchEvent & { id: string } = {
      id: crypto.randomUUID(),
      type: values.type,
      minute: values.minute,
      teamId: values.teamId,
      // PK/OG選択時はmanualPlayerNameを使用
      playerId: values.playerId === 'pk' || values.playerId === 'og' || values.isManual ? undefined : player?.id,
      playerName: values.playerId === 'pk' ? `PK(${values.manualPlayerName || ''})` : values.playerId === 'og' ? `OG(${values.manualPlayerName || ''})` : values.isManual ? values.manualPlayerName : player?.name,
      assistPlayerId: values.assistPlayerId && values.assistPlayerId !== 'none' ? values.assistPlayerId : undefined,
      assistPlayerName: values.assistPlayerId && values.assistPlayerId !== 'none' ? assistTeamPlayers.find((p: Player) => p.id === values.assistPlayerId)?.name : undefined,
      outPlayerId: values.outPlayerId || undefined,
      outPlayerName: outPlayer?.name,
      inPlayerId: values.inPlayerId || undefined,
      inPlayerName: inPlayer?.name,
    };

    try {
      const basePath = matchDocPath || `clubs/${ownerUid}/competitions/${match.competitionId}/rounds/${match.roundId}/matches/${match.id}`;
      await appendMatchEvent(db, basePath, eventData);
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
        <MobilePickerModal picker={mobilePicker} onClose={() => setMobilePicker(null)} mobileOnly />
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
                <Input type="text" inputMode="numeric" placeholder="例: 21 または 45+2" {...field} />
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

        {eventType === 'substitution' ? (
          <>
            <FormField
              control={form.control}
              name="outPlayerId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>OUT選手</FormLabel>
                  <button
                    type="button"
                    onClick={() => {
                      setMobilePicker({
                        title: 'OUT選手を選択',
                        value: field.value || '',
                        options: [
                          { value: '', label: '未選択' },
                          ...starterPlayers.map((p: Player) => ({ value: p.id, label: p.name })),
                        ],
                        onSelect: field.onChange,
                      });
                    }}
                    className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-left text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                  >
                    {starterPlayers.find((p: Player) => p.id === field.value)?.name || 'OUT選手を選択'}
                  </button>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="inPlayerId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>IN選手</FormLabel>
                  <button
                    type="button"
                    onClick={() => {
                      setMobilePicker({
                        title: 'IN選手を選択',
                        value: field.value || '',
                        options: [
                          { value: '', label: '未選択' },
                          ...subPlayers.map((p: Player) => ({ value: p.id, label: p.name })),
                        ],
                        onSelect: field.onChange,
                      });
                    }}
                    className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-left text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                  >
                    {subPlayers.find((p: Player) => p.id === field.value)?.name || 'IN選手を選択'}
                  </button>
                  <FormMessage />
                </FormItem>
              )}
            />
          </>
        ) : (
        <>
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
        </>
        )}

        <Button type="submit" className="w-full mt-4" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          追加
        </Button>
      </form>
    </Form>
  );
}
