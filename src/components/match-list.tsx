"use client";

import { useState } from 'react';
import { format, isToday, isYesterday, isTomorrow, parseISO } from 'date-fns';
import { ja } from 'date-fns/locale';
import Image from 'next/image';
import Link from 'next/link';
import { MapPin } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// This interface needs to be consistent with the one in the page.tsx
interface EnrichedMatch {
  id: string;
  competitionId: string;
  competitionName: string;
  competitionLogoUrl?: string;
  season?: string;
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
  initialSelectedSeason?: string;
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

export function MatchList({ allMatches, clubId, clubSlug, clubName, initialSelectedSeason }: MatchListProps) {
  const [showAll, setShowAll] = useState(false);
  const [selectedCompetition, setSelectedCompetition] = useState<string>('all');
  const [selectedSeason, setSelectedSeason] = useState<string>(initialSelectedSeason || 'all');

  const seasons = [
    'all',
    ...Array.from(
      new Set(
        allMatches.map((m) => (typeof (m as any).season === 'string' && (m as any).season.trim().length > 0
          ? String((m as any).season)
          : getSeason(parseISO(m.matchDate))))
      )
    ),
  ]
    .sort()
    .reverse();

  const filteredBySeason = selectedSeason === 'all'
    ? allMatches
    : allMatches.filter(m => {
        const season =
          typeof (m as any).season === 'string' && (m as any).season.trim().length > 0
            ? String((m as any).season)
            : getSeason(parseISO(m.matchDate));
        return season === selectedSeason;
      });

  const competitions = ['all', ...Array.from(new Set(filteredBySeason.map(m => m.competitionName)))];

  const competitionLogoByName = new Map<string, string>();
  for (const m of filteredBySeason) {
    const name = m.competitionName;
    const logo = (m as any).competitionLogoUrl;
    if (!name || typeof name !== 'string') continue;
    if (typeof logo !== 'string' || !logo) continue;
    if (!competitionLogoByName.has(name)) competitionLogoByName.set(name, logo);
  }

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
            <h1 className="text-lg sm:text-xl font-bold leading-tight">
              <span className="block">試合日程・結果</span>
            </h1>
        </div>
        <div className="mb-8 flex flex-col items-center gap-4">
          <div className="flex flex-wrap items-center justify-center gap-4">
            <Select value={selectedSeason} onValueChange={setSelectedSeason}>
              <SelectTrigger className="w-[180px] bg-white text-gray-900 border shadow-sm">
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
                  className={`px-3 py-1.5 text-xs font-semibold rounded-full border transition-colors ${
                    selectedCompetition === comp
                      ? 'bg-emerald-500 text-white border-emerald-600'
                      : 'bg-white text-gray-900 border-gray-300 hover:border-gray-500'
                  }`}
                >
                  <span className="inline-flex items-center gap-1">
                    {comp !== 'all' && competitionLogoByName.get(comp) ? (
                      <Image
                        src={competitionLogoByName.get(comp)!}
                        alt=""
                        width={14}
                        height={14}
                        className="h-3.5 w-3.5 object-contain"
                      />
                    ) : null}
                    <span>{comp === 'all' ? '全大会' : comp}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-center space-x-2 text-xs">
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
            <div className="space-y-2">
                {Object.entries(groupedMatches).map(([dateGroup, matchesInGroup]) => (
                    <div key={dateGroup}>
                        <div className="space-y-2">
                            {matchesInGroup.map(match => {
                                const isFinished =
                                  typeof match.scoreHome === "number" &&
                                  typeof match.scoreAway === "number";

                                const selfSide =
                                  match.homeTeamId === clubId
                                    ? 'HOME'
                                    : match.awayTeamId === clubId
                                      ? 'AWAY'
                                      : null;

                                const venue =
                                  typeof (match as any).venue === 'string'
                                    ? String((match as any).venue)
                                    : typeof (match as any).stadium === 'string'
                                      ? String((match as any).stadium)
                                      : '';
                                const broadcast =
                                  typeof (match as any).broadcast === 'string'
                                    ? String((match as any).broadcast)
                                    : typeof (match as any).streaming === 'string'
                                      ? String((match as any).streaming)
                                      : '';

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
                                      "bg-emerald-500 text-white rounded-md px-2 py-0.5 text-xs";
                                  } else if (selfScore < oppScore) {
                                    scoreBgClass =
                                      "bg-red-500 text-white rounded-md px-2 py-0.5 text-xs";
                                  } else {
                                    scoreBgClass =
                                      "bg-gray-500 text-white rounded-md px-2 py-0.5 text-xs";
                                  }
                                }

                                let desktopScoreTextClass = "text-gray-900";
                                if (isFinished && selfSide) {
                                  const isHome = match.homeTeamId === clubId;
                                  const selfScore = isHome
                                    ? (match.scoreHome as number)
                                    : (match.scoreAway as number);
                                  const oppScore = isHome
                                    ? (match.scoreAway as number)
                                    : (match.scoreHome as number);

                                  if (selfScore > oppScore) desktopScoreTextClass = "text-emerald-600";
                                  else if (selfScore < oppScore) desktopScoreTextClass = "text-red-600";
                                  else desktopScoreTextClass = "text-gray-500";
                                }

                                let desktopScorePillClass = "";
                                if (!showAll && isFinished && selfSide) {
                                  const isHome = match.homeTeamId === clubId;
                                  const selfScore = isHome
                                    ? (match.scoreHome as number)
                                    : (match.scoreAway as number);
                                  const oppScore = isHome
                                    ? (match.scoreAway as number)
                                    : (match.scoreHome as number);

                                  if (selfScore > oppScore) desktopScorePillClass = "bg-emerald-500 text-white";
                                  else if (selfScore < oppScore) desktopScorePillClass = "bg-red-500 text-white";
                                  else desktopScorePillClass = "bg-gray-500 text-white";
                                }

                                return (
                                    <div key={match.id} className="block bg-white text-gray-900 rounded-md border">
                                      {/* Mobile */}
                                      <div className="p-2 lg:hidden">
                                          <div className="text-[10px] text-muted-foreground text-center">
                                            <span className="inline-flex max-w-full items-center justify-center gap-2 min-w-0">
                                              <span className="shrink-0">
                                                {(() => {
                                                  const d = parseISO(match.matchDate);
                                                  const dateLabel = Number.isNaN(d.getTime())
                                                    ? match.matchDate
                                                    : format(d, 'yyyy.M.d(EEE)', { locale: ja });
                                                  return `${dateLabel}${match.matchTime ? ` ${match.matchTime}` : ''}`;
                                                })()}
                                              </span>
                                              <span className="inline-flex min-w-0 items-center gap-1">
                                                {match.competitionLogoUrl ? (
                                                  <Image
                                                    src={match.competitionLogoUrl}
                                                    alt=""
                                                    width={12}
                                                    height={12}
                                                    className="h-3 w-3 shrink-0 object-contain"
                                                  />
                                                ) : null}
                                                <span className="truncate">
                                                  {match.roundId === 'single' || !match.roundName
                                                    ? match.competitionName
                                                    : `${match.competitionName} / ${match.roundName}`}
                                                </span>
                                              </span>
                                            </span>
                                          </div>
                                          <div className="grid grid-cols-12 items-center gap-1">
                                              <div className="col-span-5 flex items-center justify-end gap-1 min-w-0">
                                                  <span className="font-semibold text-[11px] text-right truncate">{match.homeTeamName}</span>
                                                  {match.homeTeamLogo ? (
                                                      <Image src={match.homeTeamLogo} alt={match.homeTeamName} width={18} height={18} className="rounded-full object-contain" />
                                                  ) : (
                                                      <div className="w-[18px] h-[18px] bg-muted rounded-full" />
                                                  )}
                                              </div>

                                              <div className="col-span-2 text-center">
                                                  <Link
                                                      href={`/${clubSlug}/matches/${match.competitionId}/${match.roundId}/${match.id}`}
                                                      className="inline-block"
                                                  >
                                                      {isFinished ? (
                                                          <div
                                                            className={`inline-flex items-center justify-center whitespace-nowrap font-bold text-[11px] min-w-[44px] px-2 py-0.5 rounded-md transition-colors ${
                                                              scoreBgClass ||
                                                              "bg-gray-500 text-white hover:bg-primary"
                                                            }`}
                                                          >
                                                              {match.scoreHome} - {match.scoreAway}
                                                          </div>
                                                      ) : (
                                                          <div className="text-[11px] text-muted-foreground hover:text-primary transition-colors">
                                                              {match.matchTime || 'VS'}
                                                          </div>
                                                      )}
                                                  </Link>
                                              </div>

                                              <div className="col-span-5 flex items-center gap-1 min-w-0">
                                                  {match.awayTeamLogo ? (
                                                      <Image src={match.awayTeamLogo} alt={match.awayTeamName} width={18} height={18} className="rounded-full object-contain" />
                                                  ) : (
                                                      <div className="w-[18px] h-[18px] bg-muted rounded-full" />
                                                  )}
                                                  <span className="font-semibold text-[11px] truncate">{match.awayTeamName}</span>
                                              </div>
                                          </div>
                                      </div>

                                      {/* Desktop */}
                                      <div className="hidden lg:grid min-h-[128px] grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] gap-6 items-center px-6 py-4">
                                        <div className="min-w-0">
                                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                            {selfSide ? (
                                              <span className="inline-flex items-center rounded-full bg-gray-900 text-white px-3 py-0.5 text-[11px] font-bold tracking-wide">
                                                {selfSide}
                                              </span>
                                            ) : null}
                                            {venue ? (
                                              <span className="inline-flex items-center gap-1 min-w-0">
                                                <MapPin className="h-3.5 w-3.5 shrink-0" />
                                                <span className="truncate">{venue}</span>
                                              </span>
                                            ) : null}
                                          </div>

                                          <div className="mt-2 font-semibold leading-snug">
                                            <div className="text-sm truncate">
                                              <span className="inline-flex items-center gap-2 min-w-0">
                                                {match.competitionLogoUrl ? (
                                                  <Image
                                                    src={match.competitionLogoUrl}
                                                    alt=""
                                                    width={16}
                                                    height={16}
                                                    className="h-4 w-4 shrink-0 object-contain"
                                                  />
                                                ) : null}
                                                <span className="truncate">
                                                  {match.roundId === 'single' ? match.competitionName : match.competitionName}
                                                </span>
                                              </span>
                                            </div>
                                            {match.roundId !== 'single' && match.roundName ? (
                                              <div className="text-sm truncate">{match.roundName}</div>
                                            ) : null}
                                          </div>

                                          <div className="mt-2 text-2xl font-black tracking-tight">
                                            {(() => {
                                              const d = parseISO(match.matchDate);
                                              const dateLabel = Number.isNaN(d.getTime())
                                                ? match.matchDate
                                                : format(d, 'yyyy.M.d(EEE)', { locale: ja });
                                              return `${dateLabel}${match.matchTime ? ` ${match.matchTime}` : ''}`;
                                            })()}
                                          </div>

                                          {broadcast ? (
                                            <div className="mt-1 text-sm text-muted-foreground truncate">中継: {broadcast}</div>
                                          ) : null}
                                        </div>

                                        <div className="grid w-[560px] max-w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-4 min-w-0 justify-self-center">
                                          <div className="flex items-center justify-end gap-3 min-w-0">
                                            <span
                                              className="text-lg font-semibold text-gray-900 truncate whitespace-nowrap"
                                              title={match.homeTeamName}
                                            >
                                              {match.homeTeamName}
                                            </span>
                                            {match.homeTeamLogo ? (
                                              <Image
                                                src={match.homeTeamLogo}
                                                alt={match.homeTeamName}
                                                width={44}
                                                height={44}
                                                className="h-11 w-11 rounded-full object-contain"
                                              />
                                            ) : (
                                              <div className="h-11 w-11 bg-muted rounded-full" />
                                            )}
                                          </div>

                                          <div className="shrink-0 self-center text-center min-w-[96px]">
                                            <div className="grid h-[56px] grid-rows-[1fr_16px] items-center justify-items-center">
                                              {isFinished ? (
                                                <div className={`flex items-center justify-center gap-2 rounded-md px-2.5 py-1 ${desktopScorePillClass || ''}`}>
                                                  <span
                                                    className={`text-2xl font-black leading-none tabular-nums ${desktopScorePillClass ? 'text-white' : desktopScoreTextClass}`}
                                                  >
                                                    {match.scoreHome}
                                                  </span>
                                                  <span
                                                    className={`text-2xl font-black leading-none tabular-nums ${desktopScorePillClass ? 'text-white' : desktopScoreTextClass}`}
                                                  >
                                                    −
                                                  </span>
                                                  <span
                                                    className={`text-2xl font-black leading-none tabular-nums ${desktopScorePillClass ? 'text-white' : desktopScoreTextClass}`}
                                                  >
                                                    {match.scoreAway}
                                                  </span>
                                                </div>
                                              ) : (
                                                <div className="text-lg font-semibold text-muted-foreground leading-none">
                                                  {match.matchTime || 'VS'}
                                                </div>
                                              )}

                                              <div className="h-4 text-xs text-muted-foreground leading-none">
                                                {(() => {
                                                  const pkHome = (match as any).scoreHomePK;
                                                  const pkAway = (match as any).scoreAwayPK;
                                                  if (typeof pkHome === 'number' && typeof pkAway === 'number') {
                                                    return `${pkHome}PK${pkAway}`;
                                                  }
                                                  return <span className="opacity-0">0PK0</span>;
                                                })()}
                                              </div>
                                            </div>
                                          </div>

                                          <div className="flex items-center justify-start gap-3 min-w-0">
                                            {match.awayTeamLogo ? (
                                              <Image
                                                src={match.awayTeamLogo}
                                                alt={match.awayTeamName}
                                                width={44}
                                                height={44}
                                                className="h-11 w-11 rounded-full object-contain"
                                              />
                                            ) : (
                                              <div className="h-11 w-11 bg-muted rounded-full" />
                                            )}
                                            <span
                                              className="text-lg font-semibold text-gray-900 truncate whitespace-nowrap"
                                              title={match.awayTeamName}
                                            >
                                              {match.awayTeamName}
                                            </span>
                                          </div>
                                        </div>

                                        <div className="flex items-center justify-end gap-6 justify-self-end">
                                          <Link
                                            href={`/${clubSlug}/matches/${match.competitionId}/${match.roundId}/${match.id}`}
                                            className="inline-flex items-center justify-center rounded-md border border-red-400 px-6 py-2 text-sm font-semibold text-red-500 hover:bg-red-50 transition-colors"
                                          >
                                            試合詳細
                                          </Link>
                                        </div>
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