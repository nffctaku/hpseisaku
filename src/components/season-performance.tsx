"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function toSlashSeason(season: string): string {
  if (!season) return season;
  if (season.includes("/")) {
    const parts = season.split("/");
    if (parts.length === 2 && /^\d{4}$/.test(parts[0])) {
      const end = parts[1];
      const end2 = /^\d{4}$/.test(end) ? end.slice(-2) : end;
      if (/^\d{2}$/.test(end2)) return `${parts[0]}/${end2}`;
    }
    return season;
  }
  const mShort = season.match(/^(\d{4})-(\d{2})$/);
  if (mShort) return `${mShort[1]}/${mShort[2]}`;
  const m4 = season.match(/^(\d{4})-(\d{4})$/);
  if (m4) return `${m4[1]}/${m4[2].slice(-2)}`;
  return season;
}

function toDashSeason(season: string): string {
  if (!season) return season;
  if (season.includes("-")) {
    const parts = season.split("-");
    if (parts.length === 2 && /^\d{4}$/.test(parts[0])) {
      const end = parts[1];
      const end2 = /^\d{4}$/.test(end) ? end.slice(-2) : end;
      if (/^\d{2}$/.test(end2)) return `${parts[0]}-${end2}`;
    }
    return season;
  }
  const mShort = season.match(/^(\d{4})\/(\d{2})$/);
  if (mShort) return `${mShort[1]}-${mShort[2]}`;
  const m4 = season.match(/^(\d{4})\/(\d{4})$/);
  if (m4) return `${m4[1]}-${m4[2].slice(-2)}`;
  return season;
}

