import { db } from "@/lib/firebase/admin";
import { expandSeasonVariants } from "../[playerId]/design-test/lib/season";

export interface MatchRecord {
  season: string;
  competitionName: string;
  roundName: string;
  matchDate: string;
  matchTime?: string;
  opponentName: string;
  ha: "(H)" | "(A)" | "(-)";
  scoreHome: number | null;
  scoreAway: number | null;
  result: "W" | "D" | "L" | "-";
  minutesPlayed: number | null;
  goals: number | null;
  assists: number | null;
}

export interface PlayerStatsWithRecords {
  stats: { appearances: number; goals: number; assists: number };
  matches: MatchRecord[];
}

export async function getMatchStatsForPlayers(
  ownerUid: string,
  playerIds: string[],
  allSeasons: string[],
  activeSeason?: string
): Promise<Map<string, PlayerStatsWithRecords>> {
  const stats = new Map<string, PlayerStatsWithRecords>();
  const idSet = new Set(playerIds);
  const allVariants = new Set(allSeasons.flatMap((s) => expandSeasonVariants(s)));
  const activeVariants = activeSeason
    ? new Set(expandSeasonVariants(activeSeason))
    : null;

  for (const pid of playerIds) {
    stats.set(pid, {
      stats: { appearances: 0, goals: 0, assists: 0 },
      matches: [],
    });
  }

  const teamsSnap = await db.collection(`clubs/${ownerUid}/teams`).get();
  const teamNameMap = new Map<string, string>();
  for (const doc of teamsSnap.docs) {
    const d = doc.data() as any;
    teamNameMap.set(doc.id, typeof d?.name === "string" ? d.name : doc.id);
  }

  const compsSnap = await db.collection(`clubs/${ownerUid}/competitions`).get();

  for (const compDoc of compsSnap.docs) {
    const compData = compDoc.data() as any;
    const compSeasonRaw =
      typeof compData?.season === "string" ? String(compData.season).trim() : "";
    if (!compSeasonRaw || !allVariants.has(compSeasonRaw)) continue;

    const compName =
      typeof compData?.name === "string" && compData.name.trim().length > 0
        ? compData.name
        : compDoc.id;

    const roundsSnap = await compDoc.ref.collection("rounds").get();
    for (const roundDoc of roundsSnap.docs) {
      const roundData = roundDoc.data() as any;
      const roundName =
        typeof roundData?.name === "string" && roundData.name.trim().length > 0
          ? roundData.name
          : roundDoc.id;

      const matchesSnap = await roundDoc.ref.collection("matches").get();
      for (const matchDoc of matchesSnap.docs) {
        const m = matchDoc.data() as any;
        const ps = Array.isArray(m?.playerStats) ? (m.playerStats as any[]) : [];

        const matchDate = typeof m?.matchDate === "string" ? m.matchDate : "";
        const matchTime = typeof m?.matchTime === "string" ? m.matchTime : undefined;
        const homeTeamId = typeof m?.homeTeam === "string" ? m.homeTeam : "";
        const awayTeamId = typeof m?.awayTeam === "string" ? m.awayTeam : "";
        const homeTeamName =
          (typeof m?.homeTeamName === "string" && m.homeTeamName) ||
          teamNameMap.get(homeTeamId) ||
          "-";
        const awayTeamName =
          (typeof m?.awayTeamName === "string" && m.awayTeamName) ||
          teamNameMap.get(awayTeamId) ||
          "-";
        const scoreHome = typeof m?.scoreHome === "number" ? m.scoreHome : null;
        const scoreAway = typeof m?.scoreAway === "number" ? m.scoreAway : null;

        const byPlayer = new Map<string, any>();
        for (const s of ps) {
          const pid = typeof s?.playerId === "string" ? s.playerId : "";
          if (!pid || !idSet.has(pid)) continue;
          byPlayer.set(pid, s);
        }

        const isActiveSeason =
          activeVariants && activeVariants.has(compSeasonRaw);

        for (const [pid, s] of byPlayer.entries()) {
          const playerTeamId = typeof s?.teamId === "string" ? s.teamId : "";
          const isHome = Boolean(playerTeamId)
            ? playerTeamId === homeTeamId
            : true;
          const isAway = Boolean(playerTeamId)
            ? playerTeamId === awayTeamId
            : false;
          const ha: "(H)" | "(A)" | "(-)" = isHome
            ? "(H)"
            : isAway
            ? "(A)"
            : "(-)";
          const opponentName = isHome
            ? awayTeamName
            : isAway
            ? homeTeamName
            : "-";

          const myScore = isHome ? scoreHome : isAway ? scoreAway : scoreHome;
          const oppScore = isHome ? scoreAway : isAway ? scoreHome : scoreAway;
          let result: "W" | "D" | "L" | "-" = "-";
          if (typeof myScore === "number" && typeof oppScore === "number") {
            if (myScore > oppScore) result = "W";
            else if (myScore === oppScore) result = "D";
            else result = "L";
          }

          const minutesPlayed = Number(s?.minutesPlayed);
          const minutes = Number.isFinite(minutesPlayed) ? minutesPlayed : null;
          const goals = Number(s?.goals);
          const goalsVal = Number.isFinite(goals) ? goals : null;
          const assists = Number(s?.assists);
          const assistsVal = Number.isFinite(assists) ? assists : null;

          const entry = stats.get(pid);
          if (!entry) continue;

          if (isActiveSeason && (minutes ?? 0) > 0) {
            entry.stats.appearances += 1;
            entry.stats.goals += goalsVal ?? 0;
            entry.stats.assists += assistsVal ?? 0;
          }

          entry.matches.push({
            season: compSeasonRaw,
            competitionName: compName,
            roundName,
            matchDate,
            matchTime,
            opponentName,
            ha,
            scoreHome,
            scoreAway,
            result,
            minutesPlayed: minutes,
            goals: goalsVal,
            assists: assistsVal,
          });
        }
      }
    }
  }

  for (const v of stats.values()) {
    v.matches.sort((a, b) => {
      const aMs = Date.parse(a.matchDate) || 0;
      const bMs = Date.parse(b.matchDate) || 0;
      return bMs - aMs;
    });
  }

  return stats;
}
