export function clampText(s: string, max: number): string {
  const t = (s || "").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

export function preferredFootLabel(v?: string): string {
  const s = String(v || "").trim().toLowerCase();
  if (!s) return "-";
  if (s === "right" || s === "r" || s === "右" || s === "右利き") return "右利き";
  if (s === "left" || s === "l" || s === "左" || s === "左利き") return "左利き";
  if (s === "both" || s === "両" || s === "両利き") return "両利き";
  return "-";
}

export function contractEndLabel(contractEndDate?: string): string {
  const s = String(contractEndDate || "").trim();
  if (!s) return "";
  const m = s.match(/^(\d{4})-(\d{1,2})$/);
  if (m) return `(${m[1]}年${String(parseInt(m[2], 10))}月)`;
  return "";
}

export function isAlphabetName(name: string): boolean {
  const s = String(name || "").trim();
  if (!s) return false;
  // Allow Latin script letters (incl. accented), numbers and common separators.
  // If it contains non-Latin letters (e.g. Japanese), treat as non-alphabet.
  return /^[\p{Script=Latin}0-9 .,'\-]+$/u.test(s);
}

export function getPositionOrder(position: string): number {
  const pos = (position || "").toUpperCase();

  // GKの判定
  if (pos.includes("GK") || pos.includes("ゴールキーパー") || pos.includes("キーパー")) {
    return 0;
  }

  // DFの判定
  if (
    pos.includes("DF") ||
    pos.includes("ディフェンダー") ||
    pos.includes("ディフェンス") ||
    pos.includes("CB") ||
    pos.includes("LB") ||
    pos.includes("RB") ||
    pos.includes("SB") ||
    pos.includes("センターバック") ||
    pos.includes("レフトバック") ||
    pos.includes("ライトバック")
  ) {
    return 1;
  }

  // MFの判定
  if (
    pos.includes("MF") ||
    pos.includes("ミッドフィルダー") ||
    pos.includes("ミッドフィールド") ||
    pos.includes("CM") ||
    pos.includes("DM") ||
    pos.includes("AM") ||
    pos.includes("LM") ||
    pos.includes("RM") ||
    pos.includes("センターミッドフィルダー") ||
    pos.includes("ディフェンシブミッドフィルダー") ||
    pos.includes("アタッキングミッドフィルダー") ||
    pos.includes("サイドミッドフィルダー")
  ) {
    return 2;
  }

  // FWの判定
  if (
    pos.includes("FW") ||
    pos.includes("フォワード") ||
    pos.includes("ストライカー") ||
    pos.includes("ST") ||
    pos.includes("CF") ||
    pos.includes("LW") ||
    pos.includes("RW") ||
    pos.includes("センターフォワード") ||
    pos.includes("ウインガー")
  ) {
    return 3;
  }

  return 99; // その他
}
