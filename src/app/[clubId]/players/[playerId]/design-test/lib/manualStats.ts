import { getSeasonDataEntry } from "./season";
import { SimplePlayerStats } from "./types";

function buildManualStatsMapFromPlayer(playerData: any, targetSeason?: string | null) {
  const manualStatsMap = new Map<string, { matches?: number; minutes?: number; goals?: number; assists?: number }>();
  if (!playerData || typeof playerData !== "object") return manualStatsMap;

  const seasonData = playerData?.seasonData && typeof playerData.seasonData === "object" ? (playerData.seasonData as any) : {};
  const selectedSeasonKey = typeof targetSeason === "string" && targetSeason.trim().length > 0 ? targetSeason.trim() : null;

  const addRows = (rows: any[]) => {
    for (const r of rows) {
      if (r && typeof r.competitionId === "string" && r.competitionId.trim().length > 0) {
        manualStatsMap.set(r.competitionId, {
          matches: typeof r.matches === "number" ? r.matches : undefined,
          minutes: typeof r.minutes === "number" ? r.minutes : undefined,
          goals: typeof r.goals === "number" ? r.goals : undefined,
          assists: typeof r.assists === "number" ? r.assists : undefined,
        });
      }
    }
  };

  if (selectedSeasonKey) {
    const sd = getSeasonDataEntry(seasonData, selectedSeasonKey);
    const rows = Array.isArray((sd as any)?.manualCompetitionStats) ? ((sd as any).manualCompetitionStats as any[]) : [];
    addRows(rows);
  } else {
    for (const sd of Object.values(seasonData)) {
      const rows = Array.isArray((sd as any)?.manualCompetitionStats) ? ((sd as any).manualCompetitionStats as any[]) : [];
      addRows(rows);
    }
  }

  const legacyRows = Array.isArray(playerData?.manualCompetitionStats) ? (playerData.manualCompetitionStats as any[]) : [];
  for (const r of legacyRows) {
    if (r && typeof r.competitionId === "string" && r.competitionId.trim().length > 0) {
      if (manualStatsMap.has(r.competitionId)) continue;
      manualStatsMap.set(r.competitionId, {
        matches: typeof r.matches === "number" ? r.matches : undefined,
        minutes: typeof r.minutes === "number" ? r.minutes : undefined,
        goals: typeof r.goals === "number" ? r.goals : undefined,
        assists: typeof r.assists === "number" ? r.assists : undefined,
      });
    }
  }

  return manualStatsMap;
}

function buildManualStatsMapBySeason(playerData: any): Map<string, Map<string, SimplePlayerStats>> {
  const out = new Map<string, Map<string, SimplePlayerStats>>();
  if (!playerData || typeof playerData !== "object") return out;

  const seasonData = playerData?.seasonData && typeof playerData.seasonData === "object" ? (playerData.seasonData as any) : {};
  for (const [seasonKey, entry] of Object.entries(seasonData)) {
    const seasonId = String(seasonKey || "").trim();
    if (!seasonId) continue;
    const rows = Array.isArray((entry as any)?.manualCompetitionStats) ? (((entry as any).manualCompetitionStats as any[]) ?? []) : [];
    if (!out.has(seasonId)) out.set(seasonId, new Map());
    const m = out.get(seasonId)!;
    for (const r of rows) {
      if (r && typeof (r as any).competitionId === "string" && String((r as any).competitionId).trim().length > 0) {
        const competitionId = String((r as any).competitionId).trim();
        m.set(competitionId, {
          appearances: Number.isFinite((r as any).matches) ? Number((r as any).matches) : 0,
          minutes: Number.isFinite((r as any).minutes) ? Number((r as any).minutes) : 0,
          goals: Number.isFinite((r as any).goals) ? Number((r as any).goals) : 0,
          assists: Number.isFinite((r as any).assists) ? Number((r as any).assists) : 0,
        });
      }
    }
  }

  const legacyRows = Array.isArray(playerData?.manualCompetitionStats) ? (playerData.manualCompetitionStats as any[]) : [];
  if (legacyRows.length > 0) {
    const fallbackSeason = (() => {
      const sd = playerData?.seasonData && typeof playerData.seasonData === "object" ? (playerData.seasonData as any) : {};
      const keys = Object.keys(sd).map((k) => String(k || "").trim()).filter(Boolean);
      keys.sort((a, b) => b.localeCompare(a));
      return keys[0] || "";
    })();
    if (fallbackSeason) {
      if (!out.has(fallbackSeason)) out.set(fallbackSeason, new Map());
      const m = out.get(fallbackSeason)!;
      for (const r of legacyRows) {
        if (r && typeof (r as any).competitionId === "string" && String((r as any).competitionId).trim().length > 0) {
          const competitionId = String((r as any).competitionId).trim();
          m.set(competitionId, {
            appearances: Number.isFinite((r as any).matches) ? Number((r as any).matches) : 0,
            minutes: Number.isFinite((r as any).minutes) ? Number((r as any).minutes) : 0,
            goals: Number.isFinite((r as any).goals) ? Number((r as any).goals) : 0,
            assists: Number.isFinite((r as any).assists) ? Number((r as any).assists) : 0,
          });
        }
      }
    }
  }

  return out;
}

export { buildManualStatsMapFromPlayer, buildManualStatsMapBySeason };
