"use client";

import { Trophy, Calendar } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface TournamentSelectionProps {
  selectedTournament: string;
  onTournamentChange: (tournament: string) => void;
  tournaments: Array<{ id: string; name: string; season?: string }>;
  selectedTournamentType: string;
  selectedSeason: string;
  onSeasonChange: (season: string) => void;
  seasons: string[];
}

export function TournamentSelection({
  selectedTournament,
  onTournamentChange,
  tournaments,
  selectedTournamentType,
  selectedSeason,
  onSeasonChange,
  seasons
}: TournamentSelectionProps) {
  const visibleTournaments = tournaments
    .filter(t => !t.name.toLowerCase().includes("test"))
    .filter((t: any) => {
      if (!selectedTournamentType) return true;
      const format = typeof t?.format === 'string' ? String(t.format) : '';
      const normalized = format === 'league_cup' ? 'league-cup' : format;
      if (selectedTournamentType === 'league-cup') return normalized === 'league-cup';
      if (selectedTournamentType === 'league') return normalized === 'league';
      if (selectedTournamentType === 'cup') return normalized === 'cup';
      return true;
    });

  const tournamentNameOptions = Array.from(
    new Set(
      visibleTournaments
        .map((t: any) => (typeof t?.name === 'string' ? t.name.trim() : ''))
        .filter((n: string) => n.length > 0)
    )
  ).sort((a, b) => a.localeCompare(b, 'ja'));

  const seasonOptions = (() => {
    if (selectedTournament === 'all') return seasons;
    const set = new Set<string>();
    for (const t of visibleTournaments as any[]) {
      if (String(t?.name || '').trim() !== selectedTournament) continue;
      const s = typeof t?.season === 'string' ? t.season.trim() : '';
      if (s) set.add(s);
    }
    const list = Array.from(set);
    list.sort((a, b) => b.localeCompare(a, 'ja'));
    return list;
  })();

  return (
    <div className="relative overflow-hidden rounded-xl bg-slate-800/50 backdrop-blur-xl border border-slate-700">
      <div className="relative p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-gradient-to-r from-purple-600/40 to-indigo-600/40 border border-indigo-500/40 rounded-lg">
            <Trophy className="h-5 w-5 text-purple-300" />
          </div>
          <div>
            <h3 className="text-white font-semibold">大会選択</h3>
            <p className="text-slate-400 text-sm">分析対象の大会とシーズンを選択</p>
          </div>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Select
              value={selectedTournament}
              onValueChange={(v) => {
                onTournamentChange(v);
                onSeasonChange('all');
              }}
            >
              <SelectTrigger className="w-full bg-gradient-to-r from-purple-600/30 to-indigo-600/30 border-purple-500/40 text-white backdrop-blur-sm hover:from-purple-600/40 hover:to-indigo-600/40 transition-all">
                <Trophy className="h-4 w-4 mr-2 text-purple-300" />
                <SelectValue placeholder="大会" />
              </SelectTrigger>
              <SelectContent className="bg-slate-900/95 border-purple-500/40 text-white">
                <SelectItem value="all" className="text-white">大会を選択</SelectItem>
                {tournamentNameOptions.map((name) => (
                  <SelectItem key={name} value={name} className="text-white">
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="relative flex-1">
            <Select value={selectedSeason} onValueChange={onSeasonChange}>
              <SelectTrigger className="w-full bg-gradient-to-r from-blue-600/30 to-cyan-600/30 border-cyan-500/40 text-white backdrop-blur-sm hover:from-blue-600/40 hover:to-cyan-600/40 transition-all">
                <Calendar className="h-4 w-4 mr-2 text-cyan-300" />
                <SelectValue placeholder="シーズン" />
              </SelectTrigger>
              <SelectContent className="bg-slate-900/95 border-cyan-500/40 text-white">
                <SelectItem value="all" className="text-white">すべてのシーズン</SelectItem>
                {seasonOptions.map((season) => (
                  <SelectItem key={season} value={season} className="text-white">
                    {season}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    </div>
  );
}
