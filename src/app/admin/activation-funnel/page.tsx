"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { auth } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

interface FunnelStep {
  key: string;
  label: string;
  count: number;
  prev: number;
  rateFromTotal: number;
  cvrFromPrev: number;
}

interface FunnelUser {
  uid: string;
  email: string | null;
  hasProfile: boolean;
  clubNameSet: boolean;
  hasTeam: boolean;
  hasPlayer: boolean;
  hasCompetition: boolean;
  hasMatch: boolean;
  has10Matches: boolean;
  has50Matches: boolean;
  has100Matches: boolean;
  active7: boolean;
  active30: boolean;
  isPaidPro: boolean;
  isGrantedPro: boolean;
  isFree: boolean;
  matchCount: number;
  profileCount: number;
}

interface AvgMedian { avg: number; median: number }

interface PaidAnalysis {
  count: number;
  matchCount: AvgMedian;
  playerCount: AvgMedian;
  playerImageCount: AvgMedian;
  teamCount: AvgMedian;
  teamImageCount: AvgMedian;
  competitionCount: AvgMedian;
  active7: number;
  active30: number;
  daysToPaid: AvgMedian;
}

interface CohortKpis {
  total: number;
  hasProfile: number;
  hasTeam: number;
  hasPlayer: number;
  hasCompetition: number;
  hasMatch: number;
  has10Matches: number;
  isPaidPro: number;
  active7: number;
  active30: number;
  [key: string]: number;
}

interface FunnelResponse {
  earlyAccessAt: number;
  globalReleaseAt: number;
  cohort: string;
  summary: Record<string, number>;
  funnel: FunnelStep[];
  matchDepth: FunnelStep[];
  active: FunnelStep[];
  pro: FunnelStep[];
  freeUsage: Record<string, number>;
  paidAnalysis: PaidAnalysis;
  paidVsFree: Record<string, { paid: number; free: number }>;
  dropoff: { key: string; label: string; count: number }[];
  noMatch: Record<string, number>;
  coreUsers: Record<string, number>;
  preVsCohorts: {
    pre: CohortKpis;
    earlyAccess: CohortKpis;
    globalLaunch: CohortKpis;
  };
  weekly: { week: number; total: number; hasMatch: number; has10Matches: number; active7: number; isPaidPro: number }[];
  postTimeToFirstValue: Record<string, AvgMedian>;
  utm: {
    campaign: { name: string; total: number; hasMatch: number; isPaidPro: number }[];
    source: { name: string; total: number; hasMatch: number; isPaidPro: number }[];
  };
  kpiTargets: { team: number; player: number; match: number };
  duplicate: {
    duplicateProfileUsers: number;
    extraProfiles: number;
    totalCompetitionDocs: number;
    unmappedCompetitionDocs: number;
  };
  consistency: Record<string, boolean>;
  users: FunnelUser[] | null;
}

const FILTERS: { key: keyof FunnelUser; label: string }[] = [
  { key: "hasProfile", label: "profile保有" },
  { key: "clubNameSet", label: "クラブ名設定" },
  { key: "hasTeam", label: "チーム登録" },
  { key: "hasPlayer", label: "選手登録" },
  { key: "hasCompetition", label: "大会登録" },
  { key: "hasMatch", label: "試合登録" },
  { key: "has10Matches", label: "10試合以上" },
  { key: "has50Matches", label: "50試合以上" },
  { key: "has100Matches", label: "100試合以上" },
  { key: "active7", label: "7日Active" },
  { key: "active30", label: "30日Active" },
  { key: "isPaidPro", label: "Paid Pro" },
  { key: "isGrantedPro", label: "Granted Pro" },
];

function renderMilestone(s: FunnelStep) {
  return (
    <div key={s.key} className="grid grid-cols-12 gap-2 items-center text-sm p-2 rounded bg-slate-800/30 hover:bg-slate-800/50">
      <div className="col-span-4 text-slate-300">{s.label}</div>
      <div className="col-span-2 text-right font-mono text-slate-100">{s.count}</div>
      <div className="col-span-3 text-right text-xs text-slate-400">登録者比 {s.rateFromTotal}%</div>
      <div className="hidden sm:col-span-3 h-2 bg-slate-700 rounded overflow-hidden">
        <div className="h-full bg-indigo-500" style={{ width: `${Math.min(100, s.rateFromTotal)}%` }} />
      </div>
    </div>
  );
}

