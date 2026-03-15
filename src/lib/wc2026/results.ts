import type { Match, Team } from "./data";

export type MatchResult = {
  homeScore: string;
  awayScore: string;
};

export type ResultsByMatchId = Record<string, MatchResult>;

export const WC2026_RESULTS_STORAGE_KEY = "wc2026:results:v1" as const;

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

export function toScoreNumber(v: string) {
  if (v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(99, Math.trunc(n)));
}

export function stepScore(value: string, delta: number) {
  const current = toScoreNumber(value) ?? 0;
  const next = Math.max(0, Math.min(99, current + delta));
  return String(next);
}

export function loadResultsFromLocalStorage(): ResultsByMatchId {
  const parsed = safeParseJson<ResultsByMatchId>(localStorage.getItem(WC2026_RESULTS_STORAGE_KEY));
  if (!parsed || typeof parsed !== "object") return {};
  return parsed;
}

export function saveResultsToLocalStorage(next: ResultsByMatchId) {
  localStorage.setItem(WC2026_RESULTS_STORAGE_KEY, JSON.stringify(next));
}

export type GroupStandingRow = {
  teamId: string;
  teamName: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  gf: number;
  ga: number;
  gd: number;
  pts: number;
};

type HeadToHeadStat = {
  gd: number;
  gf: number;
};

function groupKeyFromKickoffLabel(label: string) {
  const m = label.match(/グループ([A-L])/);
  return m?.[1] ?? null;
}

function makeRow(team: Team): GroupStandingRow {
  return {
    teamId: team.id,
    teamName: team.name,
    played: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    gf: 0,
    ga: 0,
    gd: 0,
    pts: 0,
  };
}

function calcHeadToHeadStats({
  matches,
  results,
  tiedTeamIds,
}: {
  matches: Match[];
  results: ResultsByMatchId;
  tiedTeamIds: string[];
}): Record<string, HeadToHeadStat> {
  const set = new Set(tiedTeamIds);
  const out: Record<string, HeadToHeadStat> = {};
  for (const id of tiedTeamIds) out[id] = { gd: 0, gf: 0 };

  for (const m of matches) {
    if (!set.has(m.home.id) || !set.has(m.away.id)) continue;

    const r = results[m.id];
    const hs = toScoreNumber(r?.homeScore ?? "");
    const as = toScoreNumber(r?.awayScore ?? "");
    if (hs === null || as === null) continue;

    out[m.home.id].gf += hs;
    out[m.away.id].gf += as;
    out[m.home.id].gd += hs - as;
    out[m.away.id].gd += as - hs;
  }

  return out;
}

export function computeGroupStandings({
  groups,
  matches,
  results,
}: {
  groups: Record<string, Team[]>;
  matches: Match[];
  results: ResultsByMatchId;
}): Record<string, GroupStandingRow[]> {
  const standings: Record<string, Record<string, GroupStandingRow>> = {};

  for (const [groupKey, teams] of Object.entries(groups)) {
    standings[groupKey] = {};
    for (const t of teams) standings[groupKey][t.id] = makeRow(t);
  }

  for (const match of matches) {
    const g = groupKeyFromKickoffLabel(match.kickoffLabel);
    if (!g) continue;
    if (!standings[g]) continue;

    const r = results[match.id];
    const hs = toScoreNumber(r?.homeScore ?? "");
    const as = toScoreNumber(r?.awayScore ?? "");
    if (hs === null || as === null) continue;

    const homeRow = standings[g][match.home.id] ?? (standings[g][match.home.id] = makeRow(match.home));
    const awayRow = standings[g][match.away.id] ?? (standings[g][match.away.id] = makeRow(match.away));

    homeRow.played += 1;
    awayRow.played += 1;

    homeRow.gf += hs;
    homeRow.ga += as;
    awayRow.gf += as;
    awayRow.ga += hs;

    if (hs > as) {
      homeRow.wins += 1;
      awayRow.losses += 1;
      homeRow.pts += 3;
    } else if (hs < as) {
      awayRow.wins += 1;
      homeRow.losses += 1;
      awayRow.pts += 3;
    } else {
      homeRow.draws += 1;
      awayRow.draws += 1;
      homeRow.pts += 1;
      awayRow.pts += 1;
    }
  }

  const out: Record<string, GroupStandingRow[]> = {};
  for (const [groupKey, teamMap] of Object.entries(standings)) {
    const rows = Object.values(teamMap).map((row) => ({ ...row, gd: row.gf - row.ga }));

    const groupMatches = matches.filter((m) => groupKeyFromKickoffLabel(m.kickoffLabel) === groupKey);
    const h2hStatsByTeamIdByPts = new Map<number, Record<string, HeadToHeadStat>>();
    const teamIdsByPts = new Map<number, string[]>();

    for (const r of rows) {
      const arr = teamIdsByPts.get(r.pts) ?? [];
      arr.push(r.teamId);
      teamIdsByPts.set(r.pts, arr);
    }

    for (const [pts, tiedTeamIds] of teamIdsByPts.entries()) {
      if (tiedTeamIds.length < 2) continue;
      h2hStatsByTeamIdByPts.set(
        pts,
        calcHeadToHeadStats({ matches: groupMatches, results, tiedTeamIds }),
      );
    }

    rows.sort((a, b) => {
      if (b.pts !== a.pts) return b.pts - a.pts;

      const h2h = h2hStatsByTeamIdByPts.get(a.pts);
      const aH2h = h2h?.[a.teamId];
      const bH2h = h2h?.[b.teamId];
      if (aH2h && bH2h) {
        if (bH2h.gd !== aH2h.gd) return bH2h.gd - aH2h.gd;
        if (bH2h.gf !== aH2h.gf) return bH2h.gf - aH2h.gf;
      }

      if (b.gd !== a.gd) return b.gd - a.gd;
      if (b.gf !== a.gf) return b.gf - a.gf;
      return a.teamName.localeCompare(b.teamName);
    });
    out[groupKey] = rows;
  }

  return out;
}

export function dateTokenOfKickoffLabel(kickoffLabel: string) {
  return kickoffLabel.split(" ")[0] || "";
}
