"use client";

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useFormContext, useFieldArray, useWatch } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import { Player } from '@/types/match';
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

const getFormationSlots = (formation: string) => {
  const lines = formation
    .split('-')
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v) && v > 0);
  const outfieldTotal = lines.reduce((sum, count) => sum + count, 0);
  const normalizedLines = outfieldTotal === 10 && lines.length > 0 ? lines : [4, 3, 3];
  const yByLineCount: Record<number, number[]> = {
    3: [68, 45, 20],
    4: [70, 53, 35, 17],
    5: [72, 58, 44, 30, 16],
  };
  const yList = yByLineCount[normalizedLines.length] || Array.from(
    { length: normalizedLines.length },
    (_, index) => 70 - index * (55 / Math.max(normalizedLines.length - 1, 1))
  );
  const slots = [{ label: 'GK', x: 50, y: 88 }];

  normalizedLines.forEach((count, lineIndex) => {
    const y = yList[lineIndex] ?? 50;
    const label = lineIndex === 0 ? 'DF' : lineIndex === normalizedLines.length - 1 ? 'FW' : 'MF';
    const xMinByCount: Record<number, number> = { 2: 34, 3: 24, 4: 15, 5: 10 };
    const xMaxByCount: Record<number, number> = { 2: 66, 3: 76, 4: 85, 5: 90 };
    const xMin = xMinByCount[count] ?? 12;
    const xMax = xMaxByCount[count] ?? 88;
    const xs = count === 1
      ? [50]
      : Array.from({ length: count }, (_, index) => xMin + index * ((xMax - xMin) / (count - 1)));

    xs.forEach((x) => {
      slots.push({ label, x, y });
    });
  });

  return slots.slice(0, 11);
};

const positionOrder = (position: any) => {
  const value = String(position || '').toUpperCase();
  if (value.includes('GK')) return 0;
  if (value.includes('DF') || value.includes('CB') || value.includes('SB') || value.includes('RB') || value.includes('LB')) return 1;
  if (value.includes('MF') || value.includes('DM') || value.includes('CM') || value.includes('AM') || value.includes('WB') || value.includes('SH')) return 2;
  if (value.includes('FW') || value.includes('ST') || value.includes('CF') || value.includes('WG')) return 3;
  return 99;
};

const getPositionPillClassName = (position: any) => {
  const value = String(position || '').toUpperCase();
  if (value.includes('GK')) return 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30';
  if (value.includes('DF') || value.includes('CB') || value.includes('SB') || value.includes('RB') || value.includes('LB')) return 'bg-blue-500/20 text-blue-300 border border-blue-500/30';
  if (value.includes('MF') || value.includes('DM') || value.includes('CM') || value.includes('AM') || value.includes('WB') || value.includes('SH')) return 'bg-green-500/20 text-green-300 border border-green-500/30';
  if (value.includes('FW') || value.includes('ST') || value.includes('CF') || value.includes('WG')) return 'bg-red-500/20 text-red-300 border border-red-500/30';
  return 'bg-slate-600/20 text-slate-300 border border-slate-500/30';
};

