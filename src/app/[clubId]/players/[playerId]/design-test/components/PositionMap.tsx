import React from "react";

const POSITION_MAP_BOXES: Array<{ key: string; style: { left: string; top: string; width: string; height: string } }> = [
  { key: "ST", style: { left: "24%", top: "4%", width: "52%", height: "16%" } },
  { key: "LW", style: { left: "4%", top: "4%", width: "21%", height: "26%" } },
  { key: "RW", style: { left: "75%", top: "4%", width: "21%", height: "26%" } },
  { key: "AM", style: { left: "24%", top: "20%", width: "52%", height: "16%" } },
  { key: "LM", style: { left: "4%", top: "30%", width: "21%", height: "26%" } },
  { key: "RM", style: { left: "75%", top: "30%", width: "21%", height: "26%" } },
  { key: "CM", style: { left: "24%", top: "36%", width: "52%", height: "16%" } },
  { key: "DM", style: { left: "24%", top: "52%", width: "52%", height: "16%" } },
  { key: "LB", style: { left: "4%", top: "56%", width: "21%", height: "28%" } },
  { key: "RB", style: { left: "75%", top: "56%", width: "21%", height: "28%" } },
  { key: "CB", style: { left: "24%", top: "68%", width: "52%", height: "16%" } },
  { key: "GK", style: { left: "33%", top: "84%", width: "34%", height: "8%" } },
];

export function PositionMap({
  mainPosition,
  subPositions,
}: {
  mainPosition?: string;
  subPositions?: string[];
}) {
  const main = (mainPosition || "").trim();
  const subs = Array.isArray(subPositions) ? subPositions : [];
  if (!main && subs.length === 0) return null;

  const VIEW_W = 100;
  const VIEW_H = 160;
  const INSET = 4;

  const pct = (v: string) => (Number.parseFloat(v) || 0) / 100;
  const toX = (v: string) => INSET + pct(v) * (VIEW_W - INSET * 2);
  const toY = (v: string) => INSET + pct(v) * (VIEW_H - INSET * 2);
  const toW = (v: string) => pct(v) * (VIEW_W - INSET * 2);
  const toH = (v: string) => pct(v) * (VIEW_H - INSET * 2);

  return (
    <svg viewBox="0 0 100 160" preserveAspectRatio="xMidYMid meet" className="h-full w-full rounded-xl">
      <rect x={INSET} y={INSET} width={VIEW_W - INSET * 2} height={VIEW_H - INSET * 2} rx={6} fill="rgba(255,255,255,0.02)" />

      {POSITION_MAP_BOXES.map((p) => {
        const isMain = main === p.key;
        const isSub = subs.includes(p.key);
        const fill = isMain ? "rgba(244,63,94,0.80)" : isSub ? "rgba(244,63,94,0.25)" : "rgba(0,0,0,0.04)";
        return (
          <rect
            key={p.key}
            x={toX(p.style.left)}
            y={toY(p.style.top)}
            width={toW(p.style.width)}
            height={toH(p.style.height)}
            rx={1}
            fill={fill}
          />
        );
      })}

      {POSITION_MAP_BOXES.map((p) => {
        return (
          <rect
            key={`${p.key}-stroke`}
            x={toX(p.style.left)}
            y={toY(p.style.top)}
            width={toW(p.style.width)}
            height={toH(p.style.height)}
            rx={1}
            fill="none"
            stroke="rgba(255,255,255,0.18)"
            strokeWidth={0.6}
          />
        );
      })}

      <rect
        x={INSET}
        y={INSET}
        width={VIEW_W - INSET * 2}
        height={VIEW_H - INSET * 2}
        rx={6}
        fill="none"
        stroke="rgba(255,255,255,0.28)"
        strokeWidth={1}
      />
    </svg>
  );
}
