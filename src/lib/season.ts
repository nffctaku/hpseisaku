export function toSlashSeason(season: string): string {
  if (!season) return season;
  if (season.includes("/")) {
    const parts = season.split("/");
    if (parts.length === 2 && /^\d{4}$/.test(parts[0])) {
      const end = parts[1];
      const end2 = /^\d{4}$/.test(end) ? end.slice(-2) : end;
      if (/^\d{2}$/.test(end2)) return `${parts[0]}/${end2}`;
    }
    return season;
  }
  const mShort = season.match(/^(\d{4})-(\d{2})$/);
  if (mShort) return `${mShort[1]}/${mShort[2]}`;
  const m4 = season.match(/^(\d{4})-(\d{4})$/);
  if (m4) return `${m4[1]}/${m4[2].slice(-2)}`;
  return season;
}

export function toDashSeason(season: string): string {
  if (!season) return season;
  if (season.includes("-")) {
    const parts = season.split("-");
    if (parts.length === 2 && /^\d{4}$/.test(parts[0])) {
      const end = parts[1];
      const end2 = /^\d{4}$/.test(end) ? end.slice(-2) : end;
      if (/^\d{2}$/.test(end2)) return `${parts[0]}-${end2}`;
    }
    return season;
  }
  const mShort = season.match(/^(\d{4})\/(\d{2})$/);
  if (mShort) return `${mShort[1]}-${mShort[2]}`;
  const m4 = season.match(/^(\d{4})\/(\d{4})$/);
  if (m4) return `${m4[1]}-${m4[2].slice(-2)}`;
  return season;
}

export function seasonKeyCandidates(season: string): string[] {
  return Array.from(
    new Set(
      [season, toSlashSeason(season), toDashSeason(season)].filter(
        (v): v is string => typeof v === "string" && v.trim().length > 0
      )
    )
  );
}

export function normalizeSeasonNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v.trim()))) {
    return Number(v.trim());
  }
  return null;
}

// seasonData[season].number を取り出す。レガシーの配列形式は index 0 が背番号。
export function resolveSeasonScopedNumber(seasonData: unknown, seasonKeys: string[]): number | null {
  if (!seasonData || typeof seasonData !== "object") return null;
  const sd = seasonData as Record<string, unknown>;
  for (const key of seasonKeys) {
    const entry = sd[key];
    const raw =
      Array.isArray(entry)
        ? entry[0]
        : entry && typeof entry === "object"
          ? (entry as Record<string, unknown>).number
          : undefined;
    const n = normalizeSeasonNumber(raw);
    if (n !== null) return n;
  }
  return null;
}

export function generateSeasonOptions(): string[] {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const start = month >= 7 ? year : year - 1;
  const maxStartYear = 2059;
  const out: string[] = [];

  // Future seasons up to 2059/60
  for (let y = Math.min(start, maxStartYear); y <= maxStartYear; y += 1) {
    out.push(`${y}/${String((y + 1) % 100).padStart(2, "0")}`);
  }

  // Past seasons (keep existing behavior: last 20 seasons)
  for (let y = start - 1; y >= start - 20; y -= 1) {
    out.push(`${y}/${String((y + 1) % 100).padStart(2, "0")}`);
  }

  out.sort((a, b) => b.localeCompare(a));
  return out;
}
