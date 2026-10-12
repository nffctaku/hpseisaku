// 公開Web名鑑のプラン別カード掲載上限。
// 保存済み cardPlayerIds は削らず、公開表示・OGP生成時にのみ適用する
// （Pro→Free降格時に選択情報を保持し、復帰時に再利用するため）。
export const PUBLIC_BOOKLET_CARD_LIMITS = {
  free: 21,
  pro: 30,
} as const;

export function publicBookletCardLimit(tier: string | null | undefined): number {
  return tier && tier !== "free"
    ? PUBLIC_BOOKLET_CARD_LIMITS.pro
    : PUBLIC_BOOKLET_CARD_LIMITS.free;
}

export function capPublicCardIds(ids: string[], tier: string | null | undefined): string[] {
  return ids.slice(0, publicBookletCardLimit(tier));
}
