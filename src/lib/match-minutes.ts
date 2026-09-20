// Shared minutesPlayed derivation from substitution events.
// Used by PlayerStatsTable (live recalc) and EventForm/handleDeleteEvent
// (Firestore writes outside the squad form) so both paths compute identically.

interface MinuteEventLike {
  type?: string;
  minute?: number | string;
  teamId?: string;
  outPlayerId?: string;
  inPlayerId?: string;
}

interface PlayerStatLike {
  playerId?: string;
  teamId?: string;
  role?: string;
  minutesPlayed?: number;
  [key: string]: unknown;
}

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
  matchDuration: number
): Map<string, number> {
  const out = new Map<string, number>();
  const halfTime = matchDuration / 2;
  events
    .filter((ev) => ev?.type === 'substitution')
    .forEach((ev) => {
      const outId = typeof ev?.outPlayerId === 'string' ? ev.outPlayerId : '';
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
  matchDuration: number
): Map<string, number> {
  const inMap = new Map<string, number>();
  const halfTime = matchDuration / 2;
  events
    .filter((ev) => ev?.type === 'substitution')
    .forEach((ev) => {
      const inId = typeof ev?.inPlayerId === 'string' ? ev.inPlayerId : '';
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
  matchDuration: number
): T[] {
  const outMap = deriveStarterMinutes(events, teamId, matchDuration);
  const inMap = deriveBenchMinutes(events, teamId, matchDuration);
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
  matchDuration: number
): T[] {
  const outMap = deriveStarterMinutes(events, teamId, matchDuration);
  const inMap = deriveBenchMinutes(events, teamId, matchDuration);
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
