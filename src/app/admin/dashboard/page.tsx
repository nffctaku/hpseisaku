"use client";

import { Loader2 } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDashboardData } from "./hooks/useDashboardData";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  Legend,
  ComposedChart,
  Line,
} from "recharts";

export default function DashboardPage() {
  const {
    loading,
    activeCareer,
    careers,
    switchCareer,
    seasons,
    selectedSeason,
    setSelectedSeason,
    competitionOptions,
    selectedCompetition,
    setSelectedCompetition,
    overview,
    matchStats,
    goalAnalysis,
    playerRanking,
    monthly,
  } = useDashboardData();

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center bg-[#F8FAFC]">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  const goalsForPct = overview.goalsFor + overview.goalsAgainst || 1;

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#111827]">
      <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">ダッシュボード</h1>
            <p className="mt-1 text-sm text-[#64748B]">既存の試合記録から自動集計</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Select value={activeCareer?.id} onValueChange={(v) => switchCareer(v)}>
              <SelectTrigger className="h-9 w-[140px] bg-white text-sm">
                <SelectValue placeholder="キャリア" />
              </SelectTrigger>
              <SelectContent>
                {careers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name || c.clubName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedSeason} onValueChange={setSelectedSeason}>
              <SelectTrigger className="h-9 w-[120px] bg-white text-sm">
                <SelectValue placeholder="シーズン" />
              </SelectTrigger>
              <SelectContent>
                {seasons.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedCompetition} onValueChange={setSelectedCompetition}>
              <SelectTrigger className="h-9 w-[160px] bg-white text-sm">
                <SelectValue placeholder="大会" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全大会</SelectItem>
                <SelectItem value="league">リーグ戦</SelectItem>
                {competitionOptions.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Tabs defaultValue="overview" className="w-full">
          <div className="overflow-x-auto pb-1">
            <TabsList className="mb-4 min-w-max">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="matches">試合成績</TabsTrigger>
              <TabsTrigger value="goals">得点分析</TabsTrigger>
              <TabsTrigger value="players">選手ランキング</TabsTrigger>
              <TabsTrigger value="monthly">月別成績</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
              <Kpi label="試合数" value={overview.matches} />
              <Kpi label="勝" value={overview.wins} color="text-emerald-600" />
              <Kpi label="分" value={overview.draws} color="text-amber-600" />
              <Kpi label="敗" value={overview.losses} color="text-rose-600" />
              <Kpi label="勝率" value={`${overview.winRate.toFixed(1)}%`} />
              <Kpi label="敗率" value={`${overview.lossRate.toFixed(1)}%`} />
              <Kpi label="引分率" value={`${overview.drawRate.toFixed(1)}%`} />
            </div>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Kpi label="リーグ勝点" value={overview.leaguePoints} color="text-blue-600" />
              <Kpi label="総得点" value={overview.goalsFor} color="text-emerald-600" />
              <Kpi label="総失点" value={overview.goalsAgainst} color="text-rose-600" />
              <Kpi label="クリーンシート" value={overview.cleanSheets} />
            </div>
            <Card title="得失点バランス">
              <div className="h-4 w-full overflow-hidden rounded-full bg-[#E2E8F0]">
                <div
                  className="h-full bg-emerald-500"
                  style={{
                    width: `${(overview.goalsFor / goalsForPct) * 100}%`,
                  }}
                />
              </div>
              <div className="mt-2 flex justify-between text-xs text-[#64748B]">
                <span>得点 {overview.goalsFor}</span>
                <span>失点 {overview.goalsAgainst}</span>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="matches" className="space-y-4">
            <Card title="H/A 分析">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[500px] text-sm">
                  <thead>
                    <tr className="border-b text-left text-[#64748B]">
                      <th className="py-2">場所</th>
                      <th className="py-2">試合</th>
                      <th className="py-2">勝</th>
                      <th className="py-2">分</th>
                      <th className="py-2">敗</th>
                      <th className="py-2">勝点</th>
                      <th className="py-2">得点</th>
                      <th className="py-2">失点</th>
                      <th className="py-2">勝率</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matchStats.homeAway.map((r) => (
                      <tr key={r.location} className="border-b">
                        <td className="py-2 font-medium">
                          {r.location === "home" ? "ホーム" : r.location === "away" ? "アウェイ" : "合計"}
                        </td>
                        <td className="py-2 tabular-nums">{r.matches}</td>
                        <td className="py-2 tabular-nums text-emerald-600">{r.wins}</td>
                        <td className="py-2 tabular-nums text-amber-600">{r.draws}</td>
                        <td className="py-2 tabular-nums text-rose-600">{r.losses}</td>
                        <td className="py-2 tabular-nums font-semibold">{r.points}</td>
                        <td className="py-2 tabular-nums">{r.goalsFor}</td>
                        <td className="py-2 tabular-nums">{r.goalsAgainst}</td>
                        <td className="py-2 tabular-nums">{r.winRate.toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              <Kpi label="最大連勝" value={matchStats.streaks.longestWinStreak} />
              <Kpi label="最大連敗" value={matchStats.streaks.longestLossStreak} />
              <Kpi label="1点差勝利" value={matchStats.scoreAnalysis.oneGoalWins} />
              <Kpi label="2点差以上勝利" value={matchStats.scoreAnalysis.twoPlusGoalWins} />
              <Kpi label="最大得点" value={matchStats.scoreAnalysis.maxGoalsFor} />
              <Kpi label="複数失点試合" value={matchStats.scoreAnalysis.multiGoalsAgainstMatches} />
              <Kpi label="最大失点" value={matchStats.scoreAnalysis.maxGoalsAgainst} />
            </div>
          </TabsContent>

          <TabsContent value="goals" className="space-y-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Kpi label="前半得点" value={goalAnalysis.firstHalfGoals} />
              <Kpi label="後半得点" value={goalAnalysis.secondHalfGoals} />
              <Kpi label="前半比率" value={`${goalAnalysis.firstHalfRatio.toFixed(1)}%`} />
              <Kpi label="後半比率" value={`${goalAnalysis.secondHalfGoalsRatio.toFixed(1)}%`} />
              <Kpi label="未登録得点" value={goalAnalysis.unregisteredGoals} />
            </div>
            <Card title="得点時間分布">
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={Object.entries(goalAnalysis.buckets).map(([k, v]) => ({ bucket: k, goals: v }))}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="bucket" />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="goals" fill="#1fd760" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="players" className="space-y-4">
            <Card title="得点ランキング">
              <div className="space-y-3">
                {playerRanking.slice(0, 20).map((p) => (
                  <div key={p.playerId} className="flex items-center gap-3">
                    <span className="w-6 text-center text-sm font-semibold text-[#64748B]">{p.rank}</span>
                    <div className="flex-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium">{p.playerName}</span>
                        <span className="tabular-nums font-semibold">{p.goals} 点</span>
                      </div>
                      <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-[#E2E8F0]">
                        <div
                          className="h-full bg-blue-500"
                          style={{ width: `${Math.min(100, p.share * 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
                {playerRanking.length === 0 && (
                  <p className="text-sm text-[#64748B]">対象の得点データがありません</p>
                )}
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="monthly" className="space-y-4">
            <Card title="月別成績">
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={monthly.chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis yAxisId="left" allowDecimals={false} />
                    <YAxis yAxisId="right" orientation="right" domain={[0, 100]} />
                    <Tooltip />
                    <Legend />
                    <Bar yAxisId="left" dataKey="wins" stackId="a" name="勝利" fill="#10b981" />
                    <Bar yAxisId="left" dataKey="draws" stackId="a" name="引分" fill="#f59e0b" />
                    <Bar yAxisId="left" dataKey="losses" stackId="a" name="敗北" fill="#f43f5e" />
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="winRate"
                      name="勝率(%)"
                      stroke="#2563eb"
                      dot={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </Card>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] text-sm">
                <thead>
                  <tr className="border-b text-left text-[#64748B]">
                    <th className="py-2">月</th>
                    <th className="py-2">試合</th>
                    <th className="py-2">勝</th>
                    <th className="py-2">分</th>
                    <th className="py-2">敗</th>
                    <th className="py-2">得点</th>
                    <th className="py-2">失点</th>
                    <th className="py-2">得失差</th>
                    <th className="py-2">勝率</th>
                  </tr>
                </thead>
                <tbody>
                  {monthly.months.map((m) => (
                    <tr key={m.month} className="border-b">
                      <td className="py-2 font-medium">{m.month}</td>
                      <td className="py-2 tabular-nums">{m.matches}</td>
                      <td className="py-2 tabular-nums text-emerald-600">{m.wins}</td>
                      <td className="py-2 tabular-nums text-amber-600">{m.draws}</td>
                      <td className="py-2 tabular-nums text-rose-600">{m.losses}</td>
                      <td className="py-2 tabular-nums">{m.goalsFor}</td>
                      <td className="py-2 tabular-nums">{m.goalsAgainst}</td>
                      <td className="py-2 tabular-nums">{m.goalDifference}</td>
                      <td className="py-2 tabular-nums">{m.winRate.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function Kpi({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="rounded-xl border border-[#E2E8F0] bg-white p-3">
      <div className="text-xs text-[#64748B]">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${color ?? "text-[#111827]"}`}>
        {value}
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[#E2E8F0] bg-white p-4">
      <h3 className="mb-3 text-base font-semibold">{title}</h3>
      {children}
    </div>
  );
}
