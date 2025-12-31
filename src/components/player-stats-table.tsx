"use client";

import { useFormContext, useFieldArray } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { CustomStatManager } from './custom-stat-manager';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import { Player } from '@/types/match';
import { toast } from 'sonner';

const ratingOptions = (() => {
  const start = 4.5;
  const end = 10.0;
  const steps = Math.round((end - start) / 0.1);
  const all = Array.from({ length: steps + 1 }, (_, i) => (start + i * 0.1).toFixed(1));

  const pivot = all.indexOf('7.0');
  if (pivot === -1) return all;
  const below = all.slice(0, pivot);
  const above = all.slice(pivot + 1);
  return [...below, '7.0', ...above];
})();
const starterMinutesOptions = (() => {
  // 45 を中心に表示したい
  // 上: 1..44, 中央: 45, 下: 46..145, 0 は末尾
  const above = Array.from({ length: 44 }, (_, i) => String(i + 1));
  const center = ['45'];
  const below = Array.from({ length: 100 }, (_, i) => String(46 + i)); // 46..145
  return [...above, ...center, ...below, '0'];
})();
const benchMinutesOptions = Array.from({ length: 146 }, (_, i) => i.toString());

export function PlayerStatsTable({ teamId, allPlayers }: { teamId: string, allPlayers: Player[] }) {
  console.log(`PlayerStatsTable (${teamId}): Received allPlayers`, allPlayers);
  const { control, watch, setValue } = useFormContext();
  const { fields, append, remove } = useFieldArray({
    control,
    name: 'playerStats',
  });

  const customStatHeaders = watch('customStatHeaders') || [];

  // Filter fields to only show players belonging to the current team
  console.log(`PlayerStatsTable (${teamId}): All fields in form`, fields);
  console.log(`PlayerStatsTable (${teamId}): All players for this team`, allPlayers);

  const teamPlayerFields = fields.filter(field =>
    allPlayers.some(p => p.id === (field as any).playerId)
  );

  const teamPlayerIdsInStats = teamPlayerFields.map(f => (f as any).playerId);
  const availablePlayers = allPlayers.filter(p => !teamPlayerIdsInStats.includes(p.id));

  const starters = teamPlayerFields.filter(f => ((f as any).role ?? 'starter') === 'starter');
  const bench = teamPlayerFields.filter(f => (f as any).role === 'sub');

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
    if (role === 'sub' && currentBenchCount >= 15) {
      toast.warning('ベンチは最大15人までです。');
      return;
    }

    append({
      playerId: player.id,
      playerName: player.name,
      position: player.position || 'N/A',
      teamId,
      role,
      rating: 7.0,
      minutesPlayed: role === 'starter' ? 45 : 0,
      goals: 0,
      assists: 0,
      yellowCards: 0,
      redCards: 0,
      customStats: customStatHeaders.map((h: any) => ({ id: h.id, name: h.name, value: '' })),
    });
  };

  const renderPlayerRow = (field: any) => {
    const globalIndex = fields.findIndex(f => f.id === field.id);
    if (globalIndex === -1) return null;

    const role = (field as any).role ?? 'starter';
    const customStatPath = `playerStats.${globalIndex}.customStats`;
    const ratingFieldName = `playerStats.${globalIndex}.rating`;
    const minutesFieldName = `playerStats.${globalIndex}.minutesPlayed`;
    const customStats = watch(customStatPath) || [];
    const rawRating = watch(ratingFieldName);
    const ratingValue =
      typeof rawRating === 'number' &&
      Number.isFinite(rawRating) &&
      rawRating >= 4.5 &&
      rawRating <= 10.0
        ? rawRating.toFixed(1)
        : '';

    return (
      <div key={field.id} className="space-y-1">
        <div className="rounded-md border bg-white px-3 py-2 text-gray-900">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 w-10 text-center">
                {field.position}
              </span>
              <span className="font-medium text-sm truncate">{field.playerName}</span>
            </div>

            <div className="flex flex-col gap-2 text-xs min-w-0 max-w-full md:flex-row md:flex-wrap md:items-end md:justify-end">
              <div className="flex flex-wrap items-end gap-2 justify-start md:justify-end">
                <div className="flex flex-col items-center">
                  <span className="text-[10px] text-gray-500">評価</span>
                  <Select value={ratingValue} onValueChange={(val) => setValue(ratingFieldName, parseFloat(val))}>
                    <SelectTrigger className="h-7 w-20 text-xs bg-white text-gray-900">
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

                <div className="flex flex-col items-center">
                  <span className="text-[10px] text-gray-500">出場分</span>
                  <Select
                    value={watch(minutesFieldName)?.toString() ?? ""}
                    onValueChange={(val) => setValue(minutesFieldName, parseInt(val, 10))}
                  >
                    <SelectTrigger className="h-7 w-20 text-xs bg-white text-gray-900">
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

              <div className="flex flex-wrap items-end gap-2 justify-start md:justify-end">
                <div className="flex flex-col items-center">
                  <span className="text-[10px] text-gray-500">G</span>
                  <Input
                    type="number"
                    min="0"
                    max="10"
                    readOnly
                    className="h-7 w-10 text-center text-sm bg-gray-100 text-gray-900 cursor-default"
                    {...control.register(`playerStats.${globalIndex}.goals`)}
                  />
                </div>

                <div className="flex flex-col items-center">
                  <span className="text-[10px] text-gray-500">A</span>
                  <Input
                    type="number"
                    min="0"
                    max="10"
                    readOnly
                    className="h-7 w-10 text-center text-sm bg-gray-100 text-gray-900 cursor-default"
                    {...control.register(`playerStats.${globalIndex}.assists`)}
                  />
                </div>

                <div className="flex flex-col items-center">
                  <span className="text-[10px] text-gray-500">Y</span>
                  <Input
                    type="number"
                    min="0"
                    max="2"
                    readOnly
                    className="h-7 w-10 text-center text-sm bg-gray-100 text-gray-900 cursor-default"
                    {...control.register(`playerStats.${globalIndex}.yellowCards`)}
                  />
                </div>

                <div className="flex flex-col items-center">
                  <span className="text-[10px] text-gray-500">R</span>
                  <Input
                    type="number"
                    min="0"
                    max="1"
                    readOnly
                    className="h-7 w-10 text-center text-sm bg-gray-100 text-gray-900 cursor-default"
                    {...control.register(`playerStats.${globalIndex}.redCards`)}
                  />
                </div>

                <Button variant="ghost" size="icon" onClick={() => remove(globalIndex)} className="shrink-0">
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
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
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">選手スタッツ</h3>
        <CustomStatManager />
      </div>

      {/* Starters */}
      <div className="space-y-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h4 className="text-sm font-semibold text-gray-300">スタメン（最大11人）</h4>
          <Select onValueChange={(val) => handleAddPlayer(val, 'starter')} value="">
            <SelectTrigger className="bg-white text-gray-900 w-full sm:w-52 h-8 text-xs">
              <SelectValue placeholder="スタメンに選手を追加..." />
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
        {starters.map(field => renderPlayerRow(field as any))}
      </div>

      {/* Bench */}
      <div className="mt-6 space-y-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h4 className="text-sm font-semibold text-gray-300">ベンチ（最大15人）</h4>
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
        {bench.map(field => renderPlayerRow(field as any))}
      </div>
    </div>
  );
}
