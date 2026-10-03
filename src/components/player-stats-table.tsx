"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFormContext, useFieldArray, useWatch } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { Player } from '@/types/match';
import { deriveStarterMinutes, deriveBenchMinutes } from '@/lib/match-minutes';
import { buildPlayerNameResolver } from '@/lib/match-event-resolve';
import { getFormationSlots } from '@/lib/formation-slots';
import { LineupPitch, PitchSlotAnchor, PlayerNode, EmptySlotNode, SubstituteCard, AddSubCard } from '@/components/lineup-pitch';
import { scrollPickerToValue } from '@/components/mobile-picker-modal';
import { toast } from 'sonner';

const ratingOptions = (() => {
  const start = 4.0;
  const end = 10.0;
  const steps = Math.round((end - start) / 0.1);
  const all = Array.from({ length: steps + 1 }, (_, i) => (start + i * 0.1).toFixed(1));

  const pivot = all.indexOf('7.0');
  if (pivot === -1) return all;
  const below = all.slice(0, pivot); // 4.0..6.9
  const above = all.slice(pivot + 1); // 7.1..10.0
  return [...below, '7.0', ...above];
})();
const NONE_SELECT_VALUE = "__none__";
const FORMATION_OPTIONS = [
  '4-3-3',
  '4-4-2',
  '4-2-3-1',
  '4-1-4-1',
  '4-3-2-1',
  '4-1-2-1-2',
  '3-4-3',
  '3-5-2',
  '3-2-4-1',
  '5-3-2',
  '5-4-1',
  '4-5-1',
  '4-4-1-1',
  '4-2-2-2',
  '4-2-4',
  '3-4-2-1',
  '3-4-1-2',
  '4-3-1-2',
  '5-2-3',
  '5-2-2-1',
  '4-2-1-3',
  '4-1-2-3',
  '3-1-4-2',
  '4-1-3-2',
  '4-1-2-2-1',
  '3-3-4',
  '3-3-3-1',
  '5-3-1-1',
  '3-3-2-2',
  '3-5-1-1',
  '2-3-2-3',
];

const positionOrder = (position: any) => {
  const value = String(position || '').toUpperCase();
  if (value.includes('GK')) return 0;
  if (value.includes('DF') || value.includes('CB') || value.includes('SB') || value.includes('RB') || value.includes('LB')) return 1;
  if (value.includes('MF') || value.includes('DM') || value.includes('CM') || value.includes('AM') || value.includes('WB') || value.includes('SH')) return 2;
  if (value.includes('FW') || value.includes('ST') || value.includes('CF') || value.includes('WG')) return 3;
  return 99;
};

