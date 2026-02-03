import { NextResponse, NextRequest } from "next/server";
import { db } from "@/lib/firebase/admin";

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

function toDashSeason(season: string): string {
  if (!season) return season;
  if (season.includes("-")) {
    const parts = season.split("-");
    if (parts.length === 2 && /^\d{4}$/.test(parts[0])) {
      const end = parts[1];
      const end2 = /^\d{4}$/.test(end) ? end.slice(-2) : end;
      if (/^\d{2}$/.test(end2)) return `${parts[0]}-${end2}`;
    }
    return season;
  }
  const mShort = season.match(/^(\d{4})\/(\d{2})$/);
  if (mShort) return `${mShort[1]}-${mShort[2]}`;
  const m4 = season.match(/^(\d{4})\/(\d{4})$/);
  if (m4) return `${m4[1]}-${m4[2].slice(-2)}`;
  return season;
}

function seasonEquals(a: string, b: string): boolean {
  if (!a || !b) return false;
  return a === b || toSlashSeason(a) === toSlashSeason(b) || toDashSeason(a) === toDashSeason(b);
}

async function resolveOwnerUid(clubId: string): Promise<{ ownerUid: string; profile: any }> {
  const profilesQuery = db.collection("club_profiles").where("clubId", "==", clubId).limit(1);
  const profilesSnap = await profilesQuery.get();

  let profileDoc: FirebaseFirestore.DocumentSnapshot | null = null;
  if (!profilesSnap.empty) {
    profileDoc = profilesSnap.docs[0];
  } else {
    const direct = await db.collection('club_profiles').doc(clubId).get();
    if (direct.exists) {
      profileDoc = direct;
    } else {
      const ownerSnap = await db.collection('club_profiles').where('ownerUid', '==', clubId).limit(1).get();
      if (!ownerSnap.empty) profileDoc = ownerSnap.docs[0];
    }
  }

  if (!profileDoc) {
    throw new Error("Club not found");
  }

  const profileData = profileDoc.data()!;
  const ownerUid = (profileData as any).ownerUid || profileDoc.id;
  if (!ownerUid) {
    throw new Error("Club owner UID not found");
  }

  return { ownerUid, profile: profileData };
}

function chunkArray<T>(arr: T[], chunkSize: number): T[][] {
  if (chunkSize <= 0) return [arr];
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += chunkSize) out.push(arr.slice(i, i + chunkSize));
  return out;
}

type AggregatedPlayerStats = {
  appearances: number;
  minutes: number;
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
};

function normalizeManualStatsRows(rows: any[] | undefined): any[] {
  return Array.isArray(rows) ? rows : [];
}

