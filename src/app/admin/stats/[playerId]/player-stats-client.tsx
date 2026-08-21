"use client";

import { useState, useMemo } from 'react';
import { notFound } from 'next/navigation';
import { Player } from '@/types/match';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface PlayerStatsClientProps {
  initialData: {
    playerInfo: Player;
    stats: any[];
  };
}

export default function PlayerStatsClient({ initialData }: PlayerStatsClientProps) {
  const { playerInfo, stats } = initialData;
  const [selectedCompetition, setSelectedCompetition] = useState('all');

  const competitionNames = useMemo(() => {
    const names = new Set(stats.map(s => s.competitionName));
    return ['all', ...Array.from(names)];
  }, [stats]);

  const filteredStats = useMemo(() => {
    if (selectedCompetition === 'all') return stats;
    return stats.filter(s => s.competitionName === selectedCompetition);
  }, [stats, selectedCompetition]);

  const totalStats = useMemo(() => {
    return filteredStats.reduce((acc, stat) => {
        acc.appearances += 1;
        acc.goals += stat.goals;
        acc.assists += stat.assists;
        acc.yellowCards += stat.yellowCards;
        acc.redCards += stat.redCards;
        acc.minutesPlayed += stat.minutesPlayed;
        return acc;
    }, { appearances: 0, goals: 0, assists: 0, yellowCards: 0, redCards: 0, minutesPlayed: 0 });
  }, [filteredStats]);

  if (!playerInfo) {
    return notFound();
  }

  return (
    <div className="container mx-auto py-8">
        <div className="flex justify-between items-center mb-6">
            <h1 className="text-3xl font-bold">{playerInfo.name} - 試合別スタッツ</h1>
            <Select value={selectedCompetition} onValueChange={setSelectedCompetition}>
                <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="大会で絞り込み" />
                </SelectTrigger>
                <SelectContent>
                    {competitionNames.map(name => (
                        <SelectItem key={name} value={name}>{name === 'all' ? 'すべての大会' : name}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
        <div className="rounded-md border">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>大会</TableHead>
                        <TableHead>日付</TableHead>
                        <TableHead>会場</TableHead>
                        <TableHead>対戦相手</TableHead>
                        <TableHead>結果</TableHead>
                        <TableHead>ポジション</TableHead>
                        <TableHead className="text-center"><span className="rounded-full bg-amber-500 p-0.5">⚽</span></TableHead>
                        <TableHead className="text-center">🅰️</TableHead>
                        <TableHead className="text-center">🟨</TableHead>
                        <TableHead className="text-center">🟥</TableHead>
                        <TableHead className="text-right">出場時間</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {filteredStats.map((stat, index) => (
                        <TableRow key={index}>
                            <TableCell>{stat.competitionName}</TableCell>
                            <TableCell>{new Date(stat.date).toLocaleDateString('ja-JP')}</TableCell>
                            <TableCell>{stat.home ? 'H' : 'A'}</TableCell>
                            <TableCell>{stat.opponent}</TableCell>
                            <TableCell>{stat.result}</TableCell>
                            <TableCell>{stat.position}</TableCell>
                            <TableCell className="text-center">{stat.goals > 0 ? stat.goals : '-'}</TableCell>
                            <TableCell className="text-center">{stat.assists > 0 ? stat.assists : '-'}</TableCell>
                            <TableCell className="text-center">{stat.yellowCards > 0 ? stat.yellowCards : '-'}</TableCell>
                            <TableCell className="text-center">{stat.redCards > 0 ? stat.redCards : '-'}</TableCell>
                            <TableCell className="text-right">{stat.minutesPlayed > 0 ? `${stat.minutesPlayed}'` : '-'}</TableCell>
                        </TableRow>
                    ))}
                </TableBody>
                <TableFooter>
                    <TableRow>
                        <TableCell colSpan={6} className="font-bold">合計 ({totalStats.appearances}試合)</TableCell>
                        <TableCell className="text-center font-bold">{totalStats.goals}</TableCell>
                        <TableCell className="text-center font-bold">{totalStats.assists}</TableCell>
                        <TableCell className="text-center font-bold">{totalStats.yellowCards}</TableCell>
                        <TableCell className="text-center font-bold">{totalStats.redCards}</TableCell>
                        <TableCell className="text-right font-bold">{totalStats.minutesPlayed}'</TableCell>
                    </TableRow>
                </TableFooter>
            </Table>
        </div>
    </div>
  );
}
