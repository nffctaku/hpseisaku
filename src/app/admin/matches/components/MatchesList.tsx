"use client";

import Image from "next/image";
import Link from "next/link";
import { FilePenLine } from "lucide-react";
import { format, isToday, isTomorrow, isYesterday, parseISO } from "date-fns";
import { ja } from "date-fns/locale";
import type { EnrichedMatch } from "../hooks/useMatchesData";

const getFormattedDateGroup = (dateString: string) => {
  const date = parseISO(dateString);
  if (isToday(date)) return "今日";
  if (isYesterday(date)) return "昨日";
  if (isTomorrow(date)) return "明日";
  return format(date, "M月d日(E)", { locale: ja });
};

const getMatchKey = (m: Pick<EnrichedMatch, "competitionId" | "roundId" | "id">) => {
  return `${m.competitionId}__${m.roundId}__${m.id}`;
};

export function MatchesList(props: { matches: EnrichedMatch[] }) {
  const { matches } = props;

  const groupedMatches = matches.reduce((acc, match) => {
    const dateGroup = getFormattedDateGroup(match.matchDate);
    if (!acc[dateGroup]) acc[dateGroup] = [];
    acc[dateGroup].push(match);
    return acc;
  }, {} as Record<string, EnrichedMatch[]>);

  const groupedEntries = Object.entries(groupedMatches);

  if (groupedEntries.length === 0) {
    return <div className="text-center py-10 text-muted-foreground">表示する試合がありません。</div>;
  }

  return (
    <div className="space-y-6">
      {groupedEntries.map(([dateGroup, matchesInGroup]) => (
        <div key={dateGroup}>
          <h2 className="font-semibold text-lg mb-3 text-muted-foreground">{dateGroup}</h2>
          <div className="space-y-3">
            {matchesInGroup.map((match) => {
              const matchKey = getMatchKey(match);
              const isFinished = typeof match.scoreHome === "number" && typeof match.scoreAway === "number";
              const matchDate = parseISO(match.matchDate);
              const formattedDate = format(matchDate, "M/d", { locale: ja });

              const resultColor = !isFinished
                ? "bg-gray-600"
                : match.scoreHome === match.scoreAway
                  ? "bg-gray-600"
                  : match.scoreHome! > match.scoreAway!
                    ? "bg-emerald-600"
                    : "bg-rose-600";

              return (
                <div
                  key={matchKey}
                  id={matchKey}
                  className="relative border rounded-lg p-4 bg-white text-gray-900 shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="grid grid-cols-[1fr_84px_1fr] items-center gap-2">
                        <div className="flex items-center gap-2 min-w-0 justify-end">
                          <span className="font-medium text-sm truncate text-right">{match.homeTeamName}</span>
                          {match.homeTeamLogo ? (
                            <Image
                              src={match.homeTeamLogo}
                              alt={match.homeTeamName}
                              width={22}
                              height={22}
                              className="rounded-full object-contain"
                            />
                          ) : (
                            <div className="w-[22px] h-[22px] bg-muted rounded-full" />
                          )}
                        </div>
                        <div className="flex items-center justify-center w-[84px]">
                          {isFinished ? (
                            <div className={`w-[72px] px-2 py-1 rounded-md font-bold text-white text-sm text-center ${resultColor}`}>
                              {match.scoreHome} - {match.scoreAway}
                            </div>
                          ) : (
                            <div className="w-[72px] text-xs text-muted-foreground text-center">{match.matchTime || "VS"}</div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 min-w-0">
                          {match.awayTeamLogo ? (
                            <Image
                              src={match.awayTeamLogo}
                              alt={match.awayTeamName}
                              width={22}
                              height={22}
                              className="rounded-full object-contain"
                            />
                          ) : (
                            <div className="w-[22px] h-[22px] bg-muted rounded-full" />
                          )}
                          <span className="font-medium text-sm truncate">{match.awayTeamName}</span>
                        </div>
                      </div>

                      <div className="text-[11px] text-muted-foreground text-center mt-1">
                        {match.competitionName} / {match.roundName}
                      </div>
                    </div>

                    <Link
                      href={`/admin/competitions/${match.competitionId}/rounds/${match.roundId}/matches/${match.id}`}
                      className="ml-1 px-1 py-1 text-muted-foreground hover:text-primary transition-colors flex items-center justify-center"
                    >
                      <FilePenLine className="h-4 w-4" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
