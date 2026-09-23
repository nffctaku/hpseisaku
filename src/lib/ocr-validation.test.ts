import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isUsableResult,
  sanitizeRatingsResult,
  sanitizeEventsResult,
  isAllowedImageType,
  isValidBase64Image,
  scoreIsValid,
} from './ocr-validation';
import type {
  RatingsImageAnalysisResult,
  EventsImageAnalysisResult,
} from './stats-image-parser';

describe('isUsableResult', () => {
  describe('team_stats', () => {
    it('スコアだけ読めた場合はusable', () => {
      assert.equal(
        isUsableResult(
          {
            match: { home_team: 'A', away_team: 'B', score_home: 2, score_away: 1 },
            team_stats: {},
            percentage_stats: {},
          },
          'team_stats'
        ),
        true
      );
    });

    it('片側だけ読めたチームスタッツもusable', () => {
      assert.equal(
        isUsableResult(
          {
            match: { home_team: null, away_team: null, score_home: null, score_away: null },
            team_stats: { shots: { home: 10, away: null } },
            percentage_stats: {},
          },
          'team_stats'
        ),
        true
      );
    });

    it('空のチームスタッツはusableでない', () => {
      assert.equal(
        isUsableResult(
          {
            match: { home_team: null, away_team: null, score_home: null, score_away: null },
            team_stats: { shots: { home: null, away: null } },
            percentage_stats: {},
          },
          'team_stats'
        ),
        false
      );
    });
  });

  describe('ratings', () => {
    it('名前+評価点が読めればusable（照合待ちでも可）', () => {
      assert.equal(
        isUsableResult(
          {
            kind: 'ratings',
            match: { home_team: null, away_team: null, score_home: null, score_away: null },
            players: [{ name: 'M. Gibbs-White', rating: 7.5, goals: null, assists: null, team_side: 'home' }],
          },
          'ratings'
        ),
        true
      );
    });

    it('評価点がnull（N/A）だけの選手はusableでない', () => {
      assert.equal(
        isUsableResult(
          {
            kind: 'ratings',
            match: { home_team: null, away_team: null, score_home: null, score_away: null },
            players: [{ name: 'X', rating: null, goals: null, assists: null, team_side: null }],
          },
          'ratings'
        ),
        false
      );
    });

    it('空配列はusableでない', () => {
      assert.equal(
        isUsableResult({ kind: 'ratings', match: {}, players: [] }, 'ratings'),
        false
      );
    });
  });

  describe('events', () => {
    it('時刻+種別が読めれば選手未入力でもusable', () => {
      assert.equal(
        isUsableResult(
          {
            kind: 'events',
            match: { home_team: null, away_team: null, score_home: null, score_away: null },
            events: [
              { minute: 24, type: 'pk_miss', team_side: null, player_name: null, out_player_name: null, in_player_name: null, assist_name: null },
            ],
          },
          'events'
        ),
        true
      );
    });

    it('unknownでもminute+選手名があればusable（要確認イベント）', () => {
      assert.equal(
        isUsableResult(
          {
            kind: 'events',
            match: { home_team: null, away_team: null, score_home: null, score_away: null },
            events: [
              { minute: '45+2', type: 'unknown', team_side: null, player_name: 'K. Sato', out_player_name: null, in_player_name: null, assist_name: null },
            ],
          },
          'events'
        ),
        true
      );
    });

    it('unknownだけでminuteも選手名もない場合はusableでない', () => {
      assert.equal(
        isUsableResult(
          {
            kind: 'events',
            match: { home_team: null, away_team: null, score_home: null, score_away: null },
            events: [
              { minute: null, type: 'unknown', team_side: null, player_name: null, out_player_name: null, in_player_name: null, assist_name: null },
            ],
          },
          'events'
        ),
        false
      );
    });
  });

  describe('対象外入力', () => {
    it('null/空オブジェクト/説明文はusableでない', () => {
      assert.equal(isUsableResult(null, 'events'), false);
      assert.equal(isUsableResult({}, 'events'), false);
      assert.equal(isUsableResult({ text: 'この画像は読み取れません' }, 'events'), false);
      assert.equal(isUsableResult({ kind: 'events', events: null }, 'events'), false);
    });

    it('全nullのmatch+eventsはusableでない', () => {
      assert.equal(
        isUsableResult(
          {
            kind: 'events',
            match: { home_team: null, away_team: null, score_home: null, score_away: null },
            events: [],
          },
          'events'
        ),
        false
      );
    });
  });
});

