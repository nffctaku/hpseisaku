import { db } from "@/lib/firebase/admin"; // Use admin SDK for server-side fetching
import Link from 'next/link';
import Image from 'next/image';
import { MatchSchedule } from '@/components/match-schedule';

interface ClubProfile {
  id: string;
  clubName: string;
  emblemUrl?: string;
}

async function getClubs(): Promise<ClubProfile[]> {
  const clubsRef = db.collection("club_profiles");
  const querySnapshot = await clubsRef.get();
  
  if (querySnapshot.empty) {
    return [];
  }

  return querySnapshot.docs.map(doc => ({
    id: doc.id,
    clubName: doc.data().clubName,
    emblemUrl: doc.data().emblemUrl,
  }));
}

export default async function ClubsPage() {
  const clubs = await getClubs();

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
    <main className="container mx-auto px-4 py-8 flex-grow">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold tracking-tight">クラブを探す</h1>
        <p className="mt-2 text-lg text-muted-foreground">お気に入りのクラブを見つけて、ホームページをチェックしよう。</p>
      </div>

      {clubs.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
          {clubs.map((club) => (
            <Link href={`/${club.id}`} key={club.id} className="group block">
              <div className="aspect-square bg-card rounded-lg border shadow-sm transition-all duration-300 ease-in-out group-hover:shadow-md group-hover:-translate-y-1">
                <div className="relative h-full w-full flex items-center justify-center p-4">
                  <Image
                    src={club.emblemUrl || '/placeholder-emblem.svg'}
                    alt={`${club.clubName} Emblem`}
                    width={128}
                    height={128}
                    className="object-contain h-32 w-32 transition-transform duration-300 group-hover:scale-110"
                  />
                </div>
              </div>
              <h2 className="mt-3 text-lg font-semibold text-center truncate">{club.clubName}</h2>
            </Link>
          ))}
        </div>
      ) : (
        <div className="text-center py-16 border-2 border-dashed rounded-lg">
          <p className="text-muted-foreground">まだ登録されているクラブがありません。</p>
          <p className="mt-2">最初のクラブを登録しませんか？</p>
        </div>
      )}

      <div className="mt-16">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold tracking-tight">試合日程</h2>
          <p className="mt-2 text-lg text-muted-foreground">最新の試合情報をチェックしよう。</p>
        </div>
        <MatchSchedule />
      </div>

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
        <p>&copy; {new Date().getFullYear()} Your Club Site. All rights reserved.</p>
      </footer>
    </div>
  );
}
