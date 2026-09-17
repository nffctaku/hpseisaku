import { db } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import { getEffectivePlanForUid, type EffectivePlan } from "@/lib/server-plan";
import { pickFields, assertWithinBatchLimit } from "./career-copy-helpers";

export interface CopyableSourceData {
  plan: { plan: string; isPaid: boolean; isGranted: boolean };
  sourceCareerName: string;
  sourceClubName: string;
  seasons: { id: string; name?: string }[];
  playerCountsBySeason: { seasonId: string; count: number }[];
  teamCount: number;
  opponentCount: number;
}

export interface CopyOptions {
  sourceCareerId: string;
  copyPlayers: boolean;
  playerSourceSeasonId?: string;
  copyTeams: boolean;
  copySettings: boolean;
  targetStartSeasonId?: string;
  targetStartSeasonName?: string;
}

export interface CopyResult {
  targetClubUid: string;
  copied: {
    players: number;
    skippedPlayers: number;
    skippedPlayerDetails: { playerId: string; reason: string }[];
    teams: number;
    opponents: number;
    settings: boolean;
  };
  plan: EffectivePlan;
}

interface CareerDoc {
  id: string;
  ownerId: string;
  clubUid: string;
  clubId?: string;
  clubName?: string;
  name: string;
  status?: string;
  updateTime?: FirebaseFirestore.Timestamp;
}

const PLAYER_PROFILE_FIELDS = [
  "name",
  "subName",
  "displayName",
  "number",
  "position",
  "mainPosition",
  "subPositions",
  "nationality",
  "dateOfBirth",
  "height",
  "weight",
  "preferredFoot",
  "profile",
  "memo",
  "notes",
  "photoUrl",
  "snsLinks",
];

const TEAM_PROFILE_FIELDS = [
  "name",
  "teamName",
  "shortName",
  "abbreviation",
  "logoUrl",
  "color",
  "primaryColor",
  "secondaryColor",
];

const CLUB_PROFILE_FIELDS = [
  "logoUrl",
  "homeBgColor",
  "homeColorTheme",
  "clubColor",
  "displaySettings",
  "transfersPublic",
  "publicPlayerParamsEnabled",
  "realTeamUsage",
  "gameTeamUsage",
  "homeImageUrl",
  "headerImageUrl",
  "sponsors",
  "footerLinks",
  "partnerMenu",
  "socialLinks",
  "clubDescription",
  "established",
  "stadium",
  "awayBgColor",
  "awayColorTheme",
];

async function getCareerDoc(careerId: string): Promise<CareerDoc | null> {
  const snap = await db.collection("careers").doc(careerId).get();
  if (!snap.exists) return null;
  const data = snap.data() as Record<string, unknown> | undefined;
  if (!data) return null;
  return {
    id: snap.id,
    ownerId: typeof data.ownerId === "string" ? data.ownerId : "",
    clubUid: typeof data.clubUid === "string" ? data.clubUid : snap.id,
    clubId: typeof data.clubId === "string" ? data.clubId : undefined,
    clubName: typeof data.clubName === "string" ? data.clubName : undefined,
    name: typeof data.name === "string" ? data.name : typeof data.clubName === "string" ? data.clubName : snap.id,
    status: typeof data.status === "string" ? data.status : undefined,
    updateTime: snap.updateTime,
  };
}

async function resolveMainTeamId(clubUid: string): Promise<string | null> {
  const profileSnap = await db.collection("club_profiles").doc(clubUid).get();
  const configuredId = profileSnap.data()?.mainTeamId;
  const teamsSnap = await db.collection(`clubs/${clubUid}/teams`).get();
  const candidates = teamsSnap.docs;
  if (typeof configuredId === "string" && configuredId.trim()) {
    const configuredTeam = candidates.find((d) => d.id === configuredId.trim());
    if (!configuredTeam) throw new Error("引き継ぎ元の自チームが見つかりません。クラブ設定を確認してください。");
    return configuredTeam.id;
  }
  if (teamsSnap.empty) return null;
  const markedTeams = candidates.filter((d) => d.data()?.isMain === true);
  if (markedTeams.length === 1) return markedTeams[0].id;
  if (markedTeams.length > 1) throw new Error("引き継ぎ元の自チームが複数あります。クラブ設定を確認してください。");
  const legacyTeam = candidates.find((d) => d.id === clubUid);
  if (legacyTeam) return legacyTeam.id;
  if (candidates.length === 1) return candidates[0].id;
  throw new Error("引き継ぎ元の自チームを特定できません。クラブ設定を確認してください。");
}

