"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { auth } from "@/lib/firebase";
import { toast } from "sonner";
import { Crown } from "lucide-react";

type UserPointsDoc = {
  points?: number;
  matchPoints?: number;
  groupPoints?: number;
  displayName?: string;
  updatedAt?: any;
};

type RankingRow = {
  uid: string;
  points: number;
  displayName: string;
};

function normalizePoints(v: unknown): number {
  if (typeof v !== "number") return 0;
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.trunc(v));
}

function fallbackName(uid: string) {
  if (!uid) return "-";
  return uid.length <= 10 ? uid : `${uid.slice(0, 6)}...${uid.slice(-4)}`;
}

export default function AdminMyPage() {
  const { user, loading } = useAuth();
  const [myPoints, setMyPoints] = useState<number>(0);
  const [myMatchPoints, setMyMatchPoints] = useState<number>(0);
  const [myGroupPoints, setMyGroupPoints] = useState<number>(0);
  const [ranking, setRanking] = useState<RankingRow[]>([]);

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prevHtmlBg = html.style.backgroundColor;
    const prevBodyBg = body.style.backgroundColor;

    html.style.backgroundColor = "#ffffff";
    body.style.backgroundColor = "#ffffff";

    return () => {
      html.style.backgroundColor = prevHtmlBg;
      body.style.backgroundColor = prevBodyBg;
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    let lastToastAt = 0;

    const parseAndSet = (data: any) => {
      const rows: RankingRow[] = Array.isArray(data?.ranking)
        ? data.ranking.map((r: any) => ({
            uid: String(r?.uid || ""),
            points: normalizePoints(r?.points),
            displayName: (typeof r?.displayName === "string" && r.displayName.trim()) || fallbackName(String(r?.uid || "")),
          }))
        : [];
      setRanking(rows);
      setMyPoints(normalizePoints(data?.me?.points));
      setMyMatchPoints(normalizePoints(data?.me?.matchPoints));
      setMyGroupPoints(normalizePoints(data?.me?.groupPoints));
    };

    const run = async (withAuth: boolean) => {
      try {
        const headers: Record<string, string> = {};
        if (withAuth) {
          const current = auth.currentUser;
          if (!current) return;
          const idToken = await current.getIdToken();
          headers.Authorization = `Bearer ${idToken}`;
        }

        const res = await fetch("/api/wc2026/user-points?limit=50", { headers });
        const data = (await res.json().catch(() => null)) as any;
        if (!res.ok) {
          throw new Error(data?.message || "ポイント取得に失敗しました");
        }

        if (!disposed) {
          parseAndSet(data);
        }
      } catch (e: any) {
        console.error("/admin/mypage fetch error", e);
        const now = Date.now();
        if (now - lastToastAt > 3000) {
          lastToastAt = now;
          toast.error(e?.message || "ポイント取得に失敗しました");
        }
      }
    };

    void run(false);

    if (user?.uid) {
      const unsubscribe = auth.onAuthStateChanged((u) => {
        if (!u) return;
        void run(true);
      });
      return () => {
        disposed = true;
        unsubscribe();
      };
    }

    return () => {
      disposed = true;
    };
  }, [user?.uid]);

  const myRank = useMemo(() => {
    if (!user?.uid) return null;
    const idx = ranking.findIndex((r) => r.uid === user.uid);
    return idx >= 0 ? idx + 1 : null;
  }, [ranking, user?.uid]);

  const top3 = useMemo(() => ranking.slice(0, 3), [ranking]);

  const badgeClass = (rank: number) => {
    if (rank === 1) return "bg-amber-500 text-white";
    if (rank === 2) return "bg-slate-400 text-white";
    return "bg-orange-700 text-white";
  };

  const avatarBg = (rank: number) => {
    if (rank === 1) return "bg-amber-100 text-amber-800";
    if (rank === 2) return "bg-slate-100 text-slate-800";
    return "bg-orange-100 text-orange-800";
  };

  const initials = (name: string) => {
    const s = (name || "-").trim();
    if (!s) return "-";
    return s.slice(0, 1).toUpperCase();
  };

  if (loading) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="sticky top-0 z-20 border-b bg-white/80 backdrop-blur">
        <div className="mx-auto w-full max-w-md px-4 h-12 flex items-center justify-between">
          <Link href="/wc2026/top" className="text-xl leading-none text-gray-900" aria-label="back">
            ←
          </Link>
          <div className="text-sm font-semibold text-gray-900">ユーザーランキング</div>
          <Link href="/admin" className="text-xs font-semibold text-blue-600">管理</Link>
        </div>
      </div>

      <div className="mx-auto w-full max-w-md px-4 py-4 space-y-4">
        <div className="rounded-2xl bg-white px-4 py-4">
          <div className="text-sm text-gray-500">/admin/mypage</div>
          <div className="mt-2 text-3xl font-bold tracking-tight text-gray-900">マイページ</div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button asChild type="button" className="bg-blue-600 text-white hover:bg-blue-500 focus-visible:ring-blue-400">
              <Link href="/wc2026/top" className="whitespace-nowrap">WC2026 TOPへ</Link>
            </Button>
            <Button asChild type="button" variant="outline">
              <Link href="#ranking" className="whitespace-nowrap">ランキングへ</Link>
            </Button>
          </div>
        </div>

        <div className="rounded-2xl bg-white px-4 py-4">
          <div className="text-sm font-semibold text-gray-900">獲得ポイント</div>
          <div className="mt-1 text-xs text-gray-500">ログインユーザーの合計ポイント</div>

          <div className="mt-3 flex items-end justify-between">
            <div className="text-5xl font-bold text-gray-900">{myPoints}</div>
            <div className="text-sm text-gray-500">ランキング: {myRank ?? "-"} 位</div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-gray-50 px-3 py-2">
              <div className="text-xs text-gray-500">試合予想</div>
              <div className="mt-1 text-lg font-bold text-gray-900">{myMatchPoints}P</div>
            </div>
            <div className="rounded-xl bg-gray-50 px-3 py-2">
              <div className="text-xs text-gray-500">GS 1位/2位</div>
              <div className="mt-1 text-lg font-bold text-gray-900">{myGroupPoints}P</div>
            </div>
          </div>
        </div>

        <div id="ranking" className="rounded-2xl bg-white overflow-hidden">
          <div className="relative px-4 pt-4 pb-3">
            <div className="absolute inset-0 -z-10 bg-gradient-to-b from-sky-50 via-white to-white" />
            <div className="absolute -right-10 top-6 h-24 w-24 rounded-full bg-sky-300/60" />
            <div className="absolute left-8 top-14 h-6 w-6 rounded-full bg-red-300/60" />
            <div className="absolute left-20 top-24 h-3 w-3 rounded-full bg-slate-300/60" />

            <div className="text-sm font-semibold text-gray-900">ユーザーランキング</div>
            <div className="mt-1 text-xs text-gray-500">上位50</div>

            <div className="mt-3 rounded-lg bg-sky-100 px-3 py-2 text-sm text-sky-900">
              コミュニティメンバー: {ranking.length.toLocaleString()}人
            </div>
          </div>

          <div className="px-4 pb-3">
            <div className="grid grid-cols-3 gap-2">
              {[
                { r: top3[1], rank: 2 },
                { r: top3[0], rank: 1 },
                { r: top3[2], rank: 3 },
              ]
                .filter((x) => x.r)
                .map(({ r, rank }) => (
                  <div
                    key={r!.uid}
                    className={
                      rank === 1
                        ? "relative rounded-xl border bg-white px-2 py-3 text-center ring-2 ring-yellow-300"
                        : "rounded-xl border bg-white px-2 py-3 text-center"
                    }
                  >
                    {rank === 1 ? (
                      <div className="absolute -top-2 left-1/2 -translate-x-1/2 rounded-full bg-yellow-200 px-2 py-0.5 text-xs font-bold text-yellow-900">
                        <span className="inline-flex items-center gap-1">
                          <Crown className="h-3 w-3" />
                          1位
                        </span>
                      </div>
                    ) : null}
                    <div className="flex items-center justify-center">
                      <div
                        className={`inline-flex items-center justify-center rounded-full px-2 py-0.5 text-xs font-bold ${badgeClass(rank)}`}
                      >
                        #{rank}
                      </div>
                    </div>
                    <div
                      className={`mx-auto mt-2 h-14 w-14 rounded-full flex items-center justify-center text-xl font-bold ${avatarBg(rank)}`}
                    >
                      {initials(r!.displayName)}
                    </div>
                    <div className="mt-2 text-sm font-semibold truncate text-gray-900">{r!.displayName}</div>
                    <div className="mt-1 text-xs font-bold text-gray-900">{r!.points}P</div>
                  </div>
                ))}
            </div>
          </div>

          <div className="divide-y">
            {ranking.map((r, idx) => {
              const rank = idx + 1;
              const highlight = user?.uid && r.uid === user.uid;
              const isTop3 = rank <= 3;

              return (
                <div key={r.uid} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0 flex items-center gap-3">
                    <div
                      className={
                        isTop3
                          ? `h-7 w-7 shrink-0 rounded-full flex items-center justify-center text-xs font-bold ${badgeClass(rank)}`
                          : "h-7 w-7 shrink-0 rounded-full bg-gray-100 text-gray-800 flex items-center justify-center text-xs font-bold"
                      }
                    >
                      {rank === 1 ? (
                        <span className="inline-flex items-center gap-1">
                          <span>1</span>
                          <Crown className="h-3 w-3" />
                        </span>
                      ) : (
                        rank
                      )}
                    </div>
                    <div
                      className={
                        highlight
                          ? "h-9 w-9 shrink-0 rounded-full bg-sky-100 text-sky-900 flex items-center justify-center text-base font-bold"
                          : "h-9 w-9 shrink-0 rounded-full bg-gray-100 text-gray-800 flex items-center justify-center text-base font-bold"
                      }
                    >
                      {initials(r.displayName)}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-gray-900">{r.displayName}</div>
                      {highlight ? (
                        <div className="text-xs font-semibold text-sky-700">あなた</div>
                      ) : (
                        <div className="text-xs text-gray-400">&nbsp;</div>
                      )}
                    </div>
                  </div>
                  <div className={highlight ? "shrink-0 text-sm font-bold text-sky-900" : "shrink-0 text-sm font-bold text-gray-900"}>
                    {r.points}P
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
