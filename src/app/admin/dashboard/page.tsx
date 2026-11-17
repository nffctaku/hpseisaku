"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Loader2, Shield, UserRound } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useClub } from "@/contexts/ClubContext";
import { useDashboardData } from "./hooks/useDashboardData";
import type { SheetCompetition, SheetTeam } from "@/lib/match-sheet";
import { fetchSheetTeams } from "@/lib/match-sheet";
import { db } from "@/lib/firebase";
import type { LeaguePositionPoint } from "@/lib/dashboard-stats";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as ReTooltip,
  CartesianGrid,
  ResponsiveContainer,
  Legend,
  ComposedChart,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import "./dashboard.css";

const colors = {
  bg: "#0a0a0c",
  surface: "#141419",
  surfaceHighlight: "#1c1c23",
  text: "#f5f5f5",
  sub: "#9ca3af",
  muted: "#6b7280",
  border: "#27272a",
  accent: "#8b5cf6",
  win: "#22c55e",
  draw: "#9ca3af",
  loss: "#ef4444",
};

const chartTooltipStyle = {
  backgroundColor: colors.surfaceHighlight,
  border: `1px solid ${colors.border}`,
  borderRadius: "8px",
  color: colors.text,
};

const chartLabelStyle = { fill: colors.sub, fontSize: 12 };
const chartAxisStyle = { stroke: colors.border };

interface TeamInfo {
  name: string;
  logoUrl?: string;
}

function PositionTooltip({
  active,
  payload,
  label,
  teamMap,
}: {
  active?: boolean;
  payload?: Array<{ value?: number; payload?: unknown }>;
  label?: string;
  teamMap: Map<string, TeamInfo>;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0].payload as LeaguePositionPoint;
  const rank = payload[0].value as number;
  const team = teamMap.get(point.opponentTeamId);
  const opponent = team?.name || point.opponentTeamId || "—";
  const homeAway = point.isHome ? "（H）" : "（A）";
  const score =
    typeof point.selfScore === "number" && typeof point.oppScore === "number"
      ? `${point.selfScore} - ${point.oppScore}`
      : "—";
  const pts = typeof point.points === "number" ? `${point.points}` : "—";
  return (
    <div
      className="rounded border p-2 text-xs"
      style={{ backgroundColor: colors.surfaceHighlight, borderColor: colors.border, color: colors.text }}
    >
      <div className="font-semibold">{label}</div>
      <div>対戦相手: {opponent}{homeAway}</div>
      <div>スコア: {score}</div>
      <div>順位: {rank}位</div>
      <div>勝点: {pts}</div>
    </div>
  );
}

interface PositionDotProps extends React.SVGProps<SVGGElement> {
  payload?: LeaguePositionPoint;
  value?: number;
  index?: number;
  cx?: number;
  cy?: number;
  dataKey?: string;
  teamMap: Map<string, TeamInfo>;
  emblemSize: number;
}

function PositionDot({ cx = 0, cy = 0, payload, teamMap, emblemSize }: PositionDotProps) {
  const [error, setError] = useState(false);
  if (!payload) return null;
  const team = teamMap.get(payload.opponentTeamId);
  const logoUrl = team?.logoUrl;
  const gap = 6;
  const size = emblemSize;
  const x = cx - size / 2;
  const y = cy - size - gap;
  return (
    <g>
      {logoUrl && !error ? (
        <foreignObject
          x={x}
          y={y}
          width={size}
          height={size}
          pointerEvents="none"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={logoUrl}
            alt=""
            className="h-full w-full object-contain"
            style={{ pointerEvents: "none" }}
            onError={() => setError(true)}
          />
        </foreignObject>
      ) : null}
      <circle cx={cx} cy={cy} r={4} fill={colors.accent} />
      {typeof payload.points === 'number' ? (
        <text
          x={cx}
          y={cy + 14}
          textAnchor="middle"
          fontSize={9}
          fill={colors.sub}
          className="tabular-nums"
        >
          {payload.points}
        </text>
      ) : null}
    </g>
  );
}

