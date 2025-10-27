"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { db } from '@/lib/firebase';
import { collection, getDocs } from 'firebase/firestore';
import Link from 'next/link';
import { usePlayerStats, PlayerStats } from '@/hooks/usePlayerStats';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, ArrowUpDown } from "lucide-react";

interface Player {
  id: string;
  name: string;
  number: number;
}

export default function StatsPage() {
  const { user } = useAuth();
  const [seasons, setSeasons] = useState<string[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<string>('');
  const [competitions, setCompetitions] = useState<{ id: string, name: string }[]>([]);
  const [selectedCompetition, setSelectedCompetition] = useState<string>('all');
  const [players, setPlayers] = useState<Player[]>([]);
  const [sortConfig, setSortConfig] = useState<{ key: keyof PlayerStats, direction: 'asc' | 'desc' } | null>(null);

  const { stats, loading: statsLoading } = usePlayerStats(user ? user.uid : null, selectedSeason, selectedCompetition);

  useEffect(() => {
    if (!user) return;
    const fetchSeasons = async () => {
      const seasonsColRef = collection(db, `clubs/${user.uid}/seasons`);
      const snapshot = await getDocs(seasonsColRef);
      const seasonIds = snapshot.docs.map(doc => doc.id).sort((a, b) => b.localeCompare(a));
      setSeasons(seasonIds);
      if (seasonIds.length > 0) {
        setSelectedSeason(seasonIds[0]);
      }
    };
    fetchSeasons();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const fetchCompetitions = async () => {
      const comps: { id: string, name: string }[] = [];
      const querySnapshot = await getDocs(collection(db, `clubs/${user.uid}/competitions`));
      querySnapshot.forEach((doc) => {
        comps.push({ id: doc.id, name: doc.data().name });
      });
      setCompetitions(comps);
    };
    fetchCompetitions();
  }, [user]);

  useEffect(() => {
    if (!selectedSeason || !user) return;
    const fetchPlayers = async () => {
      const rosterColRef = collection(db, `clubs/${user.uid}/seasons/${selectedSeason}/roster`);
      const snapshot = await getDocs(rosterColRef);
      const playersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Player));
      setPlayers(playersData);
    };
    fetchPlayers();
  }, [selectedSeason, user]);

  const sortedPlayers = [...players].sort((a, b) => {
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

  const requestSort = (key: keyof PlayerStats) => {
    let direction: 'asc' | 'desc' = 'desc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'desc') {
      direction = 'asc';
    }
    setSortConfig({ key, direction });
  };

  const renderSortArrow = (key: keyof PlayerStats) => {
    if (!sortConfig || sortConfig.key !== key) {
      return <ArrowUpDown className="ml-2 h-4 w-4 opacity-30" />;
    }
    return sortConfig.direction === 'desc' ? '↓' : '↑';
  };

  return (
    <div className="container mx-auto py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">選手スタッツ管理</h1>
        <div className="flex gap-2">
          <Select value={selectedSeason} onValueChange={setSelectedSeason}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="シーズンを選択" />
            </SelectTrigger>
            <SelectContent>
              {seasons.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={selectedCompetition} onValueChange={setSelectedCompetition}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="大会を選択" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">すべての大会</SelectItem>
              {competitions.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {statsLoading ? (
        <div className="flex justify-center items-center h-64">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="min-w-full divide-y divide-gray-700">
            <thead className="bg-gray-800">
              <tr>
                <th className="p-4 text-left font-semibold w-1/3">選手</th>
                <th className="p-4 text-center font-semibold cursor-pointer" onClick={() => requestSort('appearances')}>出場 {renderSortArrow('appearances')}</th>
                <th className="p-4 text-center font-semibold cursor-pointer hidden sm:table-cell" onClick={() => requestSort('minutes')}>分 {renderSortArrow('minutes')}</th>
                <th className="p-4 text-center font-semibold cursor-pointer" onClick={() => requestSort('goals')}>G {renderSortArrow('goals')}</th>
                <th className="p-4 text-center font-semibold cursor-pointer" onClick={() => requestSort('assists')}>A {renderSortArrow('assists')}</th>
                <th className="p-4 text-center font-semibold cursor-pointer hidden sm:table-cell" onClick={() => requestSort('yellowCards')}>Y {renderSortArrow('yellowCards')}</th>
                <th className="p-4 text-center font-semibold cursor-pointer hidden sm:table-cell" onClick={() => requestSort('redCards')}>R {renderSortArrow('redCards')}</th>
              </tr>
            </thead>
            <tbody className="bg-gray-900 divide-y divide-gray-700">
              {sortedPlayers.map(player => {
                const playerStats = stats[player.id] || { appearances: 0, minutes: 0, goals: 0, assists: 0, yellowCards: 0, redCards: 0 };
                return (
                  <tr key={player.id}>
                    <td className="p-4 flex items-center gap-2">
                      <span className="text-muted-foreground w-6 text-center">{player.number}</span>
                      <Link href={`/admin/stats/${player.id}`} className="hover:underline">
                        {player.name}
                      </Link>
                    </td>
                    <td className="p-4 text-center">{playerStats.appearances}</td>
                    <td className="p-4 text-center hidden sm:table-cell">{playerStats.minutes}</td>
                    <td className="p-4 text-center">{playerStats.goals}</td>
                    <td className="p-4 text-center">{playerStats.assists}</td>
                    <td className="p-4 text-center hidden sm:table-cell">{playerStats.yellowCards}</td>
                    <td className="p-4 text-center hidden sm:table-cell">{playerStats.redCards}</td>
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
