import { WC2026_GROUPS, WC2026_MATCHES } from "./data";
import {
  computeGroupStandings,
  safeParseJson,
  toScoreNumber,
  WC2026_RESULTS_STORAGE_KEY,
  type ResultsByMatchId,
} from "./results";

export type MatchPredictionsByMatchId = Record<string, { homeScore: string; awayScore: string }>;

export type GroupPredictions = Record<string, string[]>;

export type Wc2026PointsBreakdown = {
  matchPoints: number;
  groupPoints: number;
  totalPoints: number;
};

function outcomeOfScore(h: number, a: number) {
  if (h > a) return "H" as const;
  if (h < a) return "A" as const;
  return "D" as const;
}

export function computeMatchPoints({
  prediction,
  result,
}: {
  prediction: { homeScore: string; awayScore: string } | undefined;
  result: { homeScore: string; awayScore: string } | undefined;
}) {
  const ph = toScoreNumber(prediction?.homeScore ?? "");
  const pa = toScoreNumber(prediction?.awayScore ?? "");
  const rh = toScoreNumber(result?.homeScore ?? "");
  const ra = toScoreNumber(result?.awayScore ?? "");

  if (ph === null || pa === null) return 0;
  if (rh === null || ra === null) return 0;

  if (ph === rh && pa === ra) return 50;

  const po = outcomeOfScore(ph, pa);
  const ro = outcomeOfScore(rh, ra);
  if (po !== ro) return 0;

  const predDiff = ph - pa;
  const resDiff = rh - ra;

  if (predDiff === resDiff || ph === rh || pa === ra) return 30;
  return 20;
}

export function computeGroupPoints({
  groupPredictions,
  results,
}: {
  groupPredictions: GroupPredictions;
  results: ResultsByMatchId;
}) {
  const standings = computeGroupStandings({ groups: WC2026_GROUPS, matches: WC2026_MATCHES, results });

  let pts = 0;
  for (const [groupKey, rows] of Object.entries(standings)) {
    const predicted = Array.isArray(groupPredictions[groupKey]) ? groupPredictions[groupKey] : [];
    const first = rows[0];
    const second = rows[1];
    if (first && predicted.includes(first.teamId)) pts += 20;
    if (second && predicted.includes(second.teamId)) pts += 20;
  }

  return pts;
}

export function computeWc2026Points({
  matchPredictions,
  groupPredictions,
  results,
}: {
  matchPredictions: MatchPredictionsByMatchId;
  groupPredictions: GroupPredictions;
  results: ResultsByMatchId;
}): Wc2026PointsBreakdown {
  let matchPoints = 0;

  for (const m of WC2026_MATCHES) {
    matchPoints += computeMatchPoints({ prediction: matchPredictions[m.id], result: results[m.id] });
  }

  const groupPoints = computeGroupPoints({ groupPredictions, results });
  return { matchPoints, groupPoints, totalPoints: matchPoints + groupPoints };
}

export function loadOfficialResultsFromLocalStorage(): ResultsByMatchId {
  const parsed = safeParseJson<ResultsByMatchId>(localStorage.getItem(WC2026_RESULTS_STORAGE_KEY));
  if (!parsed || typeof parsed !== "object") return {};
  return parsed;
}
