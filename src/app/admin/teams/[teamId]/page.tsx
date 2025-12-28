"use client";

import { useState, useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { doc, collection, getDocs, setDoc, writeBatch, updateDoc, query, where, arrayUnion } from 'firebase/firestore';
import { toast } from 'sonner';
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
  const { user } = useAuth();
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const teamId = params.teamId as string;
  const clubUid = (user as any)?.ownerUid || user?.uid;
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
    const seasonsColRef = collection(db, `clubs/${clubUid}/seasons`);
    getDocs(seasonsColRef).then(snapshot => {
      const seasonsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Season)).sort((a, b) => b.id.localeCompare(a.id));
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

  const handleTogglePublic = async (seasonId: string, isPublic: boolean) => {
    if (!clubUid) return;
    const seasonDocRef = doc(db, `clubs/${clubUid}/seasons`, seasonId);
    await updateDoc(seasonDocRef, { isPublic });
    setSeasons(seasons.map(s => s.id === seasonId ? { ...s, isPublic } : s));
    toast.success(`シーズン ${seasonId} を ${isPublic ? '公開' : '非公開'}にしました。`);
  };

  const handleCopyFromPreviousSeason = async () => {
    if (!clubUid || !selectedSeason) {
      toast.error('シーズンが選択されていません。');
      return;
    }

    const getPreviousSeason = (season: string): string => {
      const startYear = parseInt(season.split('-')[0]);
      const prevYear = startYear - 1;
      const prevEnd = (prevYear + 1).toString().slice(-2);
      return `${prevYear}-${prevEnd}`;
    };

    const previousSeason = getPreviousSeason(selectedSeason);
    toast.info(`${previousSeason} シーズンから選手をコピーしています...`);

    try {
      // teams/{teamId}/players の中で「前シーズン所属」の選手に、選択中シーズンを追加する（実質コピー）
      const playersColRef = collection(db, `clubs/${clubUid}/teams/${teamId}/players`);
      const q = query(playersColRef, where('seasons', 'array-contains', previousSeason));
      const prevPlayersSnap = await getDocs(q);

      if (prevPlayersSnap.empty) {
        toast.info(`${previousSeason} シーズンに所属している選手がいません。`);
        return;
      }

      const batch = writeBatch(db);
      let copiedCount = 0;

      prevPlayersSnap.docs.forEach((pDoc) => {
        const data = pDoc.data() as any;
        const seasons: string[] = Array.isArray(data?.seasons) ? data.seasons : [];
        if (seasons.includes(selectedSeason)) return;

        const prevSeasonData = (data?.seasonData && typeof data.seasonData === "object") ? data.seasonData[previousSeason] : undefined;
        const seasonPayload = prevSeasonData
          ? prevSeasonData
          : {
              number: typeof data?.number === "number" ? data.number : undefined,
              position: typeof data?.position === "string" ? data.position : undefined,
              nationality: typeof data?.nationality === "string" ? data.nationality : undefined,
              age: typeof data?.age === "number" ? data.age : undefined,
              height: typeof data?.height === "number" ? data.height : undefined,
              photoUrl: typeof data?.photoUrl === "string" ? data.photoUrl : undefined,
              snsLinks: data?.snsLinks,
              params: data?.params,
              manualCompetitionStats: data?.manualCompetitionStats,
              isPublished: typeof data?.isPublished === "boolean" ? data.isPublished : undefined,
            };

        batch.update(pDoc.ref, {
          seasons: arrayUnion(selectedSeason),
          [`seasonData.${selectedSeason}`]: seasonPayload,
        } as any);
        copiedCount++;
      });

      if (copiedCount === 0) {
        toast.info('コピー対象の新しい選手がいません。');
        return;
      }

      await batch.commit();
      toast.success(`${copiedCount}人の選手を ${selectedSeason} シーズンにコピーしました。`);

    } catch (error) {
      console.error('Failed to copy players:', error);
      toast.error('選手のコピー中にエラーが発生しました。');
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <h1 className="text-2xl font-bold truncate sm:text-3xl">選手管理</h1>
          {selectedSeason && (
            <span className="inline-flex items-center rounded-full bg-white/10 px-2.5 py-1 text-xs font-semibold text-white whitespace-nowrap">
              {selectedSeason}
            </span>
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          className="bg-white text-gray-900 border border-border hover:bg-gray-100 whitespace-nowrap"
          onClick={() => router.push(`/admin/teams/${teamId}/season`)}
        >
          シーズン選択に戻る
        </Button>
      </div>

      <div className="mb-6 rounded-lg border border-white/10 bg-white/5 p-3">
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
                <span className="text-xs text-muted-foreground">
                  {seasons.find(s => s.id === selectedSeason)?.isPublic ? '現在: 公開中' : '現在: 非公開'}
                </span>
                <span className="hidden sm:block text-xs text-muted-foreground">ONにするとHPの選手一覧に表示されます。</span>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-1">
            <Button
              variant="outline"
              onClick={handleCopyFromPreviousSeason}
              disabled={!selectedSeason}
              className="bg-white text-gray-900 border border-border hover:bg-gray-100 disabled:opacity-50 disabled:hover:bg-white"
            >
              昨シーズンから選手をコピー
            </Button>
            <p className="hidden sm:block text-xs text-muted-foreground">前年のロスターから未登録の選手だけを追加します。</p>
          </div>
        </div>
      </div>

      {selectedSeason ? (
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
          <TabsList className="bg-white/10">
            <TabsTrigger value="players">選手管理</TabsTrigger>
            <TabsTrigger value="staff">スタッフ管理</TabsTrigger>
          </TabsList>
          <TabsContent value="players">
            <PlayerManagement teamId={teamId} selectedSeason={selectedSeason} />
          </TabsContent>
          <TabsContent value="staff">
            <StaffManagement teamId={teamId} selectedSeason={selectedSeason} />
          </TabsContent>
        </Tabs>
      ) : (
        <p>シーズンを選択または追加してください。</p>
      )}
    </div>
  );
}
