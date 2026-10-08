"use client";

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useCareer } from '@/contexts/CareerContext';
import { db } from '@/lib/firebase';
import { doc, collection, getDocs, updateDoc, limit, query } from 'firebase/firestore';
import { toDashSeason, toSlashSeason } from '@/lib/season';
import { toast } from 'sonner';
import { ChevronLeft, Loader2 } from 'lucide-react';
import { PlayerManagement } from '@/components/player-management';
import { StaffManagement } from '@/components/staff-management';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface Season {
  id: string;
  isPublic?: boolean;
}

interface Team {
  id: string;
  name: string;
}

export default function TeamPlayersPage() {
  const { user } = useAuth();
  const { activeCareer, loading: careersLoading } = useCareer();
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const teamId = params.teamId as string;
  const clubUid = activeCareer?.clubUid || null;
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [seasonsLoading, setSeasonsLoading] = useState(false);
  const [seasonsError, setSeasonsError] = useState<string | null>(null);
  const [seasonsReloadKey, setSeasonsReloadKey] = useState(0);
  const [teams, setTeams] = useState<Team[]>([]);
  // "?season=2027-28" のような dash 形式も入口で slash に正規化する。
  // 正規化しないと selectedSeason が dash のまま残り、arrayRemove 相当の
  // 完全一致比較で slash 形式の seasons エントリを削除できなくなる。
  const seasonFromQuery = toSlashSeason((searchParams.get('season') || '').trim());
  const [selectedSeason, setSelectedSeason] = useState<string>(seasonFromQuery);
  const pendingSeasonRef = useRef<string | null>(null);
  const [activeTab, setActiveTab] = useState<'players' | 'staff'>('players');

  useEffect(() => {
    if (!seasonFromQuery) {
      router.replace(`/admin/teams/${teamId}/season`);
    }
  }, [router, seasonFromQuery, teamId]);

  // seasons一覧の取得。選択状態の同期とは分離し、取得コールバック内では
  // setSelectedSeason しない（古いクロージャが選択を上書きする競合を防ぐ）。
  // Firestoreはネットワーク断で内部リトライし続けgetDocsが解決しない場合が
  // あるため、タイムアウトでエラー表示＋再試行導線を提供する。
  useEffect(() => {
    if (!clubUid) {
      setSeasons([]);
      return;
    }
    let cancelled = false;
    // 前のキャリアのシーズンが残らないよう、取得開始時にクリアする
    setSeasons([]);
    setSeasonsLoading(true);
    setSeasonsError(null);
    const timeoutId = window.setTimeout(() => {
      if (cancelled) return;
      setSeasonsLoading(false);
      setSeasonsError('シーズン一覧の取得に時間がかかっています。再試行してください。');
    }, 15000);
    const seasonsColRef = collection(db, `clubs/${clubUid}/seasons`);
    getDocs(seasonsColRef)
      .then((snapshot) => {
        if (cancelled) return;
        // オフライン時は空のキャッシュ結果で解決することがある。
        // 「シーズン0件」と区別できないためエラー＋再試行導線に倒す。
        if (snapshot.empty && snapshot.metadata.fromCache) {
          setSeasonsError('シーズン一覧の取得に失敗しました。再試行してください。');
          return;
        }
        const seen = new Set<string>();
        const seasonsData = snapshot.docs
          .map((d) => ({ id: toSlashSeason(d.id), ...(d.data() as any) } as Season))
          .filter((s) => (seen.has(s.id) ? false : (seen.add(s.id), true)))
          .sort((a, b) => b.id.localeCompare(a.id));
        setSeasons(seasonsData);
        setSeasonsError(null);
      })
      .catch((e) => {
        if (cancelled) return;
        console.error('[TeamPlayersPage] failed to fetch seasons', e);
        setSeasonsError('シーズン一覧の取得に失敗しました。');
      })
      .finally(() => {
        window.clearTimeout(timeoutId);
        if (!cancelled) setSeasonsLoading(false);
      });
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [clubUid, seasonsReloadKey]);

  // 取得済みのseasonsとURLクエリから選択状態を同期（通信を伴わず競合しない）
  useEffect(() => {
    if (!seasonFromQuery || seasons.length === 0) return;
    const exists = seasons.some((s) => s.id === seasonFromQuery);
    const next = exists ? seasonFromQuery : seasons[0].id;
    // handleChangeSeason 側で selectedSeason を既に更新済みの場合は、
    // 古い seasonFromQuery または同じ値で上書きしない。
    if (pendingSeasonRef.current === seasonFromQuery) {
      pendingSeasonRef.current = null;
      return;
    }
    setSelectedSeason(next);
    if (!exists) {
      router.replace(`/admin/teams/${teamId}?season=${encodeURIComponent(next)}`);
    }
  }, [seasons, seasonFromQuery, router, teamId]);

  // Fetch teams for team selector
  useEffect(() => {
    if (!clubUid) return;
    const teamsColRef = collection(db, `clubs/${clubUid}/teams`);
    getDocs(teamsColRef).then(snapshot => {
      const teamsData = snapshot.docs.map((doc) => ({
        id: doc.id,
        name: (doc.data().name as string) || doc.id,
      }));
      setTeams(teamsData);
    });
  }, [clubUid]);

  const seasonIds = seasons.map((s) => s.id);

  const handleChangeTeam = (newTeamId: string) => {
    router.push(`/admin/teams/${newTeamId}?season=${encodeURIComponent(toSlashSeason(selectedSeason))}`);
  };

  const handleChangeSeason = (seasonId: string) => {
    const normalized = toSlashSeason(seasonId);
    // 即座に selectedSeason を更新して Select 表示を最新にする。
    // 同時に useEffect 側の URL→state 同期を抑制するため、
    // 更新を予定した season を pendingSeasonRef に保存する。
    pendingSeasonRef.current = normalized;
    setSelectedSeason(normalized);
    router.replace(`/admin/teams/${teamId}?season=${encodeURIComponent(normalized)}`);
  };

  const handleTogglePublic = async (seasonId: string, isPublic: boolean) => {
    if (!clubUid) return;
    const seasonDocRef = doc(db, `clubs/${clubUid}/seasons`, toDashSeason(seasonId));
    await updateDoc(seasonDocRef, { isPublic });
    setSeasons(seasons.map(s => s.id === seasonId ? { ...s, isPublic } : s));
    toast.success(`シーズン ${seasonId} を ${isPublic ? '公開' : '非公開'}にしました。`);
  };

  return (
    !seasonFromQuery ? (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    ) : (
      <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white">
        <div className="container mx-auto px-4 py-6 sm:py-10">
          <div className="mb-2">
            <button
              type="button"
              onClick={() => router.push("/admin")}
              className="inline-flex items-center gap-2 text-sm text-white/80 hover:text-white"
            >
              <ChevronLeft className="h-4 w-4" />
              管理TOP
            </button>
          </div>

          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">選手管理</h1>
            </div>
          </div>

          {/* Team and Season Selectors */}
          <div className="mb-6 flex flex-col gap-4 sm:flex-row">
            <div className="flex-1">
              <Select value={teamId} onValueChange={handleChangeTeam}>
                <SelectTrigger className="bg-white/10 text-white border-white/15 w-full">
                  <SelectValue placeholder="チームを選択" />
                </SelectTrigger>
                <SelectContent>
                  {teams.map((team) => (
                    <SelectItem key={team.id} value={team.id}>
                      {team.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 flex gap-2">
              {careersLoading || seasonsLoading ? (
                <div className="bg-white/10 text-white/70 border border-white/15 w-full h-9 rounded-md flex items-center gap-2 px-3 text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  読み込み中...
                </div>
              ) : (
                <Select value={selectedSeason} onValueChange={handleChangeSeason}>
                  <SelectTrigger className="bg-white/10 text-white border-white/15 w-full">
                    <SelectValue placeholder="シーズンを選択" />
                  </SelectTrigger>
                  <SelectContent>
                    {seasons.map((season) => (
                      <SelectItem key={season.id} value={season.id}>
                        {season.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Button
                type="button"
                variant="outline"
                className="bg-white/10 text-white border-white/15 hover:bg-white/20 h-9 whitespace-nowrap px-4"
                onClick={() => router.push(`/admin/teams/${teamId}/season`)}
              >
                シーズン登録
              </Button>
            </div>
          </div>

          {seasonsError ? (
            <div className="mb-6 flex items-center gap-3 text-sm">
              <span className="text-red-300">{seasonsError}</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="bg-white/10 text-white border-white/15 hover:bg-white/20 h-8 px-3"
                onClick={() => setSeasonsReloadKey((k) => k + 1)}
              >
                再試行
              </Button>
            </div>
          ) : !careersLoading && !seasonsLoading && seasons.length === 0 ? (
            <div className="mb-6 text-sm text-white/60">
              シーズンが登録されていません。「シーズン登録」ボタンから追加してください。
            </div>
          ) : null}

          {/* Public Toggle - Lighter Expression */}
          {selectedSeason && (
            <div className="mb-6 flex items-center justify-between py-1">
              <div className="flex items-center gap-2">
                <Label htmlFor={`public-switch-${selectedSeason}`} className="text-sm text-white">
                  HPに公開する
                </Label>
                <span className="text-xs text-white/60">
                  {seasons.find(s => s.id === selectedSeason)?.isPublic !== false ? '現在: 公開中' : '現在: 非公開'}
                </span>
              </div>
              <Switch
                id={`public-switch-${selectedSeason}`}
                checked={seasons.find(s => s.id === selectedSeason)?.isPublic !== false}
                onCheckedChange={(checked) => handleTogglePublic(selectedSeason, checked)}
                className="data-[state=checked]:bg-emerald-500 data-[state=unchecked]:bg-gray-500"
              />
            </div>
          )}

          {selectedSeason ? (
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
              <TabsList className="grid w-full grid-cols-2 rounded-xl bg-white/10 p-0">
                <TabsTrigger
                  className="w-full rounded-lg text-white/80 data-[state=active]:bg-blue-600 data-[state=active]:text-white h-9"
                  value="players"
                >
                  選手管理
                </TabsTrigger>
                <TabsTrigger
                  className="w-full rounded-lg text-white/80 data-[state=active]:bg-blue-600 data-[state=active]:text-white h-9"
                  value="staff"
                >
                  スタッフ管理
                </TabsTrigger>
              </TabsList>
              <TabsContent value="players" className="mt-4">
                <PlayerManagement teamId={teamId} selectedSeason={toSlashSeason(selectedSeason)} />
              </TabsContent>
              <TabsContent value="staff" className="mt-4">
                <StaffManagement teamId={teamId} selectedSeason={toSlashSeason(selectedSeason)} />
              </TabsContent>
            </Tabs>
          ) : (
            <p>シーズンを選択または追加してください。</p>
          )}
        </div>
      </div>
    )
  );
}
