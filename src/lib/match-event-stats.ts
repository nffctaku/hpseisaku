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

const asStr = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);

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
  const teamIdByPlayer = new Map<string, string>();
  const subMinutes = new Map<string, number>();

  const bump = (map: Map<string, number>, pid: string) => map.set(pid, (map.get(pid) || 0) + 1);
  const noteTeam = (pid: string, teamId?: string) => {
    if (teamId && !teamIdByPlayer.has(pid)) teamIdByPlayer.set(pid, teamId);
  };
  // ロスタイム表記の分を数値化（"90+3" → 93相当ではなく base=90 ルールに合わせる）
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
        noteTeam(scorerId, teamId);
      }
      const assistId = asStr(ev.assistPlayerId);
      if (assistId) {
        bump(assists, assistId);
        involved.add(assistId);
        noteTeam(assistId, teamId);
      }
      continue;
    }

    if (type === "card" || type === "yellow" || type === "red") {
      const pid = asStr(ev.playerId);
      const color = type === "card" ? ev.cardColor : type;
      if (pid && color === "yellow") {
        bump(yellowCards, pid);
        involved.add(pid);
        noteTeam(pid, teamId);
      }
      if (pid && color === "red") {
        bump(redCards, pid);
        involved.add(pid);
        noteTeam(pid, teamId);
      }
      continue;
    }

    if (type === "substitution") {
      const inId = asStr(ev.inPlayerId);
      const outId = asStr(ev.outPlayerId);
      if (inId) {
        involved.add(inId);
        noteTeam(inId, teamId);
        // 行なし選手の出場時間推定（交代INから残り時間。1分でも計上するため最低1）
        const m = baseMinute(ev.minute);
        const cur = subMinutes.get(inId);
        const derived = Math.max(1, matchDuration - m);
        subMinutes.set(inId, cur === undefined ? derived : Math.min(cur, derived));
      }
      if (outId) {
        involved.add(outId);
        noteTeam(outId, teamId);
      }
    }
  }

  return { goals, assists, yellowCards, redCards, involved, teamIdByPlayer, subMinutes };
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