async function getRosterPlayerIdsForSeason(
  sourceClubUid: string,
  sourceSeasonId: string,
  mainTeamId: string | null
): Promise<string[]> {
  const rosterSnap = await db.collection(`clubs/${sourceClubUid}/seasons/${sourceSeasonId}/roster`).get();
  if (!rosterSnap.empty) {
    return rosterSnap.docs
      .filter((d) => {
        const data = d.data() as Record<string, unknown> | undefined;
        return data && data.registered !== false;
      })
      .map((d) => d.id)
      .filter(Boolean);
  }
  if (!mainTeamId) return [];
  const fallbackSnap = await db.collection(`clubs/${sourceClubUid}/teams/${mainTeamId}/players`).get();
  return fallbackSnap.docs.map((d) => d.id);
}

async function getPlayerCountForSeason(
  sourceClubUid: string,
  seasonId: string,
  mainTeamId: string | null
): Promise<number> {
  const rosterSnap = await db.collection(`clubs/${sourceClubUid}/seasons/${seasonId}/roster`).get();
  if (!rosterSnap.empty) {
    return rosterSnap.docs.filter((d) => (d.data() as Record<string, unknown>).registered !== false).length;
  }
  if (!mainTeamId) return 0;
  const fallbackSnap = await db.collection(`clubs/${sourceClubUid}/teams/${mainTeamId}/players`).get();
  return fallbackSnap.size;
}

export async function getCopyableSourceData(
  ownerId: string,
  sourceCareerId: string
): Promise<CopyableSourceData> {
  const career = await getCareerDoc(sourceCareerId);
  if (!career || career.ownerId !== ownerId) {
    throw new Error("Source career not found or not owned");
  }
  if (career.status === "creating") {
    throw new Error("作成中の記録は引き継ぎ元にできません");
  }
  if (career.status === "deleted") {
    throw new Error("削除済みの記録は引き継ぎ元にできません");
  }
  const sourceClubUid = career.clubUid;

  const [plan, seasonsSnap, teamsSnap] = await Promise.all([
    getEffectivePlanForUid(ownerId),
    db.collection(`clubs/${sourceClubUid}/seasons`).get(),
    db.collection(`clubs/${sourceClubUid}/teams`).get(),
  ]);

  const seasons = seasonsSnap.docs
    .map((d) => ({ id: d.id, name: typeof d.data()?.name === "string" ? d.data()?.name : d.id }))
    .sort((a, b) => b.id.localeCompare(a.id));

  const mainTeamId = await resolveMainTeamId(sourceClubUid);
  const teamCount = teamsSnap.size;
  const opponentCount = Math.max(0, teamsSnap.size - (mainTeamId ? 1 : 0));

  const playerCountsBySeason: { seasonId: string; count: number }[] = [];
  for (const s of seasons) {
    const count = await getPlayerCountForSeason(sourceClubUid, s.id, mainTeamId);
    playerCountsBySeason.push({ seasonId: s.id, count });
  }

  return {
    plan,
    sourceCareerName: career.name || career.clubName || sourceCareerId,
    sourceClubName: career.clubName || "",
    seasons,
    playerCountsBySeason,
    teamCount,
    opponentCount,
  };
}

function newId(): string {
  return db.collection("_ignored").doc().id;
}

function isProPlan(plan: EffectivePlan): boolean {
  return plan.plan === "pro" || plan.plan === "officia";
}

