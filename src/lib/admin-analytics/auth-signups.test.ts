import { test } from "node:test";
import assert from "node:assert/strict";
import {
  aggregateAuthSignups,
  jstDayKey,
  jstDayShift,
  type AuthSignupInput,
} from "./auth-signups";

// JST 2025-09-25 12:00 = UTC 2025-09-25 03:00
const NOW = Date.parse("2025-09-25T03:00:00Z");

const rec = (uid: string, isoUtc: string | null): AuthSignupInput => ({
  uid,
  creationMs: isoUtc ? Date.parse(isoUtc) : null,
});

test("jstDayKey: UTC深夜はJST当日、UTC23時台はJST翌日", () => {
  // UTC 2025-09-24 16:00 → JST 2025-09-25 01:00（日付跨ぎ）
  assert.equal(jstDayKey(Date.parse("2025-09-24T16:00:00Z")), "2025-09-25");
  // UTC 2025-09-24 14:59 → JST 2025-09-24 23:59（同日）
  assert.equal(jstDayKey(Date.parse("2025-09-24T14:59:59Z")), "2025-09-24");
  // UTC 2025-09-25 15:00 → JST 2025-09-26 00:00（翌日境界）
  assert.equal(jstDayKey(Date.parse("2025-09-25T15:00:00Z")), "2025-09-26");
});

test("jstDayShift: 日付の前後シフト", () => {
  assert.equal(jstDayShift("2025-09-25", -1), "2025-09-24");
  assert.equal(jstDayShift("2025-10-01", -1), "2025-09-30"); // 月跨ぎ
  assert.equal(jstDayShift("2025-01-01", -1), "2024-12-31"); // 年跨ぎ
});

test("同日複数ユーザーと累計", () => {
  const agg = aggregateAuthSignups(
    [
      rec("a", "2025-09-20T01:00:00Z"), // JST 9/20
      rec("b", "2025-09-20T05:00:00Z"), // JST 9/20
      rec("c", "2025-09-22T00:30:00Z"), // JST 9/22
    ],
    NOW
  );
  assert.equal(agg.total, 3);
  assert.equal(agg.series.length, 2);
  assert.deepEqual(
    agg.series.map((d) => [d.date, d.count, d.cumulative]),
    [
      ["2025-09-20", 2, 2],
      ["2025-09-22", 1, 3],
    ]
  );
});

test("UTC→JST跨ぎで日付が正しく振り分けられる", () => {
  const agg = aggregateAuthSignups(
    [
      rec("a", "2025-09-24T14:59:00Z"), // JST 9/24 23:59
      rec("b", "2025-09-24T15:01:00Z"), // JST 9/25 00:01（UTC同日だがJST翌日）
    ],
    NOW
  );
  const byDay = Object.fromEntries(agg.series.map((d) => [d.date, d.count]));
  assert.equal(byDay["2025-09-24"], 1);
  assert.equal(byDay["2025-09-25"], 1);
});

test("UID重複は1回のみカウント", () => {
  const agg = aggregateAuthSignups(
    [rec("a", "2025-09-20T01:00:00Z"), rec("a", "2025-09-20T01:00:00Z")],
    NOW
  );
  assert.equal(agg.total, 1);
  assert.equal(agg.series[0].count, 1);
});

test("creationTime欠損はmissingCreationTimeに計上し総数には含める", () => {
  const agg = aggregateAuthSignups(
    [rec("a", "2025-09-20T01:00:00Z"), rec("b", null)],
    NOW
  );
  assert.equal(agg.total, 2);
  assert.equal(agg.missingCreationTime, 1);
  // 系列合計は欠損分を除く = total - missing
  const seriesSum = agg.series.reduce((s, d) => s + d.count, 0);
  assert.equal(seriesSum, 1);
});

test("今日・昨日・直近7日・直近30日のサマリー", () => {
  const agg = aggregateAuthSignups(
    [
      rec("t", "2025-09-25T02:00:00Z"), // JST 9/25 = 今日
      rec("y", "2025-09-24T16:30:00Z"), // JST 9/25 01:30 → 今日
      rec("y2", "2025-09-24T10:00:00Z"), // JST 9/24 = 昨日
      rec("d3", "2025-09-20T01:00:00Z"), // JST 9/20 = 5日前(last7内)
      rec("d8", "2025-09-17T01:00:00Z"), // JST 9/17 = 8日前(prev7)
      rec("d20", "2025-09-05T01:00:00Z"), // JST 9/5 = last30内
      rec("old", "2025-08-01T01:00:00Z"), // JST 8/1 = 30日より前
    ],
    NOW
  );
  assert.equal(agg.summary.today, 2);
  assert.equal(agg.summary.yesterday, 1);
  assert.equal(agg.summary.last7, 4); // 今日2 + 昨日1 + 9/20
  assert.equal(agg.summary.prev7, 1); // 9/17
  assert.equal(agg.summary.last30, 6); // old除く
  assert.equal(agg.summary.avgPerDay7, 4 / 7);
});

test("前期間比較: prev7=0のときnull", () => {
  const agg = aggregateAuthSignups([rec("a", "2025-09-24T01:00:00Z")], NOW);
  assert.equal(agg.summary.prev7, 0);
  assert.equal(agg.summary.deltaPct7vsPrev7, null);

  const agg2 = aggregateAuthSignups(
    [
      rec("a", "2025-09-24T01:00:00Z"),
      rec("b", "2025-09-23T01:00:00Z"),
      rec("c", "2025-09-17T01:00:00Z"), // prev7
    ],
    NOW
  );
  // last7=2, prev7=1 → +100%
  assert.equal(agg2.summary.deltaPct7vsPrev7, 1);
});

test("全期間合計 = 系列合計 = total（欠損なし時）", () => {
  const agg = aggregateAuthSignups(
    [
      rec("a", "2024-01-01T00:00:00Z"),
      rec("b", "2025-03-15T12:00:00Z"),
      rec("c", "2025-09-25T02:00:00Z"),
    ],
    NOW
  );
  const seriesSum = agg.series.reduce((s, d) => s + d.count, 0);
  assert.equal(seriesSum, agg.total);
  assert.equal(agg.series[agg.series.length - 1].cumulative, agg.total);
});

test("空配列でも壊れない", () => {
  const agg = aggregateAuthSignups([], NOW);
  assert.equal(agg.total, 0);
  assert.equal(agg.series.length, 0);
  assert.equal(agg.summary.today, 0);
  assert.equal(agg.summary.deltaPct7vsPrev7, null);
});
