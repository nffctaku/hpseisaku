import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidOcrMinute, ocrMinuteSortKey } from './ocr-apply';

test('isValidOcrMinute: null/0/解釈不能は無効（0をnullの代替値にしない）', () => {
  assert.equal(isValidOcrMinute(null), false);
  assert.equal(isValidOcrMinute(undefined), false);
  assert.equal(isValidOcrMinute(0), false);
  assert.equal(isValidOcrMinute(''), false);
  assert.equal(isValidOcrMinute('abc'), false);
  assert.equal(isValidOcrMinute('0'), false);
  assert.equal(isValidOcrMinute(NaN), false);
});

test('isValidOcrMinute: 正常な時刻は有効', () => {
  assert.equal(isValidOcrMinute(1), true);
  assert.equal(isValidOcrMinute(24), true);
  assert.equal(isValidOcrMinute(90), true);
  assert.equal(isValidOcrMinute('45+2'), true);
  assert.equal(isValidOcrMinute('120'), true);
});

test('ocrMinuteSortKey: 昇順・45+2は45の後46の前・時刻不明は最後', () => {
  const input: unknown[] = [75, null, 3, '45+2', 46, 45, 'abc', 87];
  const sorted = [...input].sort(
    (a, b) => ocrMinuteSortKey(a) - ocrMinuteSortKey(b)
  );
  assert.deepEqual(sorted, [3, 45, '45+2', 46, 75, 87, null, 'abc']);
});
