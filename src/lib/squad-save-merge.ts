// フォーム保存時の3方向マージ（ロード時 / フォーム現在値 / 最新ドキュメント）。
// 別タブ・OCR確定・別フォームとの同時編集で更新を失わないための純粋ロジック。
//
// ルール:
//   - フォームがロード時から未変更なら最新値を採用（外部編集を保持）
//   - フォームが変更していればフォーム値を採用
//   - 双方が別々に変更 → フォーム値を採用し conflicts に記録（無言上書きしない）
//   - 外部で削除されフォーム未変更 → 削除を尊重（復活させない）
//   - 外部で削除されフォーム変更済み → フォーム値を残し conflicts に記録
//   - 外部追加（ロード時にもフォームにも無いID）→ そのまま保持

export interface SquadSaveSnapshot {
  events: any[];
  playerStats: any[];
  homeFormation?: string;
  awayFormation?: string;
  customStatHeaders: any[];
}

export interface SquadMergeOutcome {
  events: any[];
  playerStats: any[];
  homeFormation?: string;
  awayFormation?: string;
  customStatHeaders: any[];
  /** 競合の説明文（通知用） */
  conflicts: string[];
  /** 外部変更を取り込んだか（フォーム再同期の判定用） */
  adoptedExternal: boolean;
}

import {
  collection,
  doc,
  getDocs,
  runTransaction,
  type Firestore,
} from 'firebase/firestore';
import { recomputeTeamMinutes } from './match-minutes';
import { mirrorDocsForEvent, type MatchEventInput } from './match-event-sync';

// Firestore rejects undefined values — strip them recursively.
// フォーム値（未設定の playerId / assistPlayerId 等）に undefined キーが残るため必須。
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

// 交代イベントだけの署名（出場時間再計算のトリガー判定に使用）
export function subEventsSignature(events: any[]): string {
  return JSON.stringify(
    (events || [])
      .filter((e: any) => e?.type === 'substitution')
      .map((e: any) => [e.id, String(e.minute), e.teamId, e.outPlayerId, e.inPlayerId])
      .sort()
  );
}

const baseMinuteOf = (minute: unknown): number => {
  if (typeof minute === 'number') return Math.floor(minute);
  const s = String(minute ?? '');
  return s.includes('+') ? (parseInt(s.split('+')[0], 10) || 0) : (parseInt(s, 10) || 0);
};

export interface CommitSquadSaveArgs {
  form: SquadSaveSnapshot;
  loaded: SquadSaveSnapshot;
  homeTeam: string;
  awayTeam: string;
  fallbackDuration?: number;
  /** 旧形式 `PK(名前)` 等の表示名から選手IDを解決するためのマップ */
  playerNameToId?: Map<string, string>;
}

export interface CommitSquadSaveResult extends SquadMergeOutcome {
  teamStats: any[];
  matchDuration: number;
}

/**
 * フォーム内容を試合ドキュメントへトランザクション保存する。
 *
 * ミラーサブコレクションの削除判定はトランザクション前のスナップショットを使う。
 * これが安全なのは「すべてのイベント書き込み経路（appendMatchEvent /
 * removeMatchEvent / applyOcrResults / 本関数）が、試合docとミラーdocを
 * 同一トランザクションで原子的に書く」という不変条件による:
 *   - 外部書き込みが本txのmatch読み取りより前にコミット → イベントがマージ
 *     結果に含まれ、desiredIds がミラーを保護する
 *   - 後にコミット → 事前スナップショットにもミラーは存在せず削除対象外
 * ミラーだけを単独で書く経路を新たに作ってはいけない。
 *
 * - OCR由来イベント（source==='ocr'）は試合時間の自動延長判定から除外
 */
