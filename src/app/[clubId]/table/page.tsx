import { db } from "@/lib/firebase/admin";
import { notFound } from 'next/navigation';
import { LeagueTable } from '@/components/league-table';
import { ClubHeader } from '@/components/club-header';
import { ClubFooter } from '@/components/club-footer';
import { SeasonSelect } from "./season-select";

interface TablePageProps {
  params: { clubId: string };
  searchParams: { [key: string]: string | string[] | undefined };
}

async function getCompetitionsForClub(clubId: string) {
  let profileDoc: FirebaseFirestore.DocumentSnapshot | null = null;

  // 1. Try to resolve club_profiles by clubId field
  const profilesQuery = db.collection('club_profiles').where('clubId', '==', clubId).limit(1);
  const profilesSnap = await profilesQuery.get();

  if (!profilesSnap.empty) {
    profileDoc = profilesSnap.docs[0];
  } else {
    // 2. Fallback: use clubId as the document ID
    const directRef = db.collection('club_profiles').doc(clubId);
    const directSnap = await directRef.get();
    if (directSnap.exists) {
      profileDoc = directSnap;
    }
  }

  if (!profileDoc) {
    return null;
  }

  const profileData = profileDoc.data();
  if (!profileData) {
    return null;
  }

  const ownerUid = (profileData as any).ownerUid || profileDoc.id;
  const clubName = (profileData as any).clubName || 'Unknown Club';
  const logoUrl = (profileData as any).logoUrl || null;
  const homeBgColor = (profileData as any).homeBgColor || null;
  const sponsors = (profileData as any).sponsors || [];
  const snsLinks = (profileData as any).snsLinks || {};
  const legalPages = (profileData as any).legalPages || [];
  const gameTeamUsage = Boolean((profileData as any).gameTeamUsage);

  if (!ownerUid) {
    return null;
  }

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
    <main
      className="min-h-screen"
      style={homeBgColor ? { backgroundColor: homeBgColor } : undefined}
    >
      <ClubHeader clubId={clubId} clubName={clubName} logoUrl={logoUrl} />
      <div className="container mx-auto py-10 px-4 md:px-0">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold">順位表</h1>
          </div>
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
              <LeagueTable competitions={[comp]} variant="table" />
            </div>
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
