import { db } from "@/lib/firebase/admin";
import { notFound } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';

interface PlayerPageProps {
  params: { clubId: string; playerId: string };
}

interface PlayerStats {
  appearances: number;
  minutes: number;
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
}

interface PlayerData {
  name: string;
  number: number;
  position: string;
  photoUrl?: string;
  height?: number;
  age?: number;
  profile?: string;
  nationality?: string;
}

async function getPlayerStats(ownerUid: string, playerId: string): Promise<PlayerStats> {
  const aggregatedStats: PlayerStats = { appearances: 0, minutes: 0, goals: 0, assists: 0, yellowCards: 0, redCards: 0 };

  const competitionsRef = db.collection(`clubs/${ownerUid}/competitions`);
  const competitionsSnap = await competitionsRef.get();

  for (const competitionDoc of competitionsSnap.docs) {
    const roundsRef = competitionDoc.ref.collection('rounds');
    const roundsSnap = await roundsRef.get();

    for (const roundDoc of roundsSnap.docs) {
      const matchesRef = roundDoc.ref.collection('matches');
      const matchesSnap = await matchesRef.get();

      for (const matchDoc of matchesSnap.docs) {
        const matchData = matchDoc.data();
        if (matchData.playerStats && Array.isArray(matchData.playerStats)) {
          const playerStat = matchData.playerStats.find(stat => stat.playerId === playerId);
          if (playerStat) {
            const minutesPlayed = Number(playerStat.minutesPlayed) || 0;
            aggregatedStats.appearances += minutesPlayed > 0 ? 1 : 0;
            aggregatedStats.minutes += minutesPlayed;
            aggregatedStats.goals += Number(playerStat.goals) || 0;
            aggregatedStats.assists += Number(playerStat.assists) || 0;
            aggregatedStats.yellowCards += Number(playerStat.yellowCards) || 0;
            aggregatedStats.redCards += Number(playerStat.redCards) || 0;
          }
        }
      }
    }
  }

  return aggregatedStats;
}

async function getPlayer(clubId: string, playerId: string): Promise<{ clubName: string, player: PlayerData, ownerUid: string } | null> {
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

  const ownerUid = clubProfileDoc.id; // Use the document ID as ownerUid
  const clubName = clubProfileDoc.data()!.clubName;
  const playerRef = db.collection(`clubs/${ownerUid}/players`).doc(playerId);
  const playerSnap = await playerRef.get();

  if (!playerSnap.exists) {
    return null; // Player not found
  }

  return { clubName, player: playerSnap.data() as PlayerData, ownerUid };
}

export default async function PlayerPage({ params }: { params: Promise<{ clubId: string; playerId: string }> }) {
  const { clubId, playerId } = await params;
  const result = await getPlayer(clubId, playerId);

  if (!result) {
    notFound();
  }

  const { clubName, player, ownerUid } = result;
  const stats = await getPlayerStats(ownerUid, playerId);

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <Link href={`/${clubId}/players`} className="text-sm text-muted-foreground hover:underline">
          &larr; 選手一覧に戻る
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="md:col-span-1">
          <div className="relative aspect-[4/5] bg-gray-800 rounded-lg overflow-hidden">
            <Image
              src={player.photoUrl || '/placeholder-person.svg'}
              alt={player.name}
              fill
              className="object-cover"
            />
          </div>
        </div>
        <div className="md:col-span-2">
          <p className="text-7xl font-black text-primary tracking-tighter">{player.number}</p>
          <h1 className="text-5xl font-bold uppercase mt-2">{player.name}</h1>
          {player.nationality && <p className="text-xl text-muted-foreground mt-2">{player.nationality}</p>}
          <p className="text-2xl text-muted-foreground mt-1">{player.position}</p>
          
          <div className="mt-8 grid grid-cols-2 gap-4 text-center">
            <div className="border rounded-lg p-4">
              <p className="text-sm text-muted-foreground">身長</p>
              <p className="text-2xl font-bold">{player.height ? `${player.height} cm` : 'N/A'}</p>
            </div>
            <div className="border rounded-lg p-4">
              <p className="text-sm text-muted-foreground">年齢</p>
              <p className="text-2xl font-bold">{player.age ? `${player.age} 歳` : 'N/A'}</p>
            </div>
          </div>

          {player.profile && (
            <div className="mt-8">
              <h2 className="text-xl font-bold">プロフィール</h2>
              <p className="mt-2 text-muted-foreground whitespace-pre-wrap">{player.profile}</p>
            </div>
          )}

          {/* Stats Section */}
          <div className="mt-8">
            <h2 className="text-xl font-bold mb-4">シーズンスタッツ</h2>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-4 text-center">
              <div className="border rounded-lg p-3">
                <p className="text-sm text-muted-foreground">出場</p>
                <p className="text-2xl font-bold">{stats.appearances}</p>
              </div>
              <div className="border rounded-lg p-3">
                <p className="text-sm text-muted-foreground">時間</p>
                <p className="text-2xl font-bold">{stats.minutes}</p>
              </div>
              <div className="border rounded-lg p-3">
                <p className="text-sm text-muted-foreground">ゴール</p>
                <p className="text-2xl font-bold">{stats.goals}</p>
              </div>
              <div className="border rounded-lg p-3">
                <p className="text-sm text-muted-foreground">アシスト</p>
                <p className="text-2xl font-bold">{stats.assists}</p>
              </div>
              <div className="border rounded-lg p-3">
                <p className="text-sm text-muted-foreground">警告</p>
                <p className="text-2xl font-bold">{stats.yellowCards}</p>
              </div>
              <div className="border rounded-lg p-3">
                <p className="text-sm text-muted-foreground">退場</p>
                <p className="text-2xl font-bold">{stats.redCards}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
