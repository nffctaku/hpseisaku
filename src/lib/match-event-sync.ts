// Single write/delete path for match events so that `match.events` (doc array)
// and the `events` subcollection mirror never diverge.
//
// - Canonical store: match doc `events` array (read by SquadRegistrationForm,
//   PlayerStatsTable recalc, and the public match page).
// - Mirror: `matches/{id}/events` subcollection (read by the admin event list).
//   Substitution events mirror as `sub-{eventId}-out` / `sub-{eventId}-in`
//   (same shape saveSquadData has always written); other event types mirror
//   as `evt-{eventId}`.

import {
  doc,
  runTransaction,
  serverTimestamp,
  type Firestore,
} from 'firebase/firestore';
import { recomputeTeamMinutes } from './match-minutes';
import { deriveEventPlayerCounts, buildNameToIdFromStats } from './match-event-stats';
import {
  buildPlayerNameResolver,
  eventDeletedKeyVariants,
  withResolvedSubPlayerIds,
  type DedupKeyLike,
  type PlayerNameResolver,
} from './match-event-resolve';

export interface MatchEventInput {
  id: string;
  type: 'goal' | 'card' | 'substitution' | 'note' | 'pk_miss' | string;
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
  goalKind?: 'open' | 'penalty' | 'own_goal';
  playerLinkStatus?: 'linked' | 'name_only' | 'needs_input';
  source?: 'ocr' | 'manual';
  assistStatus?: 'unknown' | 'none' | 'set';
  needsConfirmation?: boolean;
  minuteText?: string;
}

// Firestore rejects undefined values — strip them recursively.
const stripUndefined = <T>(v: T): T => {
  if (Array.isArray(v)) return v.map(stripUndefined) as T;
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (val !== undefined) out[k] = stripUndefined(val);
    }
    return out as T;
  }
  return v;
};

// イベント配列から得点/アシスト/カードを導出し、既存の playerStats 行へ反映する。
// commitSquadSave（選手登録フォーム保存）/ applyOcrResults（OCR確定）と同一規則。
// 実装は src/lib/match-event-stats.ts に集約（公開集計の heal-on-read と共有）。
// ※ minutesPlayed はここでは触らない（交代イベント時のみ recomputeTeamMinutes を併用）。
export const recomputeDerivedEventStats = (
  playerStats: Record<string, unknown>[],
  events: Record<string, unknown>[]
): Record<string, unknown>[] => {
  const d = deriveEventPlayerCounts(events, buildNameToIdFromStats(playerStats));
  return (playerStats || []).map((ps) =>
    typeof ps?.playerId === 'string'
      ? {
          ...ps,
          goals: d.goals.get(ps.playerId) ?? 0,
          assists: d.assists.get(ps.playerId) ?? 0,
          yellowCards: d.yellowCards.get(ps.playerId) ?? 0,
          redCards: d.redCards.get(ps.playerId) ?? 0,
        }
      : ps
  );
};

// Mirror doc descriptors for one array event.
// resolvePlayer が渡された場合、ID未紐付け（名前のみ）の交代選手を
// 一意一致のみ playerId に解決してからミラーを生成する（曖昧・0件は据え置き）。
export function mirrorDocsForEvent(
  ev: MatchEventInput,
  resolvePlayer?: PlayerNameResolver
): { id: string; data: Record<string, unknown> }[] {
  const base = { minute: ev.minute, teamId: ev.teamId, timestamp: serverTimestamp() };
  if (ev.type === 'substitution') {
    const outId = ev.outPlayerId || resolvePlayer?.(ev.outPlayerName, ev.teamId);
    const inId = ev.inPlayerId || resolvePlayer?.(ev.inPlayerName, ev.teamId);
    const docs: { id: string; data: Record<string, unknown> }[] = [];
    if (outId) {
      docs.push({
        id: `sub-${ev.id}-out`,
        data: stripUndefined({ ...base, type: 'sub_out', playerId: outId, playerName: ev.outPlayerName || '' }),
      });
    }
    if (inId) {
      docs.push({
        id: `sub-${ev.id}-in`,
        data: stripUndefined({ ...base, type: 'sub_in', playerId: inId, playerName: ev.inPlayerName || '' }),
      });
    }
    return docs;
  }
  return [{
    id: `evt-${ev.id}`,
    data: stripUndefined({
      ...base,
      type: ev.type,
      playerId: ev.playerId,
      playerName: ev.playerName,
      assistPlayerId: ev.assistPlayerId,
      assistPlayerName: ev.assistPlayerName,
      cardColor: ev.cardColor,
      text: ev.text,
      goalKind: ev.goalKind,
      playerLinkStatus: ev.playerLinkStatus,
      source: ev.source,
      assistStatus: ev.assistStatus,
      needsConfirmation: ev.needsConfirmation,
      minuteText: ev.minuteText,
    }),
  }];
}

