"use client";

import { useState } from "react";
import { Filter, Calendar, Trophy } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface AnalysisFiltersProps {
  selectedSeason: string;
  setSelectedSeason: (season: string) => void;
  selectedCompetitionId: string;
  setSelectedCompetitionId: (id: string) => void;
  selectedCompetitionType: string;
  setSelectedCompetitionType: (type: string) => void;
  seasons: string[];
  competitions: Array<{ id: string; name: string; season?: string }>;
}

export function AnalysisFilters({
  selectedSeason,
  setSelectedSeason,
  selectedCompetitionId,
  setSelectedCompetitionId,
  selectedCompetitionType,
  setSelectedCompetitionType,
  seasons,
  competitions
}: AnalysisFiltersProps) {
  const visibleCompetitions = competitions.filter(c => !c.name.toLowerCase().includes("test"));

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-600/20 via-cyan-600/15 to-teal-600/20 backdrop-blur-xl border border-blue-500/30 shadow-xl">
      <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-cyan-500/10"></div>
      <div className="relative p-4 md:p-6">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-r from-blue-600/40 to-cyan-600/40 border border-cyan-500/40" style={{clipPath: 'polygon(0 0, 90% 0, 100% 50%, 90% 100%, 0 100%)'}}>
              <Filter className="h-4 w-4 md:h-5 md:w-5 text-cyan-300" />
            </div>
            <div>
              <h3 className="text-white font-semibold text-sm md:text-base">データフィルター</h3>
              <p className="text-cyan-100 text-xs md:text-sm">分析対象を選択</p>
            </div>
          </div>
          
          <div className="flex flex-col sm:flex-row sm:flex-wrap items-center gap-3">
            <div className="relative w-full sm:w-auto">
              <Select value={selectedSeason} onValueChange={setSelectedSeason}>
                <SelectTrigger className="w-full sm:w-[200px] bg-gradient-to-r from-blue-600/30 to-cyan-600/30 border-cyan-500/40 text-white backdrop-blur-sm hover:from-blue-600/40 hover:to-cyan-600/40 transition-all">
                  <Calendar className="h-4 w-4 mr-2 text-cyan-300" />
                  <SelectValue placeholder="シーズン" />
                </SelectTrigger>
                <SelectContent className="bg-slate-900/95 border-cyan-500/40 text-white">
                  <SelectItem value="all" className="text-white">すべてのシーズン</SelectItem>
                  {seasons.map((s) => (
                    <SelectItem key={s} value={s} className="text-white">{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="relative w-full sm:w-auto">
              <Select value={selectedCompetitionType} onValueChange={setSelectedCompetitionType}>
                <SelectTrigger className="w-full sm:w-[200px] bg-gradient-to-r from-purple-600/30 to-indigo-600/30 border-purple-500/40 text-white backdrop-blur-sm hover:from-purple-600/40 hover:to-indigo-600/40 transition-all">
                  <Trophy className="h-4 w-4 mr-2 text-purple-300" />
                  <SelectValue placeholder="大会タイプ" />
                </SelectTrigger>
                <SelectContent className="bg-slate-900/95 border-purple-500/40 text-white">
                  <SelectItem value="all" className="text-white">すべてのタイプ</SelectItem>
                  <SelectItem value="league" className="text-white">リーグ戦</SelectItem>
                  <SelectItem value="cup" className="text-white">カップ戦</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="relative w-full sm:w-auto">
              <Select value={selectedCompetitionId} onValueChange={setSelectedCompetitionId}>
                <SelectTrigger className="w-full sm:w-[200px] bg-gradient-to-r from-cyan-600/30 to-teal-600/30 border-teal-500/40 text-white backdrop-blur-sm hover:from-cyan-600/40 hover:to-teal-600/40 transition-all">
                  <Trophy className="h-4 w-4 mr-2 text-cyan-300" />
                  <SelectValue placeholder="大会" />
                </SelectTrigger>
                <SelectContent className="bg-slate-900/95 border-cyan-500/40 text-white">
                  <SelectItem value="all" className="text-white">すべての大会</SelectItem>
                  {visibleCompetitions.map((c) => (
                    <SelectItem key={c.id} value={c.id} className="text-white">
                      {c.season ? `${c.name} (${c.season})` : c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