export async function copyCareerData(
  ownerId: string,
  targetCareerId: string,
  copyOptions: CopyOptions
): Promise<CopyResult> {
  const { sourceCareerId, copyPlayers, playerSourceSeasonId, copyTeams, copySettings, targetStartSeasonId, targetStartSeasonName } = copyOptions;

  const validId = (id: unknown): id is string =>
    typeof id === "string" && id.trim().length > 0 && !id.includes("/") && id !== "." && id !== "..";

  if (!validId(sourceCareerId) || !validId(targetCareerId)) {
    throw new Error("Career の指定が不正です");
  }
  if (sourceCareerId === targetCareerId) {
    throw new Error("引き継ぎ元と同じCareerにはコピーできません");
  }

  const [sourceCareer, targetCareer] = await Promise.all([
    getCareerDoc(sourceCareerId),
    getCareerDoc(targetCareerId),
  ]);
  if (!sourceCareer || sourceCareer.ownerId !== ownerId) {
    throw new Error("Source career not found or not owned");
  }
  if (sourceCareer.status === "deleted") {
    throw new Error("削除済みの記録は引き継ぎ元にできません");
  }
  if (!targetCareer || targetCareer.ownerId !== ownerId) {
    throw new Error("Target career not found or not owned");
  }

  const sourceClubUid = sourceCareer.clubUid;
  const targetClubUid = targetCareer.clubUid;
  if (!validId(sourceClubUid) || !validId(targetClubUid) || sourceClubUid === targetClubUid) {
    throw new Error("引き継ぎ元とコピー先のデータ領域が分離されていません");
  }
  if (targetCareer.status !== "creating" || !targetCareer.updateTime) {
    throw new Error("コピー先は作成中の新しいCareerに限られます");
  }
  if (sourceCareer.status === "creating") {
    throw new Error("作成中のCareerからは引き継げません");
  }

  const plan = await getEffectivePlanForUid(ownerId);
  if (copyPlayers && !isProPlan(plan)) {
    throw new Error("Freeでは選手を引き継げません");
  }
  if (copyPlayers && !validId(playerSourceSeasonId)) {
    throw new Error("選手を引き継ぐ場合はSeasonを選択してください");
  }
  if (copyPlayers && !validId(targetStartSeasonId)) {
    throw new Error("開始シーズンが正しくありません");
  }
  const sourceSeasonData = copyPlayers && playerSourceSeasonId
    ? await db.collection(`clubs/${sourceClubUid}/seasons`).doc(playerSourceSeasonId).get()
    : null;
  if (copyPlayers && playerSourceSeasonId && !sourceSeasonData?.exists) {
    throw new Error("引き継ぎ元Seasonが見つかりません");
  }

  const sourceMainTeamId = await resolveMainTeamId(sourceClubUid);

  let mainTeamData: Record<string, unknown> = { name: targetCareer.clubName };
  if (sourceMainTeamId) {
    const sourceMainTeamSnap = await db.collection(`clubs/${sourceClubUid}/teams`).doc(sourceMainTeamId).get();
    if (sourceMainTeamSnap.exists) {
      mainTeamData = sourceMainTeamSnap.data() as Record<string, unknown>;
    }
  }

  const playerIds = copyPlayers && playerSourceSeasonId
    ? await getRosterPlayerIdsForSeason(sourceClubUid, playerSourceSeasonId, sourceMainTeamId)
    : [];

  const resolvedStartSeasonId = validId(targetStartSeasonId) ? targetStartSeasonId : undefined;

  const teamsSnap = await db.collection(`clubs/${sourceClubUid}/teams`).get();
  const opponentTeamIds = copyTeams
    ? teamsSnap.docs.filter((d) => d.id !== sourceMainTeamId).map((d) => d.id)
    : [];

  // 選手1人につき players ドキュメント + roster ドキュメントの2書き込み
  assertWithinBatchLimit(
    copyPlayers,
    copyTeams,
    copySettings,
    playerIds.length * 2,
    opponentTeamIds.length,
    resolvedStartSeasonId ? 1 : 0
  );

  const [sourceProfileSnap, targetProfileSnap] = await Promise.all([
    db.collection("club_profiles").doc(sourceClubUid).get(),
    db.collection("club_profiles").doc(targetClubUid).get(),
  ]);
  const sourceProfileData = sourceProfileSnap.exists
    ? (sourceProfileSnap.data() as Record<string, unknown>)
    : {};
  const targetProfileData = targetProfileSnap.exists
    ? (targetProfileSnap.data() as Record<string, unknown>)
    : {};

  const now = FieldValue.serverTimestamp();
  const newMainTeamId = targetClubUid;
  const publicSlug = (targetProfileData.clubId as string | undefined) ?? targetClubUid;

  const teamIdMap = new Map<string, string>();
  if (sourceMainTeamId) {
    teamIdMap.set(sourceMainTeamId, newMainTeamId);
  }

  const batchWrites: { ref: FirebaseFirestore.DocumentReference; data: Record<string, unknown> }[] = [];

  const copiedProfileFields = copySettings ? pickFields(sourceProfileData, CLUB_PROFILE_FIELDS) : {};
  const finalLogoUrl = copySettings
    ? ((sourceProfileData.logoUrl as string | null) || (mainTeamData.logoUrl as string | null) || null)
    : null;

  batchWrites.push({
    ref: db.collection("club_profiles").doc(targetClubUid),
    data: {
      ...copiedProfileFields,
      clubName: targetCareer.clubName,
      clubId: publicSlug,
      ownerUid: ownerId,
      clubUid: targetClubUid,
      mainTeamId: newMainTeamId,
      logoUrl: finalLogoUrl,
      slug: publicSlug,
      clubTitles: [],
      plan: "free",
      updatedAt: now,
    },
  });

  const newMainTeamData: Record<string, unknown> = {
    ...pickFields(mainTeamData, TEAM_PROFILE_FIELDS),
    name: targetCareer.clubName,
    clubUid: targetClubUid,
    ownerUid: ownerId,
    isMain: true,
    createdAt: now,
    updatedAt: now,
  };
  if (copySettings && finalLogoUrl) {
    newMainTeamData.logoUrl = finalLogoUrl;
  }
  batchWrites.push({
    ref: db.collection(`clubs/${targetClubUid}/teams`).doc(newMainTeamId),
    data: newMainTeamData,
  });

  for (const oldTeamId of opponentTeamIds) {
    const oldTeamSnap = await db.collection(`clubs/${sourceClubUid}/teams`).doc(oldTeamId).get();
    if (!oldTeamSnap.exists) continue;
    const oldTeamData = oldTeamSnap.data() as Record<string, unknown>;
    const newTeamId = newId();
    teamIdMap.set(oldTeamId, newTeamId);
    batchWrites.push({
      ref: db.collection(`clubs/${targetClubUid}/teams`).doc(newTeamId),
      data: {
        ...pickFields(oldTeamData, TEAM_PROFILE_FIELDS),
        clubUid: targetClubUid,
        ownerUid: ownerId,
        createdAt: now,
        updatedAt: now,
      },
    });
  }

  if (resolvedStartSeasonId) {
    batchWrites.push({
      ref: db.collection(`clubs/${targetClubUid}/seasons`).doc(resolvedStartSeasonId),
      data: {
        name: typeof targetStartSeasonName === "string" && targetStartSeasonName.trim()
          ? targetStartSeasonName.trim()
          : resolvedStartSeasonId,
        isPublic: true,
        createdAt: now,
        updatedAt: now,
      },
    });
  }

  const playerIdMap = new Map<string, string>();
  let copiedPlayers = 0;
  let skippedPlayers = 0;
  const skippedPlayerDetails: { playerId: string; reason: string }[] = [];
  if (copyPlayers && playerSourceSeasonId && sourceSeasonData?.exists && resolvedStartSeasonId) {
    const rosterSnap = await db.collection(`clubs/${sourceClubUid}/seasons/${playerSourceSeasonId}/roster`).get();
    const rosterByPlayer = new Map<string, Record<string, unknown>>();
    for (const r of rosterSnap.docs) {
      rosterByPlayer.set(r.id, r.data() as Record<string, unknown>);
    }

    const seasonKeys = [playerSourceSeasonId, playerSourceSeasonId.replace("-", "/")];
    const seasonProfile = (data: Record<string, unknown>): Record<string, unknown> => {
      const seasons = data.seasonData as Record<string, Record<string, unknown>> | undefined;
      return seasonKeys.map((key) => seasons?.[key]).find((value) => value && typeof value === "object") ?? {};
    };

    for (const oldPlayerId of playerIds) {
      const rosterData = rosterByPlayer.get(oldPlayerId) ?? {};
      const rosterTeamId =
        typeof rosterData.teamId === "string" && rosterData.teamId.trim() ? rosterData.teamId.trim() : null;

      // rosterのteamId → メインチーム → クラブ内全チームの順で選手ドキュメントを探す。
      // rosterエントリが削除済み選手を指す等の不整合でコピー全体を失敗させない。
      let oldPlayerSnap: FirebaseFirestore.DocumentSnapshot | null = null;
      const candidateTeamIds = [
        ...new Set([rosterTeamId, sourceMainTeamId].filter((v): v is string => Boolean(v))),
      ];
      for (const teamId of candidateTeamIds) {
        const snap = await db
          .collection(`clubs/${sourceClubUid}/teams/${teamId}/players`)
          .doc(oldPlayerId)
          .get();
        if (snap.exists) {
          oldPlayerSnap = snap;
          break;
        }
      }
      if (!oldPlayerSnap) {
        for (const teamDoc of teamsSnap.docs) {
          if (candidateTeamIds.includes(teamDoc.id)) continue;
          const snap = await db
            .collection(`clubs/${sourceClubUid}/teams/${teamDoc.id}/players`)
            .doc(oldPlayerId)
            .get();
          if (snap.exists) {
            oldPlayerSnap = snap;
            break;
          }
        }
      }
      if (!oldPlayerSnap) {
        skippedPlayers++;
        skippedPlayerDetails.push({
          playerId: oldPlayerId,
          reason: "引き継ぎ元に選手データが見つかりません（削除済みまたはroster不整合）",
        });
        continue;
      }

      const oldData = oldPlayerSnap.data() as Record<string, unknown>;
      const selectedProfile = {
        ...pickFields(oldData, PLAYER_PROFILE_FIELDS),
        ...pickFields(seasonProfile(oldData), PLAYER_PROFILE_FIELDS),
        ...pickFields(rosterData, PLAYER_PROFILE_FIELDS),
        ...pickFields(seasonProfile(rosterData), PLAYER_PROFILE_FIELDS),
      };

      const newPlayerId = newId();
      playerIdMap.set(oldPlayerId, newPlayerId);
      copiedPlayers++;

      batchWrites.push({
        ref: db.collection(`clubs/${targetClubUid}/teams/${newMainTeamId}/players`).doc(newPlayerId),
        data: {
          ...selectedProfile,
          clubUid: targetClubUid,
          teamId: newMainTeamId,
          ownerUid: ownerId,
          number: selectedProfile.number ?? "",
          position: selectedProfile.position ?? "",
          registered: true,
          joinedSeason: resolvedStartSeasonId,
          seasons: [resolvedStartSeasonId],
          seasonData: { [resolvedStartSeasonId]: selectedProfile },
          createdAt: now,
          updatedAt: now,
        },
      });

      batchWrites.push({
        ref: db.collection(`clubs/${targetClubUid}/seasons/${resolvedStartSeasonId}/roster`).doc(newPlayerId),
        data: {
          registered: true,
          teamId: newMainTeamId,
          name: selectedProfile.name ?? "",
          number: selectedProfile.number ?? "",
          position: selectedProfile.position ?? "",
          seasons: [resolvedStartSeasonId],
          seasonData: { [resolvedStartSeasonId]: selectedProfile },
          createdAt: now,
          updatedAt: now,
        },
      });
    }
  }

  batchWrites.push({
    ref: db.collection("careers").doc(targetCareerId),
    data: {
      status: "active",
      clubLogo: finalLogoUrl,
      ...(resolvedStartSeasonId
        ? { startSeason: resolvedStartSeasonId, latestSeason: resolvedStartSeasonId, seasonCount: 1 }
        : {}),
      updatedAt: now,
    },
  });
  batchWrites.push({
    ref: db.collection("users").doc(ownerId),
    data: {
      activeCareerId: targetCareerId,
      updatedAt: now,
    },
  });

  const batch = db.batch();
  for (const w of batchWrites) {
    if (w.ref.path === `careers/${targetCareerId}`) {
      batch.update(w.ref, w.data, { lastUpdateTime: targetCareer.updateTime });
    } else {
      batch.set(w.ref, w.data, { merge: true });
    }
  }
  await batch.commit();

  return {
    targetClubUid,
    copied: {
      players: copiedPlayers,
      skippedPlayers,
      skippedPlayerDetails,
      teams: 1 + opponentTeamIds.length,
      opponents: opponentTeamIds.length,
      settings: copySettings,
    },
    plan,
  };
}
