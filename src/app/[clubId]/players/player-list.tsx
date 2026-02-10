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

interface Staff {
  id: string;
  name: string;
  position?: string;
  nationality?: string;
  age?: number;
  profile?: string;
  photoUrl?: string;
}

export function PlayerList({ clubId, clubName, players, staff, allSeasons, activeSeason, accentColor }: {
  clubId: string;
  clubName: string;
  players: Player[];
  staff: Staff[];
  allSeasons: string[];
  activeSeason: string;
  accentColor?: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [activeTab, setActiveTab] = useState<'players' | 'staff'>('players');
  const [seasonPickerOpen, setSeasonPickerOpen] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<Staff | null>(null);

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
                className="w-full h-8 px-3 text-xs rounded-xl bg-background/90 text-foreground border border-border hover:bg-background shadow-sm shadow-black/10 sm:w-[180px] sm:h-9 sm:text-sm dark:bg-white/5 dark:text-white dark:border-white/15 dark:hover:bg-white/10 dark:shadow-black/15"
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

              <div className="mt-2 overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-sm shadow-black/10 dark:border-white/15 dark:bg-white/5 dark:shadow-black/15">
                <div className="flex items-stretch">
                  <button
                    type="button"
                    onClick={() => setActiveTab('players')}
                    className={
                      activeTab === 'players'
                        ? `${baseTabBtn} bg-blue-600 text-white`
                        : `${baseTabBtn} text-foreground/90 hover:bg-muted dark:text-white/90 dark:hover:bg-white/10`
                    }
                  >
                    選手
                  </button>
                  <div className="w-px bg-border dark:bg-white/15" aria-hidden="true" />
                  <button
                    type="button"
                    onClick={() => setActiveTab('staff')}
                    className={
                      activeTab === 'staff'
                        ? `${baseTabBtn} bg-blue-600 text-white`
                        : `${baseTabBtn} text-foreground/90 hover:bg-muted dark:text-white/90 dark:hover:bg-white/10`
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
        staff.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-x-2 gap-y-2 sm:gap-4">
            {staff.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSelectedStaff(s)}
                className="rounded-xl border border-border bg-card text-card-foreground shadow-sm overflow-hidden text-left"
              >
                <div className="relative w-full h-40 sm:h-44 bg-muted">
                  {s.photoUrl ? (
                    <Image
                      src={s.photoUrl}
                      alt={s.name}
                      fill
                      sizes="(max-width: 768px) 50vw, 25vw"
                      className="object-contain"
                    />
                  ) : null}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/15 to-transparent" />
                  <div className="absolute left-3 right-3 bottom-3">
                    <div className="text-white text-base sm:text-lg font-black tracking-tight leading-none drop-shadow-sm break-words">
                      {s.name}
                    </div>
                    {s.position ? (
                      <div className="mt-1 text-[11px] sm:text-xs text-white/80 drop-shadow-sm">{s.position}</div>
                    ) : null}
                  </div>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="py-10 text-center text-sm text-muted-foreground">このシーズンに登録されているスタッフはいません。</div>
        )
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

      {selectedStaff && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
          onClick={() => setSelectedStaff(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-md rounded-2xl border border-white/15 bg-zinc-950 text-white shadow-2xl ring-1 ring-black/10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 p-4">
              <div className="min-w-0 flex-1 text-center">
                <div className="text-lg font-black tracking-tight">{selectedStaff.name}</div>
                {selectedStaff.position ? (
                  <div className="mt-0.5 text-sm text-white/70">{selectedStaff.position}</div>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setSelectedStaff(null)}
                className="h-8 w-8 rounded-md border border-white/15 bg-white/5 text-white hover:bg-white/10"
                aria-label="閉じる"
              >
                ×
              </button>
            </div>

            <div className="p-4 pt-3 space-y-2 text-sm text-center">
              {(selectedStaff.nationality || selectedStaff.age != null) ? (
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-white/15 bg-white/5 p-3">
                    <div className="text-[11px] text-white/60">国籍</div>
                    <div className="mt-0.5 font-semibold break-words">{selectedStaff.nationality ? String(selectedStaff.nationality) : '-'}</div>
                  </div>
                  <div className="rounded-xl border border-white/15 bg-white/5 p-3">
                    <div className="text-[11px] text-white/60">年齢</div>
                    <div className="mt-0.5 font-semibold tabular-nums">{typeof selectedStaff.age === 'number' && Number.isFinite(selectedStaff.age) ? selectedStaff.age : '-'}</div>
                  </div>
                </div>
              ) : null}

              <div className="rounded-xl border border-white/15 bg-white/5 p-3">
                <div className="text-[11px] text-white/60">プロフィール</div>
                <div className="mt-1 whitespace-pre-wrap break-words text-sm">
                  {selectedStaff.profile ? String(selectedStaff.profile) : '-'}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
