import { db } from "@/lib/firebase/admin";
import { toDashSeason, toSlashSeason } from "@/app/api/admin/booklet/lib";

// getPlayerStats（/api/admin/booklet/lib.ts）と同一の集計仕様を、
// チーム全員分を1回のクエリセットで計算する公開名鑑専用の一括版。
// manual優先・シーズン表記揺れ・rating集計の挙動は元関数に忠実に合わせる。
export type BookletPlayerStats = {
  appearances: number;
  minutes: number;
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
  ratingSum: number;
  ratingCount: number;
};

export function emptyBookletStats(): BookletPlayerStats {
  return {
    appearances: 0,
    minutes: 0,
    goals: 0,
    assists: 0,
    yellowCards: 0,
    redCards: 0,
    ratingSum: 0,
    ratingCount: 0,
  };
}

// 選手1人分のmanualStatsMapを構築（getPlayerStats:174-204 と同一手順）
function buildManualStatsMap(playerData: any, targetSeason?: string | null): Map<string, any> {
  const map = new Map<string, any>();

  if (playerData?.manualCompetitionStats && Array.isArray(playerData.manualCompetitionStats)) {
    for (const manualStat of playerData.manualCompetitionStats) {
      if (manualStat?.competitionId && manualStat?.season && typeof manualStat.season === "string") {
        const seasonKey = toSlashSeason(manualStat.season);
        map.set(manualStat.competitionId, { ...manualStat, seasonKey });
      }
    }
  }

  if (playerData?.seasonData && typeof playerData.seasonData === "object") {
    for (const [seasonKey, seasonDataValue] of Object.entries(playerData.seasonData)) {
      const seasonValue = seasonDataValue as any;
      if (seasonValue?.manualCompetitionStats && Array.isArray(seasonValue.manualCompetitionStats)) {
        for (const manualStat of seasonValue.manualCompetitionStats) {
          if (manualStat?.competitionId) {
            const normalizedSeason = toSlashSeason(seasonKey);
            const normalizedTarget = toSlashSeason(targetSeason || "");
            if (normalizedSeason === normalizedTarget) {
              map.set(manualStat.competitionId, { ...manualStat, seasonKey });
            }
          }
        }
      }
    }
  }

  return map;
}

// getPlayerStats:206-235 と同一のシーズン絞り込み
function competitionMatchesSeason(competitionSeason: string | null, normalizedTargetSeason: string | null): boolean {
  if (!normalizedTargetSeason || !competitionSeason) return true;
  const targetSlash = toSlashSeason(normalizedTargetSeason);
  const targetDash = toDashSeason(normalizedTargetSeason);
  const competitionSlash = toSlashSeason(competitionSeason);
  const competitionDash = toDashSeason(competitionSeason);
  const targetFormats = [normalizedTargetSeason, targetSlash, targetDash];
  const competitionFormats = [competitionSeason, competitionSlash, competitionDash];
  return targetFormats.some((tf) => competitionFormats.includes(tf));
}

export type CompetitionMatches = { competitionId: string; matches: any[] };

// Firestore取得層。失敗時はthrowする（呼び出し側でエラー扱いにし、0として扱わない）
async function fetchSeasonMatches(
  ownerUid: string,
  normalizedTargetSeason: string | null
): Promise<CompetitionMatches[]> {
  const competitionsSnap = await db.collection(`clubs/${ownerUid}/competitions`).get();
  const matchingCompetitions = competitionsSnap.docs.filter((doc) => {
    const competitionSeason =
      typeof (doc.data() as any)?.season === "string" ? (doc.data() as any).season : null;
    return competitionMatchesSeason(competitionSeason, normalizedTargetSeason);
  });

  // competitions 間も並列化（元関数は直列forループ）
  return Promise.all(
    matchingCompetitions.map(async (competitionDoc) => {
      const roundsSnap = await competitionDoc.ref.collection("rounds").get();
      const matchesByRound = await Promise.all(
        roundsSnap.docs.map(async (roundDoc) => {
          const matchesSnap = await roundDoc.ref.collection("matches").get();
          return matchesSnap.docs.map((d) => d.data());
        })
      );
      return { competitionId: competitionDoc.id, matches: matchesByRound.flat() };
    })
  );
}

