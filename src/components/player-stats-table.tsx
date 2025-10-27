"use client";

import { useFormContext, useFieldArray } from 'react-hook-form';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { CustomStatManager } from './custom-stat-manager';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import { Player } from '@/types/match';

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
  
  // Find players of the current team that are not yet in the stats table
  const availablePlayers = allPlayers.filter(p => !teamPlayerIdsInStats.includes(p.id));

  const handleAddPlayer = (playerId: string) => {
    const player = allPlayers.find(p => p.id === playerId);
    if (!player) return;

    append({
      playerId: player.id,
      playerName: player.name,
      position: player.position || 'N/A',
      rating: 0, minutesPlayed: 0, goals: 0, assists: 0, yellowCards: 0, redCards: 0,
      customStats: customStatHeaders.map((h: any) => ({ id: h.id, name: h.name, value: '' })),
    });
  };

  return (
    <div className="mt-8">
      <h3 className="text-lg font-semibold mb-2">選手スタッツ</h3>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[200px]">選手名</TableHead>
              <TableHead>PO</TableHead>
              <TableHead>評価点</TableHead>
              <TableHead>出場時間</TableHead>
              <TableHead>G</TableHead>
              <TableHead>A</TableHead>
              <TableHead>Y</TableHead>
              <TableHead>R</TableHead>
              {customStatHeaders.map((header: { id: string; name: string }) => (
                <TableHead key={header.id}>{header.name}</TableHead>
              ))}
              <TableHead><CustomStatManager /></TableHead>
              <TableHead className="w-[50px]"></TableHead> 
            </TableRow>
          </TableHeader>
          <TableBody>
            {teamPlayerFields.map((field, index) => {
              // Important: Use the global index from `fields` for react-hook-form register
              const globalIndex = fields.findIndex(f => f.id === field.id);
              if (globalIndex === -1) return null;

              return (
                <TableRow key={field.id}>
                  <TableCell className="font-medium">{(field as any).playerName}</TableCell>
                  <TableCell>{(field as any).position}</TableCell>
                  <TableCell><Input type="number" step="0.1" {...control.register(`playerStats.${globalIndex}.rating`)} className="w-20" /></TableCell>
                  <TableCell><Input type="number" {...control.register(`playerStats.${globalIndex}.minutesPlayed`)} className="w-20" /></TableCell>
                  <TableCell><Input type="number" {...control.register(`playerStats.${globalIndex}.goals`)} className="w-16" /></TableCell>
                  <TableCell><Input type="number" {...control.register(`playerStats.${globalIndex}.assists`)} className="w-16" /></TableCell>
                  <TableCell><Input type="number" {...control.register(`playerStats.${globalIndex}.yellowCards`)} className="w-16" /></TableCell>
                  <TableCell><Input type="number" {...control.register(`playerStats.${globalIndex}.redCards`)} className="w-16" /></TableCell>
                  {customStatHeaders.map((header: { id: string; name: string }, headerIndex: number) => {
                    const customStatPath = `playerStats.${globalIndex}.customStats`;
                    const customStats = watch(customStatPath) || [];
                    if (!customStats[headerIndex]) {
                      setValue(`${customStatPath}.${headerIndex}`, { id: header.id, name: header.name, value: '' });
                    }
                    return (
                      <TableCell key={header.id}>
                        <Input {...control.register(`playerStats.${globalIndex}.customStats.${headerIndex}.value`)} className="w-20" />
                      </TableCell>
                    );
                  })}
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => remove(globalIndex)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
            {/* Add Player Row */}
            <TableRow>
              <TableCell className="font-medium">
                <Select onValueChange={handleAddPlayer} value="">
                  <SelectTrigger>
                    <SelectValue placeholder="選手を追加..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availablePlayers.map(p => (
                      <SelectItem key={p.id} value={p.id}>
                        {`#${p.number} ${p.name}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TableCell>
              {/* Empty cells to align with the header */}
              <TableCell></TableCell>
              <TableCell></TableCell>
              <TableCell></TableCell>
              <TableCell></TableCell>
              <TableCell></TableCell>
              <TableCell></TableCell>
              <TableCell></TableCell>
              {customStatHeaders.map((h: any) => <TableCell key={h.id}></TableCell>)}
              <TableCell></TableCell>
              <TableCell></TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
