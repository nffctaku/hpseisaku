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
    return season;
  }
  const mShort = season.match(/^(\d{4})\/(\d{2})$/);
  if (mShort) return `${mShort[1]}-${mShort[2]}`;
  const m4 = season.match(/^(\d{4})\/(\d{4})$/);
  if (m4) return `${m4[1]}-${m4[2].slice(-2)}`;
  return season;
}

export function getSeasonDataEntry(seasonData: any, seasonId: string): any {
  if (!seasonData || typeof seasonData !== "object" || !seasonId) return undefined;
  const slash = toSlashSeason(seasonId);
  const dash = toDashSeason(seasonId);
  return seasonData?.[seasonId] ?? seasonData?.[slash] ?? seasonData?.[dash] ?? undefined;
}

export function expandSeasonVariants(raw: string): string[] {
  const s = String(raw || "").trim();
  if (!s) return [];
  const m = s.match(/^(\d{4})([-/])(\d{2}|\d{4})$/);
  if (!m) return [s];
  const start = m[1];
  const end = m[3];
  const end2 = end.length === 4 ? end.slice(-2) : end;
  const end4 = end.length === 2 ? `${start.slice(0, 2)}${end}` : end;
  return [`${start}/${end2}`, `${start}-${end2}`, `${start}/${end4}`, `${start}-${end4}`];
}

export function inferLatestSeasonFromPlayer(playerData: any): string | null {
  if (!playerData || typeof playerData !== "object") return null;
  const seasons = Array.isArray((playerData as any)?.seasons) ? ((playerData as any).seasons as any[]) : [];
  const seasonDataKeys =
    (playerData as any)?.seasonData && typeof (playerData as any).seasonData === "object"
      ? Object.keys((playerData as any).seasonData as any)
      : [];
  const candidates = Array.from(new Set([...seasons, ...seasonDataKeys]))
    .map((s) => (typeof s === "string" ? s.trim() : ""))
    .filter((s) => s.length > 0)
    .map((s) => toSlashSeason(s));
  candidates.sort((a, b) => b.localeCompare(a));
  return candidates[0] ?? null;
}

export function hasSeasonCandidate(playerData: any, season: string): boolean {
  if (!playerData || typeof playerData !== "object") return false;
  const target = toSlashSeason(String(season || "").trim());
  if (!target) return false;
  const seasons = Array.isArray((playerData as any)?.seasons) ? ((playerData as any).seasons as any[]) : [];
  const seasonDataKeys =
    (playerData as any)?.seasonData && typeof (playerData as any).seasonData === "object"
      ? Object.keys((playerData as any).seasonData as any)
      : [];
  const candidates = Array.from(new Set([...seasons, ...seasonDataKeys]))
    .map((s) => (typeof s === "string" ? s.trim() : ""))
    .filter((s) => s.length > 0)
    .map((s) => toSlashSeason(s));
  return candidates.includes(target);
}
