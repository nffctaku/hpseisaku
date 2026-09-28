// 選手登録の操作計測（analyticsEvents の player_* イベント）集計ロジック。
// API / UI から分離して検証可能にするため、ここでは I/O を持たない純粋関数のみ。

export const PLAYER_OPS_EVENT_NAMES = [
  "player_page_view",
  "player_create_start",
  "player_save_attempt",
  "player_save_success",
  "player_save_failed",
  // 選手保存成功後の写真同期失敗（ファネルには含めない補助イベント）
  "player_photo_sync_failed",
] as const;

export type PlayerOpsEventName = (typeof PLAYER_OPS_EVENT_NAMES)[number];

export interface PlayerOpsEventRow {
  eventName: string;
  userId: string | null;
  createdAtMs: number | null;
  properties: Record<string, unknown>;
}

export interface PlayerOpsStageCounts {
  // UID 単位の重複排除済み人数
  uniqueUsers: number;
  // イベント件数（同一ユーザーの複数操作を含む）
  eventCount: number;
}

export interface PlayerOpsFunnel {
  pageView: PlayerOpsStageCounts;
  createStart: PlayerOpsStageCounts;
  saveAttempt: PlayerOpsStageCounts;
  saveSuccess: PlayerOpsStageCounts;
  saveFailed: PlayerOpsStageCounts;
}

export interface PlayerOpsUnobserved {
  // 画面訪問（visitId）のうち create_start が観測されなかった数
  visitsWithoutCreateStart: number;
  // create_start の操作（operationId）のうち save_attempt が観測されなかった数
  opsStartedWithoutAttempt: number;
  // save_attempt（attemptId）のうち success / failed が観測されなかった数
  attemptsWithoutOutcome: number;
  // save_attempt 件数（分母参照用）
  totalAttempts: number;
  // create_start 件数（分母参照用）
  totalOperationsStarted: number;
  // page_view 訪問数（分母参照用）
  totalVisits: number;
}

export interface PlayerOpsFailureBreakdown {
  failureCode: string;
  failurePoint: string;
  // 試行（イベント）件数
  count: number;
  // 失敗した試行のユニークユーザー数
  uniqueUsers: number;
}

export interface PlayerOpsSummary {
  // 計測対象期間内の対象イベント総数
  totalEvents: number;
  all: PlayerOpsFunnel;
  // teamKind === "own" のみ（自チーム操作に限定した分析用）
  ownTeam: PlayerOpsFunnel;
  // teamKind 別のイベント件数（内訳把握用）
  eventCountByTeamKind: Record<"own" | "opponent" | "unknown" | string, number>;
  unobserved: PlayerOpsUnobserved;
  failures: PlayerOpsFailureBreakdown[];
  // 選手保存成功後に写真同期のみ失敗した補助イベント（作成自体は成功）
  photoSyncFailed: PlayerOpsStageCounts;
}

