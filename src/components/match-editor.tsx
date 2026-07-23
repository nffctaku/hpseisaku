"use client";

import { useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import { doc, deleteDoc, setDoc, increment } from "firebase/firestore";
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Trash2, CalendarIcon, Pencil } from 'lucide-react';
import { toast } from "sonner";
import { cn } from '@/lib/utils';
import { format, isValid, parseISO } from 'date-fns';
import { ja } from 'date-fns/locale';
import { Match, Team } from "@/types/match";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export function MatchEditor({ match, teams, allTeamsMap, excludedTeamIds, roundId, season, onUpdate, onDelete }: { match: Match, teams: Team[], allTeamsMap: Map<string, Team>, excludedTeamIds: Set<string>, roundId: string, season: string, onUpdate: Function, onDelete: Function }) {
  const selectedDate = useMemo(() => {
    const parsed = match.matchDate ? parseISO(match.matchDate) : new Date();
    return isValid(parsed) ? parsed : new Date();
  }, [match.matchDate]);

  const calendarDefaultMonth = useMemo(() => {
    if (match.matchDate) {
      const parsed = parseISO(match.matchDate);
      if (isValid(parsed)) return parsed;
    }
    const seasonMatch = season.match(/(\d{4})\/\d{2}/);
    if (seasonMatch) {
      const startYear = parseInt(seasonMatch[1], 10);
      return new Date(startYear, 7, 1);
    }
    return new Date();
  }, [match.matchDate, season]);

  const [open, setOpen] = useState(false);

  const { user, ownerUid } = useAuth();
  const params = useParams();
  const competitionId = params.competitionId as string;

  const clubUid = ownerUid || user?.uid;


  const handleDelete = async () => {
    if (!user || !clubUid) {
      toast.error("ログインしていません。");
      return;
    }
    try {
      await deleteDoc(doc(db, `clubs/${clubUid}/competitions/${competitionId}/rounds/${roundId}/matches`, match.id));

      const indexDocId = `${competitionId}__${roundId}__${match.id}`;

      try {
        await deleteDoc(doc(db, `clubs/${clubUid}/public_match_index`, indexDocId));
      } catch (e) {
        console.warn('Failed to delete public_match_index (continuing):', e);
      }

      try {
        await setDoc(doc(db, `clubs/${clubUid}`), { statsCacheVersion: increment(1) }, { merge: true });
      } catch (e) {
        console.warn('Failed to bump statsCacheVersion (continuing):', e);
      }

      onDelete(); // This triggers a refetch of all data
      toast.success('試合を削除しました。');
    } catch (error) {
      console.error("Error deleting match:", error);
      toast.error('試合の削除に失敗しました。');
    }
  }

  const selectedHomeName = match.homeTeam ? allTeamsMap.get(match.homeTeam)?.name : '';
  const selectedAwayName = match.awayTeam ? allTeamsMap.get(match.awayTeam)?.name : '';
  const deleteTitle = selectedHomeName && selectedAwayName ? `${selectedHomeName} vs ${selectedAwayName}` : 'この試合';

  const handleDateSelect = (date?: Date) => {
    if (!date) return;
    onUpdate(match.id, 'matchDate', format(date, 'yyyy-MM-dd'));
    setOpen(false);
  };

  const clampScore = (value: number) => (Number.isFinite(value) ? Math.max(0, value) : 0);

  const canInputPk = useMemo(() => {
    const fmt = (match as any)?.competitionFormat;
    return fmt === 'cup' || fmt === 'league_cup' || fmt === 'league-cup';
  }, [match]);

  const homeTeamOptions = useMemo(() => {
    const currentHome = typeof match.homeTeam === 'string' ? match.homeTeam : '';
    const currentAway = typeof match.awayTeam === 'string' ? match.awayTeam : '';
    return teams.filter((t) => {
      if (t.id === currentHome) return true;
      if (t.id === currentAway) return false;
      return !excludedTeamIds.has(t.id);
    });
  }, [teams, excludedTeamIds, match.homeTeam, match.awayTeam]);

  const awayTeamOptions = useMemo(() => {
    const currentHome = typeof match.homeTeam === 'string' ? match.homeTeam : '';
    const currentAway = typeof match.awayTeam === 'string' ? match.awayTeam : '';
    return teams.filter((t) => {
      if (t.id === currentAway) return true;
      if (t.id === currentHome) return false;
      return !excludedTeamIds.has(t.id);
    });
  }, [teams, excludedTeamIds, match.homeTeam, match.awayTeam]);

  return (
    <div className="rounded-xl border border-gray-100 bg-white p-3 text-gray-900 shadow-sm">
      <div className="mb-5 flex items-center justify-between gap-3">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              className={cn(
                "h-8 w-auto justify-center gap-1.5 rounded-md border-gray-300 bg-white px-3 text-xs font-semibold text-gray-900 hover:bg-gray-50",
                !match.matchDate && "text-muted-foreground"
              )}
            >
              <CalendarIcon className="h-3.5 w-3.5" />
              {match.matchDate ? format(selectedDate, 'yyyy年M月d日(E)', { locale: ja }) : '日付を選択'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto border border-gray-200 bg-white p-0 text-gray-900 shadow-lg" align="start">
            <Calendar className="bg-white text-gray-900"
              mode="single"
              selected={selectedDate}
              onSelect={handleDateSelect}
              defaultMonth={calendarDefaultMonth}
              locale={ja}
              initialFocus
              fromYear={2000}
              toYear={2030}
            />
          </PopoverContent>
        </Popover>

        <div className="flex items-center justify-end gap-2">
          <Link href={`/admin/competitions/${competitionId}/rounds/${roundId}/matches/${match.id}`}>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 bg-transparent text-gray-700 hover:bg-gray-100 hover:text-gray-900"
              aria-label="試合詳細を編集"
            >
              <Pencil className="h-4 w-4" />
            </Button>
          </Link>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 bg-transparent text-red-600 hover:bg-red-50 hover:text-red-700"
                aria-label="試合を削除"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>試合を削除しますか？</AlertDialogTitle>
                <AlertDialogDescription>
                  {deleteTitle}の試合を削除します。この操作は元に戻せません。
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>キャンセル</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} className="bg-red-600 text-white hover:bg-red-700">
                  削除する
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">

      {/* Home Team Selector */}
      <div className="flex min-w-0 items-center justify-start">
        <Select value={match.homeTeam} onValueChange={(value) => onUpdate(match.id, 'homeTeam', value)}>
          <SelectTrigger className="h-9 w-full border-0 bg-transparent px-0 text-left font-semibold text-gray-900 shadow-none hover:bg-transparent focus:ring-0">
            <SelectValue placeholder="ホーム">
              {match.homeTeam && allTeamsMap.get(match.homeTeam) ? (
                <span>{allTeamsMap.get(match.homeTeam)!.name}</span>
              ) : "ホーム"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {homeTeamOptions.map(t => (
              <SelectItem
                key={t.id}
                value={t.id}
                className="hover:bg-muted focus:bg-muted data-[state=checked]:bg-muted"
              >
                <span>{t.name}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Score Inputs */}
      <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={0}
            className="h-10 w-9 rounded-md border border-gray-200 bg-white text-center text-base font-semibold text-gray-900"
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
          <span className="text-sm text-gray-400">-</span>
          <Input
            type="number"
            min={0}
            className="h-10 w-9 rounded-md border border-gray-200 bg-white text-center text-base font-semibold text-gray-900"
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

        {canInputPk && (
          <div className="flex items-center gap-1 text-[10px] text-gray-500">
            <span>PK</span>
            <Input
              type="number"
              min={0}
              className="h-7 w-9 border border-gray-200 bg-white text-center text-xs font-semibold text-gray-900"
              value={(match as any).pkScoreHome ?? ''}
              onChange={(e) => {
                if (e.target.value === '') {
                  onUpdate(match.id, 'pkScoreHome', null);
                  return;
                }
                const n = parseInt(e.target.value, 10);
                onUpdate(match.id, 'pkScoreHome', clampScore(n));
              }}
              placeholder="-"
            />
            <span className="text-xs text-gray-400">-</span>
            <Input
              type="number"
              min={0}
              className="h-7 w-9 border border-gray-200 bg-white text-center text-xs font-semibold text-gray-900"
              value={(match as any).pkScoreAway ?? ''}
              onChange={(e) => {
                if (e.target.value === '') {
                  onUpdate(match.id, 'pkScoreAway', null);
                  return;
                }
                const n = parseInt(e.target.value, 10);
                onUpdate(match.id, 'pkScoreAway', clampScore(n));
              }}
              placeholder="-"
            />
          </div>
        )}
      </div>

      {/* Away Team Selector */}
      <div className="min-w-0">
        <Select value={match.awayTeam} onValueChange={(value) => onUpdate(match.id, 'awayTeam', value)}>
           <SelectTrigger className="h-9 w-full border-0 bg-transparent px-0 text-right font-semibold text-gray-900 shadow-none hover:bg-transparent focus:ring-0">
            <SelectValue placeholder="アウェイ">
              {match.awayTeam && allTeamsMap.get(match.awayTeam) ? (
                <span>{allTeamsMap.get(match.awayTeam)!.name}</span>
              ) : "アウェイ"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {awayTeamOptions.map(t => (
              <SelectItem
                key={t.id}
                value={t.id}
                className="hover:bg-muted focus:bg-muted data-[state=checked]:bg-muted"
              >
                <span>{t.name}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      </div>
    </div>
  );
}
