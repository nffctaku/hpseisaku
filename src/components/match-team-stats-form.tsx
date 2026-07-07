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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Trash2, PlusCircle, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const formSchema = z.object({
  teamStats: z.array(
    z.object({
      id: z.string(),
      name: z.string().min(1, '必須').max(8, '最大8文字です。'),
      homeValue: z.string(),
      awayValue: z.string(),
    })
  ).max(15, '最大15項目です。'), // 3 default + 10 custom
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
];

const presetStatIds = presetStats.map(s => s.id);
const lockedStatIds = [...defaultStatIds, ...presetStatIds];

export function MatchTeamStatsForm({ match, userId, competitionId, roundId, matchDocPath }: MatchTeamStatsFormProps) {
  const { user, ownerUid: ownerUidFromContext } = useAuth();
  const ownerUid = ownerUidFromContext || userId;
  const [isSaving, setIsSaving] = useState(false);
  const [isTemplateLoading, setIsTemplateLoading] = useState(false);
  const [isTemplateSaving, setIsTemplateSaving] = useState(false);
  const [templateStats, setTemplateStats] = useState<Array<{ id: string; name: string }> | null>(null);
  const [savedIndicatorVisible, setSavedIndicatorVisible] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<string>('');
  const [customStatName, setCustomStatName] = useState<string>('');
  const initializedMatchIdRef = useRef<string | null>(null);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autosaveReadyRef = useRef(false);
  const autosavingRef = useRef(false);
  const savedIndicatorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
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

  useEffect(() => {
    // Only rebuild when match ID changes, not on other updates
    const matchIdChanged = initializedMatchIdRef.current !== match.id;
    if (!matchIdChanged) return;

    const existingStats = match.teamStats || [];
    const statsFromTemplate = templateStats ?? [];
    const newStats = buildStatsForForm(existingStats, statsFromTemplate);
    
    replace(newStats);
    
    initializedMatchIdRef.current = match.id;
    autosaveReadyRef.current = true;
  }, [match.id, replace]);

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
    if (fields.length >= 15) {
      toast.warning('スタッツ項目は最大15個です。');
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

  const onSubmit = async (data: FormValues) => {
    if (!ownerUid) return toast.error('ユーザー情報が見つかりません。');
    setIsSaving(true);
    try {
      const matchRef = doc(
        db,
        matchDocPath || `clubs/${ownerUid}/competitions/${competitionId}/rounds/${roundId}/matches/${match.id}`
      );
      const normalizedForSave = data.teamStats.map((s) => ({
        id: s.id,
        name: s.name,
        homeValue: toNumberOrNull(s.homeValue),
        awayValue: toNumberOrNull(s.awayValue),
      }));
      await updateDoc(matchRef, { teamStats: normalizedForSave });
      toast.success('試合スタッツを更新しました。');
      form.reset(form.getValues(), { keepValues: true });

      setSavedIndicatorVisible(true);
      if (savedIndicatorTimerRef.current) clearTimeout(savedIndicatorTimerRef.current);
      savedIndicatorTimerRef.current = setTimeout(() => setSavedIndicatorVisible(false), 2000);
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
          const matchRef = doc(
            db,
            matchDocPath || `clubs/${ownerUid}/competitions/${competitionId}/rounds/${roundId}/matches/${match.id}`
          );
          const normalizedForSave = latest.data.teamStats.map((s) => ({
            id: s.id,
            name: s.name,
            homeValue: toNumberOrNull(s.homeValue),
            awayValue: toNumberOrNull(s.awayValue),
          }));
          await updateDoc(matchRef, { teamStats: normalizedForSave });
          form.reset(form.getValues(), { keepValues: true });

          setSavedIndicatorVisible(true);
          if (savedIndicatorTimerRef.current) clearTimeout(savedIndicatorTimerRef.current);
          savedIndicatorTimerRef.current = setTimeout(() => setSavedIndicatorVisible(false), 2000);
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
    <Card className="mt-4 bg-white text-gray-900">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle>チーム別データ</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="flex justify-between items-center mb-2">
            {match.homeTeamLogo && <img src={match.homeTeamLogo} alt={match.homeTeamName} className="w-8 h-8 object-contain" />}
            {match.awayTeamLogo && <img src={match.awayTeamLogo} alt={match.awayTeamName} className="w-8 h-8 object-contain" />}
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
                className="flex items-center gap-2"
              >
                {isReadOnly ? (
                  <span className="inline-flex items-center justify-center h-8 w-16 sm:w-24 px-2 text-center font-bold text-sm sm:text-lg bg-gray-200 text-gray-700 rounded-full cursor-default shrink-0 pointer-events-none">
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
                        className={`w-16 sm:w-24 text-center font-bold text-sm sm:text-lg bg-white text-gray-900 ${homeVal > awayVal ? 'bg-emerald-500/80 text-white' : ''}`}
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
                        className="w-full text-center text-xs bg-white text-gray-900 disabled:opacity-70"
                      />
                    )}
                  />
                </div>

                {isReadOnly ? (
                  <span className="inline-flex items-center justify-center h-8 w-16 sm:w-24 px-2 text-center font-bold text-sm sm:text-lg bg-gray-200 text-gray-700 rounded-full cursor-default shrink-0 pointer-events-none">
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
                        className={`w-16 sm:w-24 text-center font-bold text-sm sm:text-lg bg-white text-gray-900 ${awayVal > homeVal ? 'bg-emerald-500/80 text-white' : ''}`}
                      />
                    )}
                  />
                )}

                {!defaultStatIds.includes(statId) && (
                  <div className="flex items-center justify-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => remove(index)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                )}
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
                      <p className="text-xs text-orange-600 mt-1">※項目名が同じじゃないと正しく集計されません</p>
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
            <div className="text-xs text-muted-foreground">
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
          <p className="text-xs text-gray-500">今後の試合で保存したスタッツ項目が自動的に適用されます</p>
        </div>
      </CardContent>
    </Card>
  );
}
