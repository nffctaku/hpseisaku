"use client";

import { useState } from 'react';
import { format, isToday, isYesterday, isTomorrow, parseISO } from 'date-fns';
import { ja } from 'date-fns/locale';
import Image from 'next/image';
import Link from 'next/link';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// This interface needs to be consistent with the one in the page.tsx
interface EnrichedMatch {
  id: string;
  competitionId: string;
  competitionName: string;
  roundId: string;
  roundName: string;
  matchDate: string;
  matchTime?: string;
  homeTeamId: string;
  awayTeamId: string;
  homeTeamName: string;
  awayTeamName: string;
  homeTeamLogo?: string;
  awayTeamLogo?: string;
  scoreHome?: number | null;
  scoreAway?: number | null;
}

interface MatchListProps {
  allMatches: EnrichedMatch[];
  clubId: string; // internal ID used for filtering
  clubSlug: string; // public clubId used in URLs
  clubName: string;
}

const getFormattedDateGroup = (dateString: string) => {
    const date = parseISO(dateString);
    if (isToday(date)) return '今日';
    if (isYesterday(date)) return '昨日';
    if (isTomorrow(date)) return '明日';
    return format(date, 'M月d日(E)', { locale: ja });
};

const getSeason = (date: Date): string => {
  const year = date.getFullYear();
  const month = date.getMonth(); // 0-11
  // Season runs from August to July of next year
  return month >= 7 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
};

