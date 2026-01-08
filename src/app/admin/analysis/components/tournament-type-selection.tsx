"use client";

import { Trophy } from "lucide-react";
import { cn } from "@/lib/utils";

interface TournamentTypeSelectionProps {
  selectedType: string;
  onTypeChange: (type: string) => void;
}

const tournamentTypes = [
  { id: "league", name: "リーグ戦", label: "リーグ戦" },
  { id: "league-cup", name: "リーグ&カップ戦", label: "リーグ&カップ戦" },
  { id: "cup", name: "カップ戦", label: "カップ戦" }
];

export function TournamentTypeSelection({
  selectedType,
  onTypeChange
}: TournamentTypeSelectionProps) {
  return (
    <div className="relative overflow-hidden rounded-xl bg-slate-800/50 backdrop-blur-xl border border-slate-700">
      <div className="relative p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-gradient-to-r from-blue-600/40 to-cyan-600/40 border border-cyan-500/40 rounded-lg">
            <Trophy className="h-5 w-5 text-cyan-300" />
          </div>
          <div>
            <h3 className="text-white font-semibold">大会種類</h3>
            <p className="text-slate-400 text-sm">分析対象の大会タイプを選択</p>
          </div>
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {tournamentTypes.map((type) => (
            <button
              key={type.id}
              onClick={() => onTypeChange(type.id)}
              className={cn(
                "relative overflow-hidden rounded-lg border transition-all duration-300 p-3 text-center",
                selectedType === type.id
                  ? "bg-gradient-to-r from-blue-600/30 to-cyan-600/30 border-blue-500/50 text-white shadow-lg"
                  : "bg-slate-700/30 border-slate-600/50 text-slate-300 hover:bg-slate-700/50 hover:text-white"
              )}
            >
              <div className="relative z-10">
                <p className="font-medium text-sm">{type.label}</p>
              </div>
              {selectedType === type.id && (
                <div className="absolute inset-0 bg-gradient-to-r from-blue-600/20 to-cyan-600/20"></div>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
