"use client";

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { doc, collection, getDocs, setDoc, writeBatch, updateDoc, query, where, arrayUnion } from 'firebase/firestore';
import { toast } from 'sonner';
import { PlayerManagement } from '@/components/player-management';
import { StaffManagement } from '@/components/staff-management';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  const teamId = params.teamId as string;
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<string>('');
  const [newSeason, setNewSeason] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'players' | 'staff'>('players');

  const generateSeasons = (startYear: number, endYear: number) => {
    const seasons = [];
    for (let year = endYear; year >= startYear; year--) {
      const end = (year + 1).toString().slice(-2);
      seasons.push(`${year}-${end}`);
    }
    return seasons;
  };

  const availableSeasonsToAdd = generateSeasons(1960, 2050).filter(s => !seasons.some(season => season.id === s));

  useEffect(() => {
    if (!user) return;
    const seasonsColRef = collection(db, `clubs/${user.uid}/seasons`);
    getDocs(seasonsColRef).then(snapshot => {
      const seasonsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Season)).sort((a, b) => b.id.localeCompare(a.id));
      setSeasons(seasonsData);
      if (seasonsData.length > 0) {
        setSelectedSeason(seasonsData[0].id);
      }
    });
  }, [user]);

  const handleAddSeason = async () => {
    if (!user || !newSeason) {
      alert('追加するシーズンを選択してください。');
      return;
    }
    const seasonDocRef = doc(db, `clubs/${user.uid}/seasons`, newSeason);
    await setDoc(seasonDocRef, { name: newSeason, isPublic: false }); // Default to not public
    setSeasons([{ id: newSeason, isPublic: false }, ...seasons].sort((a, b) => b.id.localeCompare(a.id)));
    setSelectedSeason(newSeason);
    setNewSeason('');
  };

  const handleTogglePublic = async (seasonId: string, isPublic: boolean) => {
    if (!user) return;
    const seasonDocRef = doc(db, `clubs/${user.uid}/seasons`, seasonId);
    await updateDoc(seasonDocRef, { isPublic });
    setSeasons(seasons.map(s => s.id === seasonId ? { ...s, isPublic } : s));
    toast.success(`シーズン ${seasonId} を ${isPublic ? '公開' : '非公開'}にしました。`);
  };

  const handleCopyFromPreviousSeason = async () => {
    if (!user || !selectedSeason) {
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
      const playersColRef = collection(db, `clubs/${user.uid}/teams/${teamId}/players`);
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
        batch.update(pDoc.ref, { seasons: arrayUnion(selectedSeason) });
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
      <h1 className="text-3xl font-bold mb-6">選手管理</h1>
      <div className="flex flex-col gap-4 mb-6 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="flex flex-col gap-1 w-full sm:w-auto">
          <div className="flex flex-col gap-2 w-full sm:w-auto sm:flex-row sm:items-center">
            <Select value={newSeason} onValueChange={setNewSeason}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="シーズンを追加" />
              </SelectTrigger>
              <SelectContent>
                {availableSeasonsToAdd.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button
              onClick={handleAddSeason}
              disabled={!newSeason}
              className="bg-white text-gray-900 border border-border hover:bg-gray-100 disabled:opacity-50 disabled:hover:bg-white w-full sm:w-auto"
            >
              追加
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">新しい年度のシーズン枠を作成します（初期は非公開）。</p>
        </div>

        <div className="flex flex-col gap-1 w-full sm:w-auto">
          <div className="w-full sm:w-auto">
            <Select value={selectedSeason} onValueChange={setSelectedSeason}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="シーズンを選択" />
              </SelectTrigger>
              <SelectContent>
                {seasons.map(s => <SelectItem key={s.id} value={s.id}>{s.id}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground">ここで選んだシーズンの選手を編集します。</p>
        </div>

        {selectedSeason && (
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <Switch
              id={`public-switch-${selectedSeason}`}
              checked={seasons.find(s => s.id === selectedSeason)?.isPublic || false}
              onCheckedChange={(checked) => handleTogglePublic(selectedSeason, checked)}
              className="data-[state=checked]:bg-emerald-500 data-[state=unchecked]:bg-gray-500"
            />
            <div className="flex flex-col leading-tight text-sm">
              <Label
                htmlFor={`public-switch-${selectedSeason}`}
                className="text-sm text-white"
              >
                HPに公開する
              </Label>
              <span className="text-xs text-muted-foreground">
                {seasons.find(s => s.id === selectedSeason)?.isPublic ? '現在: 公開中' : '現在: 非公開'}
              </span>
              <span className="text-xs text-muted-foreground">ONにするとHPの選手一覧に表示されます。</span>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-1 w-full sm:w-auto">
          <Button
            variant="outline"
            onClick={handleCopyFromPreviousSeason}
            disabled={!selectedSeason}
            className="bg-white text-gray-900 border border-border hover:bg-gray-100 disabled:opacity-50 disabled:hover:bg-white w-full sm:w-auto"
          >
            昨シーズンから選手をコピー
          </Button>
          <p className="text-xs text-muted-foreground">前年のロスターから未登録の選手だけを追加します。</p>
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
