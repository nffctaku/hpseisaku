import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildJoinTypeFutureUpdates,
  resolveJoinBadge,
  trySeasonStartYear,
} from "@/lib/join-status";

describe("resolveJoinBadge", () => {
  it("maps join types to badges", () => {
    assert.equal(resolveJoinBadge("permanent"), "NEW");
    assert.equal(resolveJoinBadge("loan"), "LOAN");
    assert.equal(resolveJoinBadge("loan_return"), "BACK");
    assert.equal(resolveJoinBadge("promotion"), "UP");
  });
  it("returns null for unset/invalid", () => {
    for (const v of [null, undefined, "", "unknown", 1, {}]) {
      assert.equal(resolveJoinBadge(v), null);
    }
  });
});

describe("trySeasonStartYear", () => {
  it("parses common formats", () => {
    assert.equal(trySeasonStartYear("2027/28"), 2027);
    assert.equal(trySeasonStartYear("2027-28"), 2027);
    assert.equal(trySeasonStartYear("2027-2028"), 2027);
  });
  it("returns null for invalid", () => {
    assert.equal(trySeasonStartYear(""), null);
    assert.equal(trySeasonStartYear("春季大会"), null);
    assert.equal(trySeasonStartYear(null), null);
  });
});

describe("buildJoinTypeFutureUpdates", () => {
  it("forward-fills loan seasons up to loanEndSeason", () => {
    const u = buildJoinTypeFutureUpdates({}, "2027/28", "loan", "2029/30");
    assert.deepEqual(u, {
      "seasonData.2028-29.joinType": "loan",
      "seasonData.2028-29.joinTypeAuto": true,
      "seasonData.2029-30.joinType": "loan",
      "seasonData.2029-30.joinTypeAuto": true,
    });
  });

  it("does not fill when loanEndSeason is missing", () => {
    const u = buildJoinTypeFutureUpdates({}, "2027/28", "loan", "");
    assert.deepEqual(u, {});
  });

  it("does not overwrite explicitly recorded seasons", () => {
    const sd = { "2028/29": { joinType: "permanent" } };
    const u = buildJoinTypeFutureUpdates(sd, "2027/28", "loan", "2029/30");
    assert.deepEqual(u, {
      "seasonData.2029-30.joinType": "loan",
      "seasonData.2029-30.joinTypeAuto": true,
    });
  });

  it("overwrites stale auto entries within range using original key", () => {
    const sd = { "2028/29": { joinType: "loan", joinTypeAuto: true } };
    const u = buildJoinTypeFutureUpdates(sd, "2027/28", "loan", "2028/29");
    assert.deepEqual(u, {
      "seasonData.2028/29.joinType": "loan",
      "seasonData.2028/29.joinTypeAuto": true,
    });
  });

  it("clears auto loan entries beyond target season when joinType changes", () => {
    const sd = {
      "2028-29": { joinType: "loan", joinTypeAuto: true },
      "2029-30": { joinType: "loan", joinTypeAuto: true, number: 7 },
    };
    const u = buildJoinTypeFutureUpdates(sd, "2027/28", "permanent", null);
    assert.deepEqual(u, {
      "seasonData.2028-29.joinType": null,
      "seasonData.2028-29.joinTypeAuto": null,
      "seasonData.2029-30.joinType": null,
      "seasonData.2029-30.joinTypeAuto": null,
    });
  });

  it("does not clear explicit loan entries in future seasons", () => {
    const sd = { "2029-30": { joinType: "loan" } };
    const u = buildJoinTypeFutureUpdates(sd, "2027/28", "permanent", null);
    assert.deepEqual(u, {});
  });

  it("does not touch past seasons", () => {
    const sd = { "2025-26": { joinType: "loan", joinTypeAuto: true } };
    const u = buildJoinTypeFutureUpdates(sd, "2027/28", "permanent", null);
    assert.deepEqual(u, {});
  });

  it("shrinks fill when loanEndSeason is shortened", () => {
    const sd = {
      "2029-30": { joinType: "loan", joinTypeAuto: true },
    };
    const u = buildJoinTypeFutureUpdates(sd, "2027/28", "loan", "2028/29");
    assert.deepEqual(u, {
      "seasonData.2028-29.joinType": "loan",
      "seasonData.2028-29.joinTypeAuto": true,
      "seasonData.2029-30.joinType": null,
      "seasonData.2029-30.joinTypeAuto": null,
    });
  });

  it("no-ops on invalid target season", () => {
    const u = buildJoinTypeFutureUpdates({}, "春季", "loan", "2029/30");
    assert.deepEqual(u, {});
  });

  it("loan→permanent 移行シナリオ: 過去のLOANを保持し、将来の不要なautoを残さない", () => {
    const step1 = buildJoinTypeFutureUpdates({}, "2027/28", "loan", "2029/30");
    const sd: Record<string, any> = {
      "2027-28": { joinType: "loan", loanEndSeason: "2029/30" },
    };
    for (const [path, v] of Object.entries(step1)) {
      const m = path.match(/^seasonData\.([^.]+)\.(.+)$/);
      if (m) (sd[m[1]] ||= {})[m[2]] = v;
    }
    assert.equal(sd["2028-29"].joinType, "loan");
    assert.equal(sd["2029-30"].joinType, "loan");
    sd["2029-30"] = { joinType: "permanent" };
    const step2 = buildJoinTypeFutureUpdates(sd, "2029/30", "permanent", null);
    assert.deepEqual(step2, {});
    assert.equal(resolveJoinBadge(sd["2027-28"].joinType), "LOAN");
    assert.equal(resolveJoinBadge(sd["2028-29"].joinType), "LOAN");
    assert.equal(resolveJoinBadge(sd["2029-30"].joinType), "NEW");
    assert.equal(resolveJoinBadge(sd["2030-31"]?.joinType), null);
  });

  it("loan→permanent 移行で未来シーズンのstale auto loanだけ除去する", () => {
    const sd = {
      "2027-28": { joinType: "loan" },
      "2028-29": { joinType: "loan", joinTypeAuto: true },
      "2030-31": { joinType: "loan", joinTypeAuto: true },
      "2031-32": { joinType: "promotion" },
    };
    const u = buildJoinTypeFutureUpdates(sd, "2028/29", "permanent", null);
    assert.deepEqual(u, {
      "seasonData.2030-31.joinType": null,
      "seasonData.2030-31.joinTypeAuto": null,
    });
  });
});
