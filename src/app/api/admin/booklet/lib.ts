import { db } from "@/lib/firebase/admin";

function formatLastSeasonSummary(slashSeason: string, summary: any): string {
  const matches = typeof summary?.matches === "number" && Number.isFinite(summary.matches) ? summary.matches : null;
  const goals = typeof summary?.goals === "number" && Number.isFinite(summary.goals) ? summary.goals : null;
  if (matches == null && goals == null) return "-";
  const mText = matches != null ? `${matches}試合` : "-";
  const gText = goals != null ? `${goals}得点` : "-";
  return `${slashSeason} ${mText}${gText}`.trim();
}

async function resolveOwnerUidFromUid(uid: string): Promise<string | null> {
  const direct = await db.collection("club_profiles").doc(uid).get();
  if (direct.exists) {
    const data = direct.data() as any;
    return (data?.ownerUid as string) || uid;
  }

  const ownerQuery = await db.collection("club_profiles").where("ownerUid", "==", uid).limit(1).get();
  if (!ownerQuery.empty) {
    const doc = ownerQuery.docs[0];
    const data = doc.data() as any;
    return (data?.ownerUid as string) || doc.id;
  }

  const adminQuery = await db.collection("club_profiles").where("admins", "array-contains", uid).limit(1).get();
  if (!adminQuery.empty) {
    const doc = adminQuery.docs[0];
    const data = doc.data() as any;
    return (data?.ownerUid as string) || doc.id;
  }

  return null;
}

function getPreviousSeason(season: string): string {
  const s = String(season || "").trim();
  const m = s.match(/^(\d{4})[-/](\d{2}|\d{4})$/);
  if (!m) return "";
  const start = parseInt(m[1], 10);
  const prevStart = start - 1;
  const prevEnd = String(prevStart + 1).slice(-2);
  return `${prevStart}-${prevEnd}`;
}

function toSlashSeason(season: string): string {
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

function seasonEquals(a: string, b: string): boolean {
  if (!a || !b) return false;
  return a === b || toSlashSeason(a) === toSlashSeason(b);
}

function toMillis(v: any): number {
  if (!v) return 0;
  if (typeof v?.toMillis === "function") return v.toMillis();
  if (typeof v?.toDate === "function") return v.toDate().getTime();
  if (typeof v?.seconds === "number") return v.seconds * 1000;
  return 0;
}

function normalizeDirection(v: unknown): "in" | "out" {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  return s === "out" ? "out" : "in";
}

function contractEndMonthFromDate(contractEndDate: unknown): number | null {
  if (typeof contractEndDate !== "string") return null;
  const s = contractEndDate.trim();
  if (!s) return null;
  const m1 = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m1) {
    const mm = parseInt(m1[2], 10);
    return Number.isFinite(mm) ? mm : null;
  }
  const m2 = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (m2) {
    const mm = parseInt(m2[2], 10);
    return Number.isFinite(mm) ? mm : null;
  }
  return null;
}

function toFiniteNumber(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return v;
}

function safeString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function toStringOrEmpty(v: unknown): string {
  if (typeof v === "string") return v;
  if (v == null) return "";
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  return "";
}

function pickMemo(...values: unknown[]): string {
  for (const v of values) {
    const s = safeString(v).trim();
    if (s) return s;
  }
  return "";
}

function pickPreferredFoot(...values: unknown[]): string {
  for (const v of values) {
    const s = toStringOrEmpty(v).trim();
    if (s) return s;
  }
  return "";
}

function clamp99(n: unknown): number {
  if (typeof n === "number" && Number.isFinite(n)) return Math.max(0, Math.min(99, n));
  if (typeof n === "string") {
    const v = Number(n);
    if (Number.isFinite(v)) return Math.max(0, Math.min(99, v));
  }
  return 0;
}

function normalizeParams(params: any): { overall: number; items: Array<{ label: string; value: number }> } | null {
  if (!params || typeof params !== "object") return null;
  const overall = clamp99((params as any).overall);
  const itemsRaw = Array.isArray((params as any).items) ? ((params as any).items as any[]) : [];
  const items = itemsRaw.slice(0, 6).map((i) => ({
    label: safeString(i?.label).slice(0, 8) || "",
    value: clamp99(i?.value),
  }));
  if (items.length !== 6) {
    while (items.length < 6) items.push({ label: "", value: 0 });
  }
  return { overall, items };
}

// シーズン形式変換関数
function toDashSeason(season: string): string {
  if (!season) return season;
  if (season.includes("-")) {
    // すでにダッシュ形式の場合はそのまま返す（変換しない）
    return season;
  }
  const mShort = season.match(/^(\d{4})\/(\d{2})$/);
  if (mShort) return `${mShort[1]}-${mShort[2]}`;
  const m2 = season.match(/^(\d{4})\/(\d{2})$/);
  if (m2) return `${m2[1]}-${m2[2]}`;
  const m4 = season.match(/^(\d{4})\/(\d{4})$/);
  if (m4) return `${m4[1]}-${m4[2].slice(-2)}`;
  return season;
}

// スタッツ型定義
interface PlayerStats {
  appearances: number;
  minutes: number;
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
  ratingSum: number;
  ratingCount: number;
}

