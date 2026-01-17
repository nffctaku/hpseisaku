"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { collection, doc, getDocs, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

interface Season {
  id: string;
  isPublic?: boolean;
}

const generateSeasonOptions = (): string[] => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const start = month >= 7 ? year : year - 1;
  const out: string[] = [];
  for (let y = start; y >= start - 20; y -= 1) {
    out.push(`${y}/${String((y + 1) % 100).padStart(2, "0")}`);
  }
  return out;
};

export default function TeamSeasonSelectPage() {
  const { user } = useAuth();
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const teamId = params.teamId as string;
  const clubUid = (user as any)?.ownerUid || user?.uid;

  const next = (searchParams.get("next") || "").trim();

  const [seasons, setSeasons] = useState<Season[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<string>("");
  const [newSeasonId, setNewSeasonId] = useState<string>("");
  const [creating, setCreating] = useState(false);

  const seasonOptions = useMemo(() => generateSeasonOptions(), []);

  useEffect(() => {
    if (!clubUid) return;

    const seasonsColRef = collection(db, `clubs/${clubUid}/seasons`);
    getDocs(seasonsColRef).then((snapshot) => {
      const seasonsData = snapshot.docs
        .map((d) => ({ id: d.id, ...(d.data() as any) } as Season))
        .sort((a, b) => b.id.localeCompare(a.id));
      setSeasons(seasonsData);
      if (seasonsData.length > 0) {
        setSelectedSeason(seasonsData[0].id);
      }
    });
  }, [clubUid]);

  useEffect(() => {
    if (newSeasonId.trim()) return;
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const start = month >= 7 ? year : year - 1;
    setNewSeasonId(`${start}/${String((start + 1) % 100).padStart(2, "0")}`);
  }, [newSeasonId]);

  const canContinue = useMemo(() => selectedSeason.trim().length > 0, [selectedSeason]);
  const canCreate = useMemo(() => newSeasonId.trim().length > 0 && !creating, [newSeasonId, creating]);

  const handleCreateSeason = async () => {
    if (!clubUid) return;
    const id = newSeasonId.trim();
    if (!id) return;
    setCreating(true);
    try {
      const ref = doc(db, `clubs/${clubUid}/seasons`, id);
      await setDoc(ref, { createdAt: serverTimestamp() } as any, { merge: true });
      const seasonsColRef = collection(db, `clubs/${clubUid}/seasons`);
      const snapshot = await getDocs(seasonsColRef);
      const seasonsData = snapshot.docs
        .map((d) => ({ id: d.id, ...(d.data() as any) } as Season))
        .sort((a, b) => b.id.localeCompare(a.id));
      setSeasons(seasonsData);
      setSelectedSeason(id);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="max-w-xl">
      <h1 className="text-3xl font-bold mb-6">シーズン選択</h1>
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
      </div>

      {seasons.length === 0 ? (
        <div className="mt-6 space-y-3">
          <div className="text-sm text-muted-foreground">シーズンが未作成です。まずシーズンを作成してください。</div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Select value={newSeasonId} onValueChange={setNewSeasonId}>
              <SelectTrigger className="w-full sm:w-[240px] bg-white text-gray-900">
                <SelectValue placeholder="作成するシーズンを選択" />
              </SelectTrigger>
              <SelectContent>
                {seasonOptions.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="button" onClick={handleCreateSeason} disabled={!canCreate} className="whitespace-nowrap">
              シーズン作成
            </Button>
          </div>
        </div>
      ) : null}

      <div className="mt-6 flex flex-col gap-2 sm:flex-row">
        <Button
          type="button"
          disabled={!canContinue}
          className="bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 disabled:hover:bg-emerald-600"
          onClick={() => {
            if (!selectedSeason) return;
            if (next === "booklet") {
              router.push(`/admin/teams/${teamId}/booklet?season=${encodeURIComponent(selectedSeason)}`);
              return;
            }
            router.push(`/admin/teams/${teamId}?season=${encodeURIComponent(selectedSeason)}`);
          }}
        >
          {next === "booklet" ? "名鑑へ" : "編集"}
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
