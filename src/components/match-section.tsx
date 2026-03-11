import { MatchDetails } from "@/types/match";
import { format, isValid, parseISO } from 'date-fns';
import { ja } from 'date-fns/locale';
import Link from 'next/link';
import Image from 'next/image';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel';

function resolveRgb(input: string): { r: number; g: number; b: number } | null {
  const raw = (input || '').trim();
  if (!raw) return null;

  const hex = raw.replace('#', '');
  if (/^[0-9a-fA-F]{3}$/.test(hex)) {
    const r = parseInt(hex[0] + hex[0], 16);
    const g = parseInt(hex[1] + hex[1], 16);
    const b = parseInt(hex[2] + hex[2], 16);
    return { r, g, b };
  }
  if (/^[0-9a-fA-F]{6}$/.test(hex)) {
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return { r, g, b };
  }

  const m = raw.match(/rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/i);
  if (m?.[1] && m?.[2] && m?.[3]) {
    const r = Math.max(0, Math.min(255, Number(m[1])));
    const g = Math.max(0, Math.min(255, Number(m[2])));
    const b = Math.max(0, Math.min(255, Number(m[3])));
    return { r, g, b };
  }
  return null;
}

function resolveReadableTextColor(background: string | null | undefined): string {
  const rgb = background ? resolveRgb(background) : null;
  if (!rgb) return '#ffffff';

  const srgb = [rgb.r, rgb.g, rgb.b].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  const luminance = 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
  return luminance > 0.5 ? '#000000' : '#ffffff';
}

