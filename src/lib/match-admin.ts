import { db } from "@/lib/firebase/admin";
import { MatchDetails, MatchEvent, PlayerStats, TeamStat } from "@/types/match";
import { getSeasonFromMatchDate } from "@/lib/matches";
import { toSlashSeason } from "@/lib/season";
import type { DocumentSnapshot } from "firebase-admin/firestore";

async function getMatchEvents(matchDoc: DocumentSnapshot, data: Record<string, unknown>): Promise<MatchEvent[]> {
  const inline = data.events;
  if (Array.isArray(inline) && inline.length > 0) {
    return inline as MatchEvent[];
  }
  const eventsSnap = await matchDoc.ref.collection("events").orderBy("minute", "asc").get();
  return eventsSnap.docs.map((d) => d.data() as MatchEvent);
}

function toDateString(value: unknown): string {
  if (!value) return "";

  const pad = (n: number) => String(n).padStart(2, "0");

  if (typeof value === "string") {
    const raw = value.trim();
    if (!raw) return "";
    const normalized = raw
      .replace(/\//g, "-")
      .replace(/^(\d{4})-(\d{1,2})-(\d{1,2})$/, (_m, y, mo, da) => `${y}-${pad(mo)}-${pad(da)}`);
    const dt = new Date(normalized);
    if (!Number.isNaN(dt.getTime())) {
      return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
    }
    return raw;
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  }

  if (typeof value === "object" && value !== null && "toDate" in value) {
    try {
      const dt = (value as any).toDate() as Date;
      if (dt instanceof Date && !Number.isNaN(dt.getTime())) {
        return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
      }
    } catch {
      // ignore
    }
  }

  return String(value);
}

export async function getMatchForAdmin(
  clubUid: string,
  competitionId: string,
  roundId: string,
  matchId: string
): Promise<MatchDetails | null> {
  const isFriendly = competitionId === "friendly" || competitionId === "practice";

  let matchDoc;
  if (isFriendly) {
    matchDoc = await db.collection(`clubs/${clubUid}/friendly_matches`).doc(matchId).get();
  } else {
    matchDoc = await db
      .collection(`clubs/${clubUid}/competitions/${competitionId}/rounds/${roundId}/matches`)
      .doc(matchId)
      .get();
  }

  if (!matchDoc.exists) {
    return null;
  }

  const data = matchDoc.data() as any;

  // チーム名の解決
  const teamsSnap = await db.collection(`clubs/${clubUid}/teams`).get();
  const teamsMap = new Map<string, { name?: string; logoUrl?: string }>();
  teamsSnap.forEach((d) => {
    teamsMap.set(d.id, d.data() as any);
  });

  const homeTeam = teamsMap.get(data.homeTeam);
  const awayTeam = teamsMap.get(data.awayTeam);
  const homeTeamName = data.homeTeamName || homeTeam?.name || data.homeTeam || "不明";
  const awayTeamName = data.awayTeamName || awayTeam?.name || data.awayTeam || "不明";
  const homeTeamLogo = data.homeTeamLogo || homeTeam?.logoUrl;
  const awayTeamLogo = data.awayTeamLogo || awayTeam?.logoUrl;

  // 大会・節名
  let competitionName = data.competitionName || "";
  let roundName = data.roundName || "";

  if (!isFriendly) {
    if (!competitionName) {
      const compDoc = await db.collection(`clubs/${clubUid}/competitions`).doc(competitionId).get();
      competitionName = compDoc.data()?.name || "";
    }
    if (!roundName) {
      const roundDoc = await db
        .collection(`clubs/${clubUid}/competitions/${competitionId}/rounds`)
        .doc(roundId)
        .get();
      roundName = roundDoc.data()?.name || "";
    }
  } else {
    competitionName = data.competitionName || (competitionId === "practice" ? "練習試合" : "親善試合");
  }

  let season: string | undefined;
  if (!isFriendly) {
    const compSeasonRaw =
      typeof data.season === 'string' && data.season.trim().length > 0
        ? data.season.trim()
        : (await db.collection(`clubs/${clubUid}/competitions`).doc(competitionId).get()).data()?.season;
    season = compSeasonRaw ? toSlashSeason(String(compSeasonRaw).trim()) : undefined;
  } else {
    const sRaw = getSeasonFromMatchDate(toDateString(data.matchDate));
    season = sRaw ? toSlashSeason(sRaw) : undefined;
  }

  return {
    id: matchDoc.id,
    competitionId,
    roundId,
    homeTeam: data.homeTeam,
    awayTeam: data.awayTeam,
    homeTeamName,
    awayTeamName,
    competitionName,
    competitionLogoUrl: data.competitionLogoUrl,
    roundName,
    homeTeamLogo,
    awayTeamLogo,
    matchDate: toDateString(data.matchDate),
    matchTime: data.matchTime,
    season,
    scoreHome: data.scoreHome ?? null,
    scoreAway: data.scoreAway ?? null,
    pkScoreHome: data.pkScoreHome ?? null,
    pkScoreAway: data.pkScoreAway ?? null,
    teamStats: (data.teamStats || []) as TeamStat[],
    playerStats: (data.playerStats || []) as PlayerStats[],
    events: await getMatchEvents(matchDoc, data as Record<string, unknown>),
    matchDuration: data.matchDuration,
  } as MatchDetails;
}
