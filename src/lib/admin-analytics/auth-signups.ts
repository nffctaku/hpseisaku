// Firebase Auth 登録ユーザー推移の集計（純粋関数・テスト可能）
// SoT は Firebase Auth の UserRecord.metadata.creationTime。
// Firestoreの作成日時は使わない。disabledユーザーも登録者として含める。

export interface AuthSignupInput {
  uid: string;
  /** metadata.creationTime のエポックms。取得不可は null */
  creationMs: number | null;
}

export interface AuthSignupDay {
  /** JST日付 "YYYY-MM-DD" */
  date: string;
  /** その日の新規登録UID数 */
  count: number;
  /** その日時点の累計登録UID数（全期間の累積） */
  cumulative: number;
}

export interface AuthSignupSummary {
  total: number;
  today: number;
  yesterday: number;
  last7: number;
  prev7: number;
  last30: number;
  /** 直近7日の1日平均 */
  avgPerDay7: number;
  /** 直近7日 vs 前7日の増減率。前7日が0なら null（UIで — 表示） */
  deltaPct7vsPrev7: number | null;
}

export interface AuthSignupAggregate {
  /** Firebase Auth総ユーザー数（UID重複なし・disabled含む） */
  total: number;
  /** creationTimeが取得できなかったUID数 */
  missingCreationTime: number;
  /** 日付昇順の日別系列（登録があった日のみ） */
  series: AuthSignupDay[];
  summary: AuthSignupSummary;
}

const DAY_MS = 24 * 60 * 60 * 1000;

const jstFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** エポックms → JSTの日付キー "YYYY-MM-DD" */
export function jstDayKey(ms: number): string {
  return jstFormatter.format(new Date(ms));
}

/** JST日付キー → その日のJST 00:00 のエポックms（JST=UTC+9固定、DSTなし） */
export function jstDayStartMs(dayKey: string): number {
  return Date.parse(`${dayKey}T00:00:00+09:00`);
}

/** dayKey から n日前のJST日付キー */
export function jstDayShift(dayKey: string, days: number): string {
  return jstDayKey(jstDayStartMs(dayKey) + days * DAY_MS);
}

export function aggregateAuthSignups(
  records: AuthSignupInput[],
  nowMs: number
): AuthSignupAggregate {
  const seenUids = new Set<string>();
  const countByDay = new Map<string, number>();
  let missingCreationTime = 0;

  for (const r of records) {
    // 同一UIDは1回のみカウント
    if (!r.uid || seenUids.has(r.uid)) continue;
    seenUids.add(r.uid);

    if (r.creationMs === null || !Number.isFinite(r.creationMs)) {
      missingCreationTime += 1;
      continue;
    }
    const key = jstDayKey(r.creationMs);
    countByDay.set(key, (countByDay.get(key) ?? 0) + 1);
  }

  const series: AuthSignupDay[] = [];
  let cumulative = 0;
  for (const date of Array.from(countByDay.keys()).sort()) {
    cumulative += countByDay.get(date) ?? 0;
    series.push({ date, count: countByDay.get(date) ?? 0, cumulative });
  }

  const todayKey = jstDayKey(nowMs);
  const yesterdayKey = jstDayShift(todayKey, -1);
  const last7Keys = new Set(
    Array.from({ length: 7 }, (_, i) => jstDayShift(todayKey, -i))
  );
  const prev7Keys = new Set(
    Array.from({ length: 7 }, (_, i) => jstDayShift(todayKey, -7 - i))
  );
  const last30Keys = new Set(
    Array.from({ length: 30 }, (_, i) => jstDayShift(todayKey, -i))
  );

  let today = 0;
  let yesterday = 0;
  let last7 = 0;
  let prev7 = 0;
  let last30 = 0;
  for (const [day, count] of countByDay) {
    if (day === todayKey) today += count;
    if (day === yesterdayKey) yesterday += count;
    if (last7Keys.has(day)) last7 += count;
    if (prev7Keys.has(day)) prev7 += count;
    if (last30Keys.has(day)) last30 += count;
  }

  return {
    total: seenUids.size,
    missingCreationTime,
    series,
    summary: {
      total: seenUids.size,
      today,
      yesterday,
      last7,
      prev7,
      last30,
      avgPerDay7: last7 / 7,
      deltaPct7vsPrev7: prev7 === 0 ? null : (last7 - prev7) / prev7,
    },
  };
}
