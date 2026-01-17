"use client";

import { BookletPlayerCard } from "../../components/BookletPlayerCard";
import type { BookletPlayer } from "../../types";

export function SlotButton({
  active,
  label,
  player,
  positionColorClass,
  options,
  onClick,
  onAssign,
  onClear,
}: {
  active: boolean;
  label: string;
  player: BookletPlayer | null;
  positionColorClass: string;
  options: BookletPlayer[];
  onClick: () => void;
  onAssign: (playerId: string | null) => void;
  onClear: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className={`relative w-full aspect-[3/2] rounded-md border text-left p-2 transition-colors cursor-pointer select-none ${
        active ? "border-emerald-500 bg-emerald-50" : "border-gray-300 bg-white hover:bg-gray-50"
      }`}
    >
      <div className="absolute left-2 top-2 z-10 rounded bg-white/90 px-1.5 py-0.5 text-[11px] font-semibold text-gray-700 border border-gray-200">
        {label}
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClear();
        }}
        className="absolute right-2 top-2 z-10 rounded bg-white/90 px-1.5 py-0.5 text-[11px] text-gray-600 hover:text-gray-900 border border-gray-200"
      >
        クリア
      </button>

      {active ? (
        <div className="absolute left-2 right-2 bottom-2 z-10">
          <select
            value={player?.id || ""}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => {
              e.stopPropagation();
              const v = String(e.target.value || "").trim();
              onAssign(v ? v : null);
            }}
            className="w-full rounded border border-gray-200 bg-white/95 px-2 py-1 text-[11px]"
          >
            <option value="">未選択</option>
            {options.map((p) => (
              <option key={p.id} value={p.id}>
                {(p.number != null ? String(p.number) : "-") + " " + p.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {player ? (
        <div className="mt-6 pointer-events-none">
          <div className="origin-top-left scale-[0.78]">
            <BookletPlayerCard player={player} positionColorClass={positionColorClass} />
          </div>
        </div>
      ) : (
        <div className="mt-8 text-sm text-gray-400">NoImage</div>
      )}
    </div>
  );
}
