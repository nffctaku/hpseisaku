"use client";

import { useAuth } from '@/contexts/AuthContext';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { MatchDetails, TeamStat } from '@/types/match';
import { db } from '@/lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Trash2, PlusCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useEffect, useState } from 'react';

const formSchema = z.object({
  teamStats: z.array(
    z.object({
      id: z.string(),
      name: z.string().min(1, '必須'),
      homeValue: z.union([z.string(), z.number()]),
      awayValue: z.union([z.string(), z.number()]),
    })
  ).max(13, '最大13項目です。'), // 3 default + 10 custom
});

type FormValues = z.infer<typeof formSchema>;

interface MatchTeamStatsFormProps {
  match: MatchDetails;
  userId: string;
  competitionId: string;
  roundId: string;
}

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

export function MatchTeamStatsForm({ match, userId, competitionId, roundId }: MatchTeamStatsFormProps) {
  const [isSaving, setIsSaving] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      teamStats: [],
    },
  });

  const { fields, append, remove, replace } = useFieldArray({
    control: form.control,
    name: 'teamStats',
  });

  useEffect(() => {
    const existingStats = match.teamStats || [];
    const initialStats = defaultStats.map(ds => {
      const found = existingStats.find(es => es.id === ds.id);
      return found ? { ...ds, homeValue: found.homeValue, awayValue: found.awayValue } : { ...ds, homeValue: 0, awayValue: 0 };
    });

    const customStats = existingStats.filter(es => !defaultStats.some(ds => ds.id === es.id));
    replace([...initialStats, ...customStats]);
  }, [match, replace]);

  const handleAddStat = () => {
    if (fields.length >= 13) {
      toast.warning('スタッツ項目は最大13個です。');
      return;
    }
    append({ id: `custom_${Date.now()}`, name: '', homeValue: 0, awayValue: 0 });
  };

  const onSubmit = async (data: FormValues) => {
    if (!userId) return toast.error('ユーザー情報が見つかりません。');
    setIsSaving(true);
    try {
      const matchRef = doc(db, `clubs/${userId}/competitions/${competitionId}/rounds/${roundId}/matches/${match.id}`);
      await updateDoc(matchRef, { teamStats: data.teamStats });
      toast.success('試合スタッツを更新しました。');
    } catch (error) {
      console.error('Error updating team stats:', error);
      toast.error('更新に失敗しました。');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card className="mt-4 bg-white text-gray-900">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>チーム別データ</CardTitle>
        <div className="flex items-center gap-4">
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
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          {fields.map((field, index) => {
            const isDefault = defaultStats.some(ds => ds.id === field.id);
            const homeVal = parseFloat(String(form.watch(`teamStats.${index}.homeValue`)));
            const awayVal = parseFloat(String(form.watch(`teamStats.${index}.awayValue`)));
            const isPossession = field.id === 'possession' || field.id === 'passAccuracy';

            return (
              <div key={field.id} className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-4">
                <Controller
                  name={`teamStats.${index}.homeValue`}
                  control={form.control}
                  render={({ field }) => (
                    <Input
                      {...field}
                      type="text"
                      className={`text-center font-bold text-lg bg-white text-gray-900 ${homeVal > awayVal ? 'bg-red-500/80 text-white' : ''}`}
                    />
                  )}
                />
                
                <div className="text-center">
                {isDefault ? (
                  <span className="font-medium text-sm text-muted-foreground">{field.name}</span>
                ) : (
                  <Controller
                    name={`teamStats.${index}.name`}
                    control={form.control}
                    render={({ field }) => (
                      <Input
                        {...field}
                        placeholder="項目名"
                        className="text-center text-sm bg-white text-gray-900"
                      />
                    )}
                  />
                )}
                </div>

                <Controller
                  name={`teamStats.${index}.awayValue`}
                  control={form.control}
                  render={({ field }) => (
                    <Input
                      {...field}
                      type="text"
                      className={`text-center font-bold text-lg bg-white text-gray-900 ${awayVal > homeVal ? 'bg-red-500/80 text-white' : ''}`}
                    />
                  )}
                />

                <div className="flex items-center justify-center">
                  {!isDefault && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => remove(index)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}

          <div className="flex justify-between items-center pt-4">
            <Button type="button" variant="outline" size="sm" onClick={handleAddStat}>
              <PlusCircle className="mr-2 h-4 w-4" />
              項目を追加
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : '更新'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
