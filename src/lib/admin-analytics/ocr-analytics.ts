// OCR利用統計の集計ロジック（Firestore非依存の純粋関数）。
// 入力はAPI route側で users/{uid}/ocrMeasurements と users/{uid}/usage/ocr_* を
// 読み出して渡す。既存データを変更しない読み取り専用集計。

export interface OcrMeasurementRow {
  userId: string;
  /** 計測日時(ms)。パース不能は0（=期間判定で除外せずallには含める） */
  createdAtMs: number;
  status: string; // success | api_error | parse_error | no_info
  /** true = 月間枠を消費した画像（usage.countと同一SoT） */
  slotConsumed: boolean;
  /** 1回のOCR処理単位。複数画像は同一analysisIdを持つ */
  analysisId: string;
  /** 利用時点のプラン ('free'|'pro'|'officia') */
  plan?: string;
  isPaid?: boolean;
  isGranted?: boolean;
}

export interface OcrUsageMonthRow {
  uid: string;
  /** users/{uid}/usage/ocr_YYYY_MM のドキュメントID */
  monthKey: string;
  /** 確定消費済み画像数 */
  count: number;
  /** 確定時に記録されたplan（無い旧データもある） */
  plan?: string;
  capReachedAtMs?: number;
}

export type OcrPlanBucket = 'free' | 'paid_pro' | 'granted_pro';

export interface OcrMeasurementAggregate {
  /** OCR利用UID（measurementが1件でもあるuid） */
  users: { all: number; d7: number; d30: number };
  /** 読取画像数（slotConsumed=true。Free15/Pro300の使用枚数と同一SoT） */
  images: { all: number; d7: number; d30: number };
  /** AI呼出に到達した画像数（失敗・情報なし含む。コスト分析用） */
  attemptedImages: { all: number; d7: number; d30: number };
  /** 利用時プラン別UID（uidは複数バケットに属し得る） */
  planUsers: { free: number; paidPro: number; grantedPro: number };
  /** OCR利用者1人あたり平均消費画像数（非利用者は分母に含めない） */
  avgImages: { free: number | null; paidPro: number | null };
  /** 解析回数深度（distinct analysisId） */
  depth: { once: number; twoPlus: number; fivePlus: number };
  /** 集計対象UID集合（クロス集計用） */
  uids: Set<string>;
}

export interface OcrCapAggregate {
  /** Free月15枚到達UID（freeプランのusage月ドキュメントでcount>=15） */
  freeReached: number;
  /** freeReachedに計上されたuid集合（転換計算用） */
  freeReachedUids: Set<string>;
  /** Free OCR利用UIDに対する到達率(0-1)。母数0ならnull */
  freeReachRate: number | null;
  /** Pro系(pro/officia)月ドキュメントのcount閾値到達UID数 */
  proGte50: number;
  proGte150: number;
  proGte250: number;
  proReached: number; // 300到達
}

const DAY_MS = 24 * 60 * 60 * 1000;
export const OCR_FREE_MONTHLY_LIMIT = 15;
export const OCR_PRO_MONTHLY_LIMIT = 300;

export function planBucketOf(m: Pick<OcrMeasurementRow, 'plan' | 'isPaid' | 'isGranted'>): OcrPlanBucket {
  if (m.isPaid === true || m.plan === 'pro') return 'paid_pro';
  if (m.isGranted === true || m.plan === 'officia') return 'granted_pro';
  return 'free';
}

/** usage月ドキュメントのplan表記を3区分へ正規化（'pro'/'officia'/それ以外） */
function usagePlanBucket(plan: string | undefined, fallback: OcrPlanBucket): OcrPlanBucket {
  if (plan === 'pro') return 'paid_pro';
  if (plan === 'officia') return 'granted_pro';
  if (plan === 'free') return 'free';
  return fallback;
}

export function aggregateOcrMeasurements(rows: OcrMeasurementRow[], now: number): OcrMeasurementAggregate {
  const uidsAll = new Set<string>();
  const uids7 = new Set<string>();
  const uids30 = new Set<string>();
  let imgAll = 0;
  let img7 = 0;
  let img30 = 0;
  let attAll = 0;
  let att7 = 0;
  let att30 = 0;
  const planUids: Record<OcrPlanBucket, Set<string>> = {
    free: new Set(),
    paid_pro: new Set(),
    granted_pro: new Set(),
  };
  const consumedByBucket: Record<OcrPlanBucket, number> = { free: 0, paid_pro: 0, granted_pro: 0 };
  const analysesByUid = new Map<string, Set<string>>();

  for (const r of rows) {
    if (!r.userId) continue;
    uidsAll.add(r.userId);
    attAll += 1;
    if (r.slotConsumed) imgAll += 1;
    if (r.createdAtMs > now - 7 * DAY_MS) { uids7.add(r.userId); att7 += 1; if (r.slotConsumed) img7 += 1; }
    if (r.createdAtMs > now - 30 * DAY_MS) { uids30.add(r.userId); att30 += 1; if (r.slotConsumed) img30 += 1; }

    const bucket = planBucketOf(r);
    planUids[bucket].add(r.userId);
    if (r.slotConsumed) consumedByBucket[bucket] += 1;

    if (r.analysisId) {
      const set = analysesByUid.get(r.userId) || new Set<string>();
      set.add(r.analysisId);
      analysesByUid.set(r.userId, set);
    }
  }

  let once = 0;
  let twoPlus = 0;
  let fivePlus = 0;
  for (const set of analysesByUid.values()) {
    if (set.size >= 5) fivePlus += 1;
    if (set.size >= 2) twoPlus += 1;
    if (set.size === 1) once += 1;
  }

  return {
    users: { all: uidsAll.size, d7: uids7.size, d30: uids30.size },
    images: { all: imgAll, d7: img7, d30: img30 },
    attemptedImages: { all: attAll, d7: att7, d30: att30 },
    planUsers: {
      free: planUids.free.size,
      paidPro: planUids.paid_pro.size,
      grantedPro: planUids.granted_pro.size,
    },
    avgImages: {
      free: planUids.free.size ? consumedByBucket.free / planUids.free.size : null,
      paidPro: planUids.paid_pro.size ? consumedByBucket.paid_pro / planUids.paid_pro.size : null,
    },
    depth: { once, twoPlus, fivePlus },
    uids: uidsAll,
  };
}

