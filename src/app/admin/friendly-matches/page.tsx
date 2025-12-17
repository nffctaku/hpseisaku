"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import {
  addDoc,
  collection,
  getDocs,
  query,
  orderBy,
  serverTimestamp,
} from "firebase/firestore";
import { Loader2, PlusCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

interface Team {
  id: string;
  name: string;
  logoUrl?: string;
}

interface FriendlyMatch {
  id: string;
  competitionId: string;
  roundId: string;
  competitionName?: string;
  roundName?: string;
  matchDate: string;
  matchTime?: string;
  homeTeam: string;
  awayTeam: string;
  homeTeamName?: string;
  awayTeamName?: string;
  homeTeamLogo?: string;
  awayTeamLogo?: string;
  scoreHome?: number | null;
  scoreAway?: number | null;
}

export default function FriendlyMatchesPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [teams, setTeams] = useState<Team[]>([]);
  const [matches, setMatches] = useState<FriendlyMatch[]>([]);

  const [matchType, setMatchType] = useState<"friendly" | "practice">("friendly");

  const [matchDate, setMatchDate] = useState<string>(() => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  });
  const [matchTime, setMatchTime] = useState<string>("");
  const [homeTeamId, setHomeTeamId] = useState<string>("");
  const [awayTeamId, setAwayTeamId] = useState<string>("");
  const [creating, setCreating] = useState(false);

  const teamsMap = useMemo(() => {
    const m = new Map<string, Team>();
    teams.forEach((t) => m.set(t.id, t));
    return m;
  }, [teams]);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      setLoading(true);
      try {
        const teamsSnap = await getDocs(collection(db, `clubs/${user.uid}/teams`));
        const t = teamsSnap.docs
          .map((d) => ({ id: d.id, ...(d.data() as any) } as Team))
          .sort((a, b) => a.name.localeCompare(b.name));
        setTeams(t);

        const matchesSnap = await getDocs(
          query(
            collection(db, `clubs/${user.uid}/friendly_matches`),
            orderBy("matchDate", "desc")
          )
        );
        const m = matchesSnap.docs.map(
          (d) => ({ id: d.id, ...(d.data() as any) } as FriendlyMatch)
        );
        setMatches(m);

        if (!homeTeamId && t.length > 0) {
          setHomeTeamId(t[0].id);
        }
      } catch (e) {
        console.error(e);
        toast.error("単発試合データの読み込みに失敗しました。")
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user]);

  const handleCreate = async () => {
    if (!user) return;
    if (!homeTeamId || !awayTeamId) {
      toast.error("ホーム/アウェイのチームを選択してください。");
      return;
    }
    if (homeTeamId === awayTeamId) {
      toast.error("ホームとアウェイは別のチームを選択してください。");
      return;
    }

    const home = teamsMap.get(homeTeamId);
    const away = teamsMap.get(awayTeamId);

    setCreating(true);
    try {
      const competitionName = matchType === 'practice' ? '練習試合' : '親善試合';
      const payload: Omit<FriendlyMatch, "id"> & { createdAt?: any; updatedAt?: any } = {
        competitionId: matchType,
        roundId: "single",
        competitionName,
        roundName: "単発",
        matchDate,
        matchTime: matchTime || undefined,
        homeTeam: homeTeamId,
        awayTeam: awayTeamId,
        homeTeamName: home?.name,
        awayTeamName: away?.name,
        homeTeamLogo: home?.logoUrl,
        awayTeamLogo: away?.logoUrl,
        scoreHome: null,
        scoreAway: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      await addDoc(
        collection(db, `clubs/${user.uid}/friendly_matches`),
        payload as any
      );

      toast.success("単発試合を作成しました。");

      const matchesSnap = await getDocs(
        query(
          collection(db, `clubs/${user.uid}/friendly_matches`),
          orderBy("matchDate", "desc")
        )
      );
      setMatches(matchesSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as FriendlyMatch)));
    } catch (e: any) {
      console.error(e);
      const code = typeof e?.code === 'string' ? e.code : '';
      const message = typeof e?.message === 'string' ? e.message : '';
      toast.error(`作成に失敗しました。${code ? ` (${code})` : ''}`);
      if (message) {
        toast.error(message);
      }
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto py-10 flex justify-center items-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <div className="container mx-auto py-10">ログインしてください。</div>;
  }

  return (
    <div className="w-full mx-auto py-8 sm:py-10 px-4 md:px-0">
      <div className="mb-6 sm:mb-8 space-y-4">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">単発試合（親善/練習試合）</h1>

        <div className="rounded-lg border bg-card p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
            <div>
              <div className="text-xs text-muted-foreground mb-1">種別</div>
              <Select value={matchType} onValueChange={(v) => setMatchType(v as any)}>
                <SelectTrigger className="bg-white text-gray-900">
                  <SelectValue placeholder="種別" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="friendly">親善試合</SelectItem>
                  <SelectItem value="practice">練習試合</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">日付</div>
              <Input
                type="date"
                value={matchDate}
                onChange={(e) => setMatchDate(e.target.value)}
                className="bg-white text-gray-900"
              />
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">時間</div>
              <Input
                type="time"
                value={matchTime}
                onChange={(e) => setMatchTime(e.target.value)}
                className="bg-white text-gray-900"
              />
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">ホーム</div>
              <Select value={homeTeamId} onValueChange={setHomeTeamId}>
                <SelectTrigger className="bg-white text-gray-900">
                  <SelectValue placeholder="ホーム" />
                </SelectTrigger>
                <SelectContent>
                  {teams.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">アウェイ</div>
              <Select value={awayTeamId} onValueChange={setAwayTeamId}>
                <SelectTrigger className="bg-white text-gray-900">
                  <SelectValue placeholder="アウェイ" />
                </SelectTrigger>
                <SelectContent>
                  {teams.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex justify-end">
            <Button type="button" onClick={handleCreate} disabled={creating}>
              {creating ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <PlusCircle className="mr-2 h-4 w-4" />
              )}
              作成
            </Button>
          </div>
        </div>
      </div>

      {matches.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground">単発試合がありません。</div>
      ) : (
        <div className="space-y-3">
          {matches.map((m) => (
            <Link
              key={m.id}
              href={`/admin/friendly-matches/${m.id}`}
              className="block rounded-lg border bg-card p-4 hover:bg-muted/30 transition-colors"
            >
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">
                    {(m.homeTeamName || "Home")} vs {(m.awayTeamName || "Away")}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {m.matchDate}{m.matchTime ? ` ${m.matchTime}` : ""}
                  </div>
                </div>
                <div className="text-xs text-muted-foreground whitespace-nowrap">
                  {typeof m.scoreHome === "number" && typeof m.scoreAway === "number"
                    ? `${m.scoreHome} - ${m.scoreAway}`
                    : "未入力"}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
