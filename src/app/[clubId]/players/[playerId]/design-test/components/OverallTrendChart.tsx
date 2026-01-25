import React from "react";

export function OverallTrendChart({
  rows,
  height,
}: {
  rows: Array<{ season: string; overall: number }>;
  height?: number;
}) {
  if (!Array.isArray(rows) || rows.length === 0) return null;

  const W = 320;
  const H = typeof height === "number" && Number.isFinite(height) ? Math.max(120, height) : 160;
  const padL = 26;
  const padR = 10;
  const padT = 12;
  const padB = 26;

  const max = 99;
  const min = 0;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const xAt = (i: number) => {
    if (rows.length === 1) return padL + plotW / 2;
    return padL + (plotW * i) / (rows.length - 1);
  };

  const yAt = (v: number) => {
    const vv = Math.max(min, Math.min(max, v));
    const t = (vv - min) / (max - min);
    return padT + (1 - t) * plotH;
  };

  const points = rows
    .map((r, i) => `${xAt(i)},${yAt(r.overall)}`)
    .join(" ");

  const gridStroke = "rgba(255,255,255,0.10)";
  const axisFill = "rgba(255,255,255,0.70)";
  const lineStroke = "rgba(59,130,246,0.95)";
  const lineFill = "rgba(59,130,246,0.18)";
  const markerFill = "rgba(255,255,255,0.95)";
  const markerStroke = "rgba(59,130,246,0.95)";
  const markerText = "rgba(59,130,246,0.95)";

  const areaPoints = `${padL},${padT + plotH} ${points} ${padL + plotW},${padT + plotH}`;

  const seasonLabel = (s: string) => {
    const t = String(s || "").trim();
    if (!t) return "";
    return t.length > 5 ? t.slice(-5) : t;
  };

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" className="mx-auto block h-auto">
      {[0.25, 0.5, 0.75].map((k) => (
        <line
          key={k}
          x1={padL}
          y1={padT + plotH * k}
          x2={padL + plotW}
          y2={padT + plotH * k}
          stroke={gridStroke}
          strokeWidth="1"
        />
      ))}

      <polyline points={areaPoints} fill={lineFill} stroke="none" />
      <polyline points={points} fill="none" stroke={lineStroke} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

      {rows.map((r, i) => (
        <g key={r.season}>
          <circle cx={xAt(i)} cy={yAt(r.overall)} r="10" fill={markerFill} stroke={markerStroke} strokeWidth="1" />
          <text
            x={xAt(i)}
            y={yAt(r.overall) + 0.5}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize="10"
            fontWeight={800}
            fill={markerText}
          >
            {Math.round(r.overall)}
          </text>
        </g>
      ))}

      {rows.map((r, i) => (
        <text
          key={`${r.season}-t`}
          x={xAt(i)}
          y={H - 8}
          textAnchor="middle"
          fontSize="10"
          fill={axisFill}
        >
          {seasonLabel(r.season)}
        </text>
      ))}
    </svg>
  );
}
