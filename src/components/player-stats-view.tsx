"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { db } from '@/lib/firebase';
import { collection, getDocs } from 'firebase/firestore';
import Link from 'next/link';
import { usePlayerStats, PlayerStats as AggregatedPlayerStats } from '@/hooks/usePlayerStats';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, ArrowUpDown } from "lucide-react";

interface PlayerRow {
  id: string;
  name: string;
  number: number;
  teamId?: string;
}

interface TeamOption {
  id: string;
  name: string;
}

export function PlayerStatsView() {
  const { user, ownerUid: ownerUidFromContext } = useAuth();
  const ownerUid = ownerUidFromContext || user?.uid || null;
  const [seasons, setSeasons] = useState<string[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<string>('all');
  const [competitions, setCompetitions] = useState<{ id: string, name: string }[]>([]);
  const [selectedCompetition, setSelectedCompetition] = useState<string>('all');
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<string>('all');
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [sortConfig, setSortConfig] = useState<{ key: keyof AggregatedPlayerStats, direction: 'asc' | 'desc' } | null>(null);

  const { stats, loading: statsLoading } = usePlayerStats(
    ownerUid,
    selectedSeason || 'all',
    selectedCompetition
  );

  useEffect(() => {
    if (!ownerUid) return;
    const fetchCompetitions = async () => {
      const comps: { id: string, name: string }[] = [];
      const seasonSet = new Set<string>();
      const querySnapshot = await getDocs(collection(db, `clubs/${ownerUid}/competitions`));
      querySnapshot.forEach((doc) => {
        const data = doc.data() as any;
        comps.push({ id: doc.id, name: data.name });
        if (data.season) {
          seasonSet.add(data.season as string);
        }
      });
      setCompetitions(comps);
      if (seasonSet.size > 0) {
        const seasonIds = Array.from(seasonSet).sort((a, b) => b.localeCompare(a));
        setSeasons(seasonIds);
      }
    };
    fetchCompetitions();
  }, [ownerUid]);

  // シーズン別ロスターが未設定でも動くように、クラブ配下の全チームの選手から一覧を作成
  useEffect(() => {
    if (!ownerUid) return;
    const fetchPlayers = async () => {
      const resultPlayers: PlayerRow[] = [];
      const resultTeams: TeamOption[] = [];
      const teamsSnapshot = await getDocs(collection(db, `clubs/${ownerUid}/teams`));
      for (const teamDoc of teamsSnapshot.docs) {
        const teamData = teamDoc.data() as any;
        resultTeams.push({ id: teamDoc.id, name: teamData.name ?? 'チーム' });
        const playersSnapshot = await getDocs(
          collection(db, `clubs/${ownerUid}/teams/${teamDoc.id}/players`)
        );
        playersSnapshot.forEach((pDoc) => {
          const data = pDoc.data() as any;
          resultPlayers.push({
            id: pDoc.id,
            name: data.name,
            number: data.number ?? 0,
            teamId: teamDoc.id,
          });
        });
      }
      // 背番号、名前でソートしておく
      resultPlayers.sort((a, b) => a.number - b.number || a.name.localeCompare(b.name));
      resultTeams.sort((a, b) => a.name.localeCompare(b.name));
      setPlayers(resultPlayers);
      setTeams(resultTeams);
    };
    fetchPlayers();
  }, [ownerUid]);

  const filteredPlayersByTeam = selectedTeam === 'all'
    ? players
    : players.filter((p) => p.teamId === selectedTeam);

  const sortedPlayers = [...filteredPlayersByTeam].sort((a, b) => {
    if (sortConfig) {
      const aStats = stats[a.id] || { appearances: 0, minutes: 0, goals: 0, assists: 0, yellowCards: 0, redCards: 0 };
      const bStats = stats[b.id] || { appearances: 0, minutes: 0, goals: 0, assists: 0, yellowCards: 0, redCards: 0 };
      const aValue = aStats[sortConfig.key];
      const bValue = bStats[sortConfig.key];

      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
    }
    return a.number - b.number;
  });

  const requestSort = (key: keyof AggregatedPlayerStats) => {
    let direction: 'asc' | 'desc' = 'desc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'desc') {
      direction = 'asc';
    }
    setSortConfig({ key, direction });
  };

  const renderSortArrow = (key: keyof AggregatedPlayerStats) => {
    if (!sortConfig || sortConfig.key !== key) {
      return <ArrowUpDown className="ml-2 h-4 w-4 opacity-30" />;
    }
    return sortConfig.direction === 'desc' ? '↓' : '↑';
  };

  if (!user) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
        <Select value={selectedSeason} onValueChange={setSelectedSeason}>
          <SelectTrigger className="w-full sm:w-[180px] bg-white text-gray-900">
            <SelectValue placeholder="シーズンを選択" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">すべてのシーズン</SelectItem>
            {seasons.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={selectedTeam} onValueChange={setSelectedTeam}>
          <SelectTrigger className="w-full sm:w-[180px] bg-white text-gray-900">
            <SelectValue placeholder="チームを選択" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">すべてのチーム</SelectItem>
            {teams.map(t => (
              <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={selectedCompetition} onValueChange={setSelectedCompetition}>
          <SelectTrigger className="w-full sm:w-[180px] bg-white text-gray-900">
            <SelectValue placeholder="大会を選択" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">すべての大会</SelectItem>
            {competitions.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {statsLoading ? (
        <div className="flex justify-center items-center h-64">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-white text-gray-900">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="p-2 sm:p-3 text-left font-semibold w-[45%]">選手</th>
                <th className="p-2 sm:p-3 text-center font-semibold cursor-pointer" onClick={() => requestSort('appearances')}>出場 {renderSortArrow('appearances')}</th>
                <th className="p-2 sm:p-3 text-center font-semibold cursor-pointer hidden sm:table-cell" onClick={() => requestSort('minutes')}>分 {renderSortArrow('minutes')}</th>
                <th className="p-2 sm:p-3 text-center font-semibold cursor-pointer" onClick={() => requestSort('goals')}>G {renderSortArrow('goals')}</th>
                <th className="p-2 sm:p-3 text-center font-semibold cursor-pointer" onClick={() => requestSort('assists')}>A {renderSortArrow('assists')}</th>
                <th className="p-2 sm:p-3 text-center font-semibold cursor-pointer hidden sm:table-cell" onClick={() => requestSort('yellowCards')}>Y {renderSortArrow('yellowCards')}</th>
                <th className="p-2 sm:p-3 text-center font-semibold cursor-pointer hidden sm:table-cell" onClick={() => requestSort('redCards')}>R {renderSortArrow('redCards')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {sortedPlayers.map(player => {
                const playerStats = stats[player.id] || { appearances: 0, minutes: 0, goals: 0, assists: 0, yellowCards: 0, redCards: 0 };
                return (
                  <tr key={player.id}>
                    <td className="p-2 sm:p-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-muted-foreground w-6 text-center shrink-0">{player.number}</span>
                        <Link href={`/admin/stats/${player.id}`} className="hover:underline flex-1 min-w-0 whitespace-nowrap truncate">
                          {player.name}
                        </Link>
                      </div>
                    </td>
                    <td className="p-2 sm:p-3 text-center">{playerStats.appearances}</td>
                    <td className="p-2 sm:p-3 text-center hidden sm:table-cell">{playerStats.minutes}</td>
                    <td className="p-2 sm:p-3 text-center">{playerStats.goals}</td>
                    <td className="p-2 sm:p-3 text-center">{playerStats.assists}</td>
                    <td className="p-2 sm:p-3 text-center hidden sm:table-cell">{playerStats.yellowCards}</td>
                    <td className="p-2 sm:p-3 text-center hidden sm:table-cell">{playerStats.redCards}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
