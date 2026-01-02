import { NextResponse } from "next/server";
import { db } from "@/lib/firebase/admin";
import { getAuth } from "firebase-admin/auth";

export const runtime = "nodejs";

async function getUidFromRequest(request: Request): Promise<string | null> {
  const authHeader = request.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const idToken = authHeader.substring(7, authHeader.length);
    try {
      const decodedToken = await getAuth().verifyIdToken(idToken);
      return decodedToken.uid;
    } catch (error) {
      console.error("Error verifying auth token:", error);
      return null;
    }
  }
  return null;
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

type MatchIndexRow = {
  matchId: string;
  competitionId: string;
  roundId: string;
  matchDate: string;
  matchTime?: string;
  competitionName?: string;
  roundName?: string;
  homeTeam?: string;
  awayTeam?: string;
  homeTeamName?: string;
  awayTeamName?: string;
  homeTeamLogo?: string;
  awayTeamLogo?: string;
  scoreHome?: number | null;
  scoreAway?: number | null;
};

function stripUndefined<T extends Record<string, any>>(obj: T): T {
  const out: any = { ...(obj as any) };
  for (const k of Object.keys(out)) {
    if (out[k] === undefined) delete out[k];
  }
  return out;
}

function normalizeMatchDate(v: any): string {
  if (!v) return "";
  if (typeof v === "string") return v.trim();
  if (v?.toDate && typeof v.toDate === "function") {
    const d: Date = v.toDate();
    if (d instanceof Date && !Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return v.toISOString().slice(0, 10);
  }
  return "";
}

async function hasPublicMatchIndexData(ownerUid: string): Promise<boolean> {
  const ref = db.collection(`clubs/${ownerUid}/public_match_index`).limit(2);
  const snap = await ref.get();
  if (snap.empty) return false;
  if (snap.size === 1 && snap.docs[0].id === "_meta") return false;
  return true;
}

async function backfillPublicMatchIndex(ownerUid: string): Promise<number> {
  const indexRef = db.collection(`clubs/${ownerUid}/public_match_index`);

  const teamsSnap = await db.collection(`clubs/${ownerUid}/teams`).get();
  const teamsMap = new Map<string, { name: string; logoUrl?: string }>();
  teamsSnap.forEach((d) => teamsMap.set(d.id, { name: (d.data() as any).name, logoUrl: (d.data() as any).logoUrl }));

  const competitionsSnap = await db.collection(`clubs/${ownerUid}/competitions`).get();

  const nestedMatches = await Promise.all(
    competitionsSnap.docs.map(async (compDoc) => {
      const compData = compDoc.data() as any;
      const roundsSnap = await db.collection(`clubs/${ownerUid}/competitions/${compDoc.id}/rounds`).get();

      const byRound = await Promise.all(
        roundsSnap.docs.map(async (roundDoc) => {
          const roundData = roundDoc.data() as any;
          const matchesSnap = await db
            .collection(`clubs/${ownerUid}/competitions/${compDoc.id}/rounds/${roundDoc.id}/matches`)
            .get();

          return matchesSnap.docs.map((matchDoc) => {
            const m = matchDoc.data() as any;
            const homeTeam = teamsMap.get(m.homeTeam);
            const awayTeam = teamsMap.get(m.awayTeam);
            const matchDate = normalizeMatchDate(m.matchDate);
            const matchTime = typeof m.matchTime === "string" ? m.matchTime : undefined;

            const row: MatchIndexRow = {
              matchId: matchDoc.id,
              competitionId: compDoc.id,
              roundId: roundDoc.id,
              matchDate,
              matchTime,
              competitionName: compData?.name,
              roundName: roundData?.name,
              homeTeam: m.homeTeam,
              awayTeam: m.awayTeam,
              homeTeamName: homeTeam?.name || m.homeTeamName,
              awayTeamName: awayTeam?.name || m.awayTeamName,
              homeTeamLogo: homeTeam?.logoUrl || m.homeTeamLogo,
              awayTeamLogo: awayTeam?.logoUrl || m.awayTeamLogo,
              scoreHome: typeof m.scoreHome === "number" ? m.scoreHome : (m.scoreHome ?? null),
              scoreAway: typeof m.scoreAway === "number" ? m.scoreAway : (m.scoreAway ?? null),
            };

            return stripUndefined(row);
          });
        })
      );

      return byRound.flat();
    })
  );

  const friendlySnap = await db.collection(`clubs/${ownerUid}/friendly_matches`).get();
  const friendlyRows: MatchIndexRow[] = friendlySnap.docs.map((d) => {
    const m = d.data() as any;
    const compId = (m.competitionId as string) === "practice" ? "practice" : "friendly";
    const compName = m.competitionName || (compId === "practice" ? "練習試合" : "親善試合");
    const homeTeam = teamsMap.get(m.homeTeam);
    const awayTeam = teamsMap.get(m.awayTeam);
    return stripUndefined({
      matchId: d.id,
      competitionId: compId,
      roundId: "single",
      matchDate: normalizeMatchDate(m.matchDate),
      matchTime: typeof m.matchTime === "string" ? m.matchTime : undefined,
      competitionName: compName,
      roundName: m.roundName || "単発",
      homeTeam: m.homeTeam,
      awayTeam: m.awayTeam,
      homeTeamName: m.homeTeamName || homeTeam?.name,
      awayTeamName: m.awayTeamName || awayTeam?.name,
      homeTeamLogo: m.homeTeamLogo || homeTeam?.logoUrl,
      awayTeamLogo: m.awayTeamLogo || awayTeam?.logoUrl,
      scoreHome: typeof m.scoreHome === "number" ? m.scoreHome : (m.scoreHome ?? null),
      scoreAway: typeof m.scoreAway === "number" ? m.scoreAway : (m.scoreAway ?? null),
    });
  });

  const allRows = [...nestedMatches.flat(), ...friendlyRows].filter((r) => typeof r.matchDate === "string" && r.matchDate.trim().length > 0);

  const commitBatch = async (rows: MatchIndexRow[]) => {
    const batch = db.batch();
    for (const row of rows) {
      const docId = `${row.competitionId}__${row.roundId}__${row.matchId}`;
      batch.set(indexRef.doc(docId), row, { merge: true });
    }
    await batch.commit();
  };

  const chunkSize = 450;
  for (let i = 0; i < allRows.length; i += chunkSize) {
    await commitBatch(allRows.slice(i, i + chunkSize));
  }

  await indexRef.doc("_meta").set({ updatedAt: new Date().toISOString(), count: allRows.length }, { merge: true });

  return allRows.length;
}

export async function POST(request: Request) {
  try {
    const uid = await getUidFromRequest(request);
    if (!uid) {
      return new NextResponse(JSON.stringify({ message: "認証されていません。" }), { status: 401 });
    }

    const ownerUid = await resolveOwnerUidFromUid(uid);
    if (!ownerUid) {
      return new NextResponse(JSON.stringify({ message: "クラブ情報が見つかりません。" }), { status: 404 });
    }

    if (await hasPublicMatchIndexData(ownerUid)) {
      return new NextResponse(JSON.stringify({ message: "already", count: 0 }), { status: 200 });
    }

    const count = await backfillPublicMatchIndex(ownerUid);
    return new NextResponse(JSON.stringify({ message: "ok", count }), { status: 200 });
  } catch (error) {
    console.error("backfill-public-match-index error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new NextResponse(JSON.stringify({ message: "サーバーエラーが発生しました。", detail: message }), { status: 500 });
  }
}
