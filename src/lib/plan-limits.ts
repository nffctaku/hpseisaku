export type PlanTier = "free" | "pro" | "tm";

export const getPlanTier = (plan?: string | null): PlanTier => {
  const p = typeof plan === "string" ? plan.trim().toLowerCase() : "";
  if (p === "pro") return "pro";
  if (p === "tm") return "tm";
  return "free";
};

type LimitKey =
  | "news_per_club"
  | "videos_per_club"
  | "competitions_per_club"
  | "players_per_team"
  | "player_photos_per_team"
  | "staff_per_season";

const LIMIT_TABLE: Record<LimitKey, Record<PlanTier, number>> = {
  news_per_club: { free: 10, pro: Number.POSITIVE_INFINITY, tm: Number.POSITIVE_INFINITY },
  videos_per_club: { free: 10, pro: Number.POSITIVE_INFINITY, tm: Number.POSITIVE_INFINITY },
  competitions_per_club: { free: 1, pro: 8, tm: Number.POSITIVE_INFINITY },
  players_per_team: { free: 30, pro: 30, tm: Number.POSITIVE_INFINITY },
  player_photos_per_team: { free: 20, pro: 30, tm: Number.POSITIVE_INFINITY },
  staff_per_season: { free: 30, pro: Number.POSITIVE_INFINITY, tm: Number.POSITIVE_INFINITY },
};

export const getPlanLimit = (key: LimitKey, tier: PlanTier): number => {
  return LIMIT_TABLE[key][tier];
};
