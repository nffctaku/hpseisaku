// 登録後の利用段階（オンボーディング到達段階）の判定ロジック。
// 画面表示から分離し、単体テスト可能な純粋関数として実装する。
// 集計単位は Firebase Auth UID。段階は「保存データから確認できる現在の利用状態」を示し、
// 「離脱」を意味しない。到達段階は排他的に1つだけ付与する。

export type OnboardingStage =
  | 'no_initial_data' // 初期データなし: Career・profile・uid直下データのいずれも確認できない
  | 'no_own_team' // 自チーム未作成: Careerまたは旧形式profileはあるが自チームがない
  | 'no_players' // 選手未登録: 自チームはあるが選手0人
  | 'no_match_result' // 初試合結果未記録: 選手はいるが結果記録済み試合0件
  | 'result_1' // 試合結果1件
  | 'result_2_9' // 試合結果2〜9件
  | 'result_10plus' // 試合結果10件以上
  | 'undeterminable'; // 判定不能: 紐付け不明・取得失敗など

export const ONBOARDING_STAGES: OnboardingStage[] = [
  'no_initial_data',
  'no_own_team',
  'no_players',
  'no_match_result',
  'result_1',
  'result_2_9',
  'result_10plus',
  'undeterminable',
];

export const ONBOARDING_STAGE_LABELS: Record<OnboardingStage, string> = {
  no_initial_data: '初期データなし',
  no_own_team: '自チーム未作成',
  no_players: '選手未登録',
  no_match_result: '初試合結果未記録',
  result_1: '試合結果1件',
  result_2_9: '試合結果2〜9件',
  result_10plus: '試合結果10件以上',
  undeterminable: '判定不能',
};

// 段階判定に使うCareer1件分の入力。ownTeamCount/playerCount はそのCareerのデータルート
// (clubUid) 直下の「自チーム」に限定した値であり、対戦相手チーム・その選手は含まない。
// 別Careerのデータを組み合わせない。
export interface StageCareerInput {
  careerId: string;
  name: string;
  clubUid: string;
  status: string;
  // 自チームとして解決できたチーム数（profile.mainTeamId / isMain / doc.id===clubUid で解決）
  ownTeamCount: number;
  // 自チーム配下の選手数（対戦相手チームの選手は含まない）
  playerCount: number;
  // 複数チーム存在するが自チームを特定できない（紐付け不明）
  ownTeamAmbiguous?: boolean;
  // チーム1件のみで目印がなく自チームと推定した
  ownTeamAssumed?: boolean;
}

export interface LegacyRootInput {
  ownTeamCount: number;
  playerCount: number;
  ownTeamAmbiguous?: boolean;
  ownTeamAssumed?: boolean;
}

export interface UserStageInput {
  // careersドキュメントが1件でも存在するか（status問わず・creating/deleted含む）
  hasCareerDoc: boolean;
  // club_profilesドキュメントが1件でも存在するか
  hasProfileDoc: boolean;
  // 段階評価対象のCareer（status !== 'creating' のみ。deletedはデータ残存のため含む）
  careers: StageCareerInput[];
  // Careerを持たない旧形式ユーザー向け: uid直下のデータルートの値
  legacyRoot: LegacyRootInput | null;
  // 結果記録済み試合数（UID単位・全評価対象ルート合算・共有ルート重複なし）
  resultMatchCount: number;
  // 日程のみ試合数（同集計範囲）
  scheduledMatchCount: number;
}

export interface UserStageResult {
  stage: OnboardingStage;
  // 初期設定段階の判定に使ったCareer（最も進んでいるもの）。Careerなし旧形式は null
  usedCareerId: string | null;
  usedCareerName: string | null;
  usedCareerIsLegacyRoot: boolean;
  // 判定に使用したCareerの自チーム有無・選手数（別Careerの値を混ぜない）
  hasTeam: boolean;
  stagePlayerCount: number;
  notes: string[];
}

// Careerの初期設定進行度: 1=Careerのみ / 2=自チームあり / 3=自チームに選手あり
function setupRank(c: { ownTeamCount: number; playerCount: number }): number {
  if (c.playerCount > 0) return 3;
  if (c.ownTeamCount > 0) return 2;
  return 1;
}

type Candidate = { id: string | null; name: string | null; isLegacy: boolean; rank: number; ownTeamCount: number; playerCount: number; assumed: boolean };