function seasonEquals(a: string, b: string): boolean {
  if (!a || !b) return false;
  return a === b || toSlashSeason(a) === toSlashSeason(b) || toDashSeason(a) === toDashSeason(b);
}

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
      const seasonCompetitions = competitions.filter((c) => typeof c.season === "string" && seasonEquals(c.season, season));
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
      const seasonCompetitions = competitions.filter((c) => typeof c.season === "string" && seasonEquals(c.season, season) && c.format === 'league');
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

  const totalMatches = currentSeasonStats.wins + currentSeasonStats.draws + currentSeasonStats.losses;
  const winPercent = totalMatches > 0 ? (currentSeasonStats.wins / totalMatches) * 100 : 0;
  const drawPercent = totalMatches > 0 ? (currentSeasonStats.draws / totalMatches) * 100 : 0;
  const lossPercent = totalMatches > 0 ? (currentSeasonStats.losses / totalMatches) * 100 : 0;

  return (
    <div className="max-w-[760px] mx-auto space-y-7">
      <div className="flex justify-between items-center">
      </div>

      {/* 公式戦成績 */}
      <div className="card" style={{
        fontFamily: 'IBM Plex Sans JP, sans-serif'
      }}>
        <div className="card-head flex justify-between items-start flex-wrap gap-2" style={{
          borderBottom: '2px solid #0B1410',
          paddingBottom: '8px',
          marginBottom: '8px'
        }}>
          <div className="card-title" style={{
            fontFamily: 'Oswald, sans-serif',
            fontWeight: 600,
            fontSize: '16px',
            letterSpacing: '0.02em'
          }}>
            {toSlashSeason(selectedSeason)} <b style={{ color: '#B8862C' }}>公式戦</b>
          </div>
          <div className="card-note" style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: '11px',
            letterSpacing: '0.02em',
            color: '#0B1410b3'
          }}>
            リーグ戦・カップ戦・リーグ&カップ戦
          </div>
        </div>

        <div className="record-row grid grid-cols-[1fr_1fr_1fr_1fr]" style={{
          fontFamily: 'JetBrains Mono, monospace',
          fontVariantNumeric: 'tabular-nums'
        }}>
          <div className="record-cell text-center" style={{
            padding: '26px 10px 20px',
            borderRight: '1px solid #0B141033'
          }}>
            <div className="record-num win" style={{
              fontSize: 'clamp(32px, 7vw, 46px)',
              fontWeight: 700,
              color: '#2F7A56',
              marginBottom: '10px'
            }}>
              {currentSeasonStats.wins}
            </div>
            <div className="record-label" style={{
              fontFamily: 'Oswald, sans-serif',
              fontWeight: 400,
              fontSize: '11px',
              letterSpacing: '0.12em'
            }}>
              勝
            </div>
          </div>
          <div className="record-cell text-center" style={{
            padding: '26px 10px 20px',
            borderRight: '1px solid #0B141033'
          }}>
            <div className="record-num draw" style={{
              fontSize: 'clamp(32px, 7vw, 46px)',
              fontWeight: 700,
              color: '#B8862C',
              marginBottom: '10px'
            }}>
              {currentSeasonStats.draws}
            </div>
            <div className="record-label" style={{
              fontFamily: 'Oswald, sans-serif',
              fontWeight: 400,
              fontSize: '11px',
              letterSpacing: '0.12em'
            }}>
              分
            </div>
          </div>
          <div className="record-cell text-center" style={{
            padding: '26px 10px 20px',
            borderRight: '1px solid #0B141033'
          }}>
            <div className="record-num loss" style={{
              fontSize: 'clamp(32px, 7vw, 46px)',
              fontWeight: 700,
              color: '#B85450',
              marginBottom: '10px'
            }}>
              {currentSeasonStats.losses}
            </div>
            <div className="record-label" style={{
              fontFamily: 'Oswald, sans-serif',
              fontWeight: 400,
              fontSize: '11px',
              letterSpacing: '0.12em'
            }}>
              負
            </div>
          </div>
          <div className="record-cell text-center" style={{
            padding: '26px 10px 20px'
          }}>
            <div className="record-num" style={{
              fontSize: 'clamp(32px, 7vw, 46px)',
              fontWeight: 700,
              color: '#0B1410',
              marginBottom: '10px'
            }}>
              {currentSeasonStats.winRate}%
            </div>
            <div className="record-label" style={{
              fontFamily: 'Oswald, sans-serif',
              fontWeight: 400,
              fontSize: '11px',
              letterSpacing: '0.12em'
            }}>
              勝率
            </div>
          </div>
        </div>

        {/* 内訳バー */}
        <div className="form-bar" style={{
          height: '6px',
          borderRadius: '2px',
          backgroundColor: '#0B141033',
          display: 'flex',
          marginTop: '20px'
        }}>
          {winPercent > 0 && (
            <span className="fb-win" style={{
              width: `${winPercent}%`,
              backgroundColor: '#2F7A56'
            }}></span>
          )}
          {drawPercent > 0 && (
            <span className="fb-draw" style={{
              width: `${drawPercent}%`,
              backgroundColor: '#B8862C'
            }}></span>
          )}
          {lossPercent > 0 && (
            <span className="fb-loss" style={{
              width: `${lossPercent}%`,
              backgroundColor: '#B85450'
            }}></span>
          )}
        </div>
      </div>

      {/* ホーム・アウェイ別勝利数 */}
      <div className="card" style={{
        fontFamily: 'IBM Plex Sans JP, sans-serif'
      }}>
        <div className="card-head flex justify-between items-start flex-wrap gap-2" style={{
          borderBottom: '2px solid #0B1410',
          paddingBottom: '8px',
          marginBottom: '8px'
        }}>
          <div className="card-title" style={{
            fontFamily: 'Oswald, sans-serif',
            fontWeight: 600,
            fontSize: '16px',
            letterSpacing: '0.02em'
          }}>
            ホーム・アウェイ別勝利数
          </div>
        </div>

        <div className="split-row grid grid-cols-[1fr_1px_1fr]" style={{
          fontFamily: 'JetBrains Mono, monospace',
          fontVariantNumeric: 'tabular-nums'
        }}>
          <div className="split-cell text-center" style={{
            padding: '28px 20px'
          }}>
            <div className="split-num" style={{
              fontSize: 'clamp(30px, 6vw, 42px)',
              fontWeight: 700,
              color: '#B8862C',
              marginBottom: '10px'
            }}>
              {currentSeasonStats.homeWins}
            </div>
            <div className="split-label" style={{
              fontFamily: 'Oswald, sans-serif',
              fontWeight: 400,
              fontSize: '11px',
              letterSpacing: '0.12em',
              marginBottom: '8px'
            }}>
              ホーム勝利数
            </div>
            <div className="split-tag" style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: '10px',
              letterSpacing: '0.08em',
              border: '1px solid #0B1410',
              borderRadius: '2px',
              padding: '3px 10px',
              display: 'inline-block'
            }}>
              HOME
            </div>
          </div>
          <div className="split-divider" style={{
            backgroundColor: '#0B141033'
          }}></div>
          <div className="split-cell text-center" style={{
            padding: '28px 20px'
          }}>
            <div className="split-num" style={{
              fontSize: 'clamp(30px, 6vw, 42px)',
              fontWeight: 700,
              color: '#B8862C',
              marginBottom: '10px'
            }}>
              {currentSeasonStats.awayWins}
            </div>
            <div className="split-label" style={{
              fontFamily: 'Oswald, sans-serif',
              fontWeight: 400,
              fontSize: '11px',
              letterSpacing: '0.12em',
              marginBottom: '8px'
            }}>
              アウェイ勝利数
            </div>
            <div className="split-tag" style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: '10px',
              letterSpacing: '0.08em',
              border: '1px solid #0B1410',
              borderRadius: '2px',
              padding: '3px 10px',
              display: 'inline-block'
            }}>
              AWAY
            </div>
          </div>
        </div>
      </div>

      {/* リーグ戦詳細成績 */}
      <Card className="bg-white text-gray-900">
        <CardHeader>
          <CardTitle className="text-lg">
            大会別(リーグ戦のみ)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table className="bg-white">
            <TableHeader>
              <TableRow>
                <TableHead>シーズン</TableHead>
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
              {(() => {
                const league = competitions.filter((c) => c.format === 'league');
                const showOnHome = league.filter((c: any) => Boolean((c as any).showOnHome));
                const target = showOnHome.length > 0 ? showOnHome : league;
                return target;
              })()
                .sort((a, b) => {
                  const sa = typeof a.season === 'string' ? a.season : '';
                  const sb = typeof b.season === 'string' ? b.season : '';
                  if (sa !== sb) return sb.localeCompare(sa);
                  return String(a.name || '').localeCompare(String(b.name || ''));
                })
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
                      <TableCell className="font-medium">{competition.season || '-'}</TableCell>
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
