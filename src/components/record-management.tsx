"use client";

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { collection, doc, getDoc, getDocs, query, writeBatch } from 'firebase/firestore';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { LeagueTable } from '@/components/league-table';

interface CompetitionDoc {
  id: string;
  name: string;
  season?: string;
  format?: string;
}

type ManualStanding = {
  id: string;
  rank: number;
  teamName: string;
  logoUrl?: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
};

function computeAndRankStandings(input: ManualStanding[]): ManualStanding[] {
  const computed = input.map((s) => {
    const wins = s.wins || 0;
    const draws = s.draws || 0;
    const losses = s.losses || 0;
    const goalsFor = s.goalsFor || 0;
    const goalsAgainst = s.goalsAgainst || 0;
    return {
      ...s,
      played: wins + draws + losses,
      points: wins * 3 + draws,
      goalDifference: goalsFor - goalsAgainst,
    };
  });

  computed.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
    return a.teamName.localeCompare(b.teamName);
  });

  return computed.map((s, idx) => ({ ...s, rank: idx + 1 }));
}

function normalizeSeasonKey(season: string): string {
  const v = (season || '').trim();
  if (!v) return '';
  const replaced = v.replace('/', '-');
  const m = replaced.match(/^(\d{4})[-–](\d{2})$/);
  if (m) return `${m[1]}-${m[2]}`;
  return replaced;
}

