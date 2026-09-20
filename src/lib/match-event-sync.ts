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
  getDoc,
  writeBatch,
  serverTimestamp,
  type Firestore,
} from 'firebase/firestore';
import { recomputeTeamMinutes } from './match-minutes';

export interface MatchEventInput {
  id: string;
  type: 'goal' | 'card' | 'substitution' | 'note' | string;
  minute: number;
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

// Mirror doc descriptors for one array event.
export function mirrorDocsForEvent(ev: MatchEventInput): { id: string; data: Record<string, unknown> }[] {
  const base = { minute: ev.minute, teamId: ev.teamId, timestamp: serverTimestamp() };
  if (ev.type === 'substitution') {
    const docs: { id: string; data: Record<string, unknown> }[] = [];
    if (ev.outPlayerId) {
      docs.push({
        id: `sub-${ev.id}-out`,
        data: { ...base, type: 'sub_out', playerId: ev.outPlayerId, playerName: ev.outPlayerName || '' },
      });
    }
    if (ev.inPlayerId) {
      docs.push({
        id: `sub-${ev.id}-in`,
        data: { ...base, type: 'sub_in', playerId: ev.inPlayerId, playerName: ev.inPlayerName || '' },
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
// and write its subcollection mirror docs in one batch.
export async function appendMatchEvent(
  db: Firestore,
  matchPath: string,
  event: MatchEventInput
): Promise<void> {
  const matchRef = doc(db, matchPath);
  const snap = await getDoc(matchRef);
  const data = snap.data() || {};
  const curEvents: Record<string, unknown>[] = Array.isArray(data.events) ? data.events : [];
  const curStats: Record<string, unknown>[] = Array.isArray(data.playerStats) ? data.playerStats : [];
  const duration = typeof data.matchDuration === 'number' ? data.matchDuration : 90;

  const nextEvents = [...curEvents, stripUndefined(event)];
  const payload: Record<string, unknown> = { events: nextEvents };

  if (event.type === 'substitution') {
    payload.playerStats = recomputeTeamMinutes(curStats, nextEvents, event.teamId, duration);
  }

  const batch = writeBatch(db);
  batch.set(matchRef, payload, { merge: true });
  const eventsCol = `${matchPath}/events`;
  for (const m of mirrorDocsForEvent(event)) {
    batch.set(doc(db, eventsCol, m.id), m.data, { merge: true });
  }
  await batch.commit();
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
    const batch = writeBatch(db);
    batch.delete(eventDocRef);
    await batch.commit();
    return;
  }

  const matchRef = doc(db, matchPath);
  const snap = await getDoc(matchRef);
  const data = snap.data() || {};
  const curEvents: Record<string, unknown>[] = Array.isArray(data.events) ? data.events : [];
  const curStats: Record<string, unknown>[] = Array.isArray(data.playerStats) ? data.playerStats : [];
  const duration = typeof data.matchDuration === 'number' ? data.matchDuration : 90;

  const removed = curEvents.find((e) => e && e.id === link.eventId);
  const nextEvents = curEvents.filter((e) => !(e && e.id === link.eventId));
  const payload: Record<string, unknown> = { events: nextEvents };
  if (removed?.type === 'substitution' && typeof removed.teamId === 'string') {
    payload.playerStats = recomputeTeamMinutes(curStats, nextEvents, removed.teamId, duration);
  }

  const batch = writeBatch(db);
  batch.set(matchRef, payload, { merge: true });
  batch.delete(eventDocRef);
  // Delete all sibling mirror docs belonging to the same array event.
  batch.delete(doc(db, `${matchPath}/events/sub-${link.eventId}-out`));
  batch.delete(doc(db, `${matchPath}/events/sub-${link.eventId}-in`));
  batch.delete(doc(db, `${matchPath}/events/evt-${link.eventId}`));
  await batch.commit();
}
