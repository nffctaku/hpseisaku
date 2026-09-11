import { MatchEvent } from "@/types/match";

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
  return [...events].filter(isGoalEvent).sort((a, b) => (a.minute ?? 0) - (b.minute ?? 0));
}

function goalEventSuffix(event: MatchEvent): string {
  const t = normalizeEventType(event.type);
  if (t === "og" || t === "owngoal" || t === "own" || t === "og" || t === "ＯＧ" || t === "オウンゴール") return "（OG）";
  if (t === "pk" || t === "penalty" || t === "pen" || t === "ＰＫ") return "（PK）";
  // Some stores mark PK/OG as sub-type property rather than main type
  const raw = event as any;
  if (raw?.isOwnGoal === true || raw?.ownGoal === true) return "（OG）";
  if (raw?.isPenalty === true || raw?.penalty === true) return "（PK）";
  return "";
}

export function formatGoalScorersText(events?: MatchEvent[], emptyText = "得点なし"): string {
  const goals = getGoalEvents(events);
  if (goals.length === 0) return emptyText;
  return goals.map((e) => `${e.playerName || "不明"} ${e.minute}'${goalEventSuffix(e)}`).join("、");
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
  return raw?.isOwnGoal === true || raw?.ownGoal === true;
}

export function isPenaltyEvent(event: MatchEvent | { type?: unknown }): boolean {
  const t = normalizeEventType(event.type);
  if (["pk", "penalty", "pen", "ＰＫ"].includes(t)) return true;
  const raw = event as any;
  return raw?.isPenalty === true || raw?.penalty === true;
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