// Extract the array-event id a mirror doc belongs to, or null for unmanaged docs.
export function arrayEventIdFromMirrorDoc(docId: string): { eventId: string; kind: 'sub_out' | 'sub_in' | 'evt' } | null {
  const sub = docId.match(/^sub-(.+)-(out|in)$/);
  if (sub) return { eventId: sub[1], kind: sub[2] === 'out' ? 'sub_out' : 'sub_in' };
  const evt = docId.match(/^evt-(.+)$/);
  if (evt) return { eventId: evt[1], kind: 'evt' };
  return null;
}

// Append an event to match.events (+ recompute minutesPlayed for substitutions)
// and write its subcollection mirror docs in one transaction. Transactional so
// concurrent writers (OCR confirm / event edit / autosave) don't lose updates.
export async function appendMatchEvent(
  db: Firestore,
  matchPath: string,
  event: MatchEventInput
): Promise<void> {
  const matchRef = doc(db, matchPath);
  const eventsCol = `${matchPath}/events`;

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(matchRef);
    const data = snap.data() || {};
    const curEvents: Record<string, unknown>[] = Array.isArray(data.events) ? data.events : [];
    const curStats: Record<string, unknown>[] = Array.isArray(data.playerStats) ? data.playerStats : [];
    const duration = typeof data.matchDuration === 'number' ? data.matchDuration : 90;
    const resolvePlayer = buildPlayerNameResolver(curStats);

    // 名前のみ交代は一意一致のみ playerId を補完してから保存する
    const resolvedEvent = withResolvedSubPlayerIds(event as unknown as Record<string, unknown>, resolvePlayer);
    const cleanEvent = stripUndefined(resolvedEvent) as Record<string, unknown>;
    // Idempotency: same event id already present → don't duplicate.
    if (!curEvents.some((e) => e && e.id === cleanEvent.id)) {
      curEvents.push(cleanEvent);
    }
    const payload: Record<string, unknown> = { events: curEvents };

    // 削除済みOCRイベントのtombstone: 同一dedup keyのイベントが
    // 手動等で再追加された場合はtombstoneを解除する（OCR経路のみブロック対象）
    const deletedKeys: string[] = Array.isArray(data.ocrDeletedEventKeys) ? data.ocrDeletedEventKeys : [];
    const variants = eventDeletedKeyVariants(cleanEvent as DedupKeyLike);
    const undelete = variants.filter((k) => deletedKeys.includes(k));
    if (undelete.length) {
      payload.ocrDeletedEventKeys = deletedKeys.filter((k) => !undelete.includes(k));
    }

    // ゴール/カード等の追加でも公開SQUAD集計が参照する playerStats を更新する。
    // （従来は交代の出場時間のみ更新しており、得点者がSQUADに反映されなかった）
    let nextStats = recomputeDerivedEventStats(curStats, curEvents);
    if (event.type === 'substitution') {
      nextStats = recomputeTeamMinutes(nextStats, curEvents, event.teamId, duration, resolvePlayer);
    }
    payload.playerStats = nextStats;

    tx.set(matchRef, payload, { merge: true });
    for (const m of mirrorDocsForEvent(cleanEvent as unknown as MatchEventInput, resolvePlayer)) {
      tx.set(doc(db, eventsCol, m.id), m.data, { merge: true });
    }
  });
}