function getMatchSortMs(m: { matchDate?: string; matchTime?: string } | null | undefined): number {
  const md: any = (m as any)?.matchDate;
  let base: Date | null = null;

  if (md?.toDate && typeof md.toDate === 'function') {
    base = md.toDate();
  } else if (md instanceof Date) {
    base = md;
  } else if (typeof md === 'string') {
    const raw = md.trim();
    if (!raw) return Number.POSITIVE_INFINITY;
    const normalized = raw
      .replace(/\//g, '-')
      .replace(/^(\d{4})-(\d{1,2})-(\d{1,2})$/, (_m, y, mo, da) => `${y}-${String(mo).padStart(2, '0')}-${String(da).padStart(2, '0')}`);
    const iso = parseISO(normalized);
    base = isValid(iso) ? iso : new Date(normalized);
  }
  const baseMs = base instanceof Date && !Number.isNaN(base.getTime()) ? base.getTime() : Number.POSITIVE_INFINITY;

  const rawTime = typeof m?.matchTime === 'string' ? m.matchTime.trim() : '';
  const tm = rawTime.match(/^\s*(\d{1,2}):(\d{2})\s*$/);
  if (!tm) return baseMs;
  const hh = Math.min(23, Math.max(0, Number(tm[1])));
  const mm = Math.min(59, Math.max(0, Number(tm[2])));
  return baseMs + (hh * 60 + mm) * 60 * 1000;
}

function UpcomingMatchesCarousel({
  matches,
  mainTeamId,
  backgroundColor,
}: {
  matches: MatchDetails[];
  mainTeamId?: string | null;
  backgroundColor?: string | null;
}) {
  const list = (Array.isArray(matches) ? matches : []).filter(Boolean).slice(0, 3);
  if (list.length === 0) return null;

  const badgeBg = backgroundColor || '#991b1b';
  const badgeText = resolveReadableTextColor(badgeBg);

  return (
    <div className="w-full">
      <Carousel className="w-full">
        <CarouselContent className="-ml-4">
          {list.map((m) => {
            const matchDate = new Date(m.matchDate);
            const dateLabel = Number.isFinite(matchDate.getTime())
              ? format(matchDate, 'yyyy年M月d日(EEE)', { locale: ja })
              : '';
            const timeLabel = m.matchTime ? String(m.matchTime) : '';

            const isHome = Boolean(mainTeamId && m.homeTeam === mainTeamId);
            const opponentName = isHome ? m.awayTeamName : m.homeTeamName;
            const opponentLogo = isHome ? m.awayTeamLogo : m.homeTeamLogo;
            const isPracticeMatch = (m.competitionName || '').includes('練習試合');
            const roundNameText = (m.roundName || '').toString().trim();
            const isSingleRound = m.roundId === 'single' || roundNameText === '単発';

            return (
              <CarouselItem key={m.id} className="pl-4 basis-full">
                <div className="w-full px-0 sm:px-2">
                  <div className="w-full rounded-xl bg-gray-50 border border-black/5 shadow-sm overflow-hidden">
                    <div className="px-4 py-3 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        {m.competitionLogoUrl ? (
                          <Image
                            src={m.competitionLogoUrl}
                            alt=""
                            width={28}
                            height={28}
                            className="h-7 w-7 object-contain"
                          />
                        ) : (
                          <div className="h-7 w-7" />
                        )}
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-gray-900">今後の試合</div>
                          <div className="mt-0.5 text-sm font-semibold text-gray-700 truncate">
                            {dateLabel}{timeLabel ? ` ${timeLabel}` : ''}
                          </div>
                        </div>
                      </div>

                      <div
                        className="flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold"
                        style={{ backgroundColor: badgeBg, color: badgeText }}
                      >
                        {isHome ? 'H' : 'A'}
                      </div>
                    </div>

                    <div className="border-t" />

                    <div className="px-4 py-5 flex items-center gap-4">
                      {opponentLogo ? (
                        <Image
                          src={opponentLogo}
                          alt={opponentName}
                          width={72}
                          height={72}
                          className="h-[72px] w-[72px] rounded-full object-contain bg-white"
                        />
                      ) : (
                        <div className="h-[72px] w-[72px] rounded-full bg-gray-100" />
                      )}

                      <div className="min-w-0">
                        <div className="text-[11px] font-semibold text-gray-500 truncate">
                          {(m.competitionName || '').toString()}
                        </div>
                        <div className="mt-0.5 text-xl font-black leading-tight text-gray-900 truncate">
                          {opponentName}
                        </div>
                        {!isPracticeMatch && !isSingleRound && roundNameText ? (
                          <div className="mt-0.5 text-sm text-gray-600 truncate">
                            {roundNameText}
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="px-4 pb-4 flex justify-center">
                      <div className="rounded-full bg-red-600 text-white px-5 py-2 text-xs font-bold text-center opacity-40 grayscale cursor-not-allowed select-none">
                        チケット
                      </div>
                    </div>
                  </div>
                </div>
              </CarouselItem>
            );
          })}
        </CarouselContent>

        <CarouselPrevious className="absolute left-[-10px] sm:left-[-16px] top-1/2 -translate-y-1/2 z-10 bg-white/85 text-gray-900 border-none hover:bg-white" />
        <CarouselNext className="absolute right-[-10px] sm:right-[-16px] top-1/2 -translate-y-1/2 z-10 bg-white/85 text-gray-900 border-none hover:bg-white" />
      </Carousel>
    </div>
  );
}

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
    .filter((m) => m && typeof m === "object")
    .filter((m) => typeof (m as any).scoreHome === 'number' && typeof (m as any).scoreAway === 'number')
    .slice()
    .sort((a, b) => getMatchSortMs(a) - getMatchSortMs(b));
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
      <div className="flex gap-3 overflow-x-auto pb-2 md:grid md:grid-flow-col md:auto-cols-fr">
        {items.map((m) => {
          const opp = resolveOpponent(m);
          const href = `/${clubSlug}/matches/${m.competitionId}/${m.roundId}/${m.id}`;
          return (
            <Link key={m.id} href={href} className="flex-shrink-0 w-[110px] md:w-full md:min-w-[110px]">
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
            {match.roundId !== 'single' && (match.roundName || '').trim() ? (
              <p className="text-[10px] sm:text-xs text-muted-foreground truncate">{match.roundName || ''}</p>
            ) : null}
          </div>
        </div>
        <TeamDisplay logo={match.awayTeamLogo} name={match.awayTeamName} />
      </div>
    </div>
  );
}

interface MatchSectionProps {
  nextMatch: MatchDetails | null;
  upcomingMatches?: MatchDetails[];
  recentMatches?: MatchDetails[];
  mainTeamId?: string | null;
  clubSlug: string;
  backgroundColor?: string | null;
}

export function MatchSection({
  nextMatch,
  upcomingMatches = [],
  recentMatches = [],
  mainTeamId,
  clubSlug,
  backgroundColor,
}: MatchSectionProps) {
  const upcoming = (Array.isArray(upcomingMatches) ? upcomingMatches : []).slice(0, 3);
  return (
    <section className="pt-0 pb-8 md:pb-12">
      <div className="bg-gray-100 border border-black/5 rounded-lg shadow-sm p-4 md:p-6 w-full lg:min-h-[520px] flex flex-col">
        <h2 className="text-2xl md:text-3xl font-bold mb-4 text-center">MATCHES</h2>
        <RecentMatchesStrip matches={recentMatches} mainTeamId={mainTeamId} clubSlug={clubSlug} />
        <div className="mt-4">
          {upcoming.length > 0 ? (
            <UpcomingMatchesCarousel matches={upcoming} mainTeamId={mainTeamId} backgroundColor={backgroundColor} />
          ) : (
            <NextMatch match={nextMatch} />
          )}
        </div>
      </div>
    </section>
  );
}