export async function commitSquadSave(
  db: Firestore,
  matchPath: string,
  args: CommitSquadSaveArgs
): Promise<CommitSquadSaveResult> {
  const matchRef = doc(db, matchPath);
  const eventsColPath = `${matchPath}/events`;
  const playerNameToId = args.playerNameToId || new Map<string, string>();
  const resolveOriginalFromName = (name?: string): string | undefined => {
    if (!name || !name.startsWith('PK(') || !name.endsWith(')')) return undefined;
    return playerNameToId.get(name.slice(3, -1).trim());
  };

  // 既存ミラーの列挙（削除判定用）。上記の原子性不変条件により競合窓なし。
  const existingMirrorSnap = await getDocs(collection(db, eventsColPath));

  return runTransaction(db, async (tx) => {
    const latestSnap = await tx.get(matchRef);
    const latest = latestSnap.exists() ? latestSnap.data()! : {};

    const latestSnapshot: SquadSaveSnapshot = {
      events: Array.isArray(latest.events) ? latest.events : [],
      playerStats: Array.isArray(latest.playerStats) ? latest.playerStats : [],
      homeFormation: latest.homeFormation,
      awayFormation: latest.awayFormation,
      customStatHeaders: Array.isArray(latest.customStatHeaders) ? latest.customStatHeaders : [],
    };

    const merged = mergeSquadSave(args.form, args.loaded, latestSnapshot);

    // マージ後イベントで導出カウントを再計算
    const goalCounts = new Map<string, number>();
    const assistCounts = new Map<string, number>();
    const yellowCounts = new Map<string, number>();
    const redCounts = new Map<string, number>();
    merged.events.forEach((ev: any) => {
      const type = typeof ev?.type === 'string' ? ev.type : '';
      if (type === 'goal') {
        const scorerId = ev.originalPlayerId || resolveOriginalFromName(ev.playerName) || ev.playerId;
        if (scorerId) goalCounts.set(scorerId, (goalCounts.get(scorerId) || 0) + 1);
        if (ev.assistPlayerId) assistCounts.set(ev.assistPlayerId, (assistCounts.get(ev.assistPlayerId) || 0) + 1);
        return;
      }
      if ((type === 'card' || type === 'yellow' || type === 'red') && ev.playerId) {
        const color = type === 'card' ? ev.cardColor : type;
        if (color === 'yellow') yellowCounts.set(ev.playerId, (yellowCounts.get(ev.playerId) || 0) + 1);
        if (color === 'red') redCounts.set(ev.playerId, (redCounts.get(ev.playerId) || 0) + 1);
      }
    });

    let mergedPlayerStats = merged.playerStats.map((ps: any) => ({
      ...ps,
      goals: goalCounts.get(ps.playerId) ?? 0,
      assists: assistCounts.get(ps.playerId) ?? 0,
      yellowCards: yellowCounts.get(ps.playerId) ?? 0,
      redCards: redCounts.get(ps.playerId) ?? 0,
    }));

    // 試合時間: 既存値を保持。手動登録イベントのみ base>90 で120へ拡張。
    // source==='ocr' のイベントは除外（OCRの「93」誤読などで延長扱いしない）。
    const manualBeyond90 = merged.events.some(
      (ev: any) => ev?.source !== 'ocr' && baseMinuteOf(ev?.minute) > 90
    );
    const matchDuration = manualBeyond90
      ? 120
      : (typeof latest.matchDuration === 'number'
          ? latest.matchDuration
          : (args.fallbackDuration ?? 90));

    // 交代イベントがロード時から変化していれば出場時間を再計算
    if (subEventsSignature(merged.events) !== subEventsSignature(args.loaded.events)) {
      const teamIds = new Set(mergedPlayerStats.map((ps: any) => ps?.teamId).filter(Boolean));
      teamIds.forEach((teamId) => {
        mergedPlayerStats = recomputeTeamMinutes(
          mergedPlayerStats,
          merged.events,
          teamId as string,
          matchDuration
        );
      });
    }

    // チームスタッツ: 最新値を基盤にカード数だけ上書き（OCR適用分を消さない）
    const latestTeamStats = Array.isArray(latest.teamStats) ? latest.teamStats : [];
    const homeYellow = merged.events.filter((ev: any) => ev.type === 'card' && ev.teamId === args.homeTeam && ev.cardColor === 'yellow').length;
    const awayYellow = merged.events.filter((ev: any) => ev.type === 'card' && ev.teamId === args.awayTeam && ev.cardColor === 'yellow').length;
    const homeRed = merged.events.filter((ev: any) => ev.type === 'card' && ev.teamId === args.homeTeam && ev.cardColor === 'red').length;
    const awayRed = merged.events.filter((ev: any) => ev.type === 'card' && ev.teamId === args.awayTeam && ev.cardColor === 'red').length;
    const teamStats = latestTeamStats.map((stat: any) => {
      if (stat.id === 'yellowCards' || stat.name === 'イエロー') return { ...stat, homeValue: homeYellow, awayValue: awayYellow };
      if (stat.id === 'redCards' || stat.name === 'レッド') return { ...stat, homeValue: homeRed, awayValue: awayRed };
      return stat;
    });

    const payload: Record<string, unknown> = {
      customStatHeaders: merged.customStatHeaders,
      playerStats: mergedPlayerStats,
      events: merged.events,
      matchDuration,
      teamStats,
    };
    if (merged.homeFormation !== undefined) payload.homeFormation = merged.homeFormation;
    if (merged.awayFormation !== undefined) payload.awayFormation = merged.awayFormation;
    tx.set(matchRef, stripUndefined(payload), { merge: true });

    // ミラーサブコレクションを同一トランザクションで整合
    const desiredIds = new Set<string>();
    merged.events.forEach((ev: any) => {
      for (const m of mirrorDocsForEvent(ev as MatchEventInput)) {
        desiredIds.add(m.id);
        tx.set(doc(db, eventsColPath, m.id), m.data, { merge: true });
      }
    });
    existingMirrorSnap.docs.forEach((d) => {
      const managed = d.id.startsWith('sub-') || d.id.startsWith('evt-');
      if (managed && !desiredIds.has(d.id)) tx.delete(d.ref);
    });

    return { ...merged, playerStats: mergedPlayerStats, teamStats, matchDuration };
  });
}

