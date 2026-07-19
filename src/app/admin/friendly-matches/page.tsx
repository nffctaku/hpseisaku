"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  orderBy,
  serverTimestamp,
} from "firebase/firestore";
import { CalendarDays, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
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
  const [homeTeamId, setHomeTeamId] = useState<string>("");
  const [awayTeamId, setAwayTeamId] = useState<string>("");
  const [customHomeTeamName, setCustomHomeTeamName] = useState<string>("");
  const [customAwayTeamName, setCustomAwayTeamName] = useState<string>("");
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

  const handleDelete = async (matchId: string) => {
    if (!user) return;
    const ok = window.confirm("この試合を削除します。よろしいですか？");
    if (!ok) return;

    try {
      await deleteDoc(doc(db, `clubs/${user.uid}/friendly_matches/${matchId}`));
      setMatches((prev) => prev.filter((m) => m.id !== matchId));
      toast.success("試合を削除しました。");
    } catch (e: any) {
      console.error(e);
      const code = typeof e?.code === "string" ? e.code : "";
      toast.error(`削除に失敗しました。${code ? ` (${code})` : ""}`);
    }
  };

  const handleCreate = async () => {
    if (!user) return;
    const isCustomHome = homeTeamId === "__custom_home__";
    const isCustomAway = awayTeamId === "__custom_away__";
    const customHomeName = customHomeTeamName.trim();
    const customAwayName = customAwayTeamName.trim();
    const home = isCustomHome ? null : teamsMap.get(homeTeamId);
    const away = isCustomAway ? null : teamsMap.get(awayTeamId);
    const homeName = isCustomHome ? customHomeName : home?.name;
    const awayName = isCustomAway ? customAwayName : away?.name;

    if (!homeName || !awayName) {
      toast.error("ホーム/アウェイのチームを選択または入力してください。");
      return;
    }
    if ((isCustomHome ? customHomeName : homeTeamId) === (isCustomAway ? customAwayName : awayTeamId)) {
      toast.error("ホームとアウェイは別のチームを選択してください。");
      return;
    }

    setCreating(true);
    try {
      const competitionName = matchType === 'practice' ? '練習試合' : '親善試合';
      const payload: Omit<FriendlyMatch, "id"> & { createdAt?: any; updatedAt?: any } = {
        competitionId: matchType,
        roundId: "single",
        competitionName,
        roundName: "単発",
        matchDate,
        homeTeam: isCustomHome ? `custom:${customHomeName}` : homeTeamId,
        awayTeam: isCustomAway ? `custom:${customAwayName}` : awayTeamId,
        homeTeamName: homeName,
        awayTeamName: awayName,
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

  const labelClass = "mb-2 text-[13px] font-semibold text-[#1B1F27]";
  const inputClass = "h-10 rounded-lg border-[#E2E4EA] bg-white text-[#1B1F27] focus-visible:ring-[#3355FF33] focus-visible:ring-offset-0";

  return (
    <div className="min-h-screen px-4 py-8 sm:py-10">
      <div className="mx-auto w-full max-w-[560px] space-y-6">
        <div>
          <h1 className="text-[20px] font-bold leading-tight tracking-tight text-white">単発試合（親善/練習試合）</h1>
          <p className="mt-1 text-[13px] text-white/70">リーグ戦とは別枠の親善試合・練習試合を作成します。</p>
        </div>

        <div className="rounded-[10px] border border-[#E2E4EA] bg-white p-[26px]">
          <div className="space-y-5">
            <div>
              <div className={labelClass}>種別</div>
              <Select value={matchType} onValueChange={(v) => setMatchType(v as any)}>
                <SelectTrigger className={`w-full ${inputClass}`}>
                  <SelectValue placeholder="種別" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="friendly">親善試合</SelectItem>
                  <SelectItem value="practice">練習試合</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <div className={labelClass}>日付</div>
              <Input
                type="date"
                value={matchDate}
                onChange={(e) => setMatchDate(e.target.value)}
                className={`${inputClass} [color-scheme:light] [&::-webkit-calendar-picker-indicator]:opacity-70 [&::-webkit-calendar-picker-indicator]:[filter:invert(56%)_sepia(7%)_saturate(400%)_hue-rotate(180deg)]`}
              />
            </div>

            <div className="border-t border-[#E2E4EA]" />

            <div className="grid grid-cols-1 items-start gap-[14px] min-[421px]:grid-cols-[1fr_auto_1fr]">
              <div className="space-y-2">
                <div className={labelClass}>ホーム</div>
                <Select value={homeTeamId} onValueChange={setHomeTeamId}>
                  <SelectTrigger className={inputClass}>
                    <SelectValue placeholder="ホーム" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__custom_home__">自由入力</SelectItem>
                    {teams.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {homeTeamId === "__custom_home__" ? (
                  <Input
                    value={customHomeTeamName}
                    onChange={(e) => setCustomHomeTeamName(e.target.value)}
                    placeholder="ホームチーム名を入力"
                    className={inputClass}
                  />
                ) : null}
              </div>
              <div className="hidden h-10 items-center px-1 pt-7 font-mono text-xs text-[#9CA3AF] min-[421px]:flex">VS</div>
              <div className="space-y-2">
                <div className={labelClass}>アウェイ</div>
                <Select value={awayTeamId} onValueChange={setAwayTeamId}>
                  <SelectTrigger className={inputClass}>
                    <SelectValue placeholder="アウェイ" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__custom_away__">自由入力</SelectItem>
                    {teams.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {awayTeamId === "__custom_away__" ? (
                  <Input
                    value={customAwayTeamName}
                    onChange={(e) => setCustomAwayTeamName(e.target.value)}
                    placeholder="アウェイチーム名を入力"
                    className={inputClass}
                  />
                ) : null}
              </div>
            </div>

            <div>
              <Button
                type="button"
                onClick={handleCreate}
                disabled={creating}
                className="h-10 w-full rounded-lg bg-[#3355FF] px-4 text-sm font-semibold text-white hover:bg-[#2645E0] disabled:opacity-60"
              >
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4 stroke-[2.4]" />}
                作成
              </Button>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-sm font-bold text-white">登録済みの単発試合</h2>
            <span className="font-mono text-xs text-white/60">{matches.length}件</span>
          </div>

          {matches.length === 0 ? (
            <div className="rounded-[10px] border border-dashed border-[#E2E4EA] bg-[#F8F9FB] px-5 py-10 text-center">
              <CalendarDays className="mx-auto h-9 w-9 text-[#9CA3AF]" strokeWidth={1.6} />
              <p className="mt-3 text-[13px] text-[#9CA3AF]">単発試合がありません。</p>
            </div>
          ) : (
            <div className="space-y-3">
              {matches.map((m) => {
                const matchLabel = m.competitionName || (m.competitionId === "practice" ? "練習試合" : "親善試合");
                return (
                  <div key={m.id} className="flex items-center gap-[14px] rounded-lg border border-[#E2E4EA] bg-white px-[18px] py-4 transition hover:bg-[#F8F9FB]">
                    <Link href={`/admin/friendly-matches/${m.id}`} className="grid min-w-0 flex-1 grid-cols-1 items-center gap-3 sm:grid-cols-[auto_1fr_auto]">
                      <span className="w-fit rounded-full bg-[#3355FF14] px-2 py-1 font-mono text-[10px] text-[#3355FF]">{matchLabel}</span>
                      <span className="min-w-0 truncate text-sm font-semibold text-[#1B1F27]">
                        {m.homeTeamName || "Home"} <span className="font-mono text-xs font-normal text-[#9CA3AF]">vs</span> {m.awayTeamName || "Away"}
                      </span>
                      <span className="text-left font-mono text-xs text-[#6B7280] sm:text-right">
                        <span className="block">{m.matchDate}</span>
                      </span>
                    </Link>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      asChild
                      aria-label="試合詳細を入力"
                      className="shrink-0 text-[#9CA3AF] hover:text-[#3355FF]"
                    >
                      <Link href={`/admin/friendly-matches/${m.id}`}>
                        <Pencil className="h-4 w-4" />
                      </Link>
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(m.id)}
                      aria-label="試合を削除"
                      className="shrink-0 text-[#9CA3AF] hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
