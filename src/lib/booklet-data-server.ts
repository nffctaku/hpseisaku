import { db } from "@/lib/firebase/admin";
import {
  contractEndMonthFromDate,
  getPlayerStats,
  getPreviousSeason,
  normalizeDirection,
  normalizeParams,
  pickMemo,
  pickPreferredFoot,
  safeString,
  seasonEquals,
  toDashSeason,
  toFiniteNumber,
  toMillis,
  toSlashSeason,
} from "@/app/api/admin/booklet/lib";

export type BookletTeamData = {
  seasonId: string;
  teamId: string;
  teamName: string;
  club: { clubName: string; logoUrl: string | null };
  players: any[];
  transfersIn: Array<{ type: string; position: string; playerName: string; fromTo: string }>;
  transfersOut: Array<{ type: string; position: string; playerName: string; fromTo: string }>;
};

/**
 * 名鑑用の選手・移籍データを集約する（/api/admin/booklet と公開ページで共有）。
 * playerIds を指定した場合、その選手のみ集計する（公開ページの読み込み量削減用）。
 */
export async function getBookletTeamData(opts: {
  ownerUid: string;
  teamId: string;
  seasonId: string;
  clubProfile: { clubName?: unknown; logoUrl?: unknown } | null;
  playerIds?: Set<string> | null;
}): Promise<BookletTeamData> {
  const { ownerUid, teamId, seasonId, clubProfile, playerIds } = opts;

  const teamSnap = await db.doc(`clubs/${ownerUid}/teams/${teamId}`).get();
  const teamName = teamSnap.exists ? safeString((teamSnap.data() as any)?.name) : "";

  const rosterSeasonDocId = toDashSeason(seasonId);
  const rosterSnap = await db.collection(`clubs/${ownerUid}/seasons/${rosterSeasonDocId}/roster`).get();
  const prevSeason = getPreviousSeason(seasonId);

  const transfersSnap = await db.collection(`clubs/${ownerUid}/teams/${teamId}/transfers`).get();
  const transfers = transfersSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as any));
  const seasonTransfers = transfers
    .filter((t) => {
      const s = safeString((t as any)?.season).trim();
      return !seasonId ? true : seasonEquals(s, seasonId);
    })
    .sort((a, b) => toMillis((b as any)?.createdAt) - toMillis((a as any)?.createdAt));

  const transfersIn = seasonTransfers
    .filter((t) => normalizeDirection((t as any)?.direction) === "in")
    .map((t) => ({
      type: safeString((t as any)?.kind) || "完全",
      position: safeString((t as any)?.position) || "-",
      playerName: safeString((t as any)?.playerName) || "-",
      fromTo: safeString((t as any)?.counterparty) || "-",
    }));

  const transfersOut = seasonTransfers
    .filter((t) => normalizeDirection((t as any)?.direction) === "out")
    .map((t) => ({
      type: safeString((t as any)?.kind) || "完全",
      position: safeString((t as any)?.position) || "-",
      playerName: safeString((t as any)?.playerName) || "-",
      fromTo: safeString((t as any)?.counterparty) || "-",
    }));

  // まず指定シーズンの選手を取得
  const seasonRosterPlayers = rosterSnap.docs
    .map((d) => ({ id: d.id, ...(d.data() as any) }))
    .filter((p) => String((p as any)?.teamId || "").trim() === teamId);

  // 次にチームの選手コレクションからシーズンを含む選手を取得
  const playersSnap = await db.collection(`clubs/${ownerUid}/teams/${teamId}/players`).get();
  const teamPlayers = playersSnap.docs
    .map((d) => ({ id: d.id, ...(d.data() as any) }))
    .filter((p) => {
      const playerSeasons = Array.isArray((p as any)?.seasons) ? (p as any).seasons : [];
      return (
        playerSeasons.includes(seasonId) ||
        playerSeasons.includes(toSlashSeason(seasonId)) ||
        playerSeasons.includes(toDashSeason(seasonId))
      );
    });

  const teamPlayerIds = new Set(playersSnap.docs.map((d) => d.id));

  // チームの選手コレクションを優先（選手管理はここに保存するため）
  const rosterPlayers = teamPlayers.filter((p) =>
    playerIds && playerIds.size > 0 ? playerIds.has(p.id) : true
  );
  void seasonRosterPlayers;
  void teamPlayerIds;

  const players = await Promise.all(
    rosterPlayers.map(async (p) => {
      const playerDocSnap = await db
        .doc(`clubs/${ownerUid}/teams/${teamId}/players/${p.id}`)
        .get()
        .catch(() => null as any);
      const playerDoc = playerDocSnap?.exists ? (playerDocSnap.data() as any) : null;

      if (!playerDocSnap?.exists) {
        return null;
      }

      // 昨シーズンのスタッツを取得
      let lastSeasonSummary = "-";

      if (prevSeason) {
        // 前シーズンの手入力スタッツを確認
        const playerSeasonData = (p as any)?.seasonData || {};
        const prevSeasonData = playerSeasonData[prevSeason] || {};
        const manualStats = prevSeasonData.manualCompetitionStats;

        if (manualStats && Array.isArray(manualStats) && manualStats.length > 0) {
          let totalMatches = 0;
          let totalGoals = 0;

          for (const stat of manualStats) {
            totalMatches += Number.isFinite(stat.matches) ? Number(stat.matches) : 0;
            totalGoals += Number.isFinite(stat.goals) ? Number(stat.goals) : 0;
          }

          lastSeasonSummary = `${totalMatches}試合${totalGoals}ゴール`;
        } else {
          try {
            const mergedPlayerData = { ...p, ...playerDoc };
            const prevStats = await getPlayerStats(ownerUid, p.id, mergedPlayerData, prevSeason);

            if (prevStats.appearances > 0 || prevStats.goals > 0 || prevStats.assists > 0) {
              lastSeasonSummary = `${prevStats.appearances}試合 ${prevStats.goals}ゴール ${prevStats.assists}アシスト`;
            }
          } catch (error) {
            console.error(`Failed to fetch ${prevSeason} match stats for player ${p.id}:`, error);
          }
        }
      }

      const seasonData =
        (p as any)?.seasonData && typeof (p as any).seasonData === "object" ? ((p as any).seasonData as any) : {};
      const seasonKeys = [seasonId, toSlashSeason(seasonId), toDashSeason(seasonId)].filter(
        (s, i, arr) => typeof s === "string" && s.trim().length > 0 && arr.indexOf(s) === i
      );
      const sd = (() => {
        for (const k of seasonKeys) {
          const v = seasonData?.[k];
          if (v && typeof v === "object") return v as any;
        }
        return {} as any;
      })();

      const seasonsArr: string[] = Array.isArray((p as any)?.seasons)
        ? (((p as any).seasons as any[]) || []).filter((s) => typeof s === "string")
        : Array.isArray(playerDoc?.seasons)
          ? (playerDoc.seasons as any[]).filter((s) => typeof s === "string")
          : [];

      const explicitTenureYears =
        toFiniteNumber(sd?.tenureYears) ??
        toFiniteNumber((p as any)?.tenureYears) ??
        toFiniteNumber(playerDoc?.tenureYears);

      const inferredTenureYears = seasonsArr.filter((s) => String(s).trim().length > 0).length || 1;
      const tenureYears = explicitTenureYears ?? inferredTenureYears;

      const isNew =
        explicitTenureYears != null
          ? explicitTenureYears <= 1
          : prevSeason
            ? !seasonsArr.includes(prevSeason)
            : false;

      const mergedPlayerData = {
        ...p,
        ...playerDoc,
        seasonData: (p as any)?.seasonData || playerDoc?.seasonData,
      };
      const currentStats = await getPlayerStats(ownerUid, p.id, mergedPlayerData, seasonId).catch(() => ({
        appearances: 0,
        minutes: 0,
        goals: 0,
        assists: 0,
        yellowCards: 0,
        redCards: 0,
        ratingSum: 0,
        ratingCount: 0,
      }));
      const avgRating =
        currentStats.ratingCount > 0
          ? Math.round((currentStats.ratingSum / currentStats.ratingCount) * 100) / 100
          : null;

      const merged = {
        id: p.id,
        name: safeString(sd?.name) || safeString((p as any)?.name) || safeString(playerDoc?.name),
        subName:
          safeString(sd?.subName) || safeString((p as any)?.subName) || safeString(playerDoc?.subName),
        number:
          (toFiniteNumber(sd?.number) ??
            toFiniteNumber((p as any)?.number) ??
            toFiniteNumber(playerDoc?.number)) ??
          null,
        position:
          safeString(sd?.position) || safeString((p as any)?.position) || safeString(playerDoc?.position),
        mainPosition:
          safeString(sd?.mainPosition) ||
          safeString((p as any)?.mainPosition) ||
          safeString(playerDoc?.mainPosition),
        subPositions: Array.isArray(sd?.subPositions)
          ? (sd.subPositions as any[]).filter((x) => typeof x === "string").slice(0, 3)
          : Array.isArray((p as any)?.subPositions)
            ? ((p as any).subPositions as any[]).filter((x) => typeof x === "string").slice(0, 3)
            : Array.isArray(playerDoc?.subPositions)
              ? (playerDoc.subPositions as any[]).filter((x) => typeof x === "string").slice(0, 3)
              : [],
        nationality:
          safeString(sd?.nationality) ||
          safeString((p as any)?.nationality) ||
          safeString(playerDoc?.nationality),
        dateOfBirth:
          safeString(sd?.dateOfBirth) ||
          safeString((p as any)?.dateOfBirth) ||
          safeString(playerDoc?.dateOfBirth),
        age:
          toFiniteNumber(sd?.age) ?? toFiniteNumber((p as any)?.age) ?? toFiniteNumber(playerDoc?.age),
        height:
          toFiniteNumber(sd?.height) ??
          toFiniteNumber((p as any)?.height) ??
          toFiniteNumber(playerDoc?.height),
        weight:
          toFiniteNumber(sd?.weight) ??
          toFiniteNumber((p as any)?.weight) ??
          toFiniteNumber(playerDoc?.weight),
        contractEndMonth:
          contractEndMonthFromDate(sd?.contractEndDate) ??
          contractEndMonthFromDate((p as any)?.contractEndDate) ??
          contractEndMonthFromDate(playerDoc?.contractEndDate),
        contractEndDate:
          safeString(sd?.contractEndDate) ||
          safeString((p as any)?.contractEndDate) ||
          safeString(playerDoc?.contractEndDate),
        photoUrl:
          safeString(sd?.photoUrl) ||
          safeString((p as any)?.photoUrl) ||
          safeString(playerDoc?.photoUrl),
        profile:
          safeString(sd?.profile) || safeString((p as any)?.profile) || safeString(playerDoc?.profile),
        preferredFoot: pickPreferredFoot(
          sd?.preferredFoot,
          (sd as any)?.foot,
          (sd as any)?.dominantFoot,
          (p as any)?.preferredFoot,
          (p as any)?.foot,
          (p as any)?.dominantFoot,
          playerDoc?.preferredFoot,
          playerDoc?.foot,
          playerDoc?.dominantFoot
        ),
        memo: pickMemo(
          sd?.memo,
          (sd as any)?.note,
          (sd as any)?.remarks,
          (sd as any)?.comment,
          (p as any)?.memo,
          (p as any)?.note,
          (p as any)?.remarks,
          (p as any)?.comment,
          playerDoc?.memo,
          playerDoc?.note,
          playerDoc?.remarks,
          playerDoc?.comment
        ),
        params:
          normalizeParams(sd?.params) ||
          normalizeParams((p as any)?.params) ||
          normalizeParams(playerDoc?.params),
        seasonStats: {
          appearances: currentStats.appearances,
          goals: currentStats.goals,
          assists: currentStats.assists,
          avgRating,
        },
        tenureYears,
        isNew,
        lastSeasonSummary,
      };

      return merged;
    })
  );

  const playersClean = players.filter(Boolean);

  return {
    seasonId,
    teamId,
    teamName,
    club: {
      clubName: safeString(clubProfile?.clubName) || "",
      logoUrl: typeof clubProfile?.logoUrl === "string" ? clubProfile.logoUrl : null,
    },
    players: playersClean,
    transfersIn,
    transfersOut,
  };
}