// Delete an event by its mirror-doc id: removes the array entry (when linked),
// all sibling mirror docs for that event, and recomputes minutesPlayed when a
// substitution was removed. Unmanaged (legacy auto-id) docs are just deleted.
export async function removeMatchEvent(
  db: Firestore,
  matchPath: string,
  mirrorDocId: string
): Promise<void> {
  const link = arrayEventIdFromMirrorDoc(mirrorDocId);
  const eventDocRef = doc(db, `${matchPath}/events/${mirrorDocId}`);

  if (!link) {
    await runTransaction(db, async (tx) => {
      tx.delete(eventDocRef);
    });
    return;
  }

  const matchRef = doc(db, matchPath);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(matchRef);
    const mirrorSnap = await tx.get(eventDocRef);
    const data = snap.data() || {};
    const curEvents: Record<string, unknown>[] = Array.isArray(data.events) ? data.events : [];
    const curStats: Record<string, unknown>[] = Array.isArray(data.playerStats) ? data.playerStats : [];
    const duration = typeof data.matchDuration === 'number' ? data.matchDuration : 90;
    const resolvePlayer = buildPlayerNameResolver(curStats);

    const removed = curEvents.find((e) => e && e.id === link.eventId);
    const nextEvents = curEvents.filter((e) => !(e && e.id === link.eventId));
    const payload: Record<string, unknown> = { events: nextEvents };
    // OCR由来イベントの明示的な削除を tombstone として記録。
    // 別analysisIdの再解析でも applyOcrResults が復活させないための印。
    // （手動追加はこのチェックを通らないため妨げない）
    if (removed?.source === 'ocr') {
      const deletedKeys: string[] = Array.isArray(data.ocrDeletedEventKeys) ? data.ocrDeletedEventKeys : [];
      const next = [...new Set([...deletedKeys, ...eventDeletedKeyVariants(removed as DedupKeyLike)])];
      if (next.length !== deletedKeys.length) payload.ocrDeletedEventKeys = next;
    }
    // 削除でも導出スタッツを再計算（ゴール削除→得点減算、カード削除→警告減算）
    let nextStats = recomputeDerivedEventStats(curStats, nextEvents);
    const mirrorType = (mirrorSnap.data() as Record<string, unknown> | undefined)?.type;
    const mirrorTeamId = (mirrorSnap.data() as Record<string, unknown> | undefined)?.teamId;
    // 交代削除（配列イベント or 孤児ミラー）→ そのチームの出場時間を再計算。
    // 配列に対応イベントが無い孤児ミラーでも、events配列が正なら
    // recompute はイベント由来の値へ修復する（stale minutes の残存防止）。
    const subTeamId =
      removed?.type === 'substitution' && typeof removed.teamId === 'string'
        ? removed.teamId
        : (mirrorType === 'sub_out' || mirrorType === 'sub_in') && typeof mirrorTeamId === 'string'
          ? mirrorTeamId
          : null;
    if (subTeamId) {
      nextStats = recomputeTeamMinutes(nextStats, nextEvents, subTeamId, duration, resolvePlayer);
    }
    payload.playerStats = nextStats;

    tx.set(matchRef, payload, { merge: true });
    tx.delete(eventDocRef);
    // Delete all sibling mirror docs belonging to the same array event.
    tx.delete(doc(db, `${matchPath}/events/sub-${link.eventId}-out`));
    tx.delete(doc(db, `${matchPath}/events/sub-${link.eventId}-in`));
    tx.delete(doc(db, `${matchPath}/events/evt-${link.eventId}`));
  });
}
