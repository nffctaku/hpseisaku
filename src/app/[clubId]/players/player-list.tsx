"use client";

import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Image from 'next/image';
import { Barlow_Condensed } from 'next/font/google';
import { calculateAge } from "@/lib/player-calculations";
import { toDashSeason, toSlashSeason } from "@/lib/season";
import { MatchRecord } from "./lib/get-match-stats";

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
  matchRecords?: MatchRecord[];
  dateOfBirth?: string;
  nationality?: string;
  height?: number;
  weight?: number;
  foot?: string;
  birthplace?: string;
  joinedSeason?: string;
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

function getSeasonStats(player: Player, targetSeason?: string | null) {
  const season = targetSeason ?? '';
  if (player.stats) return player.stats;
  if (!season) return { appearances: 0, goals: 0, assists: 0 };

  const candidates = Array.from(new Set(
    [season, toSlashSeason(season), toDashSeason(season)].filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
  ));

  const rows: any[] = [];
  for (const key of candidates) {
    const seasonData = player.seasonData?.[key];
    if (seasonData?.manualCompetitionStats && Array.isArray(seasonData.manualCompetitionStats)) {
      rows.push(...seasonData.manualCompetitionStats);
    }
  }

  if (rows.length === 0 && Array.isArray(player.manualCompetitionStats)) {
    const seasonMatches = [season, toSlashSeason(season), toDashSeason(season)].filter(Boolean);
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

function getPlayerAge(player: Player, activeSeason: string | null): number | null {
  if (!player.dateOfBirth || !activeSeason) return null;
  try { return calculateAge(player.dateOfBirth, activeSeason); } catch { return null; }
}


function getPlayerSeasonCards(player: Player, allSeasons: string[]) {
  const cards: { season: string; competitionName: string; matches: number; goals: number; assists: number }[] = [];
  const seen = new Set<string>();
  const add = (season: string, competitionName: string, matches: number, goals: number, assists: number) => {
    const key = `${season}||${competitionName}`;
    if (seen.has(key)) return;
    seen.add(key);
    cards.push({ season: toSlashSeason(season), competitionName: competitionName || '-', matches, goals, assists });
  };

  const sources: any[] = [];
  if (Array.isArray(player.manualCompetitionStats)) sources.push(...player.manualCompetitionStats);
  for (const key of Object.keys(player.seasonData ?? {})) {
    const seasonData = player.seasonData![key];
    if (seasonData?.manualCompetitionStats && Array.isArray(seasonData.manualCompetitionStats)) {
      for (const r of seasonData.manualCompetitionStats) sources.push({ ...r, season: r?.season ?? key });
    }
  }

  for (const r of sources) {
    const season = toSlashSeason(r?.season ?? '');
    if (!season) continue;
    add(
      season,
      typeof r?.competitionName === 'string' ? r.competitionName : (typeof r?.competition === 'string' ? r.competition : '大会'),
      Number(r?.matches ?? 0),
      Number(r?.goals ?? 0),
      Number(r?.assists ?? 0)
    );
  }

  for (const season of allSeasons) {
    if (!season) continue;
    const slash = toSlashSeason(season);
    if (!seen.has(`${slash}||-`)) {
      cards.push({ season: slash, competitionName: '-', matches: 0, goals: 0, assists: 0 });
    }
  }

  return cards;
}

export function PlayerList({ players, staff, allSeasons, activeSeason, accentColor, debugInfo }: {
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
    try { return JSON.stringify(debugInfo, null, 2); } catch { return String(debugInfo); }
  }, [debugInfo]);

  const mainAccent = accentColor || '#1fd760';

  function PlayerCard({ player }: { player: Player }) {
    const color = getPositionColor(player.position);
    const hex = color.startsWith('#') ? color : 'rgba(255,255,255,0.4)';
    const hasPhoto = typeof player.photoUrl === 'string' && player.photoUrl.trim().length > 0;
    const stats = getSeasonStats(player, activeSeason);
    const hasStats = stats.appearances > 0 || stats.goals > 0 || stats.assists > 0 || Boolean(player.stats);

    const onSelect = () => setSelectedPlayer(player);

    return (
      <div
        onClick={onSelect}
        className="group relative rounded-xl border border-white/[0.08] bg-black/[0.45] backdrop-blur-md overflow-hidden cursor-pointer transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_16px_40px_rgba(0,0,0,0.4)]"
        style={{ ['--pc' as any]: hex, ['--pc-30' as any]: hex.startsWith('#') ? `${hex}30` : 'rgba(255,255,255,0.3)', ['--pc-50' as any]: hex.startsWith('#') ? `${hex}50` : 'rgba(255,255,255,0.5)' }}
      >
        <div className="relative w-full h-[160px] sm:h-[175px] overflow-hidden" style={{ background: `linear-gradient(to bottom, ${hex}18, ${hex}06)` }}>
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
                className={`absolute bottom-[-6px] right-1 text-[88px] leading-none font-black italic pointer-events-none select-none ${barlow.className}`}
                style={{ color: `${hex}40` }}
              >
                {player.number}
              </span>
            </>
          ) : (
            <>
              <div className="absolute inset-0 flex items-center justify-center">
                <svg className="w-20 h-20 opacity-25" fill="currentColor" viewBox="0 0 24 24" style={{ color: hex }}>
                  <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                </svg>
              </div>
              <span
                className={`absolute inset-0 flex items-center justify-center text-[112px] leading-none font-black italic ${barlow.className}`}
                style={{ color: hex.startsWith('#') ? `${hex}30` : 'rgba(0,0,0,0.10)' }}
              >
                {player.number}
              </span>
            </>
          )}
          <div
            className="absolute bottom-0 left-0 right-0 h-[2px] transition-opacity duration-250 opacity-0 group-hover:opacity-100"
            style={{ backgroundColor: 'var(--pc)' }}
          />
          {hasStats && (
            <div className="hidden sm:grid absolute inset-x-0 bottom-0 p-2 pt-8 bg-gradient-to-t from-black/95 via-black/80 to-transparent grid-cols-3 gap-1 max-h-0 overflow-hidden opacity-0 group-hover:max-h-16 group-hover:opacity-100 transition-all duration-300">
              <div className="text-center">
                <div className="text-[10px] text-white/60">出場</div>
                <div className={`text-[18px] font-black italic leading-none ${barlow.className}`} style={{ color: hex }}>{stats.appearances}</div>
              </div>
              <div className="text-center">
                <div className="text-[10px] text-white/60">得点</div>
                <div className={`text-[18px] font-black italic leading-none ${barlow.className}`} style={{ color: hex }}>{stats.goals}</div>
              </div>
              <div className="text-center">
                <div className="text-[10px] text-white/60">AS</div>
                <div className={`text-[18px] font-black italic leading-none ${barlow.className}`} style={{ color: hex }}>{stats.assists}</div>
              </div>
            </div>
          )}
        </div>
        <div className="p-2 px-3 pb-3">
          <div className="flex items-center justify-between mb-1">
            <span className={`text-[13px] font-black italic ${barlow.className}`} style={{ color: hex }}>#{player.number}</span>
          </div>
          <div className="text-sm font-semibold text-white leading-tight line-clamp-2">{player.name}</div>
        </div>
      </div>
    );
  }

  function StaffCard({ staff: s }: { staff: Staff }) {
    const hasPhoto = typeof s.photoUrl === 'string' && s.photoUrl.trim().length > 0;
    const color = 'rgba(255,255,255,0.4)';
    return (
      <div
        onClick={() => setSelectedStaff(s)}
        className="group relative rounded-xl border border-white/[0.08] bg-black/[0.45] backdrop-blur-md overflow-hidden cursor-pointer transition-all duration-200 hover:-translate-y-1"
      >
        <div className="relative w-full h-[160px] sm:h-[175px] overflow-hidden" style={{ background: 'linear-gradient(to bottom, rgba(255,255,255,0.08), rgba(255,255,255,0.02))' }}>
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
              <svg className="w-20 h-20 opacity-20" fill="currentColor" viewBox="0 0 24 24" style={{ color }}>
                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
              </svg>
            </div>
          )}
        </div>
        <div className="p-2 px-3 pb-3">
          <div className="text-sm font-semibold text-white leading-tight line-clamp-2">{s.name}</div>
          {s.position ? <div className="mt-1 text-xs text-white/55">{s.position}</div> : null}
        </div>
      </div>
    );
  }

  function PlayerModal({ player }: { player: Player }) {
    const color = getPositionColor(player.position);
    const hex = color.startsWith('#') ? color : 'rgba(255,255,255,0.4)';
    const [tab, setTab] = useState<'basic' | 'stats' | 'seasons'>('basic');
    useEffect(() => { setTab('basic'); }, [player.id]);

    const stats = getSeasonStats(player, activeSeason);
    const age = getPlayerAge(player, activeSeason);
    const profile = [age !== null ? `${age}歳` : null, player.nationality].filter(Boolean).join(' · ') || '年齢・国籍情報なし';
    const seasonCards = getPlayerSeasonCards(player, allSeasons);

    const close = () => setSelectedPlayer(null);

    const basicItems = [
      { label: '出身', value: player.birthplace || player.nationality || '-' },
      { label: '年齢', value: age !== null ? `${age}歳` : '-' },
      { label: '身長', value: player.height ? `${player.height}cm` : '-' },
      { label: '体重', value: player.weight ? `${player.weight}kg` : '-' },
      { label: '利き足', value: player.foot || '-' },
      { label: '在籍年数', value: Array.isArray(player.seasons) ? `${player.seasons.length}年` : '-' },
    ];

    const summaryItems = [
      { label: '出場', value: stats.appearances },
      { label: '得点', value: stats.goals },
      { label: 'AS', value: stats.assists },
    ];

    return (
      <div
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/88 backdrop-blur-[14px] p-0 sm:p-4 pb-16"
        onClick={close}
        role="dialog"
        aria-modal="true"
      >
        <div
          className="w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl bg-[#0d1826] text-white shadow-2xl overflow-hidden flex flex-col"
          style={{ height: 'min(640px, calc(95dvh - 64px))', border: `1px solid ${hex}22` }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="relative h-[300px] flex-shrink-0 overflow-hidden" style={{ background: `linear-gradient(150deg, #080c14 0%, ${hex}1a 100%)` }}>
            <div className="pointer-events-none absolute inset-0 opacity-40" style={{ background: 'repeating-linear-gradient(-55deg, rgba(255,255,255,0.018) 0px, rgba(255,255,255,0.018) 2px, transparent 2px, transparent 8px)' }} />
            {player.photoUrl ? (
              <Image
                src={player.photoUrl ?? ''}
                alt={player.name}
                fill
                sizes="(max-width: 640px) 100vw, 480px"
                className="object-cover"
                style={{ objectPosition: 'center 15%' }}
              />
            ) : (
              <div className={`absolute right-2 bottom-[-12px] text-[17rem] leading-none font-black italic pointer-events-none select-none ${barlow.className}`} style={{ color: `${hex}18` }}>
                {player.number}
              </div>
            )}
            <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/75 via-black/30 to-transparent" />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-black/95 via-black/60 to-transparent" />
            <div className="absolute top-0 left-0 right-0 p-4 flex items-start justify-between z-10">
              <div className="px-2.5 py-1 rounded-full text-[11px] font-black" style={{ background: `${hex}1f`, color: hex, border: `1px solid ${hex}45` }}>
                {normalizePosition(player.position)}
              </div>
              <button
                type="button"
                onClick={close}
                className="h-8 w-8 rounded-full bg-white/[0.08] text-white flex items-center justify-center hover:bg-white/[0.12]"
                aria-label="閉じる"
              >
                ×
              </button>
            </div>
            <div className="absolute bottom-5 left-5 z-10">
              <div className={`text-2xl font-black italic leading-none ${barlow.className}`} style={{ color: mainAccent }}>#{player.number}</div>
              <div className="text-2xl sm:text-[2.6rem] font-black leading-none text-white mt-1">{player.name}</div>
              <div className="mt-1 text-xs text-white/55">{profile}</div>
            </div>
          </div>

          <div className="flex-shrink-0 border-b border-white/[0.07] flex">
            {(['basic', 'stats', 'seasons'] as const).map((t, i) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`flex-1 py-3 text-sm font-bold text-center transition-colors ${i === 0 ? '' : ''}`}
                style={{
                  color: tab === t ? mainAccent : 'rgba(255,255,255,0.38)',
                  borderBottom: tab === t ? `0.5px solid ${mainAccent}` : '0.5px solid transparent',
                }}
              >
                {t === 'basic' ? '基本情報' : t === 'stats' ? '試合スタッツ' : 'シーズン'}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-5">
            {tab === 'basic' && (
              <div className="space-y-0">
                {basicItems.map((item) => (
                  <div key={item.label} className="flex items-center justify-between border-b border-white/[0.07] py-3 last:border-b-0">
                    <span className="text-sm text-white/40">{item.label}</span>
                    <span className="text-sm text-[#f0f4ff] font-semibold">{item.value}</span>
                  </div>
                ))}
              </div>
            )}

            {tab === 'stats' && (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-2">
                  {summaryItems.map((s) => (
                    <div key={s.label} className="rounded-xl border border-white/[0.08] bg-white/[0.04] p-3 text-center" style={{ borderColor: `${mainAccent}15` }}>
                      <div className={`text-2xl font-black italic leading-none ${barlow.className}`} style={{ color: mainAccent }}>{s.value}</div>
                      <div className="text-[10px] text-white/40 mt-1">{s.label}</div>
                    </div>
                  ))}
                </div>
                {player.matchRecords && player.matchRecords.length > 0 ? (
                  <div className="space-y-3">
                    {player.matchRecords.map((r, idx) => {
                      const myScore = r.ha === '(A)' ? r.scoreAway : r.scoreHome;
                      const oppScore = r.ha === '(A)' ? r.scoreHome : r.scoreAway;
                      const scoreText = typeof myScore === 'number' && typeof oppScore === 'number' ? `${myScore}-${oppScore}` : '-';
                      const resultColor = r.result === 'W' ? '#1fd760' : r.result === 'D' ? '#f59e0b' : r.result === 'L' ? '#ef4444' : 'rgba(255,255,255,0.4)';
                      return (
                        <div key={idx} className="rounded-xl border border-white/[0.05] bg-white/[0.03] p-3 text-sm">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="text-[10px] text-white/40">{r.matchDate || '日付不明'} · {r.competitionName} · {r.roundName}</div>
                              <div className="font-semibold text-white truncate mt-0.5">vs {r.opponentName} <span className="text-white/40 text-xs">{r.ha}</span></div>
                            </div>
                            <div className="flex flex-col items-end flex-shrink-0 gap-0.5">
                              <div className="text-[10px] font-bold" style={{ color: resultColor }}>{r.result}</div>
                              <div className="text-[10px] text-white/40">{scoreText}</div>
                            </div>
                          </div>
                          <div className="mt-3 grid grid-cols-3 gap-2">
                            <div className="rounded-lg bg-white/[0.04] p-2 flex items-baseline justify-center gap-1">
                              <div className={`text-2xl font-black italic leading-none ${barlow.className}`} style={{ color: mainAccent }}>{r.minutesPlayed ?? 0}</div>
                              <div className="text-[10px] text-white/40">分</div>
                            </div>
                            <div className="rounded-lg bg-white/[0.04] p-2 flex items-baseline justify-center gap-1">
                              <div className={`text-2xl font-black italic leading-none ${barlow.className}`} style={{ color: mainAccent }}>{r.goals ?? 0}</div>
                              <div className="text-[10px] text-white/40">G</div>
                            </div>
                            <div className="rounded-lg bg-white/[0.04] p-2 flex items-baseline justify-center gap-1">
                              <div className={`text-2xl font-black italic leading-none ${barlow.className}`} style={{ color: mainAccent }}>{r.assists ?? 0}</div>
                              <div className="text-[10px] text-white/40">A</div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-white/40 text-center py-6">試合記録がありません。</p>
                )}
              </div>
            )}

            {tab === 'seasons' && (
              <div className="space-y-3">
                {seasonCards.length > 0 ? seasonCards.map((c, idx) => (
                  <div key={idx} className="rounded-xl border border-white/[0.05] overflow-hidden" style={{ background: `${mainAccent}0e` }}>
                    <div className="flex items-center justify-between px-4 py-2 border-b border-white/[0.05]" style={{ background: `${mainAccent}0e` }}>
                      <span className="text-sm font-black italic" style={{ color: mainAccent }}>{c.season}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold" style={{ background: `${mainAccent}1f`, color: mainAccent }}>{c.competitionName}</span>
                    </div>
                    <div className="grid grid-cols-3 divide-x divide-white/[0.06] p-3">
                      <div className="text-center">
                        <div className={`text-2xl font-black italic leading-none ${barlow.className}`} style={{ color: mainAccent }}>{c.matches}</div>
                        <div className="text-[10px] text-white/40 mt-1">試合</div>
                      </div>
                      <div className="text-center">
                        <div className={`text-2xl font-black italic leading-none ${barlow.className}`} style={{ color: mainAccent }}>{c.goals}</div>
                        <div className="text-[10px] text-white/40 mt-1">得点</div>
                      </div>
                      <div className="text-center">
                        <div className={`text-2xl font-black italic leading-none ${barlow.className}`} style={{ color: mainAccent }}>{c.assists}</div>
                        <div className="text-[10px] text-white/40 mt-1">アシスト</div>
                      </div>
                    </div>
                  </div>
                )) : (
                  <p className="text-sm text-white/40 text-center py-6">シーズンデータがありません。</p>
                )}
              </div>
            )}

          </div>
        </div>
      </div>
    );
  }

  function StaffModal({ staff: s }: { staff: Staff }) {
    const hasPhoto = typeof s.photoUrl === 'string' && s.photoUrl.trim().length > 0;
    const age = typeof s.age === 'number' ? s.age : (s.dateOfBirth && activeSeason ? calculateAge(s.dateOfBirth, activeSeason) : null);
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/88 backdrop-blur-[14px] p-4"
        onClick={() => setSelectedStaff(null)}
        role="dialog"
        aria-modal="true"
      >
        <div
          className="w-full max-w-md rounded-2xl border border-white/15 bg-[#111d2e] text-white shadow-2xl overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="relative h-40 overflow-hidden bg-zinc-900">
            {hasPhoto ? (
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
                <div className="mt-0.5 font-semibold">{age !== null ? age : '-'}</div>
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
    <div className="max-w-5xl mx-auto px-4 sm:px-6 text-zinc-900">
      {debugInfo ? (
        <pre className="mb-4 rounded-xl border border-black/10 bg-black/5 p-3 text-[10px] text-zinc-600 whitespace-pre-wrap break-words overflow-auto">
          {debugText}
        </pre>
      ) : null}

      <div className="pt-8 pb-6">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <div className="text-[10px] uppercase tracking-[0.15em] font-black" style={{ color: mainAccent }}>SQUAD</div>
            <h1 className={`text-4xl sm:text-5xl font-black italic text-zinc-900 ${barlow.className}`}>選手一覧</h1>
          </div>
          {allSeasons.length > 1 && (
            <select
              value={activeSeason}
              onChange={handleSeasonChange}
              className="h-10 px-3 pr-8 text-sm rounded-lg text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-white/20"
              style={{ backgroundColor: 'rgba(0,0,0,0.75)', border: '1px solid rgba(255,255,255,0.15)' }}
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
            const isStaff = f === 'スタッフ';
            const color = f === 'ALL' ? mainAccent : isStaff ? 'rgba(255,255,255,0.4)' : getPositionColor(f);
            return (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`px-4 py-1.5 rounded-lg text-sm font-black tracking-wide border transition-all duration-200 ${barlow.className}`}
                style={{
                  backgroundColor: active ? color : 'rgba(0,0,0,0.06)',
                  color: active ? '#000' : 'rgba(0,0,0,0.70)',
                  borderColor: active ? color : 'rgba(0,0,0,0.10)',
                }}
              >
                {f}
              </button>
            );
          })}
        </div>
      </div>

      {visiblePositions.map((position) => {
        const color = getPositionColor(position);
        const hex = color.startsWith('#') ? color : 'rgba(255,255,255,0.4)';
        const list = groupedPlayers[position] || [];
        return (
          <section key={position} className="mb-12">
            <div className="flex items-center gap-4 mb-5">
              <span className={`text-5xl sm:text-6xl font-black italic leading-none ${barlow.className}`} style={{ color: hex.startsWith('#') ? `${hex}35` : 'rgba(0,0,0,0.10)' }}>
                {position}
              </span>
              <div>
                <div className="text-xs text-black/40">{positionNames[position] || 'その他'} · {list.length}名</div>
              </div>
              <div className="flex-1 h-px" style={{ background: hex.startsWith('#') ? `linear-gradient(to right, ${hex}40, transparent)` : 'linear-gradient(to right, rgba(255,255,255,0.4), transparent)' }} />
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
            <span className={`text-5xl sm:text-6xl font-black italic leading-none ${barlow.className}`} style={{ color: 'rgba(0,0,0,0.08)' }}>STAFF</span>
            <div>
              <div className="text-xs text-black/40">{staff.length}名</div>
            </div>
            <div className="flex-1 h-px bg-gradient-to-r from-black/40 to-transparent" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {staff.map((s) => <StaffCard key={s.id} staff={s} />)}
          </div>
        </section>
      )}

      {selectedPlayer && <PlayerModal player={selectedPlayer} />}
      {selectedStaff && <StaffModal staff={selectedStaff} />}

      {players.length === 0 && staff.length === 0 && (
        <p className="py-10 text-center text-sm text-zinc-500">
          {allSeasons.length === 0 ? "公開されているシーズンはありません。" : "このシーズンに登録されている選手はいません。"}
        </p>
      )}
    </div>
  );
}
