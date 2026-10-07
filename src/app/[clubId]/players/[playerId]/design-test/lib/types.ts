export type SimplePlayerStats = {
  appearances: number;
  minutes: number;
  goals: number;
  assists: number;
  avgRating?: number | null;
};

export type SeasonCompetitionStatsRow = {
  competitionId: string;
  competitionName: string;
  competitionLogoUrl?: string;
  format?: string;
  stats: SimplePlayerStats;
};

export type PlayerSeasonSummaryRow = {
  season: string;
  stats: SimplePlayerStats;
};

export type SeasonCompetitionBreakdownRow = {
  competitionId: string;
  competitionName: string;
  competitionLogoUrl?: string;
  format?: string;
  stats: SimplePlayerStats;
};

export type PlayerSeasonBreakdownRow = {
  season: string;
  competitions: SeasonCompetitionBreakdownRow[];
  total: SimplePlayerStats;
};
