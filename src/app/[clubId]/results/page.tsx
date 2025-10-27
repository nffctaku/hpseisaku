import { db } from "@/lib/firebase/admin";
import { notFound } from 'next/navigation';
import { MatchList } from '@/components/match-list';

// This interface should be defined or imported if it's not already global.
// For now, we'll define a basic structure.
interface Match {
  id: string;
  competitionId: string;
  competitionName: string;
  roundId: string;
  roundName: string;
  matchDate: string;
  matchTime?: string;
  homeTeamId: string;
  awayTeamId: string;
  homeTeamName: string;
  awayTeamName: string;
  homeTeamLogo?: string;
  awayTeamLogo?: string;
  scoreHome?: number | null;
  scoreAway?: number | null;
}

async function getMatchesForClub(clubId: string) {
    // 1. Find ownerUid from clubId
    const profilesQuery = db.collection('club_profiles').where('clubId', '==', clubId).limit(1);
    const profilesSnap = await profilesQuery.get();
    if (profilesSnap.empty) {
        return null;
    }
    const profileData = profilesSnap.docs[0].data();
    const ownerUid = profileData.ownerUid;
    const clubName = profileData.clubName || 'Unknown Club';
    if (!ownerUid) {
        return null;
    }

    // 2. Fetch all teams into a map
    const teamsMap = new Map<string, { id: string; name: string; logoUrl?: string; }>();
    const teamsQuery = db.collection(`clubs/${ownerUid}/teams`);
    const teamsSnap = await teamsQuery.get();
    teamsSnap.forEach(doc => teamsMap.set(doc.id, { id: doc.id, ...doc.data() } as { id: string; name: string; logoUrl?: string; }));

    // 3. Fetch all competitions, rounds, and matches
    const enrichedMatches: Match[] = [];
    const competitionsQuery = db.collection(`clubs/${ownerUid}/competitions`);
    const competitionsSnap = await competitionsQuery.get();

    for (const compDoc of competitionsSnap.docs) {
        const competitionData = compDoc.data();
        const roundsQuery = db.collection(`clubs/${ownerUid}/competitions/${compDoc.id}/rounds`);
        const roundsSnap = await roundsQuery.get();

        for (const roundDoc of roundsSnap.docs) {
            const roundData = roundDoc.data();
            const matchesQuery = db.collection(`clubs/${ownerUid}/competitions/${compDoc.id}/rounds/${roundDoc.id}/matches`);
            const matchesSnap = await matchesQuery.get();

            for (const matchDoc of matchesSnap.docs) {
                const matchData = matchDoc.data();
                const homeTeam = teamsMap.get(matchData.homeTeam);
                const awayTeam = teamsMap.get(matchData.awayTeam);

                enrichedMatches.push({
                    id: matchDoc.id,
                    competitionId: compDoc.id,
                    competitionName: competitionData.name,
                    roundId: roundDoc.id,
                    roundName: roundData.name,
                    matchDate: matchData.matchDate,
                    matchTime: matchData.matchTime,
                    homeTeamId: matchData.homeTeam,
                    awayTeamId: matchData.awayTeam,
                    homeTeamName: homeTeam?.name || '不明なチーム',
                    awayTeamName: awayTeam?.name || '不明なチーム',
                    homeTeamLogo: homeTeam?.logoUrl,
                    awayTeamLogo: awayTeam?.logoUrl,
                    scoreHome: matchData.scoreHome,
                    scoreAway: matchData.scoreAway,
                });
            }
        }
    }

    // 4. Sort all matches by date
    enrichedMatches.sort((a, b) => new Date(a.matchDate).getTime() - new Date(b.matchDate).getTime());

    return { matches: enrichedMatches, clubName, ownerUid };
}

interface ResultsPageProps {
  params: { clubId: string };
}

export default async function ResultsPage({ params }: ResultsPageProps) {
    const clubId = params.clubId;

    if (clubId === 'admin') {
        notFound();
    }

    const data = await getMatchesForClub(clubId);

    if (!data) {
        notFound();
    }

    const { matches, clubName, ownerUid } = data;

    return (
        <MatchList 
            allMatches={matches} 
            clubId={ownerUid} // Pass the internal team ID (ownerUid) for filtering
            clubName={clubName} 
        />
    );
}