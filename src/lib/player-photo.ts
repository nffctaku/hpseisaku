// 選手画像URLの解決ヘルパー。
// photoUrl は以下に分散して保存され得るため、優先順位つきでフォールバックする：
//   1. seasonData[対象シーズン].photoUrl（slash/dash 両キー対応）
//   2. トップレベル photoUrl
//   3. 他シーズンの seasonData.photoUrl（最新シーズンキー優先）
// 空文字 "" は「未設定」と同じ扱いにする（?? だと空文字でフォールバックが止まるため）。

const nonEmpty = (v: unknown): string =>
  typeof v === "string" && v.trim().length > 0 ? v.trim() : "";

const dashKey = (season: string): string => season.trim().replace(/\//g, "-");
const slashKey = (season: string): string => season.trim().replace(/-/g, "/");

export function pickPlayerPhotoUrl(
  player: { photoUrl?: unknown; seasonData?: unknown } | null | undefined,
  season?: string
): string {
  if (!player) return "";
  const sd =
    player.seasonData && typeof player.seasonData === "object"
      ? (player.seasonData as Record<string, any>)
      : {};

  if (season && season.trim()) {
    for (const k of [season.trim(), dashKey(season), slashKey(season)]) {
      const url = nonEmpty(sd[k]?.photoUrl);
      if (url) return url;
    }
  }

  const top = nonEmpty(player.photoUrl);
  if (top) return top;

  // 他シーズンの写真（キー降順＝新しいシーズン優先）
  for (const k of Object.keys(sd).sort().reverse()) {
    const url = nonEmpty(sd[k]?.photoUrl);
    if (url) return url;
  }

  return "";
}
