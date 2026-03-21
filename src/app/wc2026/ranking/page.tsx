"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Crown, RefreshCw } from "lucide-react";

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

function initials(name: string) {
  const s = (name || "-").trim();
  if (!s) return "-";
  return s.slice(0, 1).toUpperCase();
}

export default function Wc2026RankingPage() {
  const [ranking, setRanking] = useState<RankingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRanking = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/wc2026/user-points?limit=50", { method: "GET" });
      const data = (await res.json().catch(() => null)) as any;
      if (!res.ok) throw new Error(data?.message || "ランキング取得に失敗しました");

      const rows: RankingRow[] = Array.isArray(data?.ranking)
        ? data.ranking.map((r: any) => ({
            uid: String(r?.uid || ""),
            points: normalizePoints(r?.points),
            displayName: (typeof r?.displayName === "string" && r.displayName.trim()) || fallbackName(String(r?.uid || "")),
          }))
        : [];

      setRanking(rows);
    } catch (e: any) {
      console.error("/wc2026/ranking fetch error", e);
      setError(e?.message || "ランキング取得に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchRanking();
  }, []);

  const top3 = useMemo(() => ranking.slice(0, 3), [ranking]);

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <div className="sticky top-0 z-20 border-b bg-white/80 backdrop-blur">
        <div className="mx-auto w-full max-w-md px-4 h-12 flex items-center justify-between">
          <Link href="/wc2026/top" className="text-xl leading-none text-gray-900" aria-label="back">
            ←
          </Link>
          <div className="text-sm font-semibold text-gray-900">ユーザーランキング</div>
          <Button type="button" variant="ghost" className="h-9 px-2" onClick={fetchRanking} disabled={loading}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="mx-auto w-full max-w-md px-4 py-4 space-y-4">
        <div className="space-y-2">
          <div className="text-center">
            <div className="text-sm font-bold">ユーザーランキング</div>
            <div className="mt-1 text-xs text-gray-500">WC2026</div>
          </div>

          <div className="flex items-center justify-between">
            <button type="button" className="h-9 rounded-md border bg-white px-3 text-xs font-semibold text-gray-700">
              先月 ▾
            </button>
            <Link href="/wc2026/top" className="text-xs font-semibold text-sky-600">
              ユーザーランキングとは ›
            </Link>
          </div>

          <div className="rounded-xl border bg-sky-100 px-3 py-2 text-sm text-sky-900">
            <span className="font-semibold">コミュニティメンバー</span>: {ranking.length.toLocaleString()}人
          </div>
        </div>

        <div className="relative overflow-hidden rounded-2xl border bg-white px-4 pt-5 pb-4">
          <div className="absolute inset-0 -z-10">
            <div className="absolute -left-8 top-10 h-20 w-20 rounded-full bg-sky-200/70" />
            <div className="absolute -right-10 top-6 h-28 w-28 rounded-full bg-sky-400/70" />
            <div className="absolute left-8 top-24 h-2.5 w-2.5 rounded-full bg-red-400/70" />
            <div className="absolute left-20 top-32 h-1.5 w-1.5 rounded-full bg-slate-300/80" />

            <svg className="absolute left-6 top-6 h-8 w-8 text-red-300" viewBox="0 0 24 24" fill="none">
              <path d="M7 3h10l5 9-5 9H7L2 12 7 3Z" stroke="currentColor" strokeWidth="1.5" />
            </svg>
            <svg className="absolute left-20 top-14 h-6 w-6 text-sky-300" viewBox="0 0 24 24" fill="none">
              <path d="M7 3h10l5 9-5 9H7L2 12 7 3Z" stroke="currentColor" strokeWidth="1.5" />
            </svg>
            <svg className="absolute left-36 top-10 h-7 w-7 text-slate-200" viewBox="0 0 24 24" fill="none">
              <path d="M7 3h10l5 9-5 9H7L2 12 7 3Z" stroke="currentColor" strokeWidth="1.5" />
            </svg>
            <svg className="absolute right-28 top-10 h-7 w-7 text-red-200" viewBox="0 0 24 24" fill="none">
              <path d="M7 3h10l5 9-5 9H7L2 12 7 3Z" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </div>

          {!loading && top3.length ? (
            <div className="grid grid-cols-3 items-end gap-2">
              {[
                { r: top3[1], rank: 2 },
                { r: top3[0], rank: 1 },
                { r: top3[2], rank: 3 },
              ]
                .filter((x) => x.r)
                .map(({ r, rank }) => {
                  const ring =
                    rank === 1
                      ? "ring-yellow-300"
                      : rank === 2
                      ? "ring-slate-300"
                      : "ring-amber-300";
                  const badgeBg =
                    rank === 1 ? "bg-yellow-200 text-yellow-900" : rank === 2 ? "bg-slate-200 text-slate-900" : "bg-amber-200 text-amber-900";
                  return (
                    <div key={r!.uid} className={rank === 1 ? "text-center" : "text-center opacity-95"}>
                      <div className="relative mx-auto w-fit">
                        <div
                          className={
                            rank === 1
                              ? `h-20 w-20 rounded-full bg-white ring-4 ${ring} flex items-center justify-center text-2xl font-black text-gray-900`
                              : `h-14 w-14 rounded-full bg-white ring-4 ${ring} flex items-center justify-center text-xl font-black text-gray-900`
                          }
                        >
                          {initials(r!.displayName)}
                        </div>
                        <div
                          className={
                            rank === 1
                              ? "absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-yellow-300 px-2 py-0.5 text-xs font-extrabold text-yellow-900"
                              : `absolute -top-2 left-1/2 -translate-x-1/2 rounded-full ${badgeBg} px-2 py-0.5 text-[11px] font-extrabold`
                          }
                        >
                          {rank === 1 ? (
                            <span className="inline-flex items-center gap-1">
                              <Crown className="h-3.5 w-3.5" />1
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1">
                              <Crown className="h-3 w-3" />{rank}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="mt-2 text-xs font-bold truncate">{r!.displayName}</div>
                      <div className="mt-1 inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-bold text-gray-900">
                        {r!.points}
                      </div>
                    </div>
                  );
                })}
            </div>
          ) : (
            <div className="text-sm text-gray-500">読み込み中...</div>
          )}
        </div>

        {error ? <div className="text-sm text-rose-600">{error}</div> : null}

        <div className="space-y-2">
          {ranking.map((r, idx) => {
            const rank = idx + 1;
            const ring =
              rank === 1
                ? "ring-yellow-300"
                : rank === 2
                ? "ring-slate-300"
                : rank === 3
                ? "ring-amber-300"
                : "ring-gray-200";
            return (
              <div key={r.uid} className="flex items-center justify-between gap-3 rounded-xl border bg-white px-3 py-2">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`h-10 w-10 rounded-full bg-gray-50 ring-2 ${ring} flex items-center justify-center text-sm font-black text-gray-900`}>
                    {initials(r.displayName)}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-bold truncate">
                      {rank === 1 ? (
                        <span className="inline-flex items-center gap-1">
                          <Crown className="h-4 w-4 text-yellow-700" />
                          {r.displayName}
                        </span>
                      ) : (
                        r.displayName
                      )}
                    </div>
                    <div className="mt-0.5 text-[11px] font-semibold text-gray-500">{rank}</div>
                  </div>
                </div>
                <div className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-extrabold text-gray-900">
                  {r.points}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex">
          <Button asChild type="button" className="w-full bg-blue-600 text-white hover:bg-blue-500 focus-visible:ring-blue-400">
            <Link href="/admin/mypage">マイページへ</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
