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
export function mirrorDocsForEvent(ev: MatchEventInput): { id: string; data: Record<string, unknown> }[] {
  const base = { minute: ev.minute, teamId: ev.teamId, timestamp: serverTimestamp() };
  if (ev.type === 'substitution') {
    const docs: { id: string; data: Record<string, unknown> }[] = [];
    if (ev.outPlayerId) {
      docs.push({
        id: `sub-${ev.id}-out`,
        data: stripUndefined({ ...base, type: 'sub_out', playerId: ev.outPlayerId, playerName: ev.outPlayerName || '' }),
      });
    }
    if (ev.inPlayerId) {
      docs.push({
        id: `sub-${ev.id}-in`,
        data: stripUndefined({ ...base, type: 'sub_in', playerId: ev.inPlayerId, playerName: ev.inPlayerName || '' }),
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

    const cleanEvent = stripUndefined(event) as unknown as Record<string, unknown>;
    // Idempotency: same event id already present → don't duplicate.
    if (!curEvents.some((e) => e && e.id === cleanEvent.id)) {
      curEvents.push(cleanEvent);
    }
    const payload: Record<string, unknown> = { events: curEvents };

    // ゴール/カード等の追加でも公開SQUAD集計が参照する playerStats を更新する。
    // （従来は交代の出場時間のみ更新しており、得点者がSQUADに反映されなかった）
    let nextStats = recomputeDerivedEventStats(curStats, curEvents);
    if (event.type === 'substitution') {
      nextStats = recomputeTeamMinutes(nextStats, curEvents, event.teamId, duration);
    }
    payload.playerStats = nextStats;

    tx.set(matchRef, payload, { merge: true });
    for (const m of mirrorDocsForEvent(event)) {
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
    const data = snap.data() || {};
    const curEvents: Record<string, unknown>[] = Array.isArray(data.events) ? data.events : [];
    const curStats: Record<string, unknown>[] = Array.isArray(data.playerStats) ? data.playerStats : [];
    const duration = typeof data.matchDuration === 'number' ? data.matchDuration : 90;

    const removed = curEvents.find((e) => e && e.id === link.eventId);
    const nextEvents = curEvents.filter((e) => !(e && e.id === link.eventId));
    const payload: Record<string, unknown> = { events: nextEvents };
    // 削除でも導出スタッツを再計算（ゴール削除→得点減算、カード削除→警告減算）
    let nextStats = recomputeDerivedEventStats(curStats, nextEvents);
    if (removed?.type === 'substitution' && typeof removed.teamId === 'string') {
      nextStats = recomputeTeamMinutes(nextStats, nextEvents, removed.teamId, duration);
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
