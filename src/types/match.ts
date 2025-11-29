export interface Player {
  id: string;
  name: string;
  number: number;
  position?: string;
  photoURL?: string;
  teamId?: string;
}

export interface Team {
  id: string;
  name: string;
  logoUrl?: string;
}

export interface MatchEvent {
  id: string;
  type: 'goal' | 'yellow' | 'red' | 'sub_in' | 'sub_out';
  minute: number;
  playerId: string;
  playerName: string;
  teamId: string;
  assistPlayerId?: string | null;
  assistPlayerName?: string | null;
  substitutionReason?: string;
  timestamp: any;
}

export interface CustomStat {
  id: string;
  name: string;
  value: string | number;
}

export interface PlayerStats {
  playerId: string;
  playerName: string;
  position: string;
  teamId?: string;
  rating: number;
  minutesPlayed: number;
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
  customStats: CustomStat[];
}

export interface TeamStat {
  id: string;
  name: string;
  homeValue: string | number;
  awayValue: string | number;
}

export interface Match {
  id: string;
  competitionId: string;
  homeTeam: string;
  awayTeam: string;
  matchDate: string;
  matchTime?: string;
  scoreHome?: number | null;
  scoreAway?: number | null;
}

export interface MatchDetails {
  id: string;
  competitionId: string;
  roundId: string;
  homeTeam: string;
  awayTeam: string;
  homeTeamName: string;
  awayTeamName: string;
  competitionName?: string;
  roundName?: string;
  homeTeamLogo?: string;
  awayTeamLogo?: string;
  matchDate: string;
  matchTime?: string;
  scoreHome?: number | null;
  scoreAway?: number | null;
  userId?: string;
  teamStats?: TeamStat[];
  playerStats?: PlayerStats[];
  homeSquad?: { starters: string[]; substitutes: string[] };
  awaySquad?: { starters: string[]; substitutes: string[] };
}
