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

function hasCompletedScore(match: Match): boolean {
  return typeof match.scoreHome === "number" && typeof match.scoreAway === "number";
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

interface PlayerRow {
  id: string;
  name: string;
  number?: number;
  position?: string;
  teamId?: string;
  manualCompetitionStats?: any[];
  seasonData?: Record<string, any>;
}

interface AggregatedPlayerStats {
  appearances: number;
  minutes: number;
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
}

interface SeasonPerformanceProps {
  matches: Match[];
  competitions: Competition[];
  teams: Team[];
  players?: PlayerRow[];
  aggregatedStats?: Record<string, AggregatedPlayerStats>;
  mainTeamId?: string | null;
  selectedSeason: string;
  onSeasonChange: (season: string) => void;
  selectedCompetitionId?: string;
  onCompetitionChange?: (competitionId: string) => void;
  darkMode?: boolean;
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
  players,
  aggregatedStats,
  mainTeamId,
  selectedSeason,
  onSeasonChange,
  selectedCompetitionId = "all",
  onCompetitionChange,
  darkMode = false,
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
      let competitionIds = new Set(seasonCompetitions.map((c) => c.id));

      if (selectedCompetitionId && selectedCompetitionId !== "all") {
        competitionIds = new Set([selectedCompetitionId]);
      }

      const seasonMatches = matches.filter((m) => competitionIds.has(m.competitionId));
      const teamMatches = (mainTeamId
        ? seasonMatches.filter((m) => m.homeTeamId === mainTeamId || m.awayTeamId === mainTeamId)
        : seasonMatches
      ).filter(hasCompletedScore);

      let wins = 0;
      let draws = 0;
      let losses = 0;
      let homeWins = 0;
      let awayWins = 0;

      teamMatches.forEach((match) => {
        const isHome = match.homeTeamId === mainTeamId;
        const isAway = match.awayTeamId === mainTeamId;
        const homeScore = match.scoreHome as number;
        const awayScore = match.scoreAway as number;

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
  }, [seasons, competitions, matches, mainTeamId, selectedCompetitionId]);

  const leagueStats = useMemo(() => {
    const stats: Record<string, LeagueStats> = {};

    seasons.forEach((season) => {
      const seasonCompetitions = competitions.filter((c) => typeof c.season === "string" && seasonEquals(c.season, season) && c.format === 'league');
      let competitionIds = new Set(seasonCompetitions.map((c) => c.id));

      if (selectedCompetitionId && selectedCompetitionId !== "all") {
        competitionIds = new Set([selectedCompetitionId]);
      }

      const seasonMatches = matches.filter((m) => competitionIds.has(m.competitionId));
      const teamMatches = (mainTeamId
        ? seasonMatches.filter((m) => m.homeTeamId === mainTeamId || m.awayTeamId === mainTeamId)
        : seasonMatches
      ).filter(hasCompletedScore);

      let points = 0;
      let goalsFor = 0;
      let goalsAgainst = 0;

      teamMatches.forEach((match) => {
        const isHome = match.homeTeamId === mainTeamId;
        const isAway = match.awayTeamId === mainTeamId;
        const homeScore = match.scoreHome as number;
        const awayScore = match.scoreAway as number;

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
  }, [seasons, competitions, matches, mainTeamId, selectedCompetitionId]);

  // リーグ戦のみのホーム・アウェイ勝利数
  const leagueHomeAwayStats = useMemo(() => {
    const stats: Record<string, { homeWins: number; awayWins: number }> = {};

    seasons.forEach((season) => {
      const seasonCompetitions = competitions.filter((c) => typeof c.season === "string" && seasonEquals(c.season, season) && c.format === 'league');
      let competitionIds = new Set(seasonCompetitions.map((c) => c.id));

      if (selectedCompetitionId && selectedCompetitionId !== "all") {
        competitionIds = new Set([selectedCompetitionId]);
      }

      const seasonMatches = matches.filter((m) => competitionIds.has(m.competitionId));
      const teamMatches = (mainTeamId
        ? seasonMatches.filter((m) => m.homeTeamId === mainTeamId || m.awayTeamId === mainTeamId)
        : seasonMatches
      ).filter(hasCompletedScore);

      let homeWins = 0;
      let awayWins = 0;

      teamMatches.forEach((match) => {
        const isHome = match.homeTeamId === mainTeamId;
        const isAway = match.awayTeamId === mainTeamId;
        const homeScore = match.scoreHome as number;
        const awayScore = match.scoreAway as number;

        if (isHome && homeScore > awayScore) {
          homeWins++;
        } else if (isAway && awayScore > homeScore) {
          awayWins++;
        }
      });

      stats[season] = {
        homeWins,
        awayWins,
      };
    });

    return stats;
  }, [seasons, competitions, matches, mainTeamId, selectedCompetitionId]);

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

  const currentLeagueHomeAwayStats = leagueHomeAwayStats[selectedSeason] || {
    homeWins: 0,
    awayWins: 0,
  };

  // 選手の得点ランキングを計算（トップ5）
  const playerGoalRanking = useMemo(() => {
    if (!players || !aggregatedStats) return [];

    const ranked = players.map((p) => {
      const stats = aggregatedStats[p.id] || { goals: 0, minutes: 0 };
      const goalsPer90 = stats.minutes > 0 ? (stats.goals / stats.minutes) * 90 : 0;
      return { player: p, goals: stats.goals, goalsPer90 };
    }).filter((item) => item.goals > 0).sort((a, b) => b.goals - a.goals).slice(0, 5);

    return ranked.map((item, index) => ({ ...item, rank: index + 1 }));
  }, [players, aggregatedStats, selectedCompetitionId]);

  // 選手のアシストランキングを計算（トップ5）
  const playerAssistRanking = useMemo(() => {
    if (!players || !aggregatedStats) return [];

    const ranking = players
      .map((player) => {
        const stats = aggregatedStats[player.id];
        return {
          player,
          assists: stats?.assists || 0,
          minutes: stats?.minutes || 0,
          appearances: stats?.appearances || 0,
        };
      })
      .filter((item) => item.assists > 0)
      .sort((a, b) => b.assists - a.assists)
      .slice(0, 5)
      .map((item, index) => ({
        ...item,
        rank: index + 1,
        assistsPer90: item.minutes > 0 ? (item.assists / item.minutes) * 90 : 0,
      }));

    return ranking;
  }, [players, aggregatedStats, selectedCompetitionId]);

  const totalMatches = currentSeasonStats.wins + currentSeasonStats.draws + currentSeasonStats.losses;
  const winPercent = totalMatches > 0 ? (currentSeasonStats.wins / totalMatches) * 100 : 0;
  const drawPercent = totalMatches > 0 ? (currentSeasonStats.draws / totalMatches) * 100 : 0;
  const lossPercent = totalMatches > 0 ? (currentSeasonStats.losses / totalMatches) * 100 : 0;

  const cardStyle = darkMode
    ? {
        backgroundColor: 'rgba(15, 23, 42, 0.78)',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        borderRadius: '10px',
        boxShadow: '0 18px 50px rgba(0, 0, 0, 0.22)',
        color: '#f8fafc',
        padding: '18px',
        fontFamily: 'IBM Plex Sans JP, sans-serif',
      }
    : { fontFamily: 'IBM Plex Sans JP, sans-serif' };
  const lineColor = darkMode ? 'rgba(255, 255, 255, 0.12)' : '#0B141033';
  const strongLineColor = darkMode ? 'rgba(255, 255, 255, 0.10)' : '#0B1410';
  const mutedText = darkMode ? 'rgba(255, 255, 255, 0.64)' : '#0B1410b3';
  const mainText = darkMode ? '#f8fafc' : '#0B1410';

  const seasonCompetitions = useMemo(() => {
    if (!selectedSeason || selectedSeason === "all") return competitions;
    return competitions.filter((c) => c.season && typeof c.season === "string" && seasonEquals(c.season, selectedSeason));
  }, [competitions, selectedSeason]);

  return (
    <div className="mx-auto max-w-[1180px] space-y-5">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <Select value={selectedSeason} onValueChange={onSeasonChange}>
          <SelectTrigger className="w-[180px]" style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: '11px',
            border: `1px solid ${lineColor}`,
            backgroundColor: darkMode ? 'rgba(15, 23, 42, 0.88)' : 'transparent',
            color: mainText
          }}>
            <SelectValue placeholder="シーズンを選択" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: '11px'
            }}>
              すべて
            </SelectItem>
            {seasons.map((season) => (
              <SelectItem key={season} value={season} style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: '11px'
              }}>
                {toSlashSeason(season)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {onCompetitionChange && (
          <Select value={selectedCompetitionId} onValueChange={onCompetitionChange}>
            <SelectTrigger className="w-[180px]" style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: '11px',
              border: `1px solid ${lineColor}`,
              backgroundColor: darkMode ? 'rgba(15, 23, 42, 0.88)' : 'transparent',
              color: mainText
            }}>
              <SelectValue placeholder="大会を選択" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: '11px'
              }}>
                すべて
              </SelectItem>
              {seasonCompetitions.map((comp) => (
                <SelectItem key={comp.id} value={comp.id} style={{
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: '11px'
                }}>
                  {comp.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* 公式戦成績 */}
      <div className="card" style={cardStyle}>
        <div className="card-head flex justify-between items-start flex-wrap gap-2" style={{
          borderBottom: `1px solid ${strongLineColor}`,
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
            color: mutedText
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
            borderRight: `1px solid ${lineColor}`
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
            borderRight: `1px solid ${lineColor}`
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
            borderRight: `1px solid ${lineColor}`
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
              color: mainText,
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
          backgroundColor: lineColor,
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
      <div className="card" style={cardStyle}>
        <div className="card-head flex justify-between items-start flex-wrap gap-2" style={{
          borderBottom: `1px solid ${strongLineColor}`,
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
            <span style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: '11px',
              letterSpacing: '0.02em',
              color: mutedText,
              marginLeft: '8px',
              fontWeight: 400
            }}>
              リーグ戦
            </span>
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
              {currentLeagueHomeAwayStats.homeWins}
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
              border: `1px solid ${darkMode ? 'rgba(255, 255, 255, 0.28)' : '#0B1410'}`,
              borderRadius: '2px',
              padding: '3px 10px',
              display: 'inline-block'
            }}>
              HOME
            </div>
          </div>
          <div className="split-divider" style={{
            backgroundColor: lineColor
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
              {currentLeagueHomeAwayStats.awayWins}
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
              border: `1px solid ${darkMode ? 'rgba(255, 255, 255, 0.28)' : '#0B1410'}`,
              borderRadius: '2px',
              padding: '3px 10px',
              display: 'inline-block'
            }}>
              AWAY
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
      {/* 選手ランキングセクション */}
      <div className="ranking-section" style={cardStyle}>
        <div className="section-head flex justify-between items-start flex-wrap gap-4 mb-12" style={{
          borderBottom: `1px solid ${strongLineColor}`,
          paddingBottom: '8px',
          marginBottom: '8px'
        }}>
          <div className="flex items-baseline gap-4">
            <h2 style={{
              fontFamily: 'Oswald, sans-serif',
              fontWeight: 600,
              fontSize: '16px',
              letterSpacing: '0.02em'
            }}>
              選手ランキング — 得点
            </h2>
          </div>
          <p style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: '11px',
            letterSpacing: '0.02em',
            color: mutedText,
            textAlign: 'right',
            marginLeft: 'auto'
          }}>
            シーズン通算ゴール数トップ5
          </p>
        </div>

        <div className="ranking-list" style={{
          borderTop: `1px solid ${lineColor}`
        }}>
          {playerGoalRanking.map((item) => (
            <div key={item.player.id} className="rank-row" style={{
              display: 'grid',
              gridTemplateColumns: '56px 1fr auto auto',
              alignItems: 'center',
              gap: '1px',
              padding: '20px 4px',
              borderBottom: `1px solid ${lineColor}`,
              transition: 'background 0.2s',
              cursor: 'pointer'
            }}>
              <div className="rank-index" style={{
                fontFamily: 'Anton, sans-serif',
                fontSize: '28px',
                color: '#D3A63C'
              }}>
                {String(item.rank).padStart(2, '0')}
              </div>
              <div>
                <div className="rank-name" style={{
                  fontFamily: 'Oswald, sans-serif',
                  fontWeight: 600,
                  fontSize: '15px'
                }}>
                  {item.player.name}
                </div>
                <div className="rank-pos" style={{
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: '11px',
                  letterSpacing: '0.08em',
                  color: mutedText
                }}>
                  {item.player.position || ''} {item.player.number ? `/ #${item.player.number}` : ''}
                </div>
              </div>
              <div className="rank-num" style={{
                fontFamily: 'Anton, sans-serif',
                fontSize: '28px',
                color: '#D3A63C',
                marginRight: '12px'
              }}>
                {item.goals}<span style={{ fontSize: '16px', marginLeft: '2px' }}>G</span>
              </div>
              <div className="rank-sub" style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: '12px',
                textAlign: 'right',
                color: mutedText,
                lineHeight: '1.4'
              }}>
                90分あたり<br />
                {item.goalsPer90.toFixed(2)}
              </div>
            </div>
          ))}
          {playerGoalRanking.length === 0 && (
            <div className="text-center py-8" style={{
              color: mutedText,
              fontFamily: 'IBM Plex Sans JP, sans-serif'
            }}>
              得点データがありません
            </div>
          )}
        </div>
      </div>

      {/* 選手ランキングセクション - アシスト */}
      <div className="ranking-section" style={cardStyle}>
        <div className="section-head flex justify-between items-start flex-wrap gap-4 mb-12" style={{
          borderBottom: `1px solid ${strongLineColor}`,
          paddingBottom: '8px',
          marginBottom: '8px'
        }}>
          <div className="flex items-baseline gap-4">
            <h2 style={{
              fontFamily: 'Oswald, sans-serif',
              fontWeight: 600,
              fontSize: '16px',
              letterSpacing: '0.02em'
            }}>
              選手ランキング — アシスト
            </h2>
          </div>
          <p style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: '11px',
            letterSpacing: '0.02em',
            color: mutedText,
            textAlign: 'right',
            marginLeft: 'auto'
          }}>
            シーズン通算アシスト数トップ5
          </p>
        </div>

        <div className="ranking-list" style={{
          borderTop: `1px solid ${lineColor}`
        }}>
          {playerAssistRanking.map((item) => (
            <div key={item.player.id} className="rank-row" style={{
              display: 'grid',
              gridTemplateColumns: '56px 1fr auto auto',
              alignItems: 'center',
              gap: '1px',
              padding: '20px 4px',
              borderBottom: `1px solid ${lineColor}`,
              transition: 'background 0.2s',
              cursor: 'pointer'
            }}>
              <div className="rank-index" style={{
                fontFamily: 'Anton, sans-serif',
                fontSize: '28px',
                color: '#D3A63C'
              }}>
                {String(item.rank).padStart(2, '0')}
              </div>
              <div>
                <div className="rank-name" style={{
                  fontFamily: 'Oswald, sans-serif',
                  fontWeight: 600,
                  fontSize: '15px'
                }}>
                  {item.player.name}
                </div>
                <div className="rank-pos" style={{
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: '11px',
                  letterSpacing: '0.08em',
                  color: mutedText
                }}>
                  {item.player.position || ''} {item.player.number ? `/ #${item.player.number}` : ''}
                </div>
              </div>
              <div className="rank-num" style={{
                fontFamily: 'Anton, sans-serif',
                fontSize: '28px',
                color: '#D3A63C',
                marginRight: '12px'
              }}>
                {item.assists}<span style={{ fontSize: '16px', marginLeft: '2px' }}>A</span>
              </div>
              <div className="rank-sub" style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: '12px',
                textAlign: 'right',
                color: mutedText,
                lineHeight: '1.4'
              }}>
                90分あたり<br />
                {item.assistsPer90.toFixed(2)}
              </div>
            </div>
          ))}
          {playerAssistRanking.length === 0 && (
            <div className="text-center py-8" style={{
              color: mutedText,
              fontFamily: 'IBM Plex Sans JP, sans-serif'
            }}>
              アシストデータがありません
            </div>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}
