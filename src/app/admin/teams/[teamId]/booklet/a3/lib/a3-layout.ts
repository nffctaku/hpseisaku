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
  bioTitle: string;
  bioBody: string;
  cups: CupRow[];
  formationName: string | null;
  starters: Record<string, string | null>;
  positionColors: {
    GK: string;
    DF: string;
    MF: string;
    FW: string;
  };
  coachStaffId: string | null;
};

export function createEmptyLayout(): LayoutState {
  const slots: Record<string, string | null> = {};
  for (let i = 0; i < 12; i++) slots[`l${i}`] = null;
  for (let i = 0; i < 12; i++) slots[`r${i}`] = null;
  return {
    slots: slots as LayoutState["slots"],
    extras: [],
    leagueCompetitionName: null,
    bioTitle: "",
    bioBody: "",
    cups: Array.from({ length: 8 }).map(() => ({ tournament: "", result: "" })),
    formationName: "4-4-2",
    starters: {},
    positionColors: {
      GK: "bg-rose-300",
      DF: "bg-blue-300",
      MF: "bg-green-300",
      FW: "bg-orange-300",
    },
    coachStaffId: null,
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
