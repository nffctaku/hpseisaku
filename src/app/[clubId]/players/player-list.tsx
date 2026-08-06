"use client";

import { useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Image from 'next/image';
import { Barlow_Condensed } from 'next/font/google';
import { calculateAge } from "@/lib/player-calculations";
import { toDashSeason, toSlashSeason } from "@/lib/season";

const barlow = Barlow_Condensed({
  weight: '900',
  style: 'italic',
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-barlow-condensed',
});

const POSITION_ORDER = ['GK', 'DF', 'MF', 'FW'] as const;

const positionColors: Record<string, string> = {
  GK: '#f59e0b',
  DF: '#60a5fa',
  MF: '#a78bfa',
  FW: '#1fd760',
};

const positionNames: Record<string, string> = {
  GK: 'ゴールキーパー',
  DF: 'ディフェンダー',
  MF: 'ミッドフィルダー',
  FW: 'フォワード',
  OTHER: 'その他',
};

interface Player {
  id: string;
  name: string;
  number: number;
  position: string;
  photoUrl?: string;
  seasons?: string[];
  isPublished?: boolean;
  __teamId?: string;
  seasonData?: Record<string, any>;
  manualCompetitionStats?: any[];
  stats?: { appearances: number; goals: number; assists: number };
}

interface Staff {
  id: string;
  name: string;
  position?: string;
  nationality?: string;
  age?: number;
  dateOfBirth?: string;
  joinedSeason?: string;
  profile?: string;
  photoUrl?: string;
  seasons?: string[];
  isPublished?: boolean;
  __teamId?: string;
}

function normalizePosition(pos: unknown): string {
  const raw = typeof pos === 'string' ? pos.trim() : '';
  if (!raw) return 'OTHER';
  const up = raw.toUpperCase();
  if (up === 'GK' || up.includes('ゴール') || up.includes('キーパー')) return 'GK';
  if (up === 'DF' || up.includes('ディフェンス') || up.includes('バック')) return 'DF';
  if (up === 'MF' || up.includes('ミッドフィ')) return 'MF';
  if (up === 'FW' || up.includes('フォワード') || up.includes('ストライカー')) return 'FW';
  return 'OTHER';
}

function getPositionColor(position: string): string {
  return positionColors[normalizePosition(position)] || 'rgba(255,255,255,0.4)';
}

export function PlayerList({ clubId, clubName, players, staff, allSeasons, activeSeason, accentColor, debugInfo }: {
  clubId: string;
  clubName: string;
  players: Player[];
  staff: Staff[];
  allSeasons: string[];
  activeSeason: string;
  accentColor?: string | null;
  debugInfo?: any;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [filter, setFilter] = useState<string>('ALL');
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [selectedStaff, setSelectedStaff] = useState<Staff | null>(null);

  const handleSeasonChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    router.push(`${pathname}?season=${encodeURIComponent(e.target.value)}`);
  };

  const groupedPlayers = useMemo(() => {
    const groups: Record<string, Player[]> = {};
    for (const p of players) {
      const key = normalizePosition(p.position);
      if (!groups[key]) groups[key] = [];
      groups[key].push(p);
    }
    for (const key of Object.keys(groups)) {
      groups[key] = groups[key].sort((a, b) => a.number - b.number);
    }
    return groups;
  }, [players]);

  const sortedPositions = useMemo(() => {
    const rest = Object.keys(groupedPlayers)
      .filter((k) => !POSITION_ORDER.includes(k as any))
      .sort((a, b) => a.localeCompare(b, 'ja'));
    return [...POSITION_ORDER.filter((p) => groupedPlayers[p]), ...rest];
  }, [groupedPlayers]);

  const visiblePositions = useMemo(() => {
    if (filter === 'ALL' || filter === 'スタッフ') return sortedPositions;
    return sortedPositions.filter((p) => p === filter);
  }, [filter, sortedPositions]);

  const filters = useMemo(() => {
    const base = ['ALL', 'GK', 'DF', 'MF', 'FW'];
    if (staff.length > 0) base.push('スタッフ');
    return base;
  }, [staff.length]);

  const showStaff = filter === 'ALL' || filter === 'スタッフ';

  const debugText = useMemo(() => {
    if (!debugInfo) return "";
    try {
      return JSON.stringify(debugInfo, null, 2);
    } catch {
      return String(debugInfo);
    }
  }, [debugInfo]);

  function getSeasonStats(player: Player) {
    if (player.stats) return player.stats;
    if (!activeSeason) return { appearances: 0, goals: 0, assists: 0 };
    const candidates = Array.from(new Set(
      [activeSeason, toSlashSeason(activeSeason), toDashSeason(activeSeason)].filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    ));

    const rows: any[] = [];
    for (const key of candidates) {
      const seasonData = player.seasonData?.[key];
      if (seasonData?.manualCompetitionStats && Array.isArray(seasonData.manualCompetitionStats)) {
        rows.push(...seasonData.manualCompetitionStats);
      }
    }

    if (rows.length === 0 && Array.isArray(player.manualCompetitionStats)) {
      const seasonMatches = [activeSeason, toSlashSeason(activeSeason), toDashSeason(activeSeason)].filter(Boolean);
      rows.push(...player.manualCompetitionStats.filter((r: any) => seasonMatches.includes(r?.season)));
    }

    let appearances = 0;
    let goals = 0;
    let assists = 0;
    for (const r of rows) {
      appearances += Number(r?.matches ?? 0);
      goals += Number(r?.goals ?? 0);
      assists += Number(r?.assists ?? 0);
    }
    return { appearances, goals, assists };
  }

  function PlayerCard({ player }: { player: Player }) {
    const color = getPositionColor(player.position);
    const hasPhoto = typeof player.photoUrl === 'string' && player.photoUrl.trim().length > 0;
    const stats = getSeasonStats(player);
    return (
      <div
        onClick={() => setSelectedPlayer(player)}
        className="group relative rounded-xl border border-white/[0.08] bg-black/[0.45] backdrop-blur-md overflow-hidden cursor-pointer transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_16px_40px_rgba(0,0,0,0.4)]"
        style={{ ['--position-color' as any]: color }}
      >
        <div className="relative w-full h-40 sm:h-44 overflow-hidden">
          {hasPhoto ? (
            <>
              <Image
                src={player.photoUrl ?? ''}
                alt={player.name}
                fill
                sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, 20vw"
                className="object-cover object-top transition-all duration-250 group-hover:brightness-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
              <span
                className={`absolute bottom-0 right-2 text-[80px] leading-none font-black italic pointer-events-none select-none ${barlow.className}`}
                style={{ color: `${color}60` }}
              >
                {player.number}
              </span>
            </>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center" style={{ background: `linear-gradient(to bottom, ${color}18, ${color}06)` }}>
              <span
                className={`text-[96px] leading-none font-black italic ${barlow.className}`}
                style={{ color: `${color}60` }}
              >
                {player.number}
              </span>
            </div>
          )}
          <div className="absolute bottom-0 left-0 right-0 h-[2px] transition-opacity duration-250 opacity-0 group-hover:opacity-100" style={{ backgroundColor: color }} />
          <div className="hidden sm:block sm:absolute inset-x-0 bottom-0 p-3 pt-12 bg-gradient-to-t from-black/90 via-black/70 to-transparent opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300">
            <div className="flex justify-around text-white">
              <div className="text-center">
                <div className="text-[10px] text-white/60">出場</div>
                <div className={`text-2xl font-black ${barlow.className}`}>{stats.appearances}</div>
              </div>
              <div className="text-center">
                <div className="text-[10px] text-white/60">得点</div>
                <div className={`text-2xl font-black ${barlow.className}`}>{stats.goals}</div>
              </div>
              <div className="text-center">
                <div className="text-[10px] text-white/60">アシスト</div>
                <div className={`text-2xl font-black ${barlow.className}`}>{stats.assists}</div>
              </div>
            </div>
          </div>
        </div>
        <div className="p-3">
          <div className="flex items-center justify-between mb-1">
            <span className={`text-xs font-black italic ${barlow.className}`} style={{ color }}>#{player.number}</span>
          </div>
          <div className="text-sm font-semibold text-white leading-tight line-clamp-2">{player.name}</div>
        </div>
      </div>
    );
  }

  function StaffCard({ staff: s }: { staff: Staff }) {
    const color = 'rgba(255,255,255,0.4)';
    const hasPhoto = typeof s.photoUrl === 'string' && s.photoUrl.trim().length > 0;
    return (
      <div
        onClick={() => setSelectedStaff(s)}
        className="group relative rounded-xl border border-white/[0.08] bg-black/[0.45] backdrop-blur-md overflow-hidden cursor-pointer transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_16px_40px_rgba(0,0,0,0.4)]"
      >
        <div className="relative w-full h-40 sm:h-44 overflow-hidden" style={{ background: `linear-gradient(to bottom, rgba(255,255,255,0.08), rgba(255,255,255,0.02))` }}>
          {hasPhoto ? (
            <>
              <Image
                src={s.photoUrl ?? ''}
                alt={s.name}
                fill
                sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, 20vw"
                className="object-cover object-top transition-all duration-250 group-hover:brightness-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
            </>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <svg className="w-20 h-20 opacity-20" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
              </svg>
            </div>
          )}
        </div>
        <div className="p-3">
          <div className="text-sm font-semibold text-white leading-tight line-clamp-2">{s.name}</div>
          {s.position ? <div className="mt-1 text-xs text-white/55">{s.position}</div> : null}
        </div>
      </div>
    );
  }

  function PlayerModal({ player }: { player: Player }) {
    const color = getPositionColor(player.position);
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
        onClick={() => setSelectedPlayer(null)}
        role="dialog"
        aria-modal="true"
      >
        <div
          className="w-full max-w-md rounded-2xl border bg-[#111d2e] text-white shadow-2xl overflow-hidden"
          style={{ borderColor: `${color}30` }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="relative h-56 overflow-hidden" style={{ background: `linear-gradient(135deg, #0b1320 0%, ${color}18 100%)` }}>
            {player.photoUrl ? (
              <Image
                src={player.photoUrl ?? ''}
                alt={player.name}
                fill
                sizes="(max-width: 768px) 100vw, 480px"
                className="object-cover object-top"
                style={{
                  maskImage: 'linear-gradient(to left, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.5) 60%, transparent 100%)',
                  WebkitMaskImage: 'linear-gradient(to left, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.5) 60%, transparent 100%)',
                }}
              />
            ) : null}
            <div
              className={`absolute right-10 bottom-0 text-[160px] leading-none font-black italic pointer-events-none select-none ${barlow.className}`}
              style={{ color: `${color}60` }}
            >
              {player.number}
            </div>
            <button
              type="button"
              onClick={() => setSelectedPlayer(null)}
              className="absolute top-4 right-4 h-8 w-8 rounded-full bg-white/[0.08] text-white flex items-center justify-center hover:bg-white/[0.12]"
              aria-label="閉じる"
            >
              ×
            </button>
            <div
              className="absolute top-4 left-4 px-2.5 py-1 rounded-full text-[11px] font-black"
              style={{ background: `${color}20`, color, border: `1px solid ${color}40` }}
            >
              {normalizePosition(player.position)}
            </div>
            <div className="absolute left-5 bottom-5">
              <div className={`text-3xl sm:text-4xl font-black italic leading-none ${barlow.className}`}>{player.name}</div>
              <div className="mt-1 text-xs text-white/55">年齢・国籍情報なし</div>
            </div>
          </div>
          <div className="p-5">
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: '出場', value: '-' },
                { label: '得点', value: '-' },
                { label: 'AS', value: '-' },
              ].map((s) => (
                <div key={s.label} className="rounded-xl border border-white/[0.08] bg-white/[0.04] p-3 text-center" style={{ borderColor: `${color}15` }}>
                  <div className={`text-2xl font-black italic ${barlow.className}`} style={{ color }}>{s.value}</div>
                  <div className="text-xs text-white/40 mt-1">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  function StaffModal({ staff: s }: { staff: Staff }) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
        onClick={() => setSelectedStaff(null)}
        role="dialog"
        aria-modal="true"
      >
        <div
          className="w-full max-w-md rounded-2xl border border-white/15 bg-[#111d2e] text-white shadow-2xl overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="relative h-40 overflow-hidden bg-zinc-900">
            {s.photoUrl ? (
              <Image
                src={s.photoUrl ?? ''}
                alt={s.name}
                fill
                sizes="(max-width: 768px) 100vw, 480px"
                className="object-cover object-top"
              />
            ) : null}
            <button
              type="button"
              onClick={() => setSelectedStaff(null)}
              className="absolute top-4 right-4 h-8 w-8 rounded-full bg-white/[0.08] text-white flex items-center justify-center hover:bg-white/[0.12]"
              aria-label="閉じる"
            >
              ×
            </button>
            <div className="absolute left-5 bottom-5">
              <div className={`text-3xl font-black italic leading-none ${barlow.className}`}>{s.name}</div>
              {s.position ? <div className="mt-1 text-xs text-white/55">{s.position}</div> : null}
            </div>
          </div>
          <div className="p-5 space-y-2 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3 text-center">
                <div className="text-[11px] text-white/60">国籍</div>
                <div className="mt-0.5 font-semibold">{s.nationality ?? '-'}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3 text-center">
                <div className="text-[11px] text-white/60">年齢</div>
                <div className="mt-0.5 font-semibold">
                  {typeof s.age === 'number' ? s.age : s.dateOfBirth && activeSeason ? calculateAge(s.dateOfBirth, activeSeason) : '-'}
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
              <div className="text-[11px] text-white/60">プロフィール</div>
              <div className="mt-1 whitespace-pre-wrap break-words text-sm">{s.profile ?? '-'}</div>
            </div>
          </div>
        </div>
      </div>
    );
  }


  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 text-white">
      {debugInfo ? (
        <pre className="mb-4 rounded-xl border border-white/10 bg-white/5 p-3 text-[10px] text-white/70 whitespace-pre-wrap break-words overflow-auto">
          {debugText}
        </pre>
      ) : null}

      <div className="pt-8 pb-6">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <div className={`text-4xl sm:text-5xl font-black italic ${barlow.className}`} style={{ color: accentColor || '#1fd760' }}>SQUAD</div>
          </div>
          {allSeasons.length > 0 && (
            <select
              value={activeSeason}
              onChange={handleSeasonChange}
              className="h-9 px-3 pr-8 text-sm rounded-lg border bg-zinc-900/80 text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-white/20"
              style={{ borderColor: accentColor || '#1fd760' }}
            >
              {allSeasons.map((s) => (
                <option key={s} value={s} className="bg-zinc-900">{s}</option>
              ))}
            </select>
          )}
        </div>

        <div className="flex flex-wrap gap-2 mt-4">
          {filters.map((f) => {
            const active = filter === f;
            const color = f === 'ALL' ? (accentColor || '#1fd760') : f === 'スタッフ' ? 'rgba(255,255,255,0.4)' : getPositionColor(f);
            return (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`px-4 py-1.5 rounded-lg text-sm font-black tracking-wide border transition-all duration-200 ${barlow.className} ${active ? 'text-black border-transparent' : 'text-white/55 border-white/10 hover:bg-white/5'}`}
                style={{ backgroundColor: active ? color : 'rgba(255,255,255,0.06)', borderColor: active ? color : undefined }}
              >
                {f}
              </button>
            );
          })}
        </div>
      </div>

      {visiblePositions.map((position) => {
        const color = getPositionColor(position);
        const list = groupedPlayers[position] || [];
        return (
          <section key={position} className="mb-12">
            <div className="flex items-center gap-4 mb-5">
              <span className={`text-5xl sm:text-6xl font-black italic leading-none ${barlow.className}`} style={{ color: `${color}60` }}>{position}</span>
              <div>
                <div className="text-xs text-white/40">{positionNames[position] || 'その他'} · {list.length}名</div>
              </div>
              <div className="flex-1 h-px" style={{ background: `linear-gradient(to right, ${color}40, transparent)` }} />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {list.map((player) => <PlayerCard key={player.id} player={player} />)}
            </div>
          </section>
        );
      })}

      {showStaff && staff.length > 0 && (
        <section className="mb-12">
          <div className="flex items-center gap-4 mb-5">
            <span className={`text-5xl sm:text-6xl font-black italic leading-none text-white/[0.08] ${barlow.className}`}>STAFF</span>
            <div>
              <div className={`text-xl font-black italic text-white/40 ${barlow.className}`}>スタッフ</div>
              <div className="text-xs text-white/40">{staff.length}名</div>
            </div>
            <div className="flex-1 h-px bg-gradient-to-r from-white/40 to-transparent" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {staff.map((s) => <StaffCard key={s.id} staff={s} />)}
          </div>
        </section>
      )}

      {selectedPlayer && <PlayerModal player={selectedPlayer} />}
      {selectedStaff && <StaffModal staff={selectedStaff} />}

      {players.length === 0 && staff.length === 0 && (
        <p className="py-10 text-center text-sm text-white/60">
          {allSeasons.length === 0 ? "公開されているシーズンはありません。" : "このシーズンに登録されている選手はいません。"}
        </p>
      )}
    </div>
  );
}
