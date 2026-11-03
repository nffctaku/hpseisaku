// 試合記録シート（/admin/matches/sheet）用のデータ・書込ヘルパー。
// 既存の大会試合doc（clubs/{uid}/competitions/{compId}/rounds/{roundId}/matches/{id}）を
// スプレッドシートの1行として扱うための共通ロジック。
// 書込は詳細画面と同じフィールドに対して行い、public_match_index と
// statsCacheVersion を必ず同期する（competitions/[id]/page.tsx と同じ副作用）。

import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  type Firestore,
} from 'firebase/firestore';
import type { MatchEvent } from '@/types/match';
import { recomputeDerivedEventStats } from '@/lib/match-event-sync';

export interface SheetTeam {
  id: string;
  name: string;
  logoUrl?: string;
}

export interface SheetRound {
  id: string;
  name: string;
}

export interface SheetCompetition {
  id: string;
  name: string;
  season?: string;
  format?: string;
  teams?: string[];
  logoUrl?: string;
}

export interface SheetPlayer {
  id: string;
  name: string;
  number?: number;
}

export interface SheetMatchRow {
  key: string;
  matchId: string;
  competitionId: string;
  roundId: string;
  competitionName: string;
  roundName: string;
  matchDate: string;
  homeTeam: string;
  awayTeam: string;
  scoreHome: number | null;
  scoreAway: number | null;
  pkScoreHome: number | null;
  pkScoreAway: number | null;
  events: MatchEvent[];
  matchDuration?: number;
}

export const matchDocPath = (
  clubUid: string,
  competitionId: string,
  roundId: string,
  matchId: string
) => `clubs/${clubUid}/competitions/${competitionId}/rounds/${roundId}/matches/${matchId}`;

export const bumpStatsCache = async (db: Firestore, clubUid: string): Promise<void> => {
  try {
    await setDoc(doc(db, `clubs/${clubUid}`), { statsCacheVersion: increment(1) }, { merge: true });
  } catch (e) {
    console.warn('[match-sheet] statsCacheVersion bump failed (continuing):', e);
  }
};

// public_match_index の同期（competitions/[id]/page.tsx の syncPublicMatchIndex と同等）。
// 詳細画面からの編集とも矛盾しないよう、現在のmatch docにpatchをマージした内容で書き込む。
const syncIndex = async (
  db: Firestore,
  clubUid: string,
  competitionId: string,
  roundId: string,
  matchId: string,
  merged: Record<string, unknown>,
  competitionName: string,
  roundName: string,
  teamsMap: Map<string, SheetTeam>
): Promise<void> => {
  try {
    const homeTeamId = typeof merged.homeTeam === 'string' ? merged.homeTeam : '';
    const awayTeamId = typeof merged.awayTeam === 'string' ? merged.awayTeam : '';
    const home = homeTeamId ? teamsMap.get(homeTeamId) : undefined;
    const away = awayTeamId ? teamsMap.get(awayTeamId) : undefined;
    const row: Record<string, unknown> = {
      matchId,
      competitionId,
      roundId,
      matchDate: typeof merged.matchDate === 'string' ? merged.matchDate : '',
      competitionName,
      roundName,
      homeTeam: homeTeamId,
      awayTeam: awayTeamId,
      homeTeamName: home?.name || merged.homeTeamName,
      awayTeamName: away?.name || merged.awayTeamName,
      homeTeamLogo: home?.logoUrl || merged.homeTeamLogo,
      awayTeamLogo: away?.logoUrl || merged.awayTeamLogo,
      scoreHome: typeof merged.scoreHome === 'number' ? merged.scoreHome : (merged.scoreHome ?? null),
      scoreAway: typeof merged.scoreAway === 'number' ? merged.scoreAway : (merged.scoreAway ?? null),
    };
    if (typeof merged.matchTime === 'string') row.matchTime = merged.matchTime;
    for (const k of Object.keys(row)) {
      if (row[k] === undefined) delete row[k];
    }
    await setDoc(doc(db, `clubs/${clubUid}/public_match_index`, `${competitionId}__${roundId}__${matchId}`), row, { merge: true });
  } catch (e) {
    console.warn('[match-sheet] public_match_index sync failed (continuing):', e);
  }
};