export function PlayerStatsTable({ teamId, allPlayers, matchDuration = 90, onFormationChange, isHomeTeam }: { teamId: string, allPlayers: Player[], matchDuration?: number, onFormationChange?: (formation: string) => void, isHomeTeam?: boolean }) {
  console.log(`PlayerStatsTable v3 (${teamId}): Received allPlayers`, allPlayers);
  const { control, watch, setValue } = useFormContext();
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
  const formationStorageKey = `match_lineup_formation_${teamId}`;
  
  // Use isHomeTeam prop to determine which formation field to use
  const currentFormation = isHomeTeam !== undefined ? (isHomeTeam ? watchedHomeFormation : watchedAwayFormation) : watchedHomeFormation;
  
  const [selectedFormation, setSelectedFormation] = useState(() => {
    // Try to get from form first, then fallback to localStorage
    if (currentFormation) return currentFormation;
    try {
      const savedFormation = localStorage.getItem(formationStorageKey);
      if (savedFormation && FORMATION_OPTIONS.includes(savedFormation)) {
        return savedFormation;
      }
    } catch {
      // ignore storage errors
    }
    return '4-3-3';
  });

  useEffect(() => {
    // Update selected formation when form value changes
    if (currentFormation && currentFormation !== selectedFormation) {
      setSelectedFormation(currentFormation);
    }
  }, [currentFormation]);

  useEffect(() => {
    if (currentFormation) return;
    try {
      const savedFormation = localStorage.getItem(formationStorageKey);
      if (savedFormation && FORMATION_OPTIONS.includes(savedFormation) && savedFormation !== selectedFormation) {
        setSelectedFormation(savedFormation);
      }
    } catch {
      // ignore storage errors
    }
  }, [currentFormation, formationStorageKey]);

  const handleFormationChange = (formation: string) => {
    setSelectedFormation(formation);
    try {
      localStorage.setItem(formationStorageKey, formation);
    } catch {
      // ignore storage errors
    }
    if (onFormationChange) {
      onFormationChange(formation);
    }
  };

  const derivedCounts = useMemo(() => {
    const events = Array.isArray(watchedEvents) ? (watchedEvents as any[]) : [];
    const goals = new Map<string, number>();
    const assists = new Map<string, number>();
    const yellow = new Map<string, number>();
    const red = new Map<string, number>();

    events.forEach((ev: any) => {
      const type = typeof ev?.type === 'string' ? ev.type : '';
      // OGは選手の得点としてカウントしない
      if (type === 'goal') {
        if (ev.playerId) goals.set(ev.playerId, (goals.get(ev.playerId) || 0) + 1);
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
  }, [watchedEvents]);

  const derivedStarterMinutes = useMemo(() => {
    const events = Array.isArray(watchedEvents) ? (watchedEvents as any[]) : [];
    const outMinuteByPlayerId = new Map<string, number>();
    const halfTime = matchDuration / 2; // 90分の場合45分、120分の場合60分

    events
      .filter((ev: any) => ev?.type === 'substitution')
      .forEach((ev: any) => {
        const outId = typeof ev?.outPlayerId === 'string' ? ev.outPlayerId : '';
        if (!outId) return;
        if (ev?.teamId !== teamId) return;
        
        // Parse minute string (e.g., "45+9" -> base: 45, stoppage: 9)
        const minuteStr = typeof ev?.minute === 'string' ? ev.minute : String(ev?.minute);
        let baseMinute = 0;
        let stoppageMinute = 0;
        
        if (minuteStr.includes('+')) {
          const parts = minuteStr.split('+');
          baseMinute = parseInt(parts[0], 10) || 0;
          stoppageMinute = parseInt(parts[1], 10) || 0;
        } else {
          baseMinute = parseInt(minuteStr, 10) || 0;
        }

        // Apply new calculation rules
        let calculatedMinute: number;
        
        if (baseMinute === halfTime && stoppageMinute > 0) {
          // First half stoppage time substitution
          // OUT player → playing time is halfTime minutes
          calculatedMinute = halfTime;
        } else if (baseMinute === matchDuration && stoppageMinute > 0) {
          // Second half stoppage time substitution
          // OUT player → playing time is matchDuration minutes (considered full time)
          calculatedMinute = matchDuration;
        } else {
          // Normal time substitution: use base minute as before
          const m = typeof ev?.minute === 'number' ? ev.minute : Number(ev?.minute);
          calculatedMinute = Number.isFinite(m) ? Math.max(0, Math.floor(m)) : 0;
        }

        const cur = outMinuteByPlayerId.get(outId);
        if (typeof cur === 'number') {
          outMinuteByPlayerId.set(outId, Math.min(cur, calculatedMinute));
        } else {
          outMinuteByPlayerId.set(outId, calculatedMinute);
        }
      });

    return outMinuteByPlayerId;
  }, [teamId, watchedEvents, matchDuration]);

  // Calculate bench player minutes (IN substitutions)
  const derivedBenchMinutes = useMemo(() => {
    const events = Array.isArray(watchedEvents) ? (watchedEvents as any[]) : [];
    const inMinuteByPlayerId = new Map<string, number>();
    const halfTime = matchDuration / 2; // 90分の場合45分、120分の場合60分

    events
      .filter((ev: any) => ev?.type === 'substitution')
      .forEach((ev: any) => {
        const inId = typeof ev?.inPlayerId === 'string' ? ev.inPlayerId : '';
        if (!inId) return;
        if (ev?.teamId !== teamId) return;
        
        // Parse minute string (e.g., "45+9" -> base: 45, stoppage: 9)
        const minuteStr = typeof ev?.minute === 'string' ? ev.minute : String(ev?.minute);
        let baseMinute = 0;
        let stoppageMinute = 0;
        
        if (minuteStr.includes('+')) {
          const parts = minuteStr.split('+');
          baseMinute = parseInt(parts[0], 10) || 0;
          stoppageMinute = parseInt(parts[1], 10) || 0;
        } else {
          baseMinute = parseInt(minuteStr, 10) || 0;
        }

        // Apply new calculation rules for IN players
        let calculatedMinute: number;
        
        if (baseMinute === halfTime && stoppageMinute > 0) {
          // First half stoppage time substitution
          // IN player → playing time is halfTime minutes (halfTime to matchDuration)
          calculatedMinute = halfTime;
        } else if (baseMinute === matchDuration && stoppageMinute > 0) {
          // Second half stoppage time substitution
          // IN player → playing time is fixed at 1 minute
          calculatedMinute = 1;
        } else {
          // Normal time substitution: use base minute
          // Playing time = matchDuration - baseMinute
          calculatedMinute = Math.max(0, matchDuration - baseMinute);
        }

        inMinuteByPlayerId.set(inId, calculatedMinute);
      });

    return inMinuteByPlayerId;
  }, [teamId, watchedEvents, matchDuration]);

  // Automatically calculate and update minutesPlayed based on substitution events and matchDuration
  useEffect(() => {
    const stats = Array.isArray(watchedPlayerStats) ? (watchedPlayerStats as any[]) : [];
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
      setValue(`playerStats.${idx}.minutesPlayed` as any, desired, { shouldDirty: true });
    });
  }, [derivedStarterMinutes, derivedBenchMinutes, matchDuration, teamId, watchedPlayerStats, setValue]);

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
  const teamPlayerFields = fields.filter(field => {
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
    stats.forEach((ps, index) => {
      if (!ps) return;
      if (ps.teamId !== teamId) return;
      if ((ps.role ?? 'starter') !== 'starter') return;
      const slot = Number(ps.starterSlot);
      if (Number.isInteger(slot) && slot >= 0 && slot <= 10) return;
      setValue(`playerStats.${index}.starterSlot` as any, index, { shouldDirty: false });
    });
  }, [teamId, watchedPlayerStats, setValue]);

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
    const showRedCard = redValue > 0 || yellowValue >= 2;
    const wasSubstituted = currentPlayerId && watchedEvents.some(
      (e: any) => e?.type === 'substitution' && (e?.outPlayerId === currentPlayerId || e?.inPlayerId === currentPlayerId) && e?.teamId === teamId
    );
    const minutesValue = currentPlayerId
      ? Number.isFinite(Number(statRow?.minutesPlayed))
        ? Number(statRow?.minutesPlayed)
        : matchDuration
      : 0;
    const ratingNumber = Number(statRow?.rating);
    const hasRating = Number.isFinite(ratingNumber);
    const ratingValue = hasRating ? ratingNumber.toFixed(1) : '-';
    const ratingClassName = !hasRating
      ? 'bg-slate-700/80'
      : highestRating !== null && ratingNumber === highestRating
        ? 'bg-violet-500/85'
        : ratingNumber >= 7
          ? 'bg-emerald-500/90'
          : 'bg-orange-500/90';
    const pos = pitchSlots[slot];

    return (
      <div
        key={`pitch-slot-${slot}`}
        className="absolute -translate-x-1/2 -translate-y-1/2"
        style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
      >
        <div className="relative flex w-[62px] flex-col items-center gap-0.5 overflow-visible sm:w-[82px]">
          {!hasEvents ? (
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
              className="absolute inset-0 z-20 h-full w-full opacity-0 sm:hidden"
              aria-label="選手を選択"
            />
          ) : null}
          <Select value={currentPlayerId} onValueChange={(val) => setStarterSlotPlayer(slot, val)} disabled={hasEvents}>
            <SelectTrigger className="h-auto w-full overflow-visible border-0 bg-transparent p-0 shadow-none focus:ring-0 focus:ring-offset-0 [&>svg]:hidden">
              <div className="flex w-full flex-col items-center gap-0.5 overflow-visible">
                <div className="relative flex h-9 w-9 items-center justify-center rounded-full border border-slate-300/45 bg-slate-500/30 shadow-[0_0_0_3px_rgba(255,255,255,0.06)] sm:h-11 sm:w-11">
                  <div
                    className="h-full w-full rounded-full bg-slate-600/70 bg-cover bg-center"
                    style={photoUrl ? { backgroundImage: `url(${photoUrl})` } : undefined}
                  />
                  {!player ? (
                    <div className="absolute inset-0 flex items-center justify-center text-slate-200/90">
                      <div className="relative h-4 w-4 rounded-full border border-current before:absolute before:left-1/2 before:top-[62%] before:h-2 before:w-4 before:-translate-x-1/2 before:rounded-t-full before:border before:border-b-0 before:border-current sm:h-5 sm:w-5 sm:before:h-2.5 sm:before:w-4" />
                    </div>
                  ) : null}
                  {goalsValue > 0 ? (
                    <span className="absolute -left-2 -top-2 inline-flex h-[10px] items-center gap-0 rounded-full bg-amber-500 px-1 py-0 text-[8px] font-bold leading-none text-white shadow-sm">
                      <svg viewBox="0 0 8 8" className="shrink-0 fill-none stroke-current" style={{ width: 10.5, height: 10.5 }} aria-hidden="true">
                        <circle cx="4" cy="4" r="2.85" strokeWidth="0.65" />
                        <path d="M4 2.1 5.25 3 4.8 4.55H3.2L2.75 3 4 2.1Z" strokeWidth="0.45" strokeLinejoin="round" />
                        <path d="M2.75 3 1.75 2.7M5.25 3l1-.3M3.2 4.55l-.7 1M4.8 4.55l.7 1" strokeWidth="0.4" strokeLinecap="round" />
                      </svg>
                      {goalsValue}
                    </span>
                  ) : null}
                  {assistsValue > 0 ? (
                    <span className="absolute -right-2 -top-2 inline-flex h-[10px] items-center gap-0 rounded-full bg-sky-500 px-1 py-0 text-[8px] font-bold leading-none text-white shadow-sm">
                      <svg viewBox="0 0 8 8" className="shrink-0 -translate-x-[2px] -rotate-45 fill-none stroke-current" style={{ width: 10.5, height: 10.5 }} aria-hidden="true">
                        <path d="M1.2 5.1c1.5.1 2.7-.4 3.6-1.7l1 1 1.1.4c.4.1.7.5.7.9H1.7c-.3 0-.5-.2-.5-.5v-.1Z" strokeWidth="0.65" strokeLinejoin="round" />
                        <path d="M3.9 4.3 4.6 5M4.8 3.5l.7.7" strokeWidth="0.5" strokeLinecap="round" />
                      </svg>
                      {assistsValue}
                    </span>
                  ) : null}
                  {showRedCard ? (
                    <span className="absolute -left-1.5 top-1/2 h-4 w-2.5 -translate-y-1/2 rounded-[2px] bg-red-500 shadow-sm" />
                  ) : null}
                  {yellowValue > 0 ? (
                    <span className="absolute -right-1.5 top-1/2 h-4 w-2.5 -translate-y-1/2 rounded-[2px] bg-yellow-400 shadow-sm" />
                  ) : null}
                  {player?.number ? (
                    <span className="absolute -left-1 -bottom-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-slate-900/80 px-1 text-[9px] font-bold leading-none text-white shadow-sm">
                      {player.number}
                    </span>
                  ) : null}
                  <span className="absolute -right-1 -bottom-1 flex h-4 w-4 items-center justify-center rounded-full border border-slate-700 bg-slate-200 text-xs font-light leading-none text-slate-600">+</span>
                </div>
                <div className="w-[62px] truncate text-center text-[8px] font-semibold uppercase leading-tight tracking-wide text-slate-300 sm:w-[82px] sm:text-[9px]">
                  {player ? player.name : pos.label}
                </div>
              </div>
            </SelectTrigger>
            <SelectContent className="max-h-[82vh] w-[calc(100vw-24px)] min-w-[calc(100vw-24px)] rounded-3xl border-slate-200 bg-white p-3 shadow-2xl sm:w-[420px] sm:min-w-[420px]">
              {currentPlayerId ? (
                <SelectItem value={NONE_SELECT_VALUE} className="mb-2 h-14 rounded-2xl px-4 text-lg font-bold text-slate-500 focus:bg-slate-100">
                  未選択
                </SelectItem>
              ) : null}
              {bench.length > 0 && options.filter(p => bench.some(b => (b as any).playerId === p.id || b.id === p.id)).length > 0 && (
                <>
                  {options.filter(p => bench.some(b => (b as any).playerId === p.id || b.id === p.id)).map((p) => (
                    <SelectItem key={p.id} value={p.id} className="mb-2 min-h-16 rounded-2xl px-4 py-4 text-lg font-bold text-slate-900 focus:bg-emerald-50 focus:text-emerald-700">
                      <span className="flex items-center gap-3">
                        <span className="inline-flex h-11 min-w-11 items-center justify-center rounded-full bg-slate-900 px-2 text-base font-black text-white">#{p.number ?? '-'}</span>
                        <span className="min-w-0 truncate">[ベンチ] {p.name}</span>
                      </span>
                    </SelectItem>
                  ))}
                </>
              )}
              {options.filter(p => !bench.some(b => (b as any).playerId === p.id || b.id === p.id)).map((p) => (
                <SelectItem key={p.id} value={p.id} className="mb-2 min-h-16 rounded-2xl px-4 py-4 text-lg font-bold text-slate-900 focus:bg-emerald-50 focus:text-emerald-700">
                  <span className="flex items-center gap-3">
                    <span className="inline-flex h-11 min-w-11 items-center justify-center rounded-full bg-slate-900 px-2 text-base font-black text-white">#{p.number ?? '-'}</span>
                    <span className="min-w-0 truncate">{p.name}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {player ? (
            <div className="mt-2 flex w-[62px] flex-col items-center justify-center gap-0.5 text-[7px] font-bold leading-none text-white sm:w-[70px] sm:text-[8px]">
              <div className="inline-flex h-[11px] items-center gap-0.5 text-[7px] font-bold leading-none text-white sm:text-[8px]">
                {wasSubstituted && <span className="text-red-400 text-[8px]">⇔</span>}
                <span className="inline-flex h-[11px] items-center rounded-full bg-slate-700/80 px-1 py-0 leading-[11px]">{minutesValue}'</span>
                <Select value={hasRating ? ratingValue : ''} onValueChange={(val) => statIndex >= 0 && setValue(`playerStats.${statIndex}.rating` as any, parseFloat(val), { shouldDirty: true })}>
                  <div className="relative inline-flex h-[11px] items-center">
                    <span className={`inline-flex h-[11px] items-center rounded-full px-1 text-[7px] font-bold leading-[11px] text-white sm:text-[8px] ${ratingClassName}`}>★{ratingValue}</span>
                    <SelectTrigger className="absolute inset-0 !h-[11px] !min-h-0 !w-full border-0 bg-transparent p-0 text-transparent opacity-0 shadow-none focus:ring-0 focus:ring-offset-0 [&>svg]:hidden">
                      <SelectValue placeholder="" />
                    </SelectTrigger>
                  </div>
                  <SelectContent>
                    {[...ratingOptions].reverse().map((rating) => (
                      <SelectItem key={rating} value={rating}>
                        ★{rating}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    );
  };

  const renderPlayerRow = (
    field: any,
    opts?: {
      header?: ReactNode;
      showTrash?: boolean;
    }
  ) => {
    const globalIndex = fields.findIndex(f => f.id === field.id);
    if (globalIndex === -1) return null;

    const customStatPath = `playerStats.${globalIndex}.customStats`;
    const ratingFieldName = `playerStats.${globalIndex}.rating`;
    const minutesFieldName = `playerStats.${globalIndex}.minutesPlayed`;
    const customStats = watch(customStatPath) || [];
    const rawRating = watch(ratingFieldName);
    const normalizeCount = (v: any) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

    const playerIdForCounts = String(watch(`playerStats.${globalIndex}.playerId`) || (field as any)?.playerId || "");
    const playerNumber = (() => {
      if (!playerIdForCounts) return undefined;
      const p = allPlayers.find((ap) => ap.id === playerIdForCounts) as any;
      const nRaw = p?.number;
      const n = typeof nRaw === 'number' && Number.isFinite(nRaw) ? nRaw : Number(nRaw);
      return Number.isFinite(n) ? n : undefined;
    })();
    const goalsFromEvents = playerIdForCounts ? (derivedCounts.goals.get(playerIdForCounts) ?? null) : null;
    const assistsFromEvents = playerIdForCounts ? (derivedCounts.assists.get(playerIdForCounts) ?? null) : null;
    const yellowFromEvents = playerIdForCounts ? (derivedCounts.yellow.get(playerIdForCounts) ?? null) : null;
    const redFromEvents = playerIdForCounts ? (derivedCounts.red.get(playerIdForCounts) ?? null) : null;

    const goalsValue = goalsFromEvents ?? normalizeCount(watch(`playerStats.${globalIndex}.goals`));
    const assistsValue = assistsFromEvents ?? normalizeCount(watch(`playerStats.${globalIndex}.assists`));
    const yellowValue = yellowFromEvents ?? normalizeCount(watch(`playerStats.${globalIndex}.yellowCards`));
    const redValue = redFromEvents ?? normalizeCount(watch(`playerStats.${globalIndex}.redCards`));
    const ratingValue =
      typeof rawRating === 'number' &&
      Number.isFinite(rawRating) &&
      rawRating >= 4.0 &&
      rawRating <= 10.0
        ? rawRating.toFixed(1)
        : '';

    return (
      <div key={field.id} className="space-y-1">
        <div className="rounded-md border border-slate-700 bg-slate-900 px-3 py-3 text-slate-100">
          <div className="overflow-x-auto md:overflow-visible">
            <div className="grid min-w-max grid-cols-[minmax(0,1fr)_auto_auto_auto_auto_auto_auto_auto] items-end gap-2 text-xs">
              <div className="min-w-0 self-end">
                {opts?.header ? (
                  opts.header
                ) : (
                  <div className="flex items-end gap-2 min-w-0">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full w-10 text-center ${getPositionPillClassName(field.position)}`}>
                      {field.position}
                    </span>
                    <span className="font-medium text-sm truncate">
                      {playerNumber !== undefined ? `#${playerNumber} ` : ''}
                      {field.playerName}
                    </span>
                  </div>
                )}
              </div>

              <div className="flex flex-col items-center gap-1">
                <span className="text-[10px] text-slate-400">評価</span>
                <Select value={ratingValue} onValueChange={(val) => setValue(ratingFieldName, parseFloat(val), { shouldDirty: true })}>
                  <SelectTrigger size="sm" className="w-20 bg-slate-800 text-slate-100 border-slate-700 shadow-none focus-visible:ring-0">
                    <SelectValue placeholder="-" />
                  </SelectTrigger>
                  <SelectContent>
                    {ratingOptions.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col items-center gap-1">
                <span className="text-[10px] text-slate-400">出場分</span>
                <div className="inline-flex items-center gap-1 h-8 px-2 text-sm text-slate-200 cursor-default shrink-0 pointer-events-none">
                  <span>{watch(minutesFieldName)?.toString() ?? ""}</span>
                  <span className="text-slate-500">⇔</span>
                </div>
              </div>

              <div className="flex flex-col items-center gap-1">
                <span className="text-[10px] text-slate-400">G</span>
                <span className="inline-flex items-center justify-center h-8 w-10 px-2 text-center text-sm bg-slate-700 text-slate-200 rounded-full cursor-default shrink-0 pointer-events-none">
                  {goalsValue}
                </span>
              </div>

              <div className="flex flex-col items-center gap-1">
                <span className="text-[10px] text-slate-400">👟</span>
                <span className="inline-flex items-center justify-center h-8 w-10 px-2 text-center text-sm bg-slate-700 text-slate-200 rounded-full cursor-default shrink-0 pointer-events-none">
                  {assistsValue}
                </span>
              </div>

              <div className="flex flex-col items-center gap-1">
                <span className="text-[10px] text-slate-400">Y</span>
                <span className="inline-flex items-center justify-center h-8 w-10 px-2 text-center text-sm bg-slate-700 text-slate-200 rounded-full cursor-default shrink-0 pointer-events-none">
                  {yellowValue}
                </span>
              </div>

              <div className="flex flex-col items-center gap-1">
                <span className="text-[10px] text-slate-400">R</span>
                <span className="inline-flex items-center justify-center h-8 w-10 px-2 text-center text-sm bg-slate-700 text-slate-200 rounded-full cursor-default shrink-0 pointer-events-none">
                  {redValue}
                </span>
              </div>

              {(opts?.showTrash ?? true) ? (
                <Button type="button" variant="ghost" size="icon" onClick={() => remove(globalIndex)} className="shrink-0">
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              ) : (
                <div />
              )}
            </div>
          </div>
        </div>

        {customStatHeaders.length > 0 && (
          <div className="ml-2 flex flex-wrap gap-2 text-[7px]">
            {customStatHeaders.map((header: { id: string; name: string }, headerIndex: number) => {
              if (!customStats[headerIndex]) {
                setValue(`${customStatPath}.${headerIndex}`, { id: header.id, name: header.name, value: '' });
              }
              return (
                <div key={header.id} className="flex items-center gap-1">
                  <span className="text-gray-500 text-[6px]">{header.name}</span>
                  <Input
                    {...control.register(`playerStats.${globalIndex}.customStats.${headerIndex}.value`, {
                      valueAsNumber: true,
                    })}
                    type="number"
                    className="h-5 w-12 text-center text-[5px] bg-white text-gray-900"
                  />
                </div>
              );
            })}
          </div>
        )}
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
            <div className="relative h-[56vh] overflow-y-auto px-5 py-[22vh] [scroll-snap-type:y_mandatory]">
              {mobilePicker.options.map((option) => {
                const isPressed = pressedPickerValue === option.value;
                const isSelected = option.value === mobilePicker.value;
                return (
                  <button
                    key={option.value}
                    type="button"
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
      {/* Starters */}
      <div className="overflow-hidden rounded-[20px] border border-slate-700/80 bg-[#111827] shadow-[0_18px_50px_rgba(0,0,0,0.28)] sm:rounded-[24px]">
        <div className="flex items-center justify-between gap-3 border-b border-slate-700/80 px-4 py-5 text-white sm:px-5">
          <div className="w-36">
            <button
              type="button"
              onClick={() => setMobilePicker({
                title: 'フォーメーションを選択',
                value: selectedFormation,
                options: FORMATION_OPTIONS.map((formation) => ({ value: formation, label: formation })),
                onSelect: handleFormationChange,
              })}
              className="h-11 w-full rounded-full border border-slate-500/50 bg-slate-700/50 px-5 text-left text-sm font-semibold text-white shadow-none sm:hidden"
              aria-label="フォーメーションを選択"
            >
              {selectedFormation}
            </button>
            <Select value={selectedFormation} onValueChange={handleFormationChange}>
              <SelectTrigger className="hidden h-11 rounded-full border border-slate-500/50 bg-slate-700/50 px-5 text-sm font-semibold text-white shadow-none focus:ring-0 focus:ring-offset-0 sm:flex">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-[82vh] w-[calc(100vw-24px)] min-w-[calc(100vw-24px)] rounded-3xl border-slate-200 bg-white p-3 shadow-2xl sm:w-[420px] sm:min-w-[420px]">
                {FORMATION_OPTIONS.map((formation) => (
                  <SelectItem key={formation} value={formation} className="mb-2 min-h-16 rounded-2xl px-4 py-4 text-lg font-bold text-slate-900 focus:bg-emerald-50 focus:text-emerald-700">
                    {formation}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="shrink-0 rounded-full border border-slate-500/50 bg-slate-700/50 px-4 py-2 text-sm font-semibold text-slate-100">
            {starters.length} / 11
          </div>
        </div>
        <div className="relative mx-auto aspect-[7/10] w-full overflow-hidden bg-[#0f1722] sm:aspect-[5/6] sm:max-w-[520px]">
          <div className="absolute inset-x-[6%] inset-y-[4%] border-2 border-slate-400/14" />
          <div className="absolute inset-x-[28%] top-[4%] h-[13%] border-x-2 border-b-2 border-slate-400/14" />
          <div className="absolute inset-x-[38%] top-[4%] h-[6%] border-x-2 border-b-2 border-slate-400/14" />
          <div className="absolute inset-x-[28%] bottom-[4%] h-[13%] border-x-2 border-t-2 border-slate-400/14" />
          <div className="absolute inset-x-[38%] bottom-[4%] h-[6%] border-x-2 border-t-2 border-slate-400/14" />
          <div className="absolute inset-x-[6%] top-1/2 h-px bg-slate-400/14" />
          <div className="absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-slate-400/14" />
          <div className="absolute inset-0 bg-[repeating-linear-gradient(0deg,rgba(255,255,255,0.025)_0px,rgba(255,255,255,0.025)_52px,transparent_52px,transparent_104px)]" />
          {pitchSlots.map((_, slot) => renderPitchSlot(slot))}
        </div>
        <div className="border-t border-slate-700/80 bg-[#142033] px-4 py-4 sm:px-5">
          {Array.isArray(watchedEvents) && watchedEvents.length > 0 ? (
            <p className="text-center text-xs font-semibold text-amber-400">⚠️ 試合イベントの記録後は入れ替え不可</p>
          ) : (
            <p className="hidden text-center text-sm font-semibold text-slate-500 sm:block">タップで選手を追加 / 削除</p>
          )}
        </div>
      </div>

      {/* Bench */}
      <div className="mt-6 space-y-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h4 className="text-sm font-semibold text-gray-300">ベンチ（最大12人）</h4>
          <button
            type="button"
            onClick={() => setMobilePicker({
              title: 'ベンチに選手を追加',
              value: '',
              options: availablePlayers.map((p) => ({ value: p.id, label: `#${p.number ?? '-'} ${p.name}` })),
              onSelect: (value) => handleAddPlayer(value, 'sub'),
            })}
            className="h-12 w-full rounded-2xl border border-slate-300 bg-white px-4 text-left text-sm font-bold text-gray-900 shadow-sm sm:hidden"
            aria-label="ベンチに選手を追加"
          >
            ベンチに選手を追加...
          </button>
          <Select onValueChange={(val) => handleAddPlayer(val, 'sub')} value="">
            <SelectTrigger className="hidden h-12 w-full rounded-2xl border-slate-300 bg-white px-4 text-sm font-bold text-gray-900 shadow-sm sm:flex sm:w-64">
              <SelectValue placeholder="ベンチに選手を追加..." />
            </SelectTrigger>
            <SelectContent className="max-h-[82vh] w-[calc(100vw-24px)] min-w-[calc(100vw-24px)] rounded-3xl border-slate-200 bg-white p-3 shadow-2xl sm:w-[420px] sm:min-w-[420px]">
              {availablePlayers.map(p => (
                <SelectItem key={p.id} value={p.id} className="mb-2 min-h-16 rounded-2xl px-4 py-4 text-lg font-bold text-slate-900 focus:bg-emerald-50 focus:text-emerald-700">
                  <span className="flex items-center gap-3">
                    <span className="inline-flex h-11 min-w-11 items-center justify-center rounded-full bg-slate-900 px-2 text-base font-black text-white">#{p.number ?? '-'}</span>
                    <span className="min-w-0 truncate">{p.name}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-1 gap-3">
          {sortedBench.map((field) => {
            const globalIndex = fields.findIndex((f) => f.id === (field as any).id);
            if (globalIndex === -1) return null;
            const currentPlayerId = String(watch(`playerStats.${globalIndex}.playerId`) || (field as any)?.playerId || '');
            const options = sortedAllPlayers;
            return renderPlayerRow(field as any, {
              showTrash: true,
              header: (
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full w-10 text-center ${getPositionPillClassName((field as any).position)}`}>
                    {(field as any).position}
                  </span>
                  <button
                    type="button"
                    onClick={() => setMobilePicker({
                      title: 'ベンチ選手を選択',
                      value: currentPlayerId || NONE_SELECT_VALUE,
                      options: [
                        { value: NONE_SELECT_VALUE, label: '未選択' },
                        ...options.map((p) => ({ value: p.id, label: `#${p.number ?? '-'} ${p.name}` })),
                      ],
                      onSelect: (value) => setBenchPlayer((field as any).id, value),
                    })}
                    className="h-11 w-56 rounded-xl border border-slate-600 bg-slate-800 px-4 text-left text-sm font-bold text-slate-100 shadow-sm sm:hidden"
                    aria-label="ベンチ選手を選択"
                  >
                    {options.find((p) => p.id === currentPlayerId)?.name || '選手を選択'}
                  </button>
                  <Select value={currentPlayerId} onValueChange={(val) => setBenchPlayer((field as any).id, val)}>
                    <SelectTrigger className="hidden h-11 w-56 rounded-xl border-slate-600 bg-slate-800 px-4 text-sm font-bold text-slate-100 shadow-sm sm:flex">
                      <SelectValue placeholder="選手を選択" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[82vh] w-[calc(100vw-24px)] min-w-[calc(100vw-24px)] rounded-3xl border-slate-200 bg-white p-3 shadow-2xl sm:w-[420px] sm:min-w-[420px]">
                      <SelectItem value={NONE_SELECT_VALUE} className="mb-2 h-14 rounded-2xl px-4 text-lg font-bold text-slate-500 focus:bg-slate-100">
                        未選択
                      </SelectItem>
                      {options.map((p) => (
                        <SelectItem key={p.id} value={p.id} className="mb-2 min-h-16 rounded-2xl px-4 py-4 text-lg font-bold text-slate-900 focus:bg-emerald-50 focus:text-emerald-700">
                          <span className="flex items-center gap-3">
                            <span className="inline-flex h-11 min-w-11 items-center justify-center rounded-full bg-slate-900 px-2 text-base font-black text-white">#{p.number ?? '-'}</span>
                            <span className="min-w-0 truncate">{p.name}</span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ),
            });
          })}
        </div>
      </div>
    </div>
  );
}