function computeAggregatedStats(params: {
  matches: any[];
  players: any[];
  competitions: { id: string; season?: string }[];
  selectedSeason: string;
  selectedCompetitionId: string;
}): Record<string, AggregatedPlayerStats> {
  const { matches, players, competitions, selectedSeason, selectedCompetitionId } = params;
  const result: Record<string, AggregatedPlayerStats> = {};

  const allowedPlayerIds = new Set(players.map((p) => p.id));

  const compsFiltered = competitions.filter((c) => {
    if (selectedSeason !== 'all' && typeof c.season === 'string' && !seasonEquals(c.season, selectedSeason)) return false;
    if (selectedCompetitionId !== 'all' && c.id !== selectedCompetitionId) return false;
    return true;
  });
  const compIds = new Set(compsFiltered.map((c) => c.id));

  // Resolve per-player manualCompetitionStats similar to the client logic.
  const manualByCompetition = new Map<string, Map<string, any>>();
  for (const p of players) {
    const seasonData = p?.seasonData && typeof p.seasonData === 'object' ? p.seasonData : {};
    let effectiveManualRows: any[] = [];

    if (selectedSeason !== 'all') {
      const sd = (seasonData as any)?.[selectedSeason];
      const seasonManual = normalizeManualStatsRows((sd as any)?.manualCompetitionStats);
      const legacyManual = normalizeManualStatsRows(p?.manualCompetitionStats);
      effectiveManualRows = seasonManual.length > 0 ? seasonManual : legacyManual;
    } else {
      const allSeasonManual = Object.values(seasonData).flatMap((v: any) => normalizeManualStatsRows(v?.manualCompetitionStats));
      const legacyManual = normalizeManualStatsRows(p?.manualCompetitionStats);
      effectiveManualRows = [...allSeasonManual, ...legacyManual];
    }

    for (const r of effectiveManualRows) {
      const compId = typeof r?.competitionId === 'string' ? r.competitionId : '';
      if (!compId || !compIds.has(compId)) continue;
      const hasAnyValue =
        typeof r?.matches === 'number' ||
        typeof r?.minutes === 'number' ||
        typeof r?.goals === 'number' ||
        typeof r?.assists === 'number' ||
        typeof r?.yellowCards === 'number' ||
        typeof r?.redCards === 'number';
      if (!hasAnyValue) continue;
      const map = manualByCompetition.get(compId) ?? new Map<string, any>();
      map.set(p.id, r);
      manualByCompetition.set(compId, map);
    }
  }

  for (const comp of compsFiltered) {
    const manualForThisCompetition = manualByCompetition.get(comp.id) ?? new Map<string, any>();

    for (const [playerId, m] of manualForThisCompetition.entries()) {
      if (!result[playerId]) {
        result[playerId] = { appearances: 0, minutes: 0, goals: 0, assists: 0, yellowCards: 0, redCards: 0 };
      }
      result[playerId].appearances += typeof m?.matches === 'number' ? m.matches : 0;
      result[playerId].minutes += typeof m?.minutes === 'number' ? m.minutes : 0;
      result[playerId].goals += typeof m?.goals === 'number' ? m.goals : 0;
      result[playerId].assists += typeof m?.assists === 'number' ? m.assists : 0;
      result[playerId].yellowCards += typeof m?.yellowCards === 'number' ? m.yellowCards : 0;
      result[playerId].redCards += typeof m?.redCards === 'number' ? m.redCards : 0;
    }

    const matchesForComp = matches.filter((m) => m?.competitionId === comp.id);
    for (const match of matchesForComp) {
      const ps = Array.isArray((match as any)?.playerStats) ? (match as any).playerStats : [];
      for (const stat of ps) {
        const playerId = stat?.playerId;
        if (!playerId) continue;
        if (!allowedPlayerIds.has(playerId)) continue;
        if (manualForThisCompetition.has(playerId)) continue;
        if (!result[playerId]) {
          result[playerId] = { appearances: 0, minutes: 0, goals: 0, assists: 0, yellowCards: 0, redCards: 0 };
        }
        const minutesPlayed = Number(stat.minutesPlayed) || 0;
        result[playerId].appearances += minutesPlayed > 0 ? 1 : 0;
        result[playerId].minutes += minutesPlayed;
        result[playerId].goals += Number(stat.goals) || 0;
        result[playerId].assists += Number(stat.assists) || 0;
        result[playerId].yellowCards += Number(stat.yellowCards) || 0;
        result[playerId].redCards += Number(stat.redCards) || 0;
      }
    }
  }

  return result;
}