// getPlayerStats関数
async function getPlayerStats(ownerUid: string, playerId: string, playerData: any, targetSeason?: string | null): Promise<PlayerStats> {
  const aggregatedStats: PlayerStats = {
    appearances: 0,
    minutes: 0,
    goals: 0,
    assists: 0,
    yellowCards: 0,
    redCards: 0,
    ratingSum: 0,
    ratingCount: 0,
  };

  const competitionsSnap = await db.collection(`clubs/${ownerUid}/competitions`).get();

  // 手入力スタッツのマップを構築
  const manualStatsMap = new Map<string, any>();
  
  // 選手データのmanualCompetitionStatsを確認
  if (playerData?.manualCompetitionStats && Array.isArray(playerData.manualCompetitionStats)) {
    for (const manualStat of playerData.manualCompetitionStats) {
      if (manualStat?.competitionId && manualStat?.season && typeof manualStat.season === "string") {
        const seasonKey = toSlashSeason(manualStat.season);
        manualStatsMap.set(manualStat.competitionId, { ...manualStat, seasonKey });
      }
    }
  }
  
  // seasonData内のmanualCompetitionStatsも確認
  if (playerData?.seasonData && typeof playerData.seasonData === "object") {
    for (const [seasonKey, seasonDataValue] of Object.entries(playerData.seasonData)) {
      const seasonValue = seasonDataValue as any;
      if (seasonValue?.manualCompetitionStats && Array.isArray(seasonValue.manualCompetitionStats)) {
        for (const manualStat of seasonValue.manualCompetitionStats) {
          if (manualStat?.competitionId) {
            // targetSeasonと一致する場合のみ追加
            const normalizedSeason = toSlashSeason(seasonKey);
            const normalizedTarget = toSlashSeason(targetSeason || "");
            if (normalizedSeason === normalizedTarget) {
              manualStatsMap.set(manualStat.competitionId, { ...manualStat, seasonKey });
            }
          }
        }
      }
    }
  }

  const normalizedTargetSeason = typeof targetSeason === "string" && targetSeason.trim().length > 0 ? targetSeason.trim() : null;

  for (const competitionDoc of competitionsSnap.docs) {
    const competitionData = competitionDoc.data() as any;
    const competitionSeason = typeof competitionData?.season === "string" ? competitionData.season : null;
    
    // 強化されたシーズンマッチング
    if (normalizedTargetSeason && competitionSeason) {
      const targetSlash = toSlashSeason(normalizedTargetSeason);
      const targetDash = toDashSeason(normalizedTargetSeason);
      const competitionSlash = toSlashSeason(competitionSeason);
      const competitionDash = toDashSeason(competitionSeason);
      
      const targetFormats = [
        normalizedTargetSeason,
        targetSlash,
        targetDash
      ];
      const competitionFormats = [
        competitionSeason,
        competitionSlash,
        competitionDash
      ];
      
      const isMatch = targetFormats.some(tf => competitionFormats.includes(tf));
      
      if (!isMatch) {
        continue;
      }
    }
    
    const manual = manualStatsMap.get(competitionDoc.id);
    
    const roundsSnap = await competitionDoc.ref.collection('rounds').get();
    const matchesByRound = await Promise.all(
      roundsSnap.docs.map(async (roundDoc) => {
        const matchesSnap = await roundDoc.ref.collection('matches').get();
        return matchesSnap.docs.map((d) => d.data());
      })
    );

    for (const match of matchesByRound.flat()) {
      if (!match?.playerStats || !Array.isArray(match.playerStats)) continue;
      
      const playerStat = match.playerStats.find((stat: any) => stat?.playerId === playerId);

      const minutesPlayed = Number(playerStat?.minutesPlayed) || 0;

      if (!manual) {
        aggregatedStats.minutes += minutesPlayed;
        aggregatedStats.yellowCards += Number(playerStat?.yellowCards) || 0;
        aggregatedStats.redCards += Number(playerStat?.redCards) || 0;
        aggregatedStats.appearances += minutesPlayed > 0 ? 1 : 0;
        aggregatedStats.goals += Number(playerStat?.goals) || 0;
        aggregatedStats.assists += Number(playerStat?.assists) || 0;
        const rating = Number(playerStat?.rating);
        if (Number.isFinite(rating) && rating > 0) {
          aggregatedStats.ratingSum += rating;
          aggregatedStats.ratingCount += 1;
        }
      }
    }

    if (manual) {
      aggregatedStats.appearances += Number.isFinite(manual.matches) ? Number(manual.matches) : 0;
      aggregatedStats.minutes += Number.isFinite(manual.minutes) ? Number(manual.minutes) : 0;
      aggregatedStats.goals += Number.isFinite(manual.goals) ? Number(manual.goals) : 0;
      aggregatedStats.assists += Number.isFinite(manual.assists) ? Number(manual.assists) : 0;
      aggregatedStats.yellowCards += Number.isFinite(manual.yellowCards) ? Number(manual.yellowCards) : 0;
      aggregatedStats.redCards += Number.isFinite(manual.redCards) ? Number(manual.redCards) : 0;
      const m = Number.isFinite(manual.matches) ? Number(manual.matches) : 0;
      const r = Number.isFinite(manual.avgRating) ? Number(manual.avgRating) : NaN;
      if (m > 0 && Number.isFinite(r) && r > 0) {
        aggregatedStats.ratingSum += r * m;
        aggregatedStats.ratingCount += m;
      }
    }
  }

  return aggregatedStats;
}

export {
  contractEndMonthFromDate,
  formatLastSeasonSummary,
  getPlayerStats,
  getPreviousSeason,
  normalizeDirection,
  normalizeParams,
  pickMemo,
  pickPreferredFoot,
  resolveOwnerUidFromUid,
  safeString,
  seasonEquals,
  toDashSeason,
  toFiniteNumber,
  toMillis,
  toSlashSeason,
};
