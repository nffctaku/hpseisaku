"use client";

import { useMemo, useState } from "react";
import { format, isToday, isYesterday, isTomorrow, parseISO } from "date-fns";
import { ja } from "date-fns/locale";
import Image from "next/image";
import Link from "next/link";
import { MapPin } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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

interface MatchListV2Props {
  allMatches: EnrichedMatch[];
  clubId: string;
  clubSlug: string;
  clubName: string;
  initialSelectedSeason?: string;
  pageForegroundClass?: string;
}

const getFormattedDateGroup = (dateString: string) => {
  const date = parseISO(dateString);
  if (isToday(date)) return "今日";
  if (isYesterday(date)) return "昨日";
  if (isTomorrow(date)) return "明日";
  return format(date, "M月d日(E)", { locale: ja });
};

const getSeason = (date: Date): string => {
  const year = date.getFullYear();
  const month = date.getMonth();
  return month >= 7 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
};

export function MatchListV2({ allMatches, clubId, clubSlug, clubName, initialSelectedSeason, pageForegroundClass }: MatchListV2Props) {
  const [showAll, setShowAll] = useState(false);
  const [selectedCompetition, setSelectedCompetition] = useState<string>("all");
  const [selectedSeason, setSelectedSeason] = useState<string>(initialSelectedSeason || "all");

  const seasons = useMemo(() => {
    const base = [
      "all",
      ...Array.from(
        new Set(
          allMatches.map((m) =>
            typeof (m as any).season === "string" && String((m as any).season).trim().length > 0
              ? String((m as any).season)
              : getSeason(parseISO(m.matchDate))
          )
        )
      ),
    ];
    return base.sort().reverse();
  }, [allMatches]);

  const filteredBySeason = useMemo(() => {
    if (selectedSeason === "all") return allMatches;
    return allMatches.filter((m) => {
      const season =
        typeof (m as any).season === "string" && String((m as any).season).trim().length > 0
          ? String((m as any).season)
          : getSeason(parseISO(m.matchDate));
      return season === selectedSeason;
    });
  }, [allMatches, selectedSeason]);

  const competitionLogoByName = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of filteredBySeason) {
      const name = m.competitionName;
      const logo = (m as any).competitionLogoUrl;
      if (!name || typeof name !== "string") continue;
      if (typeof logo !== "string" || !logo) continue;
      if (!map.has(name)) map.set(name, logo);
    }
    return map;
  }, [filteredBySeason]);

  const competitions = useMemo(() => {
    return ["all", ...Array.from(new Set(filteredBySeason.map((m) => m.competitionName)))];
  }, [filteredBySeason]);

  const filteredByCompetition = useMemo(() => {
    if (selectedCompetition === "all") return filteredBySeason;
    return filteredBySeason.filter((m) => m.competitionName === selectedCompetition);
  }, [filteredBySeason, selectedCompetition]);

  const filteredMatches = useMemo(() => {
    if (showAll) return filteredByCompetition;
    return filteredByCompetition.filter((m) => m.homeTeamId === clubId || m.awayTeamId === clubId);
  }, [filteredByCompetition, showAll, clubId]);

  const groupedMatches = useMemo(() => {
    return filteredMatches.reduce((acc, match) => {
      const dateGroup = getFormattedDateGroup(match.matchDate);
      if (!acc[dateGroup]) acc[dateGroup] = [];
      acc[dateGroup].push(match);
      return acc;
    }, {} as Record<string, EnrichedMatch[]>);
  }, [filteredMatches]);

  return (
    <div className="container mx-auto py-8 px-4 md:px-0">
      <div className={`mb-6 ${pageForegroundClass || ""}`.trim()}>
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-xs text-muted-foreground">{clubName}</div>
            <h1 className="text-xl sm:text-2xl font-black tracking-tight">試合日程・結果</h1>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <Label htmlFor="filter-switch-v2">自チームのみ</Label>
            <Switch
              id="filter-switch-v2"
              checked={!showAll}
              onCheckedChange={(checked) => setShowAll(!checked)}
              className="border border-gray-300 data-[state=unchecked]:bg-gray-200 data-[state=checked]:bg-emerald-500"
            />
            <Label htmlFor="filter-switch-v2">すべて表示</Label>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3 rounded-xl border bg-white/70 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Select value={selectedSeason} onValueChange={setSelectedSeason}>
              <SelectTrigger className="w-[180px] bg-background text-foreground border border-border shadow-sm">
                <SelectValue placeholder="シーズンを選択" />
              </SelectTrigger>
              <SelectContent>
                {seasons.map((season) => (
                  <SelectItem key={season} value={season}>
                    {season === "all" ? "全シーズン" : season}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex flex-wrap items-center gap-2">
              {competitions.map((comp) => (
                <button
                  key={comp}
                  onClick={() => setSelectedCompetition(comp)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-full border transition-colors ${
                    selectedCompetition === comp
                      ? "bg-gray-900 text-white border-gray-900"
                      : "bg-background text-foreground border-border hover:border-muted-foreground"
                  }`}
                >
                  <span className="inline-flex items-center gap-1">
                    {comp !== "all" && competitionLogoByName.get(comp) ? (
                      <Image
                        src={competitionLogoByName.get(comp)!}
                        alt=""
                        width={14}
                        height={14}
                        className="h-3.5 w-3.5 object-contain"
                      />
                    ) : null}
                    <span>{comp === "all" ? "全大会" : comp}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {Object.keys(groupedMatches).length === 0 ? (
        <div className="text-center py-10 text-muted-foreground">表示する試合がありません。</div>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedMatches).map(([dateGroup, matchesInGroup]) => (
            <section key={dateGroup} className="space-y-3">
              <div className="sticky top-[56px] z-10 -mx-4 px-4 sm:mx-0 sm:px-0">
                <div className="inline-flex items-center rounded-full border bg-white/80 px-3 py-1 text-xs font-semibold text-gray-900 shadow-sm">
                  {dateGroup}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3">
                {matchesInGroup.map((match) => {
                  const isFinished = typeof match.scoreHome === "number" && typeof match.scoreAway === "number";

                  const venue =
                    typeof (match as any).venue === "string"
                      ? String((match as any).venue)
                      : typeof (match as any).stadium === "string"
                        ? String((match as any).stadium)
                        : "";

                  const selfSide =
                    match.homeTeamId === clubId ? "HOME" : match.awayTeamId === clubId ? "AWAY" : null;

                  let resultPill = "bg-gray-100 text-gray-700";
                  if (!showAll && isFinished && selfSide) {
                    const isHome = match.homeTeamId === clubId;
                    const selfScore = isHome ? (match.scoreHome as number) : (match.scoreAway as number);
                    const oppScore = isHome ? (match.scoreAway as number) : (match.scoreHome as number);
                    if (selfScore > oppScore) resultPill = "bg-emerald-500 text-white";
                    else if (selfScore < oppScore) resultPill = "bg-red-500 text-white";
                    else resultPill = "bg-gray-500 text-white";
                  }

                  return (
                    <div key={match.id} className="rounded-xl border bg-white p-4 text-gray-900 shadow-sm">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            {selfSide ? (
                              <span className="inline-flex items-center rounded-full bg-gray-900 text-white px-2.5 py-0.5 text-[11px] font-bold tracking-wide">
                                {selfSide}
                              </span>
                            ) : null}
                            {match.competitionLogoUrl ? (
                              <Image
                                src={match.competitionLogoUrl}
                                alt=""
                                width={14}
                                height={14}
                                className="h-3.5 w-3.5 object-contain"
                              />
                            ) : null}
                            <span className="truncate">{match.competitionName}</span>
                            {match.roundId !== "single" && match.roundName ? (
                              <span className="truncate">/ {match.roundName}</span>
                            ) : null}
                            {venue ? (
                              <span className="inline-flex items-center gap-1 min-w-0">
                                <MapPin className="h-3.5 w-3.5 shrink-0" />
                                <span className="truncate">{venue}</span>
                              </span>
                            ) : null}
                          </div>

                          <div className="mt-2 text-sm font-semibold text-gray-900">
                            {(() => {
                              const d = parseISO(match.matchDate);
                              const dateLabel = Number.isNaN(d.getTime())
                                ? match.matchDate
                                : format(d, "yyyy.M.d(EEE)", { locale: ja });
                              return `${dateLabel}${match.matchTime ? ` ${match.matchTime}` : ""}`;
                            })()}
                          </div>
                        </div>

                        <Link
                          href={`/${clubSlug}/matches/${match.competitionId}/${match.roundId}/${match.id}`}
                          className="shrink-0"
                        >
                          <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 rounded-lg border bg-gray-50 px-3 py-2 hover:bg-gray-100 transition-colors">
                            <div className="flex items-center justify-end gap-2 min-w-0">
                              <span className="text-xs font-semibold truncate" title={match.homeTeamName}>
                                {match.homeTeamName}
                              </span>
                              {match.homeTeamLogo ? (
                                <Image
                                  src={match.homeTeamLogo}
                                  alt={match.homeTeamName}
                                  width={28}
                                  height={28}
                                  className="h-7 w-7 rounded-full object-contain"
                                />
                              ) : (
                                <div className="h-7 w-7 rounded-full bg-muted" />
                              )}
                            </div>

                            <div className="text-center">
                              {isFinished ? (
                                <span className={`inline-flex min-w-[70px] items-center justify-center rounded-md px-2 py-1 text-sm font-black tabular-nums ${resultPill}`}>
                                  {match.scoreHome} - {match.scoreAway}
                                </span>
                              ) : (
                                <span className="text-xs font-semibold text-muted-foreground">{match.matchTime || "VS"}</span>
                              )}
                            </div>

                            <div className="flex items-center justify-start gap-2 min-w-0">
                              {match.awayTeamLogo ? (
                                <Image
                                  src={match.awayTeamLogo}
                                  alt={match.awayTeamName}
                                  width={28}
                                  height={28}
                                  className="h-7 w-7 rounded-full object-contain"
                                />
                              ) : (
                                <div className="h-7 w-7 rounded-full bg-muted" />
                              )}
                              <span className="text-xs font-semibold truncate" title={match.awayTeamName}>
                                {match.awayTeamName}
                              </span>
                            </div>
                          </div>
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
