import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isGoalEvent,
  getGoalEvents,
  formatGoalScorersText,
  isPenaltyEvent,
  resolveScorerName,
  resolveEventPlayerName,
  goalEventSuffix,
} from './match-scorers';
import { minuteSortValue } from './match-minutes';
import type { MatchEvent } from '@/types/match';

const ev = (partial: Partial<MatchEvent>): MatchEvent => ({
  id: partial.id || Math.random().toString(36).slice(2),
  type: partial.type || 'goal',
  minute: partial.minute ?? 0,
  teamId: partial.teamId || 'home',
  ...partial,
});

describe('PK区別と得点集計', () => {
  it('type=goal + goalKind=penalty は得点にカウントされる', () => {
    const e = ev({ type: 'goal', goalKind: 'penalty', minute: 71, playerName: 'M. Gibbs-White' });
    assert.equal(isGoalEvent(e), true);
  });

  it('type=pk_miss は得点にカウントされない', () => {
    const e = ev({ type: 'pk_miss', minute: 24, playerName: 'M. Gibbs-White' });
    assert.equal(isGoalEvent(e), false);
  });

  it('通常ゴールはカウントされる', () => {
    assert.equal(isGoalEvent(ev({ type: 'goal' })), true);
  });

  it('pk_missを混ぜてもゴールイベントのみ抽出される', () => {
    const events = [
      ev({ type: 'pk_miss', minute: 24, playerName: 'A' }),
      ev({ type: 'goal', minute: 30, playerName: 'B' }),
      ev({ type: 'goal', goalKind: 'penalty', minute: 71, playerName: 'A' }),
      ev({ type: 'card', cardColor: 'yellow', minute: 50 }),
    ];
    const goals = getGoalEvents(events);
    assert.equal(goals.length, 2);
    assert.equal(goals[0].minute, 30);
    assert.equal(goals[1].minute, 71);
  });
});

describe('旧PK(name)形式の互換', () => {
  it('playerName=PK(...)でtype=goalの旧データは得点にカウントされる', () => {
    const e = ev({ type: 'goal', minute: 55, playerName: 'PK(田中 太郎)' });
    assert.equal(isGoalEvent(e), true);
  });

  it('旧type=pk形式も得点にカウントされる', () => {
    const e = ev({ type: 'pk' as MatchEvent['type'], minute: 55, playerName: 'A' });
    assert.equal(isGoalEvent(e), true);
    assert.equal(isPenaltyEvent(e), true);
  });
});