export function evaluateUserStage(input: UserStageInput): UserStageResult {
  const notes: string[] = [];
  const { resultMatchCount, scheduledMatchCount } = input;

  // 初期設定が最も進んでいる評価対象Careerを選ぶ（同率は先頭。共有ルートは同一値）
  // 自チームを特定できない（ambiguous）Careerは段階評価から除外する
  let best: Candidate = {
    id: null,
    name: null,
    isLegacy: false,
    rank: 0,
    ownTeamCount: 0,
    playerCount: 0,
    assumed: false,
  };
  let sawAmbiguous = false;
  for (const c of input.careers) {
    if (c.ownTeamAmbiguous) {
      sawAmbiguous = true;
      continue;
    }
    const rank = setupRank(c);
    if (rank > best.rank) {
      best = { id: c.careerId, name: c.name, isLegacy: false, rank, ownTeamCount: c.ownTeamCount, playerCount: c.playerCount, assumed: c.ownTeamAssumed === true };
    }
  }
  if (input.careers.length === 0 && input.legacyRoot) {
    if (input.legacyRoot.ownTeamAmbiguous) {
      sawAmbiguous = true;
    } else {
      const rank = setupRank(input.legacyRoot);
      if (rank > 0) {
        best = { id: null, name: null, isLegacy: true, rank, ownTeamCount: input.legacyRoot.ownTeamCount, playerCount: input.legacyRoot.playerCount, assumed: input.legacyRoot.ownTeamAssumed === true };
      }
    }
  }
  // 全Careerがambiguous（自チームを特定できない）場合のみ、ambiguousが残る
  const allAmbiguous =
    input.careers.length > 0 && input.careers.every((c) => c.ownTeamAmbiguous);
  const legacyOnlyAmbiguous =
    input.careers.length === 0 && input.legacyRoot?.ownTeamAmbiguous === true;

  const hasInitialData =
    input.hasCareerDoc ||
    input.hasProfileDoc ||
    input.careers.length > 0 ||
    (input.legacyRoot !== null && (input.legacyRoot.ownTeamCount > 0 || input.legacyRoot.playerCount > 0 || input.legacyRoot.ownTeamAmbiguous === true));

  // 結果記録済み試合がある場合は件数による段階を優先する。
  // 上流データが欠けていても選手未登録等へ戻さない（欠損は注意事項で扱う）。
  let stage: OnboardingStage;
  if (resultMatchCount >= 10) {
    stage = 'result_10plus';
    if (best.rank < 3) notes.push('結果記録済みだが初期設定データが一部欠損（上流段階へは戻しません）');
  } else if (resultMatchCount >= 2) {
    stage = 'result_2_9';
    if (best.rank < 3) notes.push('結果記録済みだが初期設定データが一部欠損（上流段階へは戻しません）');
  } else if (resultMatchCount === 1) {
    stage = 'result_1';
    if (best.rank < 3) notes.push('結果記録済みだが初期設定データが一部欠損（上流段階へは戻しません）');
  } else if (allAmbiguous || legacyOnlyAmbiguous) {
    // チームは存在するが自チームを特定できない → 判定不能
    stage = 'undeterminable';
    notes.push('複数チームが存在するが自チームを特定できない（mainTeamId/isMain未設定）');
  } else if (!hasInitialData) {
    stage = 'no_initial_data';
    if (scheduledMatchCount > 0) notes.push('初期データ未検出だが日程試合が存在（紐付け要確認）');
  } else if (best.rank >= 3) {
    stage = 'no_match_result';
    if (scheduledMatchCount > 0) notes.push('日程のみ試合あり・結果未記録');
  } else if (best.rank === 2) {
    stage = 'no_players';
    if (scheduledMatchCount > 0) notes.push('日程のみ試合あり・選手未登録のため段階判定に注意');
  } else {
    stage = 'no_own_team';
    if (sawAmbiguous) notes.push('別のCareerで自チームを特定できないチーム群あり');
  }
  if (best.assumed) notes.push('自チームを推定（チーム1件のみ・目印なし）');

  return {
    stage,
    usedCareerId: best.id,
    usedCareerName: best.name,
    usedCareerIsLegacyRoot: best.isLegacy,
    hasTeam: best.ownTeamCount > 0,
    stagePlayerCount: best.playerCount,
    notes,
  };
}

// ---- 登録からの経過日数バケット ----
// Auth登録日時(creationTime)基準。JST表示・実経過時間で判定する。
export type AgeBucket =
  | 'lt24h' // 24時間未満
  | 'd1_3' // 24時間以上〜3日未満
  | 'd3_7' // 3日以上〜7日未満
  | 'd7_14' // 7日以上〜14日未満
  | 'd14_30' // 14日以上〜30日未満
  | 'd30plus' // 30日以上
  | 'unknown'; // 登録日時不明

export const AGE_BUCKETS: AgeBucket[] = ['lt24h', 'd1_3', 'd3_7', 'd7_14', 'd14_30', 'd30plus', 'unknown'];

export const AGE_BUCKET_LABELS: Record<AgeBucket, string> = {
  lt24h: '24時間未満',
  d1_3: '1〜3日未満',
  d3_7: '3〜7日未満',
  d7_14: '7〜14日未満',
  d14_30: '14〜30日未満',
  d30plus: '30日以上',
  unknown: '登録日時不明',
};

const DAY = 24 * 60 * 60 * 1000;

export function ageBucket(registeredMs: number | null, now: number): AgeBucket {
  if (registeredMs === null || !Number.isFinite(registeredMs) || registeredMs <= 0) return 'unknown';
  const elapsed = now - registeredMs;
  if (elapsed < DAY) return 'lt24h';
  if (elapsed < 3 * DAY) return 'd1_3';
  if (elapsed < 7 * DAY) return 'd3_7';
  if (elapsed < 14 * DAY) return 'd7_14';
  if (elapsed < 30 * DAY) return 'd14_30';
  return 'd30plus';
}

// 補助集計: 自チーム選手数バケット（段階判定に使用したCareerの選手数）
export type PlayerBucket = '0' | '1_4' | '5_10' | '11_19' | '20plus';

export const PLAYER_BUCKETS: PlayerBucket[] = ['0', '1_4', '5_10', '11_19', '20plus'];

export const PLAYER_BUCKET_LABELS: Record<PlayerBucket, string> = {
  '0': '0人',
  '1_4': '1〜4人',
  '5_10': '5〜10人',
  '11_19': '11〜19人',
  '20plus': '20人以上',
};

export function playerBucket(count: number): PlayerBucket {
  if (count <= 0) return '0';
  if (count <= 4) return '1_4';
  if (count <= 10) return '5_10';
  if (count <= 19) return '11_19';
  return '20plus';
}
