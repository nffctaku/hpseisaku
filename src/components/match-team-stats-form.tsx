"use client";

import { useAuth } from '@/contexts/AuthContext';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { MatchDetails, TeamStat } from '@/types/match';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Trash2, PlusCircle, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StatsImageUploader } from '@/components/stats-image-uploader';
import { StatsImageAnalysisResult } from '@/lib/stats-image-parser';

const formSchema = z.object({
  teamStats: z.array(
    z.object({
      id: z.string(),
      name: z.string().min(1, '必須').max(8, '最大8文字です。'),
      homeValue: z.string(),
      awayValue: z.string(),
    })
  ),
});

type FormValues = z.infer<typeof formSchema>;

interface MatchTeamStatsFormProps {
  match: MatchDetails;
  userId: string;
  competitionId: string;
  roundId: string;
  matchDocPath?: string;
}

type TeamStatsTemplateDoc = {
  stats?: Array<{ id: string; name: string }>;
  customStats?: Array<{ id: string; name: string }>;
};

const defaultStats: Omit<TeamStat, 'homeValue' | 'awayValue'>[] = [
  { id: 'shots', name: 'シュート' },
  { id: 'shotsOnTarget', name: '枠内シュート' },
  { id: 'possession', name: '支配率' },
  { id: 'yellowCards', name: 'イエロー' },
  { id: 'redCards', name: 'レッド' },
  { id: 'cornerKicks', name: 'コーナーキック' },
];

const defaultStatIds = defaultStats.map(s => s.id);

const presetStats = [
  { id: 'passes', name: 'パス' },
  { id: 'passAccuracy', name: 'パス成功率' },
  { id: 'fouls', name: 'ファウル' },
  { id: 'offsides', name: 'オフサイド' },
  { id: 'ballRecovery', name: 'ボール奪取' },
  { id: 'expectedGoals', name: 'ゴール期待値' },
  { id: 'tackles', name: 'タックル' },
  { id: 'tacklesWon', name: 'タックル成功' },
  { id: 'interceptions', name: 'インターセプト' },
  { id: 'freeKicks', name: 'フリーキック' },
  { id: 'penaltyKicks', name: 'PK' },
  { id: 'dribbleSuccessRate', name: 'ドリブル成功率' },
  { id: 'shotAccuracy', name: 'シュート精度' },
];

const aiReadableStatNames = [
  'シュート',
  '支配率',
  'イエロー',
  'コーナーキック',
  ...presetStats.map((stat) => stat.name),
];

const presetStatIds = presetStats.map(s => s.id);
const lockedStatIds = [...defaultStatIds, ...presetStatIds];

