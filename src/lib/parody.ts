// クラブ設定「利用形態」に基づくパロディ判定。
// club_profiles/{clubUid} の realTeamUsage / gameTeamUsage を参照する。
//
// 判定ルール（公開名鑑ページ・OGPで共通）:
// - realTeamUsage === true        → 実在のチーム（パロディラベル非表示）
// - gameTeamUsage === true        → パロディ/ファン（既存公開HPフッターと同じ判定）
// - realTeamUsage === false (明示) → パロディ
// - 未設定                        → 既存の公開ページと同じくラベルなし
export function isParodyClub(
  profile: { realTeamUsage?: unknown; gameTeamUsage?: unknown } | null | undefined
): boolean {
  if (!profile || typeof profile !== "object") return false;
  if (profile.realTeamUsage === true) return false;
  if (profile.gameTeamUsage === true) return true;
  if (profile.realTeamUsage === false) return true;
  return false;
}
