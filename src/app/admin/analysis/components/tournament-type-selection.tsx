"use client";

import { Lock, Trophy } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useEffect } from "react";

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
  useEffect(() => {
    if (selectedType && selectedType !== "league") {
      onTypeChange("league");
    }
  }, [selectedType, onTypeChange]);

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

        <Select value={selectedType} onValueChange={onTypeChange}>
          <SelectTrigger className="w-full bg-slate-700/30 border-slate-600/50 text-white">
            <SelectValue placeholder="大会種類を選択" />
          </SelectTrigger>
          <SelectContent>
            {tournamentTypes.map((type) => (
              <SelectItem key={type.id} value={type.id} disabled={type.id !== "league"}>
                <span className="flex items-center gap-2">
                  <span>{type.label}</span>
                  {type.id !== "league" && <Lock className="h-3.5 w-3.5 text-slate-400" />}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