export async function GET(request: NextRequest, context: { params: { clubId: string } }) {
  try {
    const { clubId } = await context.params;
    const seasonParam = request.nextUrl.searchParams.get('season');
    const competitionIdParam = request.nextUrl.searchParams.get('competitionId');
    const { ownerUid, profile } = await resolveOwnerUid(clubId);

    const clubSnap = await db.collection('clubs').doc(ownerUid).get();
    const statsCacheVersionRaw = clubSnap.exists ? (clubSnap.data() as any)?.statsCacheVersion : 0;
    const statsCacheVersion = typeof statsCacheVersionRaw === 'number' ? statsCacheVersionRaw : 0;

    const mainTeamId = typeof (profile as any)?.mainTeamId === "string" ? (profile as any).mainTeamId : null;

    const seasonKey = seasonParam && seasonParam !== '' ? seasonParam : 'all';
    const competitionKey = competitionIdParam && competitionIdParam !== '' ? competitionIdParam : 'all';

    const [teamsSnap, competitionsSnap] = await Promise.all([
      db.collection(`clubs/${ownerUid}/teams`).get(),
      db.collection(`clubs/${ownerUid}/competitions`).get(),
    ]);

    const teamsDocs = teamsSnap.docs.map((d) => ({ id: d.id, data: d.data() as any }));
    const teams = teamsDocs
      .map((d) => {
        return {
          id: d.id,
          name: (d.data?.name as string) || d.id,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    let resolvedMainTeamId: string | null = null;
    if (mainTeamId) {
      const direct = teamsDocs.find((t) => t.id === mainTeamId);
      if (direct) {
        resolvedMainTeamId = direct.id;
      } else {
        const byField = teamsDocs.find((t) => {
          const data = t.data;
          return (
            data?.teamId === mainTeamId ||
            data?.teamUid === mainTeamId ||
            data?.uid === mainTeamId ||
            data?.ownerUid === mainTeamId
          );
        });
        if (byField) resolvedMainTeamId = byField.id;
      }
    }

    const teamKey = resolvedMainTeamId || mainTeamId || 'all';
    const cacheKey = `${statsCacheVersion}__${teamKey}__${seasonKey}__${competitionKey}`;

    const competitions = competitionsSnap.docs
      .map((d) => {
        const data = d.data() as any;
        return {
          id: d.id,
          name: (data?.name as string) || d.id,
          season: typeof data?.season === "string" ? data.season : undefined,
          format: typeof data?.format === "string" ? data.format : undefined,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    const players: any[] = [];
    const playersByTeam = new Map<string, any[]>();

    const effectiveMainTeamId = resolvedMainTeamId || mainTeamId;
    const targetTeams = teams.filter((t) => !effectiveMainTeamId || t.id === effectiveMainTeamId);
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

    // Use cached aggregated stats if present (but still return matches for UI computations)
    const cacheRef = db.collection(`clubs/${ownerUid}/public_stats_index`).doc(cacheKey);
    const cacheSnap = await cacheRef.get();
    let cachedAggregatedStats: Record<string, AggregatedPlayerStats> | null = null;
    if (cacheSnap.exists) {
      const cached = cacheSnap.data() as any;
      if (cached && cached.aggregatedStats && typeof cached.aggregatedStats === 'object') {
        cachedAggregatedStats = cached.aggregatedStats as Record<string, AggregatedPlayerStats>;
      }
    }


    const compsForMatches = competitions.filter((c) => {
      if (competitionIdParam && competitionIdParam !== 'all' && c.id !== competitionIdParam) return false;
      if (seasonParam && seasonParam !== 'all' && typeof c.season === 'string' && !seasonEquals(c.season, seasonParam)) return false;
      return true;
    });

    const matchesNested = await Promise.all(
      compsForMatches.map(async (comp) => {
        const roundsSnap = await db.collection(`clubs/${ownerUid}/competitions/${comp.id}/rounds`).get();
        const byRound = await Promise.all(
          roundsSnap.docs.map(async (round) => {
            const roundData = round.data() as any;
            const mSnap = await round.ref.collection("matches").get();
            return mSnap.docs.map((m) => {
              const data = m.data() as any;
              return {
                id: m.id,
                competitionId: comp.id,
                competitionName: comp.name,
                competitionSeason: comp.season,
                roundId: round.id,
                roundName: data?.roundName || roundData?.name,
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

    // Include friendly matches (and practice if stored there)
    try {
      const friendlySnap = await db.collection(`clubs/${ownerUid}/friendly_matches`).get();
      friendlySnap.forEach((matchDoc) => {
        const data = matchDoc.data() as any;
        const compId = typeof data?.competitionId === 'string' ? data.competitionId : 'friendly';
        matches.push({
          id: matchDoc.id,
          competitionId: compId,
          competitionName: data?.competitionName || (compId === 'practice' ? '練習試合' : '親善試合'),
          competitionSeason: typeof data?.competitionSeason === 'string' ? data.competitionSeason : undefined,
          roundId: 'single',
          roundName: data?.roundName || '単発',
          matchDate: data?.matchDate,
          homeTeamId: data?.homeTeam,
          awayTeamId: data?.awayTeam,
          homeTeamName: data?.homeTeamName,
          awayTeamName: data?.awayTeamName,
          scoreHome: data?.scoreHome,
          scoreAway: data?.scoreAway,
          teamStats: Array.isArray(data?.teamStats) ? data.teamStats : [],
          playerStats: Array.isArray(data?.playerStats) ? data.playerStats : [],
        });
      });
    } catch {
      // ignore
    }

    // Include direct matches if stored under clubs/{ownerUid}/matches
    try {
      const directSnap = await db.collection(`clubs/${ownerUid}/matches`).get();
      directSnap.forEach((matchDoc) => {
        const data = matchDoc.data() as any;
        matches.push({
          id: matchDoc.id,
          competitionId: typeof data?.competitionId === 'string' ? data.competitionId : 'direct',
          competitionName: data?.competitionName || '試合',
          competitionSeason: typeof data?.competitionSeason === 'string' ? data.competitionSeason : undefined,
          roundId: typeof data?.roundId === 'string' ? data.roundId : 'single',
          roundName: data?.roundName,
          matchDate: data?.matchDate,
          homeTeamId: data?.homeTeam,
          awayTeamId: data?.awayTeam,
          homeTeamName: data?.homeTeamName,
          awayTeamName: data?.awayTeamName,
          scoreHome: data?.scoreHome,
          scoreAway: data?.scoreAway,
          teamStats: Array.isArray(data?.teamStats) ? data.teamStats : [],
          playerStats: Array.isArray(data?.playerStats) ? data.playerStats : [],
        });
      });
    } catch {
      // ignore
    }

    const aggregatedStats =
      cachedAggregatedStats ??
      computeAggregatedStats({
        matches,
        players,
        competitions,
        selectedSeason: seasonKey,
        selectedCompetitionId: competitionKey,
      });

    if (!cachedAggregatedStats) {
      await cacheRef.set(
        {
          aggregatedStats,
          updatedAt: new Date().toISOString(),
          statsCacheVersion,
          teamKey,
          seasonKey,
          competitionKey,
        },
        { merge: true }
      );
    }

    return NextResponse.json({
      ownerUid,
      profile,
      mainTeamId,
      resolvedMainTeamId,
      teams,
      competitions,
      players,
      matches,
      aggregatedStats,
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