function renderDepth(s: FunnelStep, base: number) {
  const matchBaseRate = base > 0 ? Math.round((s.count / base) * 1000) / 10 : 0;
  return (
    <div key={s.key} className="grid grid-cols-12 gap-2 items-center text-sm p-2 rounded bg-slate-800/30 hover:bg-slate-800/50">
      <div className="col-span-4 text-slate-300">{s.label}</div>
      <div className="col-span-2 text-right font-mono text-slate-100">{s.count}</div>
      <div className="col-span-3 text-right text-xs text-slate-400">登録者比 {s.rateFromTotal}%</div>
      <div className="col-span-3 text-right text-xs text-emerald-400">試合登録者比 {matchBaseRate}%</div>
    </div>
  );
}

function renderSimple(s: FunnelStep) {
  return (
    <div key={s.key} className="grid grid-cols-12 gap-2 items-center text-sm p-2 rounded bg-slate-800/30 hover:bg-slate-800/50">
      <div className="col-span-4 text-slate-300">{s.label}</div>
      <div className="col-span-2 text-right font-mono text-slate-100">{s.count}</div>
      <div className="col-span-3 text-right text-xs text-slate-400">登録者比 {s.rateFromTotal}%</div>
    </div>
  );
}

export default function ActivationFunnelPage() {
  const [result, setResult] = useState<FunnelResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState(false);
  const [filterKey, setFilterKey] = useState<string | null>(null);
  const [cohort, setCohort] = useState<'all' | 'pre_fc27' | 'early_access' | 'global_launch'>('all');

  const fetchFunnel = useCallback(async (withDetails = false) => {
    setLoading(true);
    setError(null);
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        setError("ログインしていません。");
        return;
      }
      const token = await currentUser.getIdToken();
      const base = "/api/admin/activation-funnel";
      const params = new URLSearchParams();
      if (withDetails) params.set("full", "1");
      if (cohort !== "all") params.set("cohort", cohort);
      const url = `${base}?${params.toString()}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        setError(String(body.message) || `HTTP ${res.status}`);
        return;
      }
      const data = (await res.json()) as FunnelResponse;
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "APIの呼び出しに失敗しました。");
    } finally {
      setLoading(false);
    }
  }, [cohort]);

  const filteredUsers = useMemo(() => {
    if (!result?.users || !filterKey) return result?.users || [];
    return result.users.filter((u) => u[filterKey as keyof FunnelUser]);
  }, [result, filterKey]);

  useEffect(() => {
    if (details && result && !result.users) {
      fetchFunnel(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [details, result]);

  useEffect(() => {
    if (result) {
      fetchFunnel(!!result.users);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cohort]);

  return (
    <div className="min-h-screen bg-[#0b1220] p-4 md:p-6 text-slate-100">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">Activation Milestones（UID単位）</h1>
          <Button onClick={() => fetchFunnel()} disabled={loading} className="bg-indigo-600 hover:bg-indigo-700">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "集計実行"}
          </Button>
        </div>

        {error && (
          <div className="rounded-lg bg-rose-900/40 p-4 text-rose-200 border border-rose-700">
            {error}
          </div>
        )}

        {result && (
          <>
            <Card className="bg-[#141d2e] border-slate-700">
              <CardHeader>
                <CardTitle className="text-slate-200">FC27 対象コホート</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {[
                    { key: 'all', label: '全ユーザー' },
                    { key: 'pre_fc27', label: 'FC27発売前' },
                    { key: 'early_access', label: '早期アクセス' },
                    { key: 'global_launch', label: '正式発売後' },
                  ].map((c) => (
                    <Button
                      key={c.key}
                      size="sm"
                      variant={cohort === c.key ? 'default' : 'outline'}
                      onClick={() => setCohort(c.key as 'all' | 'pre_fc27' | 'early_access' | 'global_launch')}
                      className="border-slate-600"
                    >
                      {c.label}
                    </Button>
                  ))}
                </div>
                <p className="text-xs text-slate-500">
                  早期アクセス: {new Date(result.earlyAccessAt).toLocaleDateString('ja-JP')} JST / 
                  正式発売: {new Date(result.globalReleaseAt).toLocaleDateString('ja-JP')} JST
                  （登録日時で判定。発売後に再訪した既存ユーザーは発売前に分類されます）
                </p>
              </CardContent>
            </Card>

            <Card className="bg-[#141d2e] border-slate-700">
              <CardHeader>
                <CardTitle className="text-slate-200">FC27 KPI 目標（参考値）</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-3 gap-2 text-sm">
                <div className="p-2 bg-slate-800/50 rounded text-center">
                  <div className="text-slate-400 text-xs">チーム登録率目標</div>
                  <div className="text-lg font-bold text-slate-100">{result.kpiTargets.team}%</div>
                </div>
                <div className="p-2 bg-slate-800/50 rounded text-center">
                  <div className="text-slate-400 text-xs">選手登録率目標</div>
                  <div className="text-lg font-bold text-slate-100">{result.kpiTargets.player}%</div>
                </div>
                <div className="p-2 bg-slate-800/50 rounded text-center">
                  <div className="text-slate-400 text-xs">初試合登録率目標</div>
                  <div className="text-lg font-bold text-slate-100">{result.kpiTargets.match}%</div>
                </div>
                <p className="col-span-3 text-xs text-slate-500">※目標値です。実績と混同しないでください。</p>
              </CardContent>
            </Card>

            <Card className="bg-[#141d2e] border-slate-700">
              <CardHeader>
                <CardTitle className="text-slate-200">FC27 発売前 / 早期アクセス / 正式発売後</CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-2">
                <div className="grid grid-cols-5 gap-2 text-xs text-slate-400 border-b border-slate-700 pb-1">
                  <div>指標</div>
                  <div className="text-right">発売前</div>
                  <div className="text-right">早期アクセス</div>
                  <div className="text-right">正式発売後</div>
                  <div className="text-right">早期→正式差分</div>
                </div>
                {[
                  ['登録数', 'total'],
                  ['profile保有率', 'hasProfile'],
                  ['チーム登録率', 'hasTeam'],
                  ['選手登録率', 'hasPlayer'],
                  ['大会登録率', 'hasCompetition'],
                  ['初試合登録率', 'hasMatch'],
                  ['10試合到達率', 'has10Matches'],
                  ['Paid Pro率', 'isPaidPro'],
                  ['7日Active率', 'active7'],
                  ['30日Active率', 'active30'],
                ].map(([label, key]) => {
                  const pre = result.preVsCohorts.pre[key];
                  const early = result.preVsCohorts.earlyAccess[key];
                  const global = result.preVsCohorts.globalLaunch[key];
                  const diff = global - early;
                  const isRate = key !== 'total';
                  return (
                    <div key={key} className="grid grid-cols-5 gap-2 p-2 bg-slate-800/50 rounded">
                      <div className="text-slate-300">{label}</div>
                      <div className="text-right font-mono">{isRate ? `${pre}%` : pre}</div>
                      <div className="text-right font-mono">{isRate ? `${early}%` : early}</div>
                      <div className="text-right font-mono">{isRate ? `${global}%` : global}</div>
                      <div className={`text-right font-mono ${diff >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                        {isRate ? `${diff >= 0 ? '+' : ''}${diff}pt` : `${diff >= 0 ? '+' : ''}${diff}`}
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            <Card className="bg-[#141d2e] border-slate-700">
              <CardHeader>
                <CardTitle className="text-slate-200">FC27 発売後 週次コホート</CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-2">
                <div className="grid grid-cols-6 gap-2 text-xs text-slate-400 border-b border-slate-700 pb-1">
                  <div>Week</div>
                  <div className="text-right">登録者</div>
                  <div className="text-right">初試合率</div>
                  <div className="text-right">10試合率</div>
                  <div className="text-right">7日Active</div>
                  <div className="text-right">Paid率</div>
                </div>
                {result.weekly.map((w) => (
                  <div key={w.week} className="grid grid-cols-6 gap-2 p-2 bg-slate-800/50 rounded">
                    <div className="text-slate-300">Week {w.week}</div>
                    <div className="text-right font-mono">{w.total}</div>
                    <div className="text-right font-mono">{w.hasMatch}%</div>
                    <div className="text-right font-mono">{w.has10Matches}%</div>
                    <div className="text-right font-mono">{w.active7}%</div>
                    <div className="text-right font-mono">{w.isPaidPro}%</div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="bg-[#141d2e] border-slate-700">
              <CardHeader>
                <CardTitle className="text-slate-200">FC27 発売後 初回価値到達時間（日）</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                {Object.entries(result.postTimeToFirstValue).map(([key, v]) => (
                  <div key={key} className="p-2 bg-slate-800/50 rounded text-center">
                    <div className="text-slate-400 text-xs">{key}</div>
                    <div className="font-mono">avg {v.avg.toFixed(1)}</div>
                    <div className="font-mono text-slate-500">med {v.median}</div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="bg-[#141d2e] border-slate-700">
              <CardHeader>
                <CardTitle className="text-slate-200">FC27 発売後 UTM Source</CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-2">
                <div className="grid grid-cols-4 gap-2 text-xs text-slate-400 border-b border-slate-700 pb-1">
                  <div>Source</div>
                  <div className="text-right">登録数</div>
                  <div className="text-right">初試合率</div>
                  <div className="text-right">Paid率</div>
                </div>
                {result.utm.source.map((u) => (
                  <div key={u.name} className="grid grid-cols-4 gap-2 p-2 bg-slate-800/50 rounded">
                    <div className="text-slate-300">{u.name}</div>
                    <div className="text-right font-mono">{u.total}</div>
                    <div className="text-right font-mono">{u.hasMatch}%</div>
                    <div className="text-right font-mono">{u.isPaidPro}%</div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="bg-[#141d2e] border-slate-700">
              <CardHeader>
                <CardTitle className="text-slate-200">FC27 発売後 UTM Campaign</CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-2">
                <div className="grid grid-cols-4 gap-2 text-xs text-slate-400 border-b border-slate-700 pb-1">
                  <div>Campaign</div>
                  <div className="text-right">登録数</div>
                  <div className="text-right">初試合率</div>
                  <div className="text-right">Paid率</div>
                </div>
                {result.utm.campaign.map((u) => (
                  <div key={u.name} className="grid grid-cols-4 gap-2 p-2 bg-slate-800/50 rounded">
                    <div className="text-slate-300">{u.name}</div>
                    <div className="text-right font-mono">{u.total}</div>
                    <div className="text-right font-mono">{u.hasMatch}%</div>
                    <div className="text-right font-mono">{u.isPaidPro}%</div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="bg-[#141d2e] border-slate-700">
              <CardHeader>
                <CardTitle className="text-slate-200">Activation Milestones</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-xs text-slate-500">登録者全体に対する到達率。これらは必ずしも順番どおりではありません。</p>
                {result.funnel.map(renderMilestone)}
              </CardContent>
            </Card>

            <Card className="bg-[#141d2e] border-slate-700">
              <CardHeader>
                <CardTitle className="text-slate-200">試合記録ユーザーの深度</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {result.matchDepth.map((s) => renderDepth(s, result.summary.hasMatch))}
              </CardContent>
            </Card>

            <Card className="bg-[#141d2e] border-slate-700">
              <CardHeader>
                <CardTitle className="text-slate-200">Retention</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {result.active.map(renderSimple)}
              </CardContent>
            </Card>

            <Card className="bg-[#141d2e] border-slate-700">
              <CardHeader>
                <CardTitle className="text-slate-200">Monetization</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {result.pro.map(renderSimple)}
              </CardContent>
            </Card>

            <Card className="bg-[#141d2e] border-slate-700">
              <CardHeader>
                <CardTitle className="text-slate-200">Free 高利用ユーザー</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                <div className="p-3 bg-slate-800/50 rounded text-center">
                  <div className="text-slate-400">Free 10試合以上</div>
                  <div className="text-2xl font-bold text-slate-100">{result.freeUsage.has10Matches}</div>
                </div>
                <div className="p-3 bg-rose-900/30 rounded text-center border border-rose-800">
                  <div className="text-rose-300">Free 50試合以上</div>
                  <div className="text-2xl font-bold text-rose-200">{result.freeUsage.has50Matches}</div>
                </div>
                <div className="p-3 bg-rose-900/30 rounded text-center border border-rose-800">
                  <div className="text-rose-300">Free 100試合以上</div>
                  <div className="text-2xl font-bold text-rose-200">{result.freeUsage.has100Matches}</div>
                </div>
                <div className="p-3 bg-slate-800/50 rounded text-center">
                  <div className="text-slate-400">選手画像10人以上</div>
                  <div className="text-2xl font-bold text-slate-100">{result.freeUsage.hasPlayerImage10}</div>
                </div>
                <div className="p-3 bg-slate-800/50 rounded text-center">
                  <div className="text-slate-400">選手画像20人以上</div>
                  <div className="text-2xl font-bold text-slate-100">{result.freeUsage.hasPlayerImage20}</div>
                </div>
                <div className="p-3 bg-slate-800/50 rounded text-center">
                  <div className="text-slate-400">チーム画像あり</div>
                  <div className="text-2xl font-bold text-slate-100">{result.freeUsage.hasTeamImage}</div>
                </div>
                <div className="p-3 bg-slate-800/50 rounded text-center">
                  <div className="text-slate-400">30日Active</div>
                  <div className="text-2xl font-bold text-slate-100">{result.freeUsage.active30}</div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-[#141d2e] border-slate-700">
              <CardHeader>
                <CardTitle className="text-slate-200">Paid Pro 分析（{result.paidAnalysis.count}人）</CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2 bg-slate-800/50 rounded flex justify-between">
                    <span className="text-slate-400">平均試合数</span>
                    <span>{result.paidAnalysis.matchCount.avg.toFixed(1)}</span>
                  </div>
                  <div className="p-2 bg-slate-800/50 rounded flex justify-between">
                    <span className="text-slate-400">中央値試合数</span>
                    <span>{result.paidAnalysis.matchCount.median}</span>
                  </div>
                  <div className="p-2 bg-slate-800/50 rounded flex justify-between">
                    <span className="text-slate-400">平均選手数</span>
                    <span>{result.paidAnalysis.playerCount.avg.toFixed(1)}</span>
                  </div>
                  <div className="p-2 bg-slate-800/50 rounded flex justify-between">
                    <span className="text-slate-400">中央値選手数</span>
                    <span>{result.paidAnalysis.playerCount.median}</span>
                  </div>
                  <div className="p-2 bg-slate-800/50 rounded flex justify-between">
                    <span className="text-slate-400">平均チーム数</span>
                    <span>{result.paidAnalysis.teamCount.avg.toFixed(1)}</span>
                  </div>
                  <div className="p-2 bg-slate-800/50 rounded flex justify-between">
                    <span className="text-slate-400">中央値チーム数</span>
                    <span>{result.paidAnalysis.teamCount.median}</span>
                  </div>
                  <div className="p-2 bg-slate-800/50 rounded flex justify-between">
                    <span className="text-slate-400">30日Active</span>
                    <span>{result.paidAnalysis.active30}人</span>
                  </div>
                  <div className="p-2 bg-slate-800/50 rounded flex justify-between">
                    <span className="text-slate-400">7日Active</span>
                    <span>{result.paidAnalysis.active7}人</span>
                  </div>
                  <div className="p-2 bg-slate-800/50 rounded flex justify-between">
                    <span className="text-slate-400">平均課金までの日数</span>
                    <span>{result.paidAnalysis.daysToPaid.avg.toFixed(1)}日</span>
                  </div>
                  <div className="p-2 bg-slate-800/50 rounded flex justify-between">
                    <span className="text-slate-400">中央値課金までの日数</span>
                    <span>{result.paidAnalysis.daysToPaid.median}日</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-[#141d2e] border-slate-700">
              <CardHeader>
                <CardTitle className="text-slate-200">Paid vs Free 比較</CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-2">
                {Object.entries(result.paidVsFree).map(([key, v]) => (
                  <div key={key} className="grid grid-cols-3 gap-2 p-2 bg-slate-800/50 rounded">
                    <div className="text-slate-300">{key}</div>
                    <div className="text-emerald-300 text-right">Paid {v.paid}%</div>
                    <div className="text-slate-300 text-right">Free {v.free}%</div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="bg-[#141d2e] border-slate-700">
              <CardHeader>
                <CardTitle className="text-slate-200">初試合までの離脱状態</CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-2">
                {result.dropoff.map((s) => (
                  <div key={s.key} className="grid grid-cols-12 gap-2 items-center p-2 bg-slate-800/50 rounded">
                    <div className="col-span-6 text-slate-300">{s.label}</div>
                    <div className="col-span-3 text-right font-mono text-slate-100">{s.count}</div>
                    <div className="col-span-3 text-right text-xs text-slate-400">
                      {result.summary.total > 0 ? Math.round((s.count / result.summary.total) * 1000) / 10 : 0}%
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="bg-[#141d2e] border-slate-700">
              <CardHeader>
                <CardTitle className="text-slate-200">初試合未到達ユーザーの内訳</CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2 bg-slate-800/50 rounded flex justify-between">
                    <span className="text-slate-400">試合未登録総数</span>
                    <span className="font-mono">{result.noMatch.total}</span>
                  </div>
                  <div className="p-2 bg-rose-900/30 rounded border border-rose-800 flex justify-between">
                    <span className="text-rose-300">30日Activeなのに試合未登録</span>
                    <span className="font-mono text-rose-200">{result.noMatch.active30NoMatch}</span>
                  </div>
                  <div className="p-2 bg-slate-800/50 rounded flex justify-between">
                    <span className="text-slate-400">7日Active</span>
                    <span className="font-mono">{result.noMatch.active7}</span>
                  </div>
                  <div className="p-2 bg-slate-800/50 rounded flex justify-between">
                    <span className="text-slate-400">選手登録あり</span>
                    <span className="font-mono">{result.noMatch.hasPlayer}</span>
                  </div>
                  <div className="p-2 bg-slate-800/50 rounded flex justify-between">
                    <span className="text-slate-400">大会登録あり</span>
                    <span className="font-mono">{result.noMatch.hasCompetition}</span>
                  </div>
                  <div className="p-2 bg-slate-800/50 rounded flex justify-between">
                    <span className="text-slate-400">チーム登録あり</span>
                    <span className="font-mono">{result.noMatch.hasTeam}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-[#141d2e] border-slate-700">
              <CardHeader>
                <CardTitle className="text-slate-200">Core / Super Core User</CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-2">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  <div className="p-2 bg-slate-800/50 rounded text-center">
                    <div className="text-slate-400">Core</div>
                    <div className="text-xl font-bold text-slate-100">{result.coreUsers.core}</div>
                  </div>
                  <div className="p-2 bg-slate-800/50 rounded text-center">
                    <div className="text-slate-400">Core Paid</div>
                    <div className="text-xl font-bold text-emerald-300">{result.coreUsers.corePaid}</div>
                  </div>
                  <div className="p-2 bg-slate-800/50 rounded text-center">
                    <div className="text-slate-400">Core Free</div>
                    <div className="text-xl font-bold text-slate-200">{result.coreUsers.coreFree}</div>
                  </div>
                  <div className="p-2 bg-amber-900/30 rounded border border-amber-800 text-center">
                    <div className="text-amber-300">Super Core</div>
                    <div className="text-xl font-bold text-amber-200">{result.coreUsers.superCore}</div>
                  </div>
                  <div className="p-2 bg-amber-900/30 rounded border border-amber-800 text-center">
                    <div className="text-amber-300">Super Core Paid</div>
                    <div className="text-xl font-bold text-amber-200">{result.coreUsers.superCorePaid}</div>
                  </div>
                  <div className="p-2 bg-amber-900/30 rounded border border-amber-800 text-center">
                    <div className="text-amber-300">Super Core Free</div>
                    <div className="text-xl font-bold text-amber-200">{result.coreUsers.superCoreFree}</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-[#141d2e] border-slate-700">
              <CardHeader>
                <CardTitle className="text-slate-200">重複profile（ファネルに影響なし）</CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-400">重複profileユーザー数</span>
                  <span className="text-slate-100">{result.duplicate.duplicateProfileUsers}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">余分profile数</span>
                  <span className="text-slate-100">{result.duplicate.extraProfiles}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">competition総件数</span>
                  <span className="text-slate-100">{result.duplicate.totalCompetitionDocs}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">competition紐付け不能件数</span>
                  <span className="text-slate-100">{result.duplicate.unmappedCompetitionDocs}</span>
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  同じUIDに複数profileがあっても、ファネル上では1ユーザーとして集計されています。
                </p>
              </CardContent>
            </Card>

            <Card className="bg-[#141d2e] border-slate-700">
              <CardHeader>
                <CardTitle className="text-slate-200">整合性チェック</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-2 text-sm">
                {Object.entries(result.consistency).map(([key, ok]) => (
                  <div key={key} className="flex justify-between">
                    <span className="text-slate-400">{key}</span>
                    <span className={ok ? 'text-emerald-400' : 'text-rose-400'}>{ok ? 'OK' : 'NG'}</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => setDetails(!details)} className="border-slate-600 text-slate-200">
                {details ? "UID明細を閉じる" : "UID明細を表示"}
              </Button>
            </div>

            {details && (
              <Card className="bg-[#141d2e] border-slate-700">
                <CardHeader>
                  <CardTitle className="text-slate-200">UID 明細 {filteredUsers.length}件</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant={filterKey === null ? "default" : "outline"}
                      onClick={() => setFilterKey(null)}
                      className="border-slate-600"
                    >
                      全員
                    </Button>
                    {FILTERS.map((f) => (
                      <Button
                        key={f.key}
                        size="sm"
                        variant={filterKey === f.key ? "default" : "outline"}
                        onClick={() => setFilterKey(f.key)}
                        className="border-slate-600"
                      >
                        {f.label}
                      </Button>
                    ))}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead className="text-slate-400 border-b border-slate-700">
                        <tr>
                          <th className="py-2">UID</th>
                          <th className="py-2">email</th>
                          <th className="py-2 text-center">profile</th>
                          <th className="py-2 text-center">name</th>
                          <th className="py-2 text-center">team</th>
                          <th className="py-2 text-center">player</th>
                          <th className="py-2 text-center">comp</th>
                          <th className="py-2 text-center">match</th>
                          <th className="py-2 text-right">match数</th>
                          <th className="py-2 text-center">active7</th>
                          <th className="py-2 text-center">active30</th>
                          <th className="py-2 text-center">paid</th>
                          <th className="py-2 text-center">granted</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {filteredUsers.slice(0, 100).map((u) => (
                          <tr key={u.uid}>
                            <td className="py-1 font-mono text-slate-300">{u.uid.slice(0, 12)}...</td>
                            <td className="py-1 text-slate-400">{u.email}</td>
                            <td className="py-1 text-center">{u.hasProfile ? '○' : '-'}</td>
                            <td className="py-1 text-center">{u.clubNameSet ? '○' : '-'}</td>
                            <td className="py-1 text-center">{u.hasTeam ? '○' : '-'}</td>
                            <td className="py-1 text-center">{u.hasPlayer ? '○' : '-'}</td>
                            <td className="py-1 text-center">{u.hasCompetition ? '○' : '-'}</td>
                            <td className="py-1 text-center">{u.hasMatch ? '○' : '-'}</td>
                            <td className="py-1 text-right font-mono">{u.matchCount}</td>
                            <td className="py-1 text-center">{u.active7 ? '○' : '-'}</td>
                            <td className="py-1 text-center">{u.active30 ? '○' : '-'}</td>
                            <td className="py-1 text-center">{u.isPaidPro ? '○' : '-'}</td>
                            <td className="py-1 text-center">{u.isGrantedPro ? '○' : '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {filteredUsers.length > 100 && (
                      <p className="text-xs text-slate-500 mt-2">先頭100件を表示しています。絞り込みを使ってください。</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}
