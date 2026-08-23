"use client";

import { useState } from 'react';
import { format, isToday, isYesterday, isTomorrow, parseISO } from 'date-fns';
import { ja } from 'date-fns/locale';
import Image from 'next/image';
import Link from 'next/link';
import { MapPin, SlidersHorizontal } from 'lucide-react';
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
  pageForegroundClass?: string;
  accentColor?: string;
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

export function MatchList({ allMatches, clubId, clubSlug, clubName, initialSelectedSeason, pageForegroundClass, accentColor }: MatchListProps) {
  const [showAll, setShowAll] = useState(false);
  const [selectedCompetition, setSelectedCompetition] = useState<string>('all');
  const [selectedSeason, setSelectedSeason] = useState<string>(initialSelectedSeason || 'all');
  const [selectedRoundIndex, setSelectedRoundIndex] = useState(0);
  const themeColor = accentColor || '#9f1239';

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

  // 節の一覧を取得（重複なし、表示順序を維持）
  const rounds = Array.from(
    new Map(
      filteredMatches
        .map(m => ({ id: m.roundId, name: m.roundName || m.roundId }))
        .map(r => [r.id, r])
    ).values()
  );

  // showAllがtrueの場合は節でグルーピング、そうでなければ日付でグルーピング
  const groupedMatches = showAll
    ? filteredMatches.reduce((acc, match) => {
        const roundKey = match.roundId;
        if (!acc[roundKey]) {
          acc[roundKey] = [];
        }
        acc[roundKey].push(match);
        return acc;
      }, {} as Record<string, EnrichedMatch[]>)
    : filteredMatches.reduce((acc, match) => {
        const dateGroup = getFormattedDateGroup(match.matchDate);
        if (!acc[dateGroup]) {
          acc[dateGroup] = [];
        }
        acc[dateGroup].push(match);
        return acc;
      }, {} as Record<string, EnrichedMatch[]>);

  // 節ナビゲーション用
  const currentRound = rounds[selectedRoundIndex];
  const handlePrevRound = () => {
    setSelectedRoundIndex(prev => Math.max(0, prev - 1));
  };
  const handleNextRound = () => {
    setSelectedRoundIndex(prev => Math.min(rounds.length - 1, prev + 1));
  };

  // showAllがtrueの場合は選択された節の試合のみ表示、そうでなければ全試合を1つのカードに
  const displayGroups = showAll && currentRound
    ? { [currentRound.id]: groupedMatches[currentRound.id] || [] }
    : { all: filteredMatches };

  const monthGroups = filteredMatches.reduce((acc, match) => {
    const d = parseISO(match.matchDate);
    const key = Number.isNaN(d.getTime()) ? '日付未定' : format(d, 'yyyy MMMM', { locale: ja }).toUpperCase();
    if (!acc[key]) acc[key] = [];
    acc[key].push(match);
    return acc;
  }, {} as Record<string, EnrichedMatch[]>);

  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-6 md:px-0 md:py-8">
        <div className={`mb-4 ${pageForegroundClass || ''}`.trim()}>
            <h1 className="text-2xl font-black tracking-[-0.05em] text-gray-900 sm:text-xl">
              試合結果
            </h1>
        </div>
        <div className={`mb-5 flex flex-col items-center gap-3 ${pageForegroundClass || ''}`.trim()}>
          <div className="flex w-full items-center justify-between gap-3">
            <Select value={selectedSeason} onValueChange={setSelectedSeason}>
              <SelectTrigger className="h-10 w-[150px] rounded-full border-white/70 bg-white/80 text-gray-500 shadow-sm backdrop-blur md:w-[180px]">
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
            <Select value={selectedCompetition} onValueChange={setSelectedCompetition}>
              <SelectTrigger className="h-10 w-[170px] rounded-full border-white/70 bg-white/80 text-gray-500 shadow-sm backdrop-blur md:w-[180px]">
                <SlidersHorizontal className="mr-2 h-4 w-4" />
                <SelectValue placeholder="大会を選択" />
              </SelectTrigger>
              <SelectContent>
                {competitions.map(comp => (
                  <SelectItem key={comp} value={comp}>
                    {comp === 'all' ? '全大会' : comp}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-full overflow-hidden rounded-full border border-white/70 bg-white/80 shadow-sm backdrop-blur">
            <div className="flex h-9 items-stretch">
              <button
                onClick={() => setShowAll(false)}
                className={`flex-1 text-xs font-black transition-colors ${!showAll ? 'text-white' : 'text-gray-500 hover:bg-white/60'}`}
                style={!showAll ? { backgroundColor: themeColor } : undefined}
              >
                自チームのみ
              </button>
              <button
                onClick={() => setShowAll(true)}
                className={`flex-1 border-l border-gray-200 text-xs font-bold transition-colors ${showAll ? 'text-white' : 'text-gray-500 hover:bg-white/60'}`}
                style={showAll ? { backgroundColor: themeColor } : undefined}
              >
                すべて表示
              </button>
            </div>
          </div>
          <div className="hidden w-full items-center justify-start gap-4 text-xs text-gray-500 md:flex">
            <div className="flex items-center gap-1.5">
              <div className="h-3 w-3 rounded bg-emerald-500"></div>
              <span>勝ち</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-3 w-3 rounded bg-gray-400"></div>
              <span>引き分け</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-3 w-3 rounded bg-red-500"></div>
              <span>負け</span>
            </div>
          </div>
        </div>

        {/* 節ナビゲーション（すべて表示時のみ） */}
        {showAll && rounds.length > 1 && (
          <div className="flex items-center justify-center gap-4 py-2">
            <button
              onClick={handlePrevRound}
              disabled={selectedRoundIndex === 0}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-300 bg-white text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label="前の節"
            >
              &lt;
            </button>
            <span className="min-w-[120px] text-center text-sm font-semibold">
              {currentRound?.name || `節 ${selectedRoundIndex + 1}`}
            </span>
            <button
              onClick={handleNextRound}
              disabled={selectedRoundIndex === rounds.length - 1}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-300 bg-white text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label="次の節"
            >
              &gt;
            </button>
          </div>
        )}

        {filteredMatches.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">表示する試合がありません。</div>
        ) : (
            <div className="space-y-5 md:hidden">
              {Object.entries(monthGroups).map(([monthLabel, matchesInMonth]) => (
                <section key={monthLabel} className="space-y-2">
                  <div className="flex items-center gap-2 text-xs font-black tracking-[0.18em] text-gray-500">
                    <span className="h-5 w-1 rounded-full" style={{ backgroundColor: themeColor }} />
                    <span>{monthLabel}</span>
                  </div>
                  <div className="space-y-2">
                    {matchesInMonth.map((match) => {
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
                                  <Link key={match.id} href={`/${clubSlug}/matches/${match.competitionId}/${match.roundId}/${match.id}`} className="block rounded-xl border border-gray-200/80 bg-white/90 shadow-sm backdrop-blur">
                                    <div className="grid grid-cols-[48px_minmax(0,1fr)] items-stretch">
                                      <div className="flex flex-col items-center justify-center border-r border-gray-200 py-3 text-gray-900">
                                        <div className="text-xl font-black leading-none">{(() => {
                                          const d = parseISO(match.matchDate);
                                          return Number.isNaN(d.getTime()) ? '-' : format(d, 'd', { locale: ja });
                                        })()}</div>
                                        <div className="mt-1 text-[9px] font-bold uppercase text-gray-500">{(() => {
                                          const d = parseISO(match.matchDate);
                                          return Number.isNaN(d.getTime()) ? '' : format(d, 'EEE', { locale: ja });
                                        })()}</div>
                                      </div>
                                      <div className="min-w-0 px-3 py-2.5">
                                        <div className="mb-2 flex min-w-0 items-center gap-1.5 text-[9px] font-bold text-gray-500">
                                          {match.competitionLogoUrl ? <Image src={match.competitionLogoUrl} alt={match.competitionName} width={12} height={12} className="h-3 w-3 shrink-0 object-contain" /> : null}
                                          <span className="truncate">{match.competitionName}</span>
                                          {match.roundId !== 'single' && match.roundName ? <span className="shrink-0">{match.roundName}</span> : null}
                                        </div>
                                        <div className="grid grid-cols-[minmax(0,1fr)_58px_minmax(0,1fr)] items-center gap-2">
                                          <div className="flex min-w-0 items-center justify-end gap-1.5">
                                            <span className="truncate text-right text-[11px] font-black text-gray-900">{match.homeTeamName}</span>
                                            {match.homeTeamLogo ? <Image src={match.homeTeamLogo} alt={match.homeTeamName} width={28} height={28} className="h-7 w-7 shrink-0 rounded-full object-contain" /> : <div className="h-7 w-7 shrink-0 rounded-full bg-muted" />}
                                          </div>
                                          <div className="text-center">
                                            {isFinished ? (
                                              <>
                                                <div className="text-xl font-black leading-none tracking-tight text-gray-950">{match.scoreHome} - {match.scoreAway}</div>
                                                <div className={`mx-auto mt-1 w-fit rounded-full px-2 py-0.5 text-[8px] font-black ${scoreBgClass || 'bg-gray-500 text-white'}`}>{scoreBgClass.includes('emerald') ? 'WIN' : scoreBgClass.includes('red') ? 'LOSS' : 'DRAW'}</div>
                                              </>
                                            ) : <div className="text-xs font-bold text-gray-500">{match.matchTime || 'VS'}</div>}
                                          </div>
                                          <div className="flex min-w-0 items-center gap-1.5">
                                            {match.awayTeamLogo ? <Image src={match.awayTeamLogo} alt={match.awayTeamName} width={28} height={28} className="h-7 w-7 shrink-0 rounded-full object-contain" /> : <div className="h-7 w-7 shrink-0 rounded-full bg-muted" />}
                                            <span className="truncate text-[11px] font-black text-gray-900">{match.awayTeamName}</span>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  </Link>
                                );
                    })}
                  </div>
                </section>
              ))}
            </div>
        )}

        {Object.keys(displayGroups).length > 0 ? (
            <div className="hidden space-y-4 md:block">
                {Object.entries(displayGroups).map(([groupKey, matchesInGroup]) => (
                    <div key={groupKey} className="bg-white rounded-md border">
                        <div className="divide-y divide-gray-100">
                            {matchesInGroup.map((match, index) => {
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
                                    <div key={match.id} className="text-gray-900">
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
                                              if (!match.matchDate) return '';
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
        ) : null}
    </div>
  );
}