// 導出フィールドはイベントから再計算するためマージ対象外
const DERIVED_PS_FIELDS = new Set([
  'goals', 'assists', 'yellowCards', 'redCards', 'minutesPlayed',
]);

const eq = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (a === undefined && b === undefined) return true;
  try {
    return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  } catch {
    return false;
  }
};

const eventLabel = (e: any): string => {
  const minute = e?.minute ?? '?';
  const name = e?.playerName || e?.inPlayerName || e?.outPlayerName || '';
  const typeMap: Record<string, string> = {
    goal: 'ゴール', pk_miss: 'PK失敗', card: 'カード', substitution: '交代', note: 'メモ',
  };
  const type = typeMap[e?.type] || e?.type || 'イベント';
  return `${minute}分 ${type}${name ? ` ${name}` : ''}`;
};

export function mergeSquadSave(
  form: SquadSaveSnapshot,
  loaded: SquadSaveSnapshot,
  latest: SquadSaveSnapshot
): SquadMergeOutcome {
  const conflicts: string[] = [];
  let adoptedExternal = false;

  // ---- events ----
  const loadedEventMap = new Map<string, any>();
  (loaded.events || []).forEach((e: any) => { if (e?.id) loadedEventMap.set(e.id, e); });
  const latestEventMap = new Map<string, any>();
  (latest.events || []).forEach((e: any) => { if (e?.id) latestEventMap.set(e.id, e); });
  const formEventIds = new Set((form.events || []).map((e: any) => e?.id).filter(Boolean));

  const mergedEvents: any[] = [];
  for (const fe of form.events || []) {
    if (!fe?.id) { mergedEvents.push(fe); continue; }
    const L = loadedEventMap.get(fe.id);
    const T = latestEventMap.get(fe.id);
    if (!L) {
      mergedEvents.push(fe); // フォーム内の新規
      continue;
    }
    if (L && T) {
      const formChanged = !eq(fe, L);
      const extChanged = !eq(T, L);
      if (extChanged && !formChanged) {
        mergedEvents.push(T); // 外部編集を採用
        adoptedExternal = true;
      } else if (extChanged && formChanged && !eq(fe, T)) {
        mergedEvents.push(fe);
        conflicts.push(`イベント「${eventLabel(fe)}」が他の画面でも編集されました`);
      } else {
        mergedEvents.push(fe);
      }
      continue;
    }
    // 外部で削除済み
    if (!eq(fe, L)) {
      mergedEvents.push(fe);
      conflicts.push(`イベント「${eventLabel(fe)}」は他の画面で削除済みです（編集内容を保持）`);
    } else {
      adoptedExternal = true; // 未変更 → 削除を尊重（復活させない）
    }
  }
  for (const e of latest.events || []) {
    if (e?.id && !loadedEventMap.has(e.id) && !formEventIds.has(e.id)) {
      mergedEvents.push(e); // 外部追加
      adoptedExternal = true;
    }
  }

  // ---- playerStats ----
  const loadedPsMap = new Map<string, any>();
  (loaded.playerStats || []).forEach((p: any) => { if (p?.playerId) loadedPsMap.set(p.playerId, p); });
  const latestPsMap = new Map<string, any>();
  (latest.playerStats || []).forEach((p: any) => { if (p?.playerId) latestPsMap.set(p.playerId, p); });
  const formPsIds = new Set((form.playerStats || []).map((p: any) => p?.playerId).filter(Boolean));

  const mergedPlayerStats: any[] = [];
  for (const fp of form.playerStats || []) {
    if (!fp?.playerId) { mergedPlayerStats.push(fp); continue; }
    const L = loadedPsMap.get(fp.playerId);
    const T = latestPsMap.get(fp.playerId);
    if (!L) { mergedPlayerStats.push(fp); continue; }
    if (L && T) {
      const merged: any = { ...fp };
      const keys = new Set([...Object.keys(fp || {}), ...Object.keys(T || {})]);
      for (const k of keys) {
        if (k === 'playerId' || DERIVED_PS_FIELDS.has(k)) continue;
        const fv = fp[k]; const lv = L[k]; const tv = T[k];
        if (eq(fv, lv) && !eq(tv, lv)) {
          merged[k] = tv; // 外部変更を採用
          adoptedExternal = true;
        } else if (!eq(fv, lv) && !eq(tv, lv) && !eq(fv, tv)) {
          conflicts.push(`${fp.playerName || fp.playerId} の ${k} が他の画面でも変更されました`);
        }
      }
      mergedPlayerStats.push(merged);
      continue;
    }
    // 外部で行削除
    if (!eq(fp, L)) {
      mergedPlayerStats.push(fp);
      conflicts.push(`選手行「${fp.playerName || fp.playerId}」は他の画面で削除済みです（編集内容を保持）`);
    } else {
      adoptedExternal = true; // 未変更 → 削除を尊重
    }
  }
  for (const p of latest.playerStats || []) {
    if (p?.playerId && !loadedPsMap.has(p.playerId) && !formPsIds.has(p.playerId)) {
      mergedPlayerStats.push(p); // 外部追加行
      adoptedExternal = true;
    }
  }

  // ---- formations / customStatHeaders (スカラー3方向) ----
  const mergeScalar = <T>(f: T | undefined, l: T | undefined, t: T | undefined, label: string): T | undefined => {
    if (eq(f, l)) {
      if (!eq(t, l)) adoptedExternal = true;
      return t ?? f;
    }
    if (!eq(t, l) && !eq(f, t)) conflicts.push(`${label}が他の画面でも変更されました`);
    return f;
  };

  return {
    events: mergedEvents,
    playerStats: mergedPlayerStats,
    homeFormation: mergeScalar(form.homeFormation, loaded.homeFormation, latest.homeFormation, 'ホームフォーメーション'),
    awayFormation: mergeScalar(form.awayFormation, loaded.awayFormation, latest.awayFormation, 'アウェイフォーメーション'),
    customStatHeaders: mergeScalar(form.customStatHeaders, loaded.customStatHeaders, latest.customStatHeaders, 'カスタム項目') ?? [],
    conflicts,
    adoptedExternal,
  };
}
