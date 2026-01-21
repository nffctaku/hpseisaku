import { NextResponse } from "next/server";
import { db } from "@/lib/firebase/admin";
import { getAuth } from "firebase-admin/auth";

import {
  contractEndMonthFromDate,
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
} from "./lib";

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