// シートの新規行から試合docを1件だけ作成（大会・節が決まった時点で呼ぶ）。
export const createSheetMatch = async (
  db: Firestore,
  clubUid: string,
  competition: SheetCompetition,
  round: SheetRound,
  fields: {
    matchDate?: string;
    homeTeam?: string;
    awayTeam?: string;
    scoreHome?: number | null;
    scoreAway?: number | null;
  },
  teamsMap: Map<string, SheetTeam>
): Promise<string> => {
  const payload: Record<string, unknown> = {
    competitionId: competition.id,
    matchDate: fields.matchDate ?? '',
    homeTeam: fields.homeTeam ?? '',
    awayTeam: fields.awayTeam ?? '',
    scoreHome: fields.scoreHome ?? null,
    scoreAway: fields.scoreAway ?? null,
    pkScoreHome: null,
    pkScoreAway: null,
    ownerUid: clubUid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  const ref = await addDoc(
    collection(db, `clubs/${clubUid}/competitions/${competition.id}/rounds/${round.id}/matches`),
    payload
  );
  await syncIndex(db, clubUid, competition.id, round.id, ref.id, payload, competition.name, round.name, teamsMap);
  await bumpStatsCache(db, clubUid);
  return ref.id;
};

// 既存行の共有6項目（日付・対戦相手/H/A・スコア）を更新。詳細画面と同じdocを更新する。
export const updateSheetMatch = async (
  db: Firestore,
  clubUid: string,
  competition: SheetCompetition,
  round: SheetRound,
  matchId: string,
  patch: Record<string, unknown>,
  teamsMap: Map<string, SheetTeam>
): Promise<void> => {
  const path = matchDocPath(clubUid, competition.id, round.id, matchId);
  await updateDoc(doc(db, path), { ...patch, updatedAt: serverTimestamp() });
  const snap = await getDoc(doc(db, path));
  await syncIndex(db, clubUid, competition.id, round.id, matchId, snap.data() || {}, competition.name, round.name, teamsMap);
  await bumpStatsCache(db, clubUid);
};

// 節・ラウンドをセルから新規登録
export const createSheetRound = async (
  db: Firestore,
  clubUid: string,
  competitionId: string,
  name: string
): Promise<SheetRound> => {
  const ref = await addDoc(
    collection(db, `clubs/${clubUid}/competitions/${competitionId}/rounds`),
    { name }
  );
  return { id: ref.id, name };
};

// 対戦相手をセルから新規登録（teamsコレクション＋大会のteams一覧へも登録して次回から候補に出す）
export const createOpponentTeam = async (
  db: Firestore,
  clubUid: string,
  competitionId: string | null,
  name: string
): Promise<SheetTeam> => {
  const ref = await addDoc(collection(db, `clubs/${clubUid}/teams`), {
    name,
    createdAt: serverTimestamp(),
  });
  if (competitionId) {
    try {
      await updateDoc(doc(db, `clubs/${clubUid}/competitions/${competitionId}`), {
        teams: arrayUnion(ref.id),
      });
    } catch (e) {
      console.warn('[match-sheet] competition.teams への追加に失敗 (continuing):', e);
    }
  }
  return { id: ref.id, name };
};

// シートの大会取得（公式戦のみ: competitions コレクションの全件）
export const fetchSheetCompetitions = async (db: Firestore, clubUid: string): Promise<SheetCompetition[]> => {
  const snap = await getDocs(collection(db, `clubs/${clubUid}/competitions`));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as SheetCompetition));
};

export const fetchSheetTeams = async (db: Firestore, clubUid: string): Promise<SheetTeam[]> => {
  const snap = await getDocs(collection(db, `clubs/${clubUid}/teams`));
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as any) } as SheetTeam))
    .sort((a, b) => a.name.localeCompare(b.name));
};

export const fetchSheetRounds = async (db: Firestore, clubUid: string, competitionId: string): Promise<SheetRound[]> => {
  const snap = await getDocs(collection(db, `clubs/${clubUid}/competitions/${competitionId}/rounds`));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as SheetRound));
};

export const fetchSheetMatches = async (
  db: Firestore,
  clubUid: string,
  competition: SheetCompetition,
  round: SheetRound
): Promise<SheetMatchRow[]> => {
  const snap = await getDocs(
    collection(db, `clubs/${clubUid}/competitions/${competition.id}/rounds/${round.id}/matches`)
  );
  return snap.docs.map((d) => {
    const data = d.data() as any;
    return {
      key: `${competition.id}__${round.id}__${d.id}`,
      matchId: d.id,
      competitionId: competition.id,
      roundId: round.id,
      competitionName: competition.name,
      roundName: round.name,
      matchDate: typeof data.matchDate === 'string' ? data.matchDate : '',
      homeTeam: data.homeTeam || '',
      awayTeam: data.awayTeam || '',
      scoreHome: typeof data.scoreHome === 'number' ? data.scoreHome : (data.scoreHome ?? null),
      scoreAway: typeof data.scoreAway === 'number' ? data.scoreAway : (data.scoreAway ?? null),
      pkScoreHome: data.pkScoreHome ?? null,
      pkScoreAway: data.pkScoreAway ?? null,
      events: Array.isArray(data.events) ? (data.events as MatchEvent[]) : [],
      matchDuration: typeof data.matchDuration === 'number' ? data.matchDuration : undefined,
    } as SheetMatchRow;
  });
};

