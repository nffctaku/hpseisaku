import { toDashSeason } from "@/lib/season";

export type JoinType = "permanent" | "loan" | "loan_return" | "promotion";

export type JoinBadge = "NEW" | "LOAN" | "BACK" | "UP";

export const JOIN_TYPE_OPTIONS: Array<{ value: JoinType; label: string }> = [
  { value: "permanent", label: "完全移籍" },
  { value: "loan", label: "レンタル加入" },
  { value: "loan_return", label: "レンタルバック" },
  { value: "promotion", label: "下部組織から昇格" },
];

export const JOIN_BADGE_STYLE: Record<JoinBadge, { bg: string; fg: string }> = {
  NEW: { bg: "#FBBF24", fg: "#422006" },
  LOAN: { bg: "#7DD3FC", fg: "#082F49" },
  BACK: { bg: "#6EE7B7", fg: "#064E3B" },
  UP: { bg: "#C4B5FD", fg: "#3B0764" },
};

const JOIN_BADGE_MAP: Record<JoinType, JoinBadge> = {
  permanent: "NEW",
  loan: "LOAN",
  loan_return: "BACK",
  promotion: "UP",
};

/** seasonData[対象シーズン].joinType から名鑑バッジを解決。記録が無い/明示クリア(null,"")はバッジなし */
export function resolveJoinBadge(joinType: unknown): JoinBadge | null {
  if (typeof joinType !== "string") return null;
  return JOIN_BADGE_MAP[joinType as JoinType] ?? null;
}

/** "2027/28" "2027-28" "2027-2028" 等から開始年を安全に取得。不正値は null */
export function trySeasonStartYear(season: unknown): number | null {
  if (typeof season !== "string") return null;
  const m = season.trim().match(/^(\d{4})/);
  return m ? parseInt(m[1], 10) : null;
}

function dashKeyForYear(startYear: number): string {
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

function findSeasonEntry(
  seasonData: Record<string, unknown>,
  dashKey: string
): { key: string; entry: Record<string, unknown> } | undefined {
  for (const k of Object.keys(seasonData)) {
    if (toDashSeason(k) !== dashKey) continue;
    const v = seasonData[k];
    if (v && typeof v === "object" && !Array.isArray(v)) {
      return { key: k, entry: v as Record<string, unknown> };
    }
  }
  return undefined;
}

const MAX_LOAN_FORWARD_YEARS = 10;

/**
 * 加入形態保存時に player doc の seasonData へ適用する差分（dot-path updates）を生成する。
 *
 * - 対象シーズンへの明示記録（joinType / loanEndSeason）は呼び出し側が seasonPayload で行う。
 *   ここでは「対象より未来のシーズン」だけを扱う。
 * - joinType === "loan" かつ loanEndSeason あり: 翌シーズン〜終了シーズンに
 *   { joinType: "loan", joinTypeAuto: true } を前方展開（明示指定済みのシーズンは上書きしない）。
 * - それ以外: 対象より未来の「自動展開された loan」を除去（明示指定は残す）。
 *
 * 未登録（キーなし）と明示的未設定（null）を区別するため、除去は deleteField ではなく
 * null ではなく自動分のみ null 化する。
 */
export function buildJoinTypeFutureUpdates(
  seasonData: Record<string, unknown> | null | undefined,
  targetSeason: string,
  joinType: JoinType | "" | null | undefined,
  loanEndSeason: string | null | undefined
): Record<string, unknown> {
  const updates: Record<string, unknown> = {};
  const tYear = trySeasonStartYear(targetSeason);
  if (tYear == null) return updates;
  const sd = seasonData && typeof seasonData === "object" ? seasonData : {};
  const endYear = joinType === "loan" ? trySeasonStartYear(loanEndSeason) : null;

  const fillYears: number[] = [];
  if (joinType === "loan" && endYear != null) {
    for (let y = tYear + 1; y <= endYear && y <= tYear + MAX_LOAN_FORWARD_YEARS; y++) {
      fillYears.push(y);
    }
  }
  const fillDashKeys = new Set(fillYears.map(dashKeyForYear));

  // 前方展開（既存エントリはその表記のキーへ、無ければ dash 形式で新規）
  for (const y of fillYears) {
    const dash = dashKeyForYear(y);
    const found = findSeasonEntry(sd, dash);
    const hasExplicit =
      found != null && "joinType" in found.entry && found.entry.joinTypeAuto !== true;
    if (!hasExplicit) {
      const key = found?.key ?? dash;
      updates[`seasonData.${key}.joinType`] = "loan";
      updates[`seasonData.${key}.joinTypeAuto`] = true;
    }
  }

  // 自動展開分の除去（将来シーズンに残った stale な auto loan のみ。明示記録は残す）
  for (const key of Object.keys(sd)) {
    const ky = trySeasonStartYear(key);
    if (ky == null || ky <= tYear) continue;
    if (fillDashKeys.has(toDashSeason(key))) continue;
    const entry = sd[key];
    if (
      entry &&
      typeof entry === "object" &&
      !Array.isArray(entry) &&
      (entry as any).joinType === "loan" &&
      (entry as any).joinTypeAuto === true
    ) {
      updates[`seasonData.${key}.joinType`] = null;
      updates[`seasonData.${key}.joinTypeAuto`] = null;
    }
  }

  return updates;
}
