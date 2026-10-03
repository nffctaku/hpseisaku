import test from "node:test";
import assert from "node:assert/strict";
import { resolveOwnTeamIds } from "./public-own-team";

const snap = (docs: { id: string; isMain?: boolean }[]) =>
  ({
    size: docs.length,
    docs: docs.map((d) => ({ id: d.id, data: () => (d.isMain ? { isMain: true } : {}) })),
  }) as unknown as FirebaseFirestore.QuerySnapshot;

test("mainTeamId に一致するチームは自チーム", () => {
  const s = snap([{ id: "own" }, { id: "opp1" }, { id: "opp2" }]);
  const ids = resolveOwnTeamIds(s, "clubUid", "own");
  assert.deepEqual(new Set(ids), new Set(["own", "clubUid"]));
});

test("isMain=true のチームは自チーム", () => {
  const s = snap([{ id: "teamA", isMain: true }, { id: "opp" }]);
  const ids = resolveOwnTeamIds(s, "clubUid", null);
  assert.deepEqual(new Set(ids), new Set(["teamA", "clubUid"]));
});

test("旧形式 teamId===clubDocId は自チーム", () => {
  const s = snap([{ id: "clubUid" }, { id: "opp" }]);
  const ids = resolveOwnTeamIds(s, "clubUid", null);
  assert.deepEqual(new Set(ids), new Set(["clubUid"]));
});

test("mainTeamId のチームdocが存在しなくても対象に含める", () => {
  // 対戦相手のみが残るケース（自チームdoc削除済み）
  const s = snap([{ id: "opp1" }, { id: "opp2" }]);
  const ids = resolveOwnTeamIds(s, "clubUid", "deletedMain");
  assert.deepEqual(new Set(ids), new Set(["deletedMain", "clubUid"]));
});

test("目印なし・複数チームは対戦相手を含めない", () => {
  const s = snap([{ id: "t1" }, { id: "t2" }, { id: "t3" }]);
  const ids = resolveOwnTeamIds(s, "clubUid", null);
  assert.deepEqual(new Set(ids), new Set(["clubUid"]));
});

test("目印なし・単一チームは暗黙の自チーム", () => {
  const s = snap([{ id: "only" }]);
  const ids = resolveOwnTeamIds(s, "clubUid", null);
  assert.deepEqual(new Set(ids), new Set(["clubUid", "only"]));
});

test("目印あり・単一チームでも暗黙推定は上書きされない", () => {
  const s = snap([{ id: "only", isMain: true }]);
  const ids = resolveOwnTeamIds(s, "clubUid", "other");
  assert.deepEqual(new Set(ids), new Set(["only", "other", "clubUid"]));
});