export function MatchTeamStatsForm({ match, userId, competitionId, roundId, matchDocPath }: MatchTeamStatsFormProps) {
  const { user, ownerUid: ownerUidFromContext } = useAuth();
  const ownerUid = ownerUidFromContext || userId;
  const maxTeamStats = user?.plan === 'pro' ? 30 : 15;
  const [isSaving, setIsSaving] = useState(false);
  const [isTemplateLoading, setIsTemplateLoading] = useState(false);
  const [isTemplateSaving, setIsTemplateSaving] = useState(false);
  const [templateStats, setTemplateStats] = useState<Array<{ id: string; name: string }> | null>(null);
  const [savedIndicatorVisible, setSavedIndicatorVisible] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<string>('');
  const [customStatName, setCustomStatName] = useState<string>('');

  // Handle image analysis result
  const handleAnalysisComplete = async (result: StatsImageAnalysisResult) => {
    console.log('[MatchTeamStatsForm] Analysis result received:', result);
    console.log('[MatchTeamStatsForm] Detailed team_stats:', JSON.stringify(result.team_stats, null, 2));
    
    const currentStats = form.getValues('teamStats');
    const updatedStats = [...currentStats];

    console.log('[MatchTeamStatsForm] Current stats:', currentStats);

    // Update form fields based on analysis result
    updatedStats.forEach((stat) => {
      console.log('[MatchTeamStatsForm] Processing stat:', stat.name, 'homeValue:', stat.homeValue, 'awayValue:', stat.awayValue);
      
      // Map Japanese stat names to API fields
      let values: { home: number | null; away: number | null } | null = null;
      let apiField: string | null = null;

      switch (stat.name.trim()) {
        case 'シュート':
          apiField = 'team_stats.shots';
          values = result.team_stats.shots;
          break;
        case '支配率':
        case 'ポゼッション':
          apiField = 'team_stats.possession';
          values = result.team_stats.possession;
          break;
        case 'イエロー':
          apiField = 'team_stats.yellow_cards';
          values = result.team_stats.yellow_cards;
          break;
        case 'コーナーキック':
          apiField = 'team_stats.corners';
          values = result.team_stats.corners;
          break;
        case 'パス':
          apiField = 'team_stats.passes';
          values = result.team_stats.passes;
          break;
        case 'パス成功率':
          apiField = 'percentage_stats.pass_accuracy';
          values = result.percentage_stats.pass_accuracy;
          break;
        case 'ファウル':
          apiField = 'team_stats.fouls_committed';
          values = result.team_stats.fouls_committed;
          break;
        case 'ゴール期待値':
          apiField = 'team_stats.expected_goals';
          values = result.team_stats.expected_goals;
          break;
        case 'ボール奪取':
          apiField = 'team_stats.ball_recovery_time_sec';
          values = result.team_stats.ball_recovery_time_sec;
          break;
        case 'タックル':
          apiField = 'team_stats.tackles';
          values = result.team_stats.tackles;
          break;
        case 'タックル成功':
          apiField = 'team_stats.tackles_won';
          values = result.team_stats.tackles_won;
          break;
        case 'インターセプト':
          apiField = 'team_stats.interceptions';
          values = result.team_stats.interceptions;
          break;
        case 'オフサイド':
          apiField = 'team_stats.offsides';
          values = result.team_stats.offsides;
          break;
        case 'フリーキック':
          apiField = 'team_stats.free_kicks';
          values = result.team_stats.free_kicks;
          break;
        case 'PK':
          apiField = 'team_stats.penalty_kicks';
          values = result.team_stats.penalty_kicks;
          break;
        case 'ドリブル成功率':
          apiField = 'percentage_stats.dribble_success_rate';
          values = result.percentage_stats.dribble_success_rate;
          break;
        case 'シュート精度':
          apiField = 'percentage_stats.shot_accuracy';
          values = result.percentage_stats.shot_accuracy;
          break;
      }

      if (values) {
        const homeValue = values.home;
        const awayValue = values.away;
        
        console.log(`[MatchTeamStatsForm] API field: ${apiField}, home: ${homeValue}, away: ${awayValue}`);
        
        if (homeValue !== null) {
          stat.homeValue = homeValue.toString();
          console.log(`[MatchTeamStatsForm] Updated ${stat.name} homeValue to: ${stat.homeValue}`);
        }
        if (awayValue !== null) {
          stat.awayValue = awayValue.toString();
          console.log(`[MatchTeamStatsForm] Updated ${stat.name} awayValue to: ${stat.awayValue}`);
        }
      }
    });

    const statsWithEventCards = applyEventCardStats(updatedStats);

    console.log('[MatchTeamStatsForm] Final updated stats:', statsWithEventCards);
    
    form.setValue('teamStats', statsWithEventCards, {
      shouldDirty: true,
      shouldTouch: true,
      shouldValidate: true,
    });

    try {
      await saveTeamStats(statsWithEventCards);
      form.reset({ teamStats: statsWithEventCards }, { keepValues: true });
      toast.success('読み取り完了・保存しました', {
        description: '念のため数値をご確認ください（AIによる自動読み取りのため、まれに誤読がある場合があります）',
      });
    } catch (error) {
      console.error('Error saving analyzed team stats:', error);
      toast.error('フォームには反映しましたが、保存に失敗しました');
    }
  };
  const initializedMatchIdRef = useRef<string | null>(null);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autosaveReadyRef = useRef(false);
  const autosavingRef = useRef(false);
  const savedIndicatorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(
      formSchema.refine((data) => data.teamStats.length <= maxTeamStats, {
        path: ['teamStats'],
        message: `最大${maxTeamStats}項目です。`,
      })
    ),
    defaultValues: {
      teamStats: [],
    },
  });

  const { fields, append, remove, replace } = useFieldArray({
    control: form.control,
    name: 'teamStats',
    keyName: 'fieldId',
  });

  useEffect(() => {
    if (!ownerUid || !competitionId) return;
    setIsTemplateLoading(true);
    (async () => {
      try {
        const templateRef = doc(db, `clubs/${ownerUid}/competitions/${competitionId}/settings`, 'teamStatsTemplate');
        const snap = await getDoc(templateRef);
        if (!snap.exists()) {
          setTemplateStats([]);
          return;
        }
        const data = snap.data() as Partial<TeamStatsTemplateDoc>;
        const statsFromNew = Array.isArray(data.stats)
          ? data.stats
              .filter((s) => s && typeof (s as any).name === 'string')
              .map((s) => ({
                id: typeof (s as any).id === 'string' && (s as any).id ? (s as any).id : `custom_${Date.now()}_${Math.random().toString(16).slice(2)}`,
                name: String((s as any).name).slice(0, 8),
              }))
          : [];

        if (statsFromNew.length > 0) {
          setTemplateStats(statsFromNew);
          return;
        }

        const customStats = Array.isArray(data.customStats)
          ? data.customStats
              .filter((s) => s && typeof (s as any).name === 'string')
              .map((s) => ({
                id: typeof (s as any).id === 'string' && (s as any).id ? (s as any).id : `custom_${Date.now()}_${Math.random().toString(16).slice(2)}`,
                name: String((s as any).name).slice(0, 8),
              }))
          : [];

        setTemplateStats([...defaultStats.map((ds) => ({ id: ds.id, name: ds.name })), ...customStats]);
      } catch (e) {
        console.error('Error loading teamStatsTemplate:', e);
        setTemplateStats([]);
      } finally {
        setIsTemplateLoading(false);
      }
    })();
  }, [ownerUid, competitionId]);

  const normalizeExistingStats = (existingStats: TeamStat[]) =>
    existingStats
      .filter((s) => s && typeof s.id === 'string')
      .map((s) => ({
        id: s.id,
        name: String((s as any).name ?? '').slice(0, 8),
        homeValue: (s as any).homeValue == null ? '' : String((s as any).homeValue),
        awayValue: (s as any).awayValue == null ? '' : String((s as any).awayValue),
      }));

  const buildStatsForForm = (existingStats: TeamStat[], template: Array<{ id: string; name: string }>) => {
    const normalizedExisting = normalizeExistingStats(existingStats);
    if (normalizedExisting.length > 0) return normalizedExisting;

    if (template.length > 0) {
      return template.map((s) => ({ id: s.id, name: s.name, homeValue: '', awayValue: '' }));
    }

    return defaultStats.map((ds) => ({ id: ds.id, name: ds.name, homeValue: '', awayValue: '' }));
  };

  const toNumberOrNull = (v: string): number | null => {
    const s = String(v ?? '').trim();
    if (!s) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  };

  const toComparable = (v: string): number => {
    const n = toNumberOrNull(v);
    return typeof n === 'number' ? n : 0;
  };

  const getEventCardCounts = () => {
    const counts = {
      yellow: { home: 0, away: 0, hasEvents: false },
      red: { home: 0, away: 0, hasEvents: false },
    };

    for (const event of match.events ?? []) {
      if (event.type !== 'card') continue;
      const side = event.teamId === match.homeTeam ? 'home' : event.teamId === match.awayTeam ? 'away' : null;
      if (!side) continue;

      if (event.cardColor === 'yellow') {
        counts.yellow[side] += 1;
        counts.yellow.hasEvents = true;
      }
      if (event.cardColor === 'red') {
        counts.red[side] += 1;
        counts.red.hasEvents = true;
      }
    }

    return counts;
  };

  const applyEventCardStats = (stats: FormValues['teamStats']) => {
    const cardCounts = getEventCardCounts();

    return stats.map((stat) => {
      if ((stat.id === 'yellowCards' || stat.name === 'イエロー') && cardCounts.yellow.hasEvents) {
        return {
          ...stat,
          homeValue: String(cardCounts.yellow.home),
          awayValue: String(cardCounts.yellow.away),
        };
      }

      if ((stat.id === 'redCards' || stat.name === 'レッド') && cardCounts.red.hasEvents) {
        return {
          ...stat,
          homeValue: String(cardCounts.red.home),
          awayValue: String(cardCounts.red.away),
        };
      }

      return stat;
    });
  };

  useEffect(() => {
    // Only rebuild when match ID changes, not on other updates
    const matchIdChanged = initializedMatchIdRef.current !== match.id;
    if (!matchIdChanged) return;

    const existingStats = match.teamStats || [];
    const statsFromTemplate = templateStats ?? [];
    const newStats = applyEventCardStats(buildStatsForForm(existingStats, statsFromTemplate));
    
    replace(newStats);
    
    initializedMatchIdRef.current = match.id;
    autosaveReadyRef.current = true;
  }, [match.id, replace]);

  useEffect(() => {
    if (!autosaveReadyRef.current) return;

    const currentStats = form.getValues('teamStats');
    const updatedStats = applyEventCardStats(currentStats);
    const hasChanged = updatedStats.some((stat, index) => {
      const current = currentStats[index];
      return current && (current.homeValue !== stat.homeValue || current.awayValue !== stat.awayValue);
    });

    if (hasChanged) {
      form.setValue('teamStats', updatedStats, { shouldDirty: true });
    }
  }, [match.events, match.homeTeam, match.awayTeam, form]);

  const handleSetAsDefault = async () => {
    if (!ownerUid || !competitionId) return toast.error('ユーザー情報が見つかりません。');
    setIsTemplateSaving(true);
    try {
      const current = form.getValues('teamStats');
      const stats = current
        .map((s) => ({
          id: typeof s.id === 'string' && s.id ? s.id : `custom_${Date.now()}_${Math.random().toString(16).slice(2)}`,
          name: String((s as any).name || '').slice(0, 8),
        }))
        .filter((s) => s.name.trim().length > 0);

      const templateRef = doc(db, `clubs/${ownerUid}/competitions/${competitionId}/settings`, 'teamStatsTemplate');
      await setDoc(templateRef, { stats } satisfies TeamStatsTemplateDoc, { merge: true });
      setTemplateStats(stats);
      toast.success('スタッツ項目を保存しました。');
    } catch (e) {
      console.error('Error saving teamStatsTemplate:', e);
      toast.error('デフォルトの保存に失敗しました。');
    } finally {
      setIsTemplateSaving(false);
    }
  };

  useEffect(() => {
    return () => {
      if (savedIndicatorTimerRef.current) {
        clearTimeout(savedIndicatorTimerRef.current);
        savedIndicatorTimerRef.current = null;
      }
    };
  }, []);

  const handleAddStat = () => {
    if (fields.length >= maxTeamStats) {
      toast.warning(`スタッツ項目は最大${maxTeamStats}個です。`);
      return;
    }
    setSelectedPreset('');
    setCustomStatName('');
    setShowAddDialog(true);
  };

  const handleConfirmAddStat = () => {
    if (selectedPreset === 'custom') {
      const name = customStatName.trim();
      if (!name) {
        toast.error('項目名を入力してください。');
        return;
      }
      if (name.length > 8) {
        toast.error('項目名は最大8文字です。');
        return;
      }
      // Check for duplicates
      const existingNames = fields.map((f) => (f as any).name);
      if (existingNames.includes(name)) {
        toast.error('この項目名は既に追加されています。');
        return;
      }
      append({ id: `custom_${Date.now()}`, name, homeValue: '', awayValue: '' });
    } else if (selectedPreset) {
      const preset = presetStats.find((p) => p.id === selectedPreset);
      if (preset) {
        // Check for duplicates
        const existingNames = fields.map((f) => (f as any).name);
        if (existingNames.includes(preset.name)) {
          toast.error('この項目名は既に追加されています。');
          return;
        }
        append({ id: preset.id, name: preset.name, homeValue: '', awayValue: '' });
      }
    }
    setShowAddDialog(false);
    setSelectedPreset('');
    setCustomStatName('');
  };

  const getAvailablePresets = () => {
    const existingNames = fields.map((f) => (f as any).name);
    return presetStats.filter((p) => !existingNames.includes(p.name));
  };

  const saveTeamStats = async (teamStats: FormValues['teamStats']) => {
    if (!ownerUid) throw new Error('ユーザー情報が見つかりません。');

    const matchRef = doc(
      db,
      matchDocPath || `clubs/${ownerUid}/competitions/${competitionId}/rounds/${roundId}/matches/${match.id}`
    );
    const normalizedForSave = teamStats.map((s) => ({
      id: s.id,
      name: s.name,
      homeValue: toNumberOrNull(s.homeValue),
      awayValue: toNumberOrNull(s.awayValue),
    }));

    await updateDoc(matchRef, { teamStats: normalizedForSave });

    setSavedIndicatorVisible(true);
    if (savedIndicatorTimerRef.current) clearTimeout(savedIndicatorTimerRef.current);
    savedIndicatorTimerRef.current = setTimeout(() => setSavedIndicatorVisible(false), 2000);
  };

  const onSubmit = async (data: FormValues) => {
    if (!ownerUid) return toast.error('ユーザー情報が見つかりません。');
    setIsSaving(true);
    try {
      await saveTeamStats(data.teamStats);
      toast.success('試合スタッツを更新しました。');
      form.reset(form.getValues(), { keepValues: true });
    } catch (error) {
      console.error('Error updating team stats:', error);
      const code = typeof (error as any)?.code === 'string' ? (error as any).code : '';
      toast.error(`更新に失敗しました。${code ? ` (${code})` : ''}`);
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    const sub = form.watch(() => {
      if (!autosaveReadyRef.current) return;
      if (!form.formState.isDirty) return;
      if (isSaving || autosavingRef.current || isTemplateLoading || isTemplateSaving) return;
      if (!ownerUid) return;

      const parsed = formSchema.safeParse(form.getValues());
      if (!parsed.success) return;

      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = setTimeout(async () => {
        if (!autosaveReadyRef.current) return;
        if (!form.formState.isDirty) return;
        if (isSaving || autosavingRef.current || isTemplateLoading || isTemplateSaving) return;

        const latest = formSchema.safeParse(form.getValues());
        if (!latest.success) return;

        autosavingRef.current = true;
        try {
          await saveTeamStats(latest.data.teamStats);
          form.reset(form.getValues(), { keepValues: true });
        } catch (e) {
          console.error('Error auto-saving team stats:', e);
        } finally {
          autosavingRef.current = false;
        }
      }, 1500);
    });

    return () => {
      sub.unsubscribe();
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
    };
  }, [form, ownerUid, competitionId, roundId, match.id, matchDocPath, isSaving, isTemplateLoading, isTemplateSaving]);

  return (
    <Card className="mt-4 overflow-hidden rounded-3xl border-slate-700/70 bg-slate-950 text-slate-100 shadow-[0_18px_45px_rgba(15,23,42,0.35)]">
      <CardContent className="px-4 py-5 sm:px-6">
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <StatsImageUploader onAnalysisComplete={handleAnalysisComplete} embedded />
          <div className="grid grid-cols-[4rem_1fr_4rem_1.75rem] items-center gap-2 px-1 sm:grid-cols-[6rem_1fr_6rem_1.75rem]">
            <div className="flex justify-center">
              {match.homeTeamLogo && <img src={match.homeTeamLogo} alt={match.homeTeamName} className="h-8 w-8 object-contain" />}
            </div>
            <div />
            <div className="flex justify-center">
              {match.awayTeamLogo && <img src={match.awayTeamLogo} alt={match.awayTeamName} className="h-8 w-8 object-contain" />}
            </div>
            <div />
          </div>
          {fields.map((field, index) => {
            const statId = (field as any).id as string;
            const statName = (field as any).name as string;
            const homeVal = toComparable(String(form.watch(`teamStats.${index}.homeValue`) ?? ''));
            const awayVal = toComparable(String(form.watch(`teamStats.${index}.awayValue`) ?? ''));
            const isReadOnly = statId === 'yellowCards' || statId === 'redCards' || statName === 'イエロー' || statName === 'レッド';

            return (
              <div
                key={(field as any).fieldId}
                className="grid grid-cols-[4rem_1fr_4rem_1.75rem] items-center gap-2 sm:grid-cols-[6rem_1fr_6rem_1.75rem]"
              >
                {isReadOnly ? (
                  <span className="inline-flex h-8 w-16 shrink-0 cursor-default items-center justify-center rounded-xl border border-slate-700 bg-slate-800 px-2 text-center text-sm font-bold text-slate-200 pointer-events-none sm:w-24 sm:text-lg">
                    {form.watch(`teamStats.${index}.homeValue`) ?? ''}
                  </span>
                ) : (
                  <Controller
                    name={`teamStats.${index}.homeValue`}
                    control={form.control}
                    render={({ field }) => (
                      <Input
                        value={typeof field.value === 'string' ? field.value : ''}
                        onChange={(e) => field.onChange(e.target.value)}
                        type="text"
                        className={`w-16 border-slate-700 bg-slate-900 text-center text-sm font-bold text-slate-100 placeholder:text-slate-500 focus-visible:ring-emerald-400 sm:w-24 sm:text-lg ${homeVal > awayVal ? 'border-emerald-400 bg-emerald-500/90 text-white' : ''}`}
                      />
                    )}
                  />
                )}
                
                <div className="flex-1 min-w-0">
                  <Controller
                    name={`teamStats.${index}.name`}
                    control={form.control}
                    render={({ field }) => (
                      <Input
                        {...field}
                        placeholder="項目名"
                        maxLength={8}
                        disabled={lockedStatIds.includes(statId)}
                        className="w-full border-slate-700 bg-slate-900 text-center text-xs font-semibold text-slate-200 placeholder:text-slate-500 disabled:opacity-80"
                      />
                    )}
                  />
                </div>

                {isReadOnly ? (
                  <span className="inline-flex h-8 w-16 shrink-0 cursor-default items-center justify-center rounded-xl border border-slate-700 bg-slate-800 px-2 text-center text-sm font-bold text-slate-200 pointer-events-none sm:w-24 sm:text-lg">
                    {form.watch(`teamStats.${index}.awayValue`) ?? ''}
                  </span>
                ) : (
                  <Controller
                    name={`teamStats.${index}.awayValue`}
                    control={form.control}
                    render={({ field }) => (
                      <Input
                        value={typeof field.value === 'string' ? field.value : ''}
                        onChange={(e) => field.onChange(e.target.value)}
                        type="text"
                        className={`w-16 border-slate-700 bg-slate-900 text-center text-sm font-bold text-slate-100 placeholder:text-slate-500 focus-visible:ring-emerald-400 sm:w-24 sm:text-lg ${awayVal > homeVal ? 'border-emerald-400 bg-emerald-500/90 text-white' : ''}`}
                      />
                    )}
                  />
                )}

                <div className="flex items-center justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => remove(index)}
                    className="h-5 w-5 shrink-0 rounded-md p-0"
                  >
                    <Trash2 className="h-3 w-3 text-red-300" />
                  </Button>
                </div>
              </div>
            );
          })}

          <div className="flex flex-col items-center gap-2 pt-4">
            <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
              <DialogTrigger asChild>
                <Button type="button" variant="outline" size="sm" onClick={handleAddStat} className="bg-green-500 text-white hover:bg-green-600 border-green-500">
                  <PlusCircle className="mr-2 h-4 w-4" />
                  項目を追加
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>項目を追加</DialogTitle>
                </DialogHeader>
                <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
                  <p className="font-semibold">画像解析で自動反映できる項目</p>
                  <p className="mt-1 leading-relaxed">{aiReadableStatNames.join('、')}</p>
                  <p className="mt-1 text-orange-700">※自由入力の項目は、上記と完全一致しない場合は自動反映されません。</p>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium">項目を選択</label>
                    <Select value={selectedPreset} onValueChange={setSelectedPreset}>
                      <SelectTrigger>
                        <SelectValue placeholder="項目を選択してください" />
                      </SelectTrigger>
                      <SelectContent>
                        {getAvailablePresets().map((preset) => (
                          <SelectItem key={preset.id} value={preset.id}>
                            {preset.name}
                          </SelectItem>
                        ))}
                        <SelectItem value="custom">その他(自由入力)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {selectedPreset === 'custom' && (
                    <div>
                      <label className="text-sm font-medium">項目名</label>
                      <Input
                        value={customStatName}
                        onChange={(e) => setCustomStatName(e.target.value)}
                        placeholder="項目名を入力"
                        maxLength={8}
                        className="mt-1"
                      />
                      <p className="text-xs text-orange-600 mt-1">※画像解析で自動反映するには、案内の対応項目名と完全一致させてください</p>
                    </div>
                  )}
                  <div className="flex justify-end">
                    <Button onClick={handleConfirmAddStat} disabled={!selectedPreset} className="bg-green-500 text-white hover:bg-green-600">
                      追加
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
            <div className="text-xs text-slate-400">
              {savedIndicatorVisible ? '自動保存しました' : null}
            </div>
          </div>
        </form>
        <div className="flex flex-col items-center gap-2 pt-3">
          <Button
            type="button"
            variant="outline"
            onClick={handleSetAsDefault}
            disabled={isTemplateLoading || isTemplateSaving || isSaving}
            className="bg-orange-500 text-white hover:bg-orange-600 border-orange-500"
          >
            {isTemplateSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            スタッツ項目を保存する
          </Button>
          <p className="text-xs text-slate-400">今後の試合で保存したスタッツ項目が自動的に適用されます</p>
        </div>
      </CardContent>
    </Card>
  );
}
