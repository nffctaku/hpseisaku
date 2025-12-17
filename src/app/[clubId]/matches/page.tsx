import { db } from '@/lib/firebase/admin';
import { MatchDetails } from '@/types/match';
import { format } from 'date-fns';
import Link from 'next/link';

interface PageProps {
  params: { clubId: string };
}

async function getClubMatches(clubId: string): Promise<Record<string, MatchDetails[]>> {
  const clubRef = await db.collection('club_profiles').doc(clubId).get();
  if (!clubRef.exists) {
    return {};
  }
  const userId = clubRef.data()?.userId;
  if (!userId) {
    return {};
  }

  const matchesRef = db.collection(`clubs/${userId}/matches`);

    const clubName = clubRef.data()?.clubName;

  const homeQuery = matchesRef.where('homeTeam', '==', clubName);
  const homeSnapshot = await homeQuery.get();

  const awayQuery = matchesRef.where('awayTeam', '==', clubName);
  const awaySnapshot = await awayQuery.get();

  const matches: MatchDetails[] = [];
  const matchIds = new Set<string>();

  homeSnapshot.forEach(doc => {
    if (!matchIds.has(doc.id)) {
      matches.push({ id: doc.id, ...doc.data() } as MatchDetails);
      matchIds.add(doc.id);
    }
  });

  awaySnapshot.forEach(doc => {
    if (!matchIds.has(doc.id)) {
      matches.push({ id: doc.id, ...doc.data() } as MatchDetails);
      matchIds.add(doc.id);
    }
  });

  // friendly/single matches
  const friendlySnap = await db.collection(`clubs/${userId}/friendly_matches`).get();
  friendlySnap.forEach((doc) => {
    if (matchIds.has(doc.id)) return;
    const data = doc.data() as any;
    const compId = (data.competitionId as string) === 'practice' ? 'practice' : 'friendly';
    const compName = data.competitionName || (compId === 'practice' ? '練習試合' : '親善試合');
    matches.push({
      id: doc.id,
      ...(data as any),
      competitionId: compId,
      roundId: 'single',
      competitionName: compName,
      roundName: data.roundName || '単発',
    } as MatchDetails);
    matchIds.add(doc.id);
  });

  // Sort matches by date in the application
  matches.sort((a, b) => new Date(a.matchDate).getTime() - new Date(b.matchDate).getTime());

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

const MatchItem = ({ clubId, match }: { clubId: string; match: MatchDetails }) => (
    <Link
      href={`/${clubId}/matches/${match.competitionId}/${match.roundId}/${match.id}`}
      className="block"
    >
      <div className="grid grid-cols-3 items-center gap-4 py-3 border-b last:border-b-0">
          <div className="flex items-center gap-2 justify-end">
              <span className="text-sm md:text-base font-medium text-right">{match.homeTeamName}</span>
              {match.homeTeamLogo && <img src={match.homeTeamLogo} alt={match.homeTeamName} className="w-6 h-6 object-contain" />}
          </div>
          <div className="text-center">
              {match.scoreHome !== null && match.scoreAway !== null ? (
                  <span className="text-lg md:text-xl font-bold">{match.scoreHome} - {match.scoreAway}</span>
              ) : (
                  <span className="text-xs text-gray-500">{format(new Date(match.matchDate), 'HH:mm')}</span>
              )}
          </div>
          <div className="flex items-center gap-2 justify-start">
              {match.awayTeamLogo && <img src={match.awayTeamLogo} alt={match.awayTeamName} className="w-6 h-6 object-contain" />}
              <span className="text-sm md:text-base font-medium text-left">{match.awayTeamName}</span>
          </div>
      </div>
    </Link>
);


export default async function ClubMatchesPage({ params }: PageProps) {
  const { clubId } = params;
  const groupedMatches = await getClubMatches(clubId);
  const competitionNames = Object.keys(groupedMatches);

  const clubRef = await db.collection('club_profiles').doc(clubId).get();
  const clubName = clubRef.exists ? clubRef.data()?.clubName : 'クラブ';

  return (
    <div className="container mx-auto px-4 py-8">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold tracking-tight">{clubName} - 試合日程</h1>
        </div>

        {competitionNames.length > 0 ? (
             <div className="space-y-8">
             {competitionNames.map((competitionName) => (
               <div key={competitionName}>
                 <h2 className="text-xl font-bold mb-4 border-l-4 border-blue-500 pl-3">{competitionName}</h2>
                 <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4">
                   {groupedMatches[competitionName].map((match) => (
                     <MatchItem key={match.id} clubId={clubId} match={match} />
                  ))}
                </div>
              </div>
            ))}
           </div>
        ) : (
            <p>{clubName}の試合予定はありません。</p>
        )}
    </div>
  );
}
