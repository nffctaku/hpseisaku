// Rank label normalization.
// Two historical formats exist in stored competition docs:
//   canonical: { name?, from, to, color: "green" | "red" | ... }
//   legacy:    { name, startRank, endRank, color: "#1fd760" | ... }
// Readers (standings API, league table, edit form) expect the canonical form.

export const RANK_LABEL_COLOR_VALUES = [
  "green",
  "red",
  "orange",
  "blue",
  "yellow",
  "purple",
  "pink",
  "gray",
] as const;

export type RankLabelColorName = (typeof RANK_LABEL_COLOR_VALUES)[number];

export interface RankLabel {
  name?: string;
  from: number;
  to: number;
  color: RankLabelColorName;
}

const HEX_TO_NAME: Record<string, RankLabelColorName> = {
  "#1fd760": "green",
  "#ef4444": "red",
  "#facc15": "yellow",
  "#3b82f6": "blue",
  "#a855f7": "purple",
};

const NAME_SET = new Set<string>(RANK_LABEL_COLOR_VALUES);

function normalizeColor(raw: unknown): RankLabelColorName {
  const c = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (NAME_SET.has(c)) return c as RankLabelColorName;
  return HEX_TO_NAME[c] ?? "gray";
}

export function normalizeRankLabel(raw: unknown): RankLabel | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const from = Number(r.from ?? r.startRank);
  const to = Number(r.to ?? r.endRank);
  if (!Number.isInteger(from) || !Number.isInteger(to) || from <= 0 || to <= 0 || from > to) {
    return null;
  }
  const name =
    typeof r.name === "string" && r.name.trim().length > 0
      ? r.name.trim()
      : typeof r.label === "string" && r.label.trim().length > 0
        ? r.label.trim()
        : undefined;
  return { name, from, to, color: normalizeColor(r.color) };
}

export function normalizeRankLabels(raw: unknown): RankLabel[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(normalizeRankLabel)
    .filter((r): r is RankLabel => r !== null)
    .slice(0, 5);
}
