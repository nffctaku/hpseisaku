// resolvePlayerMatchStats の出場・ベンチ判定と二重計上ガードの単体テスト。
// 実行: npx tsx --test src/lib/match-event-stats.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveEventPlayerCounts, resolvePlayerMatchStats } from './match-event-stats';

const emptyDerived = () => ({
  goals: new Map<string, number>(),
  assists: new Map<string, number>(),
  yellowCards: new Map<string, number>(),
  redCards: new Map<string, number>(),
  involved: new Set<string>(),
  played: new Set<string>(),
  teamIdByPlayer: new Map<string, string>(),
  subMinutes: new Map<string, number>(),
});

test('得点者だけ登録：得点が表示され、時間は「—」、ベンチ扱いにならない', () => {
  const events: any[] = [{ type: 'goal', minute: 15, teamId: 'T1', playerId: 'p1' }];
  const derived = deriveEventPlayerCounts(events, undefined, 90);
  const resolved = resolvePlayerMatchStats(null, derived, 'p1', 90);
  assert.equal(resolved.goals, 1);
  assert.equal(resolved.assists, 0);
  assert.equal(resolved.played, true);
  assert.equal(resolved.isBench, false);
  assert.equal(resolved.minutesPlayed, null);
});

test('アシストだけ登録：アシストが表示される', () => {
  const events: any[] = [{ type: 'goal', minute: 15, teamId: 'T1', playerId: 'p2', assistPlayerId: 'p1' }];
  const derived = deriveEventPlayerCounts(events, undefined, 90);
  const resolved = resolvePlayerMatchStats(null, derived, 'p1', 90);
  assert.equal(resolved.goals, 0);
  assert.equal(resolved.assists, 1);
  assert.equal(resolved.played, true);
  assert.equal(resolved.isBench, false);
  assert.equal(resolved.minutesPlayed, null);
});

test('カードのみ登録：出場数を勝手に増やさない', () => {
  const events: any[] = [{ type: 'card', minute: 40, teamId: 'T1', playerId: 'p1', cardColor: 'yellow' }];
  const derived = deriveEventPlayerCounts(events, undefined, 90);
  const resolved = resolvePlayerMatchStats({ playerId: 'p1', teamId: 'T1', role: 'sub', minutesPlayed: 0 }, derived, 'p1', 90);
  assert.equal(resolved.yellowCards, 1);
  assert.equal(resolved.played, false);
  assert.equal(resolved.isBench, true);
});

test('ラインナップとイベントの両方あり：得点・アシストが二重計上されない', () => {
  const events: any[] = [
    { type: 'goal', minute: 15, teamId: 'T1', playerId: 'p1', assistPlayerId: 'p2' },
  ];
  const derived = deriveEventPlayerCounts(events, undefined, 90);
  const stat = { playerId: 'p1', teamId: 'T1', role: 'starter', minutesPlayed: 90, goals: 1, assists: 0 };
  const resolved = resolvePlayerMatchStats(stat, derived, 'p1', 90);
  assert.equal(resolved.goals, 1);
  assert.equal(resolved.assists, 0);
  const assistStat = { playerId: 'p2', teamId: 'T1', role: 'starter', minutesPlayed: 90, goals: 0, assists: 1 };
  const resolved2 = resolvePlayerMatchStats(assistStat, derived, 'p2', 90);
  assert.equal(resolved2.assists, 1);
  assert.equal(resolved2.goals, 0);
});

test('途中出場で0分：ベンチ扱いにならない', () => {
  const events: any[] = [
    { type: 'substitution', minute: 90, teamId: 'T1', inPlayerId: 'p1', outPlayerId: 'p2' },
  ];
  const derived = deriveEventPlayerCounts(events, undefined, 90);
  const resolved = resolvePlayerMatchStats({ playerId: 'p1', teamId: 'T1', role: 'sub', minutesPlayed: 0 }, derived, 'p1', 90);
  assert.equal(resolved.played, true);
  assert.equal(resolved.isBench, false);
  assert.notEqual(resolved.minutesPlayed, 0); // 記録上0分でも出場イベントあり→0分として表示しない
});

test('イベント編集・削除：数値が正しく更新される', () => {
  // 初回：1ゴール
  const events: any[] = [{ type: 'goal', minute: 15, teamId: 'T1', playerId: 'p1' }];
  let derived = deriveEventPlayerCounts(events, undefined, 90);
  let resolved = resolvePlayerMatchStats(null, derived, 'p1', 90);
  assert.equal(resolved.goals, 1);

  // 編集：2ゴール
  const editedEvents: any[] = [
    { type: 'goal', minute: 15, teamId: 'T1', playerId: 'p1' },
    { type: 'goal', minute: 30, teamId: 'T1', playerId: 'p1' },
  ];
  derived = deriveEventPlayerCounts(editedEvents, undefined, 90);
  resolved = resolvePlayerMatchStats(null, derived, 'p1', 90);
  assert.equal(resolved.goals, 2);

  // 削除：0ゴール
  derived = deriveEventPlayerCounts([], undefined, 90);
  resolved = resolvePlayerMatchStats(null, derived, 'p1', 90);
  assert.equal(resolved.goals, 0);
});

test('選手一覧とプロフィールで同じ記録・集計になる', () => {
  // 両方とも resolvePlayerMatchStats を使用するため、同じ入力で同じ結果になる
  const stat = { playerId: 'p1', teamId: 'T1', role: 'starter', minutesPlayed: 90, goals: 1, assists: 0 };
  const events: any[] = [{ type: 'goal', minute: 15, teamId: 'T1', playerId: 'p1', assistPlayerId: 'p2' }];
  const derived = deriveEventPlayerCounts(events, undefined, 90);
  const resolvedP1 = resolvePlayerMatchStats(stat, derived, 'p1', 90);
  assert.equal(resolvedP1.goals, 1);
  assert.equal(resolvedP1.minutesPlayed, 90);
  assert.equal(resolvedP1.played, true);
  const resolvedP2 = resolvePlayerMatchStats(null, derived, 'p2', 90);
  assert.equal(resolvedP2.assists, 1);
  assert.equal(resolvedP2.minutesPlayed, null);
  assert.equal(resolvedP2.played, true);
});
