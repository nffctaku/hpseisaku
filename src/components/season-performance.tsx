"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface Competition {
  id: string;
  name: string;
  season?: string;
  format?: string;
}

interface Match {
  id: string;
  competitionId: string;
  homeTeamId: string;
  awayTeamId: string;
  matchDate: string;
  scoreHome?: number | null;
  scoreAway?: number | null;
  homeTeamName?: string;
  awayTeamName?: string;
}

interface Team {
  id: string;
  name: string;
}

interface SeasonPerformanceProps {
  matches: Match[];
  competitions: Competition[];
  teams: Team[];
  mainTeamId?: string | null;
  selectedSeason: string;
  onSeasonChange: (season: string) => void;
}

interface SeasonStats {
  wins: number;
  draws: number;
  losses: number;
  winRate: number;
  homeWins: number;
  awayWins: number;
}

interface LeagueStats {
  points: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
}

export function SeasonPerformance({
  matches,
  competitions,
  teams,
  mainTeamId,
  selectedSeason,
  onSeasonChange,
}: SeasonPerformanceProps) {
  const seasons = useMemo(() => {
    const seasonSet = new Set<string>();
    competitions.forEach((c) => {
      if (c.season && typeof c.season === "string" && c.season.trim() !== "") {
        seasonSet.add(c.season);
      }
    });
    return Array.from(seasonSet).sort((a, b) => b.localeCompare(a));
  }, [competitions]);

  const seasonStats = useMemo(() => {
    const stats: Record<string, SeasonStats> = {};

    seasons.forEach((season) => {
      const seasonCompetitions = competitions.filter((c) => c.season === season);
      const competitionIds = new Set(seasonCompetitions.map((c) => c.id));

      const seasonMatches = matches.filter((m) => competitionIds.has(m.competitionId));
      const teamMatches = mainTeamId
        ? seasonMatches.filter((m) => m.homeTeamId === mainTeamId || m.awayTeamId === mainTeamId)
        : seasonMatches;

      let wins = 0;
      let draws = 0;
      let losses = 0;
      let homeWins = 0;
      let awayWins = 0;

      teamMatches.forEach((match) => {
        const isHome = match.homeTeamId === mainTeamId;
        const isAway = match.awayTeamId === mainTeamId;
        const homeScore = match.scoreHome ?? 0;
        const awayScore = match.scoreAway ?? 0;

        if (isHome) {
          if (homeScore > awayScore) {
            wins++;
            homeWins++;
          } else if (homeScore === awayScore) {
            draws++;
          } else {
            losses++;
          }
        } else if (isAway) {
          if (awayScore > homeScore) {
            wins++;
            awayWins++;
          } else if (awayScore === homeScore) {
            draws++;
          } else {
            losses++;
          }
        }
      });

      const totalMatches = wins + draws + losses;
      const winRate = totalMatches > 0 ? Math.round((wins / totalMatches) * 100) : 0;

      stats[season] = {
        wins,
        draws,
        losses,
        winRate,
        homeWins,
        awayWins,
      };
    });

    return stats;
  }, [seasons, competitions, matches, mainTeamId]);

  const leagueStats = useMemo(() => {
    const stats: Record<string, LeagueStats> = {};

    seasons.forEach((season) => {
      const seasonCompetitions = competitions.filter((c) => c.season === season && c.format === 'league');
      const competitionIds = new Set(seasonCompetitions.map((c) => c.id));

      const seasonMatches = matches.filter((m) => competitionIds.has(m.competitionId));
      const teamMatches = mainTeamId
        ? seasonMatches.filter((m) => m.homeTeamId === mainTeamId || m.awayTeamId === mainTeamId)
        : seasonMatches;

      let points = 0;
      let goalsFor = 0;
      let goalsAgainst = 0;

      teamMatches.forEach((match) => {
        const isHome = match.homeTeamId === mainTeamId;
        const isAway = match.awayTeamId === mainTeamId;
        const homeScore = match.scoreHome ?? 0;
        const awayScore = match.scoreAway ?? 0;

        if (isHome) {
          goalsFor += homeScore;
          goalsAgainst += awayScore;
          if (homeScore > awayScore) points += 3;
          else if (homeScore === awayScore) points += 1;
        } else if (isAway) {
          goalsFor += awayScore;
          goalsAgainst += homeScore;
          if (awayScore > homeScore) points += 3;
          else if (awayScore === homeScore) points += 1;
        }
      });

      stats[season] = {
        points,
        goalsFor,
        goalsAgainst,
        goalDifference: goalsFor - goalsAgainst,
      };
    });

    return stats;
  }, [seasons, competitions, matches, mainTeamId]);

  const currentSeasonStats = seasonStats[selectedSeason] || {
    wins: 0,
    draws: 0,
    losses: 0,
    winRate: 0,
    homeWins: 0,
    awayWins: 0,
  };

  const currentLeagueStats = leagueStats[selectedSeason] || {
    points: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDifference: 0,
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold">シーズン別成績</h2>
        <Select value={selectedSeason} onValueChange={onSeasonChange}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="シーズンを選択" />
          </SelectTrigger>
          <SelectContent>
            {seasons.map((season) => (
              <SelectItem key={season} value={season}>
                {season}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* 公式戦成績 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              {selectedSeason} 公式戦
              <span className="text-sm text-muted-foreground ml-2">
                (リーグ戦、カップ戦、リーグ&カップ戦)
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-green-600">{currentSeasonStats.wins}</div>
                <div className="text-sm text-muted-foreground">勝</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-yellow-600">{currentSeasonStats.draws}</div>
                <div className="text-sm text-muted-foreground">分</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-red-600">{currentSeasonStats.losses}</div>
                <div className="text-sm text-muted-foreground">負</div>
              </div>
              <div>
                <div className="text-2xl font-bold">{currentSeasonStats.winRate}%</div>
                <div className="text-sm text-muted-foreground">勝率</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ホーム・アウェイ別勝利数 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">ホーム・アウェイ別勝利数</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-blue-600">{currentSeasonStats.homeWins}</div>
                <div className="text-sm text-muted-foreground">ホーム勝利数</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-orange-600">{currentSeasonStats.awayWins}</div>
                <div className="text-sm text-muted-foreground">アウェイ勝利数</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* リーグ戦詳細成績 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            大会別(リーグ戦のみ) {selectedSeason}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>リーグ戦</TableHead>
                <TableHead className="text-center">勝</TableHead>
                <TableHead className="text-center">分</TableHead>
                <TableHead className="text-center">負</TableHead>
                <TableHead className="text-center">勝率</TableHead>
                <TableHead className="text-center">勝点</TableHead>
                <TableHead className="text-center">得</TableHead>
                <TableHead className="text-center">失</TableHead>
                <TableHead className="text-center">±</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {competitions
                .filter((c) => c.season === selectedSeason && c.format === 'league')
                .map((competition) => {
                  const competitionMatches = matches.filter(
                    (m) => m.competitionId === competition.id
                  );
                  const teamMatches = mainTeamId
                    ? competitionMatches.filter(
                        (m) => m.homeTeamId === mainTeamId || m.awayTeamId === mainTeamId
                      )
                    : competitionMatches;

                  let wins = 0;
                  let draws = 0;
                  let losses = 0;
                  let points = 0;
                  let goalsFor = 0;
                  let goalsAgainst = 0;

                  teamMatches.forEach((match) => {
                    const isHome = match.homeTeamId === mainTeamId;
                    const isAway = match.awayTeamId === mainTeamId;
                    const homeScore = match.scoreHome ?? 0;
                    const awayScore = match.scoreAway ?? 0;

                    if (isHome) {
                      goalsFor += homeScore;
                      goalsAgainst += awayScore;
                      if (homeScore > awayScore) {
                        wins++;
                        points += 3;
                      } else if (homeScore === awayScore) {
                        draws++;
                        points += 1;
                      } else {
                        losses++;
                      }
                    } else if (isAway) {
                      goalsFor += awayScore;
                      goalsAgainst += homeScore;
                      if (awayScore > homeScore) {
                        wins++;
                        points += 3;
                      } else if (awayScore === homeScore) {
                        draws++;
                        points += 1;
                      } else {
                        losses++;
                      }
                    }
                  });

                  const totalMatches = wins + draws + losses;
                  const winRate = totalMatches > 0 ? Math.round((wins / totalMatches) * 100) : 0;
                  const goalDifference = goalsFor - goalsAgainst;

                  return (
                    <TableRow key={competition.id}>
                      <TableCell className="font-medium">{competition.name}</TableCell>
                      <TableCell className="text-center">{wins}</TableCell>
                      <TableCell className="text-center">{draws}</TableCell>
                      <TableCell className="text-center">{losses}</TableCell>
                      <TableCell className="text-center">{winRate}%</TableCell>
                      <TableCell className="text-center font-bold">{points}</TableCell>
                      <TableCell className="text-center">{goalsFor}</TableCell>
                      <TableCell className="text-center">{goalsAgainst}</TableCell>
                      <TableCell className="text-center font-medium">
                        {goalDifference > 0 ? `+${goalDifference}` : goalDifference}
                      </TableCell>
                    </TableRow>
                  );
                })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
