import { db, getOwnerUidByClubId } from "@/lib/firebase/admin";
import { notFound } from 'next/navigation';

interface ClubInfoPageProps {
  params: { clubId: string };
}

async function getClubInfo(clubId: string) {
  const profilesQuery = db.collection('club_profiles').where('clubId', '==', clubId).limit(1);
  const profilesSnap = await profilesQuery.get();

  if (profilesSnap.empty) {
    return null;
  }

  return profilesSnap.docs[0].data();
}

export default async function ClubInfoPage({ params }: ClubInfoPageProps) {
  const clubId = params.clubId;

  // Prevent this route from handling '/admin' paths
  if (clubId === 'admin') {
    notFound();
  }

  const clubInfo = await getClubInfo(clubId);

  if (!clubInfo) {
    notFound();
  }

  return (
    <div className="container mx-auto py-10">
      <h1 className="text-3xl font-bold">{clubInfo.clubName}</h1>
      <p className="mt-4 text-muted-foreground">クラブ情報ページは現在準備中です。</p>
    </div>
  );
}
