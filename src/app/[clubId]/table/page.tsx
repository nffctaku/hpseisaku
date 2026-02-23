import { db } from "@/lib/firebase/admin";
import { notFound } from 'next/navigation';
import { LeagueTable } from '@/components/league-table';
import { ClubHeader } from '@/components/club-header';
import { ClubFooter } from '@/components/club-footer';
import { PartnerStripClient } from "@/components/partner-strip-client";
import { SeasonSelect } from "./season-select";
import { resolvePublicClubProfile } from "@/lib/public-club-profile";

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

  const filteredCompetitions = activeSeason
    ? competitionsToRender.filter((c: any) => c.season === activeSeason)
    : competitionsToRender;

  return (
    <main className="min-h-screen bg-white">
      <ClubHeader clubId={clubId} clubName={clubName} logoUrl={logoUrl} headerBackgroundColor={homeBgColor} />
      <div className="container mx-auto py-10 px-4 md:px-0">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-8">
          {seasons.length > 0 && (
            <SeasonSelect seasons={seasons} activeSeason={activeSeason} />
          )}
        </div>

        <div className="space-y-10">
          {filteredCompetitions.map((comp: any) => (
            <div key={comp.id} className="space-y-3">
              <div className="flex items-end justify-between gap-4">
                <div className="font-semibold">
                  {comp.name}
                  {comp.season ? <span className="text-sm text-muted-foreground ml-2">({comp.season})</span> : null}
                </div>
              </div>
              <LeagueTable clubId={clubId} competitions={[comp]} variant="table" />
            </div>
          ))}
        </div>
      </div>
      <PartnerStripClient clubId={clubId} />
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