// 純粋な集計層（Firestore非依存・テスト可能）
export function aggregateBookletStats(opts: {
  players: Array<{ id: string; data: any }>;
  matchesByCompetition: CompetitionMatches[];
  targetSeason?: string | null;
}): Map<string, BookletPlayerStats> {
  const { players, matchesByCompetition, targetSeason } = opts;

  const statsMap = new Map<string, BookletPlayerStats>();
  const manualMaps = new Map<string, Map<string, any>>();
  const playerIds = new Set<string>();
  for (const p of players) {
    playerIds.add(p.id);
    statsMap.set(p.id, emptyBookletStats());
    manualMaps.set(p.id, buildManualStatsMap(p.data, targetSeason));
  }

  for (const { competitionId, matches } of matchesByCompetition) {
    // manualがある選手はこの大会の試合データを集計しない（元関数と同一の優先順位）
    const manualPlayers = new Set(
      players.filter((p) => manualMaps.get(p.id)!.has(competitionId)).map((p) => p.id)
    );

    for (const match of matches) {
      if (!match?.playerStats || !Array.isArray(match.playerStats)) continue;
      // 元関数は find() で試合内の最初の一致のみ使用するため、重複エントリは無視する
      const seenInMatch = new Set<string>();
      for (const playerStat of match.playerStats) {
        const pid = (playerStat as any)?.playerId;
        if (typeof pid !== "string" || !playerIds.has(pid) || seenInMatch.has(pid)) continue;
        seenInMatch.add(pid);
        if (manualPlayers.has(pid)) continue;
        const agg = statsMap.get(pid)!;
        const minutesPlayed = Number((playerStat as any)?.minutesPlayed) || 0;
        agg.minutes += minutesPlayed;
        agg.yellowCards += Number((playerStat as any)?.yellowCards) || 0;
        agg.redCards += Number((playerStat as any)?.redCards) || 0;
        agg.appearances += minutesPlayed > 0 ? 1 : 0;
        agg.goals += Number((playerStat as any)?.goals) || 0;
        agg.assists += Number((playerStat as any)?.assists) || 0;
        const rating = Number((playerStat as any)?.rating);
        if (Number.isFinite(rating) && rating > 0) {
          agg.ratingSum += rating;
          agg.ratingCount += 1;
        }
      }
    }

    for (const p of players) {
      const manual = manualMaps.get(p.id)!.get(competitionId);
      if (!manual) continue;
      const agg = statsMap.get(p.id)!;
      agg.appearances += Number.isFinite(manual.matches) ? Number(manual.matches) : 0;
      agg.minutes += Number.isFinite(manual.minutes) ? Number(manual.minutes) : 0;
      agg.goals += Number.isFinite(manual.goals) ? Number(manual.goals) : 0;
      agg.assists += Number.isFinite(manual.assists) ? Number(manual.assists) : 0;
      agg.yellowCards += Number.isFinite(manual.yellowCards) ? Number(manual.yellowCards) : 0;
      agg.redCards += Number.isFinite(manual.redCards) ? Number(manual.redCards) : 0;
      const m = Number.isFinite(manual.matches) ? Number(manual.matches) : 0;
      const r = Number.isFinite(manual.avgRating) ? Number(manual.avgRating) : NaN;
      if (m > 0 && Number.isFinite(r) && r > 0) {
        agg.ratingSum += r * m;
        agg.ratingCount += m;
      }
    }
  }

  return statsMap;
}

type MatchesFetcher = (
  ownerUid: string,
  normalizedTargetSeason: string | null
) => Promise<CompetitionMatches[]>;

/**
 * 指定シーズンのスタッツをチーム全員分まとめて集計する。
 * competitions/rounds/matches をシーズンあたり1回ずつ取得し、
 * 全matchのplayerStatsをメモリ上で各選手に分配する（選手ごとの走査をしない）。
 * 取得に失敗した場合はthrowする — 偽の0を表示しないため呼び出し側でエラー扱いにする。
 */
export async function getBookletSeasonStats(opts: {
  ownerUid: string;
  players: Array<{ id: string; data: any }>;
  targetSeason?: string | null;
  _fetchMatches?: MatchesFetcher; // テスト用の注入ポイント
}): Promise<Map<string, BookletPlayerStats>> {
  const { ownerUid, players, targetSeason, _fetchMatches } = opts;

  const normalizedTargetSeason =
    typeof targetSeason === "string" && targetSeason.trim().length > 0 ? targetSeason.trim() : null;

  const fetcher = _fetchMatches ?? fetchSeasonMatches;
  const matchesByCompetition = await fetcher(ownerUid, normalizedTargetSeason);

  return aggregateBookletStats({ players, matchesByCompetition, targetSeason });
}
