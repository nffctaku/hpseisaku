import { db } from "@/lib/firebase/admin";
import { notFound } from 'next/navigation';
import { LeagueTable } from '@/components/league-table';

interface TablePageProps {
  params: { clubId: string };
}

async function getCompetitionsForClub(clubId: string) {
  const profileDocRef = db.collection('club_profiles').doc(clubId);
  const profileDocSnap = await profileDocRef.get();

  if (!profileDocSnap.exists) {
    return null;
  }

  const profileData = profileDocSnap.data();
  if (!profileData) {
    return null; // Should not happen due to the .exists check, but satisfies TypeScript
  }

  const ownerUid = profileData.ownerUid;
  const clubName = profileData.clubName || 'Unknown Club';

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

  return { clubName, competitions };
}

export default async function TablePage({ params: { clubId } }: TablePageProps) {
  const data = await getCompetitionsForClub(clubId);

  if (!data) {
    notFound();
  }

  return (
    <div className="container mx-auto py-10 px-4 md:px-0">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold">{data.clubName} 順位表</h1>
      </div>
      <LeagueTable competitions={data.competitions} />
    </div>
  );
}
