"use client";

import { useEffect, useMemo, type ReactNode } from 'react';
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
const starterMinutesOptions = (() => {
  // 90 を中心に表示したい
  // 上: 1..89 (昇順), 中央: 90, 下: 91..145, 0 は末尾
  const above = Array.from({ length: 89 }, (_, i) => String(i + 1)); // 1, 2, ..., 89
  const center = ['90'];
  const below = Array.from({ length: 55 }, (_, i) => String(91 + i)); // 91..145
  return [...above, ...center, ...below, '0'];
})();
const benchMinutesOptions = Array.from({ length: 146 }, (_, i) => i.toString());
const NONE_SELECT_VALUE = "__none__";

export function PlayerStatsTable({ teamId, allPlayers }: { teamId: string, allPlayers: Player[] }) {
  console.log(`PlayerStatsTable v3 (${teamId}): Received allPlayers`, allPlayers);
  const { control, watch, setValue } = useFormContext();
  const { fields, append, prepend, remove } = useFieldArray({
    control,
    name: 'playerStats',
  });

  const watchedPlayerStats = useWatch({ control, name: 'playerStats' });
  const watchedEvents = useWatch({ control, name: 'events' });

  const derivedCounts = useMemo(() => {
    const events = Array.isArray(watchedEvents) ? (watchedEvents as any[]) : [];
    const goals = new Map<string, number>();
    const assists = new Map<string, number>();
    const yellow = new Map<string, number>();
    const red = new Map<string, number>();

    events.forEach((ev: any) => {
      const type = typeof ev?.type === 'string' ? ev.type : '';
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
  console.log(`PlayerStatsTable (${teamId}): All fields in form`, fields);
  console.log(`PlayerStatsTable (${teamId}): All players for this team`, allPlayers);

  const teamPlayerFields = fields.filter(field =>
    allPlayers.some(p => p.id === (field as any).playerId)
  );

  const teamPlayerIdsInStats = teamPlayerFields.map(f => (f as any).playerId);
  const availablePlayers = sortedAllPlayers.filter(p => !teamPlayerIdsInStats.includes(p.id));

  const starters = teamPlayerFields.filter(f => ((f as any).role ?? 'starter') === 'starter');
  const bench = teamPlayerFields.filter(f => (f as any).role === 'sub');

  // Ensure starters have stable slot indices (0-10)
  useEffect(() => {
    const stats = Array.isArray(watchedPlayerStats) ? (watchedPlayerStats as any[]) : [];
    const teamStarters = stats.filter((ps) => {
      if (!ps) return false;
      if (ps.teamId !== teamId) return false;
      return (ps.role ?? 'starter') === 'starter';
    });

    const used = new Set<number>();
    teamStarters.forEach((ps) => {
      const slot = ps?.starterSlot;
      if (typeof slot === 'number' && Number.isInteger(slot) && slot >= 0 && slot <= 10) {
        used.add(slot);
      }
    });

    let next = 0;
    teamStarters.forEach((ps) => {
      const slot = ps?.starterSlot;
      if (typeof slot === 'number' && Number.isInteger(slot) && slot >= 0 && slot <= 10) return;
      while (used.has(next) && next <= 10) next += 1;
      if (next > 10) return;

      const playerId = ps?.playerId;
      if (!playerId) return;
      const globalIndex = stats.findIndex((row) => row?.playerId === playerId);
      if (globalIndex === -1) return;
      setValue(`playerStats.${globalIndex}.starterSlot` as any, next, { shouldDirty: false });
      used.add(next);
      next += 1;
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
      minutesPlayed: role === 'starter' ? 90 : 0,
      goals: 0,
      assists: 0,
      yellowCards: 0,
      redCards: 0,
      customStats: customStatHeaders.map((h: any) => ({ id: h.id, name: h.name, value: '' })),
    });
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
      minutesPlayed: 90,
      goals: 0,
      assists: 0,
      yellowCards: 0,
      redCards: 0,
      customStats: customStatHeaders.map((h: any) => ({ id: h.id, name: h.name, value: '' })),
    };

    if (existingInSlotIndex !== -1) {
      // preserve existing stats when swapping player
      const cur = watch(`playerStats.${existingInSlotIndex}` as any) as any;
      setValue(`playerStats.${existingInSlotIndex}` as any, { ...cur, ...base }, { shouldDirty: true });
      return;
    }

    append(base as any);
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

    const role = (field as any).role ?? 'starter';
    const customStatPath = `playerStats.${globalIndex}.customStats`;
    const ratingFieldName = `playerStats.${globalIndex}.rating`;
    const minutesFieldName = `playerStats.${globalIndex}.minutesPlayed`;
    const customStats = watch(customStatPath) || [];
    const rawRating = watch(ratingFieldName);
    const normalizeCount = (v: any) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

    const playerIdForCounts = String(watch(`playerStats.${globalIndex}.playerId`) || (field as any)?.playerId || "");
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
        <div className="rounded-md border bg-white px-3 py-3 text-gray-900">
          <div className="space-y-2">
            <div className="flex items-center gap-2 min-w-0">
              {opts?.header ? (
                opts.header
              ) : (
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 w-10 text-center">
                    {field.position}
                  </span>
                  <span className="font-medium text-sm truncate">{field.playerName}</span>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-end gap-2 overflow-x-auto md:overflow-visible text-xs">
              <div className="flex items-end gap-2 shrink-0">
                <div className="flex flex-col items-center gap-1">
                  <span className="text-[10px] text-gray-500">評価</span>
                  <Select value={ratingValue} onValueChange={(val) => setValue(ratingFieldName, parseFloat(val))}>
                    <SelectTrigger size="sm" className="w-20 bg-white text-gray-900 shadow-none focus-visible:ring-0">
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
                  <span className="text-[10px] text-gray-500">出場分</span>
                  <Select
                    value={watch(minutesFieldName)?.toString() ?? ""}
                    onValueChange={(val) => setValue(minutesFieldName, parseInt(val, 10))}
                  >
                    <SelectTrigger size="sm" className="w-20 bg-white text-gray-900 shadow-none focus-visible:ring-0">
                      <SelectValue placeholder="-" />
                    </SelectTrigger>
                    <SelectContent>
                      {(role === 'starter' ? starterMinutesOptions : benchMinutesOptions).map((m) => (
                        <SelectItem key={m} value={m}>
                          {m}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-end gap-2">
                <div className="flex flex-col items-center gap-1">
                  <span className="text-[10px] text-gray-500">G</span>
                  <Input
                    type="number"
                    min="0"
                    max="10"
                    readOnly
                    value={goalsValue}
                    className="h-8 w-10 px-0 text-center text-sm bg-gray-100 text-gray-900 cursor-default shrink-0 shadow-none focus-visible:ring-0"
                  />
                </div>

                <div className="flex flex-col items-center gap-1">
                  <span className="text-[10px] text-gray-500">A</span>
                  <Input
                    type="number"
                    min="0"
                    max="10"
                    readOnly
                    value={assistsValue}
                    className="h-8 w-10 px-0 text-center text-sm bg-gray-100 text-gray-900 cursor-default shrink-0 shadow-none focus-visible:ring-0"
                  />
                </div>

                <div className="flex flex-col items-center gap-1">
                  <span className="text-[10px] text-gray-500">Y</span>
                  <Input
                    type="number"
                    min="0"
                    max="2"
                    readOnly
                    value={yellowValue}
                    className="h-8 w-10 px-0 text-center text-sm bg-gray-100 text-gray-900 cursor-default shrink-0 shadow-none focus-visible:ring-0"
                  />
                </div>

                <div className="flex flex-col items-center gap-1">
                  <span className="text-[10px] text-gray-500">R</span>
                  <Input
                    type="number"
                    min="0"
                    max="1"
                    readOnly
                    value={redValue}
                    className="h-8 w-10 px-0 text-center text-sm bg-gray-100 text-gray-900 cursor-default shrink-0 shadow-none focus-visible:ring-0"
                  />
                </div>

                {(opts?.showTrash ?? true) ? (
                  <Button type="button" variant="ghost" size="icon" onClick={() => remove(globalIndex)} className="shrink-0">
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        {customStatHeaders.length > 0 && (
          <div className="ml-2 flex flex-wrap gap-2 text-xs">
            {customStatHeaders.map((header: { id: string; name: string }, headerIndex: number) => {
              if (!customStats[headerIndex]) {
                setValue(`${customStatPath}.${headerIndex}`, { id: header.id, name: header.name, value: '' });
              }
              return (
                <div key={header.id} className="flex items-center gap-1">
                  <span className="text-gray-500">{header.name}</span>
                  <Input
                    {...control.register(`playerStats.${globalIndex}.customStats.${headerIndex}.value`)}
                    className="h-6 w-14 text-center text-xs bg-white text-gray-900"
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
    <div className="mt-8 space-y-4">
      {/* Starters */}
      <div className="space-y-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h4 className="text-sm font-semibold text-gray-300">スタメン（最大11人）</h4>
        </div>
        <div className="grid grid-cols-1 gap-3">
          {Array.from({ length: 11 }).map((_, slot) => {
            const slotField = starters.find((f) => (f as any).starterSlot === slot);
            const currentPlayerId = (slotField as any)?.playerId || '';
            const options = sortedAllPlayers.filter((p) => !teamPlayerIdsInStats.includes(p.id) || p.id === currentPlayerId);

            if (!slotField) {
              return (
                <div key={`starter-slot-${slot}`} className="space-y-1">
                  <div className="rounded-md border bg-white px-3 py-3 text-gray-900">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 w-10 text-center">
                        -
                      </span>
                      <Select value={""} onValueChange={(val) => setStarterSlotPlayer(slot, val)}>
                        <SelectTrigger className="h-8 flex-1 text-xs bg-white text-gray-900">
                          <SelectValue placeholder={`スタメン ${slot + 1} を選択...`} />
                        </SelectTrigger>
                        <SelectContent>
                          {options.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {`#${p.number} ${p.name}`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              );
            }

            return renderPlayerRow(slotField as any, {
              showTrash: false,
              header: (
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 w-10 text-center">
                    {(slotField as any).position}
                  </span>
                  <Select value={currentPlayerId} onValueChange={(val) => setStarterSlotPlayer(slot, val)}>
                    <SelectTrigger className="h-8 w-44 text-xs bg-white text-gray-900">
                      <SelectValue placeholder="選手を選択" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE_SELECT_VALUE}>未選択</SelectItem>
                      {options.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {`#${p.number} ${p.name}`}
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

      {/* Bench */}
      <div className="mt-6 space-y-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h4 className="text-sm font-semibold text-gray-300">ベンチ（最大12人）</h4>
          <Select onValueChange={(val) => handleAddPlayer(val, 'sub')} value="">
            <SelectTrigger className="bg-white text-gray-900 w-full sm:w-52 h-8 text-xs">
              <SelectValue placeholder="ベンチに選手を追加..." />
            </SelectTrigger>
            <SelectContent>
              {availablePlayers.map(p => (
                <SelectItem key={p.id} value={p.id}>
                  {`#${p.number} ${p.name}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-1 gap-3">
          {bench.map(field => renderPlayerRow(field as any))}
        </div>
      </div>
    </div>
  );
}
