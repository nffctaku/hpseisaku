"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { auth } from "@/lib/firebase";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { ADMIN_UID } from "@/lib/admin-config";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { jstDayKey, jstDayShift, type AuthSignupAggregate } from "@/lib/admin-analytics/auth-signups";

interface SourceMetrics {
  signups: number;
  firstMatch: number;
  paid: number;
}

interface OcrAnalytics {
  users: { all: number; d7: number; d30: number };
  images: { all: number; d7: number; d30: number };
  attemptedImages: { all: number; d7: number; d30: number };
  planUsers: { free: number; paidPro: number; grantedPro: number };
  avgImages: { free: number | null; paidPro: number | null };
  caps: {
    freeReached: number;
    freeReachRate: number | null;
    proGte50: number;
    proGte150: number;
    proGte250: number;
    proReached: number;
  };
  depth: { once: number; twoPlus: number; fivePlus: number };
  funnel: { reviewed: number; applied: number };
  matchCross: { any: number; gte10: number; gte50: number; gte100: number; active7: number; active30: number };
  conversion: { formerFreeNowPaidPro: number; formerFreeCapNowPaidPro: number };
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
  ocr?: OcrAnalytics | null;
  authGrowth?: AuthSignupAggregate | null;
}

function StatCell({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: string }) {
  return (
    <div className="rounded-lg bg-[#0b1220] p-3 text-center">
      <p className="text-[10px] text-slate-400">{label}</p>
      <p className={`text-lg font-black ${accent ?? "text-white"}`}>{value}</p>
      {sub && <p className="text-[10px] text-slate-500">{sub}</p>}
    </div>
  );
}

