import { MatchDetails } from "@/types/match";
import { format } from 'date-fns';
import Link from 'next/link';
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

function getRoundLabel(roundName?: string) {
  const s = (roundName || '').trim();
  if (!s) return '';
  const m = s.match(/(\d+)/);
  if (m?.[1]) return `MW ${m[1]}`;
  return s;
}

function RecentMatchesStrip({
  matches,
  mainTeamId,
  clubSlug,
}: {
  matches: MatchDetails[];
  mainTeamId?: string | null;
  clubSlug: string;
}) {
  const items = (matches || [])
    .filter((m) => typeof m.scoreHome === 'number' && typeof m.scoreAway === 'number')
    .slice()
    .reverse();
  if (items.length === 0) return null;

  const resolveIsHome = (m: MatchDetails) => {
    if (mainTeamId) return m.homeTeam === mainTeamId;
    return false;
  };

  const resolveOutcome = (m: MatchDetails) => {
    const isHome = resolveIsHome(m);
    const my = isHome ? (m.scoreHome ?? 0) : (m.scoreAway ?? 0);
    const opp = isHome ? (m.scoreAway ?? 0) : (m.scoreHome ?? 0);
    if (my > opp) return 'win' as const;
    if (my < opp) return 'loss' as const;
    return 'draw' as const;
  };

  const resolveOpponent = (m: MatchDetails) => {
    const isHome = resolveIsHome(m);
    return {
      competitionLogoUrl: m.competitionLogoUrl,
      logo: isHome ? m.awayTeamLogo : m.homeTeamLogo,
      name: isHome ? m.awayTeamName : m.homeTeamName,
      ha: isHome ? '(H)' : '(A)',
      scoreText: `${m.scoreHome ?? '-'} - ${m.scoreAway ?? '-'}`,
      outcome: resolveOutcome(m),
      roundLabel: getRoundLabel(m.roundName),
    };
  };

  const outcomeClass = (o: 'win' | 'loss' | 'draw') => {
    if (o === 'win') return 'bg-emerald-600';
    if (o === 'loss') return 'bg-red-600';
    return 'bg-gray-500';
  };

  return (
    <div className="mb-4">
      <div className="flex gap-3 overflow-x-auto pb-2">
        {items.map((m) => {
          const opp = resolveOpponent(m);
          const href = `/${clubSlug}/matches/${m.competitionId}/${m.roundId}/${m.id}`;
          return (
            <Link key={m.id} href={href} className="flex-shrink-0 w-[110px]">
              <div className="rounded-md p-1 hover:bg-muted/50 transition-colors">
                <div className="mb-2 flex items-center justify-center gap-1 text-[11px] font-semibold text-muted-foreground">
                  {opp.competitionLogoUrl ? (
                    <Image
                      src={opp.competitionLogoUrl}
                      alt=""
                      width={12}
                      height={12}
                      className="h-3 w-3 object-contain"
                    />
                  ) : null}
                  <span>{opp.roundLabel}</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  {opp.logo ? (
                    <Image src={opp.logo} alt={opp.name} width={44} height={44} className="w-11 h-11 rounded-full object-contain" />
                  ) : (
                    <div className="w-11 h-11 rounded-full bg-gray-700 flex items-center justify-center text-white font-bold text-lg">
                      {opp.name.charAt(0)}
                    </div>
                  )}
                  <div className="text-[11px] font-semibold leading-tight text-center">
                    <div className="truncate max-w-[110px]">{opp.name}</div>
                    <div className="text-[10px] text-muted-foreground">{opp.ha}</div>
                  </div>
                  <div className={"w-full rounded-full px-2 py-1 text-center text-xs font-bold text-white " + outcomeClass(opp.outcome)}>
                    {opp.scoreText}
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function NextMatch({ match }: { match: MatchDetails | null }) {
  if (!match) return <div className="text-center p-8">No upcoming matches.</div>;

  const matchDate = new Date(match.matchDate);

  return (
    <div className="bg-white rounded-lg p-4 md:p-6 flex flex-col items-center shadow-lg hover:shadow-xl transition-shadow">
      <div className="w-full flex justify-around items-center">
        <TeamDisplay logo={match.homeTeamLogo} name={match.homeTeamName} />
        <div className="text-center px-1">
          <p className="text-xs sm:text-sm md:text-base text-muted-foreground">{match.matchTime ? `${format(matchDate, 'M/d')} ${match.matchTime}` : format(matchDate, 'M/d')}</p>
          <p className="text-base sm:text-lg md:text-xl font-bold">KICK OFF</p>
          <div className="mt-2 space-y-0.5">
            {match.competitionLogoUrl ? (
              <div className="flex items-center justify-center">
                <Image
                  src={match.competitionLogoUrl}
                  alt=""
                  width={14}
                  height={14}
                  className="h-3.5 w-3.5 object-contain"
                />
              </div>
            ) : (
              <p className="text-[10px] sm:text-xs text-muted-foreground truncate">{match.competitionName || ''}</p>
            )}
            <p className="text-[10px] sm:text-xs text-muted-foreground truncate">{match.roundName || ''}</p>
          </div>
        </div>
        <TeamDisplay logo={match.awayTeamLogo} name={match.awayTeamName} />
      </div>
    </div>
  );
}

interface MatchSectionProps {
  nextMatch: MatchDetails | null;
  recentMatches?: MatchDetails[];
  mainTeamId?: string | null;
  clubSlug: string;
}

export function MatchSection({ nextMatch, recentMatches = [], mainTeamId, clubSlug }: MatchSectionProps) {
  return (
    <section className="py-8 md:py-12">
      <div className="container mx-auto">
        <div className="bg-white rounded-lg shadow-sm p-4 md:p-6 w-full max-w-2xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-bold mb-4 text-center">MATCHES</h2>
          <RecentMatchesStrip matches={recentMatches} mainTeamId={mainTeamId} clubSlug={clubSlug} />
          <NextMatch match={nextMatch} />
        </div>
      </div>
    </section>
  );
}
