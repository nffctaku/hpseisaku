// 選手登録操作計測の純粋ロジック（Firebase 非依存・テスト可能）。
// I/O を持つ関数は player-analytics.ts に置く。

export type PlayerTeamKind = "own" | "opponent" | "unknown";
export type PlayerCreateMethod = "manual_form" | "bulk_csv";
export type PlayerSaveFailurePoint = "form_validation" | "validation" | "plan_limit" | "write";

export interface ResolvedTeamKind {
  kind: PlayerTeamKind;
  // 自チームと推定したが明示的な目印（mainTeamId/isMain/旧形式ID）がない場合 true
  assumed: boolean;
}

export interface TeamKindFacts {
  mainTeamId?: string | null;
  thisTeamExists: boolean;
  thisTeamIsMain: boolean;
  teamId: string;
  clubUid: string;
  teamCount: number;
  mainCount: number;
}

// 対戦相手チームも clubs/{clubUid}/teams に保存されるため、teamId だけでは
// 自チームか判定できない。clubs API の自チーム解決と同一優先順位で判定する:
//   1. club_profiles.mainTeamId === teamId
//   2. チームdocの isMain === true
//   3. 旧形式（teamId === clubUid）
//   4. 別チームが main と判明 → このチームは対戦相手
//   5. 有効チームがこの1件のみ → 自チームと推定（assumed）
//   6. 上記で決まらない → unknown
export function classifyPlayerTeamKind(f: TeamKindFacts): ResolvedTeamKind {
  if (typeof f.mainTeamId === "string" && f.mainTeamId && f.mainTeamId === f.teamId) {
    return { kind: "own", assumed: false };
  }
  if (f.thisTeamIsMain) return { kind: "own", assumed: false };
  if (f.teamId === f.clubUid) return { kind: "own", assumed: false };
  if (typeof f.mainTeamId === "string" && f.mainTeamId && f.mainTeamId !== f.teamId) {
    return { kind: "opponent", assumed: false };
  }
  if (f.mainCount >= 1) return { kind: "opponent", assumed: false };
  if (f.thisTeamExists && f.teamCount === 1) return { kind: "own", assumed: true };
  return { kind: "unknown", assumed: false };
}

// firstPlayerCreatedAt（真の初回登録日時）を記録してよいかの判定。
// 保証できないケース（計測前登録ユーザー・計測後の削除→再作成・別Careerに既存選手）
// はすべて false になり、firstObservedPlayerCreatedAt のみが残る。
export function shouldRecordFirstPlayerCreatedAt(params: {
  // 今回の作成が「計測開始後に初めて観測した作成成功」か
  wasFirstObserved: boolean;
  registeredAtMs: number | null;
  measurementStartMs: number;
  // UID全体（全Career＋旧形式ルート）の自チーム選手数（今回作成分を含む。失敗時null）
  ownPlayerTotalAfterCreate: number | null;
}): boolean {
  if (!params.wasFirstObserved) return false;
  if (params.registeredAtMs === null || params.registeredAtMs < params.measurementStartMs) {
    return false;
  }
  return params.ownPlayerTotalAfterCreate === 1;
}

// Firestore/HTTP のエラーを、生メッセージを含まない安定コードに分類する。
export function classifySaveFailureCode(error: unknown): string {
  const code = (error as { code?: unknown })?.code;
  if (typeof code === "string" && /^[a-z][a-z0-9-_/]{0,60}$/i.test(code)) {
    return code;
  }
  return "unknown";
}
