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
  teamId: string;
  teamName: string;
  contractStartDate: string; // or Date
  contractEndDate: string; // or Date
  transfers?: Transfer[];
}
