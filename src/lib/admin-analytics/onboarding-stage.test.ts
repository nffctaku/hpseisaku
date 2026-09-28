import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateUserStage,
  ageBucket,
  playerBucket,
  type UserStageInput,
} from './onboarding-stage';

const base: UserStageInput = {
  hasCareerDoc: false,
  hasProfileDoc: false,
  careers: [],
  legacyRoot: null,
  resultMatchCount: 0,
  scheduledMatchCount: 0,
};

test('no_initial_data: Career/profile/データなし', () => {
  const r = evaluateUserStage(base);
  assert.equal(r.stage, 'no_initial_data');
});

test('no_initial_data: usersドキュメントのみ（初期データ扱いしない）', () => {
  const r = evaluateUserStage({ ...base });
  assert.equal(r.stage, 'no_initial_data');
});

test('no_own_team: profileのみ', () => {
  const r = evaluateUserStage({ ...base, hasProfileDoc: true });
  assert.equal(r.stage, 'no_own_team');
});

test('no_own_team: Careerのみ（中身空）', () => {
  const r = evaluateUserStage({
    ...base,
    hasCareerDoc: true,
    careers: [{ careerId: 'c1', name: 'C1', clubUid: 'u1', status: 'active', ownTeamCount: 0, playerCount: 0 }],
  });
  assert.equal(r.stage, 'no_own_team');
  assert.equal(r.usedCareerId, 'c1');
  assert.equal(r.hasTeam, false);
});

test('no_players: 自チームあり・選手0', () => {
  const r = evaluateUserStage({
    ...base,
    hasCareerDoc: true,
    careers: [{ careerId: 'c1', name: 'C1', clubUid: 'u1', status: 'active', ownTeamCount: 2, playerCount: 0 }],
  });
  assert.equal(r.stage, 'no_players');
  assert.equal(r.hasTeam, true);
  assert.equal(r.stagePlayerCount, 0);
});

test('no_match_result: 選手あり・結果0・日程のみ1', () => {
  const r = evaluateUserStage({
    ...base,
    hasCareerDoc: true,
    careers: [{ careerId: 'c1', name: 'C1', clubUid: 'u1', status: 'active', ownTeamCount: 1, playerCount: 11 }],
    scheduledMatchCount: 3,
  });
  assert.equal(r.stage, 'no_match_result');
  assert.equal(r.stagePlayerCount, 11);
  assert.ok(r.notes.some((n) => n.includes('日程のみ')));
});

test('result_1 / result_2_9 / result_10plus', () => {
  const mk = (n: number): UserStageInput => ({
    ...base,
    hasCareerDoc: true,
    careers: [{ careerId: 'c1', name: 'C1', clubUid: 'u1', status: 'active', ownTeamCount: 1, playerCount: 15 }],
    resultMatchCount: n,
  });
  assert.equal(evaluateUserStage(mk(1)).stage, 'result_1');
  assert.equal(evaluateUserStage(mk(2)).stage, 'result_2_9');
  assert.equal(evaluateUserStage(mk(9)).stage, 'result_2_9');
  assert.equal(evaluateUserStage(mk(10)).stage, 'result_10plus');
  assert.equal(evaluateUserStage(mk(120)).stage, 'result_10plus');
});

test('結果記録済みは上流欠損へ戻さない（選手未登録だが結果あり→result段階）', () => {
  const r = evaluateUserStage({
    ...base,
    hasCareerDoc: true,
    careers: [{ careerId: 'c1', name: 'C1', clubUid: 'u1', status: 'active', ownTeamCount: 0, playerCount: 0 }],
    resultMatchCount: 4,
  });
  assert.equal(r.stage, 'result_2_9');
  assert.ok(r.notes.length > 0);
});

test('複数Career: 最も進んだCareerを採用（別Careerを組み合わせない）', () => {
  const r = evaluateUserStage({
    ...base,
    hasCareerDoc: true,
    careers: [
      { careerId: 'c1', name: 'A', clubUid: 'u1', status: 'active', ownTeamCount: 0, playerCount: 0 },
      { careerId: 'c2', name: 'B', clubUid: 'u2', status: 'active', ownTeamCount: 1, playerCount: 5 },
    ],
  });
  assert.equal(r.stage, 'no_match_result');
  assert.equal(r.usedCareerId, 'c2');
  assert.equal(r.stagePlayerCount, 5);
});

