// match.events から選手別の導出スタッツを計算する純粋ロジック。
// 書き込み側（commitSquadSave / appendMatchEvent / removeMatchEvent / applyOcrResults）と
// 読み取り側（公開SQUAD集計の heal-on-read）が同じ規則を共有するための単一実装。
//
// 規則:
//   - 得点者 = originalPlayerId || "PK(名前)"の名前解決 || playerId
//   - アシスト = assistPlayerId
//   - カード = type 'card'(cardColor) / 旧形式 'yellow' / 'red'
//   - OG(type 'og')・PK失敗(pk_miss)・メモ(note)は個人スタッツに計上しない
//   - custom_*（名前のみ未紐づけ）のIDはここでは除外しない
//     （呼び出し側で登録選手IDと突合するため自動的に無視される）

export interface DerivedPlayerCounts {
  goals: Map<string, number>;
  assists: Map<string, number>;
  yellowCards: Map<string, number>;
  redCards: Map<string, number>;
  /** 得点/アシスト/カード/交代イベントに登場した選手（出場の傍証） */
  involved: Set<string>;
  /** 出場とみなすイベント（得点/アシスト/交代IN/交代OUT）に登場した選手 */
  played: Set<string>;
  /** 選手 → 所属イベントのteamId（最初に見つけたもの） */
  teamIdByPlayer: Map<string, string>;
  /** 交代IN選手の出場時間（minutesPlayed行がない場合の推定値） */
  subMinutes: Map<string, number>;
}

interface EventLike {
  type?: string;
  minute?: number | string;
  teamId?: string;
  playerId?: string;
  playerName?: string;
  assistPlayerId?: string;
  cardColor?: string;
  inPlayerId?: string;
  outPlayerId?: string;
  originalPlayerId?: string;
  [key: string]: unknown;
}

export interface ResolvedPlayerStats {
  minutesPlayed: number | null;
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
  played: boolean;
  isBench: boolean;
}

const asStr = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);

const toNum = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function deriveEventPlayerCounts(
  events: EventLike[] | unknown,
  /** "PK(名前)" を登録選手に解決するための 表示名→playerId マップ（任意） */
  nameToId?: Map<string, string>,
  /** 行なし交代IN選手の出場時間推定に使う試合時間 */
  matchDuration = 90
): DerivedPlayerCounts {
  const goals = new Map<string, number>();
  const assists = new Map<string, number>();
  const yellowCards = new Map<string, number>();
  const redCards = new Map<string, number>();
  const involved = new Set<string>();
  const played = new Set<string>();
  const teamIdByPlayer = new Map<string, string>();
  const subMinutes = new Map<string, number>();

  const bump = (map: Map<string, number>, pid: string) => map.set(pid, (map.get(pid) || 0) + 1);
  const noteTeam = (pid: string, teamId?: string) => {
    if (teamId && !teamIdByPlayer.has(pid)) teamIdByPlayer.set(pid, teamId);
  };
  // ロスタイム表記の分を数値化（"90+3" → 90相当。subMinutesは最低1分を保証）
  const baseMinute = (m: unknown): number => {
    if (typeof m === "number" && Number.isFinite(m)) return Math.floor(m);
    const s = String(m ?? "");
    return s.includes("+") ? parseInt(s.split("+")[0], 10) || 0 : parseInt(s, 10) || 0;
  };

  for (const ev of (Array.isArray(events) ? events : []) as EventLike[]) {
    const type = typeof ev?.type === "string" ? ev.type : "";
    const teamId = asStr(ev.teamId);

    if (type === "goal") {
      const playerName = asStr(ev.playerName) || "";
      const pkName =
        playerName.startsWith("PK(") && playerName.endsWith(")")
          ? playerName.slice(3, -1).trim()
          : undefined;
      const scorerId =
        asStr(ev.originalPlayerId) || (pkName ? nameToId?.get(pkName) : undefined) || asStr(ev.playerId);
      if (scorerId) {
        bump(goals, scorerId);
        involved.add(scorerId);
        played.add(scorerId);
        noteTeam(scorerId, teamId);
      }
      const assistId = asStr(ev.assistPlayerId);
      if (assistId) {
        bump(assists, assistId);
        involved.add(assistId);
        played.add(assistId);
        noteTeam(assistId, teamId);
      }
      continue;
    }

    if (type === "card" || type === "yellow" || type === "red") {
      const pid = asStr(ev.playerId);
      const color = type === "card" ? ev.cardColor : type;
      if (pid) {
        involved.add(pid);
        noteTeam(pid, teamId);
      }
      if (pid && color === "yellow") {
        bump(yellowCards, pid);
      }
      if (pid && color === "red") {
        bump(redCards, pid);
      }
      continue;
    }

    if (type === "substitution") {
      const inId = asStr(ev.inPlayerId);
      const outId = asStr(ev.outPlayerId);
      if (inId) {
        involved.add(inId);
        played.add(inId);
        noteTeam(inId, teamId);
        const m = baseMinute(ev.minute);
        const cur = subMinutes.get(inId);
        const derived = Math.max(1, matchDuration - m);
        subMinutes.set(inId, cur === undefined ? derived : Math.min(cur, derived));
      }
      if (outId) {
        involved.add(outId);
        played.add(outId);
        noteTeam(outId, teamId);
      }
    }
  }

  return { goals, assists, yellowCards, redCards, involved, played, teamIdByPlayer, subMinutes };
}

