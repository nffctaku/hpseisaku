import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MatchDetails } from "@/types/match";
import { format } from 'date-fns';
import { Timestamp } from 'firebase/firestore';
import Image from 'next/image';

function TeamDisplay({ logo, name }: { logo?: string, name: string }) {
  return (
    <div className="flex flex-col items-center space-y-2 text-center w-24 md:w-28">
      {logo ? (
        <Image src={logo} alt={name} width={48} height={48} className="w-10 h-10 md:w-12 md:h-12 rounded-full object-contain" />
      ) : (
        <div className="w-10 h-10 md:w-12 md:h-12 bg-gray-700 rounded-full flex items-center justify-center text-white font-bold text-lg md:text-xl">{name.charAt(0)}</div>
      )}
      <span className="font-bold text-xs sm:text-sm md:text-base truncate w-full">{name}</span>
    </div>
  );
}

function LatestResult({ match, clubName }: { match: MatchDetails | null, clubName: string | null }) {
  if (!match) return <div className="text-center p-8">No recent matches.</div>;

  const isWin = clubName && typeof match.scoreHome === 'number' && typeof match.scoreAway === 'number' && 
                ((match.homeTeamName === clubName && match.scoreHome > match.scoreAway) || 
                 (match.awayTeamName === clubName && match.scoreAway > match.scoreHome));
  const isLoss = clubName && typeof match.scoreHome === 'number' && typeof match.scoreAway === 'number' && 
                 ((match.homeTeamName === clubName && match.scoreHome < match.scoreAway) || 
                  (match.awayTeamName === clubName && match.scoreAway < match.scoreHome));

  return (
    <div className="bg-card-foreground/5 rounded-lg p-4 md:p-6 flex flex-col items-center">
      <div className="w-full flex justify-around items-center">
        <TeamDisplay logo={match.homeTeamLogo} name={match.homeTeamName} />
        <div className="text-center px-1">
          <p className="text-4xl md:text-5xl font-bold tracking-tighter">{match.scoreHome ?? '-'} - {match.scoreAway ?? '-'}</p>
          {isWin && <p className="text-green-400 font-semibold text-xs md:text-sm mt-1">WIN</p>}
          {isLoss && <p className="text-red-400 font-semibold text-xs md:text-sm mt-1">LOSS</p>}
          {!isWin && !isLoss && <p className="text-gray-400 font-semibold text-xs md:text-sm mt-1">DRAW</p>}
          <p className="text-[10px] sm:text-xs text-muted-foreground mt-2 truncate">{match.competitionName} / {match.roundName}</p>
        </div>
        <TeamDisplay logo={match.awayTeamLogo} name={match.awayTeamName} />
      </div>
    </div>
  );
}

function NextMatch({ match }: { match: MatchDetails | null }) {
  if (!match) return <div className="text-center p-8">No upcoming matches.</div>;

  const matchDate = new Date(match.matchDate);

  return (
    <div className="bg-card-foreground/5 rounded-lg p-4 md:p-6 flex flex-col items-center">
      <div className="w-full flex justify-around items-center">
        <TeamDisplay logo={match.homeTeamLogo} name={match.homeTeamName} />
        <div className="text-center px-1">
          <p className="text-xs sm:text-sm md:text-base text-muted-foreground">{match.matchTime ? `${format(matchDate, 'M/d')} ${match.matchTime}` : format(matchDate, 'M/d')}</p>
          <p className="text-base sm:text-lg md:text-xl font-bold">KICK OFF</p>
          <p className="text-[10px] sm:text-xs text-muted-foreground mt-2 truncate">{match.competitionName} / {match.roundName}</p>
        </div>
        <TeamDisplay logo={match.awayTeamLogo} name={match.awayTeamName} />
      </div>
    </div>
  );
}

interface MatchSectionProps {
  latestResult: MatchDetails | null;
  nextMatch: MatchDetails | null;
  clubName: string | null;
}

export function MatchSection({ latestResult, nextMatch, clubName }: MatchSectionProps) {
  return (
    <section className="py-8 md:py-12">
      <div className="container mx-auto">
        <h2 className="text-2xl md:text-3xl font-bold mb-6 text-center">MATCHES</h2>
        <Tabs defaultValue="latest-result" className="w-full max-w-2xl mx-auto">
          <TabsList className="grid w-full grid-cols-2 bg-muted">
            <TabsTrigger value="latest-result">Latest Result</TabsTrigger>
            <TabsTrigger value="next-match">Next Match</TabsTrigger>
          </TabsList>
          <TabsContent value="latest-result">
            <LatestResult match={latestResult} clubName={clubName} />
          </TabsContent>
          <TabsContent value="next-match">
            <NextMatch match={nextMatch} />
          </TabsContent>
        </Tabs>
      </div>
    </section>
  );
}