test('旧形式: Careerなし・uid直下に選手 → no_match_result（初期データなしにしない）', () => {
  const r = evaluateUserStage({
    ...base,
    hasProfileDoc: true,
    legacyRoot: { ownTeamCount: 1, playerCount: 20 },
  });
  assert.equal(r.stage, 'no_match_result');
  assert.equal(r.usedCareerIsLegacyRoot, true);
});

test('旧形式: uid直下データのみ（profile無し）でも初期データなしにしない', () => {
  const r = evaluateUserStage({
    ...base,
    legacyRoot: { ownTeamCount: 1, playerCount: 0 },
  });
  assert.equal(r.stage, 'no_players');
});

test('creating Careerは評価対象外（hasCareerDocは立つがcareersに含めない前提）', () => {
  const r = evaluateUserStage({ ...base, hasCareerDoc: true });
  assert.equal(r.stage, 'no_own_team');
});

test('undeterminable: 全Careerが自チーム特定不能（複数チーム・目印なし）', () => {
  const r = evaluateUserStage({
    ...base,
    hasCareerDoc: true,
    careers: [
      { careerId: 'c1', name: 'A', clubUid: 'u1', status: 'active', ownTeamCount: 0, ownTeamAmbiguous: true, playerCount: 0 },
    ],
  });
  assert.equal(r.stage, 'undeterminable');
  assert.ok(r.notes.some((n) => n.includes('特定できない')));
});

test('ambiguousでも結果記録済みなら件数段階を優先', () => {
  const r = evaluateUserStage({
    ...base,
    hasCareerDoc: true,
    careers: [
      { careerId: 'c1', name: 'A', clubUid: 'u1', status: 'active', ownTeamCount: 0, ownTeamAmbiguous: true, playerCount: 0 },
    ],
    resultMatchCount: 5,
  });
  assert.equal(r.stage, 'result_2_9');
});

test('ambiguous Careerが混在しても解決済みCareerで判定', () => {
  const r = evaluateUserStage({
    ...base,
    hasCareerDoc: true,
    careers: [
      { careerId: 'c1', name: 'A', clubUid: 'u1', status: 'active', ownTeamCount: 0, ownTeamAmbiguous: true, playerCount: 0 },
      { careerId: 'c2', name: 'B', clubUid: 'u2', status: 'active', ownTeamCount: 1, playerCount: 0 },
    ],
  });
  assert.equal(r.stage, 'no_players');
  assert.equal(r.usedCareerId, 'c2');
});

test('ownTeamAssumed: チーム1件のみ推定は自チーム扱い＋注意記録', () => {
  const r = evaluateUserStage({
    ...base,
    hasCareerDoc: true,
    careers: [{ careerId: 'c1', name: 'C1', clubUid: 'u1', status: 'active', ownTeamCount: 1, ownTeamAssumed: true, playerCount: 0 }],
  });
  assert.equal(r.stage, 'no_players');
  assert.ok(r.notes.some((n) => n.includes('推定')));
});

test('旧形式ambiguous: uid直下に複数チーム・目印なし → 判定不能', () => {
  const r = evaluateUserStage({
    ...base,
    hasProfileDoc: true,
    legacyRoot: { ownTeamCount: 0, ownTeamAmbiguous: true, playerCount: 0 },
  });
  assert.equal(r.stage, 'undeterminable');
});

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_800_000_000_000;

test('ageBucket: 境界値', () => {
  assert.equal(ageBucket(null, NOW), 'unknown');
  assert.equal(ageBucket(0, NOW), 'unknown');
  assert.equal(ageBucket(NOW, NOW), 'lt24h');
  assert.equal(ageBucket(NOW - DAY + 1, NOW), 'lt24h');
  assert.equal(ageBucket(NOW - DAY, NOW), 'd1_3');
  assert.equal(ageBucket(NOW - 3 * DAY, NOW), 'd3_7');
  assert.equal(ageBucket(NOW - 7 * DAY, NOW), 'd7_14');
  assert.equal(ageBucket(NOW - 14 * DAY, NOW), 'd14_30');
  assert.equal(ageBucket(NOW - 30 * DAY, NOW), 'd30plus');
  assert.equal(ageBucket(NOW - 300 * DAY, NOW), 'd30plus');
});

test('playerBucket', () => {
  assert.equal(playerBucket(0), '0');
  assert.equal(playerBucket(4), '1_4');
  assert.equal(playerBucket(5), '5_10');
  assert.equal(playerBucket(11), '11_19');
  assert.equal(playerBucket(19), '11_19');
  assert.equal(playerBucket(20), '20plus');
});
