// 名鑑の「シーズン開幕時点年齢」計算のユニットテスト（Firestore不要）
// 実行: npx tsx --test --tsconfig tsconfig.json src/lib/player-calculations.test.ts
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  getSeasonBaseDate,
  calculateAge,
  tryCalculateAge,
  isValidBirthDateString,
} from "./player-calculations";

describe("getSeasonBaseDate: シーズン→8月1日", () => {
  test("各シーズン表記で開始年の8月1日を返す", () => {
    assert.deepEqual(getSeasonBaseDate("2027/28"), new Date(2027, 7, 1));
    assert.deepEqual(getSeasonBaseDate("2027-28"), new Date(2027, 7, 1));
    assert.deepEqual(getSeasonBaseDate("2027-2028"), new Date(2027, 7, 1));
    assert.deepEqual(getSeasonBaseDate("2027"), new Date(2027, 7, 1));
  });
  test("年で始まらないシーズンはthrow", () => {
    assert.throws(() => getSeasonBaseDate("春季大会"));
    assert.throws(() => getSeasonBaseDate(""));
  });
});

describe("calculateAge: 開幕時点の年齢", () => {
  test("誕生日が基準日より前 → 満年齢", () => {
    assert.equal(calculateAge("2000-05-20", "2027/28"), 27);
  });
  test("誕生日が基準日より後 → 未満年齢", () => {
    assert.equal(calculateAge("2000-11-20", "2027/28"), 26);
  });
  test("基準日当日が誕生日 → その歳になる", () => {
    assert.equal(calculateAge("2000-08-01", "2027/28"), 27);
    assert.equal(calculateAge("2000-08-02", "2027/28"), 26);
  });
});

describe("tryCalculateAge: 安全な計算", () => {
  test("正常値", () => {
    assert.equal(tryCalculateAge("2000-05-20", "2027/28"), 27);
    assert.equal(tryCalculateAge("2000-05-20", "2026/27"), 26);
  });
  test("不正・未登録はnull（0歳等の誤表示を防ぐ）", () => {
    for (const dob of ["", "abc", null, undefined, 123, "2030-05-20", "1920-05-20"]) {
      assert.equal(tryCalculateAge(dob, "2027/28"), null, JSON.stringify(dob));
    }
  });
  test("不正なシーズン表記はnull", () => {
    assert.equal(tryCalculateAge("2000-05-20", "春季大会"), null);
    assert.equal(tryCalculateAge("2000-05-20", ""), null);
  });
});

describe("isValidBirthDateString: 厳密な日付検証", () => {
  test("受理する形式", () => {
    for (const s of ["2000-05-20", "2000/05/20", "2000-5-2", "2000-02-29"]) {
      assert.equal(isValidBirthDateString(s), true, s);
    }
  });
  test("拒否する形式（存在しない日付・非日付形式）", () => {
    for (const s of [
      "2000-02-30", // 2月30日は存在しない
      "2000-13-01", // 13月は存在しない
      "2000-04-31", // 4月31日は存在しない
      "May 20, 2000",
      "20/05/2000",
      "20000520",
      "abc",
      "",
      null,
      undefined,
    ]) {
      assert.equal(isValidBirthDateString(s), false, JSON.stringify(s));
    }
  });
});
