// OCR解析結果のサーバー側検証。
// 「使える情報」判定はモデルの自己申告に依存せず、結果JSONの中身で判断する。
// 消費ルール: usable=true のみ枠を消費する。

import type {
  StatsImageAnalysisResult,
  RatingsImageAnalysisResult,
  EventsImageAnalysisResult,
  OcrImageKind,
} from './stats-image-parser';

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export function isAllowedImageType(mime: string): boolean {
  return ALLOWED_MIME.includes(mime);
}

export function isValidBase64Image(data: string): boolean {
  if (typeof data !== 'string' || data.length === 0) return false;
  // 25MB base64 上限
  if (data.length > 25 * 1024 * 1024) return false;
  // 先頭のbase64妥当性（完全検証はしない）
  return /^[A-Za-z0-9+/=\s]+$/.test(data.slice(0, 200));
}

function isFiniteNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isValidMinute(v: unknown): boolean {
  if (v == null) return true;
  if (isFiniteNum(v)) return v >= 0 && v <= 200;
  // "45+2" 形式
  if (typeof v === 'string') return /^\d{1,3}(\+\d{1,2})?$/.test(v.trim());
  return false;
}

function isValidScore(v: unknown): v is number {
  return isFiniteNum(v) && v >= 0 && v <= 99 && Number.isInteger(v);
}

function isValidRating(v: unknown): boolean {
  return v == null || (isFiniteNum(v) && v >= 0 && v <= 10.5);
}

function isValidStatValue(v: unknown): boolean {
  // チームスタッツ各項目の妥当性: null または 0〜10000の有限数
  return v == null || (isFiniteNum(v) && v >= 0 && v <= 10000);
}

function hasAnyNumber(obj: Record<string, unknown> | null | undefined, sideCheck: 'both' | 'either'): boolean {
  if (!obj) return false;
  const home = isValidStatValue(obj.home) && obj.home != null;
  const away = isValidStatValue(obj.away) && obj.away != null;
  return sideCheck === 'both' ? home && away : home || away;
}

/** 数値フィールド群を検証し、不正値は null に正規化したコピーを返す。 */
export function sanitizeSidePair<T extends { home: number | null; away: number | null }>(
  pair: T | null | undefined
): T | null {
  if (!pair) return null;
  const home = isValidStatValue(pair.home) ? pair.home : null;
  const away = isValidStatValue(pair.away) ? pair.away : null;
  return { ...pair, home, away };
}

const OCR_EVENT_TYPES = new Set([
  'goal', 'pk_success', 'pk_miss', 'substitution',
  'yellow_card', 'red_card', 'own_goal', 'unknown',
]);

/**
 * 解析結果に「使える情報」が含まれるかを判定する。
 * 種別と結果の整合も確認する。
 */
export function isUsableResult(result: unknown, kind: OcrImageKind): boolean {
  if (!result || typeof result !== 'object') return false;
  const r = result as Record<string, unknown>;

  if (kind === 'team_stats') {
    const match = r.match as Record<string, unknown> | undefined;
    const stats = r.team_stats as Record<string, { home?: unknown; away?: unknown }> | undefined;

    // スコアだけ読めた場合も対象
    if (match && (isValidScore(match.score_home) || isValidScore(match.score_away))) return true;

    // 片側だけ読めても対象
    if (stats) {
      for (const key of Object.keys(stats)) {
        if (hasAnyNumber(stats[key] as Record<string, unknown>, 'either')) return true;
      }
    }
    return false;
  }

  if (kind === 'ratings') {
    const match = r.match as Record<string, unknown> | undefined;
    const players = r.players;
    if (match && (isValidScore(match.score_home) || isValidScore(match.score_away))) return true;
    if (Array.isArray(players)) {
      // 名前+評価点が読めれば対象（照合待ちでも可）
      return players.some((p) => {
        if (!p || typeof p !== 'object') return false;
        const rec = p as Record<string, unknown>;
        const name = rec.name;
        return (
          typeof name === 'string' &&
          name.trim() !== '' &&
          isValidRating(rec.rating) &&
          rec.rating != null
        );
      });
    }
    return false;
  }

  if (kind === 'events') {
    const match = r.match as Record<string, unknown> | undefined;
    const events = r.events;
    if (match && (isValidScore(match.score_home) || isValidScore(match.score_away))) return true;
    if (Array.isArray(events)) {
      return events.some((e) => {
        if (!e || typeof e !== 'object') return false;
        const ev = e as Record<string, unknown>;
        // 時刻+種別が読めれば選手未入力でも対象
        const validType = typeof ev.type === 'string' && OCR_EVENT_TYPES.has(ev.type) && ev.type !== 'unknown';
        const hasMinute = ev.minute != null && isValidMinute(ev.minute);
        // 明確に読めた項目を持つ要確認イベントも対象（unknownでもminute+選手名があれば）
        const hasName = typeof ev.player_name === 'string' && ev.player_name.trim() !== '';
        return (validType && hasMinute) || (ev.type === 'unknown' && hasMinute && hasName);
      });
    }
    return false;
  }

  return false;
}

/**
 * ratings結果の構造を検証・正規化する。不正な行は除去。
 */
export function sanitizeRatingsResult(result: RatingsImageAnalysisResult): RatingsImageAnalysisResult {
  const players = Array.isArray(result.players) ? result.players : [];
  return {
    kind: 'ratings',
    match: result.match || { home_team: null, away_team: null, score_home: null, score_away: null },
    players: players
      .filter((p) => p && typeof p.name === 'string' && p.name.trim() !== '')
      .map((p) => ({
        name: p.name.trim(),
        rating: isValidRating(p.rating) ? p.rating : null,
        goals: isFiniteNum(p.goals) && p.goals >= 0 && p.goals <= 20 ? Math.floor(p.goals) : null,
        assists: isFiniteNum(p.assists) && p.assists >= 0 && p.assists <= 20 ? Math.floor(p.assists) : null,
        team_side: p.team_side === 'home' || p.team_side === 'away' ? p.team_side : null,
      })),
  };
}

/**
 * events結果の構造を検証・正規化する。不正な行は除去。
 */
export function sanitizeEventsResult(result: EventsImageAnalysisResult): EventsImageAnalysisResult {
  const events = Array.isArray(result.events) ? result.events : [];
  const str = (v: unknown): string | null =>
    typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
  return {
    kind: 'events',
    match: result.match || { home_team: null, away_team: null, score_home: null, score_away: null },
    events: events
      .filter((e) => e && typeof e === 'object')
      .map((e) => ({
        minute: isValidMinute(e.minute) ? e.minute : null,
        type: typeof e.type === 'string' && OCR_EVENT_TYPES.has(e.type) ? e.type : 'unknown',
        team_side: e.team_side === 'home' || e.team_side === 'away' ? e.team_side : null,
        player_name: str(e.player_name),
        out_player_name: str(e.out_player_name),
        in_player_name: str(e.in_player_name),
        assist_name: str(e.assist_name),
      })),
  };
}

export function scoreIsValid(scoreHome: unknown, scoreAway: unknown): boolean {
  return isValidScore(scoreHome) && isValidScore(scoreAway);
}

export type { StatsImageAnalysisResult, RatingsImageAnalysisResult, EventsImageAnalysisResult };
