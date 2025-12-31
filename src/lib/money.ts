export type MoneyCurrency = "JPY" | "GBP" | "EUR" | string;

export function currencySymbol(c: MoneyCurrency | undefined): string {
  if (c === "GBP") return "￡";
  if (c === "EUR") return "€";
  return "￥";
}

function formatInt(v: number): string {
  return new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 0 }).format(v);
}

export function formatMoneyAbbrev(value: number, currency: MoneyCurrency | undefined): string {
  if (!Number.isFinite(value)) return "-";

  const c = currency || "JPY";

  if (c === "JPY") {
    const v = Math.trunc(Math.abs(value));

    if (v < 10000) return formatInt(v);

    const okuBase = 100_000_000;
    const manBase = 10_000;

    const oku = Math.floor(v / okuBase);
    const okuRem = v % okuBase;
    const man = Math.floor(okuRem / manBase);
    const manRem = okuRem % manBase;

    if (oku === 0) {
      return `${formatInt(man)}万${manRem ? formatInt(manRem) : ""}`;
    }

    return `${formatInt(oku)}億${man ? `${formatInt(man)}万` : ""}${manRem ? formatInt(manRem) : ""}`;
  }

  // GBP / EUR
  const v = Math.abs(value);
  if (v < 1000) return formatInt(v);

  if (v < 1_000_000) {
    const scaled = v / 1000;
    const display = Number.isInteger(scaled) ? String(scaled) : scaled.toFixed(1);
    return `${display}K`;
  }

  const scaled = v / 1_000_000;
  const display = Number.isInteger(scaled) ? String(scaled) : scaled.toFixed(1);
  return `${display}M`;
}

export function formatMoneyWithSymbol(value: number, currency: MoneyCurrency | undefined): string {
  const sign = value < 0 ? "-" : "";
  return `${sign}${currencySymbol(currency)}${formatMoneyAbbrev(Math.abs(value), currency)}`;
}
