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