// 得点者セル: 既存イベントのフィールドを更新（分の後入れなど同じイベントを更新）
export const updateMatchEventFields = async (
  db: Firestore,
  matchPath: string,
  eventId: string,
  patch: Record<string, unknown>
): Promise<void> => {
  const matchRef = doc(db, matchPath);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(matchRef);
    const data = snap.data() || {};
    const curEvents: Record<string, unknown>[] = Array.isArray(data.events) ? data.events : [];
    const curStats: Record<string, unknown>[] = Array.isArray(data.playerStats) ? data.playerStats : [];
    const idx = curEvents.findIndex((e) => e && e.id === eventId);
    if (idx < 0) return;
    const nextEvent = { ...curEvents[idx], ...patch };
    for (const k of Object.keys(nextEvent)) {
      if (nextEvent[k] === undefined) delete nextEvent[k];
    }
    const nextEvents = [...curEvents];
    nextEvents[idx] = nextEvent;
    const nextStats = recomputeDerivedEventStats(curStats, nextEvents);
    tx.set(matchRef, { events: nextEvents, playerStats: nextStats }, { merge: true });
    // mirrorサブコレクションも同期（詳細画面のイベント一覧が参照）
    const mirrorRef = doc(db, `${matchPath}/events/evt-${eventId}`);
    const clean: Record<string, unknown> = { ...nextEvent };
    for (const k of Object.keys(clean)) {
      if (clean[k] === undefined) delete clean[k];
    }
    tx.set(mirrorRef, clean, { merge: true });
  });
};

// 同一大会内での節移動（第9節→第10節など）。
// match docは round配下の物理パスにあるため、doc本体 + eventsサブコレクション(mirror)
// + public_match_index を1バッチで移動する（成功/失敗が分かれないよう原子的に）。
// 移動先に同じIDの試合がある場合は上書きせずエラーとする。
export const moveMatchToRound = async (
  db: Firestore,
  clubUid: string,
  competition: SheetCompetition,
  fromRound: SheetRound,
  toRound: SheetRound,
  matchId: string,
  teamsMap: Map<string, SheetTeam>
): Promise<void> => {
  if (fromRound.id === toRound.id) return;
  const base = `clubs/${clubUid}/competitions/${competition.id}/rounds`;
  const srcPath = `${base}/${fromRound.id}/matches/${matchId}`;
  const dstPath = `${base}/${toRound.id}/matches/${matchId}`;

  // mirror一覧はtx外で取得（クライアントSDKのTransactionはQuery不可）。
  // 移動元/移動先の存在確認はtx内で行い、チェック後に別操作が同じ移動先へ
  // 書き込んだ場合もトランザクションがリトライ/失敗するため上書きされない。
  const srcSnap = await getDoc(doc(db, srcPath));
  if (!srcSnap.exists()) throw new Error('移動元の試合が見つかりません。');
  const mirrorSnap = await getDocs(collection(db, `${srcPath}/events`));

  await runTransaction(db, async (tx) => {
    const srcNow = await tx.get(doc(db, srcPath));
    if (!srcNow.exists()) throw new Error('移動元の試合が見つかりません。');
    const dstNow = await tx.get(doc(db, dstPath));
    if (dstNow.exists()) throw new Error('移動先に同じIDの試合が既にあります。上書きはしません。');
    tx.set(doc(db, dstPath), srcNow.data());
    for (const m of mirrorSnap.docs) {
      tx.set(doc(db, `${dstPath}/events/${m.id}`), m.data());
      tx.delete(doc(db, `${srcPath}/events/${m.id}`));
    }
    tx.delete(doc(db, srcPath));
    tx.delete(doc(db, `clubs/${clubUid}/public_match_index/${competition.id}__${fromRound.id}__${matchId}`));
  });

  // 新index生成（roundNameのみ差し替え）
  await syncIndex(db, clubUid, competition.id, toRound.id, matchId, srcSnap.data() as Record<string, unknown>, competition.name, toRound.name, teamsMap);
  await bumpStatsCache(db, clubUid);
};

// 試合行の削除: match doc本体 + eventsミラー + public_match_index を1バッチで削除
export const deleteSheetMatch = async (
  db: Firestore,
  clubUid: string,
  competitionId: string,
  roundId: string,
  matchId: string
) => {
  const srcPath = matchDocPath(clubUid, competitionId, roundId, matchId);
  const mirrorSnap = await getDocs(collection(db, `${srcPath}/events`));
  const batch = writeBatch(db);
  for (const m of mirrorSnap.docs) batch.delete(m.ref);
  batch.delete(doc(db, srcPath));
  batch.delete(doc(db, `clubs/${clubUid}/public_match_index/${competitionId}__${roundId}__${matchId}`));
  await batch.commit();
  await bumpStatsCache(db, clubUid);
};
