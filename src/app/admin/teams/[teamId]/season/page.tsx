"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { collection, doc, getDocs, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

interface Season {
  id: string;
  isPublic?: boolean;
}

export default function TeamSeasonSelectPage() {
  const { user } = useAuth();
  const params = useParams();
  const router = useRouter();
  const teamId = params.teamId as string;

  const [seasons, setSeasons] = useState<Season[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<string>("");
  const [newSeason, setNewSeason] = useState<string>("");

  const generateSeasons = (startYear: number, endYear: number) => {
    const list: string[] = [];
    for (let year = endYear; year >= startYear; year--) {
      const end = (year + 1).toString().slice(-2);
      list.push(`${year}-${end}`);
    }
    return list;
  };

  useEffect(() => {
    if (!user) return;

    const seasonsColRef = collection(db, `clubs/${user.uid}/seasons`);
    getDocs(seasonsColRef).then((snapshot) => {
      const seasonsData = snapshot.docs
        .map((d) => ({ id: d.id, ...(d.data() as any) } as Season))
        .sort((a, b) => b.id.localeCompare(a.id));
      setSeasons(seasonsData);
      if (seasonsData.length > 0) {
        setSelectedSeason(seasonsData[0].id);
      }
    });
  }, [user]);

  const availableSeasonsToAdd = useMemo(() => {
    const existing = new Set(seasons.map((s) => s.id));
    return generateSeasons(1960, 2050).filter((s) => !existing.has(s));
  }, [seasons]);

  const canContinue = useMemo(() => selectedSeason.trim().length > 0, [selectedSeason]);
  const canAdd = useMemo(() => newSeason.trim().length > 0, [newSeason]);

  const handleAddSeason = async () => {
    if (!user || !newSeason) return;
    const seasonDocRef = doc(db, `clubs/${user.uid}/seasons`, newSeason);
    await setDoc(seasonDocRef, { name: newSeason, isPublic: false });
    setSeasons([{ id: newSeason, isPublic: false }, ...seasons].sort((a, b) => b.id.localeCompare(a.id)));
    setSelectedSeason(newSeason);
    setNewSeason("");
  };

  return (
    <div className="max-w-xl">
      <h1 className="text-3xl font-bold mb-6">シーズン選択</h1>
      <div className="space-y-2">
        <div className="flex flex-col gap-2 w-full sm:w-auto sm:flex-row sm:items-center">
          <Select value={newSeason} onValueChange={setNewSeason}>
            <SelectTrigger className="w-full sm:w-[240px] bg-white text-gray-900">
              <SelectValue placeholder="シーズンを追加" />
            </SelectTrigger>
            <SelectContent>
              {availableSeasonsToAdd.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            disabled={!canAdd}
            className="bg-white text-gray-900 border border-border hover:bg-gray-100 disabled:opacity-50 disabled:hover:bg-white w-full sm:w-auto"
            onClick={handleAddSeason}
          >
            追加
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">新しい年度のシーズン枠を作成します（初期は非公開）。</p>
      </div>

      <div className="space-y-2">
        <Select value={selectedSeason} onValueChange={setSelectedSeason}>
          <SelectTrigger className="w-full sm:w-[240px] bg-white text-gray-900">
            <SelectValue placeholder="シーズンを選択" />
          </SelectTrigger>
          <SelectContent>
            {seasons.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.id}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">ここで選んだシーズンの選手を編集します。</p>
      </div>

      <div className="mt-6 flex flex-col gap-2 sm:flex-row">
        <Button
          type="button"
          disabled={!canContinue}
          className="bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 disabled:hover:bg-emerald-600"
          onClick={() => {
            if (!selectedSeason) return;
            router.push(`/admin/teams/${teamId}?season=${encodeURIComponent(selectedSeason)}`);
          }}
        >
          編集
        </Button>
        <Button
          type="button"
          variant="outline"
          className="bg-white text-gray-900 border border-border hover:bg-gray-100"
          onClick={() => router.push("/admin/teams")}
        >
          戻る
        </Button>
      </div>
    </div>
  );
}
