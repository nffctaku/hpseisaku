import { NextResponse } from "next/server";
import { db } from "@/lib/firebase/admin";
import { getAuth } from "firebase-admin/auth";
import { WC2026_GROUPS, WC2026_MATCHES, type Team } from "@/lib/wc2026/data";
import { computeGroupStandings, toScoreNumber, type ResultsByMatchId } from "@/lib/wc2026/results";

export const runtime = "nodejs";

type OfficialResultsDoc = {
  results?: Record<string, { homeScore: string; awayScore: string }>;
};

type PredictionsDoc = {
  uid?: string;
  matchPredictions?: Record<string, { homeScore: string; awayScore: string; reason?: string }>;
  groupPredictions?: Record<string, string[]>;
  knockoutPredictions?: { championTeamId?: string; top4TeamIds?: string[] };
  updatedAt?: any;
};

type UserPointsDoc = {
  points?: number;
  matchPoints?: number;
  groupPoints?: number;
  displayName?: string;
};

async function getUidFromRequest(request: Request): Promise<string | null> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const idToken = authHeader.substring(7);
  try {
    const decodedToken = await getAuth().verifyIdToken(idToken);
    return decodedToken.uid;
  } catch {
    return null;
  }
}

function normalizePoints(v: unknown): number {
  if (typeof v !== "number") return 0;
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.trunc(v));
}

function outcomeOfScore(h: number, a: number) {
  if (h > a) return "H" as const;
  if (h < a) return "A" as const;
  return "D" as const;
}

function flattenTeams(groups: Record<string, Team[]>) {
  const out: Team[] = [];
  for (const teams of Object.values(groups)) {
    for (const t of teams) out.push(t);
  }
  return out;
}

function findTeam(teamId: string) {
  if (!teamId) return null;
  const teams = flattenTeams(WC2026_GROUPS);
  return teams.find((t) => t.id === teamId) ?? null;
}

function groupKeyOfTeamId(teamId: string) {
  if (!teamId) return null;
  for (const [g, teams] of Object.entries(WC2026_GROUPS)) {
    if (teams.some((t) => t.id === teamId)) return g;
  }
  return null;
}

function isGroupComplete(groupKey: string, results: ResultsByMatchId) {
  const groupMatches = WC2026_MATCHES.filter((m) => m.kickoffLabel.includes(`グループ${groupKey}`));
  if (groupMatches.length === 0) return false;
  return groupMatches.every((m) => {
    const r = results[m.id];
    const hs = toScoreNumber(r?.homeScore ?? "");
    const as = toScoreNumber(r?.awayScore ?? "");
    return hs !== null && as !== null;
  });
}