function cvr(numerator: number, denominator: number): string {
  if (denominator === 0) return "0%";
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

function AuthGrowthSection({ data }: { data: AuthSignupAggregate }) {
  const [period, setPeriod] = useState<"7" | "30" | "all">("30");

  const chartData = useMemo(() => {
    const countByDate = new Map(data.series.map((d) => [d.date, d.count]));
    const cumByDate = new Map(data.series.map((d) => [d.date, d.cumulative]));
    const today = jstDayKey(Date.now());
    const startDay =
      period === "7"
        ? jstDayShift(today, -6)
        : period === "30"
          ? jstDayShift(today, -29)
          : (data.series[0]?.date ?? today);

    const days: { label: string; count: number; cumulative: number }[] = [];
    let lastCum = 0;
    for (let d = startDay; d <= today && days.length < 4000; d = jstDayShift(d, 1)) {
      lastCum = cumByDate.get(d) ?? lastCum;
      days.push({
        label: `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`,
        count: countByDate.get(d) ?? 0,
        cumulative: lastCum,
      });
    }
    return days;
  }, [data, period]);

  const s = data.summary;
  const deltaText =
    s.deltaPct7vsPrev7 === null
      ? "—"
      : `${s.deltaPct7vsPrev7 >= 0 ? "+" : ""}${(s.deltaPct7vsPrev7 * 100).toFixed(1)}%`;

  return (
    <section className="rounded-2xl border border-white/10 bg-[#111827] p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-slate-300">新規登録ユーザー推移</h2>
        <div className="flex gap-1">
          {(["7", "30", "all"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`rounded-full px-3 py-1 text-xs font-bold transition ${
                period === p
                  ? "bg-emerald-400 text-[#06111f]"
                  : "border border-white/20 text-slate-300 hover:bg-white/5"
              }`}
            >
              {p === "all" ? "全期間" : `${p}日`}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
        <StatCell label="総登録" value={s.total} sub="UID" accent="text-white" />
        <StatCell label="今日" value={s.today} sub="新規" accent="text-emerald-400" />
        <StatCell label="昨日" value={s.yesterday} sub="新規" />
        <StatCell label="直近7日" value={s.last7} sub={`1日平均 ${s.avgPerDay7.toFixed(1)}`} accent="text-emerald-400" />
        <StatCell label="直近30日" value={s.last30} sub="新規" />
        <StatCell label="前7日" value={s.prev7} sub="新規" />
        <StatCell
          label="7日比較"
          value={deltaText}
          sub={s.deltaPct7vsPrev7 === null ? "前7日0件" : `${s.last7 - s.prev7 >= 0 ? "+" : ""}${s.last7 - s.prev7}人`}
          accent={s.deltaPct7vsPrev7 === null ? "text-slate-400" : s.deltaPct7vsPrev7 >= 0 ? "text-emerald-400" : "text-rose-400"}
        />
      </div>

      <div className="mt-5 h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
            <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: "#94a3b8", fontSize: 10 }}
              tickLine={false}
              axisLine={{ stroke: "#334155" }}
              interval="preserveStartEnd"
              minTickGap={24}
            />
            <YAxis
              yAxisId="left"
              tick={{ fill: "#94a3b8", fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
              width={36}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fill: "#fbbf24", fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
              width={40}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#0b1220",
                border: "1px solid rgba(255,255,255,0.15)",
                borderRadius: 8,
                fontSize: 12,
              }}
              labelStyle={{ color: "#94a3b8" }}
              formatter={(value, name) => [
                `${value ?? 0}人`,
                name === "count" ? "新規登録" : "累計登録",
              ]}
            />
            <Bar yAxisId="left" dataKey="count" fill="#34d399" radius={[3, 3, 0, 0]} maxBarSize={28} />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="cumulative"
              stroke="#fbbf24"
              strokeWidth={2}
              dot={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-3 border-t border-white/10 pt-3 text-[10px] leading-relaxed text-slate-500">
        <p>※ 棒: 日別新規登録 / 線: 累計登録（Firebase Auth metadata.creationTime・JST日付基準・disabled含む）</p>
        {data.missingCreationTime > 0 && (
          <p className="text-amber-400">※ creationTime未取得: {data.missingCreationTime}件（日別集計から除外）</p>
        )}
      </div>
    </section>
  );
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
          <div className="flex items-center gap-4">
            <Link
              href="/admin/internal-updates"
              className="text-sm font-bold text-emerald-400 hover:text-emerald-300"
            >
              お知らせ管理 →
            </Link>
            <Link
              href="/admin/internal-clubs"
              className="text-sm font-bold text-emerald-400 hover:text-emerald-300"
            >
              ユーザーHP 一覧 →
            </Link>
          </div>
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

        {data.authGrowth && <AuthGrowthSection data={data.authGrowth} />}

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

        {data.ocr && (
          <section className="rounded-2xl border border-white/10 bg-[#111827] p-4 sm:p-6">
            <h2 className="mb-4 text-sm font-bold text-slate-300">画像自動読み取り β</h2>

            <div className="grid grid-cols-3 gap-3">
              <StatCell label="累計利用" value={data.ocr.users.all} sub="UID" accent="text-emerald-400" />
              <StatCell label="7日利用" value={data.ocr.users.d7} sub="UID" accent="text-emerald-400" />
              <StatCell label="30日利用" value={data.ocr.users.d30} sub="UID" accent="text-emerald-400" />
              <StatCell label="累計画像" value={data.ocr.images.all} sub="枚" />
              <StatCell label="7日画像" value={data.ocr.images.d7} sub="枚" />
              <StatCell label="30日画像" value={data.ocr.images.d30} sub="枚" />
            </div>

            <div className="mt-4 grid grid-cols-3 gap-3 border-t border-white/10 pt-4">
              <StatCell label="Free" value={data.ocr.planUsers.free} sub="UID" />
              <StatCell label="Paid Pro" value={data.ocr.planUsers.paidPro} sub="UID" accent="text-emerald-400" />
              <StatCell label="Granted Pro" value={data.ocr.planUsers.grantedPro} sub="UID" accent="text-amber-400" />
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 border-t border-white/10 pt-4 sm:grid-cols-5">
              <StatCell
                label="Free 15枚到達"
                value={data.ocr.caps.freeReached}
                sub={data.ocr.caps.freeReachRate != null ? `到達率 ${(data.ocr.caps.freeReachRate * 100).toFixed(1)}%` : undefined}
                accent="text-amber-400"
              />
              <StatCell label="Pro 50+" value={data.ocr.caps.proGte50} sub="UID" />
              <StatCell label="Pro 150+" value={data.ocr.caps.proGte150} sub="UID" />
              <StatCell label="Pro 250+" value={data.ocr.caps.proGte250} sub="UID" />
              <StatCell label="Pro 300" value={data.ocr.caps.proReached} sub="UID" accent="text-rose-400" />
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 border-t border-white/10 pt-4 sm:grid-cols-4">
              <StatCell label="利用深度 1回のみ" value={data.ocr.depth.once} sub="UID" />
              <StatCell label="2回以上" value={data.ocr.depth.twoPlus} sub="UID" />
              <StatCell label="5回以上" value={data.ocr.depth.fivePlus} sub="UID" />
              <StatCell label="確認画面まで" value={data.ocr.funnel.reviewed} sub={`→ 試合反映 ${data.ocr.funnel.applied}`} accent="text-emerald-400" />
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 border-t border-white/10 pt-4 sm:grid-cols-3">
              <StatCell label="試合登録あり" value={data.ocr.matchCross.any} sub="UID" />
              <StatCell label="10/50/100試合以上" value={`${data.ocr.matchCross.gte10}/${data.ocr.matchCross.gte50}/${data.ocr.matchCross.gte100}`} sub="UID" />
              <StatCell label="7日/30日アクティブ" value={`${data.ocr.matchCross.active7}/${data.ocr.matchCross.active30}`} sub="UID" accent="text-emerald-400" />
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 border-t border-white/10 pt-4">
              <StatCell label="元Free → 現在Paid Pro" value={data.ocr.conversion.formerFreeNowPaidPro} sub="UID" accent="text-amber-400" />
              <StatCell label="うち15枚到達経験あり" value={data.ocr.conversion.formerFreeCapNowPaidPro} sub="UID" accent="text-amber-400" />
            </div>

            <div className="mt-4 border-t border-white/10 pt-3 text-[10px] leading-relaxed text-slate-500">
              <p>※ 画像数は月間枠を消費した枚数（Free15/Pro300の上限管理と同一）。AI呼出到達は{data.ocr.attemptedImages.all}枚（失敗・読取不可含む）。</p>
              <p>※ 確認画面/試合反映・上限到達日時・CareerIDは計測開始日以降の記録。Free平均{data.ocr.avgImages.free != null ? data.ocr.avgImages.free.toFixed(1) : "-"}枚 / Pro平均{data.ocr.avgImages.paidPro != null ? data.ocr.avgImages.paidPro.toFixed(1) : "-"}枚。</p>
            </div>
          </section>
        )}

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
