import { db } from "@/lib/firebase/admin";
import { notFound } from 'next/navigation';
import { PlayerList } from './player-list';

interface Player {
  id: string;
  name: string;
  number: number;
  position: string;
  photoUrl: string;
}

async function getPlayersData(clubId: string, season?: string): Promise<{ clubName: string, players: Player[], allSeasons: string[], activeSeason: string } | null> {
  let clubProfileDoc: FirebaseFirestore.DocumentSnapshot | undefined;

  // 1. Try to find the club profile by clubId field
  const profilesQuery = db.collection('club_profiles').where('clubId', '==', clubId);
  const profileSnap = await profilesQuery.get();

  if (!profileSnap.empty) {
    clubProfileDoc = profileSnap.docs[0];
  } else {
    // 2. Fallback: Try to find by using clubId as the document ID
    const directProfileRef = db.collection('club_profiles').doc(clubId);
    const directProfileSnap = await directProfileRef.get();
    if (directProfileSnap.exists) {
      clubProfileDoc = directProfileSnap;
    }
  }

  if (!clubProfileDoc) {
    return null; // Club not found
  }

  const profileData = clubProfileDoc.data()!;
  const ownerUid = clubProfileDoc.id; // Use the document ID as ownerUid
  const clubName = profileData.clubName || 'Unknown Club';

  if (!ownerUid) {
    return null;
  }

    // Get all seasons to display in the dropdown
  const seasonsRef = db.collection(`clubs/${ownerUid}/seasons`).where('isPublic', '==', true);
  const seasonsSnap = await seasonsRef.get();
  const allSeasons = seasonsSnap.docs.map(doc => doc.id).sort((a, b) => b.localeCompare(a));

  if (allSeasons.length === 0) {
    return { clubName, players: [], allSeasons: [], activeSeason: '' };
  }

  const activeSeason = season && allSeasons.includes(season) ? season : allSeasons[0];

  const playersRef = db.collection(`clubs/${ownerUid}/seasons/${activeSeason}/roster`).orderBy('number', 'asc');
  const snapshot = await playersRef.get();
  const players = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Player));

  return { clubName, players, allSeasons, activeSeason };
}

export default async function PlayersPage({ params, searchParams }: { params: { clubId: string }, searchParams: { [key: string]: string | string[] | undefined } }) {
  const { clubId } = params;
  const season = typeof searchParams.season === 'string' ? searchParams.season : undefined;

  if (clubId === 'admin') {
    notFound();
  }

  const data = await getPlayersData(clubId, season);

  if (!data) {
    notFound();
  }

  return <PlayerList {...data} clubId={clubId} />;
}
