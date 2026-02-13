"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { Loader2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MatchTeamStatsForm } from "@/components/match-team-stats-form";
import { SquadRegistrationForm } from "@/components/squad-registration-form";
import { MatchEventsPreview } from "@/components/match-events-preview";
import type { MatchDetails, Player, MatchEvent } from "@/types/match";
import { toast } from "sonner";

interface LocalMatchEvent extends MatchEvent {
  substitutionReason?: string;
}

export default function FriendlyMatchAdminPage() {
  const { user } = useAuth();
  const params = useParams();
  const router = useRouter();
  const matchId = params.matchId as string;

  const [match, setMatch] = useState<MatchDetails | null>(null);
  const [homePlayers, setHomePlayers] = useState<Player[]>([]);
  const [awayPlayers, setAwayPlayers] = useState<Player[]>([]);
  const [events, setEvents] = useState<LocalMatchEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const [editingDate, setEditingDate] = useState<string>("");
  const [editingTime, setEditingTime] = useState<string>("");
  const [editingScoreHome, setEditingScoreHome] = useState<string>("");
  const [editingScoreAway, setEditingScoreAway] = useState<string>("");
  const [savingMeta, setSavingMeta] = useState(false);

  useEffect(() => {
    if (!match) return;
    setEditingDate(match.matchDate || "");
    setEditingTime((match as any).matchTime || "");
    setEditingScoreHome(typeof match.scoreHome === 'number' ? String(match.scoreHome) : "");
    setEditingScoreAway(typeof match.scoreAway === 'number' ? String(match.scoreAway) : "");
  }, [match]);

  useEffect(() => {
    if (!user || !matchId) {
      setLoading(false);
      return;
    }

    setLoading(true);

    const matchDocRef = doc(db, `clubs/${user.uid}/friendly_matches/${matchId}`);
    const fetchPlayers = async (teamId: string): Promise<Player[]> => {
      if (!teamId) return [];
      const playersRef = collection(db, `clubs/${user.uid}/teams/${teamId}/players`);
      const ps = await getDocs(playersRef);
      return ps.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as Player));
    };

    const unsubscribeMatch = onSnapshot(
      matchDocRef,
      async (s) => {
        if (!s.exists()) {
          setMatch(null);
          setLoading(false);
          return;
        }

        const data = s.data() as any;
        const matchData = { id: s.id, ...(data as any) } as any;

        // Ensure required IDs exist for downstream components
        matchData.competitionId = matchData.competitionId || 'friendly';
        matchData.roundId = matchData.roundId || 'single';
        const competitionNameDefault = matchData.competitionId === 'practice' ? '練習試合' : '親善試合';

        setMatch((prev) => {
          const prevAny = prev as any;
          const enriched: MatchDetails = {
            ...(prevAny || {}),
            ...matchData,
            competitionName: matchData.competitionName || prevAny?.competitionName || competitionNameDefault,
            roundName: matchData.roundName || prevAny?.roundName || '単発',
            homeTeamName: matchData.homeTeamName || prevAny?.homeTeamName || 'Home',
            awayTeamName: matchData.awayTeamName || prevAny?.awayTeamName || 'Away',
            homeTeamLogo: matchData.homeTeamLogo || prevAny?.homeTeamLogo,
            awayTeamLogo: matchData.awayTeamLogo || prevAny?.awayTeamLogo,
          } as any;
          return enriched;
        });

        // Players are needed to resolve names in timeline
        if (matchData.homeTeam && matchData.awayTeam) {
          const [hp, ap] = await Promise.all([
            fetchPlayers(matchData.homeTeam),
            fetchPlayers(matchData.awayTeam),
          ]);
          setHomePlayers(hp);
          setAwayPlayers(ap);
        }

        setLoading(false);
      },
      (error) => {
        console.error(error);
        toast.error('試合データの読み込みに失敗しました。');
        setLoading(false);
      }
    );

    return () => {
      unsubscribeMatch();
    };
  }, [user, matchId]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <div className="flex h-screen items-center justify-center">ログインしてください。</div>;
  }

  if (!match) {
    return <div className="flex h-screen items-center justify-center">試合が見つかりませんでした。</div>;
  }

  const matchDocPath = `clubs/${user.uid}/friendly_matches/${match.id}`;

  const handleDeleteMatch = async () => {
    if (!user || !match) return;
    const ok = window.confirm("この試合を削除します。よろしいですか？");
    if (!ok) return;

    try {
      await deleteDoc(doc(db, matchDocPath));
      toast.success("試合を削除しました。");
      router.push("/admin/friendly-matches");
    } catch (e: any) {
      console.error(e);
      const code = typeof e?.code === "string" ? e.code : "";
      toast.error(`削除に失敗しました。${code ? ` (${code})` : ""}`);
    }
  };

  const handleSaveMeta = async () => {
    if (!user || !match) return;
    if (!editingDate) {
      toast.error('日付を入力してください。');
      return;
    }

    const scoreHome = editingScoreHome === '' ? null : Number(editingScoreHome);
    const scoreAway = editingScoreAway === '' ? null : Number(editingScoreAway);

    if (scoreHome !== null && (Number.isNaN(scoreHome) || scoreHome < 0 || scoreHome > 99)) {
      toast.error('ホームのスコアが不正です。');
      return;
    }
    if (scoreAway !== null && (Number.isNaN(scoreAway) || scoreAway < 0 || scoreAway > 99)) {
      toast.error('アウェイのスコアが不正です。');
      return;
    }

    setSavingMeta(true);
    try {
      const ref = doc(db, matchDocPath);
      await updateDoc(ref, {
        matchDate: editingDate,
        matchTime: editingTime || null,
        scoreHome,
        scoreAway,
        updatedAt: serverTimestamp(),
      } as any);
      toast.success('保存しました。');
      setMatch((prev) =>
        prev
          ? ({
              ...(prev as any),
              matchDate: editingDate,
              matchTime: editingTime || null,
              scoreHome,
              scoreAway,
            } as any)
          : prev
      );
    } catch (e: any) {
      console.error(e);
      const code = typeof e?.code === 'string' ? e.code : '';
      toast.error(`保存に失敗しました。${code ? ` (${code})` : ''}`);
    } finally {
      setSavingMeta(false);
    }
  };

  return (
    <div className="container mx-auto max-w-4xl py-6 sm:py-10">
      <div className="mb-4">
        <Link href="/admin/friendly-matches" className="text-sm text-muted-foreground hover:underline">
          ← 単発試合一覧へ戻る
        </Link>
      </div>

      <div className="bg-card border rounded-lg p-6">
        <div className="flex flex-col sm:flex-row sm:justify-center sm:items-center gap-6 mb-6">
          <div className="flex items-center justify-between sm:justify-center sm:w-1/3">
            <div className="flex flex-col items-center gap-2">
              {match.homeTeamLogo && (
                <Image src={match.homeTeamLogo} alt={match.homeTeamName} width={56} height={56} className="rounded-full object-contain" />
              )}
              <h2 className="text-base sm:text-2xl font-bold text-center leading-tight max-w-[10ch] break-words min-h-[2.5rem] sm:min-h-0">
                {match.homeTeamName}
              </h2>
            </div>

            <div className="flex flex-col items-center justify-center px-2 sm:hidden">
              <div className="text-center mb-1">
                <p className="text-xs text-muted-foreground">{match.competitionName} - {match.roundName}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(match.matchDate).toLocaleDateString("ja-JP", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                    weekday: "long",
                  })}
                  {match.matchTime ? ` ${match.matchTime}` : ""}
                </p>
              </div>
              <div className="text-4xl font-bold">
                {typeof match.scoreHome === "number" ? match.scoreHome : "-"}
                <span className="mx-3">-</span>
                {typeof match.scoreAway === "number" ? match.scoreAway : "-"}
              </div>
            </div>

            <div className="flex flex-col items-center gap-2 sm:hidden">
              {match.awayTeamLogo && (
                <Image src={match.awayTeamLogo} alt={match.awayTeamName} width={56} height={56} className="rounded-full object-contain" />
              )}
              <h2 className="text-base sm:text-2xl font-bold text-center leading-tight max-w-[10ch] break-words min-h-[2.5rem] sm:min-h-0">
                {match.awayTeamName}
              </h2>
            </div>
          </div>

          <div className="hidden sm:flex flex-col items-center justify-center px-4">
            <div className="text-center mb-2">
              <p className="text-sm text-muted-foreground">{match.competitionName} - {match.roundName}</p>
              <p className="text-sm text-muted-foreground">
                {new Date(match.matchDate).toLocaleDateString("ja-JP", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                  weekday: "long",
                })}
                {match.matchTime ? ` ${match.matchTime}` : ""}
              </p>
            </div>
            <div className="text-5xl font-bold">
              {typeof match.scoreHome === "number" ? match.scoreHome : "-"}
              <span className="mx-4">-</span>
              {typeof match.scoreAway === "number" ? match.scoreAway : "-"}
            </div>
          </div>

          <div className="hidden sm:flex flex-col items-center gap-2 w-1/3">
            {match.awayTeamLogo && (
              <Image src={match.awayTeamLogo} alt={match.awayTeamName} width={72} height={72} className="rounded-full object-contain" />
            )}
            <h2 className="text-2xl font-bold text-center">{match.awayTeamName}</h2>
          </div>
        </div>

        <div className="mt-4 rounded-lg border bg-muted/20 p-4">
          <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 items-end">
            <div className="col-span-2 sm:col-span-2">
              <div className="text-xs text-muted-foreground mb-1">日付</div>
              <Input
                type="date"
                value={editingDate}
                onChange={(e) => setEditingDate(e.target.value)}
                className="bg-white text-gray-900"
              />
            </div>
            <div className="col-span-2 sm:col-span-2">
              <div className="text-xs text-muted-foreground mb-1">時間</div>
              <Input
                type="time"
                value={editingTime}
                onChange={(e) => setEditingTime(e.target.value)}
                className="bg-white text-gray-900"
              />
            </div>
            <div className="col-span-1 sm:col-span-1">
              <div className="text-xs text-muted-foreground mb-1">ホーム</div>
              <Input
                type="number"
                min={0}
                max={99}
                inputMode="numeric"
                value={editingScoreHome}
                onChange={(e) => setEditingScoreHome(e.target.value)}
                className="bg-white text-gray-900"
                placeholder="-"
              />
            </div>
            <div className="col-span-1 sm:col-span-1">
              <div className="text-xs text-muted-foreground mb-1">アウェイ</div>
              <Input
                type="number"
                min={0}
                max={99}
                inputMode="numeric"
                value={editingScoreAway}
                onChange={(e) => setEditingScoreAway(e.target.value)}
                className="bg-white text-gray-900"
                placeholder="-"
              />
            </div>
          </div>

          <div className="mt-3 flex justify-between gap-2">
            <Button type="button" variant="destructive" onClick={handleDeleteMatch}>
              試合を削除
            </Button>
            <Button type="button" onClick={handleSaveMeta} disabled={savingMeta}>
              {savingMeta ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              保存
            </Button>
          </div>
        </div>
      </div>

      <Tabs defaultValue="match-stats" className="mt-8">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="match-stats" className="px-2 text-xs sm:px-3 sm:text-sm">試合スタッツ</TabsTrigger>
          <TabsTrigger value="match-events" className="px-2 text-xs sm:px-3 sm:text-sm">試合イベント</TabsTrigger>
          <TabsTrigger value="player-stats" className="px-2 text-xs sm:px-3 sm:text-sm">選手スタッツ</TabsTrigger>
        </TabsList>

        <TabsContent value="match-stats">
          <MatchTeamStatsForm
            match={match}
            userId={user.uid}
            competitionId={(match as any).competitionId}
            roundId={(match as any).roundId}
            matchDocPath={matchDocPath}
          />
        </TabsContent>

        <TabsContent value="match-events">
          <MatchEventsPreview match={match} homePlayers={homePlayers} awayPlayers={awayPlayers} />
        </TabsContent>

        <TabsContent value="player-stats">
          <SquadRegistrationForm
            match={match}
            homePlayers={homePlayers}
            awayPlayers={awayPlayers}
            roundId={(match as any).roundId}
            competitionId={(match as any).competitionId}
            matchDocPath={matchDocPath}
            seasonId={(match as any).competitionSeason || (match as any).season || undefined}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
