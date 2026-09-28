"use client";

import { collection, doc, getDoc, getDocs, type Firestore } from "firebase/firestore";
import { trackEvent, setFirstObservedPlayerCreateOnce } from "@/lib/analytics";
import {
  classifyPlayerTeamKind,
  type ResolvedTeamKind,
} from "@/lib/player-analytics-core";

export {
  classifyPlayerTeamKind,
  classifySaveFailureCode,
  type PlayerCreateMethod,
  type PlayerSaveFailurePoint,
  type PlayerTeamKind,
  type ResolvedTeamKind,
  type TeamKindFacts,
} from "@/lib/player-analytics-core";

export type PlayerAnalyticsEventName =
  | "player_page_view"
  | "player_create_start"
  | "player_save_attempt"
  | "player_save_success"
  | "player_save_failed"
  // 選手保存成功後の写真同期失敗のみを分離記録する補助イベント
  | "player_photo_sync_failed";

export const PLAYER_ANALYTICS_EVENT_NAMES: readonly PlayerAnalyticsEventName[] = [
  "player_page_view",
  "player_create_start",
  "player_save_attempt",
  "player_save_success",
  "player_save_failed",
  "player_photo_sync_failed",
];

export function newAnalyticsId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    // ignore
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

// 計測失敗が選手保存や操作を止めないよう、必ず例外を飲む fire-and-forget ラッパー。
// 氏名・フォーム入力値・生のエラーメッセージは payload に含めない。
export function trackPlayerEvent(
  eventName: PlayerAnalyticsEventName,
  userId: string | null,
  properties: Record<string, unknown>
): void {
  try {
    void trackEvent(eventName, userId, properties).catch(() => undefined);
  } catch {
    // ignore
  }
}

export async function resolvePlayerTeamKind(
  firestore: Firestore,
  clubUid: string,
  teamId: string
): Promise<ResolvedTeamKind> {
  try {
    const profileSnap = await getDoc(doc(firestore, "club_profiles", clubUid));
    const mainTeamId = profileSnap.exists()
      ? (profileSnap.data() as Record<string, unknown>).mainTeamId
      : undefined;

    const teamSnap = await getDoc(doc(firestore, `clubs/${clubUid}/teams/${teamId}`));
    const teamData = teamSnap.exists() ? (teamSnap.data() as Record<string, unknown>) : undefined;

    const factsBase = {
      mainTeamId: typeof mainTeamId === "string" ? mainTeamId : null,
      thisTeamExists: teamSnap.exists(),
      thisTeamIsMain: teamData?.isMain === true,
      teamId,
      clubUid,
    };

    // 早期確定できる場合は一覧取得をスキップする
    const quick = classifyPlayerTeamKind({ ...factsBase, teamCount: -1, mainCount: -1 });
    if (quick.kind !== "unknown" && !quick.assumed) {
      return quick;
    }

    const teamsSnap = await getDocs(collection(firestore, `clubs/${clubUid}/teams`));
    let mainCount = 0;
    let teamCount = 0;
    for (const d of teamsSnap.docs) {
      teamCount += 1;
      if ((d.data() as Record<string, unknown>).isMain === true) mainCount += 1;
    }
    return classifyPlayerTeamKind({ ...factsBase, teamCount, mainCount });
  } catch {
    return { kind: "unknown", assumed: false };
  }
}

// 自チームへの新規選手保存成功時に呼ぶ記録。
// 「計測開始後に初めて観測した自チーム選手の作成成功日時」を
// users/{uid}.playerOpsMeasurement.firstObservedPlayerCreatedAt に記録する。
// - トランザクションで「未設定なら設定、設定済みなら上書きしない」
// - 書き込みが失敗しても次回の作成成功時に再度試行される
//   （過去の失敗した作成日時そのものは復元できない点に注意）
// - 既存の activation.firstPlayerCreatedAt には一切書き込まない
//   （真の初回登録日時は過去分を含めて保証できないため）
// 戻り値: 今回新規設定できたか（既存値がある/失敗時は false）
export async function recordFirstObservedPlayerCreate(uid: string): Promise<boolean> {
  try {
    return await setFirstObservedPlayerCreateOnce(uid);
  } catch (e) {
    console.warn("[player-analytics] recordFirstObservedPlayerCreate failed", e);
    return false;
  }
}
