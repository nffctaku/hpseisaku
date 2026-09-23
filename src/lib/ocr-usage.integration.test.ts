// OCR利用カウント（予約/確定/解放/冪等/月跨ぎ/レート制限）の統合テスト。
// Firestoreエミュレータ必須:
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npx tsx --test src/lib/ocr-usage.integration.test.ts
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '@/lib/firebase/admin';
import { reserveOcrSlot, finalizeOcrSlot, ocrMonthKey } from './ocr-usage';

const uid = `test-ocr-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const monthKey = ocrMonthKey();
const usagePath = `users/${uid}/usage/${monthKey}`;
const ratePath = `users/${uid}/usage/ocr_rate`;

async function readUsage() {
  const snap = await db.doc(usagePath).get();
  return snap.exists ? snap.data()! : {};
}
async function readRate() {
  const snap = await db.doc(ratePath).get();
  return snap.exists ? snap.data()! : {};
}

before(async () => {
  await db.doc(`users/${uid}`).set({ email: 'test@example.com', createdAt: new Date() });
});

describe('reserveOcrSlot / finalizeOcrSlot', () => {
  test('予約→確定でcount+1、resvがconsumedになる', async () => {
    const r = await reserveOcrSlot({ uid, reservationKey: 'a1:0', limit: 15, monthKey });
    assert.equal(r.ok, true);
    const f = await finalizeOcrSlot({ uid, reservationKey: 'a1:0', usable: true, plan: 'free', monthKey });
    assert.equal(f, 'consumed');
    const u = await readUsage();
    assert.equal(u.count, 1);
    assert.equal(u.resv?.['a1:0'], undefined);
    assert.ok(u.done?.['a1:0']);
  });

  test('予約→解放（読み取り情報なし）でcountは増えない', async () => {
    const r = await reserveOcrSlot({ uid, reservationKey: 'a2:0', limit: 15, monthKey });
    assert.equal(r.ok, true);
    const f = await finalizeOcrSlot({ uid, reservationKey: 'a2:0', usable: false, noInfo: true, plan: 'free', monthKey });
    assert.equal(f, 'released');
    const u = await readUsage();
    assert.equal(u.count, 1); // 前テストの1のまま
    assert.equal(u.resv['a2:0'], undefined);
  });

  test('同一キー再送はduplicate=consumedを返し二重消費しない', async () => {
    const r = await reserveOcrSlot({ uid, reservationKey: 'a1:0', limit: 15, monthKey });
    assert.equal(r.ok, true);
    assert.equal(r.duplicate, 'consumed');
    const u = await readUsage();
    assert.equal(u.count, 1); // 増えない
  });

  test('予約中キーの再送はduplicate=reservedで延長される', async () => {
    await reserveOcrSlot({ uid, reservationKey: 'a3:0', limit: 15, monthKey });
    const r2 = await reserveOcrSlot({ uid, reservationKey: 'a3:0', limit: 15, monthKey });
    assert.equal(r2.ok, true);
    assert.equal(r2.duplicate, 'reserved');
    await finalizeOcrSlot({ uid, reservationKey: 'a3:0', usable: false, plan: 'free', monthKey });
  });

  test('上限に達すると予約が拒否される（確定+予約中で判定）', async () => {
    const uid2 = `${uid}-limit`;
    await db.doc(`users/${uid2}`).set({ email: 't2@example.com' });
    const mk = ocrMonthKey();
    const up = `users/${uid2}/usage/${mk}`;
    // count=14 + 予約1 = 15 でlimit=15到達
    await db.doc(up).set({ count: 14, resv: { pending: Date.now() + 600000 } });
    const r = await reserveOcrSlot({ uid: uid2, reservationKey: 'x:0', limit: 15, monthKey: mk });
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'limit');
  });

  test('期限切れ予約は回収されて上限判定から外れる', async () => {
    const uid3 = `${uid}-stale`;
    await db.doc(`users/${uid3}`).set({ email: 't3@example.com' });
    const mk = ocrMonthKey();
    // 期限切れ予約で14+1=15相当だが、期限切れなので回収→予約可能
    await db.doc(`users/${uid3}/usage/${mk}`).set({ count: 14, resv: { stale: Date.now() - 1000 } });
    const r = await reserveOcrSlot({ uid: uid3, reservationKey: 's:0', limit: 15, monthKey: mk });
    assert.equal(r.ok, true);
    const u = (await db.doc(`users/${uid3}/usage/${mk}`).get()).data()!;
    assert.equal(u.resv['stale'], undefined); // 回収済み
  });

  test('月をまたいでも指定monthKeyに書き込まれる', async () => {
    const uid4 = `${uid}-month`;
    await db.doc(`users/${uid4}`).set({ email: 't4@example.com' });
    const prevMonth = 'ocr_2020_01';
    const r = await reserveOcrSlot({ uid: uid4, reservationKey: 'm:0', limit: 15, monthKey: prevMonth });
    assert.equal(r.ok, true);
    assert.equal(r.monthKey, prevMonth);
    await finalizeOcrSlot({ uid: uid4, reservationKey: 'm:0', usable: true, plan: 'free', monthKey: prevMonth });
    const u = (await db.doc(`users/${uid4}/usage/${prevMonth}`).get()).data()!;
    assert.equal(u.count, 1);
  });

  test('連続「読み取り情報なし」5回でクールダウンが設定される', async () => {
    const uid5 = `${uid}-cool`;
    await db.doc(`users/${uid5}`).set({ email: 't5@example.com' });
    const mk = ocrMonthKey();
    for (let i = 0; i < 5; i++) {
      const r = await reserveOcrSlot({ uid: uid5, reservationKey: `c:${i}`, limit: 15, monthKey: mk });
      assert.equal(r.ok, true);
      await finalizeOcrSlot({ uid: uid5, reservationKey: `c:${i}`, usable: false, noInfo: true, plan: 'free', monthKey: mk });
    }
    const rate = (await db.doc(`users/${uid5}/usage/ocr_rate`).get()).data()!;
    assert.ok(rate.cooldownUntil > Date.now());
    // クールダウン中は予約拒否
    const blocked = await reserveOcrSlot({ uid: uid5, reservationKey: 'c:99', limit: 15, monthKey: mk });
    assert.equal(blocked.ok, false);
    assert.equal(blocked.reason, 'cooldown');
    assert.ok(blocked.retryAfterSec! > 0);
  });

  test('レート制限: 30試行/時間を超えると拒否', async () => {
    const uid6 = `${uid}-rate`;
    await db.doc(`users/${uid6}`).set({ email: 't6@example.com' });
    const mk = ocrMonthKey();
    // 29試行を事前記録
    const now = Date.now();
    await db.doc(`users/${uid6}/usage/ocr_rate`).set({ attempts: Array(29).fill(now - 1000) });
    const r1 = await reserveOcrSlot({ uid: uid6, reservationKey: 'r:0', limit: 15, monthKey: mk });
    assert.equal(r1.ok, true); // 30回目はOK
    const r2 = await reserveOcrSlot({ uid: uid6, reservationKey: 'r:1', limit: 15, monthKey: mk });
    assert.equal(r2.ok, false);
    assert.equal(r2.reason, 'rate_limit');
  });

  test('並列予約でも上限を超過しない（同時実行・別タブ想定）', async () => {
    const uid8 = `${uid}-race`;
    await db.doc(`users/${uid8}`).set({ email: 't8@example.com' });
    const mk = ocrMonthKey();
    // 残り枠3で10件並列予約
    await db.doc(`users/${uid8}/usage/${mk}`).set({ count: 12 });
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        reserveOcrSlot({ uid: uid8, reservationKey: `race:${i}`, limit: 15, monthKey: mk })
      )
    );
    const okCount = results.filter((r) => r.ok).length;
    const limitCount = results.filter((r) => !r.ok && r.reason === 'limit').length;
    assert.equal(okCount, 3); // 12+3=15で上限
    assert.equal(limitCount, 7);
    const u = (await db.doc(`users/${uid8}/usage/${mk}`).get()).data()!;
    assert.equal(Object.keys(u.resv || {}).length, 3);
  });

  test('noInfo=falseの失敗（API障害）はクールダウンにカウントしない', async () => {
    const uid7 = `${uid}-nofail`;
    await db.doc(`users/${uid7}`).set({ email: 't7@example.com' });
    const mk = ocrMonthKey();
    for (let i = 0; i < 5; i++) {
      const r = await reserveOcrSlot({ uid: uid7, reservationKey: `f:${i}`, limit: 15, monthKey: mk });
      assert.equal(r.ok, true);
      // API障害はnoInfo=false
      await finalizeOcrSlot({ uid: uid7, reservationKey: `f:${i}`, usable: false, noInfo: false, plan: 'free', monthKey: mk });
    }
    const rate = (await db.doc(`users/${uid7}/usage/ocr_rate`).get()).data()!;
    assert.equal(rate.consecutiveEmpty ?? 0, 0);
    assert.equal(rate.cooldownUntil ?? 0, 0);
    // まだ予約できる
    const r = await reserveOcrSlot({ uid: uid7, reservationKey: 'f:99', limit: 15, monthKey: mk });
    assert.equal(r.ok, true);
  });
});
