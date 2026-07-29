"use client";

import { useState, useEffect, useRef, type ChangeEvent } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { doc, getDoc, collection, writeBatch, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useFieldArray } from 'react-hook-form';
import { format, parse, isValid } from 'date-fns';
import { cn } from '@/lib/utils';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

// Define structures
interface Team {
  id: string;
  name: string;
}

interface Competition {
  id: string;
  name: string;
  season: string;
  teams?: Team[];
}

const fixtureSchema = z.object({
  matchDate: z.any().optional(), // Allow any type for matchDate initially
  homeTeam: z.string(),
  awayTeam: z.string(),
  homeTeamId: z.string(),
  awayTeamId: z.string(),
  scoreHome: z.coerce.number().int().min(0).optional(),
  scoreAway: z.coerce.number().int().min(0).optional(),
});

const scheduleSchema = z.object({
  fixtures: z.array(fixtureSchema),
});

type ScheduleFormValues = z.infer<typeof scheduleSchema>;

function parseCSV(text: string): Record<string, string>[] {
  const rows: Record<string, string>[] = [];
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '');
  if (lines.length === 0) return rows;

  const parseLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      const next = line[i + 1];
      if (inQuotes) {
        if (c === '"') {
          if (next === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          current += c;
        }
      } else {
        if (c === '"') {
          inQuotes = true;
        } else if (c === ',') {
          result.push(current);
          current = '';
        } else {
          current += c;
        }
      }
    }
    result.push(current);
    return result;
  };

  const headers = parseLine(lines[0]).map((h) => h.trim().replace(/^\uFEFF/, ''));
  for (let i = 1; i < lines.length; i++) {
    const values = parseLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = (values[idx] ?? '').trim();
    });
    rows.push(row);
  }
  return rows;
}

function normalizeDate(raw: string): string | null {
  if (!raw) return null;
  const formats = ['yyyy-MM-dd', 'yyyy/MM/dd', 'M/d/yyyy', 'MM/dd/yyyy', 'yyyy年M月d日'];
  for (const fmt of formats) {
    const d = parse(raw, fmt, new Date());
    if (isValid(d)) return format(d, 'yyyy-MM-dd');
  }
  return null;
}


