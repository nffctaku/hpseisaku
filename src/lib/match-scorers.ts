import { MatchEvent } from "@/types/match";
import { minuteSortValue } from "@/lib/match-minutes";

const GOAL_TYPE_VALUES = [
  "goal",
  "g",
  "point",
  "得点",
  "gole", // common typo/translation
  "pk",
  "penalty",
  "pen",
  "og",
  "owngoal",
  "own",
  "own goal",
  "ゴール",
  "ＰＫ",
  "ＯＧ",
];

function normalizeEventType(type: unknown): string {
  return String(type || "").toLowerCase().trim().replace(/[\s　]/g, "");
}

export function isGoalEvent(event: MatchEvent | { type?: unknown; minute?: number }): boolean {
  return GOAL_TYPE_VALUES.includes(normalizeEventType(event.type));
}

export function getGoalEvents(events?: MatchEvent[]): MatchEvent[] {
  if (!events || events.length === 0) return [];
  return [...events].filter(isGoalEvent).sort((a, b) => minuteSortValue(a.minute) - minuteSortValue(b.minute));
}

export function goalEventSuffix(event: MatchEvent): string {
  const t = normalizeEventType(event.type);
  if (t === "og" || t === "owngoal" || t === "own" || t === "og" || t === "ＯＧ" || t === "オウンゴール") return "（OG）";
  if (t === "pk" || t === "penalty" || t === "pen" || t === "ＰＫ") return "（PK）";
  // Some stores mark PK/OG as sub-type property rather than main type
  const raw = event as any;
  if (raw?.isOwnGoal === true || raw?.ownGoal === true || raw?.goalKind === 'own_goal') return "（OG）";
  if (raw?.isPenalty === true || raw?.penalty === true || raw?.goalKind === 'penalty') return "（PK）";
  return "";
}

export function formatGoalScorersText(events?: MatchEvent[], emptyText = "得点なし"): string {
  const goals = getGoalEvents(events);
  if (goals.length === 0) return emptyText;
  return goals.map((e) => `${e.playerName || "不明"} ${e.minute}'${goalEventSuffix(e)}`).join("、");
}

// スコア下の得点者名を解決する（公開・管理画面で共通）。
// 優先順位: 紐付き選手の登録名 → イベントに保存された playerName（未紐付け名）→ 空欄。
export function resolveScorerName(
  event: { playerId?: string; playerName?: string },
  lookupName?: (playerId: string) => string | undefined
): string {
  if (event.playerId) {
    const registered = lookupName?.(event.playerId);
    if (registered) return registered;
  }
  return event.playerName || "";
}

// イベント一覧の選手名を解決する（公開・管理画面で共通）。
// 優先順位: 紐付き選手の登録名 → イベントに保存された名前（未紐付けの自由入力名）→ なし。
// custom_ プレフィックスIDは登録選手でないため保存名をそのまま使う。
export function resolveEventPlayerName(
  playerId: string | undefined,
  savedName: string | undefined,
  lookupName: (playerId: string) => string | undefined
): string | undefined {
  if (playerId) {
    if (playerId.startsWith('custom_')) return savedName;
    const registered = lookupName(playerId);
    if (registered) return registered;
  }
  return savedName;
}

function getSideLabel(
  event: MatchEvent,
  options: {
    selfTeamId?: string;
    selfLabel?: string;
    opponentLabel?: string;
    homeTeam?: string;
    awayTeam?: string;
    homeTeamName?: string;
    awayTeamName?: string;
  }
): string {
  if (options.selfTeamId) {
    return event.teamId === options.selfTeamId ? options.selfLabel || "自クラブ" : options.opponentLabel || "対戦相手";
  }
  if (options.homeTeam && options.homeTeamName && options.awayTeamName) {
    return event.teamId === options.homeTeam ? options.homeTeamName : options.awayTeamName;
  }
  return event.teamId || "";
}

export function formatGoalEventsForPrompt(
  events: MatchEvent[] | undefined,
  options: {
    selfTeamId?: string;
    selfLabel?: string;
    opponentLabel?: string;
    homeTeam?: string;
    awayTeam?: string;
    homeTeamName?: string;
    awayTeamName?: string;
    showAssist?: boolean;
    missingText?: string;
  } = {}
): string {
  const goals = getGoalEvents(events);
  if (goals.length === 0) return options.missingText || "得点情報は登録されていません。";

  return goals
    .map((e) => {
      const side = getSideLabel(e, options);
      let line = `${e.minute}分 ${side} ${e.playerName || "不明"}${goalEventSuffix(e)}`;
      if (options.showAssist !== false && e.assistPlayerName) {
        line += ` （アシスト: ${e.assistPlayerName}）`;
      }
      return line;
    })
    .join("\n");
}

export function isOwnGoalEvent(event: MatchEvent | { type?: unknown }): boolean {
  const t = normalizeEventType(event.type);
  if (["og", "owngoal", "own", "ＯＧ", "オウンゴール"].includes(t)) return true;
  const raw = event as any;
  return raw?.isOwnGoal === true || raw?.ownGoal === true || raw?.goalKind === 'own_goal';
}

export function isPenaltyEvent(event: MatchEvent | { type?: unknown }): boolean {
  const t = normalizeEventType(event.type);
  if (["pk", "penalty", "pen", "ＰＫ"].includes(t)) return true;
  const raw = event as any;
  return raw?.isPenalty === true || raw?.penalty === true || raw?.goalKind === 'penalty';
}

export function getMatchGoalSummary(
  match: { events?: MatchEvent[]; scoreHome?: number | null; scoreAway?: number | null },
  noEventsText = "得点者情報：未登録",
  zeroZeroText = "得点なし"
): string {
  const hasEvents = Array.isArray(match.events);
  const scoreHome = match.scoreHome ?? null;
  const scoreAway = match.scoreAway ?? null;
  const isZeroZero = scoreHome === 0 && scoreAway === 0;

  if (!hasEvents) {
    return isZeroZero ? zeroZeroText : noEventsText;
  }

  const goals = getGoalEvents(match.events);
  if (goals.length === 0) {
    return isZeroZero ? zeroZeroText : "得点なし";
  }

  return formatGoalScorersText(goals);
}
