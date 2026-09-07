"use client";

import { type ReactNode, useState } from "react";
import { BarChart3, Clock, Grid3X3 } from "lucide-react";

type GoalEvent = {
  type?: string;
  teamId?: string;
  minute?: number | string;
};

type MatchLike = {
  events?: GoalEvent[];
};

interface GoalTimeSectionProps {
  matches: MatchLike[];
  mainTeamId: string | null;
}

type ViewMode = "balance" | "heatmap";

type Bucket = {
  label: string;
  min: number;
  max: number;
  exclusiveMax?: boolean;
  goalsFor: number;
  goalsAgainst: number;
};

const FIRST_HALF_BUCKETS = [
  { label: "0-5", min: 0, max: 5 },
  { label: "6-10", min: 6, max: 10 },
  { label: "11-15", min: 11, max: 15 },
  { label: "16-20", min: 16, max: 20 },
  { label: "21-25", min: 21, max: 25 },
  { label: "26-30", min: 26, max: 30 },
  { label: "31-35", min: 31, max: 35 },
  { label: "36-40", min: 36, max: 40 },
  { label: "41-45", min: 41, max: 45 },
  { label: "45+~", min: 45, max: 46, exclusiveMax: true },
];

const SECOND_HALF_BUCKETS = [
  { label: "45-50", min: 45, max: 50 },
  { label: "51-55", min: 51, max: 55 },
  { label: "56-60", min: 56, max: 60 },
  { label: "61-65", min: 61, max: 65 },
  { label: "66-70", min: 66, max: 70 },
  { label: "71-75", min: 71, max: 75 },
  { label: "76-80", min: 76, max: 80 },
  { label: "81-85", min: 81, max: 85 },
  { label: "86-90", min: 86, max: 90 },
  { label: "90+~", min: 90, max: Infinity, exclusiveMax: true },
];

function isInBucket(minute: number, bucket: { min: number; max: number; exclusiveMax?: boolean }) {
  if (bucket.exclusiveMax) return minute > bucket.min && minute < bucket.max;
  return minute >= bucket.min && minute <= bucket.max;
}

function totals(buckets: Bucket[]) {
  return {
    goalsFor: buckets.reduce((s, b) => s + b.goalsFor, 0),
    goalsAgainst: buckets.reduce((s, b) => s + b.goalsAgainst, 0),
  };
}

function topBuckets(buckets: Bucket[], key: "goalsFor" | "goalsAgainst") {
  const max = Math.max(0, ...buckets.map((b) => b[key]));
  return {
    max,
    labels: max > 0 ? buckets.filter((b) => b[key] === max).map((b) => b.label).join(" / ") : "-",
  };
}