describe('minute文字列（アディショナルタイム）', () => {
  it('45+2 は数値より後にソートされる', () => {
    const events = [
      ev({ type: 'goal', minute: 50 }),
      ev({ type: 'goal', minute: '45+2' }),
      ev({ type: 'goal', minute: 10 }),
    ];
    const sorted = getGoalEvents(events);
    assert.deepEqual(sorted.map((e) => e.minute), [10, '45+2', 50]);
  });

  it('minuteSortValue: "45+2" > "45+1" > 45', () => {
    assert.ok(minuteSortValue('45+2') > minuteSortValue('45+1'));
    assert.ok(minuteSortValue('45+1') > minuteSortValue(45));
  });

  it('90+3 は120分延長として扱われない（base=90 < 91）', () => {
    // minuteSortValueはソート用で、延長判定は baseMinute>90 とは別。
    // ここではソート値が90台であることだけ確認。
    assert.ok(minuteSortValue('90+3') > 90);
    assert.ok(minuteSortValue('90+3') < 91);
  });

  it('formatGoalScorersTextが文字列minuteをそのまま表示する', () => {
    const text = formatGoalScorersText([ev({ type: 'goal', minute: '45+2', playerName: 'A' })]);
    assert.match(text, /45\+2'/);
  });
});

describe('pk_missが個人成績の得点に混入しない', () => {
  it('goalKind=penaltyのgoalとpk_missで集計が分離される', () => {
    const events = [
      ev({ type: 'goal', goalKind: 'penalty', minute: 71, playerId: 'p1', playerName: 'A' }),
      ev({ type: 'pk_miss', minute: 24, playerId: 'p1', playerName: 'A' }),
    ];
    const goals = getGoalEvents(events).filter((e) => e.playerId === 'p1');
    assert.equal(goals.length, 1);
    assert.equal(goals[0].minute, 71);
  });
});

describe('resolveScorerName（スコア下の得点者名）', () => {
  const lookup = (pid: string) => ({ p1: 'Bryan Mbeumo', p2: 'Bruno Fernandes' }[pid]);

  it('紐付き選手は登録名を優先する', () => {
    assert.equal(resolveScorerName({ playerId: 'p1', playerName: 'B. Mbeumo' }, lookup), 'Bryan Mbeumo');
  });

  it('未紐付け（playerIdなし）は保存されたplayerNameを表示する', () => {
    assert.equal(resolveScorerName({ playerName: 'B. Šeško' }, lookup), 'B. Šeško');
    assert.equal(resolveScorerName({ playerName: 'M. Rashford' }), 'M. Rashford');
  });

  it('playerIdはあるが登録名を解決できない場合もplayerNameにフォールバック', () => {
    assert.equal(resolveScorerName({ playerId: 'pX', playerName: 'M. Ugarte' }, lookup), 'M. Ugarte');
  });

  it('どちらもない場合だけ空欄', () => {
    assert.equal(resolveScorerName({}, lookup), '');
    assert.equal(resolveScorerName({ playerId: 'pX' }, lookup), '');
  });
});

describe('goalEventSuffix（PK/OG末尾表記）', () => {
  it('goalKind=penalty のゴールは（PK）を付ける', () => {
    assert.equal(goalEventSuffix(ev({ type: 'goal', goalKind: 'penalty' })), '（PK）');
  });
  it('通常ゴールはsuffixなし', () => {
    assert.equal(goalEventSuffix(ev({ type: 'goal', goalKind: 'open' })), '');
  });
  it('OGは（OG）を付ける', () => {
    assert.equal(goalEventSuffix(ev({ type: 'og' as MatchEvent['type'] })), '（OG）');
    assert.equal(goalEventSuffix(ev({ type: 'goal', goalKind: 'own_goal' })), '（OG）');
  });
  it('pk_missは得点者一覧に出ない（表示・集計とも除外）', () => {
    const goals = getGoalEvents([ev({ type: 'pk_miss', minute: 24, playerName: 'M. Gibbs-White' })]);
    assert.equal(goals.length, 0);
  });
});

describe('resolveEventPlayerName（イベント一覧の名前フォールバック）', () => {
  const lookup = (pid: string) => ({ p1: 'Bryan Mbeumo', p2: 'Bruno Fernandes' }[pid]);

  it('ゴール: 紐付きは登録名、未紐付けは保存名、両方なしは空', () => {
    assert.equal(resolveEventPlayerName('p1', 'B. Mbeumo', lookup), 'Bryan Mbeumo');
    assert.equal(resolveEventPlayerName(undefined, 'B. Šeško', lookup), 'B. Šeško');
    assert.equal(resolveEventPlayerName(undefined, undefined, lookup), undefined);
  });

  it('交代OUT/IN: IDなしでも保存名を表示', () => {
    assert.equal(resolveEventPlayerName(undefined, 'M. Cunha', lookup), 'M. Cunha');
    assert.equal(resolveEventPlayerName('p2', 'B. Fernandes', lookup), 'Bruno Fernandes');
  });

  it('カード: IDなしでも保存名を表示', () => {
    assert.equal(resolveEventPlayerName(undefined, 'M. Ugarte', lookup), 'M. Ugarte');
  });

  it('custom_プレフィックスIDは保存名をそのまま使う', () => {
    assert.equal(resolveEventPlayerName('custom_123', 'Free Input', lookup), 'Free Input');
  });

  it('登録名を解決できないIDは保存名にフォールバック', () => {
    assert.equal(resolveEventPlayerName('pX', 'Saved Name', lookup), 'Saved Name');
  });
});
