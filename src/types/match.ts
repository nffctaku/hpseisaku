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
  type: 'goal' | 'og' | 'card' | 'substitution' | 'note';
  minute: number;
  teamId: string;
  playerId?: string;
  assistPlayerId?: string;
  cardColor?: 'yellow' | 'red';
  inPlayerId?: string;
  outPlayerId?: string;
  text?: string;
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
  pkScoreHome?: number | null;
  pkScoreAway?: number | null;
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
  competitionLogoUrl?: string;
  roundName?: string;
  homeTeamLogo?: string;
  awayTeamLogo?: string;
  matchDate: string;
  matchTime?: string;
  scoreHome?: number | null;
  scoreAway?: number | null;
  pkScoreHome?: number | null;
  pkScoreAway?: number | null;
  userId?: string;
  teamStats?: TeamStat[];
  playerStats?: PlayerStats[];
  homeSquad?: { starters: string[]; substitutes: string[] };
  awaySquad?: { starters: string[]; substitutes: string[] };
  events?: MatchEvent[];
  matchDuration?: number; // 試合時間（分）。デフォルト90、延長戦の場合120など
}
