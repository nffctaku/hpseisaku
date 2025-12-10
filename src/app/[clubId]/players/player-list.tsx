"use client";

import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// This interface needs to be in sync with the one in page.tsx
interface Player {
  id: string;
  name: string;
  number: number;
  position: string;
}

export function PlayerList({ clubId, clubName, players, allSeasons, activeSeason }: {
  clubId: string;
  clubName: string;
  players: Player[];
  allSeasons: string[];
  activeSeason: string;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const handleSeasonChange = (season: string) => {
    router.push(`${pathname}?season=${season}`);
  };

  const groupedPlayers = players.reduce((acc, player) => {
    const { position } = player;
    if (!acc[position]) {
      acc[position] = [];
    }
    acc[position].push(player);
    return acc;
  }, {} as Record<string, Player[]>);

  const positionOrder = ['GK', 'DF', 'MF', 'FW'];
  const sortedGroupedPlayers = positionOrder.reduce((acc, position) => {
    if (groupedPlayers[position]) {
      acc[position] = groupedPlayers[position];
    }
    return acc;
  }, {} as Record<string, Player[]>);


  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <Link href={`/${clubId}`} className="text-sm text-muted-foreground hover:underline">
          &larr; {clubName}のページに戻る
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mt-2">
          <h1 className="text-4xl font-bold tracking-tight">選手一覧</h1>
          {allSeasons.length > 0 && (
            <Select value={activeSeason} onValueChange={handleSeasonChange}>
              <SelectTrigger className="w-full sm:w-[180px] mt-4 sm:mt-0 bg-white text-gray-900">
                <SelectValue placeholder="シーズンを選択" />
              </SelectTrigger>
              <SelectContent>
                {allSeasons.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {players.length > 0 ? (
        <div className="space-y-12">
          {Object.entries(sortedGroupedPlayers).map(([position, players]) => (
            <section key={position}>
              <h2 className="text-2xl font-bold border-b-2 border-primary pb-2 mb-6">{position}</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {players.map(player => (
                  <Link href={`/${clubId}/players/${player.id}`} key={player.id} className="block">
                    <div className="aspect-square rounded-xl border bg-white shadow-md flex flex-col items-center justify-center p-4 hover:shadow-lg transition-shadow">
                      <p className="text-4xl font-black tracking-tighter text-gray-900">{player.number}</p>
                      <h3 className="mt-2 text-lg font-semibold text-center break-words text-gray-900">{player.name}</h3>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <p>このシーズンに登録されている選手はいません。</p>
      )}
    </div>
  );
}
