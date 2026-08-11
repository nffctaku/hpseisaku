"use client";

import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Image from 'next/image';
import { Barlow_Condensed } from 'next/font/google';
import { calculateAge } from "@/lib/player-calculations";
import { toDashSeason, toSlashSeason } from "@/lib/season";
import { MatchRecord } from "./lib/get-match-stats";
import { PositionMap } from "./[playerId]/design-test/components/PositionMap";

const barlow = Barlow_Condensed({
  weight: '900',
  style: 'italic',
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-barlow-condensed',
});

const POSITION_ORDER = ['GK', 'DF', 'MF', 'FW'] as const;

const MATCH_RESULT_COLORS: Record<string, string> = {
  W: '#22c55e',
  D: '#f59e0b',
  L: '#ef4444',
  '-': 'rgba(255,255,255,0.4)',
};

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
  subName?: string;
  mainPosition?: string;
  subPositions?: string[];
  preferredFoot?: 'left' | 'right' | 'both';
  profile?: string;
  snsLinks?: {
    x?: string;
    youtube?: string;
    tiktok?: string;
    instagram?: string;
  };
  params?: {
    overall?: number;
    items: { name: string; value: number }[];
  };
  showParamsOnPublic?: boolean;
  tenureYears?: number;
  annualSalary?: number;
  annualSalaryCurrency?: 'JPY' | 'GBP' | 'EUR';
  contractEndYear?: number;
  contractEndMonth?: number;
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
    const slash = toSlashSeason(season);
    if (seen.has(key)) {
      const existing = cards.find((c) => `${c.season}||${c.competitionName}` === key);
      if (existing) {
        existing.matches += matches;
        existing.goals += goals;
        existing.assists += assists;
      }
      return;
    }
    seen.add(key);
    cards.push({ season: slash, competitionName: competitionName || '-', matches, goals, assists });
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

  if (Array.isArray(player.matchRecords)) {
    for (const r of player.matchRecords) {
      add(
        r.season,
        r.competitionName,
        (r.minutesPlayed ?? 0) > 0 ? 1 : 0,
        r.goals ?? 0,
        r.assists ?? 0
      );
    }
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
    router.replace(`${pathname}?season=${encodeURIComponent(e.target.value)}`);
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
            <span
              className={`absolute inset-0 flex items-center justify-center text-[112px] leading-none font-black italic ${barlow.className}`}
              style={{ color: hex.startsWith('#') ? `${hex}30` : 'rgba(0,0,0,0.10)' }}
            >
              {player.number}
            </span>
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
    const [expandedSeasons, setExpandedSeasons] = useState<Set<string>>(new Set());

    const groupedSeasons = useMemo(() => {
      const map = new Map<string, typeof seasonCards>();
      for (const c of seasonCards) {
        if (!map.has(c.season)) map.set(c.season, []);
        map.get(c.season)!.push(c);
      }
      return new Map([...map.entries()].sort((a, b) => b[0].localeCompare(a[0])));
    }, [seasonCards]);

    const toggleSeason = (season: string) => {
      const next = new Set(expandedSeasons);
      if (next.has(season)) next.delete(season);
      else next.add(season);
      setExpandedSeasons(next);
    };

    const close = () => setSelectedPlayer(null);

    const footText = player.preferredFoot
      ? { left: '左足', right: '右足', both: '両足' }[player.preferredFoot]
      : (player.foot || '未設定');
    const basicItems: { label: string; value: string }[] = [
      { label: '身長', value: player.height ? `${player.height}cm` : '未設定' },
      { label: '体重', value: player.weight ? `${player.weight}kg` : '未設定' },
      { label: '利き足', value: footText },
    ];
    if (player.subName) basicItems.push({ label: 'サブネーム', value: player.subName });
    if (player.dateOfBirth) basicItems.push({ label: '生年月日', value: player.dateOfBirth });
    if (typeof player.tenureYears === 'number' || Array.isArray(player.seasons)) {
      basicItems.push({ label: '在籍年数', value: typeof player.tenureYears === 'number' ? `${player.tenureYears}年目` : `${player.seasons!.length}年` });
    }
    if (typeof player.annualSalary === 'number') {
      basicItems.push({ label: '年俸', value: `${player.annualSalary.toLocaleString()} ${player.annualSalaryCurrency || ''}` });
    }
    if (typeof player.contractEndYear === 'number' && typeof player.contractEndMonth === 'number') {
      basicItems.push({ label: '契約満了', value: `${player.contractEndYear}年${player.contractEndMonth}月` });
    }

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
            {player.mainPosition || (Array.isArray(player.subPositions) && player.subPositions.length > 0) ? (
              <div className="absolute bottom-4 right-4 h-28 w-20 rounded-xl overflow-hidden bg-white/[0.03] border border-white/[0.05] z-10">
                <PositionMap mainPosition={player.mainPosition} subPositions={player.subPositions} />
              </div>
            ) : null}
            <div className="absolute bottom-5 left-5 z-10">
              <div className="text-2xl font-black leading-none" style={{ color: mainAccent }}>#{player.number}</div>
              <div className="text-2xl sm:text-[2.6rem] font-black leading-none text-white mt-1">{player.name}</div>
              {player.subName ? <div className="mt-0.5 text-sm font-semibold text-white/80">{player.subName}</div> : null}
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
                  <div key={item.label} className="flex items-center justify-between border-b border-white/[0.07] py-4 last:border-b-0">
                    <span className="text-sm text-white/40">{item.label}</span>
                    <span className={
                      `text-sm font-semibold ${item.value === '未設定' ? 'text-white/30' : 'text-[#f0f4ff]'}`
                    }>{item.value}</span>
                  </div>
                ))}

                {player.profile ? (
                  <div className="mt-4 rounded-xl border border-white/[0.05] bg-white/[0.03] p-3">
                    <div className="text-[10px] text-[#9CA3AF] mb-1">プロフィール</div>
                    <p className="text-sm text-[#f0f4ff] leading-relaxed whitespace-pre-wrap">{player.profile}</p>
                  </div>
                ) : null}

                {player.snsLinks && (player.snsLinks.x || player.snsLinks.youtube || player.snsLinks.tiktok || player.snsLinks.instagram) ? (
                  <div className="mt-4">
                    <div className="text-[10px] text-[#9CA3AF] mb-2">SNS</div>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { key: 'x', label: 'X' },
                        { key: 'youtube', label: 'YouTube' },
                        { key: 'tiktok', label: 'TikTok' },
                        { key: 'instagram', label: 'Instagram' },
                      ].map(({ key, label }) => {
                        const url = (player.snsLinks as any)?.[key];
                        if (!url) return null;
                        return (
                          <a
                            key={key}
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs px-2 py-1 rounded-full bg-white/[0.06] text-[#f0f4ff] hover:bg-white/[0.1]"
                          >
                            {label}
                          </a>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                {player.params && Array.isArray(player.params.items) && player.params.items.length > 0 ? (
                  <div className="mt-4 rounded-xl border border-white/[0.05] bg-white/[0.03] p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] text-[#9CA3AF]">能力値</span>
                      <div className="text-2xl font-black italic leading-none" style={{ color: mainAccent }}>{player.params.overall ?? '-'}</div>
                    </div>
                    <div className="flex justify-center py-2">
                      <svg viewBox="0 0 200 200" width="180" height="180" className="mx-auto">
                        {/* Background hexagon grid */}
                        {[0.2, 0.4, 0.6, 0.8, 1.0].map((scale) => {
                          const points = player.params!.items.map((item, i) => {
                            const angle = (Math.PI * 2 * i) / 6 - Math.PI / 2;
                            const r = 80 * scale;
                            const x = 100 + r * Math.cos(angle);
                            const y = 100 + r * Math.sin(angle);
                            return `${x},${y}`;
                          }).join(' ');
                          return (
                            <polygon
                              key={scale}
                              points={points}
                              fill="none"
                              stroke="rgba(255,255,255,0.1)"
                              strokeWidth="1"
                            />
                          );
                        })}
                        {/* Axis lines */}
                        {player.params!.items.map((item, i) => {
                          const angle = (Math.PI * 2 * i) / 6 - Math.PI / 2;
                          const x = 100 + 80 * Math.cos(angle);
                          const y = 100 + 80 * Math.sin(angle);
                          return (
                            <line
                              key={i}
                              x1={100}
                              y1={100}
                              x2={x}
                              y2={y}
                              stroke="rgba(255,255,255,0.1)"
                              strokeWidth="1"
                            />
                          );
                        })}
                        {/* Data polygon */}
                        <polygon
                          points={player.params!.items.map((item, i) => {
                            const angle = (Math.PI * 2 * i) / 6 - Math.PI / 2;
                            const r = 80 * (item.value / 99);
                            const x = 100 + r * Math.cos(angle);
                            const y = 100 + r * Math.sin(angle);
                            return `${x},${y}`;
                          }).join(' ')}
                          fill={`${mainAccent}33`}
                          stroke={mainAccent}
                          strokeWidth="2"
                        />
                        {/* Data points */}
                        {player.params!.items.map((item, i) => {
                          const angle = (Math.PI * 2 * i) / 6 - Math.PI / 2;
                          const r = 80 * (item.value / 99);
                          const x = 100 + r * Math.cos(angle);
                          const y = 100 + r * Math.sin(angle);
                          return (
                            <circle
                              key={i}
                              cx={x}
                              cy={y}
                              r="4"
                              fill={mainAccent}
                              stroke="white"
                              strokeWidth="1"
                            />
                          );
                        })}
                        {/* Labels */}
                        {player.params!.items.map((item, i) => {
                          const angle = (Math.PI * 2 * i) / 6 - Math.PI / 2;
                          const r = 95;
                          const x = 100 + r * Math.cos(angle);
                          const y = 100 + r * Math.sin(angle);
                          return (
                            <text
                              key={i}
                              x={x}
                              y={y}
                              textAnchor="middle"
                              dominantBaseline="middle"
                              fontSize="10"
                              fill="rgba(255,255,255,0.9)"
                              fontWeight="600"
                            >
                              {item.name}
                            </text>
                          );
                        })}
                      </svg>
                    </div>
                  </div>
                ) : null}

                {/* Overall trend chart for last 5 seasons */}
                {(() => {
                  const seasonData = player?.seasonData && typeof player.seasonData === "object" ? (player.seasonData as any) : null;
                  if (!seasonData) return null;
                  const overallTrend: Array<{ season: string; overall: number }> = [];
                  const allSeasons = Object.keys(seasonData).sort().reverse().slice(0, 5);
                  for (const s of allSeasons) {
                    const sd = seasonData[s];
                    if (sd && sd.params && typeof sd.params.overall === "number") {
                      overallTrend.push({ season: toSlashSeason(s), overall: sd.params.overall });
                    }
                  }
                  if (overallTrend.length === 0) return null;
                  overallTrend.reverse();
                  return (
                    <div className="mt-4 rounded-xl border border-white/[0.05] bg-white/[0.03] p-3">
                      <div className="text-[10px] text-[#9CA3AF] mb-2">総合値推移（直近5シーズン）</div>
                      <svg viewBox="0 0 300 100" width="100%" height="80" className="mx-auto">
                        {/* Grid lines */}
                        {[0, 25, 50, 75, 100].map((val) => (
                          <line
                            key={val}
                            x1={40}
                            y1={10 + (90 - val)}
                            x2={290}
                            y2={10 + (90 - val)}
                            stroke="rgba(255,255,255,0.1)"
                            strokeWidth="1"
                          />
                        ))}
                        {/* Y-axis labels */}
                        {[0, 25, 50, 75, 100].map((val) => (
                          <text
                            key={val}
                            x={35}
                            y={14 + (90 - val)}
                            textAnchor="end"
                            fontSize="8"
                            fill="rgba(255,255,255,0.5)"
                          >
                            {val}
                          </text>
                        ))}
                        {/* Data points */}
                        {overallTrend.map((d, i) => {
                          const x = 40 + (250 * i) / Math.max(overallTrend.length - 1, 1);
                          const y = 10 + (90 - d.overall);
                          return (
                            <g key={i}>
                              <circle
                                cx={x}
                                cy={y}
                                r="4"
                                fill={mainAccent}
                                stroke="white"
                                strokeWidth="1"
                              />
                              <text
                                x={x}
                                y={y + 12}
                                textAnchor="middle"
                                fontSize="7"
                                fill="rgba(255,255,255,0.7)"
                              >
                                {d.overall}
                              </text>
                            </g>
                          );
                        })}
                        {/* X-axis labels */}
                        {overallTrend.map((d, i) => {
                          const x = 40 + (250 * i) / Math.max(overallTrend.length - 1, 1);
                          return (
                            <text
                              key={i}
                              x={x}
                              y={98}
                              textAnchor="middle"
                              fontSize="7"
                              fill="rgba(255,255,255,0.5)"
                            >
                              {d.season.slice(-5)}
                            </text>
                          );
                        })}
                      </svg>
                    </div>
                  );
                })()}
              </div>
            )}

            {tab === 'stats' && (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-2">
                  {summaryItems.map((s) => (
                    <div key={s.label} className="rounded-xl border border-white/[0.08] bg-white/[0.04] p-3 text-center" style={{ borderColor: `${mainAccent}15` }}>
                      <div className={`text-2xl font-black italic leading-none ${barlow.className}`} style={{ color: mainAccent }}>{s.value}</div>
                      <div className="text-[10px] text-[#9CA3AF] mt-1">{s.label}</div>
                    </div>
                  ))}
                </div>
                {player.matchRecords && player.matchRecords.length > 0 ? (
                  <div className="space-y-3">
                    {player.matchRecords.map((r, idx) => {
                      const myScore = r.ha === '(A)' ? r.scoreAway : r.scoreHome;
                      const oppScore = r.ha === '(A)' ? r.scoreHome : r.scoreAway;
                      const scoreText = typeof myScore === 'number' && typeof oppScore === 'number' ? `${myScore}-${oppScore}` : '-';
                      const resultColor = MATCH_RESULT_COLORS[r.result] ?? 'rgba(255,255,255,0.4)';
                      const isBench = r.minutesPlayed === 0;
                      const minutesDisplay = isBench ? 'B' : (r.minutesPlayed ?? '−');
                      const minutesLabel = isBench ? '' : (r.minutesPlayed == null ? '' : '分');
                      const haLabel = r.ha === '(A)' ? 'A' : r.ha === '(H)' ? 'H' : String(r.ha || '').replace(/[()]/g, '');
                      return (
                        <div key={idx} className="rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-sm">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex min-w-0 flex-1 items-start gap-2">
                              <div
                                className="mt-1 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded text-[9px] font-black"
                                style={{ color: resultColor, backgroundColor: `${resultColor}22` }}
                              >
                                {r.result}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-base font-black text-white">{r.opponentName}</div>
                                <div className="mt-0.5 truncate text-[10px] font-normal tracking-tight text-white/30">{r.matchDate || '日付不明'} · {r.competitionName}{r.roundName ? ` · ${r.roundName}` : ''}</div>
                              </div>
                            </div>
                            <div className="flex flex-shrink-0 flex-col items-end gap-2">
                              <div className="flex items-center gap-5">
                                <span className="rounded-md bg-white/[0.08] px-2 py-0.5 text-[10px] font-black text-white/35">{haLabel}</span>
                                <span className={`text-lg font-black italic leading-none text-white ${barlow.className}`}>{scoreText}</span>
                              </div>
                              <div className="flex items-baseline gap-2 text-xs font-black">
                                <span><span style={{ color: mainAccent }}>{minutesDisplay}</span><span className="ml-0.5 text-white/35">{minutesLabel}</span></span>
                                <span><span className="text-white/35">{r.goals ?? 0}</span><span className="ml-0.5" style={{ color: mainAccent }}>G</span></span>
                                <span><span className="text-white/35">{r.assists ?? 0}</span><span className="ml-0.5" style={{ color: mainAccent }}>A</span></span>
                              </div>
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
                {groupedSeasons.size > 0 ? (
                  Array.from(groupedSeasons.entries()).map(([season, cards]) => {
                    const total = cards.reduce((acc, c) => ({
                      matches: acc.matches + c.matches,
                      goals: acc.goals + c.goals,
                      assists: acc.assists + c.assists,
                    }), { matches: 0, goals: 0, assists: 0 });
                    const isExpanded = expandedSeasons.has(season);
                    return (
                      <div key={season} className="rounded-xl border border-white/[0.05] overflow-hidden bg-white/[0.03]">
                        <button
                          type="button"
                          onClick={() => toggleSeason(season)}
                          className="w-full text-left"
                        >
                          <div className="flex items-center justify-between px-4 py-2 border-b border-white/[0.05] bg-white/[0.04]">
                            <span className="text-sm font-black" style={{ color: mainAccent }}>{season}</span>
                            <span className="text-lg leading-none text-white/80">{isExpanded ? '−' : '+'}</span>
                          </div>
                          <div className="grid grid-cols-3 divide-x divide-white/[0.06] p-3">
                            <div className="text-center">
                              <div className={`text-2xl font-black italic leading-none ${barlow.className}`} style={{ color: mainAccent }}>{total.matches}</div>
                              <div className="text-[10px] text-[#9CA3AF] mt-1">出</div>
                            </div>
                            <div className="text-center">
                              <div className={`text-2xl font-black italic leading-none ${barlow.className}`} style={{ color: mainAccent }}>{total.goals}</div>
                              <div className="text-[10px] text-[#9CA3AF] mt-1">G</div>
                            </div>
                            <div className="text-center">
                              <div className={`text-2xl font-black italic leading-none ${barlow.className}`} style={{ color: mainAccent }}>{total.assists}</div>
                              <div className="text-[10px] text-[#9CA3AF] mt-1">A</div>
                            </div>
                          </div>
                        </button>
                        {isExpanded && (
                          <div className="px-4 pb-3 space-y-2 border-t border-white/[0.06] pt-3">
                            {cards
                              .filter((c) => c.competitionName !== '-' || c.matches + c.goals + c.assists > 0)
                              .map((c, i) => (
                                <div key={i} className="rounded-lg bg-white/[0.04] px-3 py-2 flex items-center justify-between text-sm ml-2">
                                  <span className="text-white/80 font-medium truncate pr-2">{c.competitionName}</span>
                                  <div className="flex gap-3 text-[11px] flex-shrink-0">
                                    <span><span className="text-[#9CA3AF]">出</span> <span className="font-black" style={{ color: mainAccent }}>{c.matches}</span></span>
                                    <span><span className="text-[#9CA3AF]">G</span> <span className="font-black" style={{ color: mainAccent }}>{c.goals}</span></span>
                                    <span><span className="text-[#9CA3AF]">A</span> <span className="font-black" style={{ color: mainAccent }}>{c.assists}</span></span>
                                  </div>
                                </div>
                              ))}
                          </div>
                        )}
                      </div>
                    );
                  })
                ) : (
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
          {allSeasons.length > 0 && (
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
