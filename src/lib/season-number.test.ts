import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  seasonKeyCandidates,
  normalizeSeasonNumber,
  resolveSeasonScopedNumber,
} from './season';

// 再現シナリオ: 2025/26=23、2026/27=6（保存順を問わずシーズン別の値が取れること）

const seasonDataBoth = {
  '2025-26': { number: 23 },
  '2026-27': { number: 6 },
};

test('seasonKeyCandidates: slash/dash両表記を含む', () => {
  assert.deepEqual(seasonKeyCandidates('2025/26'), ['2025/26', '2025-26']);
  assert.deepEqual(seasonKeyCandidates('2025-26'), ['2025-26', '2025/26']);
  assert.deepEqual(seasonKeyCandidates('2025-2026'), ['2025-2026', '2025/26', '2025-26']);
});

test('resolveSeasonScopedNumber: シーズン別の背番号を返す', () => {
  assert.equal(resolveSeasonScopedNumber(seasonDataBoth, seasonKeyCandidates('2025/26')), 23);
  assert.equal(resolveSeasonScopedNumber(seasonDataBoth, seasonKeyCandidates('2026/27')), 6);
});

test('resolveSeasonScopedNumber: slash/dashキー差を吸収', () => {
  const slashKeyed = { '2025/26': { number: 23 } };
  assert.equal(resolveSeasonScopedNumber(slashKeyed, seasonKeyCandidates('2025-26')), 23);
  const dashKeyed = { '2026-27': { number: 6 } };
  assert.equal(resolveSeasonScopedNumber(dashKeyed, seasonKeyCandidates('2026/27')), 6);
});

test('resolveSeasonScopedNumber: 未設定シーズンはnull（0とは区別しない）', () => {
  assert.equal(resolveSeasonScopedNumber(seasonDataBoth, seasonKeyCandidates('2024/25')), null);
  assert.equal(resolveSeasonScopedNumber(null, seasonKeyCandidates('2025/26')), null);
  assert.equal(resolveSeasonScopedNumber({}, seasonKeyCandidates('2025/26')), null);
});

test('resolveSeasonScopedNumber: 背番号0は有効値として返す（未設定と区別）', () => {
  const sd = { '2025-26': { number: 0 } };
  assert.equal(resolveSeasonScopedNumber(sd, seasonKeyCandidates('2025/26')), 0);
});

test('resolveSeasonScopedNumber: 文字列の背番号を数値化', () => {
  const sd = { '2025-26': { number: '23' } };
  assert.equal(resolveSeasonScopedNumber(sd, seasonKeyCandidates('2025/26')), 23);
  const sdBad = { '2025-26': { number: 'abc' } };
  assert.equal(resolveSeasonScopedNumber(sdBad, seasonKeyCandidates('2025/26')), null);
});

test('resolveSeasonScopedNumber: レガシー配列形式のindex 0を背番号として読む', () => {
  const sd = { '2025-26': [23, 'Sub', 'DF'] };
  assert.equal(resolveSeasonScopedNumber(sd, seasonKeyCandidates('2025/26')), 23);
});

test('normalizeSeasonNumber: null/undefined/空文字はnull、0は0', () => {
  assert.equal(normalizeSeasonNumber(null), null);
  assert.equal(normalizeSeasonNumber(undefined), null);
  assert.equal(normalizeSeasonNumber(''), null);
  assert.equal(normalizeSeasonNumber(0), 0);
  assert.equal(normalizeSeasonNumber(' 7 '), 7);
});

// 表示側の優先順位: seasonData[season] > 同シーズンroster.number > 選手doc直下number
function effectiveNumber(player: any, rosterNumber: number | null | undefined, seasonKeys: string[]) {
  return (
    resolveSeasonScopedNumber(player?.seasonData, seasonKeys) ??
    normalizeSeasonNumber(rosterNumber) ??
    normalizeSeasonNumber(player?.number)
  );
}

test('優先順位: シーズン値が最新の共通(root)値に上書きされない', () => {
  // root=6（最後に26/27で保存）、25/26のシーズン値=23
  const player = { number: 6, seasonData: seasonDataBoth };
  assert.equal(effectiveNumber(player, 23, seasonKeyCandidates('2025/26')), 23);
  assert.equal(effectiveNumber(player, 6, seasonKeyCandidates('2026/27')), 6);
});

test('優先順位: seasonDataに対象シーズンが無い場合はroster→rootの順でフォールバック', () => {
  const player = { number: 6, seasonData: { '2026-27': { number: 6 } } };
  assert.equal(effectiveNumber(player, 23, seasonKeyCandidates('2025/26')), 23);
  assert.equal(effectiveNumber(player, null, seasonKeyCandidates('2025/26')), 6);
});
