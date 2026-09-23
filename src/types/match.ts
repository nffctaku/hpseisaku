export interface Player {
  id: string;
  name: string;
  number: number;
  position?: string;
  photoURL?: string;
  teamId?: string;
  /** OCR読み取り名との対応表（ユーザー確認済みのみ登録） */
  aliases?: string[];
}

export interface Team {
  id: string;
  name: string;
  logoUrl?: string;
}

export interface MatchEvent {
  id: string;
  type: 'goal' | 'card' | 'substitution' | 'note' | 'pk_miss';
  minute: number | string;
  teamId: string;
  playerId?: string;
  playerName?: string;
  assistPlayerId?: string;
  assistPlayerName?: string;
  cardColor?: 'yellow' | 'red';
  inPlayerId?: string;
  inPlayerName?: string;
  outPlayerId?: string;
  outPlayerName?: string;
  text?: string;
  // OCR拡張フィールド（任意・既存データには存在しない）
  /** ゴール種別: PK成功は type:'goal' + goalKind:'penalty' */
  goalKind?: 'open' | 'penalty' | 'own_goal';
  /** 選手名の紐づけ状態: linked=登録選手確定 / name_only=名前のみ / needs_input=要入力 */
  playerLinkStatus?: 'linked' | 'name_only' | 'needs_input';
  /** OCR由来フラグ（重複統合・再解析時の識別用） */
  source?: 'ocr' | 'manual';
  /** アシスト情報なし（未入力）と「アシストなし（確定）」を区別 */
  assistStatus?: 'unknown' | 'none' | 'set';
  /** イベント種別が未確定（要ユーザー確認） */
  needsConfirmation?: boolean;
  /** 原本の時刻表現（例: "45+2"）。minuteが数値化できない場合の保持用 */
  minuteText?: string;
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
  season?: string;
  scoreHome?: number | null;
  scoreAway?: number | null;
  pkScoreHome?: number | null;
  pkScoreAway?: number | null;
  userId?: string;
  teamStats?: TeamStat[];
  playerStats?: PlayerStats[];
  homeSquad?: { starters: string[]; substitutes: string[] };
  awaySquad?: { starters: string[]; substitutes: string[] };
  homeFormation?: string;
  awayFormation?: string;
  events?: MatchEvent[];
  matchDuration?: number; // 試合時間（分）。デフォルト90、延長戦の場合120など
}
