export type UpdateStatus = "draft" | "published";

export const UPDATE_CATEGORIES = ["新機能", "改善", "不具合修正", "メンテナンス", "その他"] as const;

export type UpdateItem = {
  id: string;
  title: string;
  body: string;
  description: string;
  category: string;
  imageUrl?: string;
  linkUrl?: string;
  linkLabel?: string;
  date: string;
  publishedAtMillis: number;
  status: UpdateStatus;
  legacy?: boolean;
};

export function categoryClassName(category: string): string {
  switch (category) {
    case "新機能":
    case "大型アップデート":
      return "bg-emerald-500/15 text-emerald-300";
    case "改善":
      return "bg-blue-500/15 text-blue-300";
    case "不具合修正":
    case "修正":
      return "bg-rose-500/15 text-rose-300";
    case "メンテナンス":
      return "bg-amber-500/15 text-amber-300";
    default:
      return "bg-slate-500/15 text-slate-300";
  }
}

function legacyDate(date: string): number {
  return Date.parse(`${date.replace(/\./g, "-")}T00:00:00+09:00`);
}

function legacyItem(
  date: string,
  category: string,
  title: string,
  description: string,
  imageUrl?: string
): UpdateItem {
  return {
    id: `legacy-${date}-${title}`,
    title,
    body: description,
    description,
    category,
    imageUrl,
    date,
    publishedAtMillis: legacyDate(date),
    status: "published",
    legacy: true,
  };
}

// 過去にコード直書きしていたお知らせ。Firestore化に伴い既存表示を維持するため保持する。
export const LEGACY_UPDATES: UpdateItem[] = [
  legacyItem(
    "2026.09.07",
    "新機能",
    "管理画面の分析管理機能にバランス・ヒートマップ表示を追加",
    "試合の得点・失点を時間帯別に比較できる「バランス」表示と、色の濃さで傾向を把握できる「ヒートマップ」表示を追加しました。",
    "/ヒートマップアップデート.png"
  ),
  legacyItem(
    "2026.08.12",
    "大型アップデート",
    "FootChron アップデートのお知らせ",
    "パフォーマンス改善と不具合修正を中心にアップデートを行いました。分析ダッシュボードの動作速度改善、リーグ表での順位履歴表示不具合修正、選手詳細ページのパラメーターグラフ改善、総合値推移グラフの見やすさ向上、試合スタッツのゴール・アシスト表示改善など。"
  ),
  legacyItem("2026.08.03", "改善", "トップページのモバイル表示を改善", "UIを一新しました。"),
  legacyItem(
    "2026.07.28",
    "新機能",
    "選手名鑑の出力機能をリリースしました",
    "選手プロフィール・スタッフ・写真をまとめた名鑑を、管理画面から直接出力できるようになりました。"
  ),
  legacyItem(
    "2026.07.22",
    "改善",
    "トップページUI改善",
    "モバイル用トップヒーロー画像を新しい画像に差し替え。2枚目と3枚目の画像を自動スライド形式に変更。「無料で始める」ボタンのデザイン変更（青色、横長化）。"
  ),
  legacyItem(
    "2026.07.21",
    "修正",
    "公開ページの選手スタッツ集計の修正",
    "管理画面で入力した手動スタッツが公開ページで正しく反映されるよう修正。getPlayer.tsのマージロジックを改善。"
  ),
  legacyItem(
    "2026.07.20",
    "改善",
    "管理画面UI一貫性改善",
    "クラブ情報設定ページの完全再設計。SNSリンクタブの再設計。友好試合管理ページの再設計。A3選手名鑑エディターの大幅改善。"
  ),
  legacyItem(
    "2026.07.10",
    "改善",
    "レーダーチャートの項目をカスタマイズできるようになりました",
    "表示するスタッフ項目を大会ごとに自由に設定できるようになりました。"
  ),
];

export function formatUpdateDate(millis: number): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(millis));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}.${get("month")}.${get("day")}`;
}

export function plainExcerpt(body: string, max = 120): string {
  const text = body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) =>
      line
        .replace(/^#{1,6}\s*/, "")
        .replace(/^[-*]\s+/, "")
        .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, "$1")
    )
    .join(" ");
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export function mergeUpdates(dynamicItems: UpdateItem[]): UpdateItem[] {
  const seen = new Set<string>();
  const merged: UpdateItem[] = [];
  for (const item of [...dynamicItems, ...LEGACY_UPDATES]) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    merged.push(item);
  }
  merged.sort((a, b) => b.publishedAtMillis - a.publishedAtMillis);
  return merged;
}
