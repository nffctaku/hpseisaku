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

/**
 * FC26/FC27 選手評価画面のスクリーンショットから
 * 選手名・評価点・G/AST を抽出するためのプロンプト
 */
export const RATINGS_IMAGE_ANALYSIS_PROMPT = `この画像はサッカーゲーム（FC26/FC27）の試合後の選手評価画面です。
画像内の情報だけを読み取り、下記のJSON形式のみで返してください。説明文、Markdown、コードブロックは禁止です。

【読み取りルール】
- 各選手行の「選手名」「評価点」「G（ゴール数）」「A（アシスト数）」を読み取る
- 選手名は画面に表示された表記をそのまま返す（例: "M. Gibbs-White"）
- 評価点が "N/A" や未表示の選手は rating に null を返す。0に変換しない
- G/A が未表示・読み取れない場合は null（0に推測しない）
- 画面上部のチーム名・スコアも読み取る
- 選手成績画面に「選択中選手とチーム」の比較欄がある場合、それはホーム/アウェイのチームスタッツではない。比較欄の数値をチームスタッツとして出力しない
- 憶測で補完しない

【必ずこのJSON構造で返す】
{
  "kind": "ratings",
  "match": {
    "home_team": string | null,
    "away_team": string | null,
    "score_home": number | null,
    "score_away": number | null
  },
  "players": [
    {
      "name": string,
      "rating": number | null,
      "goals": number | null,
      "assists": number | null,
      "team_side": "home" | "away" | null
    }
  ]
}`;

/**
 * FC26/FC27 試合イベント（マッチイベント/スコアラー）画面のスクリーンショットから
 * ゴール・PK・交代・カードを抽出するためのプロンプト
 */
export const EVENTS_IMAGE_ANALYSIS_PROMPT = `この画像はサッカーゲーム（FC26/FC27）の試合イベント一覧画面です。
画像内の情報だけを読み取り、下記のJSON形式のみで返してください。説明文、Markdown、コードブロックは禁止です。

【読み取りルール】
- 各行の「時刻（分）」「イベント種別」「選手名」「チーム側（home/away）」を読み取る
- 選手名は画面に表示された表記をそのまま返す
- 時刻は "24'" → minute: 24、"45+2'" → minute: "45+2" のように返す。読めない場合は null
- 画面上部の経過時間表示はキックオフ時刻ではない。match_timeとして記録しない
- 画面上部のチーム名・スコアも読み取る
- 交代は OUT選手→IN選手 のペアで読み取る。片方だけ読めない場合はその側を null にする
- 交代の表記ルール: 上下に並んだ2名のうち、緑の上向き矢印（▲）が付いた上側の選手が IN（途中出場）、赤の下向き矢印（▼）が付いた下側の選手が OUT（途中交代）。左右に別チームの交代が同時に並ぶ場合は、必ず同じ側（home=左、away=右）の上下ペアで組む。別チームの選手同士をペアにしてはいけない
- team_sideは選手名の表示位置で判定する。画面中央の時刻軸より左側に表示される選手・イベントは home、右側は away。同一時刻に左右両側に選手が並ぶ場合は、それぞれ別のイベントとして出力する
- 憶測で補完しない

【イベント種別とアイコン判定】
時刻の横に表示される丸いアイコンをよく見て判定する。ボール系アイコンは「サッカーボール」と「ボールに重なる小さな記号」で構成される。記号はボールの右側〜右下に小さく重なって表示される:
- ボールのみ（記号なし）→ "goal"（通常ゴール）
- ボール＋小さなチェック（✓。斜め下から右上へ上がる折れ線。緑または白）→ "pk_success"（PK成功。得点に含める）
- ボール＋小さなバツ（×。2本の交差線）→ "pk_miss"（PK失敗。得点に含めない）
- 交代矢印アイコン（緑▲と赤▼の上下ペア）→ "substitution"
- 四角い札（黄色）→ "yellow_card"
- 四角い札（赤）→ "red_card"
- 【重要】ボールに重なる小さな記号（✓・×）はカードではない。同一時刻の片側がカードでも、反対側のアイコンがボールならカードに読み替えない。ボールの記号を判別できない場合は "unknown" とし、カードに推測しない
- アイコンが不鮮明で記号の有無・種類を判別できない場合は "unknown" にし、推測でgoalにしない
- オウンゴールと思われるものは "own_goal" とし、確信がなければ "unknown"
- 【重要】ボール＋小さな記号のイベントはPK関連であり、交代ではない。substitutionは必ず上下に並んだ2名の選手（▲IN/▼OUT）のペアが見える場合のみ。ボール+記号をsubstitutionと読み違えて、別の時刻の交代選手とペアにしてはいけない

【必ずこのJSON構造で返す】
{
  "kind": "events",
  "match": {
    "home_team": string | null,
    "away_team": string | null,
    "score_home": number | null,
    "score_away": number | null
  },
  "events": [
    {
      "minute": number | string | null,
      "type": "goal" | "pk_success" | "pk_miss" | "substitution" | "yellow_card" | "red_card" | "own_goal" | "unknown",
      "team_side": "home" | "away" | null,
      "player_name": string | null,
      "out_player_name": string | null,
      "in_player_name": string | null,
      "assist_name": string | null
    }
  ]
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

// ===== OCR拡張スキーマ（選手評価・試合イベント） =====

export interface OcrMatchInfo {
  home_team: string | null;
  away_team: string | null;
  score_home: number | null;
  score_away: number | null;
}

export interface OcrPlayerRating {
  name: string;
  rating: number | null;
  goals: number | null;
  assists: number | null;
  team_side: 'home' | 'away' | null;
}

export interface RatingsImageAnalysisResult {
  kind: 'ratings';
  match: OcrMatchInfo;
  players: OcrPlayerRating[];
}

export type OcrEventType =
  | 'goal'
  | 'pk_success'
  | 'pk_miss'
  | 'substitution'
  | 'yellow_card'
  | 'red_card'
  | 'own_goal'
  | 'unknown';

export interface OcrMatchEvent {
  minute: number | string | null;
  type: OcrEventType;
  team_side: 'home' | 'away' | null;
  player_name: string | null;
  out_player_name: string | null;
  in_player_name: string | null;
  assist_name: string | null;
}

export interface EventsImageAnalysisResult {
  kind: 'events';
  match: OcrMatchInfo;
  events: OcrMatchEvent[];
}

export type OcrImageKind = 'team_stats' | 'ratings' | 'events';
export type OcrAnalysisResult =
  | StatsImageAnalysisResult
  | RatingsImageAnalysisResult
  | EventsImageAnalysisResult;

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
