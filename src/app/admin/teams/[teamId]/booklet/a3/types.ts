export type SlotKey = `l${number}` | `r${number}`;

export type ActiveKey = SlotKey | `e${number}`;

export type StatRow = {
  season: string;
  league: string;
  rank: string;
};

export type CupRow = {
  tournament: string;
  result: string;
};

export type TransferRow = {
  date: string;
  playerName: string;
  type: string;
  fromTo: string;
};

export type CoachInfo = {
  name: string;
  bio: string;
};

export type StaffDoc = {
  id: string;
  name?: string;
  position?: string;
  seasons?: string[];
  isPublished?: boolean;
};

export type LayoutState = {
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
