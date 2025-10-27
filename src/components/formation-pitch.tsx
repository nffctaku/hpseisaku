// c/Users/footb/hpsakusei/src/components/formation-pitch.tsx

"use client";

import { Formation } from '@/lib/formations';
import { Player } from '@/types/match';
import { PlayerSelect } from './player-select';

interface FormationPitchProps {
  formation: Formation;
  squad: { starters: Record<string, string | undefined>, substitutes: string[] };
  allPlayers: Player[];
  onPlayerSelect: (positionId: string, playerId: string) => void;
}

export function FormationPitch({ formation, squad, allPlayers, onPlayerSelect }: FormationPitchProps) {
  return (
    <div 
      className="relative w-full max-w-md mx-auto border border-gray-800 rounded-lg p-4 aspect-square bg-no-repeat bg-center bg-contain"
      style={{ backgroundImage: "url('/pitch.svg')" }}
    >
      {formation.positions.map(pos => {
        const selectedPlayerId = squad.starters[pos.id];

        const availablePlayers = allPlayers.filter(p => 
          // player is not in other starter positions, or is the currently selected player for this position
          (!Object.values(squad.starters).includes(p.id) || p.id === selectedPlayerId) &&
          // player is not a substitute
          !squad.substitutes.includes(p.id)
        );

        return (
          <div key={pos.id} className="absolute" style={{ left: `${100 - pos.coordinates.x}%`, top: `${100 - pos.coordinates.y}%`, transform: 'translate(-50%, -50%)' }}>
            <PlayerSelect
              allPlayers={allPlayers}
              availablePlayers={availablePlayers}
              selectedPlayerId={selectedPlayerId}
              onSelect={(playerId) => onPlayerSelect(pos.id, playerId)}
              placeholder={pos.label}
            />
          </div>
        );
      })}
    </div>
  );
}