function propString(props: Record<string, unknown>, key: string): string | null {
  const v = props[key];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function countStages(events: PlayerOpsEventRow[], name: PlayerOpsEventName): PlayerOpsStageCounts {
  const users = new Set<string>();
  let count = 0;
  for (const e of events) {
    if (e.eventName !== name) continue;
    count += 1;
    if (e.userId) users.add(e.userId);
  }
  return { uniqueUsers: users.size, eventCount: count };
}

function funnel(events: PlayerOpsEventRow[]): PlayerOpsFunnel {
  return {
    pageView: countStages(events, "player_page_view"),
    createStart: countStages(events, "player_create_start"),
    saveAttempt: countStages(events, "player_save_attempt"),
    saveSuccess: countStages(events, "player_save_success"),
    saveFailed: countStages(events, "player_save_failed"),
  };
}

// measurementStartMs 以降のイベントのみ集計。過去の行動は復元できないため、
// 計測開始前は一律に除外する。
export function aggregatePlayerOps(
  events: PlayerOpsEventRow[],
  measurementStartMs: number
): PlayerOpsSummary {
  const names = new Set<string>(PLAYER_OPS_EVENT_NAMES);
  const scoped = events.filter(
    (e) =>
      names.has(e.eventName) &&
      typeof e.createdAtMs === "number" &&
      Number.isFinite(e.createdAtMs) &&
      e.createdAtMs >= measurementStartMs
  );

  const byTeamKind: Record<string, number> = { own: 0, opponent: 0, unknown: 0 };
  for (const e of scoped) {
    const kind = propString(e.properties, "teamKind") || "unknown";
    byTeamKind[kind] = (byTeamKind[kind] || 0) + 1;
  }

  const ownScoped = scoped.filter((e) => propString(e.properties, "teamKind") === "own");

  // 未観測カウントは同一IDの突合で算出（別イベントの人数を割った転換率ではない）
  const viewVisitIds = new Set<string>();
  const startVisitIds = new Set<string>();
  const startOpIds = new Set<string>();
  const attemptOpIds = new Set<string>();
  const attemptIds = new Set<string>();
  const outcomeAttemptIds = new Set<string>();

  for (const e of scoped) {
    const props = e.properties;
    switch (e.eventName) {
      case "player_page_view": {
        const v = propString(props, "visitId");
        if (v) viewVisitIds.add(v);
        break;
      }
      case "player_create_start": {
        const v = propString(props, "visitId");
        const op = propString(props, "operationId");
        if (v) startVisitIds.add(v);
        if (op) startOpIds.add(op);
        break;
      }
      case "player_save_attempt": {
        const op = propString(props, "operationId");
        const at = propString(props, "attemptId");
        if (op) attemptOpIds.add(op);
        if (at) attemptIds.add(at);
        break;
      }
      case "player_save_success":
      case "player_save_failed": {
        const at = propString(props, "attemptId");
        if (at) outcomeAttemptIds.add(at);
        break;
      }
    }
  }

  let visitsWithoutCreateStart = 0;
  for (const v of viewVisitIds) if (!startVisitIds.has(v)) visitsWithoutCreateStart += 1;
  let opsStartedWithoutAttempt = 0;
  for (const op of startOpIds) if (!attemptOpIds.has(op)) opsStartedWithoutAttempt += 1;
  let attemptsWithoutOutcome = 0;
  for (const at of attemptIds) if (!outcomeAttemptIds.has(at)) attemptsWithoutOutcome += 1;

  const failureMap = new Map<string, PlayerOpsFailureBreakdown & { users: Set<string> }>();
  for (const e of scoped) {
    if (e.eventName !== "player_save_failed") continue;
    const code = propString(e.properties, "failureCode") || "unknown";
    const point = propString(e.properties, "failurePoint") || "unknown";
    const key = `${point}:${code}`;
    const cur = failureMap.get(key) || {
      failureCode: code,
      failurePoint: point,
      count: 0,
      uniqueUsers: 0,
      users: new Set<string>(),
    };
    cur.count += 1;
    if (e.userId) cur.users.add(e.userId);
    failureMap.set(key, cur);
  }
  const failures = Array.from(failureMap.values())
    .map(({ users, ...rest }) => ({ ...rest, uniqueUsers: users.size }))
    .sort((a, b) => b.count - a.count || a.failureCode.localeCompare(b.failureCode));

  return {
    totalEvents: scoped.length,
    all: funnel(scoped),
    ownTeam: funnel(ownScoped),
    eventCountByTeamKind: byTeamKind,
    unobserved: {
      visitsWithoutCreateStart,
      opsStartedWithoutAttempt,
      attemptsWithoutOutcome,
      totalAttempts: attemptIds.size,
      totalOperationsStarted: startOpIds.size,
      totalVisits: viewVisitIds.size,
    },
    failures,
    photoSyncFailed: countStages(scoped, "player_photo_sync_failed"),
  };
}
