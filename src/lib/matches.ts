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

export async function getMatchDataForClub(ownerUid: string): Promise<{ latestResult: MatchDetails | null; nextMatch: MatchDetails | null; clubName: string | null }> {
  if (!ownerUid) {
    return { latestResult: null, nextMatch: null, clubName: null };
  }

  // 1. Get club name
  const clubProfileRef = db.collection('club_profiles').doc(ownerUid);
  const clubProfileSnap = await clubProfileRef.get();
  const clubName = clubProfileSnap.exists ? clubProfileSnap.data()?.clubName : null;

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
          ...matchData,
          id: matchDoc.id,
          competitionName: compDoc.data().name,
          roundName: roundDoc.data().name,
          homeTeamId: matchData.homeTeam,
          awayTeamId: matchData.awayTeam,
          homeTeamName: homeTeam?.name || '不明',
          awayTeamName: awayTeam?.name || '不明',
          homeTeamLogo: homeTeam?.logoUrl,
          awayTeamLogo: awayTeam?.logoUrl,
        } as MatchDetails);
      }
    }
  }

  // 4. Filter for own team's matches
  const ownMatches = allMatches.filter(m => m.homeTeamId === ownerUid || m.awayTeamId === ownerUid);
  if (ownMatches.length === 0) {
    return { latestResult: null, nextMatch: null, clubName };
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

  return { latestResult, nextMatch, clubName };
}
