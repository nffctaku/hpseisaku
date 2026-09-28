import { test } from "node:test";
import assert from "node:assert/strict";
import { aggregatePlayerOps, type PlayerOpsEventRow } from "./player-ops";

const START = 1_000_000;
const AFTER = START + 1_000;
const BEFORE = START - 1_000;

function ev(
  eventName: string,
  userId: string | null,
  createdAtMs: number,
  properties: Record<string, unknown> = {}
): PlayerOpsEventRow {
  return { eventName, userId, createdAtMs, properties };
}

test("計測開始前のイベントと対象外イベントを除外する", () => {
  const s = aggregatePlayerOps(
    [
      ev("player_page_view", "u1", BEFORE, { visitId: "v-old" }),
      ev("player_page_view", "u1", AFTER, { visitId: "v1", teamKind: "own" }),
      ev("signup_complete", "u1", AFTER, {}),
    ],
    START
  );
  assert.equal(s.totalEvents, 1);
  assert.equal(s.all.pageView.eventCount, 1);
  assert.equal(s.unobserved.totalVisits, 1);
  assert.equal(s.unobserved.visitsWithoutCreateStart, 1);
});

test("UID数とイベント件数を分離し、同一ユーザーの重複送信を人数に計上しない", () => {
  const s = aggregatePlayerOps(
    [
      ev("player_page_view", "u1", AFTER, { visitId: "v1", teamKind: "own" }),
      ev("player_page_view", "u1", AFTER + 1, { visitId: "v2", teamKind: "own" }),
      ev("player_page_view", "u2", AFTER + 2, { visitId: "v3", teamKind: "opponent" }),
    ],
    START
  );
  assert.equal(s.all.pageView.uniqueUsers, 2);
  assert.equal(s.all.pageView.eventCount, 3);
  assert.equal(s.ownTeam.pageView.uniqueUsers, 1);
  assert.equal(s.ownTeam.pageView.eventCount, 2);
  assert.equal(s.eventCountByTeamKind.opponent, 1);
});

test("同一operationIdの再試行は別attemptとして数え、ID突合で未観測を出す", () => {
  const s = aggregatePlayerOps(
    [
      ev("player_create_start", "u1", AFTER, { visitId: "v1", operationId: "op1", teamKind: "own" }),
      ev("player_save_attempt", "u1", AFTER + 1, { operationId: "op1", attemptId: "a1", teamKind: "own" }),
      ev("player_save_failed", "u1", AFTER + 2, { operationId: "op1", attemptId: "a1", teamKind: "own", failureCode: "schema_invalid", failurePoint: "form_validation" }),
      ev("player_save_attempt", "u1", AFTER + 3, { operationId: "op1", attemptId: "a2", teamKind: "own" }),
      ev("player_save_success", "u1", AFTER + 4, { operationId: "op1", attemptId: "a2", teamKind: "own" }),
    ],
    START
  );
  assert.equal(s.all.saveAttempt.eventCount, 2);
  assert.equal(s.all.saveAttempt.uniqueUsers, 1);
  assert.equal(s.unobserved.totalAttempts, 2);
  assert.equal(s.unobserved.attemptsWithoutOutcome, 0);
  assert.equal(s.unobserved.opsStartedWithoutAttempt, 0);
  assert.deepEqual(s.failures, [
    { failureCode: "schema_invalid", failurePoint: "form_validation", count: 1, uniqueUsers: 1 },
  ]);
});

test("入力開始のみの操作・終端なし試行を未観測として数える（離脱とは断定しない）", () => {
  const s = aggregatePlayerOps(
    [
      ev("player_page_view", "u1", AFTER, { visitId: "v1", teamKind: "own" }),
      ev("player_create_start", "u1", AFTER + 1, { visitId: "v1", operationId: "op1", teamKind: "own" }),
      ev("player_create_start", "u2", AFTER + 2, { visitId: "v2", operationId: "op2", teamKind: "own" }),
      ev("player_save_attempt", "u1", AFTER + 3, { operationId: "op1", attemptId: "a1", teamKind: "own" }),
    ],
    START
  );
  assert.equal(s.unobserved.visitsWithoutCreateStart, 0);
  assert.equal(s.unobserved.opsStartedWithoutAttempt, 1); // op2
  assert.equal(s.unobserved.attemptsWithoutOutcome, 1); // a1
});

test("失敗理由を code+point で分類し試行件数と人数を出す", () => {
  const s = aggregatePlayerOps(
    [
      ev("player_save_failed", "u1", AFTER, { attemptId: "a1", teamKind: "own", failureCode: "permission-denied", failurePoint: "write" }),
      ev("player_save_failed", "u2", AFTER + 1, { attemptId: "a2", teamKind: "own", failureCode: "permission-denied", failurePoint: "write" }),
      ev("player_save_failed", "u1", AFTER + 2, { attemptId: "a3", teamKind: "own", failureCode: "no_season", failurePoint: "validation" }),
    ],
    START
  );
  assert.equal(s.failures.length, 2);
  assert.deepEqual(s.failures[0], { failureCode: "permission-denied", failurePoint: "write", count: 2, uniqueUsers: 2 });
  assert.deepEqual(s.failures[1], { failureCode: "no_season", failurePoint: "validation", count: 1, uniqueUsers: 1 });
  assert.equal(s.all.saveFailed.eventCount, 3);
  assert.equal(s.all.saveFailed.uniqueUsers, 2);
});

test("ID未付与のイベントは未観測集計から除外される", () => {
  const s = aggregatePlayerOps(
    [
      ev("player_page_view", "u1", AFTER, {}),
      ev("player_save_attempt", "u1", AFTER + 1, {}),
    ],
    START
  );
  assert.equal(s.unobserved.totalVisits, 0);
  assert.equal(s.unobserved.totalAttempts, 0);
  assert.equal(s.all.pageView.eventCount, 1);
});
