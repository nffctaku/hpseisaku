"use client";

type SlotKey = `l${number}` | `r${number}`;

 type CupRow = {
  tournament: string;
  result: string;
 };

type LayoutState = {
  slots: Record<SlotKey, string | null>;
  extras: string[];
  leagueCompetitionName: string | null;
  cups: CupRow[];
};

export function createEmptyLayout(): LayoutState {
  const slots: Record<string, string | null> = {};
  for (let i = 0; i < 9; i++) slots[`l${i}`] = null;
  for (let i = 0; i < 15; i++) slots[`r${i}`] = null;
  return {
    slots: slots as LayoutState["slots"],
    extras: [],
    leagueCompetitionName: null,
    cups: Array.from({ length: 2 }).map(() => ({ tournament: "", result: "" })),
  };
}

export function toCompetitionSeasonLabel(season: string): string | null {
  const s = String(season || "").trim();
  const m = s.match(/^(\d{4})[-/](\d{2})$/);
  if (!m) return null;
  return `${m[1]}/${m[2]}`;
}

export function last5Seasons(season: string): string[] {
  const label = toCompetitionSeasonLabel(season);
  if (!label) return [];
  const m = label.match(/^(\d{4})\/(\d{2})$/);
  if (!m) return [];
  const start = Number(m[1]);
  if (!Number.isFinite(start)) return [];
  const out: string[] = [];
  for (let i = 0; i < 5; i++) {
    const y = start - i;
    const end2 = String((y + 1) % 100).padStart(2, "0");
    out.push(`${y}/${end2}`);
  }
  return out;
}
