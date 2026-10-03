import type { Firestore } from "firebase-admin/firestore";

// 対戦相手チームも clubs/{clubUid}/teams 配下に保存されるため、
// teamId だけでは自チームか判定できない。
// classifyPlayerTeamKind (src/lib/player-analytics-core.ts) と同一優先順位で判定する:
//   1. club_profiles.mainTeamId === teamId
//   2. チームdocの isMain === true
//   3. 旧形式（teamId === clubUid/ドキュメントルートID）
//   4. 上記のいずれかに合致する別チームがある → このチームは対戦相手
//   5. 有効チームがこの1件のみ → 自チームと推定（assumed）
//   6. 上記で決まらない → 判別不能

// 公開 /players の収集対象となる自チームIDを返す。
// mainTeamId / 旧形式ID はチームdoc自体が削除・欠落していても
// players/staff サブコレクションが残りうるため、doc有無に関係なく対象に含める。
// clubDocId は実際に teams を読み出したドキュメントルート（clubUid or clubId）。
export function resolveOwnTeamIds(
  teamsSnap: FirebaseFirestore.QuerySnapshot,
  clubDocId: string,
  mainTeamId: string | null
): string[] {
  const ids = new Set<string>();
  let identified = false;
  for (const d of teamsSnap.docs) {
    const data = d.data() as Record<string, unknown> | undefined;
    if (
      (typeof mainTeamId === "string" && mainTeamId !== "" && d.id === mainTeamId) ||
      data?.isMain === true ||
      d.id === clubDocId
    ) {
      ids.add(d.id);
      identified = true;
    }
  }
  if (typeof mainTeamId === "string" && mainTeamId !== "") {
    ids.add(mainTeamId);
    identified = true;
  }
  // 旧形式（teamId === clubDocId）はdoc欠落を考慮して常に含める
  ids.add(clubDocId);
  // 自チームの目印が一切なく有効チームが1件のみ → 暗黙の自チームと推定
  if (!identified && teamsSnap.size === 1) {
    ids.add(teamsSnap.docs[0].id);
  }
  return [...ids];
}

// 選手詳細ページ用: 解決済みの teamId が自チームかどうかを判定する。
// teamId が空（roster に teamId が無い旧データ等）は判別不能のため許容する。
export async function isOwnTeamId(
  firestore: Firestore,
  clubDocId: string,
  mainTeamId: string | null,
  teamId: string
): Promise<boolean> {
  if (!teamId) return true;
  if (typeof mainTeamId === "string" && mainTeamId !== "" && teamId === mainTeamId) return true;
  if (teamId === clubDocId) return true;
  const snap = await firestore.doc(`clubs/${clubDocId}/teams/${teamId}`).get();
  if (snap.exists && (snap.data() as Record<string, unknown> | undefined)?.isMain === true) return true;
  // mainTeamId が別のチームを指している → このチームは対戦相手
  if (typeof mainTeamId === "string" && mainTeamId !== "") return false;
  // 別チームに isMain がある → このチームは対戦相手
  const teamsSnap = await firestore.collection(`clubs/${clubDocId}/teams`).get();
  if (teamsSnap.docs.some((d) => (d.data() as Record<string, unknown> | undefined)?.isMain === true)) {
    return false;
  }
  // 自チームを識別する目印が一切ない旧データは判別不能 → 従来通り許容
  return true;
}