export function GoalTimeSection({ matches, mainTeamId }: GoalTimeSectionProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("balance");
  const firstHalf = FIRST_HALF_BUCKETS.map((b) => ({ ...b, goalsFor: 0, goalsAgainst: 0 }));
  const secondHalf = SECOND_HALF_BUCKETS.map((b) => ({ ...b, goalsFor: 0, goalsAgainst: 0 }));

  for (const match of matches || []) {
    const events = Array.isArray(match.events) ? match.events : [];
    for (const ev of events) {
      const minute = typeof ev?.minute === "number" ? ev.minute : Number(ev?.minute);
      if (!Number.isFinite(minute)) continue;

      let isFor = false;
      let isAgainst = false;

      if (ev.type === "goal") {
        if (ev.teamId === mainTeamId) isFor = true;
        else isAgainst = true;
      } else if (ev.type === "og") {
        if (ev.teamId === mainTeamId) isAgainst = true;
        else isFor = true;
      } else {
        continue;
      }

      const bucket = minute <= 45 ? firstHalf.find((b) => isInBucket(minute, b)) : secondHalf.find((b) => isInBucket(minute, b));
      if (!bucket) continue;
      if (isFor) bucket.goalsFor += 1;
      if (isAgainst) bucket.goalsAgainst += 1;
    }
  }

  const allBuckets = [...firstHalf, ...secondHalf];
  const firstTotals = totals(firstHalf);
  const secondTotals = totals(secondHalf);
  const totalFor = firstTotals.goalsFor + secondTotals.goalsFor;
  const totalAgainst = firstTotals.goalsAgainst + secondTotals.goalsAgainst;
  const topFor = topBuckets(allBuckets, "goalsFor");
  const topAgainst = topBuckets(allBuckets, "goalsAgainst");
  const maxValue = Math.max(1, ...allBuckets.map((b) => Math.max(b.goalsFor, b.goalsAgainst)));

  const renderHalfHeader = (title: string, buckets: Bucket[]) => {
    const t = totals(buckets);
    return (
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-black text-white">
          <span className="h-px w-8 bg-slate-600" />
          {title}
          <span className="h-px w-8 bg-slate-600" />
        </div>
        <div className="flex gap-3 text-xs font-black">
          <span className="text-emerald-400">得点 {t.goalsFor}</span>
          <span className="text-rose-400">失点 {t.goalsAgainst}</span>
        </div>
      </div>
    );
  };

  const renderBalance = (title: string, buckets: Bucket[]) => (
    <div className="space-y-3">
      {renderHalfHeader(title, buckets)}
      <div className="grid grid-cols-[1fr_54px_1fr] gap-2 text-[10px] font-bold text-slate-400 px-1">
        <div className="text-right text-emerald-400">得点</div>
        <div className="text-center">時間</div>
        <div className="text-rose-400">失点</div>
      </div>
      <div className="space-y-1.5">
        {buckets.map((b) => {
          const forWidth = (b.goalsFor / maxValue) * 100;
          const againstWidth = (b.goalsAgainst / maxValue) * 100;
          return (
            <div key={b.label} className="grid grid-cols-[1fr_54px_1fr] items-center gap-2 text-xs">
              <div className="flex items-center justify-end gap-2 text-emerald-400 font-black tabular-nums">
                <span>{b.goalsFor}</span>
                <div className="h-3 w-full max-w-[150px] rounded-full bg-slate-700/70 overflow-hidden flex justify-end">
                  <div className="h-full rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.45)]" style={{ width: `${forWidth}%` }} />
                </div>
              </div>
              <div className="text-center font-bold text-slate-300">{b.label}</div>
              <div className="flex items-center gap-2 text-rose-400 font-black tabular-nums">
                <div className="h-3 w-full max-w-[150px] rounded-full bg-slate-700/70 overflow-hidden">
                  <div className="h-full rounded-full bg-rose-400 shadow-[0_0_10px_rgba(251,113,133,0.45)]" style={{ width: `${againstWidth}%` }} />
                </div>
                <span>{b.goalsAgainst}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const renderHeatmap = (title: string, buckets: Bucket[]) => (
    <div className="space-y-3">
      {renderHalfHeader(title, buckets)}
      <div className="rounded-xl border border-slate-700 bg-slate-900/45 overflow-hidden">
        <div className="grid grid-cols-[64px_1fr_1fr] border-b border-slate-700 text-[10px] font-bold text-slate-400">
          <div className="p-2 border-r border-slate-700">時間帯</div>
          <div className="p-2 text-center text-emerald-400 border-r border-slate-700">得点</div>
          <div className="p-2 text-center text-rose-400">失点</div>
        </div>
        {buckets.map((b) => {
          const forAlpha = Math.min(0.78, 0.1 + (b.goalsFor / maxValue) * 0.68);
          const againstAlpha = Math.min(0.78, 0.1 + (b.goalsAgainst / maxValue) * 0.68);
          const forColor = `rgba(16,185,129,${forAlpha})`;
          const againstColor = `rgba(244,63,94,${againstAlpha})`;
          return (
            <div key={b.label} className="grid grid-cols-[64px_1fr_1fr] text-xs font-black border-b border-slate-700 last:border-b-0">
              <div className="p-2 flex items-center justify-center border-r border-slate-700 text-slate-300">{b.label}</div>
              <div className="p-2 text-center border-r border-slate-700 text-white" style={{ backgroundColor: b.goalsFor ? forColor : "rgba(15,23,42,0.55)" }}>
                {b.goalsFor}
              </div>
              <div className="p-2 text-center text-white" style={{ backgroundColor: b.goalsAgainst ? againstColor : "rgba(15,23,42,0.55)" }}>
                {b.goalsAgainst}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );


  const modeButton = (mode: ViewMode, label: string, icon: ReactNode) => (
    <button
      type="button"
      onClick={() => setViewMode(mode)}
      className={`flex items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-black transition ${viewMode === mode ? "bg-emerald-400 text-slate-950" : "bg-slate-900/70 text-slate-300 hover:bg-slate-700"}`}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <div className="relative overflow-hidden rounded-xl bg-slate-800/50 backdrop-blur-xl border border-slate-700">
      <div className="relative p-4 md:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-slate-700 rounded-lg">
              <Clock className="h-5 w-5 md:h-6 md:w-6 text-slate-400" />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg md:text-xl font-bold text-white">得点/失点の時間帯</h3>
              <p className="text-slate-400 text-xs md:text-sm">5分刻み + ロスタイム</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {modeButton("balance", "バランス", <BarChart3 className="h-3.5 w-3.5" />)}
            {modeButton("heatmap", "ヒートマップ", <Grid3X3 className="h-3.5 w-3.5" />)}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-3">
            <div className="text-xs font-bold text-emerald-300">得点</div>
            <div className="mt-1 text-3xl font-black text-emerald-300">{totalFor}</div>
          </div>
          <div className="rounded-xl border border-rose-400/20 bg-rose-400/10 p-3">
            <div className="text-xs font-bold text-rose-300">失点</div>
            <div className="mt-1 text-3xl font-black text-rose-300">{totalAgainst}</div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 mb-5">
          <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-3">
            <div className="text-xs font-bold text-slate-300">最多得点時間帯</div>
            <div className="mt-1 text-sm font-black text-white">{topFor.labels}</div>
            <div className="text-xs text-emerald-400">{topFor.max}得点</div>
          </div>
          <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-3">
            <div className="text-xs font-bold text-slate-300">最多失点時間帯</div>
            <div className="mt-1 text-sm font-black text-white">{topAgainst.labels}</div>
            <div className="text-xs text-rose-400">{topAgainst.max}失点</div>
          </div>
        </div>

        <div className="space-y-6">
          {viewMode === "balance" && <>{renderBalance("前半", firstHalf)}{renderBalance("後半", secondHalf)}</>}
          {viewMode === "heatmap" && <>{renderHeatmap("前半", firstHalf)}{renderHeatmap("後半", secondHalf)}</>}
        </div>
      </div>
    </div>
  );
}
