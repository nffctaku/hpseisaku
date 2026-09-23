import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregateOcrMeasurements,
  aggregateOcrUsageCaps,
  computeOcrConversion,
  computeOcrMatchCross,
  planBucketOf,
  type OcrMeasurementRow,
  type OcrUsageMonthRow,
} from './ocr-analytics';

const NOW = Date.parse('2026-01-15T00:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

function m(partial: Partial<OcrMeasurementRow>): OcrMeasurementRow {
  return {
    userId: 'u1',
    createdAtMs: NOW - DAY,
    status: 'success',
    slotConsumed: true,
    analysisId: 'a1',
    plan: 'free',
    isPaid: false,
    isGranted: false,
    ...partial,
  };
}

test('OCR未利用ユーザーは利用UIDに入らない', () => {
  const agg = aggregateOcrMeasurements([m({ userId: 'u1' })], NOW);
  assert.equal(agg.users.all, 1);
  assert.equal(agg.uids.has('never-used'), false);
});

test('1ユーザーが複数回使ってもUIDは1人', () => {
  const agg = aggregateOcrMeasurements([
    m({ analysisId: 'a1' }),
    m({ analysisId: 'a2' }),
    m({ analysisId: 'a3' }),
  ], NOW);
  assert.equal(agg.users.all, 1);
  assert.equal(agg.depth.twoPlus, 1);
});

test('1回の操作で5画像なら画像数+5', () => {
  const rows = [0, 1, 2, 3, 4].map(() => m({ analysisId: 'batch1' }));
  const agg = aggregateOcrMeasurements(rows, NOW);
  assert.equal(agg.images.all, 5);
  assert.equal(agg.users.all, 1);
});

test('失敗・情報なしは画像数（消費）に含めずattemptedにのみ計上', () => {
  const agg = aggregateOcrMeasurements([
    m({ status: 'success', slotConsumed: true }),
    m({ status: 'api_error', slotConsumed: false }),
    m({ status: 'no_info', slotConsumed: false }),
    m({ status: 'parse_error', slotConsumed: false }),
  ], NOW);
  assert.equal(agg.images.all, 1);
  assert.equal(agg.attemptedImages.all, 4);
});

test('期間境界: 8日前は7日に含まず30日に含む', () => {
  const agg = aggregateOcrMeasurements([
    m({ userId: 'old8', createdAtMs: NOW - 8 * DAY }),
    m({ userId: 'old40', createdAtMs: NOW - 40 * DAY }),
    m({ userId: 'recent', createdAtMs: NOW - 1 * DAY }),
  ], NOW);
  assert.equal(agg.users.d7, 1);
  assert.equal(agg.users.d30, 2);
  assert.equal(agg.users.all, 3);
});

test('Paid ProとGranted Proが混ざらない', () => {
  const agg = aggregateOcrMeasurements([
    m({ userId: 'free1', plan: 'free' }),
    m({ userId: 'paid1', plan: 'pro', isPaid: true }),
    m({ userId: 'granted1', plan: 'officia', isGranted: true }),
  ], NOW);
  assert.equal(agg.planUsers.free, 1);
  assert.equal(agg.planUsers.paidPro, 1);
  assert.equal(agg.planUsers.grantedPro, 1);
});

test('平均画像数は利用者のみが分母（未利用者を含めない）', () => {
  const agg = aggregateOcrMeasurements([
    m({ userId: 'f1', plan: 'free' }),
    m({ userId: 'f1', plan: 'free' }),
    m({ userId: 'f2', plan: 'free' }),
    m({ userId: 'p1', plan: 'pro', isPaid: true }),
  ], NOW);
  assert.equal(agg.avgImages.free, 1.5); // (2+1)/2人
  assert.equal(agg.avgImages.paidPro, 1); // 1/1人（未利用Proは含めない）
});

test('深度: 1回のみ/2回以上/5回以上', () => {
  const rows: OcrMeasurementRow[] = [];
  for (let i = 0; i < 6; i++) rows.push(m({ userId: 'heavy', analysisId: `h${i}` }));
  rows.push(m({ userId: 'mid', analysisId: 'm1' }), m({ userId: 'mid', analysisId: 'm2' }));
  rows.push(m({ userId: 'light', analysisId: 'l1' }));
  const agg = aggregateOcrMeasurements(rows, NOW);
  assert.equal(agg.depth.once, 1);
  assert.equal(agg.depth.twoPlus, 2);
  assert.equal(agg.depth.fivePlus, 1);
});

test('Free15枚到達: free月ドキュメントのみ対象、plan欠損はhintへ', () => {
  const months: OcrUsageMonthRow[] = [
    { uid: 'f1', monthKey: 'ocr_2026_01', count: 15, plan: 'free' },
    { uid: 'f2', monthKey: 'ocr_2026_01', count: 14, plan: 'free' },
    { uid: 'f3', monthKey: 'ocr_2025_12', count: 20, plan: undefined }, // 旧データ→hint
    { uid: 'p1', monthKey: 'ocr_2026_01', count: 15, plan: 'pro' }, // Proの15枚はFree到達にしない
  ];
  const hints = new Map([['f3', 'free' as const]]);
  const caps = aggregateOcrUsageCaps(months, hints, 15, 300, 3);
  assert.equal(caps.freeReached, 2); // f1 + f3
  assert.equal(caps.freeReachRate, 2 / 3);
});

test('Pro閾値: 50/150/250/300（officiaもPro枠）', () => {
  const months: OcrUsageMonthRow[] = [
    { uid: 'p1', monthKey: 'ocr_2026_01', count: 60, plan: 'pro' },
    { uid: 'p2', monthKey: 'ocr_2026_01', count: 160, plan: 'officia' },
    { uid: 'p3', monthKey: 'ocr_2026_01', count: 300, plan: 'pro' },
    { uid: 'p4', monthKey: 'ocr_2026_01', count: 30, plan: 'pro' },
  ];
  const caps = aggregateOcrUsageCaps(months, new Map(), 15, 300, 0);
  assert.equal(caps.proGte50, 3); // p1,p2,p3
  assert.equal(caps.proGte150, 2); // p2,p3
  assert.equal(caps.proGte250, 1); // p3
  assert.equal(caps.proReached, 1); // p3
});

test('matchクロス: 試合数閾値と活動期間', () => {
  const ocrUids = new Set(['a', 'b', 'c', 'd']);
  const matchCounts = new Map([['a', 120], ['b', 12], ['c', 0]]);
  const lastAct = new Map([['a', NOW - DAY], ['b', NOW - 10 * DAY], ['d', NOW - 40 * DAY]]);
  const r = computeOcrMatchCross(ocrUids, matchCounts, lastAct, NOW);
  assert.equal(r.any, 2);
  assert.equal(r.gte10, 2);
  assert.equal(r.gte50, 1);
  assert.equal(r.gte100, 1);
  assert.equal(r.active7, 1);
  assert.equal(r.active30, 2);
});

test('転換: 元Free OCR利用 ∩ 現在Paid Pro（推測なし・時点プランで判定）', () => {
  const rows = [
    m({ userId: 'conv', plan: 'free', createdAtMs: NOW - 60 * DAY }),
    m({ userId: 'conv', plan: 'pro', isPaid: true, createdAtMs: NOW - DAY }), // Pro化後
    m({ userId: 'stillFree', plan: 'free' }),
    m({ userId: 'alwaysPro', plan: 'pro', isPaid: true }),
  ];
  const paidNow = new Set(['conv', 'alwaysPro']);
  const freeCaps = new Set(['conv']);
  const r = computeOcrConversion(rows, paidNow, freeCaps);
  assert.equal(r.formerFreeNowPaidPro, 1); // convのみ（alwaysProは元Freeではない）
  assert.equal(r.formerFreeCapNowPaidPro, 1);
});

test('planBucketOf: isPaid/isGranted優先、plan文字列フォールバック', () => {
  assert.equal(planBucketOf({ isPaid: true, plan: 'free' }), 'paid_pro');
  assert.equal(planBucketOf({ isGranted: true }), 'granted_pro');
  assert.equal(planBucketOf({ plan: 'officia' }), 'granted_pro');
  assert.equal(planBucketOf({ plan: 'pro' }), 'paid_pro');
  assert.equal(planBucketOf({}), 'free');
});
