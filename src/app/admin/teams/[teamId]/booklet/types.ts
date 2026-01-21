export type BookletPlayer = {
  id: string;
  name: string;
  number: number | null;
  position: string;
  mainPosition?: string;
  subPositions?: string[];
  nationality?: string;
  age?: number | null;
  height?: number | null;
  weight?: number | null;
  tenureYears?: number;
  contractEndMonth?: number | null;
  contractEndDate?: string;
  preferredFoot?: string;
  lastSeasonSummary?: string;
  memo?: string;
  profile?: string;
  photoUrl?: string;
  params?: { overall: number; items: Array<{ label: string; value: number }> } | null;
  isNew?: boolean;
};

export type BookletTransferRow = {
  type: string;
  position: string;
  playerName: string;
  fromTo: string;
};

export type BookletResponse = {
  seasonId: string;
  teamId: string;
  teamName: string;
  club: { clubName: string; logoUrl: string | null };
  players: BookletPlayer[];
  transfersIn?: BookletTransferRow[];
  transfersOut?: BookletTransferRow[];
};

export type PositionColors = {
  GK: string;
  DF: string;
  MF: string;
  FW: string;
};

export type ColorOption = {
  name: string;
  value: string;
};
