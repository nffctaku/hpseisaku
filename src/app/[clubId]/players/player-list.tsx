"use client";

import { useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// This interface needs to be in sync with the one in page.tsx
interface Player {
  id: string;
  name: string;
  number: number;
  position: string;
  photoUrl?: string;
}

export function PlayerList({ clubId, clubName, players, allSeasons, activeSeason, accentColor }: {
  clubId: string;
  clubName: string;
  players: Player[];
  allSeasons: string[];
  activeSeason: string;
  accentColor?: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [activeTab, setActiveTab] = useState<'players' | 'staff'>('players');
  const [seasonPickerOpen, setSeasonPickerOpen] = useState(false);

  const baseTabBtn = useMemo(
    () =>
      "flex-1 min-w-0 px-2 py-1.5 text-[10px] font-semibold whitespace-nowrap text-center transition-colors",
    []
  );

  const handleSeasonChange = (season: string) => {
    router.push(`${pathname}?season=${season}`);
    setSeasonPickerOpen(false);
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
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {allSeasons.length > 0 && (
            <div className="w-full sm:w-auto sm:ml-auto">
              <button
                type="button"
                onClick={() => setSeasonPickerOpen((v) => !v)}
                className="w-full h-8 px-3 text-xs rounded-xl bg-white/5 text-white border border-white/15 hover:bg-white/10 sm:w-[180px] sm:h-9 sm:text-sm"
              >
                シーズン
              </button>

              {seasonPickerOpen && (
                <div className="mt-2">
                  <Select value={activeSeason} onValueChange={handleSeasonChange}>
                    <SelectTrigger className="w-full h-8 px-3 text-xs rounded-xl bg-background text-foreground border border-border sm:h-9 sm:text-sm dark:bg-white/5 dark:text-white dark:border-white/15">
                      <SelectValue placeholder="シーズン" />
                    </SelectTrigger>
                    <SelectContent>
                      {allSeasons.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="mt-2 overflow-hidden rounded-xl border border-white/15 bg-white/5">
                <div className="flex items-stretch">
                  <button
                    type="button"
                    onClick={() => setActiveTab('players')}
                    className={
                      activeTab === 'players'
                        ? `${baseTabBtn} bg-blue-600 text-white`
                        : `${baseTabBtn} text-white/90 hover:bg-white/10`
                    }
                  >
                    選手
                  </button>
                  <div className="w-px bg-white/15" aria-hidden="true" />
                  <button
                    type="button"
                    onClick={() => setActiveTab('staff')}
                    className={
                      activeTab === 'staff'
                        ? `${baseTabBtn} bg-blue-600 text-white`
                        : `${baseTabBtn} text-white/90 hover:bg-white/10`
                    }
                  >
                    スタッフ
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {activeTab === 'staff' ? (
        <div className="py-10 text-center text-sm text-muted-foreground">スタッフ一覧は準備中です。</div>
      ) : players.length > 0 ? (
        <div className="space-y-12">
          {Object.entries(sortedGroupedPlayers).map(([position, players]) => (
            <section key={position}>
              <h2 className="text-2xl font-bold border-b-2 border-white pb-2 mb-6 text-white">{position}</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-x-2 gap-y-2 sm:gap-4">
                {players.map(player => (
                  <Link href={`/${clubId}/players/${player.id}${activeSeason ? `?season=${activeSeason}` : ''}`} key={player.id} className="block">
                    <div className="rounded-xl border bg-white shadow-md overflow-hidden hover:shadow-lg transition-shadow">
                      <div className="relative w-full h-52 sm:h-52 md:h-60 bg-gray-100">
                        {player.photoUrl ? (
                          <Image
                            src={player.photoUrl}
                            alt={player.name}
                            fill
                            sizes="(max-width: 768px) 50vw, 25vw"
                            className="object-cover"
                          />
                        ) : (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <span
                              className={`text-5xl font-black tracking-tighter ${accentColor ? '' : 'text-gray-700'}`}
                              style={accentColor ? { color: accentColor } : undefined}
                            >
                              {player.number}
                            </span>
                          </div>
                        )}

                        <div className="absolute left-0 right-0 bottom-0 h-20 bg-gradient-to-t from-black/85 via-black/35 to-transparent" />

                        <div className="absolute top-4 left-4">
                          <div
                            className={`text-base font-semibold leading-none ${accentColor ? '' : 'text-white'}`}
                            style={accentColor ? { color: accentColor } : undefined}
                          >
                            {player.number}
                          </div>
                          <div
                            className={`h-1 w-6 mt-2 ${accentColor ? '' : 'bg-white'}`}
                            style={accentColor ? { backgroundColor: accentColor } : undefined}
                          />
                        </div>

                        <div className="absolute left-4 right-4 bottom-4">
                          <h3 className="text-white text-xl sm:text-2xl md:text-3xl font-black tracking-tight leading-none drop-shadow-sm break-words">
                            {player.name}
                          </h3>
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <p>{allSeasons.length === 0 ? "公開されているシーズンはありません。" : "このシーズンに登録されている選手はいません。"}</p>
      )}
    </div>
  );
}
