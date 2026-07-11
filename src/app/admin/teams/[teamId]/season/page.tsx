"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { collection, doc, getDocs, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { toDashSeason, toSlashSeason } from "@/lib/season";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface Season {
  id: string;
  isPublic?: boolean;
}

const generateSeasonOptions = (): string[] => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const start = month >= 7 ? year : year - 1;
  const maxStartYear = 2059;
  const out: string[] = [];

  // Future seasons up to 2059/60
  for (let y = Math.min(start, maxStartYear); y <= maxStartYear; y += 1) {
    out.push(`${y}/${String((y + 1) % 100).padStart(2, "0")}`);
  }

  // Past seasons (keep existing behavior: last 20 seasons)
  for (let y = start - 1; y >= start - 20; y -= 1) {
    out.push(`${y}/${String((y + 1) % 100).padStart(2, "0")}`);
  }

  out.sort((a, b) => b.localeCompare(a));
  return out;
};

export default function TeamSeasonSelectPage() {
  const { user, ownerUid } = useAuth();
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const teamId = params.teamId as string;
  const clubUid = ownerUid || user?.uid;

  const next = (searchParams.get("next") || "").trim();

  const [seasons, setSeasons] = useState<Season[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<string>("");
  const [newSeasonId, setNewSeasonId] = useState<string>("");
  const [creating, setCreating] = useState(false);
  const [booting, setBooting] = useState(true);

  const seasonOptions = useMemo(() => generateSeasonOptions(), []);
  const availableSeasonOptions = useMemo(() => {
    const existing = new Set(seasons.map((s) => s.id));
    return seasonOptions.filter((s) => !existing.has(s));
  }, [seasons, seasonOptions]);

  useEffect(() => {
    if (!clubUid) return;

    const seasonsColRef = collection(db, `clubs/${clubUid}/seasons`);
    setBooting(true);
    getDocs(seasonsColRef)
      .then((snapshot) => {
        const seasonsData = snapshot.docs
          .map((d) => ({ id: toSlashSeason(d.id), ...(d.data() as any) } as Season))
          .sort((a, b) => b.id.localeCompare(a.id));
        setSeasons(seasonsData);
      })
      .finally(() => {
        setBooting(false);
      });
  }, [clubUid]);

  useEffect(() => {
    if (!newSeasonId.trim()) return;
    if (availableSeasonOptions.includes(newSeasonId)) return;
    if (availableSeasonOptions.length === 0) return;
    setNewSeasonId(availableSeasonOptions[0]);
  }, [availableSeasonOptions, newSeasonId]);

  const canContinue = useMemo(() => selectedSeason.trim().length > 0, [selectedSeason]);
  const canCreate = useMemo(
    () => Boolean(clubUid) && newSeasonId.trim().length > 0 && availableSeasonOptions.length > 0 && !creating,
    [clubUid, newSeasonId, availableSeasonOptions.length, creating]
  );

  const handleCreateSeason = async () => {
    if (!clubUid) {
      toast.error('クラブ情報が未確定のため、シーズンを作成できません。ログイン状態を確認してください。');
      return;
    }
    const id = newSeasonId.trim();
    if (!id) return;
    const docId = toDashSeason(id);
    setCreating(true);
    try {
      const ref = doc(db, `clubs/${clubUid}/seasons`, docId);
      await setDoc(ref, { createdAt: serverTimestamp() } as any, { merge: true });
      const seasonsColRef = collection(db, `clubs/${clubUid}/seasons`);
      const snapshot = await getDocs(seasonsColRef);
      const seasonsData = snapshot.docs
        .map((d) => ({ id: toSlashSeason(d.id), ...(d.data() as any) } as Season))
        .sort((a, b) => b.id.localeCompare(a.id));
      setSeasons(seasonsData);
      setSelectedSeason(id);
      toast.success(`シーズン ${id} を作成しました。`);
    } catch (e) {
      console.error('[TeamSeasonSelectPage] failed to create season', {
        clubUid,
        seasonId: id,
        seasonDocId: docId,
        error: e,
      });
      const code = (e as any)?.code;
      const message = (e as any)?.message;
      toast.error(`シーズン作成に失敗しました${code ? ` (${code})` : ''}`);
      if (message) {
        toast.error(message, { id: 'season-create-error-detail' });
      }
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteSeason = async () => {
    if (!clubUid || !user) return;
    if (!selectedSeason) {
      toast.error("シーズンが選択されていません。");
      return;
    }

    const ok = window.confirm(`シーズン ${selectedSeason} を削除します。\nこのシーズンのロスター/選手のシーズンデータも削除されます。\nよろしいですか？`);
    if (!ok) return;

    try {
      const token = await (auth.currentUser as any)?.getIdToken?.();
      if (!token) {
        toast.error("認証情報を取得できませんでした。再ログインしてください。");
        return;
      }
      const res = await fetch("/api/club/delete-season", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ seasonId: selectedSeason }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(typeof body?.message === "string" ? body.message : `Failed (${res.status})`);
      }

      const seasonsColRef = collection(db, `clubs/${clubUid}/seasons`);
      const snapshot = await getDocs(seasonsColRef);
      const seasonsData = snapshot.docs
        .map((d) => ({ id: toSlashSeason(d.id), ...(d.data() as any) } as Season))
        .sort((a, b) => b.id.localeCompare(a.id));
      setSeasons(seasonsData);
      setSelectedSeason(seasonsData[0]?.id ?? "");

      toast.success(`シーズン ${selectedSeason} を削除しました。`);
    } catch (e) {
      console.error("[TeamSeasonSelectPage] failed to delete season", e);
      toast.error(e instanceof Error ? e.message : "シーズン削除に失敗しました");
    }
  };

  return (
    <div className="max-w-xl">
      {!user || booting ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : (
        <>
          <h1 className="text-3xl font-bold mb-6">シーズン選択</h1>

          <div className="mt-6 space-y-3">
            {seasons.length === 0 ? (
              <div className="text-sm text-muted-foreground">シーズンが未作成です。まずシーズンを作成してください。</div>
            ) : (
              <div className="text-sm text-muted-foreground">登録したい選手のシーズンを登録してください。</div>
            )}
            <div className="flex flex-row gap-0 items-center">
              <Select value={newSeasonId} onValueChange={setNewSeasonId}>
                <SelectTrigger className="w-full sm:w-[180px] h-9 bg-white text-gray-900 text-sm rounded-r-none border-r-0">
                  <SelectValue placeholder="シーズンを選択してください" />
                </SelectTrigger>
                <SelectContent>
                  {availableSeasonOptions.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                size="sm"
                onClick={handleCreateSeason}
                disabled={!canCreate}
                className="whitespace-nowrap bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:hover:bg-blue-600 h-9 text-sm flex-1 rounded-l-none"
              >
                {seasons.length === 0 ? "シーズン作成" : "シーズン追加"}
              </Button>
            </div>
          </div>

          {seasons.length > 0 && (
            <div className="mt-8 space-y-3">
              <div className="flex flex-row gap-0 items-center">
                <Select value={selectedSeason} onValueChange={setSelectedSeason}>
                  <SelectTrigger className="w-full sm:w-[180px] h-9 bg-white text-gray-900 text-sm rounded-r-none border-r-0">
                    <SelectValue placeholder="シーズンを選択してください" />
                  </SelectTrigger>
                  <SelectContent>
                    {seasons.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={!selectedSeason}
                  onClick={handleDeleteSeason}
                  className="bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:hover:bg-red-600 h-9 text-sm flex-1 rounded-l-none"
                >
                  シーズン削除
                </Button>
              </div>

              <div className="mt-4">
                <Button
                  type="button"
                  variant="outline"
                  className="bg-white text-gray-900 border border-border hover:bg-gray-100 w-full"
                  onClick={() => router.push(`/admin/teams/${teamId}?season=${encodeURIComponent(selectedSeason)}`)}
                  disabled={!selectedSeason}
                >
                  選手管理に戻る
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
