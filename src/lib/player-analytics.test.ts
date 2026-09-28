import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyPlayerTeamKind,
  classifySaveFailureCode,
} from "./player-analytics-core";

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

test("Firestoreエラーコードはそのまま分類、メッセージや値なしはunknown", () => {
  assert.equal(classifySaveFailureCode({ code: "permission-denied" }), "permission-denied");
  assert.equal(classifySaveFailureCode({ code: "unavailable" }), "unavailable");
  assert.equal(classifySaveFailureCode(new Error("some raw message")), "unknown");
  assert.equal(classifySaveFailureCode(undefined), "unknown");
  assert.equal(classifySaveFailureCode({ code: "UPPER CASE MSG!!" }), "unknown");
});
