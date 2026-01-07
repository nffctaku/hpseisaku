export interface SeasonRecord {
  season: string;
  points: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  winRate: number;
  homeWins: number;
  awayWins: number;
}

export interface PlayerStats {
  playerId: string;
  playerName: string;
  goals: number;
  assists: number;
  matches: number;
}

export interface MainStats {
  id: string;
  name: string;
  isPercentage: boolean;
  total: number;
  average: number;
}

export interface Match {
  id: string;
  isCompleted: boolean;
  // 他のマッチ関連のプロパティ
}

export interface Competition {
  id: string;
  name: string;
  season?: string;
}