export async function GET(request: Request) {
  try {
    if (typeof (db as any)?.collection !== "function") {
      return new NextResponse(
        JSON.stringify({
          message:
            "Firebase Admin が初期化できていません。FIREBASE_SERVICE_ACCOUNT_BASE64 を本番環境の環境変数に設定してください。",
        }),
        { status: 500 }
      );
    }

    const uid = await getUidFromRequest(request);
    if (!uid) {
      return new NextResponse(JSON.stringify({ message: "認証されていません。" }), { status: 401 });
    }

    const [userRecord, pointsSnap, predsSnap, resultsSnap] = await Promise.all([
      getAuth().getUser(uid).catch(() => null),
      db.collection("user_points").doc(uid).get(),
      db.collection("wc2026_predictions").doc(uid).get(),
      db.collection("wc2026_official_results").doc("v1").get(),
    ]);

    const pointsDoc = (pointsSnap.exists ? (pointsSnap.data() as UserPointsDoc) : null) ?? null;
    const predsDoc = (predsSnap.exists ? (predsSnap.data() as PredictionsDoc) : null) ?? null;
    const resultsDoc = (resultsSnap.exists ? (resultsSnap.data() as OfficialResultsDoc) : null) ?? null;

    const officialResults = (resultsDoc?.results && typeof resultsDoc.results === "object" ? resultsDoc.results : {}) as ResultsByMatchId;
    const matchPredictions = (predsDoc?.matchPredictions && typeof predsDoc.matchPredictions === "object" ? predsDoc.matchPredictions : {}) as any;

    const totalUsersSnap = await db.collection("user_points").count().get();
    const totalUsers = Math.max(0, Number(totalUsersSnap.data().count || 0));

    const myPoints = normalizePoints(pointsDoc?.points);

    const betterThanMeSnap = await db.collection("user_points").where("points", ">", myPoints).count().get();
    const betterCount = Math.max(0, Number(betterThanMeSnap.data().count || 0));
    const rank = betterCount + 1;

    let predictedCount = 0;
    let outcomeHit = 0;
    let perfectHit = 0;

    for (const m of WC2026_MATCHES) {
      const p = matchPredictions?.[m.id];
      const r = officialResults?.[m.id];

      const ph = toScoreNumber(p?.homeScore ?? "");
      const pa = toScoreNumber(p?.awayScore ?? "");
      const rh = toScoreNumber(r?.homeScore ?? "");
      const ra = toScoreNumber(r?.awayScore ?? "");

      if (ph === null || pa === null) continue;
      predictedCount += 1;
      if (rh === null || ra === null) continue;

      if (ph === rh && pa === ra) {
        perfectHit += 1;
        outcomeHit += 1;
        continue;
      }

      const po = outcomeOfScore(ph, pa);
      const ro = outcomeOfScore(rh, ra);
      if (po === ro) outcomeHit += 1;
    }

    const outcomeHitRate = predictedCount > 0 ? (outcomeHit / predictedCount) * 100 : 0;

    const championTeamId = String(predsDoc?.knockoutPredictions?.championTeamId || "");
    const championTeam = findTeam(championTeamId);
    const championGroup = groupKeyOfTeamId(championTeamId);

    let championStatus: "生存" | "敗退" | "未選択" | "未確定" = "未選択";
    if (championTeamId) {
      championStatus = "未確定";
      if (championGroup && isGroupComplete(championGroup, officialResults)) {
        const standings = computeGroupStandings({ groups: WC2026_GROUPS, matches: WC2026_MATCHES, results: officialResults });
        const rows = standings[championGroup] ?? [];
        const top2 = new Set(rows.slice(0, 2).map((x) => x.teamId));
        championStatus = top2.has(championTeamId) ? "生存" : "敗退";
      }
    }

    const openingKickoff = new Date("2026-06-11T04:00:00+09:00");
    const updatedAtDate = predsDoc?.updatedAt?.toDate ? predsDoc.updatedAt.toDate() : predsDoc?.updatedAt instanceof Date ? predsDoc.updatedAt : null;
    const earlyBird = Boolean(updatedAtDate && updatedAtDate.getTime() < openingKickoff.getTime());

    const badges: { key: string; label: string }[] = [];
    if (earlyBird) badges.push({ key: "early_bird", label: "early_bird" });
    if (perfectHit >= 3) badges.push({ key: "perfect_shot", label: "perfect_shot" });

    const percentile = totalUsers > 0 ? rank / totalUsers : 1;
    const theme = percentile <= 0.01 ? "gold" : percentile <= 0.05 ? "silver" : percentile <= 0.1 ? "bronze" : "default";

    return NextResponse.json({
      ok: true,
      profile: {
        uid,
        displayName: userRecord?.displayName || pointsDoc?.displayName || uid,
        photoURL: userRecord?.photoURL || null,
      },
      stats: {
        points: myPoints,
        rank,
        totalUsers,
        outcomeHitRate,
        perfectHit,
        predictedCount,
      },
      badges,
      champion: {
        teamId: championTeamId,
        name: championTeam?.name || (championTeamId ? championTeamId : ""),
        code: championTeam?.code || "",
        group: championGroup,
        status: championStatus,
      },
      theme,
    });
  } catch (e) {
    console.error("/api/wc2026/mypage GET error", e);
    return new NextResponse(JSON.stringify({ message: "サーバーエラーが発生しました。" }), { status: 500 });
  }
}
