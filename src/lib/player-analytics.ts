"use client";

import { collection, doc, getDoc, getDocs, type Firestore } from "firebase/firestore";
import { trackEvent, setActivationOnce, setFirstObservedPlayerCreateOnce } from "@/lib/analytics";
import { PLAYER_OPS_MEASUREMENT_START_AT } from "@/lib/analytics-constants";
import {
  classifyPlayerTeamKind,
  shouldRecordFirstPlayerCreatedAt,
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
  shouldRecordFirstPlayerCreatedAt,
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

// UIDが持つ全データルート（全CareerのclubUid＋旧形式のuid直下）の自チーム選手数を合計。
// 別Careerの選手を見落とさないためUID単位で評価する。1ルートでも読み取りに
// 失敗したら証明不能とみなし null を返す。
export async function countOwnTeamPlayersAcrossRoots(
  firestore: Firestore,
  uid: string,
  careerClubUids: string[]
): Promise<number | null> {
  const roots = Array.from(new Set([uid, ...careerClubUids.filter(Boolean)]));
  let total = 0;
  try {
    for (const root of roots) {
      const profileSnap = await getDoc(doc(firestore, "club_profiles", root));
      const mainTeamId = profileSnap.exists()
        ? (profileSnap.data() as Record<string, unknown>).mainTeamId
        : undefined;

      const teamsSnap = await getDocs(collection(firestore, `clubs/${root}/teams`));
      const teamIds: string[] = [];
      let mainCount = 0;
      for (const d of teamsSnap.docs) {
        teamIds.push(d.id);
        if ((d.data() as Record<string, unknown>).isMain === true) mainCount += 1;
      }

      const ownTeamIds = teamIds.filter(
        (id) =>
          classifyPlayerTeamKind({
            mainTeamId: typeof mainTeamId === "string" ? mainTeamId : null,
            thisTeamExists: true,
            thisTeamIsMain: teamsSnap.docs.some(
              (d) => d.id === id && (d.data() as Record<string, unknown>).isMain === true
            ),
            teamId: id,
            clubUid: root,
            teamCount: teamIds.length,
            mainCount,
          }).kind === "own"
      );

      for (const teamId of ownTeamIds) {
        const playersSnap = await getDocs(
          collection(firestore, `clubs/${root}/teams/${teamId}/players`)
        );
        total += playersSnap.size;
      }
    }
    return total;
  } catch {
    return null;
  }
}

// 自チームへの新規選手保存成功時に呼ぶ活性化記録。
// - firstObservedPlayerCreatedAt: 計測開始後に初めて観測した作成成功（全ユーザーで記録可）
// - firstPlayerCreatedAt: 「真の初回」を保証できる場合のみ
//     * 登録日時が計測開始以降（= それ以前の作成歴が存在し得ない）
//     * 今回が初観測（firstObserved をこのトランザクションで新規設定できた）
//       → 計測後に作成→全削除→再作成のケースは firstObserved 既存により除外される
//     * UID全体の全ルートの自チーム選手が今回作成の1件のみ
// いずれの判定も失敗しても保存処理には影響させない（呼び出し側で握り潰す）。
// 戻り値: firstPlayerCreatedAt を今回新規設定したか
export async function recordOwnPlayerCreateMeasurement(params: {
  firestore: Firestore;
  uid: string;
  careerClubUids: string[];
  registeredAtMs: number | null;
}): Promise<boolean> {
  const { firestore, uid, careerClubUids, registeredAtMs } = params;
  try {
    const wasFirstObserved = await setFirstObservedPlayerCreateOnce(uid);
    const ownPlayerTotal =
      wasFirstObserved &&
      registeredAtMs !== null &&
      registeredAtMs >= PLAYER_OPS_MEASUREMENT_START_AT.getTime()
        ? await countOwnTeamPlayersAcrossRoots(firestore, uid, careerClubUids)
        : null;
    // 保存直後なので「今回作成分」を含む。1 = これが真の初回
    if (
      shouldRecordFirstPlayerCreatedAt({
        wasFirstObserved,
        registeredAtMs,
        measurementStartMs: PLAYER_OPS_MEASUREMENT_START_AT.getTime(),
        ownPlayerTotalAfterCreate: ownPlayerTotal,
      })
    ) {
      return await setActivationOnce(uid, "firstPlayerCreatedAt");
    }
    return false;
  } catch (e) {
    console.warn("[player-analytics] recordOwnPlayerCreateMeasurement failed", e);
    return false;
  }
}
