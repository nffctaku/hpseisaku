"use client";

import { useState, useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { doc, collection, getDocs, updateDoc } from 'firebase/firestore';
import { toDashSeason, toSlashSeason } from '@/lib/season';
import { toast } from 'sonner';
import { ChevronLeft, Loader2 } from 'lucide-react';
import { PlayerManagement } from '@/components/player-management';
import { StaffManagement } from '@/components/staff-management';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface Season {
  id: string;
  isPublic?: boolean;
}

export default function TeamPlayersPage() {
  const { user, ownerUid } = useAuth();
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const teamId = params.teamId as string;
  const clubUid = ownerUid || user?.uid;
  const [seasons, setSeasons] = useState<Season[]>([]);
  const seasonFromQuery = (searchParams.get('season') || '').trim();
  const [selectedSeason, setSelectedSeason] = useState<string>(seasonFromQuery);
  const [activeTab, setActiveTab] = useState<'players' | 'staff'>('players');

  useEffect(() => {
    if (!seasonFromQuery) {
      router.replace(`/admin/teams/${teamId}/season`);
    }
  }, [router, seasonFromQuery, teamId]);

  useEffect(() => {
    if (!clubUid) return;
    if (!seasonFromQuery) return;
    const seasonsColRef = collection(db, `clubs/${clubUid}/seasons`);
    getDocs(seasonsColRef).then(snapshot => {
      const seasonsData = snapshot.docs
        .map((d) => ({ id: toSlashSeason(d.id), ...(d.data() as any) } as Season))
        .sort((a, b) => b.id.localeCompare(a.id));
      setSeasons(seasonsData);
      if (seasonsData.length > 0) {
        const hasQuery = Boolean(seasonFromQuery);
        const exists = hasQuery ? seasonsData.some((s) => s.id === seasonFromQuery) : false;
        const next = exists ? seasonFromQuery : seasonsData[0].id;
        setSelectedSeason(next);
        if (hasQuery && !exists) {
          router.replace(`/admin/teams/${teamId}?season=${encodeURIComponent(next)}`);
        }
      }
    });
  }, [clubUid, seasonFromQuery, router, teamId]);

  const seasonIds = seasons.map((s) => s.id);

  const handleChangeSeason = (seasonId: string) => {
    setSelectedSeason(seasonId);
    router.replace(`/admin/teams/${teamId}?season=${encodeURIComponent(seasonId)}`);
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
              {selectedSeason ? (
                <span className="inline-flex items-center rounded-md bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white shadow-sm">
                  {selectedSeason}
                </span>
              ) : null}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 bg-white/10 text-white border-white/15 hover:bg-white/15 whitespace-nowrap"
                onClick={() => router.push(`/admin/teams/${teamId}/season`)}
              >
                シーズン選択に戻る
              </Button>
            </div>
          </div>

          <div className="mb-6 rounded-xl border border-white/10 bg-white/5 p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.02)] backdrop-blur">
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
              {selectedSeason && (
                <div className="flex items-center gap-3">
                  <Switch
                    id={`public-switch-${selectedSeason}`}
                    checked={seasons.find(s => s.id === selectedSeason)?.isPublic || false}
                    onCheckedChange={(checked) => handleTogglePublic(selectedSeason, checked)}
                    className="data-[state=checked]:bg-emerald-500 data-[state=unchecked]:bg-gray-500"
                  />
                  <div className="flex flex-col leading-tight">
                    <Label htmlFor={`public-switch-${selectedSeason}`} className="text-sm text-white">
                      HPに公開する
                    </Label>
                    <span className="text-xs text-white/60">
                      {seasons.find(s => s.id === selectedSeason)?.isPublic ? '現在: 公開中' : '現在: 非公開'}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {selectedSeason ? (
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
              <TabsList className="grid w-full grid-cols-2 rounded-xl bg-white/10 p-1">
                <TabsTrigger
                  className="w-full rounded-lg text-white/80 data-[state=active]:bg-blue-600 data-[state=active]:text-white"
                  value="players"
                >
                  選手管理
                </TabsTrigger>
                <TabsTrigger
                  className="w-full rounded-lg text-white/80 data-[state=active]:bg-blue-600 data-[state=active]:text-white"
                  value="staff"
                >
                  スタッフ管理
                </TabsTrigger>
              </TabsList>
              <TabsContent value="players" className="mt-4">
                <PlayerManagement teamId={teamId} selectedSeason={selectedSeason} />
              </TabsContent>
              <TabsContent value="staff" className="mt-4">
                <StaffManagement teamId={teamId} selectedSeason={selectedSeason} />
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