export function MatchList({ allMatches, clubId, clubSlug, clubName }: MatchListProps) {
  const [showAll, setShowAll] = useState(false);
  const [selectedCompetition, setSelectedCompetition] = useState<string>('all');
  const [selectedSeason, setSelectedSeason] = useState<string>('all');

  const seasons = ['all', ...Array.from(new Set(allMatches.map(m => getSeason(parseISO(m.matchDate)))))].sort().reverse();

  const filteredBySeason = selectedSeason === 'all'
    ? allMatches
    : allMatches.filter(m => getSeason(parseISO(m.matchDate)) === selectedSeason);

  const competitions = ['all', ...Array.from(new Set(filteredBySeason.map(m => m.competitionName)))];

  const filteredByCompetition = selectedCompetition === 'all'
    ? filteredBySeason
    : filteredBySeason.filter(match => match.competitionName === selectedCompetition);

  const filteredByTeam = showAll
    ? filteredByCompetition
    : filteredByCompetition.filter(
        (match) => match.homeTeamId === clubId || match.awayTeamId === clubId
      );

  const filteredMatches = filteredByTeam;

  const groupedMatches = filteredMatches.reduce((acc, match) => {
    const dateGroup = getFormattedDateGroup(match.matchDate);
    if (!acc[dateGroup]) {
      acc[dateGroup] = [];
    }
    acc[dateGroup].push(match);
    return acc;
  }, {} as Record<string, EnrichedMatch[]>);

  return (
    <div className="container mx-auto py-8 px-4 md:px-0">
        <div className="text-center mb-4">
            <h1 className="text-2xl sm:text-3xl font-bold leading-tight">
              <span className="block">{clubName}</span>
              <span className="block">試合日程・結果</span>
            </h1>
        </div>
        <div className="mb-8 flex flex-col items-center gap-4">
          <div className="flex flex-wrap items-center justify-center gap-4">
            <Select value={selectedSeason} onValueChange={setSelectedSeason}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="シーズンを選択" />
              </SelectTrigger>
              <SelectContent>
                {seasons.map(season => (
                  <SelectItem key={season} value={season}>
                    {season === 'all' ? '全シーズン' : season}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {competitions.map(comp => (
                <button
                  key={comp}
                  onClick={() => setSelectedCompetition(comp)}
                  className={`px-4 py-2 text-sm font-medium rounded-full transition-colors ${
                    selectedCompetition === comp
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-muted-foreground/20'
                  }`}>
                  {comp === 'all' ? '全大会' : comp}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-center space-x-2 text-sm">
              <Label htmlFor="filter-switch">自チームのみ</Label>
              <Switch 
                  id="filter-switch" 
                  checked={!showAll}
                  onCheckedChange={(checked) => setShowAll(!checked)}
                  className="border border-gray-300 data-[state=unchecked]:bg-gray-200 data-[state=checked]:bg-emerald-500"
              />
              <Label htmlFor="filter-switch">すべて表示</Label>
          </div>
        </div>
        
        {Object.keys(groupedMatches).length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">表示する試合がありません。</div>
        ) : (
            <div className="space-y-4">
                {Object.entries(groupedMatches).map(([dateGroup, matchesInGroup]) => (
                    <div key={dateGroup}>
                        <h2 className="font-semibold text-xs sm:text-sm mb-1 text-muted-foreground">{dateGroup}</h2>
                        <div className="space-y-2">
                            {matchesInGroup.map(match => {
                                const isFinished =
                                  typeof match.scoreHome === "number" &&
                                  typeof match.scoreAway === "number";

                                // 自チーム視点での勝敗判定（自チームのみ表示のときだけ色付け）
                                let scoreBgClass = "";
                                if (!showAll && isFinished) {
                                  const isHome = match.homeTeamId === clubId;
                                  const selfScore = isHome
                                    ? (match.scoreHome as number)
                                    : (match.scoreAway as number);
                                  const oppScore = isHome
                                    ? (match.scoreAway as number)
                                    : (match.scoreHome as number);

                                  if (selfScore > oppScore) {
                                    scoreBgClass =
                                      "bg-emerald-500 text-white rounded-md px-2 py-0.5 text-base";
                                  } else if (selfScore < oppScore) {
                                    scoreBgClass =
                                      "bg-red-500 text-white rounded-md px-2 py-0.5 text-base";
                                  } else {
                                    scoreBgClass =
                                      "bg-gray-500 text-white rounded-md px-2 py-0.5 text-base";
                                  }
                                }

                                return (
                                    <div key={match.id} className="block p-4 bg-white text-gray-900 rounded-lg border">
                                        <div className="grid grid-cols-12 items-center gap-2">
                                            <div className="col-span-5 flex items-center justify-end gap-2">
                                                <span className="font-medium text-right flex-1 truncate">{match.homeTeamName}</span>
                                                {match.homeTeamLogo ? (
                                                    <Image src={match.homeTeamLogo} alt={match.homeTeamName} width={28} height={28} className="rounded-full object-contain" />
                                                ) : (
                                                    <div className="w-7 h-7 bg-muted rounded-full" />
                                                )}
                                            </div>

                                            <div className="col-span-2 text-center">
                                                <Link
                                                    href={`/${clubSlug}/matches/${match.competitionId}/${match.roundId}/${match.id}`}
                                                    className="inline-block"
                                                >
                                                    {isFinished ? (
                                                        <div
                                                          className={`inline-flex items-center justify-center whitespace-nowrap font-bold text-sm min-w-[52px] px-2 py-0.5 rounded-md transition-colors ${
                                                            scoreBgClass ||
                                                            "bg-gray-500 text-white hover:bg-primary"
                                                          }`}
                                                        >
                                                            {match.scoreHome} - {match.scoreAway}
                                                        </div>
                                                    ) : (
                                                        <div className="text-sm text-muted-foreground hover:text-primary transition-colors">
                                                            {match.matchTime || 'VS'}
                                                        </div>
                                                    )}
                                                </Link>
                                            </div>

                                            <div className="col-span-5 flex items-center gap-2">
                                                {match.awayTeamLogo ? (
                                                    <Image src={match.awayTeamLogo} alt={match.awayTeamName} width={28} height={28} className="rounded-full object-contain" />
                                                ) : (
                                                    <div className="w-7 h-7 bg-muted rounded-full" />
                                                )}
                                                <span className="font-medium flex-1 truncate">{match.awayTeamName}</span>
                                            </div>
                                        </div>
                                        <div className="text-xs text-muted-foreground text-center mt-2">
                                            {match.roundId === 'single' ? match.competitionName : `${match.competitionName} / ${match.roundName}`}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>
        )}
    </div>
  );
}