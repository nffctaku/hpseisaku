import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMatchViews,
  determineResult,
  baseMinute,
  computeOverviewStats,
  computeMatchStats,
  computeGoalAnalysis,
  computePlayerRanking,
  computeMonthlyStats,
} from './dashboard-stats';
import type { SheetMatchRow, SheetCompetition } from './match-sheet';
import type { MatchEvent } from '@/types/match';

const selfTeamId = 'my-team';
const oppTeamId = 'opp-team';
const selfClubUid = 'club-123';

function mkRow(fields: Partial<SheetMatchRow> & { matchDate?: string }): SheetMatchRow {
  return {
    key: fields.key ?? 'k1',
    matchId: fields.matchId ?? 'm1',
    competitionId: fields.competitionId ?? 'comp1',
    roundId: fields.roundId ?? 'r1',
    competitionName: '大会',
    roundName: '第1節',
    matchDate: fields.matchDate ?? '2030-09-01',
    homeTeam: fields.homeTeam ?? selfTeamId,
    awayTeam: fields.awayTeam ?? oppTeamId,
    scoreHome: fields.scoreHome ?? null,
    scoreAway: fields.scoreAway ?? null,
    pkScoreHome: fields.pkScoreHome ?? null,
    pkScoreAway: fields.pkScoreAway ?? null,
    events: fields.events ?? [],
  } as SheetMatchRow;
}

const leagueComp: SheetCompetition = { id: 'comp1', name: 'リーグ', season: '2030-31', format: 'league' };
const cupComp: SheetCompetition = { id: 'comp2', name: 'カップ', season: '2030-31', format: 'cup' };

const selfIds = [selfTeamId, selfClubUid];

function mkGoal(minute: number | string, playerId: string, kind: 'open' | 'penalty' | 'own_goal' = 'open'): MatchEvent {
  return { id: `g-${playerId}-${minute}`, type: 'goal', minute, teamId: selfTeamId, playerId, goalKind: kind };
}

function mkOppOwnGoal(minute: number | string, playerId: string): MatchEvent {
  return { id: `og-${minute}`, type: 'goal', minute, teamId: oppTeamId, playerId, goalKind: 'own_goal' };
}

describe('determineResult', () => {
  it('得失点のみで勝敗', () => {
    assert.equal(determineResult(2, 0, null, null), 'W');
    assert.equal(determineResult(0, 2, null, null), 'L');
    assert.equal(determineResult(1, 1, null, null), 'D');
  });

  it('PKあり', () => {
    assert.equal(determineResult(1, 1, 5, 4), 'W');
    assert.equal(determineResult(1, 1, 3, 4), 'L');
    assert.equal(determineResult(1, 1, 4, 4), 'D');
  });
});

describe('baseMinute', () => {
  it('通常分', () => {
    assert.equal(baseMinute(12), 12);
    assert.equal(baseMinute(45), 45);
    assert.equal(baseMinute(90), 90);
  });
  it('アディショナルタイム', () => {
    assert.equal(baseMinute('45+2'), 45);
    assert.equal(baseMinute('90+3'), 90);
  });
});

describe('buildMatchViews', () => {
  it('アウェイで0-2なら勝利', () => {
    const rows = [mkRow({ homeTeam: oppTeamId, awayTeam: selfTeamId, scoreHome: 0, scoreAway: 2 })];
    const views = buildMatchViews(rows, [leagueComp], selfIds);
    assert.equal(views[0].isHome, false);
    assert.equal(views[0].selfScore, 2);
    assert.equal(views[0].oppScore, 0);
    assert.equal(views[0].result, 'W');
  });

  it('ホームで0-2なら敗北', () => {
    const rows = [mkRow({ homeTeam: selfTeamId, awayTeam: oppTeamId, scoreHome: 0, scoreAway: 2 })];
    const views = buildMatchViews(rows, [leagueComp], selfIds);
    assert.equal(views[0].isHome, true);
    assert.equal(views[0].result, 'L');
  });
});

describe('computeOverviewStats', () => {
  it('基本成績と勝点', () => {
    const rows: SheetMatchRow[] = [
      mkRow({ matchDate: '2030-09-01', scoreHome: 2, scoreAway: 0, homeTeam: selfTeamId, awayTeam: oppTeamId, competitionId: 'comp1' }),
      mkRow({ matchDate: '2030-09-05', scoreHome: 1, scoreAway: 1, homeTeam: selfTeamId, awayTeam: oppTeamId, competitionId: 'comp1' }),
      mkRow({ matchDate: '2030-09-10', scoreHome: 0, scoreAway: 2, homeTeam: selfTeamId, awayTeam: oppTeamId, competitionId: 'comp2' }),
    ];
    const views = buildMatchViews(rows, [leagueComp, cupComp], selfIds);
    const stats = computeOverviewStats(views);
    assert.equal(stats.matches, 3);
    assert.equal(stats.wins, 1);
    assert.equal(stats.draws, 1);
    assert.equal(stats.losses, 1);
    assert.equal(stats.leaguePoints, 4); // 3 + 1
    assert.equal(stats.goalsFor, 3);
    assert.equal(stats.goalsAgainst, 3);
    assert.equal(stats.cleanSheets, 1);
  });
});

