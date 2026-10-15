import { db } from "@/lib/firebase/admin";
import { getBookletSeasonStats, type BookletPlayerStats } from "@/lib/booklet-stats-server";
import { isValidBirthDateString, tryCalculateAge } from "@/lib/player-calculations";
import { resolveJoinBadge } from "@/lib/join-status";
import {
  contractEndMonthFromDate,
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
  teamLogoUrl: string | null;
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

  // 独立した初期データは並列取得（roster全件は未使用だったため廃止）
  const [teamSnap, transfersSnap, playersSnap] = await Promise.all([
    db.doc(`clubs/${ownerUid}/teams/${teamId}`).get(),
    db.collection(`clubs/${ownerUid}/teams/${teamId}/transfers`).get(),
    db.collection(`clubs/${ownerUid}/teams/${teamId}/players`).get(),
  ]);
  const teamName = teamSnap.exists ? safeString((teamSnap.data() as any)?.name) : "";
  const teamLogoRaw = teamSnap.exists ? (teamSnap.data() as any)?.logoUrl : null;
  const teamLogoUrl = typeof teamLogoRaw === "string" && teamLogoRaw.trim() ? teamLogoRaw.trim() : null;

  const prevSeason = getPreviousSeason(seasonId);
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

  // チームの選手コレクションからシーズンを含む選手を取得
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

  // チームの選手コレクションを優先（選手管理はここに保存するため）
  const rosterPlayers = teamPlayers.filter((p) =>
    playerIds && playerIds.size > 0 ? playerIds.has(p.id) : true
  );

  // スタッツはチーム全員分をシーズンごと1回のクエリセットで一括集計
  // （元実装は選手ごとに competitions→rounds→matches を全走査していた）
  // 取得失敗は0件として扱わずエラーで伝播させる（偽のスタッツ0を表示しないため）
  const statsInput = rosterPlayers.map((p) => ({ id: p.id, data: p }));
  let currentStatsMap: Map<string, BookletPlayerStats>;
  let prevStatsMap: Map<string, BookletPlayerStats>;
  try {
    [currentStatsMap, prevStatsMap] = await Promise.all([
      getBookletSeasonStats({ ownerUid, players: statsInput, targetSeason: seasonId }),
      prevSeason
        ? getBookletSeasonStats({ ownerUid, players: statsInput, targetSeason: prevSeason })
        : Promise.resolve(new Map<string, BookletPlayerStats>()),
    ]);
  } catch (error) {
    console.error(
      `getBookletSeasonStats failed (club=${ownerUid} team=${teamId} season=${seasonId} prev=${prevSeason}):`,
      error
    );
    throw error;
  }

  const players = rosterPlayers.map((p) => {
      const playerDoc = p as any;

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

          lastSeasonSummary = `${totalMatches}M｜${totalGoals}G`;
        } else {
          const prevStats = prevStatsMap.get(p.id) ?? {
            appearances: 0,
            goals: 0,
            assists: 0,
          };

          if (prevStats.appearances > 0 || prevStats.goals > 0 || prevStats.assists > 0) {
            lastSeasonSummary = `${prevStats.appearances}M｜${prevStats.goals}G｜${prevStats.assists}A`;
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

      // 加入形態バッジは「対象シーズンの seasonData に記録された joinType」のみを根拠にする
      // （root 値のフォールバックは行わず、過去シーズンへの現在値の混入を防ぐ）
      const joinBadge =
        sd && typeof sd === "object" && "joinType" in sd
          ? resolveJoinBadge((sd as any).joinType)
          : null;

      const dateOfBirth =
        safeString(sd?.dateOfBirth) ||
        safeString((p as any)?.dateOfBirth) ||
        safeString(playerDoc?.dateOfBirth);

      const currentStats = currentStatsMap.get(p.id) ?? {
        appearances: 0,
        minutes: 0,
        goals: 0,
        assists: 0,
        yellowCards: 0,
        redCards: 0,
        ratingSum: 0,
        ratingCount: 0,
      };
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
        dateOfBirth,
        // 前所属はplayer基本プロフィールを優先（seasonDataはCareerコピー由来の場合のみフォールバック）
        previousClub:
          safeString((p as any)?.previousClub) ||
          safeString(playerDoc?.previousClub) ||
          safeString(sd?.previousClub),
        // 年齢は保存値を使わず「シーズン開幕日（8/1）時点」を生年月日から計算
        // 未登録・不正な生年月日では非表示（0歳などの誤表示を防ぐ）
        age: isValidBirthDateString(dateOfBirth) ? tryCalculateAge(dateOfBirth, seasonId) : null,
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
        joinBadge,
        isNew,
        lastSeasonSummary,
      };

      return merged;
  });

  const playersClean = players.filter(Boolean);

  return {
    seasonId,
    teamId,
    teamName,
    teamLogoUrl,
    club: {
      clubName: safeString(clubProfile?.clubName) || "",
      logoUrl: typeof clubProfile?.logoUrl === "string" ? clubProfile.logoUrl : null,
    },
    players: playersClean,
    transfersIn,
    transfersOut,
  };
}
