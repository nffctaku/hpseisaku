import { db } from "@/lib/firebase/admin";
import { notFound } from 'next/navigation';
import { LeagueTable } from '@/components/league-table';
import { ClubHeader } from '@/components/club-header';

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

  // Collect available seasons (unique, sorted descending if possible)
  const seasons = Array.from(
    new Set(
      competitions
        .map((c: any) => c.season)
        .filter((s: any) => typeof s === 'string' && s.length > 0)
    )
  ).sort((a, b) => String(b).localeCompare(String(a)));

  return { clubName, competitions, seasons, logoUrl };
}

export default async function TablePage({ params: { clubId }, searchParams }: TablePageProps) {
  const data = await getCompetitionsForClub(clubId);

  if (!data) {
    notFound();
  }

  const { competitions, clubName, seasons, logoUrl } = data as any;

  const requestedSeason = typeof searchParams.season === 'string' ? searchParams.season : undefined;
  const activeSeason = requestedSeason && seasons.includes(requestedSeason)
    ? requestedSeason
    : (seasons[0] || '');

  const filteredCompetitions = activeSeason
    ? competitions.filter((c: any) => c.season === activeSeason)
    : competitions;

  return (
    <>
      <ClubHeader clubId={clubId} clubName={clubName} logoUrl={logoUrl} />
      <div className="container mx-auto py-10 px-4 md:px-0">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold">{clubName} 順位表</h1>
        </div>
        {seasons.length > 0 && (
          <form className="flex items-center gap-2 text-sm" action="" method="get">
            <label className="text-muted-foreground" htmlFor="season-select">シーズン</label>
            <select
              id="season-select"
              name="season"
              defaultValue={activeSeason}
              className="border rounded-md px-2 py-1 bg-background text-foreground text-sm"
            >
              {seasons.map((season: string) => (
                <option key={season} value={season}>{season}</option>
              ))}
            </select>
          </form>
        )}
      </div>
      <LeagueTable competitions={filteredCompetitions} />
    </div>
    </>
  );
}
