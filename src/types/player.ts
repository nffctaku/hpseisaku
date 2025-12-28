export interface Transfer {
  id: string;
  fromTeamId: string;
  fromTeamName: string;
  toTeamId: string;
  toTeamName: string;
  date: string; // or Date
  type: 'transfer' | 'loan' | 'free' | 'end_of_loan';
  fee?: number;
}

export interface PlayerSnsLinks {
  x?: string;
  youtube?: string;
  tiktok?: string;
  instagram?: string;
}

export interface PlayerParameterItem {
  label: string;
  value?: number;
}

export interface PlayerParameters {
  overall?: number;
  items: PlayerParameterItem[];
}

export interface ManualCompetitionStat {
  competitionId: string;
  matches?: number;
  minutes?: number;
  goals?: number;
  assists?: number;
  yellowCards?: number;
  redCards?: number;
  avgRating?: number;
}

export interface PlayerSeasonData {
  number?: number;
  position?: "GK" | "DF" | "MF" | "FW";
  nationality?: string;
  age?: number;
  height?: number;
  photoUrl?: string;
  snsLinks?: PlayerSnsLinks;
  params?: PlayerParameters;
  manualCompetitionStats?: ManualCompetitionStat[];
  isPublished?: boolean;
}

export interface Player {
  id: string;
  name: string;
  number: number;
  position: "GK" | "DF" | "MF" | "FW";
  nationality: string;
  birthDate: string; // or Date
  age: number;
  height: number; // in cm
  weight: number; // in kg
  preferredFoot: 'left' | 'right' | 'both';
  photoUrl?: string;
  snsLinks?: PlayerSnsLinks;
  params?: PlayerParameters;
  manualCompetitionStats?: ManualCompetitionStat[];
  teamId: string;
  teamName: string;
  contractStartDate: string; // or Date
  contractEndDate: string; // or Date
  transfers?: Transfer[];
  // 所属シーズン（複数シーズンにまたがる場合もある）
  seasons?: string[];

  // シーズン別の上書きデータ（選択シーズンの編集/表示に使用）
  seasonData?: Record<string, PlayerSeasonData>;

  // HP に表示するかどうか（未設定は表示扱い）
  isPublished?: boolean;
}
