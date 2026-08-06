import { db } from "@/lib/firebase/admin";
import { expandSeasonVariants } from "../[playerId]/design-test/lib/season";

export async function getMatchStatsForPlayers(
  ownerUid: string,
  playerIds: string[],
  activeSeason: string
): Promise<Map<string, { appearances: number; goals: number; assists: number }>> {
  const stats = new Map<string, { appearances: number; goals: number; assists: number }>();
  const idSet = new Set(playerIds);
  const variants = new Set(expandSeasonVariants(activeSeason));

  const compsSnap = await db.collection(`clubs/${ownerUid}/competitions`).get();
  for (const compDoc of compsSnap.docs) {
    const compData = compDoc.data() as any;
    const compSeasonRaw =
      typeof compData?.season === "string" ? String(compData.season).trim() : "";
    if (!compSeasonRaw || !variants.has(compSeasonRaw)) continue;

    const roundsSnap = await compDoc.ref.collection("rounds").get();
    for (const roundDoc of roundsSnap.docs) {
      const matchesSnap = await roundDoc.ref.collection("matches").get();
      for (const matchDoc of matchesSnap.docs) {
        const m = matchDoc.data() as any;
        if (!Array.isArray(m?.playerStats)) continue;
        for (const ps of m.playerStats as any[]) {
          const pid = typeof ps?.playerId === "string" ? ps.playerId : "";
          if (!idSet.has(pid)) continue;
          const minutesPlayed = Number(ps?.minutesPlayed) || 0;
          const goals = Number(ps?.goals) || 0;
          const assists = Number(ps?.assists) || 0;
          const entry = stats.get(pid) || { appearances: 0, goals: 0, assists: 0 };
          if (minutesPlayed > 0) entry.appearances += 1;
          entry.goals += goals;
          entry.assists += assists;
          stats.set(pid, entry);
        }
      }
    }
  }

  return stats;
}
