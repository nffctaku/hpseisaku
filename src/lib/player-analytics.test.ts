import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyPlayerTeamKind,
  classifySaveFailureCode,
  shouldRecordFirstPlayerCreatedAt,
} from "./player-analytics-core";

const MEASURE = 1_700_000_000_000;
const AFTER_REG = MEASURE + 1_000;
const BEFORE_REG = MEASURE - 1_000;

const base = {
  mainTeamId: null as string | null,
  thisTeamExists: true,
  thisTeamIsMain: false,
  teamId: "t1",
  clubUid: "club1",
  teamCount: 3,
  mainCount: 0,
};

test("mainTeamId一致は自チーム", () => {
  assert.deepEqual(
    classifyPlayerTeamKind({ ...base, mainTeamId: "t1" }),
    { kind: "own", assumed: false }
  );
});

test("isMain=trueは自チーム", () => {
  assert.deepEqual(
    classifyPlayerTeamKind({ ...base, thisTeamIsMain: true }),
    { kind: "own", assumed: false }
  );
});

test("旧形式（teamId===clubUid）は自チーム", () => {
  assert.deepEqual(
    classifyPlayerTeamKind({ ...base, teamId: "club1" }),
    { kind: "own", assumed: false }
  );
});

test("mainTeamIdが別チームを指す場合は対戦相手", () => {
  assert.deepEqual(
    classifyPlayerTeamKind({ ...base, mainTeamId: "tOther" }),
    { kind: "opponent", assumed: false }
  );
});

test("別チームにisMainがある場合は対戦相手", () => {
  assert.deepEqual(
    classifyPlayerTeamKind({ ...base, mainCount: 1 }),
    { kind: "opponent", assumed: false }
  );
});

test("チーム1件のみは自チームと推定（assumed）", () => {
  assert.deepEqual(
    classifyPlayerTeamKind({ ...base, teamCount: 1, mainCount: 0 }),
    { kind: "own", assumed: true }
  );
});

test("複数チーム・目印なしは判定不能", () => {
  assert.deepEqual(
    classifyPlayerTeamKind({ ...base, teamCount: 4, mainCount: 0 }),
    { kind: "unknown", assumed: false }
  );
});

test("存在しないチームは判定不能", () => {
  assert.deepEqual(
    classifyPlayerTeamKind({ ...base, thisTeamExists: false, teamCount: 1 }),
    { kind: "unknown", assumed: false }
  );
});

test("firstPlayerCreatedAt: 計測後登録・初観測・UID全体1件のみ → 記録", () => {
  assert.equal(
    shouldRecordFirstPlayerCreatedAt({
      wasFirstObserved: true,
      registeredAtMs: AFTER_REG,
      measurementStartMs: MEASURE,
      ownPlayerTotalAfterCreate: 1,
    }),
    true
  );
});

test("firstPlayerCreatedAt: 全削除後の再作成（初観測ではない）→ 記録しない", () => {
  assert.equal(
    shouldRecordFirstPlayerCreatedAt({
      wasFirstObserved: false,
      registeredAtMs: AFTER_REG,
      measurementStartMs: MEASURE,
      ownPlayerTotalAfterCreate: 1,
    }),
    false
  );
});

test("firstPlayerCreatedAt: 別Careerに既存選手（合計>1）→ 記録しない", () => {
  assert.equal(
    shouldRecordFirstPlayerCreatedAt({
      wasFirstObserved: true,
      registeredAtMs: AFTER_REG,
      measurementStartMs: MEASURE,
      ownPlayerTotalAfterCreate: 3,
    }),
    false
  );
});

test("firstPlayerCreatedAt: 計測開始前登録ユーザー → 記録しない（過去は証明不能）", () => {
  assert.equal(
    shouldRecordFirstPlayerCreatedAt({
      wasFirstObserved: true,
      registeredAtMs: BEFORE_REG,
      measurementStartMs: MEASURE,
      ownPlayerTotalAfterCreate: 1,
    }),
    false
  );
});

test("firstPlayerCreatedAt: 登録日時不明・カウント失敗 → 記録しない", () => {
  assert.equal(
    shouldRecordFirstPlayerCreatedAt({
      wasFirstObserved: true,
      registeredAtMs: null,
      measurementStartMs: MEASURE,
      ownPlayerTotalAfterCreate: 1,
    }),
    false
  );
  assert.equal(
    shouldRecordFirstPlayerCreatedAt({
      wasFirstObserved: true,
      registeredAtMs: AFTER_REG,
      measurementStartMs: MEASURE,
      ownPlayerTotalAfterCreate: null,
    }),
    false
  );
});

test("Firestoreエラーコードはそのまま分類、メッセージや値なしはunknown", () => {
  assert.equal(classifySaveFailureCode({ code: "permission-denied" }), "permission-denied");
  assert.equal(classifySaveFailureCode({ code: "unavailable" }), "unavailable");
  assert.equal(classifySaveFailureCode(new Error("some raw message")), "unknown");
  assert.equal(classifySaveFailureCode(undefined), "unknown");
  assert.equal(classifySaveFailureCode({ code: "UPPER CASE MSG!!" }), "unknown");
});
