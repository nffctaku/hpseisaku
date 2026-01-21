import { NextResponse } from "next/server";
import { db } from "@/lib/firebase/admin";
import { getAuth } from "firebase-admin/auth";

export const runtime = "nodejs";

async function getUidFromRequest(request: Request): Promise<string | null> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const idToken = authHeader.substring(7);
  try {
    const decodedToken = await getAuth().verifyIdToken(idToken);
    return decodedToken.uid;
  } catch (e) {
    console.error("verifyIdToken failed", e);
    return null;
  }
}

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
  if (typeof n !== "number" || !Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(99, n));
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

export async function GET(request: Request) {
  try {
    const uid = await getUidFromRequest(request);
    if (!uid) {
      return new NextResponse(JSON.stringify({ message: "認証されていません。" }), { status: 401 });
    }

    const ownerUid = await resolveOwnerUidFromUid(uid);
    if (!ownerUid) {
      return new NextResponse(JSON.stringify({ message: "クラブ情報が見つかりません。" }), { status: 404 });
    }

    const url = new URL(request.url);
    const teamId = (url.searchParams.get("teamId") || "").trim();
    const seasonId = (url.searchParams.get("season") || "").trim();
    if (!teamId || !seasonId) {
      return new NextResponse(JSON.stringify({ message: "teamId/season が不正です。" }), { status: 400 });
    }

    const teamSnap = await db.doc(`clubs/${ownerUid}/teams/${teamId}`).get();
    const teamName = teamSnap.exists ? safeString((teamSnap.data() as any)?.name) : "";

    const profileSnap = await db.collection("club_profiles").doc(ownerUid).get();
    const profile = profileSnap.exists ? (profileSnap.data() as any) : null;

    const rosterSeasonDocId = toDashSeason(seasonId);
    const rosterSnap = await db.collection(`clubs/${ownerUid}/seasons/${rosterSeasonDocId}/roster`).get();
    const prevSeason = getPreviousSeason(seasonId);
    const prevSeasonSlash = toSlashSeason(prevSeason);

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
        return playerSeasons.includes(seasonId) || 
               playerSeasons.includes(toSlashSeason(seasonId)) ||
               playerSeasons.includes(toDashSeason(seasonId));
      });

    const rosterPlayers = teamPlayers.length > seasonRosterPlayers.length ? teamPlayers : seasonRosterPlayers;

    const players = await Promise.all(
      rosterPlayers.map(async (p) => {
        const playerDocSnap = await db.doc(`clubs/${ownerUid}/teams/${teamId}/players/${p.id}`).get().catch(() => null as any);
        const playerDoc = playerDocSnap?.exists ? (playerDocSnap.data() as any) : null;

        // 昨シーズンのスタッツを取得
        const prevSeason = getPreviousSeason(seasonId);
        let lastSeasonSummary = "-";
        
        if (prevSeason) {
          // 前シーズンの手入力スタッツを確認
          const playerSeasonData = (p as any)?.seasonData || {};
          const prevSeasonData = playerSeasonData[prevSeason] || {};
          const manualStats = prevSeasonData.manualCompetitionStats;
          
          if (manualStats && Array.isArray(manualStats) && manualStats.length > 0) {
            // 手入力スタッツを集計
            let totalMatches = 0;
            let totalGoals = 0;
            
            for (const stat of manualStats) {
              totalMatches += Number.isFinite(stat.matches) ? Number(stat.matches) : 0;
              totalGoals += Number.isFinite(stat.goals) ? Number(stat.goals) : 0;
            }
            
            lastSeasonSummary = `${totalMatches}試合${totalGoals}ゴール`;
          } else {
            // 手入力スタッツがない場合は試合データから取得
            try {
              const mergedPlayerData = { ...p, ...playerDoc };
              const prevStats = await getPlayerStats(ownerUid, p.id, mergedPlayerData, prevSeason);
              
              if (prevStats.appearances > 0 || prevStats.goals > 0) {
                lastSeasonSummary = `${prevStats.appearances}試合${prevStats.goals}ゴール`;
              }
            } catch (error) {
              console.error(`Failed to fetch ${prevSeason} match stats for player ${p.id}:`, error);
            }
          }
        }

        const seasonData = (p as any)?.seasonData && typeof (p as any).seasonData === "object" ? ((p as any).seasonData as any) : {};
        const sd = seasonData?.[seasonId] && typeof seasonData?.[seasonId] === "object" ? (seasonData?.[seasonId] as any) : {};

        const seasonsArr: string[] = Array.isArray((p as any)?.seasons)
          ? (((p as any).seasons as any[]) || []).filter((s) => typeof s === "string")
          : Array.isArray(playerDoc?.seasons)
            ? (playerDoc.seasons as any[]).filter((s) => typeof s === "string")
            : [];

        const explicitTenureYears =
          toFiniteNumber(sd?.tenureYears) ?? toFiniteNumber((p as any)?.tenureYears) ?? toFiniteNumber(playerDoc?.tenureYears);

        const inferredTenureYears = seasonsArr.filter((s) => String(s).trim().length > 0).length || 1;
        const tenureYears = explicitTenureYears ?? inferredTenureYears;

        const isNew =
          explicitTenureYears != null
            ? explicitTenureYears <= 1
            : prevSeason
              ? !seasonsArr.includes(prevSeason)
              : false;

        const merged = {
          id: p.id,
          name: safeString(sd?.name) || safeString((p as any)?.name) || safeString(playerDoc?.name),
          number: (toFiniteNumber(sd?.number) ?? toFiniteNumber((p as any)?.number) ?? toFiniteNumber(playerDoc?.number)) ?? null,
          position: safeString(sd?.position) || safeString((p as any)?.position) || safeString(playerDoc?.position),
          mainPosition: safeString(sd?.mainPosition) || safeString((p as any)?.mainPosition) || safeString(playerDoc?.mainPosition),
          subPositions: Array.isArray(sd?.subPositions)
            ? (sd.subPositions as any[]).filter((x) => typeof x === "string").slice(0, 3)
            : Array.isArray((p as any)?.subPositions)
              ? ((p as any).subPositions as any[]).filter((x) => typeof x === "string").slice(0, 3)
              : Array.isArray(playerDoc?.subPositions)
                ? (playerDoc.subPositions as any[]).filter((x) => typeof x === "string").slice(0, 3)
                : [],
          nationality: safeString(sd?.nationality) || safeString((p as any)?.nationality) || safeString(playerDoc?.nationality),
          age: toFiniteNumber(sd?.age) ?? toFiniteNumber((p as any)?.age) ?? toFiniteNumber(playerDoc?.age),
          height: toFiniteNumber(sd?.height) ?? toFiniteNumber((p as any)?.height) ?? toFiniteNumber(playerDoc?.height),
          weight: toFiniteNumber(sd?.weight) ?? toFiniteNumber((p as any)?.weight) ?? toFiniteNumber(playerDoc?.weight),
          contractEndMonth:
            contractEndMonthFromDate(sd?.contractEndDate) ??
            contractEndMonthFromDate((p as any)?.contractEndDate) ??
            contractEndMonthFromDate(playerDoc?.contractEndDate),
          contractEndDate: safeString(sd?.contractEndDate) || safeString((p as any)?.contractEndDate) || safeString(playerDoc?.contractEndDate),
          photoUrl: safeString(sd?.photoUrl) || safeString((p as any)?.photoUrl) || safeString(playerDoc?.photoUrl),
          profile: safeString(sd?.profile) || safeString((p as any)?.profile) || safeString(playerDoc?.profile),
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
          params: normalizeParams(sd?.params) || normalizeParams((p as any)?.params) || normalizeParams(playerDoc?.params),
          tenureYears,
          isNew,
          lastSeasonSummary,
        };

        return merged;
      })
    );

    return new NextResponse(
      JSON.stringify({
        seasonId,
        teamId,
        teamName,
        club: {
          clubName: profile?.clubName || "",
          logoUrl: profile?.logoUrl || null,
        },
        players,
        transfersIn,
        transfersOut,
      }),
      { status: 200 }
    );
  } catch (e) {
    console.error("booklet api error", e);
    return new NextResponse(JSON.stringify({ message: "サーバーエラーが発生しました。" }), { status: 500 });
  }
}
