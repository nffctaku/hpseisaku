import { db } from "@/lib/firebase/admin";
import Link from 'next/link';
import type { QuerySnapshot, DocumentData, Timestamp } from 'firebase-admin/firestore';

interface ClubProfile {
  id: string;
  clubId: string;
  clubName: string;
  logoUrl?: string;
  lastLoginAt?: Timestamp;
  createdAt?: Timestamp;
  mainTeamId?: string;
}

async function getClubs(): Promise<ClubProfile[]> {
  const clubsRef = db.collection("club_profiles");
  let querySnapshot: QuerySnapshot<DocumentData>;
  try {
    querySnapshot = await clubsRef
      .where('directoryListed', '==', true)
      .orderBy('lastLoginAt', 'desc')
      .limit(60)
      .get();
  } catch (e) {
    querySnapshot = await clubsRef.where('directoryListed', '==', true).limit(200).get();
  }
  
  if (querySnapshot.empty) {
    return [];
  }

  const base = querySnapshot.docs
    .map((doc) => {
      const data = doc.data() as any;
      const ownerUid = (data?.ownerUid as string) || doc.id;
      const clubId = (data?.clubId as string) || '';
      const mainTeamId = typeof data?.mainTeamId === 'string' ? (data.mainTeamId as string) : undefined;
      const logoUrl =
        (data?.logoUrl as string) ||
        (data?.emblemUrl as string) ||
        (data?.photoURL as string) ||
        undefined;

      return {
        id: ownerUid,
        clubId,
        clubName: (data?.clubName as string) || '',
        logoUrl,
        lastLoginAt: data?.lastLoginAt as Timestamp | undefined,
        createdAt: data?.createdAt as Timestamp | undefined,
        mainTeamId,
      } as ClubProfile;
    })
    .filter((c) => typeof c.clubId === 'string' && c.clubId.trim().length > 0);

  const resolved = await Promise.all(
    base.map(async (c) => {
      const sanitize = (v: unknown): string | undefined => {
        if (typeof v !== 'string') return undefined;
        const s = v.trim();
        if (!s) return undefined;
        if (s.startsWith('http://') || s.startsWith('https://') || s.startsWith('/')) return s;
        return undefined;
      };

      try {
        let teamLogo: string | undefined;
        if (c.mainTeamId) {
          const teamSnap = await db.doc(`clubs/${c.id}/teams/${c.mainTeamId}`).get();
          if (teamSnap.exists) {
            const teamData = teamSnap.data() as any;
            teamLogo = sanitize(teamData?.logoUrl);
          }
        }

        const clubSnap = await db.collection('clubs').doc(c.id).get();
        const clubData = clubSnap.exists ? ((clubSnap.data() as any) || {}) : {};
        const clubLogo = sanitize(clubData?.logoUrl);

        return {
          ...c,
          logoUrl: teamLogo || sanitize(c.logoUrl) || clubLogo || undefined,
        };
      } catch {
        return {
          ...c,
          logoUrl: sanitize(c.logoUrl) || undefined,
        };
      }
    })
  );

  const listed = resolved.filter((c) => Boolean(c.logoUrl)).slice();

  listed.sort((a, b) => {
    const ad = a.lastLoginAt?.toDate ? a.lastLoginAt.toDate() : a.createdAt?.toDate ? a.createdAt.toDate() : null;
    const bd = b.lastLoginAt?.toDate ? b.lastLoginAt.toDate() : b.createdAt?.toDate ? b.createdAt.toDate() : null;
    const at = ad instanceof Date ? ad.getTime() : 0;
    const bt = bd instanceof Date ? bd.getTime() : 0;
    return bt - at;
  });

  return listed.slice(0, 60);
}

function toCloudinaryPaddedSquare(url: string, width: number) {
  if (!url) return url;
  if (!url.includes('/image/upload/')) return url;
  return url.replace('/image/upload/', `/image/upload/c_pad,ar_1:1,w_${width},b_auto,f_auto,q_auto/`);
}

export default async function ClubsPage() {
  const clubs = await getClubs();

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <main className="container mx-auto px-4 py-8 flex-grow">
        <div className="text-center mb-10">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">クラブHP一覧</h1>
          <p className="mt-2 text-base sm:text-lg text-muted-foreground">
            掲載を許可したクラブHPを、最新ログイン順で表示します。
          </p>
        </div>

        {clubs.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {clubs.map((club) => {
              const dt = club.lastLoginAt?.toDate ? club.lastLoginAt.toDate() : club.createdAt?.toDate ? club.createdAt.toDate() : null;
              const isNew = dt ? Date.now() - dt.getTime() <= 5 * 24 * 60 * 60 * 1000 : false;
              const imageSrc = club.logoUrl || '/placeholder-emblem.svg';
              const displayImage = imageSrc.includes('/image/upload/') ? toCloudinaryPaddedSquare(imageSrc, 600) : imageSrc;

              return (
                <Link href={`/${club.clubId}`} key={club.clubId} className="block group">
                  <div className="bg-white text-gray-900 rounded-lg overflow-hidden shadow-md h-full flex flex-col border">
                    <div className="relative w-full aspect-square bg-muted flex items-center justify-center p-6">
                      <img
                        src={displayImage}
                        alt={club.clubName}
                        className="max-h-full max-w-full object-contain"
                        loading="lazy"
                      />
                    </div>
                    <div className="p-4 flex-grow flex flex-col">
                      <div className="flex items-center mb-2">
                        {isNew && (
                          <span className="inline-flex items-center rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold text-white">
                            NEW
                          </span>
                        )}
                      </div>
                      <h2 className="text-card-foreground font-bold text-lg leading-tight flex-grow group-hover:underline">
                        {club.clubName}
                      </h2>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-16 border-2 border-dashed rounded-lg">
            <p className="text-muted-foreground">掲載中のクラブがありません。</p>
          </div>
        )}
      </main>
      <footer className="p-4 md:p-6 text-center text-muted-foreground text-sm">
        <div className="flex justify-center items-center space-x-6 mb-4">
          <Link href="/terms" className="hover:text-primary transition-colors">
            利用規約
          </Link>
          <Link href="/privacy" className="hover:text-primary transition-colors">
            プライバシーポリシー
          </Link>
        </div>
        <p>&copy; {new Date().getFullYear()} FootChron</p>
      </footer>
    </div>
  );
}
