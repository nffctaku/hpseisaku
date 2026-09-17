import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { pickFields, assertWithinBatchLimit } from "./career-copy-helpers";

describe("career-copy", () => {
  describe("pickFields", () => {
    test("指定されたフィールドのみを抽出する", () => {
      const data = {
        name: "Taro",
        age: 20,
        stats: { goals: 10 },
        history: [{ season: "2024" }],
      };
      const fields = ["name", "age"];
      const picked = pickFields(data, fields);
      assert.deepEqual(picked, { name: "Taro", age: 20 });
    });

    test("存在しないフィールドは無視される", () => {
      const data = { name: "Taro" };
      const picked = pickFields(data, ["name", "unknown"]);
      assert.deepEqual(picked, { name: "Taro" });
    });

    test("値が undefined のフィールドは含めない", () => {
      const data = { name: "Taro", photo: undefined };
      const picked = pickFields(data, ["name", "photo"]);
      assert.deepEqual(picked, { name: "Taro" });
    });
  });

  describe("assertWithinBatchLimit", () => {
    test("上限内ではエラーを投げない", () => {
      assert.doesNotThrow(() =>
        assertWithinBatchLimit(true, true, true, 100, 50)
      );
    });

    test("上限を超えるとエラーを投げる", () => {
      assert.throws(() =>
        assertWithinBatchLimit(true, true, false, 1000, 1000)
      );
    });

    test("選手・チームを OFF にすれば余裕を持てる", () => {
      assert.doesNotThrow(() =>
        assertWithinBatchLimit(false, false, true, 100000, 100000)
      );
    });
  });
});
