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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Trash2, CalendarIcon } from 'lucide-react';
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
  const [isPopoverOpen, setPopoverOpen] = useState(false);
  const [pendingDate, setPendingDate] = useState<Date | undefined>(match.matchDate ? parseISO(match.matchDate) : undefined);
  const [month, setMonth] = useState<Date>(match.matchDate ? parseISO(match.matchDate) : new Date());

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

  return (
    <div className="grid grid-cols-6 lg:grid-cols-12 items-center gap-2 p-3 bg-card rounded-md border">
      {/* Date Picker */}
      <div className="col-span-6 lg:col-span-3">
        <Popover open={isPopoverOpen} onOpenChange={(open) => {
            if (open && pendingDate) {
              setMonth(pendingDate);
            }
            setPopoverOpen(open);
          }}>
          <PopoverTrigger asChild>
            <Button
              variant={"outline"}
              className={cn(
                "w-full justify-start text-left font-normal",
                !match.matchDate && "text-muted-foreground"
              )}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {match.matchDate ? format(parseISO(match.matchDate), 'PPP', { locale: ja }) : <span>日付を選択</span>}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0">
            <Calendar
              mode="single"
              selected={pendingDate}
              onSelect={setPendingDate}
              initialFocus
              month={month}
              onMonthChange={setMonth}
              fromDate={seasonRange?.fromDate}
              toDate={seasonRange?.toDate}
            />
            <div className="p-2 border-t flex justify-end space-x-2">
              <Button variant="ghost" size="sm" onClick={() => {
                setPendingDate(match.matchDate ? parseISO(match.matchDate) : undefined);
                setPopoverOpen(false);
              }}>キャンセル</Button>
              <Button size="sm" onClick={() => {
                if (pendingDate) {
                  const year = pendingDate.getFullYear();
                  const month = (pendingDate.getMonth() + 1).toString().padStart(2, '0');
                  const day = pendingDate.getDate().toString().padStart(2, '0');
                  onUpdate(match.id, 'matchDate', `${year}-${month}-${day}`);
                }
                setPopoverOpen(false);
              }}>適用</Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Home Team Selector */}
      <div className="col-span-2 lg:col-span-3 flex items-center justify-end gap-2">
        <Select value={match.homeTeam} onValueChange={(value) => onUpdate(match.id, 'homeTeam', value)}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="ホーム">
              {match.homeTeam && allTeamsMap.get(match.homeTeam) ? (
                <div className="flex items-center gap-2">
                  <Image src={allTeamsMap.get(match.homeTeam)!.logoUrl!} alt={allTeamsMap.get(match.homeTeam)!.name} width={20} height={20} className="rounded-full object-contain" />
                  <span>{allTeamsMap.get(match.homeTeam)!.name}</span>
                </div>
              ) : "ホーム"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {teams.map(t => (
              <SelectItem key={t.id} value={t.id}>
                <div className="flex items-center gap-2">
                  {t.logoUrl && <Image src={t.logoUrl} alt={t.name} width={20} height={20} className="rounded-full object-contain" />}
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
          className="w-14 text-center font-bold text-lg" 
          value={match.scoreHome ?? ''}
          onChange={(e) => onUpdate(match.id, 'scoreHome', e.target.value === '' ? null : parseInt(e.target.value))}
          placeholder="-"
        />
        <span className="text-lg">-</span>
        <Input 
          type="number" 
          className="w-14 text-center font-bold text-lg" 
          value={match.scoreAway ?? ''}
          onChange={(e) => onUpdate(match.id, 'scoreAway', e.target.value === '' ? null : parseInt(e.target.value))}
          placeholder="-"
        />
      </div>

      {/* Away Team Selector */}
      <div className="col-span-2 lg:col-span-3">
        <Select value={match.awayTeam} onValueChange={(value) => onUpdate(match.id, 'awayTeam', value)}>
           <SelectTrigger className="w-full">
            <SelectValue placeholder="アウェイ">
              {match.awayTeam && allTeamsMap.get(match.awayTeam) ? (
                <div className="flex items-center gap-2">
                  <Image src={allTeamsMap.get(match.awayTeam)!.logoUrl!} alt={allTeamsMap.get(match.awayTeam)!.name} width={20} height={20} className="rounded-full object-contain" />
                  <span>{allTeamsMap.get(match.awayTeam)!.name}</span>
                </div>
              ) : "アウェイ"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {teams.map(t => (
              <SelectItem key={t.id} value={t.id}>
                <div className="flex items-center gap-2">
                  {t.logoUrl && <Image src={t.logoUrl} alt={t.name} width={20} height={20} className="rounded-full object-contain" />}
                  <span>{t.name}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Delete Button */}
      <div className="col-span-6 lg:col-span-1 flex justify-end">
          <Button variant="ghost" size="icon" onClick={handleDelete}><Trash2 className="h-4 w-4 text-destructive" /></Button>
      </div>
    </div>
  );
}