// 既存 playerStats 行とイベント導出値を統合し、出場・ベンチ判定を付与する。
// 出場時間が記録されていればそれを優先。0分だが出場を示すイベントがある場合は
// 「不明（null）」として扱い、ベンチとは区別する。
export function resolvePlayerMatchStats(
  stat: { playerId?: string; teamId?: string; minutesPlayed?: number | string | null; role?: string | null; goals?: number | string; assists?: number | string; yellowCards?: number | string; redCards?: number | string } | null | undefined,
  derived: DerivedPlayerCounts,
  playerId: string,
  matchDuration = 90
): ResolvedPlayerStats {
  const storedMinutesRaw = stat?.minutesPlayed;
  let storedMinutes: number | null = null;
  if (storedMinutesRaw !== undefined && storedMinutesRaw !== null) {
    const n = Number(storedMinutesRaw);
    if (Number.isFinite(n)) storedMinutes = n;
  }

  const derivedMinutes = derived.subMinutes.get(playerId) ?? null;
  const derivedGoals = derived.goals.get(playerId) || 0;
  const derivedAssists = derived.assists.get(playerId) || 0;
  const derivedYellow = derived.yellowCards.get(playerId) || 0;
  const derivedRed = derived.redCards.get(playerId) || 0;

  const storedGoals = toNum(stat?.goals);
  const storedAssists = toNum(stat?.assists);
  const storedYellow = toNum(stat?.yellowCards);
  const storedRed = toNum(stat?.redCards);

  const goals = Math.max(storedGoals, derivedGoals);
  const assists = Math.max(storedAssists, derivedAssists);
  const yellowCards = Math.max(storedYellow, derivedYellow);
  const redCards = Math.max(storedRed, derivedRed);

  const hasSubIn = derived.subMinutes.has(playerId);
  const hasPlayEvidence = goals > 0 || assists > 0 || hasSubIn;

  let minutesPlayed: number | null;
  if (stat) {
    if (storedMinutes !== null) {
      // 記録が 0 分だが、出場を示すイベントがある場合は「不明」にする
      // （終了間際の途中出場など、記録上 0 分でも出場しているケース）
      if (storedMinutes === 0 && hasPlayEvidence) {
        minutesPlayed = derivedMinutes ?? null;
      } else {
        minutesPlayed = storedMinutes;
      }
    } else {
      minutesPlayed = derivedMinutes ?? (hasPlayEvidence ? null : null);
    }
  } else {
    minutesPlayed = derivedMinutes ?? (hasPlayEvidence ? null : null);
  }

  const role = stat?.role ?? undefined;
  const played =
    role === "starter" ||
    (minutesPlayed !== null && minutesPlayed > 0) ||
    hasPlayEvidence;

  // ベンチと確認できるのは「サブ登録かつ出場を示す情報がない」場合のみ。
  // minutesPlayed === 0 だけでベンチと判定しない（終了間際の途中出場等で 0 分のこともある）。
  const isBench = role === "sub" && !played;

  return { minutesPlayed, goals, assists, yellowCards, redCards, played, isBench };
}

// 選手IDがイベントから参照されているか（削除保護用）。
// 参照フィールド: 得点/カードのplayerId, assistPlayerId, 交代out/in, PKのoriginalPlayerId。
// custom_*（名前のみ未紐づけ）のIDは実選手IDと一致しないため自然に除外される。
export function playerReferencedByEvents(
  events: readonly unknown[] | null | undefined,
  playerId: string
): boolean {
  if (!playerId) return false;
  for (const e of events ?? []) {
    const ev = e as EventLike | null | undefined;
    if (!ev) continue;
    if (
      ev.playerId === playerId ||
      ev.assistPlayerId === playerId ||
      ev.outPlayerId === playerId ||
      ev.inPlayerId === playerId ||
      ev.originalPlayerId === playerId
    ) {
      return true;
    }
  }
  return false;
}

/** playerStats行の表示名から name→id マップを構築（PK(name)解決用） */
export function buildNameToIdFromStats(playerStats: Array<{ playerId?: unknown; playerName?: unknown }> | unknown): Map<string, string> {
  const map = new Map<string, string>();
  for (const ps of (Array.isArray(playerStats) ? playerStats : []) as Array<{ playerId?: unknown; playerName?: unknown }>) {
    if (typeof ps?.playerId === "string" && typeof ps?.playerName === "string" && ps.playerName) {
      map.set(ps.playerName, ps.playerId);
    }
  }
  return map;
}
