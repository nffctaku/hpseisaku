// OCR利用カウント基盤。
// 枠の消費は「予約 → 解析 → 確定/解放」の2フェーズで行う。
//
// - 予約: users/{uid}/usage/ocr_YYYY_MM ドキュメント内の resv マップに
//   `reservationKey -> expiresAtMs` をトランザクションで追加。
//   count（確定済み）+ resv（有効な予約）で上限を判定するため、
//   同時実行・別タブでも上限超過しない。
// - 確定: 使える情報が読めた画像だけ count++ し、resv から削除して
//   done マップに reservationKey を移す（再送時の冪等性用）。
// - 解放: 失敗・読み取り情報なしは resv から削除するだけで count は増やさない。
// - 回復: 予約には有効期限（10分）があり、以後のトランザクションで期限切れを
//   自動除去する。中断・タイムアウト残存分はここで回収される。
// - 冪等: reservationKey = `${analysisId}:${imageIndex}`。同一キーの再送は
//   既存予約/確定結果を再利用し、二重消費・二重解析しない。
//
// 外部AI呼び出しはトランザクション外で行う（Firestoreトランザクション内で
// ネットワーク呼び出しは不可・遅延のため）。

import { db, admin } from '@/lib/firebase/admin';

const RESERVATION_TTL_MS = 10 * 60 * 1000; // 予約の有効期限（中断回収用）
const RATE_WINDOW_MS = 60 * 60 * 1000; // 連続解析制限の窓（1時間）
const RATE_MAX_ATTEMPTS = 30; // 1時間あたりの画像解析試行上限
const EMPTY_STREAK_THRESHOLD = 5; // 「読み取り情報なし」連続回数でクールダウン
const EMPTY_COOLDOWN_MS = 15 * 60 * 1000; // クールダウン時間（15分）

export function ocrMonthKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `ocr_${year}_${month}`;
}

function usageDocRef(uid: string, monthKey: string) {
  return db.collection('users').doc(uid).collection('usage').doc(monthKey);
}

function rateDocRef(uid: string) {
  return db.collection('users').doc(uid).collection('usage').doc('ocr_rate');
}

export interface UsageDocData {
  count?: number;
  resv?: Record<string, number>; // reservationKey -> expiresAtMs（有効予約のみ）
  done?: Record<string, number>; // reservationKey -> consumedAtMs（確定済み）
  plan?: string;
  updatedAt?: unknown;
}

export interface RateDocData {
  attempts?: number[]; // 直近1時間の解析試行タイムスタンプ(ms)
  consecutiveEmpty?: number; // 「読み取り情報なし」連続回数
  cooldownUntil?: number; // クールダウン終了時刻(ms)
}

export type ReserveResult =
  | { ok: true; monthKey: string; duplicate?: 'reserved' | 'consumed' }
  | { ok: false; reason: 'limit' | 'rate_limit' | 'cooldown'; limit?: number; currentCount?: number; retryAfterSec?: number };

/**
 * 画像1枚分の枠を予約する。トランザクション内で上限判定を行うため超過しない。
 * reservationKey は `analysisId:imageIndex` で、再送は重複カウントしない。
 * monthKey を指定可能（月末跨ぎで予約・確定の月を一致させるため）。
 */
