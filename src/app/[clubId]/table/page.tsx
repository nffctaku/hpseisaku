import { db } from "@/lib/firebase/admin";
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { LeagueTable } from '@/components/league-table';
import { ClubHeader } from '@/components/club-header';
import { ClubFooter } from '@/components/club-footer';
import { SeasonSelect } from "./season-select";
import { resolvePublicClubProfile } from "@/lib/public-club-profile";
import { lightenColor } from "@/lib/utils";

interface TablePageProps {
  params: { clubId: string };
  searchParams: { [key: string]: string | string[] | undefined };
}

async function getCompetitionsForClub(clubId: string) {
  const resolved = await resolvePublicClubProfile(clubId);
  if (!resolved) return null;
  if (resolved.displaySettings.menuShowTable === false) return null;

  const profileData = resolved.profileData as any;
  const ownerUid = resolved.ownerUid;
  const clubName = (profileData as any).clubName || 'Unknown Club';
  const logoUrl = (profileData as any).logoUrl || null;
  const homeBgColor = (profileData as any).homeBgColor || null;
  const sponsors = (profileData as any).sponsors || [];
  const snsLinks = (profileData as any).snsLinks || {};
  const legalPages = (profileData as any).legalPages || [];
  const gameTeamUsage = Boolean((profileData as any).gameTeamUsage);

  const competitionsQuery = db.collection(`clubs/${ownerUid}/competitions`);
  const competitionsSnap = await competitionsQuery.get();
  const competitions = competitionsSnap.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id,
      ownerUid: ownerUid,
      name: data.name || 'Unnamed Competition',
      ...data
    };
  });

  return { clubName, competitions, logoUrl, homeBgColor, sponsors, snsLinks, legalPages, gameTeamUsage };
}

export default async function TablePage({ params: { clubId }, searchParams }: TablePageProps) {
  const data = await getCompetitionsForClub(clubId);

  if (!data) {
    notFound();
  }

  const { competitions, clubName, logoUrl, homeBgColor, sponsors, snsLinks, legalPages, gameTeamUsage } = data as any;

  const eligibleCompetitions = (competitions as any[]).filter((c) => {
    const format = (c as any).format;
    return format === 'league' || format === 'league_cup';
  });

  const showOnTableCompetitions = eligibleCompetitions.filter((c) => (c as any).showOnTable);
  const showOnHomeCompetitions = eligibleCompetitions.filter((c) => (c as any).showOnHome);

  const activeCompetitions = showOnTableCompetitions.length > 0
    ? showOnTableCompetitions
    : showOnHomeCompetitions;

  const competitionsToRender = activeCompetitions.length > 0 ? activeCompetitions : eligibleCompetitions;

  const seasons = Array.from(
    new Set(
      competitionsToRender
        .map((c: any) => c.season)
        .filter((s: any) => typeof s === 'string' && s.length > 0)
    )
  ).sort((a, b) => String(b).localeCompare(String(a)));

  const requestedSeason = typeof searchParams.season === 'string' ? searchParams.season : undefined;
  const activeSeason = requestedSeason && seasons.includes(requestedSeason)
    ? requestedSeason
    : (seasons[0] || '');

  const seasonCompetitions = activeSeason
    ? competitionsToRender.filter((c: any) => c.season === activeSeason)
    : competitionsToRender;

  const requestedCompetition = typeof searchParams.competition === 'string' ? searchParams.competition : 'all';
  const activeCompetitionId = requestedCompetition && seasonCompetitions.some((c: any) => c.id === requestedCompetition)
    ? requestedCompetition
    : 'all';
  const filteredCompetitions = activeCompetitionId === 'all'
    ? seasonCompetitions
    : seasonCompetitions.filter((c: any) => c.id === activeCompetitionId);

  const backgroundColor = homeBgColor || '#FFF5E6';
  const themeColor = homeBgColor || '#8A1E24';

  const isDarkBackground = (color: string) => {
    const hex = color.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness < 128;
  };

  const textColor = isDarkBackground(backgroundColor) ? '#FFFFFF' : '#0B1410';
  const textColorMuted = isDarkBackground(backgroundColor) ? 'rgba(255, 255, 255, 0.55)' : 'rgba(11, 20, 16, 0.55)';

  const buildCompetitionHref = (competitionId: string) => {
    const params = new URLSearchParams();
    if (activeSeason) params.set('season', activeSeason);
    if (competitionId !== 'all') params.set('competition', competitionId);
    const query = params.toString();
    return `/${clubId}/table${query ? `?${query}` : ''}`;
  };

  return (
    <main className="min-h-screen" style={{
      backgroundColor: backgroundColor
    }}>
      <ClubHeader clubId={clubId} clubName={clubName} logoUrl={logoUrl} headerBackgroundColor={homeBgColor} />
      <div className="mx-auto w-full max-w-[1320px] px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
        <div className="mb-6 sm:mb-8">
          <h1 className="text-3xl font-black tracking-[0.08em] sm:text-5xl" style={{ color: textColor }}>順位表</h1>
          <p className="mt-2 text-xs font-bold tracking-[0.28em]" style={{ color: textColorMuted }}>LEAGUE TABLE</p>
          <div className="mt-4 h-1 w-12 rounded-full" style={{ backgroundColor: themeColor }} />
        </div>

        <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          {seasons.length > 0 && (
            <SeasonSelect seasons={seasons} activeSeason={activeSeason} />
          )}

          {seasonCompetitions.length > 1 && (
            <div className="flex gap-2 overflow-x-auto rounded-xl border border-[#0B1410]/10 bg-white/75 p-1 shadow-sm lg:min-w-[520px] lg:justify-end">
              {seasonCompetitions.map((comp: any) => {
                const isActive = activeCompetitionId === comp.id;
                return (
                  <Link
                    key={comp.id}
                    href={buildCompetitionHref(comp.id)}
                    className="shrink-0 rounded-lg px-5 py-2 text-xs font-bold transition-colors"
                    style={isActive ? { backgroundColor: themeColor, color: '#fff' } : { color: '#0B1410' }}
                  >
                    {comp.name}
                  </Link>
                );
              })}
              <Link
                href={buildCompetitionHref('all')}
                className="shrink-0 rounded-lg px-5 py-2 text-xs font-bold transition-colors"
                style={activeCompetitionId === 'all' ? { backgroundColor: themeColor, color: '#fff' } : { color: '#0B1410' }}
              >
                すべての大会
              </Link>
            </div>
          )}
        </div>

        <div className="space-y-10">
          {filteredCompetitions.map((comp: any) => (
            <section key={comp.id} className="space-y-3">
              <div className="flex items-baseline gap-3">
                <h2 className="text-xl font-black tracking-tight sm:text-2xl" style={{ color: textColor }}>{comp.name}</h2>
                {comp.season ? <span className="text-sm font-bold" style={{ color: textColorMuted }}>({comp.season})</span> : null}
              </div>
              <LeagueTable clubId={clubId} competitions={[comp]} variant="table" colorTheme="light" themeColor={themeColor} currentClubName={clubName} />
            </section>
          ))}
        </div>
      </div>

      <ClubFooter
        clubId={clubId}
        clubName={clubName}
        sponsors={sponsors}
        snsLinks={snsLinks}
        legalPages={legalPages}
        gameTeamUsage={Boolean(gameTeamUsage)}
      />
    </main>
  );
}
