import React from "react";

type OverallPoint = {
  season: string;
  overall: number | null;
};

function clamp99(n: unknown): number {
  if (typeof n !== "number" || !Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(99, n));
}

function formatSeasonLabel(season: string): string {
  if (!season) return "";
  if (season.includes("/")) return season;
  const m2 = season.match(/^(\d{4})-(\d{2})$/);
  if (m2) return `${m2[1]}/${m2[2]}`;
  const m4 = season.match(/^(\d{4})-(\d{4})$/);
  if (m4) return `${m4[1]}/${m4[2].slice(-2)}`;
  return season;
}

export function PublicPlayerOverallBySeasonChart({
  data,
}: {
  data: OverallPoint[];
}) {
  const points = Array.isArray(data) ? data : [];
  const hasAny = points.some((p) => typeof p?.overall === "number" && Number.isFinite(p.overall));
  if (!hasAny) return null;

  const width = 520;
  const height = 130;
  const padX = 16;
  const padTop = 14;
  const padBottom = 28;

  const valid = points
    .map((p) => (typeof p?.overall === "number" && Number.isFinite(p.overall) ? clamp99(p.overall) : null))
    .filter((v): v is number => typeof v === "number");

  const min = Math.max(0, Math.min(...valid) - 4);
  const max = Math.min(99, Math.max(...valid) + 4);
  const range = Math.max(1, max - min);

  const plotW = Math.max(1, width - padX * 2);
  const plotH = Math.max(1, height - padTop - padBottom);
  const stepX = points.length > 1 ? plotW / (points.length - 1) : 0;

  const toX = (i: number) => padX + i * stepX;
  const toY = (v: number) => padTop + (1 - (v - min) / range) * plotH;

  const segments: string[] = [];
  let current: string[] = [];
  points.forEach((p, i) => {
    const v = typeof p?.overall === "number" && Number.isFinite(p.overall) ? clamp99(p.overall) : null;
    if (v == null) {
      if (current.length >= 2) segments.push(current.join(" "));
      current = [];
      return;
    }
    current.push(`${toX(i)},${toY(v)}`);
  });
  if (current.length >= 2) segments.push(current.join(" "));

  const tickSeasons = (() => {
    if (points.length <= 1) return points;
    if (points.length === 2) return points;
    return [points[0], points[Math.floor(points.length / 2)], points[points.length - 1]];
  })();

  const baseY = padTop + plotH;

  return (
    <div className="w-full">
      <div className="flex items-baseline justify-between">
        <p className="text-xs text-muted-foreground">総合値推移（シーズン別）</p>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" className="mt-2">
        <line x1={padX} y1={baseY} x2={width - padX} y2={baseY} stroke="#E5E7EB" strokeWidth="2" />
        {[0.25, 0.5, 0.75].map((k) => (
          <line
            key={k}
            x1={padX}
            y1={padTop + plotH * k}
            x2={width - padX}
            y2={padTop + plotH * k}
            stroke="#F3F4F6"
            strokeWidth="2"
          />
        ))}

        {segments.map((pts, idx) => (
          <polyline key={idx} points={pts} fill="none" stroke="#22C55E" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
        ))}

        {points.map((p, i) => {
          const v = typeof p?.overall === "number" && Number.isFinite(p.overall) ? clamp99(p.overall) : null;
          if (v == null) return null;
          const x = toX(i);
          const y = toY(v);
          return (
            <g key={i}>
              <circle cx={x} cy={y} r={3.5} fill="#16A34A" />
              <rect x={x - 12} y={y - 22} width={24} height={16} rx={4} fill="#FFFFFF" opacity={0.92} />
              <text x={x} y={y - 10} textAnchor="middle" fontSize="11" fontWeight={700} fill="#111827">
                {Math.round(v)}
              </text>
            </g>
          );
        })}

        {tickSeasons.map((p, i) => {
          const idx = points.indexOf(p);
          if (idx < 0) return null;
          return (
            <text
              key={i}
              x={toX(idx)}
              y={height - 8}
              textAnchor={idx === 0 ? "start" : idx === points.length - 1 ? "end" : "middle"}
              fontSize="11"
              fontWeight={600}
              fill="#6B7280"
            >
              {formatSeasonLabel(p.season)}
            </text>
          );
        })}
      </svg>
    </div>
  );
}
