"use client";

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { doc, collection, getDocs, setDoc, writeBatch, updateDoc } from 'firebase/firestore';
import { toast } from 'sonner';
import { PlayerManagement } from '@/components/player-management';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

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
      // 1. Get players from the previous season
      const prevRosterRef = collection(db, `clubs/${user.uid}/seasons/${previousSeason}/roster`);
      const prevPlayersSnap = await getDocs(prevRosterRef);

      if (prevPlayersSnap.empty) {
        toast.info(`${previousSeason} シーズンに登録されている選手がいません。`);
        return;
      }
      const playersToCopy = prevPlayersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      // 2. Get players from the current season to avoid duplicates
      const currentRosterRef = collection(db, `clubs/${user.uid}/seasons/${selectedSeason}/roster`);
      const currentPlayersSnap = await getDocs(currentRosterRef);
      const existingPlayerIds = new Set(currentPlayersSnap.docs.map(doc => doc.id));

      // 3. Filter out existing players and prepare the batch write
      const batch = writeBatch(db);
      let copiedCount = 0;
      playersToCopy.forEach(player => {
        if (!existingPlayerIds.has(player.id)) {
          const newPlayerDocRef = doc(currentRosterRef, player.id);
          batch.set(newPlayerDocRef, player);
          copiedCount++;
        }
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
      <div className="flex items-center gap-4 mb-6">
        <Select value={selectedSeason} onValueChange={setSelectedSeason}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="シーズンを選択" />
          </SelectTrigger>
          <SelectContent>
            {seasons.map(s => <SelectItem key={s.id} value={s.id}>{s.id}</SelectItem>)}
          </SelectContent>
        </Select>
        {selectedSeason && (
          <div className="flex items-center space-x-2">
            <Switch
              id={`public-switch-${selectedSeason}`}
              checked={seasons.find(s => s.id === selectedSeason)?.isPublic || false}
              onCheckedChange={(checked) => handleTogglePublic(selectedSeason, checked)}
            />
            <Label htmlFor={`public-switch-${selectedSeason}`}>公開する</Label>
          </div>
        )}
        <div className="flex items-center gap-2">
          <Select value={newSeason} onValueChange={setNewSeason}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="シーズンを追加" />
            </SelectTrigger>
            <SelectContent>
              {availableSeasonsToAdd.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={handleAddSeason} disabled={!newSeason}>追加</Button>
        </div>
        <Button variant="outline" onClick={handleCopyFromPreviousSeason} disabled={!selectedSeason}>
          昨シーズンから選手をコピー
        </Button>
      </div>

      {selectedSeason ? (
        <PlayerManagement season={selectedSeason} />
      ) : (
        <p>シーズンを選択または追加してください。</p>
      )}
    </div>
  );
}
