import React from "react";

function clamp99(n: unknown): number {
  if (typeof n !== "number" || !Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(99, n));
}

export function PublicPlayerHexChart({
  labels,
  values,
  overall,
}: {
  labels: string[];
  values: number[];
  overall: number;
}) {
  const size = 240;
  const pad = 44;
  const c = size / 2;
  const r = 86;
  const max = 99;
  const angles = Array.from({ length: 6 }, (_, i) => -Math.PI / 2 + (i * (Math.PI * 2)) / 6);

  const outerPoints = angles.map((a) => `${c + r * Math.cos(a)},${c + r * Math.sin(a)}`).join(" ");

  const valuePoints = angles
    .map((a, i) => {
      const rr = r * (clamp99(values[i] ?? 0) / max);
      return `${c + rr * Math.cos(a)},${c + rr * Math.sin(a)}`;
    })
    .join(" ");

  const labelPoints = angles.map((a) => {
    const rr = r + 36;
    return {
      x: c + rr * Math.cos(a),
      y: c + rr * Math.sin(a),
      anchor: Math.abs(Math.cos(a)) < 0.2 ? "middle" : Math.cos(a) > 0 ? "start" : "end",
    } as const;
  });

  const valueUnderLabelPoints = angles.map((a) => {
    // Place value under the label by moving toward center along the same axis.
    const rr = r + 10;
    return {
      x: c + rr * Math.cos(a),
      y: c + rr * Math.sin(a),
      anchor: Math.abs(Math.cos(a)) < 0.2 ? "middle" : Math.cos(a) > 0 ? "start" : "end",
    } as const;
  });

  return (
    <svg width="100%" viewBox={`${-pad} ${-pad} ${size + pad * 2} ${size + pad * 2}`} className="max-w-[360px]">
      <polygon points={outerPoints} fill="none" stroke="#E5E7EB" strokeWidth="2" />
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
          stroke="#F3F4F6"
          strokeWidth="2"
        />
      ))}
      {angles.map((a, idx) => (
        <line key={idx} x1={c} y1={c} x2={c + r * Math.cos(a)} y2={c + r * Math.sin(a)} stroke="#F3F4F6" strokeWidth="2" />
      ))}
      <polygon points={valuePoints} fill="rgba(37,99,235,0.25)" stroke="#2563EB" strokeWidth="2" />
      <text x={c} y={c - 6} textAnchor="middle" fontSize="12" fill="#6B7280">
        総合
      </text>
      <text x={c} y={c + 24} textAnchor="middle" fontSize="32" fontWeight="700" fill="#111827">
        {clamp99(overall)}
      </text>

      {labelPoints.map((p, i) => (
        <text
          key={`l-${i}`}
          x={p.x}
          y={p.y}
          textAnchor={p.anchor}
          dominantBaseline="middle"
          fontSize="11"
          fontWeight={600}
          fill="#111827"
        >
          {(labels[i] || "").slice(0, 8) || `項目${i + 1}`}
        </text>
      ))}

      {valueUnderLabelPoints.map((p, i) => (
        <text
          key={`n-${i}`}
          x={p.x}
          y={p.y}
          textAnchor={p.anchor}
          dominantBaseline="middle"
          fontSize="12"
          fontWeight={700}
          fill="#111827"
        >
          {clamp99(values[i] ?? 0)}
        </text>
      ))}
    </svg>
  );
}