export async function reserveOcrSlot(params: {
  uid: string;
  reservationKey: string;
  limit: number;
  monthKey?: string;
}): Promise<ReserveResult> {
  const { uid, reservationKey, limit } = params;
  const monthKey = params.monthKey || ocrMonthKey();
  const now = Date.now();

  return db.runTransaction(async (tx) => {
    const usageRef = usageDocRef(uid, monthKey);
    const rateRef = rateDocRef(uid);
    const [usageSnap, rateSnap] = await Promise.all([tx.get(usageRef), tx.get(rateRef)]);

    const usageData = (usageSnap.exists ? usageSnap.data() : {}) as UsageDocData;
    const resv = { ...(usageData.resv || {}) };
    const done = { ...(usageData.done || {}) };

    // --- レート制限・クールダウン判定 ---
    const rateData = (rateSnap.exists ? rateSnap.data() : {}) as RateDocData;
    if (typeof rateData.cooldownUntil === 'number' && rateData.cooldownUntil > now) {
      return {
        ok: false as const,
        reason: 'cooldown' as const,
        retryAfterSec: Math.ceil((rateData.cooldownUntil - now) / 1000),
      };
    }
    const attempts = (rateData.attempts || []).filter((t) => now - t < RATE_WINDOW_MS);
    const isNewAttempt = resv[reservationKey] === undefined && done[reservationKey] === undefined;
    if (isNewAttempt && attempts.length >= RATE_MAX_ATTEMPTS) {
      const oldest = Math.min(...attempts);
      return {
        ok: false as const,
        reason: 'rate_limit' as const,
        retryAfterSec: Math.ceil((oldest + RATE_WINDOW_MS - now) / 1000),
      };
    }

    // --- 期限切れ予約の回収（resvは有効予約のみ保持するマップ） ---
    const pruned: string[] = [];
    for (const [k, exp] of Object.entries(resv)) {
      if (typeof exp !== 'number' || exp <= now) {
        delete resv[k];
        pruned.push(k);
      }
    }

    // --- 既存予約/確定済みの再送 ---
    if (done[reservationKey] !== undefined) {
      return { ok: true as const, monthKey, duplicate: 'consumed' as const };
    }
    if (resv[reservationKey] !== undefined) {
      // 予約延長（再送）
      tx.set(usageRef, { resv: { [reservationKey]: now + RESERVATION_TTL_MS } }, { merge: true });
      return { ok: true as const, monthKey, duplicate: 'reserved' as const };
    }

    // --- 上限判定（確定済み + 有効予約のみ） ---
    const count = Number(usageData.count) || 0;
    if (Number.isFinite(limit) && count + Object.keys(resv).length >= limit) {
      if (pruned.length && usageSnap.exists) {
        // 回収分だけ保存（mergeは削除できないためupdate+FieldValue.delete）
        for (const k of pruned) {
          tx.update(usageRef, new admin.firestore.FieldPath('resv', k), admin.firestore.FieldValue.delete());
        }
      }
      return { ok: false as const, reason: 'limit' as const, limit, currentCount: count };
    }

    // --- 新規予約 ---
    if (usageSnap.exists && pruned.length) {
      for (const k of pruned) {
        tx.update(usageRef, new admin.firestore.FieldPath('resv', k), admin.firestore.FieldValue.delete());
      }
    }
    tx.set(
      usageRef,
      { resv: { [reservationKey]: now + RESERVATION_TTL_MS }, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true }
    );
    if (isNewAttempt) {
      attempts.push(now);
      tx.set(rateRef, { attempts }, { merge: true });
    }
    return { ok: true as const, monthKey };
  });
}

export type FinalizeStatus = 'consumed' | 'released' | 'duplicate';

/**
 * 予約を確定（usable）または解放（失敗/情報なし）する。
 * usable=true なら count++ し resv キーを done マップへ移す。
 * usable=false なら resv キーを削除して解放。
 * `noInfo=true` のとき連続「読み取り情報なし」カウンタを進め、
 * 閾値到達でクールダウンを設定する。API障害・タイムアウトはnoInfoに含めない。
 */
export async function finalizeOcrSlot(params: {
  uid: string;
  reservationKey: string;
  usable: boolean;
  noInfo?: boolean;
  plan: string;
  monthKey: string;
}): Promise<FinalizeStatus> {
  const { uid, reservationKey, usable, noInfo, plan, monthKey } = params;
  const now = Date.now();

  return db.runTransaction(async (tx) => {
    const usageRef = usageDocRef(uid, monthKey);
    const rateRef = rateDocRef(uid);
    const [usageSnap, rateSnap] = await Promise.all([tx.get(usageRef), tx.get(rateRef)]);

    const usageData = (usageSnap.exists ? usageSnap.data() : {}) as UsageDocData;
    const resv = usageData.resv || {};
    const done = usageData.done || {};

    // 予約なし or 確定済み → 冪等にスキップ
    if (resv[reservationKey] === undefined || done[reservationKey] !== undefined) {
      return 'duplicate' as const;
    }

    const rateData = (rateSnap.exists ? rateSnap.data() : {}) as RateDocData;
    let consecutiveEmpty = rateData.consecutiveEmpty || 0;

    if (usable) {
      consecutiveEmpty = 0;
      const count = (Number(usageData.count) || 0) + 1;
      tx.update(usageRef, new admin.firestore.FieldPath('resv', reservationKey), admin.firestore.FieldValue.delete());
      tx.update(usageRef, {
        count,
        done: { [reservationKey]: now },
        plan,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      tx.set(rateRef, { consecutiveEmpty }, { merge: true });
      return 'consumed' as const;
    }

    // 解放
    tx.update(usageRef, new admin.firestore.FieldPath('resv', reservationKey), admin.firestore.FieldValue.delete());
    tx.update(usageRef, { updatedAt: admin.firestore.FieldValue.serverTimestamp() });

    let cooldownUntil = rateData.cooldownUntil;
    if (noInfo) {
      consecutiveEmpty += 1;
      if (consecutiveEmpty >= EMPTY_STREAK_THRESHOLD) {
        cooldownUntil = now + EMPTY_COOLDOWN_MS;
        consecutiveEmpty = 0;
      }
    }
    const rateUpdate: Record<string, unknown> = { consecutiveEmpty };
    if (typeof cooldownUntil === 'number') rateUpdate.cooldownUntil = cooldownUntil;
    tx.set(rateRef, rateUpdate, { merge: true });
    return 'released' as const;
  });
}

/** 確定済み予約の重複解析を防ぐための結果キャッシュを保持する。 */
export function ocrAnalysisDocRef(uid: string, analysisId: string) {
  return db.collection('users').doc(uid).collection('ocrAnalyses').doc(analysisId);
}
