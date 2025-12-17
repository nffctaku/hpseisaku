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
  teamId: string;
  teamName: string;
  contractStartDate: string; // or Date
  contractEndDate: string; // or Date
  transfers?: Transfer[];
  // 所属シーズン（複数シーズンにまたがる場合もある）
  seasons?: string[];
  // HP に表示するかどうか（未設定は表示扱い）
  isPublished?: boolean;
}