export function PlayerStatsTable({ teamId, allPlayers, matchDuration = 90, onFormationChange, isHomeTeam }: { teamId: string, allPlayers: Player[], matchDuration?: number, onFormationChange?: (formation: string) => void, isHomeTeam?: boolean }) {
  console.log(`PlayerStatsTable v3 (${teamId}): Received allPlayers`, allPlayers);
  const { control, watch, setValue, formState } = useFormContext();
  const { fields, append, prepend, remove, update } = useFieldArray({
    control,
    name: 'playerStats',
  });

  const watchedPlayerStats = useWatch({ control, name: 'playerStats' });
  const watchedEvents = useWatch({ control, name: 'events' });
  const watchedHomeFormation = useWatch({ control, name: 'homeFormation' });
  const watchedAwayFormation = useWatch({ control, name: 'awayFormation' });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [mobilePicker, setMobilePicker] = useState<null | {
    title: string;
    value: string;
    options: Array<{ value: string; label: string }>;
    onSelect: (value: string) => void;
  }>(null);
  const [pressedPickerValue, setPressedPickerValue] = useState<string | null>(null);
  const [benchAddValue, setBenchAddValue] = useState('');
  const pickerScrollRef = useRef<HTMLDivElement | null>(null);

  // ピッカーを開いた時点で現在値を中央の選択位置にする
  useEffect(() => {
    if (!mobilePicker) return;
    scrollPickerToValue(pickerScrollRef.current);
  }, [mobilePicker]);
  const formationStorageKey = `match_lineup_formation_${teamId}`;
  
  // Use isHomeTeam prop to determine which formation field to use
  const currentFormation = isHomeTeam !== undefined ? (isHomeTeam ? watchedHomeFormation : watchedAwayFormation) : watchedHomeFormation;
  
  const selectedFormation = currentFormation || '4-3-3';
  const selectedFormationRef = useRef(selectedFormation);
  selectedFormationRef.current = selectedFormation;
  const onFormationChangeRef = useRef(onFormationChange);
  onFormationChangeRef.current = onFormationChange;

  const handleFormationChange = useCallback((formation: string) => {
    if (formation === selectedFormationRef.current) return;
    try {
      localStorage.setItem(formationStorageKey, formation);
    } catch {
      // ignore storage errors
    }
    onFormationChangeRef.current?.(formation);
  }, [formationStorageKey]);

  const derivedCounts = useMemo(() => {
    const events = Array.isArray(watchedEvents) ? (watchedEvents as any[]) : [];
    const nameToId = new Map<string, string>((allPlayers || []).map((p) => [p.name, p.id]));
    const goals = new Map<string, number>();
    const assists = new Map<string, number>();
    const yellow = new Map<string, number>();
    const red = new Map<string, number>();

    events.forEach((ev: any) => {
      const type = typeof ev?.type === 'string' ? ev.type : '';
      // OGは選手の得点としてカウントしない
      if (type === 'goal') {
        const pkName = typeof ev.playerName === 'string' && ev.playerName.startsWith('PK(') && ev.playerName.endsWith(')')
          ? ev.playerName.slice(3, -1).trim()
          : undefined;
        const scorerId = ev.originalPlayerId || (pkName && nameToId.get(pkName)) || ev.playerId;
        if (scorerId) goals.set(scorerId, (goals.get(scorerId) || 0) + 1);
        if (ev.assistPlayerId) assists.set(ev.assistPlayerId, (assists.get(ev.assistPlayerId) || 0) + 1);
        return;
      }

      // card (new format) / yellow|red (legacy format)
      if ((type === 'card' || type === 'yellow' || type === 'red') && ev.playerId) {
        const color = type === 'card' ? ev.cardColor : type;
        if (color === 'yellow') yellow.set(ev.playerId, (yellow.get(ev.playerId) || 0) + 1);
        if (color === 'red') red.set(ev.playerId, (red.get(ev.playerId) || 0) + 1);
      }
    });

    return { goals, assists, yellow, red };
  }, [watchedEvents, allPlayers]);

  // 名前のみ交代イベントの一意解決用（0件/複数一致は未解決のまま）
  const nameResolver = useMemo(
    () => buildPlayerNameResolver(Array.isArray(watchedPlayerStats) ? watchedPlayerStats : []),
    [watchedPlayerStats]
  );

  const derivedStarterMinutes = useMemo(() => {
    const events = Array.isArray(watchedEvents) ? (watchedEvents as any[]) : [];
    return deriveStarterMinutes(events, teamId, matchDuration, nameResolver);
  }, [teamId, watchedEvents, matchDuration, nameResolver]);

  // Calculate bench player minutes (IN substitutions)
  const derivedBenchMinutes = useMemo(() => {
    const events = Array.isArray(watchedEvents) ? (watchedEvents as any[]) : [];
    return deriveBenchMinutes(events, teamId, matchDuration, nameResolver);
  }, [teamId, watchedEvents, matchDuration, nameResolver]);

  // 交代イベントの実際の「分」（公開ページの subInMinute/subOutMinute と同じ導出）
  const subMinuteMaps = useMemo(() => {
    const outMap = new Map<string, number>();
    const inMap = new Map<string, number>();
    (Array.isArray(watchedEvents) ? (watchedEvents as any[]) : []).forEach((ev: any) => {
      if (ev?.type === 'sub_out' && ev.playerId) {
        outMap.set(ev.playerId, ev.minute);
      }
      if (ev?.type === 'sub_in' && ev.playerId) {
        inMap.set(ev.playerId, ev.minute);
      }
      if (ev?.type === 'substitution') {
        const outId = (typeof ev?.outPlayerId === 'string' && ev.outPlayerId)
          ? ev.outPlayerId
          : (nameResolver(ev?.outPlayerName, ev?.teamId) ?? '');
        const inId = (typeof ev?.inPlayerId === 'string' && ev.inPlayerId)
          ? ev.inPlayerId
          : (nameResolver(ev?.inPlayerName, ev?.teamId) ?? '');
        if (outId) outMap.set(outId, ev.minute);
        if (inId) inMap.set(inId, ev.minute);
      }
    });
    return { outMap, inMap };
  }, [watchedEvents, nameResolver]);

  // Automatically calculate and update minutesPlayed based on substitution events and matchDuration
  // Only recalc when minutes-relevant data actually changed since load (lineup members or
  // substitution events); viewing or unrelated edits must preserve stored minutesPlayed.
  const minutesSignatureRef = useRef<string | null>(null);
  useEffect(() => {
    const stats = Array.isArray(watchedPlayerStats) ? (watchedPlayerStats as any[]) : [];
    const teamPlayerIds = stats
      .filter((ps) => ps && ps.teamId === teamId)
      .map((ps) => `${String(ps.playerId || '')}:${ps.role ?? 'starter'}`)
      .sort();
    const teamSubEvents = (Array.isArray(watchedEvents) ? watchedEvents : []).filter(
      (e: any) => e && e.teamId === teamId && e.type === 'substitution'
    );
    if (teamPlayerIds.length === 0 && teamSubEvents.length === 0 && minutesSignatureRef.current === null) return;
    const signature = JSON.stringify({ p: teamPlayerIds, ev: teamSubEvents });
    const changed = minutesSignatureRef.current !== null && minutesSignatureRef.current !== signature;
    minutesSignatureRef.current = signature;
    // Recalc only on user edits; load-time normalization uses shouldDirty:false so it never qualifies
    if (!changed || !formState.isDirty) return;
    stats.forEach((ps, idx) => {
      if (!ps) return;
      if (ps.teamId !== teamId) return;
      
      const pid = typeof ps.playerId === 'string' ? ps.playerId : '';
      if (!pid) return;

      const role = ps.role ?? 'starter';
      const curRaw = ps.minutesPlayed;
      const cur = typeof curRaw === 'number' && Number.isFinite(curRaw) ? curRaw : Number(curRaw);
      const curNum = Number.isFinite(cur) ? cur : undefined;

      let desired: number;

      // For starters: check if they have a substitution OUT event
      if (role === 'starter') {
        const hasOut = derivedStarterMinutes.has(pid);
        desired = hasOut ? (derivedStarterMinutes.get(pid) as number) : matchDuration;
      }
      // For bench: check if they have a substitution IN event
      else if (role === 'sub') {
        const hasIn = derivedBenchMinutes.has(pid);
        desired = hasIn ? (derivedBenchMinutes.get(pid) as number) : 0;
      } else {
        return;
      }

      if (curNum === desired) return;
      // shouldDirty:false — recalculation must not trigger autosave by itself
      setValue(`playerStats.${idx}.minutesPlayed` as any, desired, { shouldDirty: false });
    });
  }, [derivedStarterMinutes, derivedBenchMinutes, matchDuration, teamId, watchedPlayerStats, watchedEvents, setValue]);

  const sortedAllPlayers = [...allPlayers].sort((a, b) => {
    const an = typeof (a as any)?.number === 'number' && Number.isFinite((a as any).number) ? (a as any).number : Number.POSITIVE_INFINITY;
    const bn = typeof (b as any)?.number === 'number' && Number.isFinite((b as any).number) ? (b as any).number : Number.POSITIVE_INFINITY;
    if (an !== bn) return an - bn;
    const aname = String((a as any)?.name || '');
    const bname = String((b as any)?.name || '');
    return aname.localeCompare(bname, 'ja');
  });

  const customStatHeaders = watch('customStatHeaders') || [];

  // Filter fields to only show players belonging to the current team
  // Merge live watched values over field ids: `fields` may not reflect setValue updates
  const statsByIndex = Array.isArray(watchedPlayerStats) ? (watchedPlayerStats as any[]) : [];
  const teamPlayerFields = fields
    .map((field, index) => ({ ...(field as any), ...(statsByIndex[index] ?? {}), id: field.id }))
    .filter(field => {
      const fieldTeamId = (field as any).teamId;
      return fieldTeamId === teamId;
    });

  const teamPlayerIdsInStats = teamPlayerFields.map(f => (f as any).playerId);
  const availablePlayers = sortedAllPlayers.filter(p => !teamPlayerIdsInStats.includes(p.id));

  const getWatchedIndexByPlayerId = (pid: string): number => {
    const stats = Array.isArray(watchedPlayerStats) ? (watchedPlayerStats as any[]) : [];
    return stats.findIndex((row) => row && row.teamId === teamId && String(row.playerId || '') === pid);
  };

  const starters = teamPlayerFields.filter(f => ((f as any).role ?? 'starter') === 'starter');
  const bench = teamPlayerFields.filter(f => (f as any).role === 'sub');

  const highestRating = useMemo(() => {
    const stats = Array.isArray(watchedPlayerStats) ? (watchedPlayerStats as any[]) : [];
    const ratings = stats
      .filter((row) => row && row.teamId === teamId)
      .map((row) => Number(row.rating))
      .filter((rating) => Number.isFinite(rating));
    return ratings.length > 0 ? Math.max(...ratings) : null;
  }, [teamId, watchedPlayerStats]);

  const sortedBench = useMemo(() => {
    return [...bench].sort((a, b) => {
      const orderA = positionOrder((a as any).position);
      const orderB = positionOrder((b as any).position);
      if (orderA !== orderB) return orderA - orderB;
      const pA = allPlayers.find((p) => p.id === (a as any).playerId) as any;
      const pB = allPlayers.find((p) => p.id === (b as any).playerId) as any;
      const numA = typeof pA?.number === 'number' ? pA.number : Number.POSITIVE_INFINITY;
      const numB = typeof pB?.number === 'number' ? pB.number : Number.POSITIVE_INFINITY;
      if (numA !== numB) return numA - numB;
      return String((a as any).playerName || '').localeCompare(String((b as any).playerName || ''), 'ja');
    });
  }, [bench, allPlayers]);

  useEffect(() => {
    const stats = Array.isArray(watchedPlayerStats) ? (watchedPlayerStats as any[]) : [];
    // Pass 1: first claimant keeps each explicitly-set valid slot (per team)
    const slotOwner = new Map<number, number>();
    stats.forEach((ps, index) => {
      if (!ps) return;
      if (ps.teamId !== teamId) return;
      if ((ps.role ?? 'starter') !== 'starter') return;
      const slot = Number(ps.starterSlot);
      if (Number.isInteger(slot) && slot >= 0 && slot <= 10 && !slotOwner.has(slot)) {
        slotOwner.set(slot, index);
      }
    });
    // Pass 2: keep claimed slots, assign free slots to starters without one, demote overflow
    stats.forEach((ps, index) => {
      if (!ps) return;
      if (ps.teamId !== teamId) return;
      const isStarter = (ps.role ?? 'starter') === 'starter';
      const slot = Number(ps.starterSlot);
      if (isStarter && slotOwner.get(slot) === index) return;
      if (isStarter) {
        let nextSlot = -1;
        for (let s = 0; s <= 10; s += 1) {
          if (!slotOwner.has(s)) {
            nextSlot = s;
            break;
          }
        }
        if (nextSlot !== -1) {
          slotOwner.set(nextSlot, index);
          setValue(`playerStats.${index}.starterSlot` as any, nextSlot, { shouldDirty: false });
          return;
        }
        setValue(`playerStats.${index}.role` as any, 'sub', { shouldDirty: false });
      }
      if (ps.starterSlot !== undefined) {
        setValue(`playerStats.${index}.starterSlot` as any, undefined as any, { shouldDirty: false });
      }
    });
  }, [teamId, derivedBenchMinutes, (watchedPlayerStats || []).map((ps: any) => `${ps?.teamId}:${ps?.role}:${ps?.starterSlot}`).join(','), setValue]);

  const handleAddPlayer = (playerId: string, role: 'starter' | 'sub') => {
    const player = allPlayers.find(p => p.id === playerId);
    if (!player) return;

    // prevent duplicate selection across starters and bench
    if (teamPlayerIdsInStats.includes(player.id)) {
      toast.warning('同じ選手を複数枠に登録することはできません。');
      return;
    }

    const currentStartersCount = starters.length;
    const currentBenchCount = bench.length;
    if (role === 'starter' && currentStartersCount >= 11) {
      toast.warning('スタメンは最大11人までです。');
      return;
    }
    if (role === 'sub' && currentBenchCount >= 12) {
      toast.warning('ベンチは最大12人までです。');
      return;
    }

    const add = role === 'starter' ? prepend : append;

    add({
      playerId: player.id,
      playerName: player.name,
      position: player.position || 'N/A',
      teamId,
      role,
      rating: undefined,
      minutesPlayed: role === 'starter' ? matchDuration : 0,
      goals: 0,
      assists: 0,
      yellowCards: 0,
      redCards: 0,
      customStats: customStatHeaders.map((h: any) => ({ id: h.id, name: h.name, value: '' })),
    });
  };

  const setBenchPlayer = (fieldId: string, playerId: string) => {
    const nextPlayerId = playerId === NONE_SELECT_VALUE ? '' : playerId;
    const globalIndex = fields.findIndex((ff) => ff.id === fieldId);
    if (globalIndex === -1) return;

    const currentRow = watch(`playerStats.${globalIndex}` as any) as any;
    const currentPlayerId = String(currentRow?.playerId || '');

    if (!nextPlayerId) {
      remove(globalIndex);
      return;
    }

    if (teamPlayerIdsInStats.includes(nextPlayerId) && currentPlayerId !== nextPlayerId) {
      const otherIndex = getWatchedIndexByPlayerId(nextPlayerId);
      if (otherIndex !== -1) {
        const otherRow = watch(`playerStats.${otherIndex}` as any) as any;

        const keepA = {
          teamId: currentRow?.teamId,
          role: currentRow?.role,
          starterSlot: currentRow?.starterSlot,
        };
        const keepB = {
          teamId: otherRow?.teamId,
          role: otherRow?.role,
          starterSlot: otherRow?.starterSlot,
        };

        update(globalIndex, { ...otherRow, ...keepA } as any);
        update(otherIndex, { ...currentRow, ...keepB } as any);
        return;
      }

      toast.warning('同じ選手を複数枠に登録することはできません。');
      return;
    }

    const player = allPlayers.find((p) => p.id === nextPlayerId);
    if (!player) return;

    const base = {
      playerId: player.id,
      playerName: player.name,
      position: player.position || 'N/A',
      teamId,
      role: 'sub',
      rating: undefined,
      minutesPlayed: 0,
      goals: 0,
      assists: 0,
      yellowCards: 0,
      redCards: 0,
      customStats: customStatHeaders.map((h: any) => ({ id: h.id, name: h.name, value: '' })),
    };

    update(globalIndex, { ...currentRow, ...base } as any);
  };

  const setStarterSlotPlayer = (slot: number, playerId: string) => {
    const nextPlayerId = playerId === NONE_SELECT_VALUE ? '' : playerId;
    const existingInSlot = starters.find((f) => (f as any).starterSlot === slot);
    const existingInSlotIndex = existingInSlot ? fields.findIndex((ff) => ff.id === (existingInSlot as any).id) : -1;

    if (existingInSlot && (existingInSlot as any).playerId === nextPlayerId) {
      return;
    }

    if (!nextPlayerId) {
      if (existingInSlotIndex !== -1) {
        remove(existingInSlotIndex);
      }
      return;
    }

    if (teamPlayerIdsInStats.includes(nextPlayerId) && (existingInSlot as any)?.playerId !== nextPlayerId) {
      const otherIndex = getWatchedIndexByPlayerId(nextPlayerId);
      if (otherIndex !== -1 && existingInSlotIndex !== -1) {
        const currentRow = watch(`playerStats.${existingInSlotIndex}` as any) as any;
        const otherRow = watch(`playerStats.${otherIndex}` as any) as any;

        const keepA = {
          teamId: currentRow?.teamId,
          role: currentRow?.role,
          starterSlot: slot,
        };
        const keepB = {
          teamId: otherRow?.teamId,
          role: otherRow?.role,
          starterSlot: otherRow?.starterSlot,
        };

        update(existingInSlotIndex, { ...otherRow, ...keepA } as any);
        update(otherIndex, { ...currentRow, ...keepB } as any);
        return;
      }

      if (otherIndex !== -1 && existingInSlotIndex === -1) {
        // ベンチ登録済みの選手を空きスタメン枠へ昇格する。
        // 交代INイベントがある選手はその出場分を、なければフル出場とする。
        const otherRow = watch(`playerStats.${otherIndex}`) as Record<string, unknown> | undefined;
        const promotedMinutes = derivedBenchMinutes.get(nextPlayerId) ?? matchDuration;
        update(otherIndex, {
          ...otherRow,
          role: 'starter',
          starterSlot: slot,
          minutesPlayed: promotedMinutes,
        });
        return;
      }

      toast.warning('同じ選手を複数枠に登録することはできません。');
      return;
    }

    const player = allPlayers.find((p) => p.id === nextPlayerId);
    if (!player) return;

    const base = {
      playerId: player.id,
      playerName: player.name,
      position: player.position || 'N/A',
      teamId,
      role: 'starter',
      starterSlot: slot,
      rating: undefined,
      minutesPlayed: matchDuration,
      goals: 0,
      assists: 0,
      yellowCards: 0,
      redCards: 0,
      customStats: customStatHeaders.map((h: any) => ({ id: h.id, name: h.name, value: '' })),
    };

    if (existingInSlotIndex !== -1) {
      // preserve existing stats when swapping player
      const cur = watch(`playerStats.${existingInSlotIndex}` as any) as any;
      update(existingInSlotIndex, { ...cur, ...base } as any);
      return;
    }

    append(base as any);
  };

  const pitchSlots = useMemo(() => getFormationSlots(selectedFormation), [selectedFormation]);

  const renderPitchSlot = (slot: number) => {
    const slotField = starters.find((f) => (f as any).starterSlot === slot);
    const currentPlayerId = (slotField as any)?.playerId || '';
    const hasEvents = Array.isArray(watchedEvents) && watchedEvents.length > 0;
    // イベント記録後も「空きスロットへの選手登録」は許可する。
    // ロックするのは登録済み選手の入れ替え・削除のみ
    // （交代イベントが登録済み選手を参照するため、既存枠の変更を防ぐ）。
    const slotLocked = hasEvents && Boolean(currentPlayerId);
    const options = sortedAllPlayers.filter((p) => {
      const isCurrentPlayer = p.id === currentPlayerId;
      const isBench = bench.some(b => (b as any).playerId === p.id || b.id === p.id);
      return !teamPlayerIdsInStats.includes(p.id) || isCurrentPlayer || isBench;
    });

    const player = currentPlayerId ? allPlayers.find((p) => p.id === currentPlayerId) : null;
    const photoUrl = player
      ? (player as any).photoURL || (player as any).photoUrl || (player as any).imageUrl || (player as any).profileImageUrl || (player as any).avatarUrl || ''
      : '';
    const statIndex = currentPlayerId ? getWatchedIndexByPlayerId(currentPlayerId) : -1;
    const statRow = statIndex >= 0 ? (watch(`playerStats.${statIndex}` as any) as any) : null;
    const goalsValue = currentPlayerId ? (derivedCounts.goals.get(currentPlayerId) ?? Number(statRow?.goals || 0)) : 0;
    const assistsValue = currentPlayerId ? (derivedCounts.assists.get(currentPlayerId) ?? Number(statRow?.assists || 0)) : 0;
    const yellowValue = currentPlayerId ? (derivedCounts.yellow.get(currentPlayerId) ?? Number(statRow?.yellowCards || 0)) : 0;
    const redValue = currentPlayerId ? (derivedCounts.red.get(currentPlayerId) ?? Number(statRow?.redCards || 0)) : 0;
    const ratingNumber = Number(statRow?.rating);
    const hasRating = Number.isFinite(ratingNumber);
    const ratingValue = hasRating ? ratingNumber.toFixed(1) : '-';
    const pos = pitchSlots[slot];

    const selectOverlay = !slotLocked ? (
      <>
        <button
          type="button"
          onClick={() => setMobilePicker({
            title: '選手を選択',
            value: currentPlayerId || NONE_SELECT_VALUE,
            options: [
              { value: NONE_SELECT_VALUE, label: '未選択' },
              ...options.filter(p => bench.some(b => (b as any).playerId === p.id || b.id === p.id)).map((p) => ({ value: p.id, label: `[ベンチ] #${p.number ?? '-'} ${p.name}` })),
              ...options.filter(p => !bench.some(b => (b as any).playerId === p.id || b.id === p.id)).map((p) => ({ value: p.id, label: `#${p.number ?? '-'} ${p.name}` })),
            ],
            onSelect: (value) => setStarterSlotPlayer(slot, value),
          })}
          className="absolute inset-0 z-20 h-full w-full cursor-pointer opacity-0 sm:hidden"
          aria-label="選手を選択"
        />
        <select
          value={currentPlayerId || NONE_SELECT_VALUE}
          onChange={(e) => {
            const val = e.target.value;
            if (val === currentPlayerId) return;
            setStarterSlotPlayer(slot, val);
          }}
          className="hidden absolute inset-0 z-20 h-full w-full cursor-pointer border-0 bg-transparent p-0 text-transparent opacity-0 shadow-none focus:ring-0 focus:ring-offset-0 sm:block"
          aria-label="選手を選択"
        >
          <option value={NONE_SELECT_VALUE}>未選択</option>
          {options.map((p) => (
            <option key={p.id} value={p.id}>
              #{p.number ?? '-'} {p.name}
            </option>
          ))}
        </select>
      </>
    ) : null;

    const ratingOverlay = player ? (
      <select
        value={hasRating ? ratingValue : ''}
        onChange={(e) => {
          const val = e.target.value;
          const currentValue = hasRating ? ratingValue : '';
          if (val === currentValue || !val || Number.isNaN(parseFloat(val))) return;
          if (statIndex >= 0) setValue(`playerStats.${statIndex}.rating` as any, parseFloat(val), { shouldDirty: true });
        }}
        className="absolute -right-2 -top-2 z-30 h-8 w-8 cursor-pointer border-0 bg-transparent p-0 text-transparent opacity-0 shadow-none focus:ring-0 focus:ring-offset-0"
        aria-label="評価点を選択"
      >
        <option value="" />
        {[...ratingOptions].reverse().map((rating) => (
          <option key={rating} value={rating}>
            ★{rating}
          </option>
        ))}
      </select>
    ) : null;

    return (
      <PitchSlotAnchor key={`pitch-slot-${slot}`} x={pos.x} y={pos.y}>
        {player ? (
          <PlayerNode
            highestRating={highestRating}
            alwaysShowRating
            overlay={selectOverlay}
            ratingOverlay={ratingOverlay}
            player={{
              name: player.name || statRow?.playerName || '',
              number: typeof (player as any).number === 'number' ? (player as any).number : undefined,
              photoUrl,
              rating: statRow?.rating,
              goals: goalsValue,
              assists: assistsValue,
              yellowCards: yellowValue,
              redCards: redValue,
              subInMinute: currentPlayerId ? subMinuteMaps.inMap.get(currentPlayerId) : undefined,
              subOutMinute: currentPlayerId ? subMinuteMaps.outMap.get(currentPlayerId) : undefined,
            }}
          />
        ) : (
          <EmptySlotNode label={pos.label} overlay={selectOverlay} />
        )}
      </PitchSlotAnchor>
    );
  };

  // ベンチカード下部に表示するカスタムスタッツ入力（従来の行UIと同じ編集機能を維持）
  const renderCustomStatInputs = (globalIndex: number) => {
    if (customStatHeaders.length === 0) return null;
    const customStatPath = `playerStats.${globalIndex}.customStats`;
    const customStats = watch(customStatPath) || [];
    return (
      <div className="flex w-[86px] flex-wrap justify-center gap-x-2 gap-y-1">
        {customStatHeaders.map((header: { id: string; name: string }, headerIndex: number) => {
          if (!customStats[headerIndex]) {
            setValue(`${customStatPath}.${headerIndex}`, { id: header.id, name: header.name, value: '' });
          }
          return (
            <div key={header.id} className="flex items-center gap-1">
              <span className="text-gray-500 text-[8px]">{header.name}</span>
              <Input
                {...control.register(`playerStats.${globalIndex}.customStats.${headerIndex}.value`, {
                  valueAsNumber: true,
                })}
                type="number"
                className="h-5 w-10 text-center text-[9px] bg-white text-gray-900"
              />
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="mt-8 -mx-4 space-y-4 sm:mx-0">
      {mobilePicker ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 px-4 sm:hidden" onClick={() => setMobilePicker(null)}>
          <div className="w-full max-w-md overflow-hidden rounded-[28px] bg-[#f4f4f6] shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex h-12 items-center justify-between border-b border-slate-300/80 bg-white px-4">
              <button type="button" className="text-base font-bold text-blue-500" onClick={() => setMobilePicker(null)}>
                キャンセル
              </button>
              <div className="text-sm font-bold text-slate-500">{mobilePicker.title}</div>
              <button type="button" className="text-base font-bold text-blue-500" onClick={() => setMobilePicker(null)}>
                完了
              </button>
            </div>
            <div ref={pickerScrollRef} className="relative h-[56vh] overflow-y-auto px-5 py-[22vh] [scroll-snap-type:y_mandatory]">
              {mobilePicker.options.map((option) => {
                const isPressed = pressedPickerValue === option.value;
                const isSelected = option.value === mobilePicker.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    data-picker-selected={isSelected ? "true" : undefined}
                    onPointerDown={() => setPressedPickerValue(option.value)}
                    onClick={() => {
                      setPressedPickerValue(option.value);
                      window.setTimeout(() => {
                        mobilePicker.onSelect(option.value);
                        setMobilePicker(null);
                        setPressedPickerValue(null);
                      }, 140);
                    }}
                    className={`block h-14 w-full scroll-mt-[22vh] [scroll-snap-align:center] truncate rounded-xl text-center text-[22px] font-bold leading-[56px] transition-colors ${isPressed ? 'bg-blue-500/25 text-blue-700' : isSelected ? 'bg-blue-500/10 text-blue-600' : 'text-slate-400'}`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
      {/* Starters（公開ページと同一の LineupPitch / PlayerNode） */}
      <div>
        <LineupPitch
          formation={selectedFormation}
          formationBadge={
            <div className="absolute right-3 top-3 z-20 cursor-pointer rounded-full border border-slate-600 bg-slate-950/70 px-2 py-1 text-[10px] font-black tracking-wide text-white shadow-sm">
              {selectedFormation}
              <button
                type="button"
                onClick={() => setMobilePicker({
                  title: 'フォーメーションを選択',
                  value: selectedFormation,
                  options: FORMATION_OPTIONS.map((formation) => ({ value: formation, label: formation })),
                  onSelect: handleFormationChange,
                })}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0 sm:hidden"
                aria-label="フォーメーションを選択"
              />
              <select
                value={selectedFormation}
                onChange={(e) => handleFormationChange(e.target.value)}
                className="hidden absolute inset-0 h-full w-full cursor-pointer border-0 bg-transparent p-0 text-transparent opacity-0 shadow-none focus:ring-0 focus:ring-offset-0 sm:block"
                aria-label="フォーメーションを選択"
              >
                {FORMATION_OPTIONS.map((formation) => (
                  <option key={formation} value={formation} className="text-slate-900">
                    {formation}
                  </option>
                ))}
              </select>
            </div>
          }
          topLeft={
            <div className="absolute left-3 top-3 z-20 rounded-full border border-slate-600 bg-slate-950/70 px-2 py-1 text-[10px] font-black tracking-wide text-white shadow-sm">
              {starters.length} / 11
            </div>
          }
        >
          {pitchSlots.map((pos, slot) => renderPitchSlot(slot))}
        </LineupPitch>
        <div className="mt-2 px-4 sm:px-0">
          {Array.isArray(watchedEvents) && watchedEvents.length > 0 ? (
            <p className="text-center text-xs font-semibold text-amber-400">⚠️ イベント記録後は登録済み選手の入れ替え・削除不可（空き枠への登録は可）</p>
          ) : (
            <p className="text-center text-xs font-semibold text-slate-500">タップで選手を追加 / 変更 / 削除</p>
          )}
        </div>
      </div>

      {/* Substitutes（公開ページと同一カードUI + 編集オーバーレイ） */}
      <div className="mt-6 space-y-2 px-4 sm:px-0">
        <h4 className="text-center text-xs font-semibold text-muted-foreground">Substitutes（最大12人）</h4>
        <div className="flex snap-x snap-mandatory gap-2 overflow-x-auto pb-2">
          {sortedBench.map((field) => {
            const globalIndex = fields.findIndex((f) => f.id === (field as any).id);
            if (globalIndex === -1) return null;
            const currentPlayerId = String(watch(`playerStats.${globalIndex}.playerId`) || (field as any)?.playerId || '');
            const bp = currentPlayerId ? (allPlayers.find((p) => p.id === currentPlayerId) as any) : undefined;
            const statRow = watch(`playerStats.${globalIndex}` as any) as any;
            const goalsValue = currentPlayerId ? (derivedCounts.goals.get(currentPlayerId) ?? Number(statRow?.goals || 0)) : 0;
            const assistsValue = currentPlayerId ? (derivedCounts.assists.get(currentPlayerId) ?? Number(statRow?.assists || 0)) : 0;
            const yellowValue = currentPlayerId ? (derivedCounts.yellow.get(currentPlayerId) ?? Number(statRow?.yellowCards || 0)) : 0;
            const redValue = currentPlayerId ? (derivedCounts.red.get(currentPlayerId) ?? Number(statRow?.redCards || 0)) : 0;
            const ratingNumber = Number(statRow?.rating);
            const hasRating = Number.isFinite(ratingNumber);
            const ratingValue = hasRating ? ratingNumber.toFixed(1) : '-';
            const photoUrl = bp
              ? bp.photoURL || bp.photoUrl || bp.imageUrl || bp.profileImageUrl || bp.avatarUrl || ''
              : '';

            const selectOverlay = (
              <>
                <button
                  type="button"
                  onClick={() => setMobilePicker({
                    title: 'ベンチ選手を選択',
                    value: currentPlayerId || NONE_SELECT_VALUE,
                    options: [
                      { value: NONE_SELECT_VALUE, label: '未選択' },
                      ...sortedAllPlayers.map((p) => ({ value: p.id, label: `#${p.number ?? '-'} ${p.name}` })),
                    ],
                    onSelect: (value) => setBenchPlayer((field as any).id, value),
                  })}
                  className="absolute inset-0 z-20 h-full w-full cursor-pointer rounded-lg opacity-0 sm:hidden"
                  aria-label="ベンチ選手を選択"
                />
                <select
                  value={currentPlayerId || NONE_SELECT_VALUE}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === currentPlayerId) return;
                    setBenchPlayer((field as any).id, val);
                  }}
                  className="hidden absolute inset-0 z-20 h-full w-full cursor-pointer rounded-lg border-0 bg-transparent p-0 text-transparent opacity-0 shadow-none focus:ring-0 focus:ring-offset-0 sm:block"
                  aria-label="ベンチ選手を選択"
                >
                  <option value={NONE_SELECT_VALUE}>未選択</option>
                  {sortedAllPlayers.map((p) => (
                    <option key={p.id} value={p.id}>
                      #{p.number ?? '-'} {p.name}
                    </option>
                  ))}
                </select>
              </>
            );

            const ratingOverlay = (
              <select
                value={hasRating ? ratingValue : ''}
                onChange={(e) => {
                  const val = e.target.value;
                  const currentValue = hasRating ? ratingValue : '';
                  if (val === currentValue || !val || Number.isNaN(parseFloat(val))) return;
                  setValue(`playerStats.${globalIndex}.rating` as any, parseFloat(val), { shouldDirty: true });
                }}
                className="absolute -right-2 -top-2 z-30 h-8 w-8 cursor-pointer border-0 bg-transparent p-0 text-transparent opacity-0 shadow-none focus:ring-0 focus:ring-offset-0"
                aria-label="評価点を選択"
              >
                <option value="" />
                {[...ratingOptions].reverse().map((rating) => (
                  <option key={rating} value={rating}>
                    ★{rating}
                  </option>
                ))}
              </select>
            );

            return (
              <div key={(field as any).id} className="flex shrink-0 snap-start flex-col items-center gap-1.5">
                <SubstituteCard
                  highestRating={highestRating}
                  overlay={selectOverlay}
                  ratingOverlay={ratingOverlay}
                  player={{
                    name: bp?.name || (field as any)?.playerName || '',
                    number: typeof bp?.number === 'number' ? bp.number : undefined,
                    photoUrl,
                    rating: statRow?.rating,
                    goals: goalsValue,
                    assists: assistsValue,
                    yellowCards: yellowValue,
                    redCards: redValue,
                    subInMinute: currentPlayerId ? subMinuteMaps.inMap.get(currentPlayerId) : undefined,
                    subOutMinute: currentPlayerId ? subMinuteMaps.outMap.get(currentPlayerId) : undefined,
                  }}
                />
                {renderCustomStatInputs(globalIndex)}
              </div>
            );
          })}
          <AddSubCard
            overlay={
              <>
                <button
                  type="button"
                  onClick={() => setMobilePicker({
                    title: 'ベンチに選手を追加',
                    value: '',
                    options: availablePlayers.map((p) => ({ value: p.id, label: `#${p.number ?? '-'} ${p.name}` })),
                    onSelect: (value) => handleAddPlayer(value, 'sub'),
                  })}
                  className="absolute inset-0 z-20 h-full w-full cursor-pointer rounded-lg opacity-0 sm:hidden"
                  aria-label="ベンチに選手を追加"
                />
                <select
                  value={benchAddValue}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (!val) return;
                    handleAddPlayer(val, 'sub');
                    setBenchAddValue('');
                  }}
                  className="hidden absolute inset-0 z-20 h-full w-full cursor-pointer rounded-lg border-0 bg-transparent p-0 text-transparent opacity-0 shadow-none focus:ring-0 focus:ring-offset-0 sm:block"
                  aria-label="ベンチに選手を追加"
                >
                  <option value="">{availablePlayers.length > 0 ? 'ベンチに選手を追加...' : '登録できる選手がありません'}</option>
                  {availablePlayers.map((p) => (
                    <option key={p.id} value={p.id}>
                      #{p.number ?? '-'} {p.name}
                    </option>
                  ))}
                </select>
              </>
            }
          />
        </div>
      </div>
    </div>
  );
}
