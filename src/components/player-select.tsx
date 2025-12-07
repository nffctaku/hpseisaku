"use client";

import { useState } from 'react';
import { Player } from '@/types/match';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

interface PlayerSelectProps {
  allPlayers: Player[];
  availablePlayers: Player[];
  selectedPlayerId: string | undefined;
  onSelect: (playerId: string) => void;
  placeholder: string;
}

export function PlayerSelect({ allPlayers, availablePlayers, selectedPlayerId, onSelect, placeholder }: PlayerSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const selectedPlayer = selectedPlayerId ? allPlayers.find(p => p.id === selectedPlayerId) : null;

  const handleSelect = (playerId: string) => {
    onSelect(playerId);
    setOpen(false);
    setSearch(''); // Close and reset search
  };

  const filteredPlayers = availablePlayers.filter(p => 
    p.name.toLowerCase().includes(search.toLowerCase()) || 
    `#${p.number}`.includes(search)
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          className="w-24 h-10 rounded-full bg-primary text-primary-foreground focus:ring-0 flex items-center justify-center p-0 border-2 border-primary-foreground/50"
        >
          <span className="text-sm font-semibold">
            {selectedPlayer ? selectedPlayer.name.substring(0, 10) : placeholder}
          </span>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{placeholder}を選択</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <Input 
            placeholder="選手を検索..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="max-h-[400px] overflow-y-auto space-y-1">
            {selectedPlayerId && (
              <Button variant="destructive" onClick={() => handleSelect('CLEAR_SELECTION')} className="w-full">
                選手をクリア
              </Button>
            )}
            {filteredPlayers.length > 0 ? (
              filteredPlayers.map(p => (
                <div 
                  key={p.id}
                  onClick={() => handleSelect(p.id)}
                  className="p-2 rounded-md hover:bg-accent cursor-pointer"
                >
                  {`#${p.number} ${p.name}`}
                </div>
              ))
            ) : (
              <div className="text-center text-sm text-muted-foreground p-4">選手が見つかりません。</div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
