"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

type MyPageData = {
  ok: boolean;
  profile: { uid: string; displayName: string; photoURL: string | null };
  badges: { key: string; label: string }[];
  champion: { teamId: string; name: string; code: string; status: "生存" | "敗退" | "未選択" | "未確定" };
  stats: {
    points: number;
    rank: number;
    totalUsers: number;
    outcomeHitRate: number;
    perfectHit: number;
    predictedCount: number;
  };
  theme: "gold" | "silver" | "bronze" | "default";
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
  const [mypage, setMypage] = useState<MyPageData | null>(null);
  const shareCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const theme = mypage?.theme || "default";

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prevHtmlBg = html.style.backgroundColor;
    const prevBodyBg = body.style.backgroundColor;

    const next = theme === "default" ? "#111827" : "#ffffff";
    html.style.backgroundColor = next;
    body.style.backgroundColor = next;

    return () => {
      html.style.backgroundColor = prevHtmlBg;
      body.style.backgroundColor = prevBodyBg;
    };
  }, [theme]);

  useEffect(() => {
    let disposed = false;

    const run = async () => {
      try {
        if (!auth.currentUser) return;
        const idToken = await auth.currentUser.getIdToken();
        const res = await fetch("/api/wc2026/mypage", {
          headers: {
            Authorization: `Bearer ${idToken}`,
          },
        });
        const data = (await res.json().catch(() => null)) as any;
        if (!res.ok) {
          throw new Error(data?.message || "マイページ情報の取得に失敗しました");
        }
        if (!disposed) {
          setMypage(data as MyPageData);
        }
      } catch (e: any) {
        console.error("/admin/mypage wc2026/mypage fetch error", e);
      }
    };

    void run();
    return () => {
      disposed = true;
    };
  }, [user?.uid]);

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

  const themeShellClass =
    theme === "gold"
      ? "min-h-screen bg-gradient-to-br from-yellow-50 via-white to-yellow-100 text-gray-900"
      : theme === "silver"
      ? "min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 text-gray-900"
      : theme === "bronze"
      ? "min-h-screen bg-gradient-to-br from-orange-50 via-white to-amber-100 text-gray-900"
      : "min-h-screen bg-gray-900 text-white";

  const themeCardClass =
    theme === "gold"
      ? "rounded-2xl bg-white ring-2 ring-yellow-300/70 shadow-[0_0_0_1px_rgba(253,224,71,0.35)]"
      : theme === "silver"
      ? "rounded-2xl bg-white ring-2 ring-slate-300/70 shadow-[0_0_0_1px_rgba(148,163,184,0.35)]"
      : theme === "bronze"
      ? "rounded-2xl bg-white ring-2 ring-amber-300/70 shadow-[0_0_0_1px_rgba(251,191,36,0.25)]"
      : "rounded-2xl bg-gray-800 border border-gray-700";

  const themeSubtleClass = theme === "default" ? "text-gray-300" : "text-gray-500";
  const themeMutedTitle = theme === "default" ? "text-white" : "text-gray-900";

  const shareText = useMemo(() => {
    if (!mypage) return "";
    const rankStr = mypage.stats.totalUsers > 0 ? `${mypage.stats.rank}位 / ${mypage.stats.totalUsers}人` : `${mypage.stats.rank}位`;
    const rate = Number.isFinite(mypage.stats.outcomeHitRate) ? mypage.stats.outcomeHitRate.toFixed(1) : "0.0";
    const badgeStr = (mypage.badges || []).map((b) => b.label).join(", ");
    const themeLabel = mypage.theme === "gold" ? "Gold" : mypage.theme === "silver" ? "Silver" : mypage.theme === "bronze" ? "Bronze" : "Standard";
    return `【WC2026予想】${themeLabel}ランク帯\n順位: ${rankStr}\n勝敗的中率: ${rate}%\n称号: ${badgeStr || "なし"}\n#W杯予言者 #W杯2026`;
  }, [mypage]);

  const generateShareImage = () => {
    if (!mypage) return null;
    const canvas = shareCanvasRef.current;
    if (!canvas) return null;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const w = 1200;
    const h = 630;
    canvas.width = w;
    canvas.height = h;

    const bg =
      mypage.theme === "gold"
        ? ["#FFF7D1", "#FFFFFF"]
        : mypage.theme === "silver"
        ? ["#EEF2FF", "#FFFFFF"]
        : mypage.theme === "bronze"
        ? ["#FFF1E7", "#FFFFFF"]
        : ["#0B1220", "#111827"];

    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, bg[0]);
    grad.addColorStop(1, bg[1]);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    const fg = mypage.theme === "default" ? "#FFFFFF" : "#0F172A";
    const sub = mypage.theme === "default" ? "#CBD5E1" : "#334155";

    ctx.fillStyle = fg;
    ctx.font = "bold 56px system-ui, -apple-system, Segoe UI, Roboto";
    ctx.fillText("WC2026 目利き実績", 72, 120);

    ctx.fillStyle = sub;
    ctx.font = "600 30px system-ui, -apple-system, Segoe UI, Roboto";
    const rankStr = mypage.stats.totalUsers > 0 ? `${mypage.stats.rank}位 / ${mypage.stats.totalUsers}人` : `${mypage.stats.rank}位`;
    ctx.fillText(`順位: ${rankStr}`, 72, 190);
    ctx.fillText(`勝敗的中率: ${mypage.stats.outcomeHitRate.toFixed(1)}%`, 72, 240);
    ctx.fillText(`神予想(完全的中): ${mypage.stats.perfectHit}回`, 72, 290);

    const badges = (mypage.badges || []).map((b) => b.label).slice(0, 4);
    ctx.fillText(`称号: ${badges.length ? badges.join(" / ") : "なし"}`, 72, 360);

    ctx.fillStyle = sub;
    ctx.font = "500 22px system-ui, -apple-system, Segoe UI, Roboto";
    ctx.fillText("#W杯予言者  #W杯2026", 72, 430);
    return canvas;
  };

  const downloadShareImage = async () => {
    const canvas = generateShareImage();
    if (!canvas) return;
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = "wc2026_mypage.png";
    a.click();
  };

  const openXIntent = () => {
    const intent = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`;
    window.open(intent, "_blank", "noopener,noreferrer");
  };

  if (loading) {
    return null;
  }

  return (
    <div className={themeShellClass}>
      <div className={theme === "default" ? "sticky top-0 z-20 border-b border-gray-800 bg-gray-900/80 backdrop-blur" : "sticky top-0 z-20 border-b bg-white/80 backdrop-blur"}>
        <div className="mx-auto w-full max-w-md px-4 h-12 flex items-center justify-between">
          <Link
            href="/wc2026/top"
            className={theme === "default" ? "text-xl leading-none text-white" : "text-xl leading-none text-gray-900"}
            aria-label="back"
          >
            ←
          </Link>
          <div className={theme === "default" ? "text-sm font-semibold text-white" : "text-sm font-semibold text-gray-900"}>マイページ</div>
          <Link href="/admin" className={theme === "default" ? "text-xs font-semibold text-sky-300" : "text-xs font-semibold text-blue-600"}>
            管理
          </Link>
        </div>
      </div>

      <div className="mx-auto w-full max-w-md px-4 py-4 space-y-4">
        <div className="flex">
          <Button asChild type="button" className="bg-blue-600 text-white hover:bg-blue-500 focus-visible:ring-blue-400">
            <Link href="/wc2026/top" className="whitespace-nowrap">WC2026 TOPへ</Link>
          </Button>
        </div>

        <div className={`${themeCardClass} px-4 py-4 ${theme === "default" ? "" : ""}`}>
          <div className={`text-sm ${themeSubtleClass}`}>/admin/mypage</div>

          <div className="mt-3 flex items-center gap-3">
            <div className={theme === "default" ? "h-14 w-14 rounded-full bg-gray-700 flex items-center justify-center text-lg font-bold text-white" : "h-14 w-14 rounded-full bg-gray-100 flex items-center justify-center text-lg font-bold text-gray-900"}>
              {initials(mypage?.profile?.displayName || user?.displayName || user?.uid || "-")}
            </div>
            <div className="min-w-0">
              <div className={`text-2xl font-bold tracking-tight ${themeMutedTitle} truncate`}>
                {mypage?.profile?.displayName || user?.displayName || user?.uid || "-"}
              </div>
              <div className={`mt-1 text-xs ${themeSubtleClass} truncate`}>{mypage?.profile?.uid || user?.uid || ""}</div>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {(mypage?.badges || []).length ? (
              mypage!.badges.map((b) => (
                <span
                  key={b.key}
                  className={
                    theme === "default"
                      ? "rounded-full border border-gray-700 bg-gray-900 px-2 py-1 text-xs font-semibold text-gray-200"
                      : "rounded-full border bg-white px-2 py-1 text-xs font-semibold text-gray-700"
                  }
                >
                  {b.label}
                </span>
              ))
            ) : (
              <span className={theme === "default" ? "text-xs text-gray-400" : "text-xs text-gray-500"}>称号: なし</span>
            )}
          </div>

          <div className="mt-3" />
        </div>

        <div className={`${themeCardClass} px-4 py-4`}>
          <div className={`text-sm font-semibold ${themeMutedTitle}`}>スタッツ</div>
          <div className={`mt-1 text-xs ${themeSubtleClass}`}>あなたの目利き実績</div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className={theme === "default" ? "rounded-xl bg-gray-900/40 border border-gray-700 px-3 py-2" : "rounded-xl bg-gray-50 px-3 py-2"}>
              <div className={`text-xs ${themeSubtleClass}`}>累計ポイント</div>
              <div className={`mt-1 text-2xl font-bold ${themeMutedTitle}`}>{mypage?.stats?.points ?? myPoints}P</div>
            </div>
            <div className={theme === "default" ? "rounded-xl bg-gray-900/40 border border-gray-700 px-3 py-2" : "rounded-xl bg-gray-50 px-3 py-2"}>
              <div className={`text-xs ${themeSubtleClass}`}>現在のランキング</div>
              <div className={`mt-1 text-base font-bold ${themeMutedTitle}`}>
                {mypage?.stats?.rank ?? myRank ?? "-"}位
                <span className={`ml-1 text-xs font-semibold ${themeSubtleClass}`}>
                  / {mypage?.stats?.totalUsers ? mypage.stats.totalUsers.toLocaleString() : "-"}人
                </span>
              </div>
            </div>
            <div className={theme === "default" ? "rounded-xl bg-gray-900/40 border border-gray-700 px-3 py-2" : "rounded-xl bg-gray-50 px-3 py-2"}>
              <div className={`text-xs ${themeSubtleClass}`}>勝敗的中率</div>
              <div className={`mt-1 text-2xl font-bold ${themeMutedTitle}`}>
                {(mypage?.stats?.outcomeHitRate ?? 0).toFixed(1)}%
              </div>
            </div>
            <div className={theme === "default" ? "rounded-xl bg-gray-900/40 border border-gray-700 px-3 py-2" : "rounded-xl bg-gray-50 px-3 py-2"}>
              <div className={`text-xs ${themeSubtleClass}`}>神予想(完全的中)</div>
              <div className={`mt-1 text-2xl font-bold ${themeMutedTitle}`}>{mypage?.stats?.perfectHit ?? 0}回</div>
            </div>
          </div>
        </div>

        <div className={`${themeCardClass} px-4 py-4`}>
          <div className={`text-sm font-semibold ${themeMutedTitle}`}>My Champion</div>
          <div className={`mt-1 text-xs ${themeSubtleClass}`}>開幕前に選んだ優勝予想</div>

          <div className="mt-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className={`text-lg font-bold ${themeMutedTitle} truncate`}>{mypage?.champion?.name || "未選択"}</div>
              <div className={`mt-1 text-xs ${themeSubtleClass}`}>{mypage?.champion?.code ? `(${mypage.champion.code})` : ""}</div>
            </div>
            <div
              className={
                mypage?.champion?.status === "生存"
                  ? "shrink-0 rounded-full bg-emerald-600 px-3 py-1 text-xs font-bold text-white"
                  : mypage?.champion?.status === "敗退"
                  ? "shrink-0 rounded-full bg-rose-600 px-3 py-1 text-xs font-bold text-white"
                  : mypage?.champion?.status === "未確定"
                  ? (theme === "default"
                      ? "shrink-0 rounded-full bg-gray-700 px-3 py-1 text-xs font-bold text-white"
                      : "shrink-0 rounded-full bg-gray-200 px-3 py-1 text-xs font-bold text-gray-800")
                  : theme === "default"
                  ? "shrink-0 rounded-full bg-gray-700 px-3 py-1 text-xs font-bold text-white"
                  : "shrink-0 rounded-full bg-gray-200 px-3 py-1 text-xs font-bold text-gray-800"
              }
            >
              {mypage?.champion?.status || "未選択"}
            </div>
          </div>
        </div>

        <div className={`${themeCardClass} px-4 py-4`}>
          <div className={`text-sm font-semibold ${themeMutedTitle}`}>シェア</div>
          <div className={`mt-1 text-xs ${themeSubtleClass}`}>ランク帯・的中率・称号を画像化して共有</div>

          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" variant={theme === "default" ? "secondary" : "outline"} onClick={downloadShareImage} disabled={!mypage}>
              画像を生成して保存
            </Button>
            <Button type="button" className="bg-blue-600 text-white hover:bg-blue-500" onClick={openXIntent} disabled={!mypage}>
              Xで投稿
            </Button>
          </div>
          <canvas ref={(el) => (shareCanvasRef.current = el)} className="hidden" />
        </div>

        <div id="ranking" className={theme === "default" ? "rounded-2xl bg-gray-800 border border-gray-700 overflow-hidden" : "rounded-2xl bg-white overflow-hidden"}>
          <div className="relative px-4 pt-4 pb-3">
            <div
              className={
                theme === "default"
                  ? "absolute inset-0 -z-10 bg-gradient-to-b from-gray-800 via-gray-900 to-gray-900"
                  : "absolute inset-0 -z-10 bg-gradient-to-b from-sky-50 via-white to-white"
              }
            />
            <div className="absolute -right-10 top-6 h-24 w-24 rounded-full bg-sky-300/60" />
            <div className="absolute left-8 top-14 h-6 w-6 rounded-full bg-red-300/60" />
            <div className="absolute left-20 top-24 h-3 w-3 rounded-full bg-slate-300/60" />

            <div className={theme === "default" ? "text-sm font-semibold text-white" : "text-sm font-semibold text-gray-900"}>ユーザーランキング</div>
            <div className={theme === "default" ? "mt-1 text-xs text-gray-300" : "mt-1 text-xs text-gray-500"}>上位50</div>

            <div className={theme === "default" ? "mt-3 rounded-lg bg-gray-900/40 border border-gray-700 px-3 py-2 text-sm text-gray-200" : "mt-3 rounded-lg bg-sky-100 px-3 py-2 text-sm text-sky-900"}>
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
                        ? theme === "default"
                          ? "relative rounded-xl border border-yellow-400/60 bg-gray-900/30 px-2 py-3 text-center ring-2 ring-yellow-300"
                          : "relative rounded-xl border bg-white px-2 py-3 text-center ring-2 ring-yellow-300"
                        : theme === "default"
                        ? "rounded-xl border border-gray-700 bg-gray-900/30 px-2 py-3 text-center"
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
                    <div className={theme === "default" ? "mt-2 text-sm font-semibold truncate text-white" : "mt-2 text-sm font-semibold truncate text-gray-900"}>
                      {r!.displayName}
                    </div>
                    <div className={theme === "default" ? "mt-1 text-xs font-bold text-white" : "mt-1 text-xs font-bold text-gray-900"}>
                      {r!.points}P
                    </div>
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
                <div key={r.uid} className={theme === "default" ? "flex items-center justify-between gap-3 px-4 py-3" : "flex items-center justify-between gap-3 px-4 py-3"}>
                  <div className="min-w-0 flex items-center gap-3">
                    <div
                      className={
                        isTop3
                          ? `h-7 w-7 shrink-0 rounded-full flex items-center justify-center text-xs font-bold ${badgeClass(rank)}`
                          : theme === "default"
                          ? "h-7 w-7 shrink-0 rounded-full bg-gray-700 text-white flex items-center justify-center text-xs font-bold"
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
                          ? theme === "default"
                            ? "h-9 w-9 shrink-0 rounded-full bg-sky-900/60 text-white flex items-center justify-center text-base font-bold"
                            : "h-9 w-9 shrink-0 rounded-full bg-sky-100 text-sky-900 flex items-center justify-center text-base font-bold"
                          : theme === "default"
                          ? "h-9 w-9 shrink-0 rounded-full bg-gray-700 text-white flex items-center justify-center text-base font-bold"
                          : "h-9 w-9 shrink-0 rounded-full bg-gray-100 text-gray-800 flex items-center justify-center text-base font-bold"
                      }
                    >
                      {initials(r.displayName)}
                    </div>
                    <div className="min-w-0">
                      <div className={theme === "default" ? "truncate font-semibold text-white" : "truncate font-semibold text-gray-900"}>
                        {r.displayName}
                      </div>
                      {highlight ? (
                        <div className={theme === "default" ? "text-xs font-semibold text-sky-300" : "text-xs font-semibold text-sky-700"}>
                          あなた
                        </div>
                      ) : (
                        <div className={theme === "default" ? "text-xs text-gray-500" : "text-xs text-gray-400"}>&nbsp;</div>
                      )}
                    </div>
                  </div>
                  <div
                    className={
                      highlight
                        ? theme === "default"
                          ? "shrink-0 text-sm font-bold text-sky-300"
                          : "shrink-0 text-sm font-bold text-sky-900"
                        : theme === "default"
                        ? "shrink-0 text-sm font-bold text-white"
                        : "shrink-0 text-sm font-bold text-gray-900"
                    }
                  >
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