export function RecordManagement() {
  const { user } = useAuth();
  const [seasons, setSeasons] = useState<string[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<string>('');
  const [competitions, setCompetitions] = useState<CompetitionDoc[]>([]);
  const [selectedCompetitionId, setSelectedCompetitionId] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);

  const [standingsEditMode, setStandingsEditMode] = useState(false);
  const [standingsDraft, setStandingsDraft] = useState<ManualStanding[]>([]);
  const [standingsLoading, setStandingsLoading] = useState(false);
  const [standingsSaving, setStandingsSaving] = useState(false);
  const [standingsVersion, setStandingsVersion] = useState(0);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      setLoading(true);
      try {
        // Fetch competitions and build season options
        const competitionsQueryRef = query(collection(db, `clubs/${user.uid}/competitions`));
        const competitionsSnap = await getDocs(competitionsQueryRef);

        const competitionsData: CompetitionDoc[] = competitionsSnap.docs.map(doc => {
          const data = doc.data() as any;
          return {
            id: doc.id,
            name: (data.name as string) || doc.id,
            season: data.season as string | undefined,
            format: data.format as string | undefined,
          };
        });

        // Build season and competition options
        const seasonSet = new Set<string>();
        competitionsData.forEach(comp => {
          if (comp.format === 'cup') {
            return;
          }
          if (comp.season && typeof comp.season === 'string' && comp.season.trim() !== '') {
            seasonSet.add(comp.season);
          }
        });
        const seasonList = Array.from(seasonSet).sort((a, b) => b.localeCompare(a));
        setSeasons(seasonList);
        setCompetitions(competitionsData);

        if (seasonList.length > 0) {
          // Force season-first UX: default to latest season when not chosen
          const exists = selectedSeason ? seasonList.includes(selectedSeason) : false;
          const nextSeason = exists ? selectedSeason : seasonList[0];
          if (nextSeason !== selectedSeason) {
            setSelectedSeason(nextSeason);
          }
        }

      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user, selectedSeason]);

  useEffect(() => {
    const fetchStandingsDraft = async () => {
      if (!user) return;
      if (!selectedCompetitionId) {
        setStandingsDraft([]);
        return;
      }

      setStandingsLoading(true);
      try {
        const competitionDocRef = doc(db, `clubs/${user.uid}/competitions`, selectedCompetitionId);
        const competitionSnap = await getDoc(competitionDocRef);
        const competitionData = competitionSnap.data() as any;

        const teamsMap = new Map<string, { name: string; logoUrl?: string }>();
        const teamsSnap = await getDocs(collection(db, `clubs/${user.uid}/teams`));
        teamsSnap.forEach((d) => {
          const data = d.data() as any;
          teamsMap.set(d.id, { name: data?.name || d.id, logoUrl: data?.logoUrl });
        });

        const standingsSnap = await getDocs(collection(competitionDocRef, 'standings'));
        if (!standingsSnap.empty) {
          const fetched = standingsSnap.docs
            .map((d) => {
              const data = d.data() as any;
              const teamInfo = teamsMap.get(d.id);
              const wins = typeof data.wins === 'number' ? data.wins : 0;
              const draws = typeof data.draws === 'number' ? data.draws : 0;
              const goalsFor = typeof data.goalsFor === 'number' ? data.goalsFor : 0;
              const goalsAgainst = typeof data.goalsAgainst === 'number' ? data.goalsAgainst : 0;
              const points = typeof data.points === 'number' ? data.points : wins * 3 + draws;
              const goalDifference =
                typeof data.goalDifference === 'number' ? data.goalDifference : goalsFor - goalsAgainst;

              return {
                id: d.id,
                rank: typeof data.rank === 'number' ? data.rank : 0,
                teamName: teamInfo?.name || data.teamName || 'Unknown Team',
                logoUrl: teamInfo?.logoUrl,
                played: typeof data.played === 'number' ? data.played : 0,
                wins,
                draws,
                losses: typeof data.losses === 'number' ? data.losses : 0,
                goalsFor,
                goalsAgainst,
                goalDifference,
                points,
              } as ManualStanding;
            })
            .sort((a, b) => a.rank - b.rank);

          setStandingsDraft(fetched);
          return;
        }

        const teamIds: string[] = Array.isArray(competitionData?.teams) ? competitionData.teams : [];
        if (teamIds.length === 0) {
          setStandingsDraft([]);
          return;
        }

        const initial = teamIds.map((teamId, idx) => {
          const teamInfo = teamsMap.get(teamId);
          return {
            id: teamId,
            rank: idx + 1,
            teamName: teamInfo?.name || teamId,
            logoUrl: teamInfo?.logoUrl,
            played: 0,
            wins: 0,
            draws: 0,
            losses: 0,
            goalsFor: 0,
            goalsAgainst: 0,
            goalDifference: 0,
            points: 0,
          } as ManualStanding;
        });
        setStandingsDraft(initial);
      } catch (error) {
        console.error('[RecordManagement] Failed to fetch standings', error);
        setStandingsDraft([]);
      } finally {
        setStandingsLoading(false);
      }
    };

    fetchStandingsDraft();
  }, [selectedCompetitionId, user]);

  const handleStandingInputChange = (teamId: string, field: keyof ManualStanding, value: string) => {
    const numericValue = parseInt(value, 10);
    setStandingsDraft((prev) =>
      prev.map((s) => (s.id === teamId ? { ...s, [field]: Number.isFinite(numericValue) ? numericValue : 0 } : s))
    );
  };

  const handleSaveStandings = async () => {
    if (!user) return;
    if (!selectedCompetitionId) return;

    setStandingsSaving(true);
    try {
      const computedList = computeAndRankStandings(standingsDraft);
      const batch = writeBatch(db);
      const baseRef = doc(db, `clubs/${user.uid}/competitions`, selectedCompetitionId);
      computedList.forEach((s) => {
        const docRef = doc(baseRef, 'standings', s.id);
        const { logoUrl, ...dataToSave } = s;
        batch.set(docRef, dataToSave, { merge: true });
      });
      await batch.commit();
      setStandingsDraft(computedList);
      setStandingsVersion((v) => v + 1);
      setStandingsEditMode(false);
      toast.success('順位表を保存しました。HPのトップページ/TABLEでは手入力順位が優先表示されます。');
    } catch (error) {
      console.error('[RecordManagement] Failed to save standings', error);
      toast.error('順位表の保存に失敗しました。');
    } finally {
      setStandingsSaving(false);
    }
  };

  const handleClearStandingsOverride = async () => {
    if (!user) return;
    if (!selectedCompetitionId) return;

    const ok = window.confirm('手入力の順位表を削除して、自動計算（試合結果）に戻します。よろしいですか？');
    if (!ok) return;

    setStandingsSaving(true);
    try {
      const competitionDocRef = doc(db, `clubs/${user.uid}/competitions`, selectedCompetitionId);
      const competitionSnap = await getDoc(competitionDocRef);
      const competitionData = competitionSnap.data() as any;

      const standingsSnap = await getDocs(collection(competitionDocRef, 'standings'));
      if (!standingsSnap.empty) {
        const batch = writeBatch(db);
        standingsSnap.docs.forEach((d) => {
          batch.delete(d.ref);
        });
        await batch.commit();
      }

      // Reset draft to initial order so the user can continue editing if desired
      const teamsMap = new Map<string, { name: string; logoUrl?: string }>();
      const teamsSnap = await getDocs(collection(db, `clubs/${user.uid}/teams`));
      teamsSnap.forEach((d) => {
        const data = d.data() as any;
        teamsMap.set(d.id, { name: data?.name || d.id, logoUrl: data?.logoUrl });
      });

      const teamIds: string[] = Array.isArray(competitionData?.teams) ? competitionData.teams : [];
      const initial = teamIds.map((teamId, idx) => {
        const teamInfo = teamsMap.get(teamId);
        return {
          id: teamId,
          rank: idx + 1,
          teamName: teamInfo?.name || teamId,
          logoUrl: teamInfo?.logoUrl,
          played: 0,
          wins: 0,
          draws: 0,
          losses: 0,
          goalsFor: 0,
          goalsAgainst: 0,
          goalDifference: 0,
          points: 0,
        } as ManualStanding;
      });
      setStandingsDraft(initial);
      setStandingsVersion((v) => v + 1);
      setStandingsEditMode(false);

      toast.success('手入力の順位表を削除しました。以後は試合結果から自動計算された順位が表示されます。');
    } catch (error) {
      console.error('[RecordManagement] Failed to clear standings override', error);
      toast.error('削除に失敗しました。');
    } finally {
      setStandingsSaving(false);
    }
  };

  const filteredCompetitions = useMemo(() => {
    const editable = competitions.filter((c) => c.format !== 'cup');
    if (!selectedSeason) return editable;
    const seasonKey = normalizeSeasonKey(selectedSeason);
    return editable.filter((c) => normalizeSeasonKey(c.season || '') === seasonKey);
  }, [competitions, selectedSeason]);

  const rankedStandings = useMemo(() => computeAndRankStandings(standingsDraft), [standingsDraft]);

  const computedRankMap = useMemo(() => {
    const map = new Map<string, { rank: number; points: number }>();
    rankedStandings.forEach((s) => {
      map.set(s.id, { rank: s.rank, points: s.points });
    });
    return map;
  }, [rankedStandings]);

  // Competition is required: default/select first competition in the chosen season
  useEffect(() => {
    if (!selectedSeason) return;
    if (filteredCompetitions.length === 0) {
      if (selectedCompetitionId) setSelectedCompetitionId('');
      return;
    }
    const exists = filteredCompetitions.some((c) => c.id === selectedCompetitionId);
    if (!exists) {
      setSelectedCompetitionId(filteredCompetitions[0].id);
    }
  }, [filteredCompetitions, selectedCompetitionId, selectedSeason]);

  const standingsCompetitions = useMemo(() => {
    if (!user) return [];
    if (!selectedCompetitionId) return [];
    const c = competitions.find((x) => x.id === selectedCompetitionId);
    if (!c) return [];
    return [{ id: c.id, name: c.name, ownerUid: user.uid }];
  }, [competitions, selectedCompetitionId, user]);

  if (!user) {
    return <div className="py-6 text-center text-muted-foreground">ログインが必要です。</div>;
  }

  return (
    <div className="py-6 space-y-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2">
        <div className="font-semibold">大会記録</div>
        <div className="flex flex-wrap items-center gap-2 justify-end">
          <Select value={selectedSeason} onValueChange={setSelectedSeason}>
            <SelectTrigger className="w-[180px] bg-white text-gray-900">
              <SelectValue placeholder="シーズンを選択" />
            </SelectTrigger>
            <SelectContent>
              {seasons.map(s => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={selectedCompetitionId} onValueChange={setSelectedCompetitionId}>
            <SelectTrigger className="w-[180px] bg-white text-gray-900">
              <SelectValue placeholder="大会を選択" />
            </SelectTrigger>
            <SelectContent>
              {filteredCompetitions.map(c => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          <span>集計中...</span>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredCompetitions.length === 0 ? (
            <div className="text-center py-6 text-xs text-muted-foreground">
              このシーズンで編集できる大会はありません（カップ戦のみの大会は対象外）。
            </div>
          ) : null}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <div className="text-[11px] text-muted-foreground">選択中の大会の順位表を直接編集して保存できます。</div>
              <div className="text-[11px] text-muted-foreground">
                ここで保存した順位表はHPのトップページ/TABLEで最優先表示されます。試合結果からの自動計算に戻したい場合は「手入力を削除」を押してください。
              </div>
            </div>
            <div className="flex flex-wrap gap-2 justify-end">
              <Button
                type="button"
                variant="outline"
                className="bg-white text-gray-900 border border-border hover:bg-gray-100 h-8 px-2 text-xs"
                onClick={() => setStandingsEditMode((v) => !v)}
                disabled={standingsSaving || standingsLoading || standingsCompetitions.length === 0}
              >
                {standingsEditMode ? '順位表編集を閉じる' : '順位表を編集'}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="bg-white text-gray-900 border border-border hover:bg-gray-100 h-8 px-2 text-xs"
                onClick={handleClearStandingsOverride}
                disabled={standingsSaving || standingsLoading || standingsCompetitions.length === 0}
              >
                手入力を削除
              </Button>
              {standingsEditMode && (
                <Button
                  type="button"
                  className="bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 disabled:hover:bg-emerald-600 h-8 px-2 text-xs"
                  onClick={handleSaveStandings}
                  disabled={standingsSaving || standingsLoading}
                >
                  {standingsSaving ? '保存中...' : '順位表を保存'}
                </Button>
              )}
            </div>
          </div>

          {standingsCompetitions.length === 0 ? (
            <div className="text-center py-6 text-xs text-muted-foreground">
              順位表を表示するには大会を選択してください。
            </div>
          ) : standingsEditMode ? (
            <div className="bg-white text-gray-900 border rounded-lg overflow-hidden text-xs">
              {standingsLoading ? (
                <div className="flex items-center justify-center py-10 text-muted-foreground">
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  <span>読み込み中...</span>
                </div>
              ) : standingsDraft.length === 0 ? (
                <div className="text-center py-6 text-xs text-muted-foreground">編集できるチームがありません。</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[56px] p-1">#</TableHead>
                      <TableHead className="p-1">Club</TableHead>
                      <TableHead className="w-[56px] p-1">P</TableHead>
                      <TableHead className="w-[56px] p-1">W</TableHead>
                      <TableHead className="w-[56px] p-1">D</TableHead>
                      <TableHead className="w-[56px] p-1">L</TableHead>
                      <TableHead className="w-[56px] p-1">GF</TableHead>
                      <TableHead className="w-[56px] p-1">GA</TableHead>
                      <TableHead className="w-[56px] p-1">Pts</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rankedStandings.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell className="p-1">
                          <div className="h-8 w-[52px] px-2 text-xs flex items-center">
                            {computedRankMap.get(s.id)?.rank ?? '-'}
                          </div>
                        </TableCell>
                        <TableCell className="p-1 font-medium flex items-center gap-2">
                          {s.logoUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={s.logoUrl} alt={s.teamName} className="w-5 h-5 object-contain" />
                          ) : null}
                          <span className="truncate">{s.teamName}</span>
                        </TableCell>
                        <TableCell className="p-1">
                          <div className="h-8 w-[52px] px-2 text-xs flex items-center justify-end">
                            {s.wins + s.draws + s.losses}
                          </div>
                        </TableCell>
                        <TableCell className="p-1">
                          <Input
                            inputMode="numeric"
                            value={s.wins}
                            onChange={(e) => handleStandingInputChange(s.id, 'wins', e.target.value)}
                            className="h-8 w-[52px] px-2 text-xs bg-white text-gray-900"
                          />
                        </TableCell>
                        <TableCell className="p-1">
                          <Input
                            inputMode="numeric"
                            value={s.draws}
                            onChange={(e) => handleStandingInputChange(s.id, 'draws', e.target.value)}
                            className="h-8 w-[52px] px-2 text-xs bg-white text-gray-900"
                          />
                        </TableCell>
                        <TableCell className="p-1">
                          <Input
                            inputMode="numeric"
                            value={s.losses}
                            onChange={(e) => handleStandingInputChange(s.id, 'losses', e.target.value)}
                            className="h-8 w-[52px] px-2 text-xs bg-white text-gray-900"
                          />
                        </TableCell>
                        <TableCell className="p-1">
                          <Input
                            inputMode="numeric"
                            value={s.goalsFor}
                            onChange={(e) => handleStandingInputChange(s.id, 'goalsFor', e.target.value)}
                            className="h-8 w-[52px] px-2 text-xs bg-white text-gray-900"
                          />
                        </TableCell>
                        <TableCell className="p-1">
                          <Input
                            inputMode="numeric"
                            value={s.goalsAgainst}
                            onChange={(e) => handleStandingInputChange(s.id, 'goalsAgainst', e.target.value)}
                            className="h-8 w-[52px] px-2 text-xs bg-white text-gray-900"
                          />
                        </TableCell>
                        <TableCell className="p-1">
                          <div className="h-8 w-[52px] px-2 text-xs flex items-center justify-end">
                            {computedRankMap.get(s.id)?.points ?? 0}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          ) : (
            <div className="text-center py-6 text-xs text-muted-foreground">
              順位表は「順位表を編集」を押すと表示されます。
            </div>
          )}
        </div>
      )}
    </div>
  );
}
