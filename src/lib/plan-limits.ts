export type PlanTier = "free" | "pro" | "officia";

export const getPlanTier = (plan?: string | null): PlanTier => {
  const p = typeof plan === "string" ? plan.trim().toLowerCase() : "";
  if (p === "pro") return "pro";
  if (p === "officia") return "officia";
  // backward compatibility: legacy TM plan is treated as Officia
  if (p === "tm") return "officia";
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
  news_per_club: { free: 10, pro: Number.POSITIVE_INFINITY, officia: Number.POSITIVE_INFINITY },
  videos_per_club: { free: 10, pro: Number.POSITIVE_INFINITY, officia: Number.POSITIVE_INFINITY },
  competitions_per_club: { free: 1, pro: 8, officia: Number.POSITIVE_INFINITY },
  players_per_team: { free: 30, pro: 30, officia: Number.POSITIVE_INFINITY },
  player_photos_per_team: { free: 20, pro: 30, officia: Number.POSITIVE_INFINITY },
  staff_per_season: { free: 30, pro: Number.POSITIVE_INFINITY, officia: Number.POSITIVE_INFINITY },
};

export const getPlanLimit = (key: LimitKey, tier: PlanTier): number => {
  return LIMIT_TABLE[key][tier];
};
