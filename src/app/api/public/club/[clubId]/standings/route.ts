import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase/admin";

export const runtime = "nodejs";

type RankLabelColor = "green" | "red" | "orange" | "blue" | "yellow";

type RankLabelRule = {
  from: number;
  to: number;
  color: RankLabelColor;
};

type Standing = {
  id: string;
  rank: number;
  teamName: string;
  logoUrl?: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
};

function isLeagueRoundName(name: unknown): boolean {
  if (typeof name !== "string") return false;
  const s = name.trim();
  if (!s) return false;
  return /^第\s*\d+\s*節$/.test(s);
}

async function resolveOwnerUid(clubId: string): Promise<string | null> {
  try {
    const profilesQuery = db.collection("club_profiles").where("clubId", "==", clubId).limit(1);
    const profileSnap = await profilesQuery.get();

    const clubProfileDoc = !profileSnap.empty ? profileSnap.docs[0] : null;
    const directSnap = clubProfileDoc ? null : await db.collection("club_profiles").doc(clubId).get();
    const ownerSnap =
      clubProfileDoc || directSnap?.exists
        ? null
        : await db.collection("club_profiles").where("ownerUid", "==", clubId).limit(1).get();

    if (!clubProfileDoc && !directSnap?.exists && ownerSnap?.empty) return null;

    const fallbackDoc = ownerSnap && !ownerSnap.empty ? ownerSnap.docs[0] : null;
    const profileData = (
      clubProfileDoc
        ? clubProfileDoc.data()
        : directSnap?.exists
          ? (directSnap!.data() as any)
          : (fallbackDoc!.data() as any)
    ) as any;

    const ownerUid =
      (profileData as any)?.ownerUid ||
      (clubProfileDoc ? clubProfileDoc.id : directSnap?.exists ? directSnap!.id : fallbackDoc!.id);

    return ownerUid ? String(ownerUid) : null;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest, context: { params: Promise<{ clubId: string }> }) {
  try {
    const { clubId } = await context.params;
    const { searchParams } = new URL(request.url);
    const competitionId = searchParams.get("competitionId") || "";

    if (!clubId || !competitionId) {
      return NextResponse.json({ error: "clubId and competitionId are required" }, { status: 400 });
    }

    const ownerUid = await resolveOwnerUid(clubId);
    if (!ownerUid) {
      return NextResponse.json({ error: "Club not found" }, { status: 404 });
    }

    const competitionDocRef = db.doc(`clubs/${ownerUid}/competitions/${competitionId}`);

    const [allTeamsSnap, competitionSnap, standingsSnap] = await Promise.all([
      db.collection(`clubs/${ownerUid}/teams`).get(),
      competitionDocRef.get(),
      competitionDocRef.collection("standings").get(),
    ]);

    if (!competitionSnap.exists) {
      return NextResponse.json({ error: "Competition not found" }, { status: 404 });
    }

    const teamsMap = new Map<string, { name: string; logoUrl?: string }>();
    allTeamsSnap.forEach((d) => {
      const data = d.data() as any;
      teamsMap.set(d.id, { name: data?.name || "", logoUrl: data?.logoUrl || undefined });
    });

    const competitionData = competitionSnap.data() as any;

    const fetchedRankLabels: RankLabelRule[] = Array.isArray(competitionData?.rankLabels)
      ? (competitionData.rankLabels as any[])
          .map((r) => ({
            from: Number((r as any).from),
            to: Number((r as any).to),
            color: (r as any).color as RankLabelColor,
          }))
          .filter(
            (r) =>
              Number.isFinite(r.from) &&
              Number.isFinite(r.to) &&
              r.from > 0 &&
              r.to > 0 &&
              r.from <= r.to &&
              ["green", "red", "orange", "blue", "yellow"].includes(r.color)
          )
      : [];

    const selectedCompetition = {
      name: (competitionData && competitionData.name) || "",
      logoUrl: competitionData?.logoUrl || undefined,
    };

    if (!Array.isArray(competitionData?.teams) || competitionData.teams.length === 0) {
      return NextResponse.json({
        selectedCompetition,
        rankLabels: fetchedRankLabels,
        standings: [],
        errorMessage: "大会に参加チームが設定されていません",
      });
    }

    // Prefer manually saved standings if present
    if (!standingsSnap.empty) {
      const fetchedStandings: Standing[] = standingsSnap.docs
        .map((d) => {
          const data = d.data() as any;
          const teamInfo = teamsMap.get(d.id);
          const wins = typeof data.wins === "number" ? data.wins : 0;
          const draws = typeof data.draws === "number" ? data.draws : 0;
          const goalsFor = typeof data.goalsFor === "number" ? data.goalsFor : 0;
          const goalsAgainst = typeof data.goalsAgainst === "number" ? data.goalsAgainst : 0;

          const points = typeof data.points === "number" ? data.points : wins * 3 + draws;
          const goalDifference = typeof data.goalDifference === "number" ? data.goalDifference : goalsFor - goalsAgainst;

          return {
            id: d.id,
            rank: typeof data.rank === "number" ? data.rank : 0,
            teamName: teamInfo?.name || data.teamName || "Unknown Team",
            logoUrl: teamInfo?.logoUrl,
            played: typeof data.played === "number" ? data.played : 0,
            wins,
            draws,
            losses: typeof data.losses === "number" ? data.losses : 0,
            goalsFor,
            goalsAgainst,
            goalDifference,
            points,
          } as Standing;
        })
        .sort((a, b) => a.rank - b.rank);

      return NextResponse.json({ selectedCompetition, rankLabels: fetchedRankLabels, standings: fetchedStandings });
    }

    const standingsMap = new Map<string, Standing>();
    for (const teamId of competitionData.teams as string[]) {
      const teamInfo = teamsMap.get(teamId);
      standingsMap.set(teamId, {
        id: teamId,
        teamName: teamInfo?.name || "Unknown Team",
        logoUrl: teamInfo?.logoUrl,
        rank: 0,
        played: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalDifference: 0,
        points: 0,
      });
    }

    const roundsSnap = await competitionDocRef.collection("rounds").get();
    const format = competitionData?.format;
    const roundDocs =
      format === "league_cup" ? roundsSnap.docs.filter((d) => isLeagueRoundName((d.data() as any)?.name)) : roundsSnap.docs;

    const matchesByRound = await Promise.all(
      roundDocs.map(async (roundDoc) => {
        const matchesSnap = await roundDoc.ref.collection("matches").get();
        return matchesSnap.docs.map((matchDoc) => matchDoc.data() as any);
      })
    );

    for (const match of matchesByRound.flat()) {
      if (match.scoreHome == null || match.scoreAway == null || match.scoreHome === "" || match.scoreAway === "") {
        continue;
      }

      const homeTeamId = match.homeTeam;
      const awayTeamId = match.awayTeam;
      const homeScore = Number(match.scoreHome);
      const awayScore = Number(match.scoreAway);

      const homeStanding = standingsMap.get(homeTeamId);
      const awayStanding = standingsMap.get(awayTeamId);

      if (homeStanding) {
        homeStanding.played += 1;
        homeStanding.goalsFor += homeScore;
        homeStanding.goalsAgainst += awayScore;
        if (homeScore > awayScore) homeStanding.wins += 1;
        else if (homeScore < awayScore) homeStanding.losses += 1;
        else homeStanding.draws += 1;
      }

      if (awayStanding) {
        awayStanding.played += 1;
        awayStanding.goalsFor += awayScore;
        awayStanding.goalsAgainst += homeScore;
        if (awayScore > homeScore) awayStanding.wins += 1;
        else if (awayScore < homeScore) awayStanding.losses += 1;
        else awayStanding.draws += 1;
      }
    }

    const finalStandings = Array.from(standingsMap.values()).map((s) => {
      s.points = s.wins * 3 + s.draws;
      s.goalDifference = s.goalsFor - s.goalsAgainst;
      return s;
    });

    finalStandings.sort((a, b) => {
      if (a.points !== b.points) return b.points - a.points;
      if (a.goalDifference !== b.goalDifference) return b.goalDifference - a.goalDifference;
      if (a.goalsFor !== b.goalsFor) return b.goalsFor - a.goalsFor;
      return a.teamName.localeCompare(b.teamName);
    });

    const rankedStandings = finalStandings.map((s, index) => ({ ...s, rank: index + 1 }));

    return NextResponse.json({ selectedCompetition, rankLabels: fetchedRankLabels, standings: rankedStandings });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
