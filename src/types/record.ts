export interface CompetitionForRecord {
  id: string;
  name: string;
  logoUrl?: string;
}

export interface ClubRecord {
  id: string;
  season: string;
  competition: CompetitionForRecord;
  result: string;
}
