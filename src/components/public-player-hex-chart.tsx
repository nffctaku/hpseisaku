import React from "react";

function clamp99(n: unknown): number {
  if (typeof n !== "number" || !Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(99, n));
}

function hexToRgba(hex: string, alpha: number) {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16) || 0;
  const g = parseInt(clean.substring(2, 4), 16) || 0;
  const b = parseInt(clean.substring(4, 6), 16) || 0;
  return `rgba(${r},${g},${b},${alpha})`;
}

export function PublicPlayerHexChart({
  labels,
  values,
  overall,
  theme,
  className,
  accentColor,
  dense,
}: {
  labels: string[];
  values: number[];
  overall: number;
  theme?: "light" | "dark";
  className?: string;
  accentColor?: string;
  dense?: boolean;
}) {
  const isDark = theme === "dark";
  const size = 120;
  const c = size / 2;
  const r = dense ? 56 : 40;
  const labelRr = dense ? 70 : 28 + r;
  const valueRr = 8 + r;
  const labelFontSize = dense ? 9.5 : 12;
  const valueFontSize = dense ? 9.5 : 10;
  const vbX = dense ? -34 : -60;
  const vbY = dense ? -22 : -60;
  const vbW = dense ? 188 : 240;
  const vbH = dense ? 164 : 240;
  const max = 99;
  const angles = Array.from({ length: 6 }, (_, i) => -Math.PI / 2 + (i * (Math.PI * 2)) / 6);

  const gridStroke = isDark ? "rgba(255,255,255,0.18)" : "#F3F4F6";
  const outerStroke = isDark ? "rgba(255,255,255,0.30)" : "#E5E7EB";
  const labelFill = isDark ? "rgba(255,255,255,0.92)" : "#111827";
  const valueFill = isDark ? "rgba(255,255,255,0.92)" : "#111827";
  const overallLabelFill = isDark ? "rgba(255,255,255,0.72)" : "#6B7280";

  const outerPoints = angles.map((a) => `${c + r * Math.cos(a)},${c + r * Math.sin(a)}`).join(" ");

  const valuePoints = angles
    .map((a, i) => {
      const rr = r * (clamp99(values[i] ?? 0) / max);
      return `${c + rr * Math.cos(a)},${c + rr * Math.sin(a)}`;
    })
    .join(" ");

  const axisPoint = (a: number, rr: number) => ({
    x: c + rr * Math.cos(a),
    y: c + rr * Math.sin(a),
  });

  const labelPoints = angles.map((a) => {
    const rr = labelRr;
    return {
      x: c + rr * Math.cos(a),
      y: c + rr * Math.sin(a),
      anchor: Math.abs(Math.cos(a)) < 0.2 ? "middle" : Math.cos(a) > 0 ? "start" : "end",
    } as const;
  });

  const valueUnderLabelPoints = angles.map((a) => {
    // Place value under the label by moving toward center along the same axis.
    const rr = valueRr;
    return {
      x: c + rr * Math.cos(a),
      y: c + rr * Math.sin(a),
      anchor: Math.abs(Math.cos(a)) < 0.2 ? "middle" : Math.cos(a) > 0 ? "start" : "end",
    } as const;
  });

  return (
    <svg width="100%" viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`} className={className || "mx-auto block max-w-[180px] h-auto"}>
      <polygon points={outerPoints} fill="none" stroke={outerStroke} strokeWidth="2" />
      {[0.2, 0.4, 0.6, 0.8].map((k) => (
        <polygon
          key={k}
          points={angles
            .map((a) => {
              const rr = r * k;
              return `${c + rr * Math.cos(a)},${c + rr * Math.sin(a)}`;
            })
            .join(" ")}
          fill="none"
          stroke={gridStroke}
          strokeWidth="2"
        />
      ))}
      {angles.map((a, idx) => (
        <line key={idx} x1={c} y1={c} x2={c + r * Math.cos(a)} y2={c + r * Math.sin(a)} stroke={gridStroke} strokeWidth="2" />
      ))}
      <polygon
        points={valuePoints}
        fill={accentColor ? hexToRgba(accentColor, 0.25) : "rgba(37,99,235,0.25)"}
        stroke={accentColor ? accentColor : "#2563EB"}
        strokeWidth={dense ? 1.6 : 2}
      />
      {dense &&
        angles.map((a, i) => {
          const rr = r * (clamp99(values[i] ?? 0) / max);
          const p = axisPoint(a, rr);
          return (
            <circle key={`v-${i}`} cx={p.x} cy={p.y} r="1.8" fill={accentColor || "#E11D48"} />
          );
        })}
      <text x={c} y={c - 5} textAnchor="middle" fontSize={dense ? 9 : 10} fill={overallLabelFill}>
        総合
      </text>
      <text x={c} y={c + 18} textAnchor="middle" fontSize={dense ? 20 : 18} fontWeight="700" fill={valueFill}>
        {clamp99(overall)}
      </text>

      {dense
        ? labelPoints.map((p, i) => (
            <g key={`d-${i}`}>
              <text
                x={p.x}
                y={p.y - 5}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={labelFontSize}
                fontWeight={600}
                fill={labelFill}
              >
                {(labels[i] || "").slice(0, 8) || `項目${i + 1}`}
              </text>
              <text
                x={p.x}
                y={p.y + 6}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={valueFontSize}
                fontWeight={700}
                fill={valueFill}
              >
                {clamp99(values[i] ?? 0)}
              </text>
            </g>
          ))
        : labelPoints.map((p, i) => (
            <text
              key={`l-${i}`}
              x={p.x}
              y={p.y}
              textAnchor={p.anchor}
              dominantBaseline="middle"
              fontSize={labelFontSize}
              fontWeight={600}
              fill={labelFill}
            >
              {(labels[i] || "").slice(0, 8) || `項目${i + 1}`}
            </text>
          ))}

      {!dense &&
        valueUnderLabelPoints.map((p, i) => (
          <text
            key={`n-${i}`}
            x={p.x}
            y={p.y}
            textAnchor={p.anchor}
            dominantBaseline="middle"
            fontSize={valueFontSize}
            fontWeight={700}
            fill={valueFill}>
            {clamp99(values[i] ?? 0)}
          </text>
        ))}
    </svg>
  );
}