export default function SchedulePage() {
  const { user } = useAuth();
  const params = useParams();
  const competitionId = params.competitionId as string;

  const [competition, setCompetition] = useState<Competition | null>(null);
  const [loading, setLoading] = useState(true);

  const form = useForm<ScheduleFormValues>({
    resolver: zodResolver(scheduleSchema),
    defaultValues: {
      fixtures: [],
    }
  });

  const { fields, replace } = useFieldArray({
    control: form.control,
    name: 'fixtures',
  });

  // Fetch competition data
  useEffect(() => {
    if (!user || !competitionId) return;
    setLoading(true);
    const fetchCompetitionDetails = async () => {
      const compDocRef = doc(db, `clubs/${user.uid}/competitions`, competitionId);
      const compSnap = await getDoc(compDocRef);
      if (compSnap.exists()) {
        const compData = compSnap.data();
        const teamNames = compData.teams || [];
        
        const clubsRef = collection(db, 'club_profiles');
        const clubsSnap = await getDocs(clubsRef);
        const allClubs = clubsSnap.docs.map(d => ({ id: d.id, ...d.data() })) as {id: string, clubName: string}[];
        
        const teamsWithIds = teamNames.map((name: string) => {
          const foundClub = allClubs.find(c => c.clubName === name);
          return { id: foundClub?.id || '', name: name };
        });

        setCompetition({ id: compSnap.id, ...compData, teams: teamsWithIds } as Competition);
      } else {
        console.error("Competition not found");
      }
    };
    fetchCompetitionDetails();
  }, [user, competitionId]);

  // Generate fixtures and initialize form
  useEffect(() => {
    if (!user || !competition?.teams || competition.teams.length < 2) return;

    const generatedFixtures = (() => {
      const teams = competition.teams!;
      const fixtures = [];
      for (let i = 0; i < teams.length; i++) {
        for (let j = i + 1; j < teams.length; j++) {
          fixtures.push({ homeTeam: teams[i].name, awayTeam: teams[j].name, homeTeamId: teams[i].id, awayTeamId: teams[j].id });
          fixtures.push({ homeTeam: teams[j].name, awayTeam: teams[i].name, homeTeamId: teams[j].id, awayTeamId: teams[i].id });
        }
      }
      return fixtures;
    })();

    const matchesColRef = collection(db, `clubs/${user.uid}/matches`);
    const q = query(matchesColRef, where("competitionId", "==", competitionId));
    getDocs(q).then(matchesSnap => {
      const existingMatches = matchesSnap.docs.map(d => d.data());
      const initialFixtures = generatedFixtures.map(genFix => {
        const existing = existingMatches.find(exFix => exFix.homeTeam === genFix.homeTeam && exFix.awayTeam === genFix.awayTeam);
        
        let matchDateValue: string | undefined = undefined;
        if (existing?.matchDate) {
            if (existing.matchDate instanceof Timestamp) {
                matchDateValue = existing.matchDate.toDate().toISOString().split('T')[0];
            } else if (typeof existing.matchDate === 'string') {
                matchDateValue = existing.matchDate;
            }
        }
        
        return { ...genFix, ...existing, matchDate: matchDateValue };
      });
      replace(initialFixtures as any);
    }).finally(() => {
      setLoading(false);
    });

  }, [competition, user, competitionId, replace]);

  const handleDateChange = (month: string, day: string, field: any) => {
    if (!competition?.season) return;

    const seasonStartYear = parseInt(competition.season.split('/')[0], 10);
    const numericMonth = parseInt(month, 10);
    
    // Season spans across two years (e.g., July to June)
    const year = numericMonth >= 6 ? seasonStartYear : seasonStartYear + 1;
    
    const newDate = new Date(year, numericMonth, parseInt(day, 10));
    field.onChange(newDate.toISOString().split('T')[0]);
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !competition) return;

    const text = await file.text();
    const parsed = parseCSV(text);
    if (parsed.length === 0) {
      toast.error('CSVにデータが見つかりませんでした。');
      e.target.value = '';
      return;
    }

    const nameToTeam = new Map<string, Team>();
    const idToTeam = new Map<string, Team>();
    competition.teams?.forEach((t) => {
      if (t.name) nameToTeam.set(t.name.trim(), t);
      if (t.id) idToTeam.set(t.id.trim(), t);
    });

    const currentFixtures = (form.getValues('fixtures') || []) as any[];
    const updated = [...currentFixtures];
    let added = 0;
    let updatedCount = 0;
    const skipped: string[] = [];

    parsed.forEach((row, idx) => {
      const homeRaw = row.homeTeam || row.home || row['ホーム'] || '';
      const awayRaw = row.awayTeam || row.away || row['アウェイ'] || '';
      const dateRaw = row.matchDate || row.date || row['日付'] || '';
      const scoreHomeRaw = row.scoreHome ?? row.homeScore ?? row['ホーム得点'] ?? '';
      const scoreAwayRaw = row.scoreAway ?? row.awayScore ?? row['アウェイ得点'] ?? '';

      const homeTeam = nameToTeam.get(homeRaw.trim()) || idToTeam.get(homeRaw.trim());
      const awayTeam = nameToTeam.get(awayRaw.trim()) || idToTeam.get(awayRaw.trim());
      if (!homeTeam || !awayTeam) {
        skipped.push(`${idx + 2}行目: チームが見つかりません`);
        return;
      }

      const date = normalizeDate(dateRaw);
      if (dateRaw && !date) {
        skipped.push(`${idx + 2}行目: 日付が不正です`);
        return;
      }

      let scoreHome: number | undefined;
      let scoreAway: number | undefined;

      if (scoreHomeRaw !== '') {
        const num = Number(scoreHomeRaw);
        if (!Number.isFinite(num) || num < 0 || !Number.isInteger(num)) {
          skipped.push(`${idx + 2}行目: ホーム得点が不正です`);
          return;
        }
        scoreHome = num;
      }
      if (scoreAwayRaw !== '') {
        const num = Number(scoreAwayRaw);
        if (!Number.isFinite(num) || num < 0 || !Number.isInteger(num)) {
          skipped.push(`${idx + 2}行目: アウェイ得点が不正です`);
          return;
        }
        scoreAway = num;
      }

      const patch: any = {
        homeTeam: homeTeam.name,
        awayTeam: awayTeam.name,
        homeTeamId: homeTeam.id,
        awayTeamId: awayTeam.id,
      };
      if (date) patch.matchDate = date;
      if (scoreHome !== undefined) patch.scoreHome = scoreHome;
      if (scoreAway !== undefined) patch.scoreAway = scoreAway;

      const existingIndex = updated.findIndex(
        (f) => f.homeTeam === homeTeam.name && f.awayTeam === awayTeam.name
      );
      if (existingIndex !== -1) {
        updated[existingIndex] = { ...updated[existingIndex], ...patch };
        updatedCount++;
      } else {
        updated.push(patch);
        added++;
      }
    });

    replace(updated);
    let message = `CSVを取り込みました（新規 ${added} 件 / 更新 ${updatedCount} 件）`;
    if (skipped.length > 0) message += ` / スキップ ${skipped.length} 件`;
    toast.success(message);
    if (skipped.length > 0) toast.error(`${skipped.length} 件の行をスキップしました。`);
    e.target.value = '';
  };

  const downloadTemplate = () => {
    const headers = 'homeTeam,awayTeam,matchDate,scoreHome,scoreAway\n';
    const example = 'チームA,チームB,2026-07-20,,\n';
    const content = '\uFEFF' + headers + example;
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'schedule_template.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleFormSubmit = async (values: ScheduleFormValues) => {
    if (!user) return;
    setLoading(true);
    try {
      const batch = writeBatch(db);
      const matchesColRef = collection(db, `clubs/${user.uid}/matches`);

      for (const fixture of values.fixtures) {
        if (fixture.matchDate) { // Only save if date is set
          const q = query(matchesColRef, 
            where("competitionId", "==", competitionId),
            where("homeTeam", "==", fixture.homeTeam),
            where("awayTeam", "==", fixture.awayTeam)
          );
          const existingMatchSnap = await getDocs(q);

          const matchData = {
            ...fixture,
            competitionId,
            season: competition?.season,
            matchDate: Timestamp.fromDate(new Date(fixture.matchDate as string)),
          };

          if (existingMatchSnap.empty) {
            const newMatchRef = doc(matchesColRef);
            batch.set(newMatchRef, matchData);
          } else {
            const matchDocRef = existingMatchSnap.docs[0].ref;
            batch.update(matchDocRef, matchData);
          }
        }
      }

      await batch.commit();
      toast.success('日程が保存されました。');
    } catch (error) {
      console.error("Error saving schedule: ", error);
      toast.error('保存中にエラーが発生しました。');
    } finally {
      setLoading(false);
    }
  };

  if (loading && fields.length === 0) {
    return <div className="flex justify-center items-center h-screen"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  if (!competition) {
    return <div className="text-center py-10">Competition not found.</div>;
  }

  return (
    <div className="container mx-auto py-10">
      <h1 className="text-3xl font-bold mb-2">日程管理</h1>
      <div className="text-lg text-muted-foreground mb-6">
        {competition.name} ({competition.season})
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-6">
          <div className="bg-card border rounded-lg">
            <div className="divide-y">
              {fields.map((field, index) => (
                  <div key={field.id} className="p-4 grid grid-cols-12 gap-x-4 gap-y-2 items-center">
                    {/* Team Names */}
                    <div className="col-span-12 md:col-span-5 grid grid-cols-11 items-center">
                      <div className="col-span-5 text-right font-medium">{field.homeTeam}</div>
                      <div className="col-span-1 text-center text-muted-foreground text-sm">vs</div>
                      <div className="col-span-5 text-left font-medium">{field.awayTeam}</div>
                    </div>

                    {/* Score Inputs */}
                    <div className="col-span-6 md:col-span-3 grid grid-cols-3 gap-2 items-center">
                      <FormField
                        control={form.control}
                        name={`fixtures.${index}.scoreHome`}
                        render={({ field }) => <FormItem><FormControl><Input type="number" placeholder="H" {...field} value={field.value ?? ''} /></FormControl></FormItem>}
                      />
                      <div className="text-center self-center">-</div>
                      <FormField
                        control={form.control}
                        name={`fixtures.${index}.scoreAway`}
                        render={({ field }) => <FormItem><FormControl><Input type="number" placeholder="A" {...field} value={field.value ?? ''} /></FormControl></FormItem>}
                      />
                    </div>

                    {/* Date Picker */}
                    <div className="col-span-6 md:col-span-4">
                      <FormField
                        control={form.control}
                        name={`fixtures.${index}.matchDate`}
                        render={({ field }) => (
                          <div className="flex space-x-2">
                            <FormItem className="w-1/2">
                              <Select
                                value={field.value ? new Date(field.value as string).getMonth().toString() : ''}
                                onValueChange={(month) => {
                                  const day = field.value ? new Date(field.value as string).getDate().toString() : '1';
                                  handleDateChange(month, day, field);
                                }}
                              >
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="月" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {Array.from({ length: 12 }, (_, i) => (
                                    <SelectItem key={i} value={i.toString()}>{i + 1}月</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </FormItem>
                            <FormItem className="w-1/2">
                              <Select
                                value={field.value ? new Date(field.value as string).getDate().toString() : ''}
                                onValueChange={(day) => {
                                  const month = field.value ? new Date(field.value as string).getMonth().toString() : '6'; // Default to July if not set
                                  handleDateChange(month, day, field);
                                }}
                              >
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="日" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {Array.from({ length: 31 }, (_, i) => (
                                    <SelectItem key={i + 1} value={(i + 1).toString()}>{i + 1}日</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </FormItem>
                          </div>
                        )}
                      />
                    </div>
                  </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <Button type="submit" disabled={loading} className="w-full">
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                日程を保存
              </Button>
              <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} className="w-full">
                CSVインポート
              </Button>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={downloadTemplate} className="w-full">
              CSVテンプレートをダウンロード
            </Button>
            <input
              type="file"
              accept=".csv,text/csv"
              ref={fileInputRef}
              className="hidden"
              onChange={handleFileChange}
            />
          </div>
        </form>
      </Form>
    </div>
  );
}