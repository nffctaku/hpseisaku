"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { auth } from "@/lib/firebase";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { ADMIN_UID } from "@/lib/admin-config";

interface SourceMetrics {
  signups: number;
  firstMatch: number;
  paid: number;
}

interface AnalyticsData {
  cohort: "tracked" | "all";
  total: number;
  club: number;
  player: number;
  competition: number;
  match: number;
  paid: number;
  bySource: Record<string, SourceMetrics>;
  sample: {
    viewedSignups: number;
    firstMatch: number;
    paid: number;
  };
  trackedCount: number;
  preTrackingCount: number;
  preTrackingActiveCount: number;
}

function cvr(numerator: number, denominator: number): string {
  if (denominator === 0) return "0%";
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

export default function InternalAnalyticsPage() {
  const { user, loading } = useAuth();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);
  const [cohort, setCohort] = useState<"tracked" | "all">("tracked");

  useEffect(() => {
    if (loading || !user) return;
    if (user.uid !== ADMIN_UID) return;

    const run = async () => {
      setFetching(true);
      setError(null);
      try {
        const currentUser = auth.currentUser;
        if (!currentUser) {
          throw new Error("ログインが必要です");
        }
        const token = await currentUser.getIdToken();
        const res = await fetch(`/api/admin/analytics?cohort=${cohort}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const json = (await res.json()) as AnalyticsData;
        setData(json);
      } catch (e) {
        console.error("[InternalAnalytics] fetch failed", e);
        setError("データの取得に失敗しました");
      } finally {
        setFetching(false);
      }
    };

    void run();
  }, [user, loading, cohort]);

  if (loading || fetching) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0b1220]">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
      </div>
    );
  }

  if (!user || user.uid !== ADMIN_UID) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0b1220] px-4 text-center text-white">
        <p>アクセス権限がありません</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0b1220] px-4 text-center text-white">
        <p>{error || "データがありません"}</p>
      </div>
    );
  }

  const steps = [
    { label: "登録", count: data.total, color: "bg-slate-600" },
    { label: "クラブ作成", count: data.club, color: "bg-emerald-500" },
    { label: "選手登録", count: data.player, color: "bg-emerald-500" },
    { label: "大会作成", count: data.competition, color: "bg-emerald-500" },
    { label: "初試合登録", count: data.match, color: "bg-emerald-500" },
    { label: "課金", count: data.paid, color: "bg-amber-500" },
  ];

  return (
    <main className="min-h-screen bg-[#0b1220] px-4 py-6 text-white sm:px-6 sm:py-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
          <h1 className="text-xl font-black tracking-tight sm:text-2xl">内部 Analytics</h1>
          <Link
            href="/admin/internal-clubs"
            className="text-sm font-bold text-emerald-400 hover:text-emerald-300"
          >
            ユーザーHP 一覧 →
          </Link>
        </div>

        <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-[#111827] p-4 sm:p-6">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-slate-300">対象:</span>
            <button
              onClick={() => setCohort("tracked")}
              className={`rounded-full px-3 py-1 text-xs font-bold transition ${
                cohort === "tracked"
                  ? "bg-emerald-400 text-[#06111f]"
                  : "border border-white/20 text-slate-300 hover:bg-white/5"
              }`}
            >
              計測開始後ユーザー
            </button>
            <button
              onClick={() => setCohort("all")}
              className={`rounded-full px-3 py-1 text-xs font-bold transition ${
                cohort === "all"
                  ? "bg-emerald-400 text-[#06111f]"
                  : "border border-white/20 text-slate-300 hover:bg-white/5"
              }`}
            >
              全ユーザー
            </button>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg bg-[#0b1220] p-3 text-center">
              <p className="text-[10px] text-slate-400">計測開始後</p>
              <p className="text-lg font-black text-emerald-400">{data?.trackedCount ?? 0}</p>
            </div>
            <div className="rounded-lg bg-[#0b1220] p-3 text-center">
              <p className="text-[10px] text-slate-400">既存ユーザー</p>
              <p className="text-lg font-black text-slate-300">{data?.preTrackingCount ?? 0}</p>
            </div>
            <div className="rounded-lg bg-[#0b1220] p-3 text-center">
              <p className="text-[10px] text-slate-400">既存30日アクティブ</p>
              <p className="text-lg font-black text-amber-400">{data?.preTrackingActiveCount ?? 0}</p>
            </div>
          </div>

          {cohort === "all" && (
            <p className="text-xs leading-relaxed text-amber-300">
              計測開始前の既存ユーザーは過去の初回行動を完全には復元できないため、ファネル分析は「計測開始後ユーザー」を推奨します。
            </p>
          )}
        </div>

        <section className="rounded-2xl border border-white/10 bg-[#111827] p-4 sm:p-6">
          <h2 className="mb-4 text-sm font-bold text-slate-300">ファネル</h2>
          <div className="space-y-3">
            {steps.map((step, i) => {
              const next = steps[i + 1];
              const rate = next ? cvr(next.count, step.count) : null;
              return (
                <div key={step.label}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className={`inline-block h-3 w-3 rounded-full ${step.color}`} />
                      <span className="text-sm font-medium">{step.label}</span>
                    </div>
                    <span className="text-lg font-black tabular-nums">{step.count}</span>
                  </div>
                  {rate && (
                    <div className="pl-6 text-xs font-bold text-emerald-400">
                      ↓ {rate}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3 border-t border-white/10 pt-4 sm:grid-cols-3">
            <div className="rounded-lg bg-[#0b1220] p-3 text-center">
              <p className="text-[10px] text-slate-400">Signup → Paid</p>
              <p className="text-lg font-black text-amber-400">{cvr(data.paid, data.total)}</p>
            </div>
            <div className="rounded-lg bg-[#0b1220] p-3 text-center">
              <p className="text-[10px] text-slate-400">First Match → Paid</p>
              <p className="text-lg font-black text-amber-400">{cvr(data.paid, data.match)}</p>
            </div>
            <div className="rounded-lg bg-[#0b1220] p-3 text-center">
              <p className="text-[10px] text-slate-400">First Match Rate</p>
              <p className="text-lg font-black text-emerald-400">{cvr(data.match, data.total)}</p>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-[#111827] p-4 sm:p-6">
          <h2 className="mb-4 text-sm font-bold text-slate-300">流入元別</h2>
          <div className="space-y-2">
            {Object.entries(data.bySource)
              .sort((a, b) => b[1].signups - a[1].signups)
              .map(([source, m]) => (
                <div
                  key={source}
                  className="grid grid-cols-[1fr_60px_60px_60px] items-center gap-2 rounded-lg bg-[#0b1220] px-3 py-2 text-xs sm:grid-cols-[1fr_80px_80px_80px] sm:text-sm"
                >
                  <span className="font-bold">{source}</span>
                  <span className="text-right tabular-nums">登録 {m.signups}</span>
                  <span className="text-right tabular-nums text-emerald-400">初試合 {m.firstMatch}</span>
                  <span className="text-right tabular-nums text-amber-400">課金 {m.paid}</span>
                </div>
              ))}
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-[#111827] p-4 sm:p-6">
          <h2 className="mb-4 text-sm font-bold text-slate-300">サンプルページ</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-lg bg-[#0b1220] p-3 text-center">
              <p className="text-[10px] text-slate-400">サンプル閲覧後登録</p>
              <p className="text-lg font-black">{data.sample.viewedSignups}</p>
            </div>
            <div className="rounded-lg bg-[#0b1220] p-3 text-center">
              <p className="text-[10px] text-slate-400">サンプル → First Match</p>
              <p className="text-lg font-black text-emerald-400">{data.sample.firstMatch}</p>
            </div>
            <div className="rounded-lg bg-[#0b1220] p-3 text-center">
              <p className="text-[10px] text-slate-400">サンプル → Paid</p>
              <p className="text-lg font-black text-amber-400">{data.sample.paid}</p>
            </div>
          </div>
          <p className="mt-3 text-[10px] text-slate-500">
            ※ Sample → Signup CVR の正確な分母は既存アクセス解析の Visitors 数を使用してください。
          </p>
        </section>
      </div>
    </main>
  );
}
