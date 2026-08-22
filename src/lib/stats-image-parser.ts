/**
 * FC26/FC27 試合結果スタッツ画面のスクリーンショットから
 * チームスタッツを自動抽出するための画像解析プロンプト
 */

export const STATS_IMAGE_ANALYSIS_PROMPT = `この画像はサッカーゲーム（FC26/FC27）の試合結果スタッツ画面（概要タブ）です。
画像内の数値だけを読み取り、下記のJSON形式のみで返してください。説明文、Markdown、コードブロックは禁止です。

【読み取りルール】
- 画面中央の日本語ラベルを基準に、左側の数値をhome、右側の数値をawayとして扱う
- ラベル行と同じ高さにある左右の数値だけをそのラベルの値として読む
- チーム名は画面上部の左右チーム名をそのまま読む
- スコアは画面上部の左右得点を読む
- 数値が空欄、非表示、読み取れない項目はnullにする
- 憶測で補完しない
- 小数は小数のまま返す（例: 0.9）
- パーセント記号がある項目は数値のみ返す（例: 85% → 85）

【ラベル対応】
- 支配率 → team_stats.possession
- ボール奪取 → team_stats.ball_recovery_time_sec
- シュート → team_stats.shots
- ゴール期待値 → team_stats.expected_goals
- パス → team_stats.passes
- タックル → team_stats.tackles
- タックル成功 → team_stats.tackles_won
- インターセプト → team_stats.interceptions
- ファウル → team_stats.fouls_committed
- オフサイド → team_stats.offsides
- コーナーキック → team_stats.corners
- フリーキック → team_stats.free_kicks
- PK → team_stats.penalty_kicks
- イエロー → team_stats.yellow_cards
- ドリブル成功率 → percentage_stats.dribble_success_rate
- シュート精度 / 枠内シュート率 → percentage_stats.shot_accuracy
- パス成功率 → percentage_stats.pass_accuracy

【必ずこのJSON構造で返す】
{
  "match": {
    "home_team": string | null,
    "away_team": string | null,
    "score_home": number | null,
    "score_away": number | null,
    "match_time": string | null
  },
  "team_stats": {
    "possession": { "home": number | null, "away": number | null },
    "ball_recovery_time_sec": { "home": number | null, "away": number | null },
    "shots": { "home": number | null, "away": number | null },
    "expected_goals": { "home": number | null, "away": number | null },
    "passes": { "home": number | null, "away": number | null },
    "tackles": { "home": number | null, "away": number | null },
    "tackles_won": { "home": number | null, "away": number | null },
    "interceptions": { "home": number | null, "away": number | null },
    "saves": { "home": number | null, "away": number | null },
    "fouls_committed": { "home": number | null, "away": number | null },
    "offsides": { "home": number | null, "away": number | null },
    "corners": { "home": number | null, "away": number | null },
    "free_kicks": { "home": number | null, "away": number | null },
    "penalty_kicks": { "home": number | null, "away": number | null },
    "yellow_cards": { "home": number | null, "away": number | null }
  },
  "percentage_stats": {
    "dribble_success_rate": { "home": number | null, "away": number | null },
    "shot_accuracy": { "home": number | null, "away": number | null },
    "pass_accuracy": { "home": number | null, "away": number | null }
  }
}`;

export const TEAM_MATCHING_PROMPT = (registeredTeams: string[]) => `以下はユーザーが登録済みのチーム名リストです：
${JSON.stringify(registeredTeams, null, 2)}

画像から読み取ったチーム名（home_team / away_team）が、上記リストの
どれに該当するか判定してください。略称・表記ゆれ（例: "Nottm Forest" → 
"Nottingham Forest"）も考慮して構いません。

該当するチームが見つかった場合は matched_team_id を返し、
確信が持てない場合は null を返してください（推測で断定しない）。`;

/**
 * 画像解析結果のJSONスキーマ
 */
export interface TeamStatsValue {
  home: number | null;
  away: number | null;
}

export interface MatchInfo {
  home_team: string | null;
  away_team: string | null;
  score_home: number | null;
  score_away: number | null;
  match_time: string | null; // 例: "91:35"
}

export interface TeamStats {
  possession: TeamStatsValue;
  ball_recovery_time_sec: TeamStatsValue;
  shots: TeamStatsValue;
  expected_goals: TeamStatsValue;
  passes: TeamStatsValue;
  tackles: TeamStatsValue;
  tackles_won: TeamStatsValue;
  interceptions: TeamStatsValue;
  saves: TeamStatsValue;
  fouls_committed: TeamStatsValue;
  offsides: TeamStatsValue;
  corners: TeamStatsValue;
  free_kicks: TeamStatsValue;
  penalty_kicks: TeamStatsValue;
  yellow_cards: TeamStatsValue;
}

export interface PercentageStats {
  dribble_success_rate: TeamStatsValue;
  shot_accuracy: TeamStatsValue;
  pass_accuracy: TeamStatsValue;
}

export interface StatsImageAnalysisResult {
  match: MatchInfo;
  team_stats: TeamStats;
  percentage_stats: PercentageStats;
}

export interface TeamMatchResult {
  home_team: string | null;
  away_team: string | null;
  home_team_id: string | null;
  away_team_id: string | null;
}

/**
 * 画像解析結果からチーム名マッチング結果を追加した完全なスキーマ
 */
export interface StatsImageAnalysisWithMatching extends StatsImageAnalysisResult {
  team_matching: TeamMatchResult;
}

/**
 * チーム名マッチング関数
 * 画像から読み取ったチーム名を登録済みチームリストと照合
 */
export function matchTeamNames(
  extractedHomeTeam: string | null,
  extractedAwayTeam: string | null,
  registeredTeams: Array<{ id: string; name: string }>
): TeamMatchResult {
  const normalizeTeamName = (name: string): string => {
    return name.toLowerCase().trim().replace(/\s+/g, ' ');
  };

  const findMatchingTeam = (extractedName: string | null): string | null => {
    if (!extractedName) return null;

    const normalizedExtracted = normalizeTeamName(extractedName);

    // 完全一致
    const exactMatch = registeredTeams.find(
      team => normalizeTeamName(team.name) === normalizedExtracted
    );
    if (exactMatch) return exactMatch.id;

    // 部分一致（略称対応）
    const partialMatch = registeredTeams.find(team => {
      const normalizedRegistered = normalizeTeamName(team.name);
      return (
        normalizedRegistered.includes(normalizedExtracted) ||
        normalizedExtracted.includes(normalizedRegistered)
      );
    });
    if (partialMatch) return partialMatch.id;

    return null;
  };

  return {
    home_team: extractedHomeTeam,
    away_team: extractedAwayTeam,
    home_team_id: findMatchingTeam(extractedHomeTeam),
    away_team_id: findMatchingTeam(extractedAwayTeam),
  };
}
