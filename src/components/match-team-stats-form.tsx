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
import { Trash2, PlusCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useEffect, useRef, useState } from 'react';

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
  { id: 'possession', name: 'ボール支配率' },
  { id: 'passes', name: 'パス' },
  { id: 'passAccuracy', name: 'パス成功率' },
  { id: 'fouls', name: 'ファウル' },
  { id: 'yellowCards', name: 'イエローカード' },
  { id: 'redCards', name: 'レッドカード' },
  { id: 'offsides', name: 'オフサイド' },
  { id: 'corners', name: 'コーナーキック' },
];

export function MatchTeamStatsForm({ match, userId, competitionId, roundId, matchDocPath }: MatchTeamStatsFormProps) {
  const { user, ownerUid: ownerUidFromContext } = useAuth();
  const ownerUid = ownerUidFromContext || userId;
  const [isSaving, setIsSaving] = useState(false);
  const [isTemplateLoading, setIsTemplateLoading] = useState(false);
  const [isTemplateSaving, setIsTemplateSaving] = useState(false);
  const [templateStats, setTemplateStats] = useState<Array<{ id: string; name: string }> | null>(null);
  const initializedMatchIdRef = useRef<string | null>(null);

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
    if (templateStats === null) return;

    const sameMatchAlreadyInitialized = initializedMatchIdRef.current === match.id;
    if (sameMatchAlreadyInitialized && form.formState.isDirty) return;

    const existingStats = match.teamStats || [];
    const statsFromTemplate = templateStats;
    replace(buildStatsForForm(existingStats, statsFromTemplate));
    initializedMatchIdRef.current = match.id;
  }, [match, replace, templateStats, form.formState.isDirty]);

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
      toast.success('デフォルトに設定しました。');
    } catch (e) {
      console.error('Error saving teamStatsTemplate:', e);
      toast.error('デフォルトの保存に失敗しました。');
    } finally {
      setIsTemplateSaving(false);
    }
  };

  const handleAddStat = () => {
    if (fields.length >= 15) {
      toast.warning('スタッツ項目は最大15個です。');
      return;
    }
    append({ id: `custom_${Date.now()}`, name: '', homeValue: '', awayValue: '' });
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
    } catch (error) {
      console.error('Error updating team stats:', error);
      const code = typeof (error as any)?.code === 'string' ? (error as any).code : '';
      toast.error(`更新に失敗しました。${code ? ` (${code})` : ''}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card className="mt-4 bg-white text-gray-900">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle>チーム別データ</CardTitle>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
            <div className="flex items-center gap-2">
                {match.homeTeamLogo && <img src={match.homeTeamLogo} alt={match.homeTeamName} className="w-6 h-6 object-contain" />}
                <span className="font-semibold">{match.homeTeamName}</span>
            </div>
            <div className="flex items-center gap-2">
                {match.awayTeamLogo && <img src={match.awayTeamLogo} alt={match.awayTeamName} className="w-6 h-6 object-contain" />}
                <span className="font-semibold">{match.awayTeamName}</span>
            </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end pb-3">
          <Button
            type="button"
            variant="outline"
            onClick={handleSetAsDefault}
            disabled={isTemplateLoading || isTemplateSaving || isSaving}
          >
            {isTemplateSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            デフォルトに設定
          </Button>
        </div>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          {fields.map((field, index) => {
            const statId = (field as any).id as string;
            const homeVal = toComparable(String(form.watch(`teamStats.${index}.homeValue`) ?? ''));
            const awayVal = toComparable(String(form.watch(`teamStats.${index}.awayValue`) ?? ''));

            return (
              <div
                key={(field as any).fieldId}
                className="flex items-center gap-2"
              >
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
                
                <div className="flex-1 min-w-0">
                  <Controller
                    name={`teamStats.${index}.name`}
                    control={form.control}
                    render={({ field }) => (
                      <Input
                        {...field}
                        placeholder="項目名"
                        maxLength={8}
                        className="w-full text-center text-xs bg-white text-gray-900"
                      />
                    )}
                  />
                </div>

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
              </div>
            );
          })}

          <div className="flex justify-between items-center pt-4">
            <Button type="button" variant="outline" size="sm" onClick={handleAddStat}>
              <PlusCircle className="mr-2 h-4 w-4" />
              項目を追加
            </Button>
            <Button
              type="submit"
              disabled={isSaving}
              className="bg-emerald-600 text-white hover:bg-emerald-700"
            >
              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : '更新'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
