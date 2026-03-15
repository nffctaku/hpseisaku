export type Team = {
  id: string;
  code: string;
  name: string;
};

export type Match = {
  id: string;
  kickoffLabel: string;
  home: Team;
  away: Team;
};

export type MatchPrediction = {
  homeScore: string;
  awayScore: string;
  reason: string;
};

export type PredictionsByMatchId = Record<string, MatchPrediction>;

export type GroupPredictions = Record<string, string[]>;

export const STORAGE_KEYS = {
  match: "wc2026:matchPredictions:v2",
  group: "wc2026:groupPredictions:v2",
} as const;

export function safeParseJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function clampScoreInput(v: string) {
  const cleaned = v.replace(/[^0-9]/g, "");
  if (cleaned === "") return "";
  const n = Math.max(0, Math.min(99, Number(cleaned)));
  return Number.isFinite(n) ? String(n) : "";
}

export function resolveTeamAbbrev(team: Team) {
  return team.name.startsWith("FIFA") ? "F" : team.code;
}
