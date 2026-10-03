// Shared minutesPlayed derivation from substitution events.
// Used by PlayerStatsTable (live recalc) and EventForm/handleDeleteEvent
// (Firestore writes outside the squad form) so both paths compute identically.

interface MinuteEventLike {
  type?: string;
  minute?: number | string;
  teamId?: string;
  outPlayerId?: string;
  outPlayerName?: string;
  inPlayerId?: string;
  inPlayerName?: string;
}

// 名前のみ（ID未紐付け）イベントの選手IDを一意に解決するリゾルバ。
// 共通実装は match-event-resolve.ts の buildPlayerNameResolver。
export type MinuteNameResolver = (
  name: string | undefined | null,
  teamId?: string
) => string | undefined;

interface PlayerStatLike {
  playerId?: string;
  teamId?: string;
  role?: string;
  minutesPlayed?: number;
  [key: string]: unknown;
}

// "45+2" / 45.001 / "95" / 95 などの表現をソート・比較用の数値へ変換する。
// minute は実データ上 number と string("90+3" 等) が混在するため必ずここを通す。
export const minuteSortValue = (minute: unknown): number => {
  if (typeof minute === 'number' && Number.isFinite(minute)) return minute;
  const { base, stoppage } = parseMinute(minute);
  return base + stoppage / 100;
};

// イベント配列のうち時刻が最も進んでいるイベントの minute を返す（追加フォームの初期値用）。
// minute が無いイベントしかない／イベント0件の場合は 0。
export const lastEventMinute = (events: readonly unknown[] | null | undefined): unknown => {
  let best: unknown = null;
  let bestSort = -Infinity;
  for (const e of events ?? []) {
    const m = (e as { minute?: unknown } | null | undefined)?.minute;
    if (m === undefined || m === null || m === "") continue;
    const s = minuteSortValue(m);
    if (Number.isFinite(s) && s > bestSort) {
      bestSort = s;
      best = m;
    }
  }
  return best ?? 0;
};

// minute を分選択ピッカーの数値形式へ正規化する（ロスタイムは base + extra/1000、例: "45+2"→45.002）。
export const minuteToPickerValue = (minute: unknown): number => {
  if (typeof minute === "number" && Number.isFinite(minute)) return minute;
  const { base, stoppage } = parseMinute(minute);
  return base + stoppage / 1000;
};

const parseMinute = (minute: unknown): { base: number; stoppage: number } => {
  const minuteStr = typeof minute === 'string' ? minute : String(minute ?? '');
  if (minuteStr.includes('+')) {
    const [b, s] = minuteStr.split('+');
    return { base: parseInt(b, 10) || 0, stoppage: parseInt(s, 10) || 0 };
  }
  return { base: parseInt(minuteStr, 10) || 0, stoppage: 0 };
};

// OUT (starter) minutes for a team: earliest sub-out minute, with stoppage-time rules.
export function deriveStarterMinutes(
  events: MinuteEventLike[],
  teamId: string,
  matchDuration: number,
  resolvePlayer?: MinuteNameResolver
): Map<string, number> {
  const out = new Map<string, number>();
  const halfTime = matchDuration / 2;
  events
    .filter((ev) => ev?.type === 'substitution')
    .forEach((ev) => {
      const outId = (typeof ev?.outPlayerId === 'string' && ev.outPlayerId)
        ? ev.outPlayerId
        : (resolvePlayer?.(ev?.outPlayerName, teamId) ?? '');
      if (!outId || ev?.teamId !== teamId) return;
      const { base, stoppage } = parseMinute(ev?.minute);
      let calculated: number;
      if (base === halfTime && stoppage > 0) {
        calculated = halfTime;
      } else if (base === matchDuration && stoppage > 0) {
        calculated = matchDuration;
      } else {
        const m = typeof ev?.minute === 'number' ? ev.minute : Number(ev?.minute);
        calculated = Number.isFinite(m) ? Math.max(0, Math.floor(m)) : 0;
      }
      const cur = out.get(outId);
      out.set(outId, typeof cur === 'number' ? Math.min(cur, calculated) : calculated);
    });
  return out;
}

// IN (bench) minutes for a team.
export function deriveBenchMinutes(
  events: MinuteEventLike[],
  teamId: string,
  matchDuration: number,
  resolvePlayer?: MinuteNameResolver
): Map<string, number> {
  const inMap = new Map<string, number>();
  const halfTime = matchDuration / 2;
  events
    .filter((ev) => ev?.type === 'substitution')
    .forEach((ev) => {
      const inId = (typeof ev?.inPlayerId === 'string' && ev.inPlayerId)
        ? ev.inPlayerId
        : (resolvePlayer?.(ev?.inPlayerName, teamId) ?? '');
      if (!inId || ev?.teamId !== teamId) return;
      const { base, stoppage } = parseMinute(ev?.minute);
      let calculated: number;
      if (base === halfTime && stoppage > 0) {
        calculated = halfTime;
      } else if (base === matchDuration && stoppage > 0) {
        calculated = 1;
      } else {
        calculated = Math.max(0, matchDuration - base);
      }
      inMap.set(inId, calculated);
    });
  return inMap;
}

// Heal stale minutesPlayed: correct ONLY players involved in substitution events
// whose stored minutes differ from the event-derived expected value.
// Players without an event-derived expectation keep their stored value
// (e.g. manually entered minutes are never overwritten).
export function healStaleTeamMinutes<T extends PlayerStatLike>(
  playerStats: T[],
  events: MinuteEventLike[],
  teamId: string,
  matchDuration: number,
  resolvePlayer?: MinuteNameResolver
): T[] {
  const outMap = deriveStarterMinutes(events, teamId, matchDuration, resolvePlayer);
  const inMap = deriveBenchMinutes(events, teamId, matchDuration, resolvePlayer);
  return playerStats.map((ps) => {
    if (!ps || ps.teamId !== teamId || !ps.playerId) return ps;
    const role = ps.role ?? 'starter';
    const expected =
      role === 'starter' ? outMap.get(ps.playerId) : inMap.get(ps.playerId);
    if (expected === undefined || expected === ps.minutesPlayed) return ps;
    return { ...ps, minutesPlayed: expected };
  });
}

// Recompute minutesPlayed for every player of a team given the current events.
// starter: sub-out minute or full matchDuration; sub: sub-in minutes or 0.
export function recomputeTeamMinutes<T extends PlayerStatLike>(
  playerStats: T[],
  events: MinuteEventLike[],
  teamId: string,
  matchDuration: number,
  resolvePlayer?: MinuteNameResolver
): T[] {
  const outMap = deriveStarterMinutes(events, teamId, matchDuration, resolvePlayer);
  const inMap = deriveBenchMinutes(events, teamId, matchDuration, resolvePlayer);
  return playerStats.map((ps) => {
    if (!ps || ps.teamId !== teamId || !ps.playerId) return ps;
    const role = ps.role ?? 'starter';
    let desired: number | undefined;
    if (role === 'starter') desired = outMap.get(ps.playerId) ?? matchDuration;
    else if (role === 'sub') desired = inMap.get(ps.playerId) ?? 0;
    if (desired === undefined || desired === ps.minutesPlayed) return ps;
    return { ...ps, minutesPlayed: desired };
  });
}
