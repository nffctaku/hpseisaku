// ロール変更時の minutesPlayed 再導出・イベント参照ガード・不整合検出の単体テスト。
// 実行: npx tsx --test src/lib/match-minutes-role.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recomputeRoleChangedMinutes, findInconsistentSubEvents } from './match-minutes';
import { playerReferencedByEvents } from './match-event-stats';

const events: any[] = [
  { type: 'goal', minute: 21, teamId: 'T1', playerId: 'p-goal' },
  { type: 'goal', minute: 30, teamId: 'T1', playerId: 'p-x', assistPlayerId: 'p-asst' },
  { type: 'card', minute: 40, teamId: 'T1', playerId: 'p-card', cardColor: 'yellow' },
  { type: 'substitution', minute: 65, teamId: 'T1', outPlayerId: 'p-out', inPlayerId: 'p-in' },
];

test('playerReferencedByEvents: 全参照フィールドを検出', () => {
  assert.equal(playerReferencedByEvents(events, 'p-goal'), true);
  assert.equal(playerReferencedByEvents(events, 'p-asst'), true);
  assert.equal(playerReferencedByEvents(events, 'p-card'), true);
  assert.equal(playerReferencedByEvents(events, 'p-out'), true);
  assert.equal(playerReferencedByEvents(events, 'p-in'), true);
  assert.equal(playerReferencedByEvents(events, 'p-none'), false);
  assert.equal(playerReferencedByEvents(events, ''), false);
  assert.equal(playerReferencedByEvents(null, 'p-goal'), false);
  // PKのoriginalPlayerIdも参照とみなす
  const pk = [{ type: 'goal', minute: 10, teamId: 'T1', playerId: 'custom_1', playerName: 'PK(A)', originalPlayerId: 'p-pk' }];
  assert.equal(playerReferencedByEvents(pk, 'p-pk'), true);
  assert.equal(playerReferencedByEvents(pk, 'custom_1'), true);
});

test('recomputeRoleChangedMinutes: 整合イベント由来値を優先、矛盾は既定値', () => {
  const prevRole = new Map([
    ['p-out', 'starter'],   // starter→sub: OUTイベントあり→不整合→0
    ['p-in', 'sub'],        // sub→starter: INイベントあり→不整合→90
    ['p-x', 'starter'],     // starter→sub: 交代イベントなし→0
    ['p-y', 'sub'],         // sub→starter: 交代イベントなし→90
    ['p-z', 'sub'],         // ロール不変→値保持
  ]);
  const stats = [
    { playerId: 'p-out', teamId: 'T1', role: 'sub', minutesPlayed: 65 },
    { playerId: 'p-in', teamId: 'T1', role: 'starter', minutesPlayed: 25 },
    { playerId: 'p-x', teamId: 'T1', role: 'sub', minutesPlayed: 90 },
    { playerId: 'p-y', teamId: 'T1', role: 'starter', minutesPlayed: 0 },
    { playerId: 'p-z', teamId: 'T1', role: 'sub', minutesPlayed: 33 }, // 手入力値保持
  ];
  const out = recomputeRoleChangedMinutes(stats, events, 'T1', 90, prevRole);
  assert.equal(out[0].minutesPlayed, 0);   // starter→sub、OUTイベントは不整合→既定0
  assert.equal(out[1].minutesPlayed, 90);  // sub→starter、INイベントは不整合→既定90
  assert.equal(out[2].minutesPlayed, 0);   // イベントなし→sub既定0
  assert.equal(out[3].minutesPlayed, 90);  // イベントなし→starter既定90
  assert.equal(out[4].minutesPlayed, 33);  // ロール不変→保持
});

test('recomputeRoleChangedMinutes: 整合方向はイベント由来値を採用', () => {
  const prevRole = new Map([
    ['p-out', 'sub'],   // sub→starter: OUTイベントと整合→65
    ['p-in', 'starter'], // starter→sub: INイベントと整合→25
  ]);
  const stats = [
    { playerId: 'p-out', teamId: 'T1', role: 'starter', minutesPlayed: 0 },
    { playerId: 'p-in', teamId: 'T1', role: 'sub', minutesPlayed: 90 },
  ];
  const out = recomputeRoleChangedMinutes(stats, events, 'T1', 90, prevRole);
  assert.equal(out[0].minutesPlayed, 65); // OUT 65' → 65分
  assert.equal(out[1].minutesPlayed, 25); // IN 65' → 90-65=25分
});

test('findInconsistentSubEvents: 新ロールと矛盾する交代イベントを検出', () => {
  // starter に IN イベント → 矛盾
  const a = findInconsistentSubEvents(events, 'p-in', 'starter');
  assert.equal(a.length, 1);
  assert.equal(a[0].direction, 'in');
  assert.equal(a[0].minute, 65);
  // sub に OUT イベント → 矛盾
  const b = findInconsistentSubEvents(events, 'p-out', 'sub');
  assert.equal(b.length, 1);
  assert.equal(b[0].direction, 'out');
  // 整合方向は検出しない
  assert.equal(findInconsistentSubEvents(events, 'p-out', 'starter').length, 0);
  assert.equal(findInconsistentSubEvents(events, 'p-in', 'sub').length, 0);
  assert.equal(findInconsistentSubEvents(events, 'p-x', 'starter').length, 0);
});
