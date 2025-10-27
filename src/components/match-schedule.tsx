import { getMatchesGroupedByCompetition } from "@/lib/matches";
import { MatchDetails } from "@/types/match";
import { format } from 'date-fns';

const MatchItem = ({ match }: { match: MatchDetails }) => (
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
);

export async function MatchSchedule() {
  const groupedMatches = await getMatchesGroupedByCompetition();
  const competitionNames = Object.keys(groupedMatches);

  if (competitionNames.length === 0) {
    return <p>試合の予定はありません。</p>;
  }

  return (
    <div className="space-y-8">
      {competitionNames.map((competitionName) => (
        <div key={competitionName}>
          <h2 className="text-xl font-bold mb-4 border-l-4 border-blue-500 pl-3">{competitionName}</h2>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4">
            {groupedMatches[competitionName].map((match) => (
              <MatchItem key={match.id} match={match} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
