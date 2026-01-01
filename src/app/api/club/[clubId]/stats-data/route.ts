import { NextResponse, NextRequest } from "next/server";
import { db } from "@/lib/firebase/admin";

async function resolveOwnerUid(clubId: string): Promise<{ ownerUid: string; profile: any }> {
  const profilesQuery = db.collection("club_profiles").where("clubId", "==", clubId).limit(1);
  const profilesSnap = await profilesQuery.get();
  if (profilesSnap.empty) {
    throw new Error("Club not found");
  }

  const clubProfileDoc = profilesSnap.docs[0];
  const profileData = clubProfileDoc.data()!;
  const ownerUid = (profileData as any).ownerUid || clubProfileDoc.id;
  if (!ownerUid) {
    throw new Error("Club owner UID not found");
  }

  return { ownerUid, profile: profileData };
}

export async function GET(request: NextRequest, context: { params: { clubId: string } }) {
  try {
    const { clubId } = await context.params;
    const { ownerUid, profile } = await resolveOwnerUid(clubId);

    const mainTeamId = typeof (profile as any)?.mainTeamId === "string" ? (profile as any).mainTeamId : null;

    const [teamsSnap, competitionsSnap] = await Promise.all([
      db.collection(`clubs/${ownerUid}/teams`).get(),
      db.collection(`clubs/${ownerUid}/competitions`).get(),
    ]);

    const teams = teamsSnap.docs
      .map((d) => {
        const data = d.data() as any;
        return {
          id: d.id,
          name: (data?.name as string) || d.id,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    const competitions = competitionsSnap.docs
      .map((d) => {
        const data = d.data() as any;
        return {
          id: d.id,
          name: (data?.name as string) || d.id,
          season: typeof data?.season === "string" ? data.season : undefined,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    const players: any[] = [];
    const playersByTeam = new Map<string, any[]>();

    const targetTeams = teams.filter((t) => !mainTeamId || t.id === mainTeamId);
    const playersByTeamRows = await Promise.all(
      targetTeams.map(async (team) => {
        const pSnap = await db.collection(`clubs/${ownerUid}/teams/${team.id}/players`).get();
        const rows = pSnap.docs.map((p) => {
          const data = p.data() as any;
          return {
            id: p.id,
            name: data?.name,
            number: data?.number ?? 0,
            position: data?.position,
            teamId: team.id,
            manualCompetitionStats: Array.isArray(data?.manualCompetitionStats) ? data.manualCompetitionStats : [],
            seasonData: data?.seasonData && typeof data.seasonData === "object" ? data.seasonData : {},
          };
        });
        rows.sort(
          (a, b) => (a.number ?? 0) - (b.number ?? 0) || String(a.name || "").localeCompare(String(b.name || ""))
        );
        return { teamId: team.id, rows };
      })
    );

    for (const item of playersByTeamRows) {
      playersByTeam.set(item.teamId, item.rows);
      players.push(...item.rows);
    }


    const matchesNested = await Promise.all(
      competitions.map(async (comp) => {
        const roundsSnap = await db.collection(`clubs/${ownerUid}/competitions/${comp.id}/rounds`).get();
        const byRound = await Promise.all(
          roundsSnap.docs.map(async (round) => {
            const mSnap = await round.ref.collection("matches").get();
            return mSnap.docs.map((m) => {
              const data = m.data() as any;
              return {
                id: m.id,
                competitionId: comp.id,
                competitionName: comp.name,
                competitionSeason: comp.season,
                roundId: round.id,
                roundName: data?.roundName || (round.data() as any)?.name,
                matchDate: data?.matchDate,
                homeTeamId: data?.homeTeam,
                awayTeamId: data?.awayTeam,
                homeTeamName: data?.homeTeamName,
                awayTeamName: data?.awayTeamName,
                scoreHome: data?.scoreHome,
                scoreAway: data?.scoreAway,
                teamStats: Array.isArray(data?.teamStats) ? data.teamStats : [],
                playerStats: Array.isArray(data?.playerStats) ? data.playerStats : [],
              };
            });
          })
        );
        return byRound.flat();
      })
    );

    const matches: any[] = matchesNested.flat();

    return NextResponse.json({
      ownerUid,
      profile,
      mainTeamId,
      teams,
      competitions,
      players,
      matches,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    if (errorMessage === "Club not found" || errorMessage === "Club owner UID not found") {
      return new NextResponse(errorMessage, { status: 404 });
    }
    console.error("API Error (stats-data):", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