export default function DashboardPage() {
  const { clubInfo } = useClub();
  const {
    loading,
    activeCareer,
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
    standings,
    competitions,
  } = useDashboardData();

  const clubName = clubInfo?.clubName || activeCareer?.clubName || "クラブ名未設定";

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center" style={{ backgroundColor: colors.bg }}>
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: colors.text }} />
      </div>
    );
  }

  return (
    <div className="fc-dashboard min-h-screen" style={{ backgroundColor: colors.bg, color: colors.text }}>
      <div className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
        <DashboardHeader
          clubName={clubName}
          logoUrl={clubInfo?.logoUrl}
          seasons={seasons}
          selectedSeason={selectedSeason}
          setSelectedSeason={setSelectedSeason}
          competitionOptions={competitionOptions}
          selectedCompetition={selectedCompetition}
          setSelectedCompetition={setSelectedCompetition}
        />

        <Tabs defaultValue="overview" className="w-full">
          <div className="overflow-x-auto pb-px">
            <TabsList
              className="!h-auto !w-full !min-w-max !bg-transparent !p-0"
              style={{ borderBottom: `1px solid ${colors.border}` }}
            >
              {[
                { value: "overview", label: "Overview" },
                { value: "matches", label: "試合成績" },
                { value: "goals", label: "得点分析" },
                { value: "players", label: "選手ランキング" },
                { value: "monthly", label: "月別成績" },
              ].map((tab) => (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className="!rounded-none !bg-transparent !px-3 !py-2.5 text-sm font-medium whitespace-nowrap !shadow-none data-[state=active]:border-b-2 data-[state=active]:border-white data-[state=active]:text-white"
                  style={{ color: colors.sub }}
                >
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <TabsContent value="overview" className="mt-4 space-y-3">
            <OverviewTab overview={overview} />
          </TabsContent>

          <TabsContent value="matches" className="mt-4 space-y-3">
            <MatchesTab
              matchStats={matchStats}
              standings={standings}
              selectedCompetition={selectedCompetition}
              competitions={competitions}
            />
          </TabsContent>

          <TabsContent value="goals" className="mt-4 space-y-3">
            <GoalsTab goalAnalysis={goalAnalysis} />
          </TabsContent>

          <TabsContent value="players" className="mt-4 space-y-3">
            <PlayersTab playerRanking={playerRanking} />
          </TabsContent>

          <TabsContent value="monthly" className="mt-4 space-y-3">
            <MonthlyTab monthly={monthly} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function DashboardHeader({
  clubName,
  logoUrl,
  seasons,
  selectedSeason,
  setSelectedSeason,
  competitionOptions,
  selectedCompetition,
  setSelectedCompetition,
}: {
  clubName: string;
  logoUrl?: string | null;
  seasons: string[];
  selectedSeason: string;
  setSelectedSeason: (v: string) => void;
  competitionOptions: { id: string; name: string }[];
  selectedCompetition: string;
  setSelectedCompetition: (v: string) => void;
}) {
  return (
    <div className="mb-4 flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between" style={{ backgroundColor: colors.surface, borderColor: colors.border }}>
      <div className="flex min-w-0 items-center gap-3">
        <ClubEmblem name={clubName} src={logoUrl} />
        <div className="min-w-0">
          <h1 className="truncate text-base font-bold sm:text-lg">{clubName}</h1>
          <p className="text-xs" style={{ color: colors.sub }}>
            クラブダッシュボード
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={selectedSeason} onValueChange={setSelectedSeason}>
          <SelectTrigger
            className="fc-dashboard-select h-9 w-auto min-w-[110px] border text-xs"
            style={{ backgroundColor: colors.surfaceHighlight, borderColor: colors.border, color: colors.text }}
          >
            <SelectValue placeholder="シーズン" />
          </SelectTrigger>
          <SelectContent className="fc-dashboard-select" style={{ borderColor: colors.border }}>
            {seasons.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={selectedCompetition} onValueChange={setSelectedCompetition}>
          <SelectTrigger
            className="fc-dashboard-select h-9 w-auto min-w-[120px] border text-xs"
            style={{ backgroundColor: colors.surfaceHighlight, borderColor: colors.border, color: colors.text }}
          >
            <SelectValue placeholder="大会" />
          </SelectTrigger>
          <SelectContent className="fc-dashboard-select" style={{ borderColor: colors.border }}>
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
  );
}

function ClubEmblem({ name, src }: { name: string; src?: string | null }) {
  const [error, setError] = useState(false);
  const showFallback = !src || error;

  return (
    <div
      className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg border"
      style={{ backgroundColor: colors.surfaceHighlight, borderColor: colors.border }}
    >
      {showFallback ? (
        <Shield size={20} style={{ color: colors.sub }} />
      ) : (
        <img
          src={src}
          alt={name}
          className="h-full w-full object-contain p-1"
          onError={() => setError(true)}
        />
      )}
    </div>
  );
}

function OverviewTab({ overview }: { overview: ReturnType<typeof import("@/lib/dashboard-stats").computeOverviewStats> }) {
  const donutData = useMemo(
    () => [
      { name: "勝", value: overview.wins, color: colors.win },
      { name: "分", value: overview.draws, color: colors.draw },
      { name: "敗", value: overview.losses, color: colors.loss },
    ],
    [overview.wins, overview.draws, overview.losses]
  );

  const concluded = Math.max(1, overview.wins + overview.draws + overview.losses);
  const avgGoalsFor = (overview.goalsFor / concluded).toFixed(2);
  const avgGoalsAgainst = (overview.goalsAgainst / concluded).toFixed(2);
  const maxGoals = Math.max(overview.goalsFor, overview.goalsAgainst, 1);

  return (
    <div className="space-y-3">
      {/* 基本成績サマリー */}
      <DashboardSection className="p-3">
        <div className="grid grid-cols-4">
          {[
            { label: "試合数", value: overview.matches },
            { label: "勝", value: overview.wins, color: colors.win },
            { label: "分", value: overview.draws, color: colors.draw },
            { label: "敗", value: overview.losses, color: colors.loss },
          ].map((item, i) => (
            <div
              key={item.label}
              className={`px-1 py-2 text-center ${i > 0 ? "border-l" : ""}`}
              style={{ borderColor: colors.border }}
            >
              <DashboardKpi label={item.label} value={item.value} color={item.color} />
            </div>
          ))}
        </div>
      </DashboardSection>

      {/* 主要成績サマリー */}
      <DashboardSection className="p-3">
        <div className="grid grid-cols-4 gap-2">
          <DashboardKpi label="勝率" value={`${overview.winRate.toFixed(1)}%`} />
          <DashboardKpi label="総得点" value={overview.goalsFor} color={colors.win} />
          <DashboardKpi label="総失点" value={overview.goalsAgainst} color={colors.loss} />
          <DashboardKpi
            label="得失点差"
            value={overview.goalDifference > 0 ? `+${overview.goalDifference}` : overview.goalDifference}
          />
        </div>
      </DashboardSection>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <DashboardSection title="勝敗分布" className="p-4">
          <div className="h-44 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                <Pie
                  data={donutData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius="55%"
                  outerRadius="75%"
                  paddingAngle={2}
                  stroke={colors.surface}
                  strokeWidth={2}
                >
                  {donutData.map((entry, i) => (
                    <Cell key={`cell-${i}`} fill={entry.color} />
                  ))}
                </Pie>
                <ReTooltip contentStyle={chartTooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs" style={{ color: colors.sub }}>
            <span className="whitespace-nowrap" style={{ color: colors.win }}>勝 {overview.wins} ({overview.winRate.toFixed(1)}%)</span>
            <span className="whitespace-nowrap" style={{ color: colors.draw }}>分 {overview.draws} ({overview.drawRate.toFixed(1)}%)</span>
            <span className="whitespace-nowrap" style={{ color: colors.loss }}>敗 {overview.losses} ({overview.lossRate.toFixed(1)}%)</span>
          </div>
        </DashboardSection>

        <DashboardSection title="得失点バランス" className="p-4">
          <div className="space-y-4">
            <BarRow label="総得点" value={overview.goalsFor} max={maxGoals} color={colors.win} />
            <BarRow label="総失点" value={overview.goalsAgainst} max={maxGoals} color={colors.loss} />
            <div className="flex items-center justify-between rounded-lg border p-3" style={{ backgroundColor: colors.surfaceHighlight, borderColor: colors.border }}>
              <span className="text-sm" style={{ color: colors.sub }}>得失点差</span>
              <span className="text-2xl font-bold tabular-nums" style={{ color: overview.goalDifference >= 0 ? colors.win : colors.loss }}>
                {overview.goalDifference > 0 ? `+${overview.goalDifference}` : overview.goalDifference}
              </span>
            </div>
          </div>
        </DashboardSection>
      </div>

      {/* 補助指標 */}
      <DashboardSection className="p-3">
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
          <MiniStat label="リーグ勝点" value={overview.leaguePoints} testId="リーグ勝点" />
          <MiniStat label="クリーンシート" value={overview.cleanSheets} testId="クリーンシート" />
          <MiniStat label="引分率" value={`${overview.drawRate.toFixed(1)}%`} testId="引分率" />
          <MiniStat label="平均得点／試合" value={avgGoalsFor} />
          <MiniStat label="平均失点／試合" value={avgGoalsAgainst} />
          <MiniStat label="敗率" value={`${overview.lossRate.toFixed(1)}%`} testId="敗率" />
        </div>
      </DashboardSection>
    </div>
  );
}

function MatchesTab({
  matchStats,
  standings,
  selectedCompetition,
  competitions,
}: {
  matchStats: ReturnType<typeof import("@/lib/dashboard-stats").computeMatchStats>;
  standings: ReturnType<typeof import("@/lib/dashboard-stats").computeLeaguePositionSeries>;
  selectedCompetition: string;
  competitions: SheetCompetition[];
}) {
  const [chartCompetitionId, setChartCompetitionId] = useState<string | null>(null);
  const chartWrapRef = useRef<HTMLDivElement>(null);
  const chartPlotRef = useRef<HTMLDivElement>(null);
  const [isOverflow, setIsOverflow] = useState(false);
  const [plotWidth, setPlotWidth] = useState(0);
  const { clubProfileId } = useClub();
  const [teamMap, setTeamMap] = useState<Map<string, TeamInfo>>(new Map());

  useEffect(() => {
    const clubUid = clubProfileId;
    if (!clubUid) return;
    let cancelled = false;
    fetchSheetTeams(db, clubUid).then((teams) => {
      if (cancelled) return;
      const map = new Map<string, TeamInfo>();
      for (const t of teams) map.set(t.id, { name: t.name, logoUrl: t.logoUrl });
      setTeamMap(map);
    });
    return () => { cancelled = true; };
  }, [clubProfileId]);

  const selectedSeries = useMemo(() => {
    if (selectedCompetition !== "all" && selectedCompetition !== "league") {
      return standings.find((s) => s.competitionId === selectedCompetition) ?? null;
    }
    if (chartCompetitionId) {
      return standings.find((s) => s.competitionId === chartCompetitionId) ?? standings[0] ?? null;
    }
    return standings[0] ?? null;
  }, [standings, selectedCompetition, chartCompetitionId]);

  const canSelectCompetition = selectedCompetition === "all" || selectedCompetition === "league";

  useEffect(() => {
    if (!canSelectCompetition) {
      setChartCompetitionId(null);
      return;
    }
    const exists = standings.some((s) => s.competitionId === chartCompetitionId);
    if (!exists && standings.length > 0) {
      setChartCompetitionId(standings[0].competitionId);
    }
  }, [standings, canSelectCompetition, chartCompetitionId]);

  const chartPoints = useMemo(() => {
    if (!selectedSeries) return [];
    return [...selectedSeries.points].sort((a, b) => {
      const dateA = a.matchDate || "";
      const dateB = b.matchDate || "";
      if (dateA !== dateB) return dateA.localeCompare(dateB);
      return a.sortKey - b.sortKey;
    });
  }, [selectedSeries]);

  useEffect(() => {
    const el = chartWrapRef.current;
    if (!el) return;
    const update = () => setIsOverflow(el.scrollWidth > el.clientWidth);
    update();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    ro?.observe(el);
    return () => { ro?.disconnect(); };
  }, [chartPoints.length]);

  useEffect(() => {
    const el = chartPlotRef.current;
    if (!el) return;
    const update = () => setPlotWidth(el.getBoundingClientRect().width);
    update();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    ro?.observe(el);
    return () => { ro?.disconnect(); };
  }, [chartPoints.length]);

  const teamCount = useMemo(() => {
    if (!selectedSeries) return 0;
    const comp = competitions.find((c) => c.id === selectedSeries.competitionId);
    if (comp?.teamCount && Number.isFinite(comp.teamCount) && comp.teamCount > 0) return comp.teamCount;
    if (comp?.teams && comp.teams.length > 0) return comp.teams.length;
    return 0;
  }, [selectedSeries, competitions]);

  const dataMax = useMemo(() => {
    if (chartPoints.length === 0) return 1;
    return Math.max(1, ...chartPoints.map((p) => p.position));
  }, [chartPoints]);

  const maxRank = useMemo(() => {
    const base = teamCount > 0 ? teamCount : dataMax;
    return Math.max(base, dataMax, 2);
  }, [teamCount, dataMax]);

  const yTicks = useMemo(() => {
    if (maxRank <= 1) return [1];
    const desired = 5;
    const step = Math.max(1, Math.ceil((maxRank - 1) / desired));
    const ticks: number[] = [];
    for (let v = 1; v <= maxRank; v += step) ticks.push(v);
    if (ticks[ticks.length - 1] !== maxRank) ticks.push(maxRank);
    return ticks;
  }, [maxRank]);

  const plotTop = 38;
  const plotBottom = 50;
  const plotLeft = 30;
  const plotRight = 20;
  const chartHeight = 288;
  const plotHeight = chartHeight - plotTop - plotBottom;

  const emblemSize = useMemo(() => {
    if (plotWidth <= 0 || chartPoints.length <= 1) return 16;
    const plotArea = plotWidth - plotLeft - plotRight;
    const spacing = plotArea / (chartPoints.length - 1);
    return Math.min(20, Math.max(12, spacing - 2));
  }, [plotWidth, chartPoints.length]);

  return (
    <div className="space-y-3">
      <DashboardSection title="順位推移" className="p-3">
        {standings.length === 0 ? (
          <div className="py-6 text-center text-sm" style={{ color: colors.sub }}>
            リーグ戦の順位データがありません。
            <br />
            試合記録シートのリーグ戦行から順位を登録してください。
          </div>
        ) : (
          <div className="space-y-3">
            {canSelectCompetition && standings.length > 1 && (
              <Select
                value={selectedSeries?.competitionId ?? ""}
                onValueChange={(v) => {
                  setChartCompetitionId(v);
                }}
              >
                <SelectTrigger className="fc-dashboard-select h-9 w-full max-w-xs border text-xs" style={{ borderColor: colors.border }}>
                  <SelectValue placeholder="リーグを選択" />
                </SelectTrigger>
                <SelectContent className="fc-dashboard-select" style={{ borderColor: colors.border }}>
                  {standings.map((s) => (
                    <SelectItem key={s.competitionId} value={s.competitionId}>
                      {s.competitionName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {selectedSeries ? (
              <div className="relative" data-testid="league-position-chart">
                <div className="flex h-72 w-full">
                  <div
                    data-testid="league-position-yaxis"
                    className="relative h-72 w-10 flex-shrink-0"
                    style={{ color: colors.sub }}
                  >
                    <div className="absolute left-0 right-0" style={{ top: plotTop, bottom: plotBottom }}>
                      {yTicks.map((v) => {
                        const top = ((v - 1) / Math.max(1, maxRank - 1)) * plotHeight;
                        return (
                          <div
                            key={v}
                            className="absolute right-1 text-[10px] tabular-nums leading-none"
                            style={{ top: `${top}px`, transform: "translateY(-50%)" }}
                          >
                            {v}位
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div
                    ref={chartWrapRef}
                    data-testid="league-position-scroll"
                    className="league-position-scroll min-w-0 flex-1 overflow-x-auto overscroll-x-contain"
                    style={{ scrollbarWidth: "thin", WebkitOverflowScrolling: "touch" }}
                  >
                    <div
                      ref={chartPlotRef}
                      data-testid="league-position-plot"
                      className="league-position-plot h-72"
                      style={{ "--point-count": chartPoints.length } as CSSProperties}
                    >
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart
                          data={chartPoints}
                          margin={{ top: plotTop, right: plotRight, bottom: plotBottom, left: plotLeft }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke={colors.border} />
                          <XAxis
                            dataKey="label"
                            tick={chartLabelStyle}
                            axisLine={chartAxisStyle}
                            tickLine={chartAxisStyle}
                            interval="preserveStartEnd"
                            minTickGap={10}
                          />
                          <YAxis
                            domain={[1, maxRank]}
                            reversed
                            allowDecimals={false}
                            hide
                            ticks={yTicks}
                          />
                          <ReTooltip content={<PositionTooltip teamMap={teamMap} />} />
                          <Line
                            type="monotone"
                            dataKey="position"
                            name={selectedSeries.competitionName}
                            stroke={colors.accent}
                            strokeWidth={2}
                            dot={<PositionDot teamMap={teamMap} emblemSize={emblemSize} />}
                            activeDot={<PositionDot teamMap={teamMap} emblemSize={emblemSize} />}
                            isAnimationActive={false}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
                {isOverflow && (
                  <div className="mt-1 text-right text-[10px]" style={{ color: colors.sub }}>
                    ← スワイプで他の節を表示 →
                  </div>
                )}
              </div>
            ) : (
              <div className="py-6 text-center text-sm" style={{ color: colors.sub }}>
                選択中の大会に順位データがありません。
              </div>
            )}
          </div>
        )}
      </DashboardSection>

      <DashboardSection title="H/A 分析" className="p-3">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr style={{ borderBottom: `1px solid ${colors.border}` }}>
                <th className="py-2 text-left" style={{ color: colors.sub }}>場所</th>
                <th className="py-2 text-left" style={{ color: colors.sub }}>試合</th>
                <th className="py-2 text-left" style={{ color: colors.sub }}>勝</th>
                <th className="py-2 text-left" style={{ color: colors.sub }}>分</th>
                <th className="py-2 text-left" style={{ color: colors.sub }}>敗</th>
                <th className="py-2 text-left" style={{ color: colors.sub }}>勝点</th>
                <th className="py-2 text-left" style={{ color: colors.sub }}>得点</th>
                <th className="py-2 text-left" style={{ color: colors.sub }}>失点</th>
                <th className="py-2 text-left" style={{ color: colors.sub }}>勝率</th>
              </tr>
            </thead>
            <tbody>
              {matchStats.homeAway.map((r) => (
                <tr key={r.location} style={{ borderBottom: `1px solid ${colors.border}` }}>
                  <td className="py-2 font-medium">
                    {r.location === "home" ? "ホーム" : r.location === "away" ? "アウェイ" : "合計"}
                  </td>
                  <td className="py-2 tabular-nums">{r.matches}</td>
                  <td className="py-2 tabular-nums" style={{ color: colors.win }}>{r.wins}</td>
                  <td className="py-2 tabular-nums" style={{ color: colors.draw }}>{r.draws}</td>
                  <td className="py-2 tabular-nums" style={{ color: colors.loss }}>{r.losses}</td>
                  <td className="py-2 tabular-nums font-semibold">{r.points}</td>
                  <td className="py-2 tabular-nums">{r.goalsFor}</td>
                  <td className="py-2 tabular-nums">{r.goalsAgainst}</td>
                  <td className="py-2 tabular-nums">{r.winRate.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DashboardSection>

      <DashboardSection title="ストリーク / スコア分析" className="p-3">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <DashboardKpi label="最大連勝" value={matchStats.streaks.longestWinStreak} color={colors.win} />
          <DashboardKpi label="最大連敗" value={matchStats.streaks.longestLossStreak} color={colors.loss} />
          <DashboardKpi label="1点差勝利" value={matchStats.scoreAnalysis.oneGoalWins} />
          <DashboardKpi label="2点差以上勝利" value={matchStats.scoreAnalysis.twoPlusGoalWins} />
          <DashboardKpi label="最大得点" value={matchStats.scoreAnalysis.maxGoalsFor} color={colors.win} />
          <DashboardKpi label="複数失点試合" value={matchStats.scoreAnalysis.multiGoalsAgainstMatches} color={colors.loss} />
          <DashboardKpi label="最大失点" value={matchStats.scoreAnalysis.maxGoalsAgainst} />
        </div>
      </DashboardSection>
    </div>
  );
}

function GoalsTab({ goalAnalysis }: { goalAnalysis: ReturnType<typeof import("@/lib/dashboard-stats").computeGoalAnalysis> }) {
  const totalRegistered = goalAnalysis.firstHalfGoals + goalAnalysis.secondHalfGoals;
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const update = () => setIsMobile(window.innerWidth < 640);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const timeData = useMemo(
    () =>
      (Object.entries(goalAnalysis.buckets) as [import("@/lib/dashboard-stats").GoalTimeBucket, number][]).map(
        ([bucket, goals]) => ({ bucket, goals })
      ),
    [goalAnalysis.buckets]
  );

  return (
    <div className="space-y-3">
      <DashboardSection className="p-3">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <DashboardKpi label="前半得点" value={goalAnalysis.firstHalfGoals} color={colors.accent} />
          <DashboardKpi label="後半得点" value={goalAnalysis.secondHalfGoals} color={colors.sub} />
          <DashboardKpi label="前半比率" value={`${goalAnalysis.firstHalfRatio.toFixed(1)}%`} />
          <DashboardKpi label="後半比率" value={`${goalAnalysis.secondHalfGoalsRatio.toFixed(1)}%`} />
        </div>
        {goalAnalysis.unregisteredGoals > 0 ? (
          <p className="mt-2 text-xs" style={{ color: colors.text }}>
            ※未登録の得点が{goalAnalysis.unregisteredGoals}件あります
          </p>
        ) : (
          <p className="mt-2 text-xs" style={{ color: colors.muted }}>
            ※未登録の得点はありません
          </p>
        )}
      </DashboardSection>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <DashboardSection title="前後半得点バランス" className="p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="text-center">
              <div className="text-3xl font-bold tabular-nums" style={{ color: colors.accent }}>{goalAnalysis.firstHalfGoals}</div>
              <div className="text-xs" style={{ color: colors.sub }}>前半</div>
            </div>
            <div className="flex-1 px-2">
              <div className="h-3 w-full overflow-hidden rounded-full" style={{ backgroundColor: colors.surfaceHighlight }}>
                <div
                  className="h-full"
                  style={{
                    backgroundColor: colors.accent,
                    width: `${totalRegistered ? (goalAnalysis.firstHalfGoals / totalRegistered) * 100 : 0}%`,
                  }}
                />
              </div>
              <div className="mt-1 flex justify-between text-xs" style={{ color: colors.sub }}>
                <span>前半 {goalAnalysis.firstHalfRatio.toFixed(1)}%</span>
                <span>後半 {goalAnalysis.secondHalfGoalsRatio.toFixed(1)}%</span>
              </div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold tabular-nums" style={{ color: colors.sub }}>{goalAnalysis.secondHalfGoals}</div>
              <div className="text-xs" style={{ color: colors.sub }}>後半</div>
            </div>
          </div>
        </DashboardSection>

        <DashboardSection title="得点時間分布" className="p-4">
          <div className="h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={timeData}>
                <CartesianGrid strokeDasharray="3 3" stroke={colors.border} />
                <XAxis dataKey="bucket" tick={chartLabelStyle} axisLine={chartAxisStyle} tickLine={chartAxisStyle} />
                <YAxis allowDecimals={false} tick={chartLabelStyle} axisLine={chartAxisStyle} tickLine={chartAxisStyle} />
                <ReTooltip contentStyle={chartTooltipStyle} />
                <Bar dataKey="goals" radius={[4, 4, 0, 0]} fill={colors.accent} maxBarSize={isMobile ? 20 : undefined} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </DashboardSection>
      </div>
    </div>
  );
}

function PlayersTab({ playerRanking }: { playerRanking: ReturnType<typeof import("@/lib/dashboard-stats").computePlayerRanking> }) {
  return (
    <DashboardSection title="得点ランキング" className="p-3">
      <div className="space-y-3">
        {playerRanking.slice(0, 20).map((p) => (
          <PlayerRow key={p.playerId} player={p} />
        ))}
        {playerRanking.length === 0 && (
          <p className="text-sm" style={{ color: colors.sub }}>対象の得点データがありません</p>
        )}
      </div>
    </DashboardSection>
  );
}

function PlayerRow({ player }: { player: import("@/lib/dashboard-stats").PlayerRankingEntry }) {
  const [error, setError] = useState(false);
  const isFirst = player.rank === 1;
  const barColor = isFirst ? colors.accent : colors.sub;

  return (
    <div className="flex items-center gap-3">
      <div
        className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold"
        style={{ backgroundColor: isFirst ? colors.accent : colors.surfaceHighlight, color: colors.text }}
      >
        {player.rank}
      </div>

      <div
        className="h-10 w-10 flex-shrink-0 overflow-hidden rounded-lg border"
        style={{ backgroundColor: colors.surfaceHighlight, borderColor: colors.border }}
      >
        {player.playerImage && !error ? (
          <img
            src={player.playerImage}
            alt={player.playerName}
            className="h-full w-full object-cover"
            onError={() => setError(true)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center" style={{ color: colors.sub }}>
            <UserRound size={20} />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between text-sm">
          <span className="truncate font-medium">{player.playerName}</span>
          <span className="tabular-nums font-semibold" style={{ color: isFirst ? colors.accent : colors.text }}>
            {player.goals} 点
          </span>
        </div>
        <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full" style={{ backgroundColor: colors.surfaceHighlight }}>
          <div
            className="h-full rounded-full"
            style={{ backgroundColor: barColor, width: `${Math.min(100, player.share * 100)}%` }}
          />
        </div>
        <div className="mt-0.5 text-right text-[10px]" style={{ color: colors.sub }}>
          シェア {(player.share * 100).toFixed(1)}%
        </div>
      </div>
    </div>
  );
}

function MonthlyTab({ monthly }: { monthly: ReturnType<typeof import("@/lib/dashboard-stats").computeMonthlyStats> }) {
  return (
    <div className="space-y-3">
      <DashboardSection title="月別成績" className="p-4">
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={monthly.chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke={colors.border} />
              <XAxis dataKey="month" tick={chartLabelStyle} axisLine={chartAxisStyle} tickLine={chartAxisStyle} />
              <YAxis yAxisId="left" allowDecimals={false} tick={chartLabelStyle} axisLine={chartAxisStyle} tickLine={chartAxisStyle} />
              <YAxis
                yAxisId="right"
                orientation="right"
                domain={[0, 100]}
                tick={chartLabelStyle}
                axisLine={chartAxisStyle}
                tickLine={chartAxisStyle}
              />
              <ReTooltip contentStyle={chartTooltipStyle} />
              <Legend wrapperStyle={{ color: colors.sub }} />
              <Bar yAxisId="left" dataKey="wins" stackId="a" name="勝利" fill={colors.win} radius={[0, 0, 0, 0]} />
              <Bar yAxisId="left" dataKey="draws" stackId="a" name="引分" fill={colors.draw} radius={[0, 0, 0, 0]} />
              <Bar yAxisId="left" dataKey="losses" stackId="a" name="敗北" fill={colors.loss} radius={[4, 4, 0, 0]} />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="winRate"
                name="勝率(%)"
                stroke={colors.text}
                strokeWidth={2}
                dot={{ r: 3, fill: colors.text, stroke: colors.surface }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </DashboardSection>

      <DashboardSection title="月別テーブル" className="p-3">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-sm">
            <thead>
              <tr style={{ borderBottom: `1px solid ${colors.border}` }}>
                <th className="py-2 text-left" style={{ color: colors.sub }}>月</th>
                <th className="py-2 text-left" style={{ color: colors.sub }}>試合</th>
                <th className="py-2 text-left" style={{ color: colors.sub }}>勝</th>
                <th className="py-2 text-left" style={{ color: colors.sub }}>分</th>
                <th className="py-2 text-left" style={{ color: colors.sub }}>敗</th>
                <th className="py-2 text-left" style={{ color: colors.sub }}>得点</th>
                <th className="py-2 text-left" style={{ color: colors.sub }}>失点</th>
                <th className="py-2 text-left" style={{ color: colors.sub }}>得失差</th>
                <th className="py-2 text-left" style={{ color: colors.sub }}>勝率</th>
              </tr>
            </thead>
            <tbody>
              {monthly.months.map((m) => (
                <tr key={m.month} style={{ borderBottom: `1px solid ${colors.border}` }}>
                  <td className="py-2 font-medium">{m.month}</td>
                  <td className="py-2 tabular-nums">{m.matches}</td>
                  <td className="py-2 tabular-nums" style={{ color: colors.win }}>{m.wins}</td>
                  <td className="py-2 tabular-nums" style={{ color: colors.draw }}>{m.draws}</td>
                  <td className="py-2 tabular-nums" style={{ color: colors.loss }}>{m.losses}</td>
                  <td className="py-2 tabular-nums">{m.goalsFor}</td>
                  <td className="py-2 tabular-nums">{m.goalsAgainst}</td>
                  <td className="py-2 tabular-nums">{m.goalDifference}</td>
                  <td className="py-2 tabular-nums">{m.winRate.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DashboardSection>
    </div>
  );
}

function BarRow({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const width = max > 0 ? `${((value / max) * 100).toFixed(1)}%` : "0%";
  return (
    <div>
      <div className="mb-1 flex justify-between text-sm">
        <span style={{ color }}>{label}</span>
        <span className="font-semibold tabular-nums" style={{ color }}>{value}</span>
      </div>
      <div className="h-3 w-full overflow-hidden rounded-full" style={{ backgroundColor: colors.surfaceHighlight }}>
        <div className="h-full rounded-full" style={{ backgroundColor: color, width }} />
      </div>
    </div>
  );
}

function DashboardKpi({
  label,
  value,
  color = colors.text,
}: {
  label: string;
  value: string | number;
  color?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className="text-[10px] font-medium uppercase tracking-wider" style={{ color: colors.sub }}>
        {label}
      </div>
      <div
        className="text-xl font-bold tabular-nums leading-tight sm:text-2xl"
        data-testid={label}
        style={{ color }}
      >
        {value}
      </div>
    </div>
  );
}

function MiniStat({ label, value, testId }: { label: string; value: string | number; testId?: string }) {
  return (
    <div className="flex items-center justify-between border-b py-2" style={{ borderColor: colors.border }}>
      <span className="text-xs" style={{ color: colors.sub }}>{label}</span>
      <span className="text-sm font-semibold tabular-nums" data-testid={testId} style={{ color: colors.text }}>
        {value}
      </span>
    </div>
  );
}

function DashboardSection({
  title,
  children,
  className = "",
}: {
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border ${className}`}
      style={{ backgroundColor: colors.surface, borderColor: colors.border }}
    >
      {title && <h3 className="mb-3 text-sm font-semibold" style={{ color: colors.text }}>{title}</h3>}
      {children}
    </div>
  );
}