describe('computeMatchStats', () => {
  it('H/A分析', () => {
    const rows: SheetMatchRow[] = [
      mkRow({ matchDate: '2030-09-01', scoreHome: 2, scoreAway: 0, homeTeam: selfTeamId, awayTeam: oppTeamId }),
      mkRow({ matchDate: '2030-09-05', scoreHome: 1, scoreAway: 2, homeTeam: oppTeamId, awayTeam: selfTeamId }),
    ];
    const stats = computeMatchStats(buildMatchViews(rows, [leagueComp], selfIds));
    const away = stats.homeAway.find((r) => r.location === 'away')!;
    assert.equal(away.matches, 1);
    assert.equal(away.wins, 1);
    assert.equal(away.goalsFor, 2);
    assert.equal(away.goalsAgainst, 1);
  });

  it('連勝・連敗', () => {
    const rows: SheetMatchRow[] = [
      mkRow({ matchDate: '2030-09-01', scoreHome: 2, scoreAway: 0, homeTeam: selfTeamId, matchId: 'a' }),
      mkRow({ matchDate: '2030-09-02', scoreHome: 2, scoreAway: 0, homeTeam: selfTeamId, matchId: 'b' }),
      mkRow({ matchDate: '2030-09-03', scoreHome: 0, scoreAway: 2, homeTeam: selfTeamId, matchId: 'c' }),
      mkRow({ matchDate: '2030-09-04', scoreHome: 0, scoreAway: 2, homeTeam: selfTeamId, matchId: 'd' }),
      mkRow({ matchDate: '2030-09-05', scoreHome: 0, scoreAway: 0, homeTeam: selfTeamId, matchId: 'e' }),
      mkRow({ matchDate: '2030-09-06', scoreHome: 3, scoreAway: 0, homeTeam: selfTeamId, matchId: 'f' }),
    ];
    const stats = computeMatchStats(buildMatchViews(rows, [leagueComp], selfIds));
    assert.equal(stats.streaks.longestWinStreak, 2);
    assert.equal(stats.streaks.longestLossStreak, 2);
  });
});

describe('computeGoalAnalysis', () => {
  it('前半・後半バケツ', () => {
    const rows: SheetMatchRow[] = [
      mkRow({
        scoreHome: 3,
        scoreAway: 1,
        homeTeam: selfTeamId,
        events: [mkGoal(10, 'p1'), mkGoal(32, 'p1'), mkGoal(78, 'p1')],
      }),
      mkRow({
        scoreHome: 2,
        scoreAway: 1,
        homeTeam: oppTeamId,
        awayTeam: selfTeamId,
        events: [mkOppOwnGoal(88, 'opp1')],
      }),
    ];
    const views = buildMatchViews(rows, [leagueComp], selfIds);
    const a = computeGoalAnalysis(views);
    assert.equal(a.buckets['1-15'], 1);
    assert.equal(a.buckets['31-45'], 1);
    assert.equal(a.buckets['76-90+'], 2); // 78 + OG 88
    assert.equal(a.firstHalfGoals, 2);
    assert.equal(a.secondHalfGoals, 2);
    assert.equal(a.unregisteredGoals, 0);
  });
});

describe('computePlayerRanking', () => {
  it('通常得点を計上し、オウンゴールを除外', () => {
    const rows: SheetMatchRow[] = [
      mkRow({
        scoreHome: 2,
        scoreAway: 0,
        homeTeam: selfTeamId,
        events: [mkGoal(10, 'p1', 'open'), mkGoal(20, 'p2'), { id: 'og', type: 'goal', minute: 30, teamId: selfTeamId, playerId: 'p1', goalKind: 'own_goal' }],
      }),
    ];
    const views = buildMatchViews(rows, [leagueComp], selfIds);
    const ranking = computePlayerRanking(views, [
      { id: 'p1', name: 'Player 1' },
      { id: 'p2', name: 'Player 2' },
    ]);
    assert.equal(ranking.length, 2);
    const p1 = ranking.find((r) => r.playerId === 'p1')!;
    assert.equal(p1.goals, 1); // オウンゴールを除外
    const p2 = ranking.find((r) => r.playerId === 'p2')!;
    assert.equal(p2.goals, 1);
  });
});

describe('computeMonthlyStats', () => {
  it('月別集計', () => {
    const rows: SheetMatchRow[] = [
      mkRow({ matchDate: '2030-09-01', scoreHome: 2, scoreAway: 0, homeTeam: selfTeamId, matchId: 'a' }),
      mkRow({ matchDate: '2030-09-15', scoreHome: 1, scoreAway: 1, homeTeam: selfTeamId, matchId: 'b' }),
      mkRow({ matchDate: '2030-10-01', scoreHome: 0, scoreAway: 2, homeTeam: selfTeamId, matchId: 'c' }),
    ];
    const result = computeMonthlyStats(buildMatchViews(rows, [leagueComp], selfIds));
    assert.equal(result.months.length, 2);
    const sep = result.months.find((m) => m.month === '2030-09')!;
    assert.equal(sep.matches, 2);
    assert.equal(sep.wins, 1);
    assert.equal(sep.draws, 1);
    assert.equal(sep.goalsFor, 3);
  });
});
