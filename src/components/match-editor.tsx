"use client";

import { useState, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import { doc, deleteDoc } from "firebase/firestore";
import Image from 'next/image';
import { useParams } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2 } from 'lucide-react';
import { toast } from "sonner";
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import { ja } from 'date-fns/locale';
import { Match, Team } from "@/types/match";

const getSeasonDateRange = (season: string): { fromDate: Date, toDate: Date } | undefined => {
  const match = season.match(/^(\d{4})\/(\d{2}|\d{4})$/);
  if (!match) return undefined;

  const startYear = parseInt(match[1], 10);
  const fromDate = new Date(startYear, 6, 1); // July 1st
  const toDate = new Date(startYear + 1, 5, 30); // June 30th
  return { fromDate, toDate };
};

export function MatchEditor({ match, teams, allTeamsMap, roundId, season, onUpdate, onDelete }: { match: Match, teams: Team[], allTeamsMap: Map<string, Team>, roundId: string, season: string, onUpdate: Function, onDelete: Function }) {
  const initialDate = match.matchDate ? parseISO(match.matchDate) : new Date();
  const [selectedYear, setSelectedYear] = useState<number>(initialDate.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(initialDate.getMonth() + 1); // 1-12
  const [selectedDay, setSelectedDay] = useState<number>(initialDate.getDate());

  const seasonRange = useMemo(() => {
    if (!season) return undefined;
    return getSeasonDateRange(season);
  }, [season]);
  const { user } = useAuth();
  const params = useParams();
  const competitionId = params.competitionId as string;


  const handleDelete = async () => {
    if (!user) {
      toast.error("ログインしていません。");
      return;
    }
    try {
      await deleteDoc(doc(db, `clubs/${user.uid}/competitions/${competitionId}/rounds/${roundId}/matches`, match.id));
      onDelete(); // This triggers a refetch of all data
      toast.success('試合を削除しました。');
    } catch (error) {
      console.error("Error deleting match:", error);
      toast.error('試合の削除に失敗しました。');
    }
  }

  const years = useMemo(() => {
    if (!seasonRange) return [selectedYear];
    const start = seasonRange.fromDate.getFullYear();
    const end = seasonRange.toDate.getFullYear();
    const list: number[] = [];
    for (let y = start; y <= end; y++) list.push(y);
    return list;
  }, [seasonRange, selectedYear]);

  const daysInMonth = useMemo(() => {
    const year = selectedYear;
    const month = selectedMonth;
    return new Date(year, month, 0).getDate();
  }, [selectedYear, selectedMonth]);

  const clampDay = (day: number) => Math.min(day, daysInMonth);

  const clampScore = (value: number) => (Number.isFinite(value) ? Math.max(0, value) : 0);

  const updateMatchDate = (y: number, m: number, d: number) => {
    const yearStr = y.toString();
    const monthStr = m.toString().padStart(2, '0');
    const dayStr = d.toString().padStart(2, '0');
    onUpdate(match.id, 'matchDate', `${yearStr}-${monthStr}-${dayStr}`);
  };

  return (
    <div className="grid grid-cols-6 lg:grid-cols-12 items-center gap-2 p-3 bg-card text-gray-900 rounded-md border">
      {/* Date Picker (Year / Month / Day Selects) */}
      <div className="col-span-6 lg:col-span-3 flex gap-2">
        {/* Year */}
        <Select
          value={selectedYear.toString()}
          onValueChange={(val) => {
            const y = parseInt(val, 10);
            setSelectedYear(y);
            const newDay = clampDay(selectedDay);
            setSelectedDay(newDay);
            updateMatchDate(y, selectedMonth, newDay);
          }}
        >
          <SelectTrigger className="w-1/3 bg-white text-gray-900">
            <SelectValue placeholder="年" />
          </SelectTrigger>
          <SelectContent>
            {years.map((y) => (
              <SelectItem key={y} value={y.toString()}>
                {y}年
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Month */}
        <Select
          value={selectedMonth.toString()}
          onValueChange={(val) => {
            const m = parseInt(val, 10);
            setSelectedMonth(m);
            const newDay = clampDay(selectedDay);
            setSelectedDay(newDay);
            updateMatchDate(selectedYear, m, newDay);
          }}
        >
          <SelectTrigger className="w-1/4 bg-white text-gray-900">
            <SelectValue placeholder="月" />
          </SelectTrigger>
          <SelectContent>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <SelectItem key={m} value={m.toString()}>
                {m}月
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Day */}
        <Select
          value={selectedDay.toString()}
          onValueChange={(val) => {
            const d = parseInt(val, 10);
            const clamped = clampDay(d);
            setSelectedDay(clamped);
            updateMatchDate(selectedYear, selectedMonth, clamped);
          }}
        >
          <SelectTrigger className="flex-1 bg-white text-gray-900">
            <SelectValue placeholder="日" />
          </SelectTrigger>
          <SelectContent>
            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => (
              <SelectItem key={d} value={d.toString()}>
                {d}日
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Home Team Selector */}
      <div className="col-span-2 lg:col-span-3 flex items-center justify-end gap-2">
        <Select value={match.homeTeam} onValueChange={(value) => onUpdate(match.id, 'homeTeam', value)}>
          <SelectTrigger className="w-full bg-white text-gray-900">
            <SelectValue placeholder="ホーム">
              {match.homeTeam && allTeamsMap.get(match.homeTeam) ? (
                <div className="flex items-center gap-2">
                  <Image src={allTeamsMap.get(match.homeTeam)!.logoUrl!} alt={allTeamsMap.get(match.homeTeam)!.name} width={20} height={20} className="rounded-full object-contain" />
                  <span>{allTeamsMap.get(match.homeTeam)!.name}</span>
                </div>
              ) : "ホーム"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="bg-white text-gray-900">
            {teams.map(t => (
              <SelectItem
                key={t.id}
                value={t.id}
                className="bg-white text-gray-900 hover:bg-gray-100 focus:bg-gray-100 data-[state=checked]:bg-gray-100"
              >
                <div className="flex items-center gap-2">
                  {t.logoUrl && (
                    <Image
                      src={t.logoUrl}
                      alt={t.name}
                      width={20}
                      height={20}
                      className="rounded-full object-contain"
                    />
                  )}
                  <span>{t.name}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Score Inputs */}
      <div className="col-span-2 lg:col-span-2 flex justify-center items-center gap-2">
        <Input 
          type="number" 
          min={0}
          className="w-14 text-center font-bold text-lg bg-white text-gray-900" 
          value={match.scoreHome ?? ''}
          onChange={(e) => {
            if (e.target.value === '') {
              onUpdate(match.id, 'scoreHome', null);
              return;
            }
            const n = parseInt(e.target.value, 10);
            onUpdate(match.id, 'scoreHome', clampScore(n));
          }}
          placeholder="-"
        />
        <span className="text-lg">-</span>
        <Input 
          type="number" 
          min={0}
          className="w-14 text-center font-bold text-lg bg-white text-gray-900" 
          value={match.scoreAway ?? ''}
          onChange={(e) => {
            if (e.target.value === '') {
              onUpdate(match.id, 'scoreAway', null);
              return;
            }
            const n = parseInt(e.target.value, 10);
            onUpdate(match.id, 'scoreAway', clampScore(n));
          }}
          placeholder="-"
        />
      </div>

      {/* Away Team Selector */}
      <div className="col-span-2 lg:col-span-3">
        <Select value={match.awayTeam} onValueChange={(value) => onUpdate(match.id, 'awayTeam', value)}>
           <SelectTrigger className="w-full bg-white text-gray-900">
            <SelectValue placeholder="アウェイ">
              {match.awayTeam && allTeamsMap.get(match.awayTeam) ? (
                <div className="flex items-center gap-2">
                  <Image src={allTeamsMap.get(match.awayTeam)!.logoUrl!} alt={allTeamsMap.get(match.awayTeam)!.name} width={20} height={20} className="rounded-full object-contain" />
                  <span>{allTeamsMap.get(match.awayTeam)!.name}</span>
                </div>
              ) : "アウェイ"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="bg-white text-gray-900">
            {teams.map(t => (
              <SelectItem
                key={t.id}
                value={t.id}
                className="bg-white text-gray-900 hover:bg-gray-100 focus:bg-gray-100 data-[state=checked]:bg-gray-100"
              >
                <div className="flex items-center gap-2">
                  {t.logoUrl && (
                    <Image
                      src={t.logoUrl}
                      alt={t.name}
                      width={20}
                      height={20}
                      className="rounded-full object-contain"
                    />
                  )}
                  <span>{t.name}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Delete Button */}
      <div className="col-span-6 lg:col-span-1 flex justify-end">
        <Button
          variant="outline"
          size="icon"
          className="border-destructive text-destructive hover:bg-destructive/10 bg-background"
          onClick={handleDelete}
          aria-label="試合を削除"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
