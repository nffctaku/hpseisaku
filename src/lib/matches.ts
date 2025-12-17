import { db } from "./firebase/admin"; // Use admin SDK for server-side fetching
import { startOfDay } from 'date-fns';
import { MatchDetails } from "@/types/match";
import { Timestamp } from 'firebase-admin/firestore';

export async function getMatchesGroupedByCompetition(): Promise<Record<string, MatchDetails[]>> {
  const clubsRef = db.collection('club_profiles');
  const clubsSnap = await clubsRef.limit(1).get();
  if (clubsSnap.empty) {
    return {};
  }
  const firstClub = clubsSnap.docs[0].data();
  const userId = firstClub.userId;

  if (!userId) {
    return {};
  }

  const matchesCollection = db.collection(`clubs/${userId}/matches`);
  const querySnapshot = await matchesCollection.orderBy("matchDate", "asc").get();

  const matches = querySnapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
  })) as MatchDetails[];

  const groupedMatches = matches.reduce((acc, match) => {
    const competitionName = match.competitionName || 'Uncategorized';
    if (!acc[competitionName]) {
      acc[competitionName] = [];
    }
    acc[competitionName].push(match);
    return acc;
  }, {} as Record<string, MatchDetails[]>);

  return groupedMatches;
}

export async function getMatchDataForClub(ownerUid: string): Promise<{
  latestResult: MatchDetails | null;
  nextMatch: MatchDetails | null;
  clubName: string | null;
  recentMatches: MatchDetails[];
  upcomingMatches: MatchDetails[];
}> {
  if (!ownerUid) {
    return { latestResult: null, nextMatch: null, clubName: null, recentMatches: [], upcomingMatches: [] };
  }

  // 1. Get club name and main team id
  // club_profiles のドキュメントIDは ownerUid とは限らないので、ownerUid で検索する
  const clubProfilesRef = db.collection('club_profiles');
  const profileQuery = clubProfilesRef.where('ownerUid', '==', ownerUid).limit(1);
  const profileSnap = await profileQuery.get();
  const clubProfileData = !profileSnap.empty ? profileSnap.docs[0].data() : null;
  const clubName = clubProfileData?.clubName ?? null;
  const mainTeamId = (clubProfileData as any)?.mainTeamId || ownerUid;

  // 2. Fetch all teams for the club
  const teamsMap = new Map<string, { name: string; logoUrl?: string }>();
  const teamsQuery = db.collection(`clubs/${ownerUid}/teams`);
  const teamsSnap = await teamsQuery.get();
  teamsSnap.forEach(doc => teamsMap.set(doc.id, { name: doc.data().name, logoUrl: doc.data().logoUrl }));

  // 3. Fetch all matches from all competitions/rounds
  const allMatches: MatchDetails[] = [];
  const competitionsQuery = db.collection(`clubs/${ownerUid}/competitions`);
  const competitionsSnap = await competitionsQuery.get();

  for (const compDoc of competitionsSnap.docs) {
    const roundsQuery = db.collection(`clubs/${ownerUid}/competitions/${compDoc.id}/rounds`);
    const roundsSnap = await roundsQuery.get();
    for (const roundDoc of roundsSnap.docs) {
      const matchesQuery = db.collection(`clubs/${ownerUid}/competitions/${compDoc.id}/rounds/${roundDoc.id}/matches`);
      const matchesSnap = await matchesQuery.get();
      for (const matchDoc of matchesSnap.docs) {
        const matchData = matchDoc.data();
        const homeTeam = teamsMap.get(matchData.homeTeam);
        const awayTeam = teamsMap.get(matchData.awayTeam);
        allMatches.push({
          ...(matchData as any),
          id: matchDoc.id,
          competitionName: compDoc.data().name,
          roundName: roundDoc.data().name,
          homeTeamName: homeTeam?.name || '不明',
          awayTeamName: awayTeam?.name || '不明',
          homeTeamLogo: homeTeam?.logoUrl,
          awayTeamLogo: awayTeam?.logoUrl,
        } as MatchDetails);
      }
    }
  }

  // 3.5 Fetch friendly/single matches
  const friendlySnap = await db.collection(`clubs/${ownerUid}/friendly_matches`).get();
  friendlySnap.forEach((doc) => {
    const matchData = doc.data() as any;
    const compId = (matchData.competitionId as string) === 'practice' ? 'practice' : 'friendly';
    const compName = matchData.competitionName || (compId === 'practice' ? '練習試合' : '親善試合');
    const homeTeam = teamsMap.get(matchData.homeTeam);
    const awayTeam = teamsMap.get(matchData.awayTeam);
    allMatches.push({
      ...(matchData as any),
      id: doc.id,
      competitionId: compId,
      roundId: 'single',
      competitionName: compName,
      roundName: matchData.roundName || '単発',
      homeTeamName: matchData.homeTeamName || homeTeam?.name || '不明',
      awayTeamName: matchData.awayTeamName || awayTeam?.name || '不明',
      homeTeamLogo: matchData.homeTeamLogo || homeTeam?.logoUrl,
      awayTeamLogo: matchData.awayTeamLogo || awayTeam?.logoUrl,
    } as MatchDetails);
  });

  // 4. Filter for own team's matches based on mainTeamId.
  // If該当試合が1件もない場合は、他クラブ同士の試合は出さず、null を返す。
  const ownMatches = allMatches.filter(
    (m) => (m as any).homeTeam === mainTeamId || (m as any).awayTeam === mainTeamId
  );

  if (ownMatches.length === 0) {
    return { latestResult: null, nextMatch: null, clubName, recentMatches: [], upcomingMatches: [] };
  }

  // 5. Find latest result and next match based on score presence
  const pastMatches = ownMatches.filter(m => m.scoreHome !== null && m.scoreAway !== null);
  const futureMatches = ownMatches.filter(m => m.scoreHome === null || m.scoreAway === null);

  // Sort past matches descending to get the latest one first
  pastMatches.sort((a, b) => new Date(b.matchDate).getTime() - new Date(a.matchDate).getTime());
  // Sort future matches ascending to get the next one first
  futureMatches.sort((a, b) => new Date(a.matchDate).getTime() - new Date(b.matchDate).getTime());

  const latestResult = pastMatches.length > 0 ? pastMatches[0] : null;
  const nextMatch = futureMatches.length > 0 ? futureMatches[0] : null;

  const recentMatches = pastMatches.slice(0, 3);
  const upcomingMatches = futureMatches.slice(0, 7);

  return { latestResult, nextMatch, clubName, recentMatches, upcomingMatches };
}