describe('sanitizeRatingsResult', () => {
  it('不正な行を除去し数値を正規化する', () => {
    const input = {
      kind: 'ratings',
      match: { home_team: 'A', away_team: 'B', score_home: 1, score_away: 0 },
      players: [
        { name: 'M. Gibbs-White', rating: 7.5, goals: 1, assists: 0, team_side: 'home' },
        { name: '', rating: 8, goals: null, assists: null, team_side: 'home' }, // 名前空→除去
        { name: 'X', rating: 99, goals: null, assists: null, team_side: 'home' }, // rating範囲外→null
        { name: 'Y', rating: 'high', goals: null, assists: null, team_side: 'middle' }, // 型不正→null/null
      ],
    } as unknown as RatingsImageAnalysisResult;

    const out = sanitizeRatingsResult(input);
    assert.equal(out.players.length, 3);
    assert.equal(out.players[0].rating, 7.5);
    assert.equal(out.players[1].rating, null);
    assert.equal(out.players[2].rating, null);
    assert.equal(out.players[2].team_side, null);
  });
});

describe('sanitizeEventsResult', () => {
  it('PK失敗がpk_missとして保持される', () => {
    const input = {
      kind: 'events',
      match: { home_team: null, away_team: null, score_home: null, score_away: null },
      events: [
        { minute: 24, type: 'pk_miss', team_side: 'home', player_name: 'M. Gibbs-White', out_player_name: null, in_player_name: null, assist_name: null },
        { minute: 71, type: 'pk_success', team_side: 'home', player_name: 'M. Gibbs-White', out_player_name: null, in_player_name: null, assist_name: null },
      ],
    } as unknown as EventsImageAnalysisResult;

    const out = sanitizeEventsResult(input);
    assert.equal(out.events[0].type, 'pk_miss');
    assert.equal(out.events[1].type, 'pk_success');
  });

  it('不正な種別はunknownに正規化される', () => {
    const input = {
      kind: 'events',
      match: { home_team: null, away_team: null, score_home: null, score_away: null },
      events: [
        { minute: 10, type: 'hack', team_side: 'home', player_name: 'A', out_player_name: null, in_player_name: null, assist_name: null },
      ],
    } as unknown as EventsImageAnalysisResult;

    const out = sanitizeEventsResult(input);
    assert.equal(out.events[0].type, 'unknown');
  });

  it('不正なminuteはnullに正規化される', () => {
    const input = {
      kind: 'events',
      match: { home_team: null, away_team: null, score_home: null, score_away: null },
      events: [
        { minute: 'abc', type: 'goal', team_side: 'home', player_name: 'A', out_player_name: null, in_player_name: null, assist_name: null },
        { minute: 999, type: 'goal', team_side: 'home', player_name: 'B', out_player_name: null, in_player_name: null, assist_name: null },
        { minute: '45+2', type: 'goal', team_side: 'home', player_name: 'C', out_player_name: null, in_player_name: null, assist_name: null },
      ],
    } as unknown as EventsImageAnalysisResult;

    const out = sanitizeEventsResult(input);
    assert.equal(out.events[0].minute, null);
    assert.equal(out.events[1].minute, null);
    assert.equal(out.events[2].minute, '45+2');
  });
});

describe('isAllowedImageType / isValidBase64Image / scoreIsValid', () => {
  it('対応MIMEのみ許可する', () => {
    assert.equal(isAllowedImageType('image/jpeg'), true);
    assert.equal(isAllowedImageType('image/png'), true);
    assert.equal(isAllowedImageType('image/webp'), true);
    assert.equal(isAllowedImageType('application/pdf'), false);
    assert.equal(isAllowedImageType('text/html'), false);
  });

  it('base64の基本妥当性を検証する', () => {
    assert.equal(isValidBase64Image(''), false);
    assert.equal(isValidBase64Image('aGVsbG8gd29ybGQ='), true);
    assert.equal(isValidBase64Image('!@#$%^&*()'), false);
  });

  it('スコア範囲を検証する', () => {
    assert.equal(scoreIsValid(0, 0), true);
    assert.equal(scoreIsValid(15, 3), true);
    assert.equal(scoreIsValid(-1, 0), false);
    assert.equal(scoreIsValid(100, 0), false);
    assert.equal(scoreIsValid(1.5, 0), false);
    assert.equal(scoreIsValid('2', 0), false);
  });
});