/**
 * 月別usageドキュメントから上限到達を集計する。
 * planHints: uid -> 代表プラン区分（usage.plan欠損時のフォールバック。
 * 直近measurementのプランや現在のeffective planを渡す）。
 */
export function aggregateOcrUsageCaps(
  monthRows: OcrUsageMonthRow[],
  planHints: Map<string, OcrPlanBucket>,
  freeLimit = OCR_FREE_MONTHLY_LIMIT,
  proLimit = OCR_PRO_MONTHLY_LIMIT,
  freeOcrUserCount = 0
): OcrCapAggregate {
  const freeReached = new Set<string>();
  const gte50 = new Set<string>();
  const gte150 = new Set<string>();
  const gte250 = new Set<string>();
  const reached300 = new Set<string>();

  for (const row of monthRows) {
    const bucket = usagePlanBucket(row.plan, planHints.get(row.uid) ?? 'free');
    if (bucket === 'free') {
      if (row.count >= freeLimit) freeReached.add(row.uid);
    } else {
      if (row.count >= 50) gte50.add(row.uid);
      if (row.count >= 150) gte150.add(row.uid);
      if (row.count >= 250) gte250.add(row.uid);
      if (row.count >= proLimit) reached300.add(row.uid);
    }
  }

  return {
    freeReached: freeReached.size,
    freeReachedUids: freeReached,
    freeReachRate: freeOcrUserCount > 0 ? freeReached.size / freeOcrUserCount : null,
    proGte50: gte50.size,
    proGte150: gte150.size,
    proGte250: gte250.size,
    proReached: reached300.size,
  };
}

export interface OcrMatchCrossResult {
  /** OCR利用UIDのうち試合登録があるuid数 */
  any: number;
  gte10: number;
  gte50: number;
  gte100: number;
  /** 直近7/30日にanalyticsEvents活動があるuid数 */
  active7: number;
  active30: number;
}

export function computeOcrMatchCross(
  ocrUids: Set<string>,
  matchCountByUid: Map<string, number>,
  lastActivityMsByUid: Map<string, number>,
  now: number
): OcrMatchCrossResult {
  const r: OcrMatchCrossResult = { any: 0, gte10: 0, gte50: 0, gte100: 0, active7: 0, active30: 0 };
  for (const uid of ocrUids) {
    const count = matchCountByUid.get(uid) ?? 0;
    if (count > 0) r.any += 1;
    if (count >= 10) r.gte10 += 1;
    if (count >= 50) r.gte50 += 1;
    if (count >= 100) r.gte100 += 1;
    const last = lastActivityMsByUid.get(uid) ?? 0;
    if (last > now - 7 * DAY_MS) r.active7 += 1;
    if (last > now - 30 * DAY_MS) r.active30 += 1;
  }
  return r;
}

export interface OcrConversionResult {
  /** 利用時plan='free'のmeasurementを持ち、現在paid Proのuid数 */
  formerFreeNowPaidPro: number;
  /** 上記のうち、free時代に月間上限へ到達したことがあるuid数 */
  formerFreeCapNowPaidPro: number;
}

/**
 * Free→Pro転換。過去planの推測は行わず、measurementに保存された
 * 利用時点プラン（plan/isPaid/isGranted）と現在のeffective planを使う。
 * freeCapUids: freeプランで月間上限到達履歴のあるuid集合。
 */
export function computeOcrConversion(
  rows: OcrMeasurementRow[],
  currentPaidProUids: Set<string>,
  freeCapUids: Set<string>
): OcrConversionResult {
  const formerFree = new Set<string>();
  for (const r of rows) {
    if (r.userId && planBucketOf(r) === 'free') formerFree.add(r.userId);
  }
  let paid = 0;
  let capPaid = 0;
  for (const uid of formerFree) {
    if (currentPaidProUids.has(uid)) {
      paid += 1;
      if (freeCapUids.has(uid)) capPaid += 1;
    }
  }
  return { formerFreeNowPaidPro: paid, formerFreeCapNowPaidPro: capPaid };
}
