import React from "react";
import type { BookletPlayer, ColorOption, PositionColors } from "../types";

export function BookletEditPanel({
  players,
  selectedPlayerIds,
  additionalPlayerIds,
  positionColors,
  colorOptions,
  onChangePositionColor,
  onTogglePlayer,
  onToggleAdditionalPlayer,
}: {
  players: BookletPlayer[];
  selectedPlayerIds: string[];
  additionalPlayerIds: string[];
  positionColors: PositionColors;
  colorOptions: ColorOption[];
  onChangePositionColor: (position: keyof PositionColors, value: string) => void;
  onTogglePlayer: (playerId: string) => void;
  onToggleAdditionalPlayer: (playerId: string) => void;
}) {
  return (
    <div className="no-print mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
      <h3 className="text-lg font-semibold mb-2">選手名鑑設定</h3>

      <div className="mb-4">
        <h4 className="text-md font-medium mb-2">ポジションの帯の色</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Object.entries(positionColors).map(([position, color]) => (
            <div key={position} className="flex items-center gap-2">
              <span className="text-sm font-medium w-8">{position}:</span>
              <select
                value={color}
                onChange={(e) => onChangePositionColor(position as keyof PositionColors, e.target.value)}
                className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm"
              >
                {colorOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.name}
                  </option>
                ))}
              </select>
              <div className={`w-6 h-6 ${color} rounded`}></div>
            </div>
          ))}
        </div>
      </div>

      <div className="mb-4">
        <h4 className="text-md font-medium mb-2">メイン選手選択（15名まで）</h4>
        <p className="text-sm text-gray-600 mb-4">
          ブックレットに表示するメイン選手を15名まで選択してください。現在 {selectedPlayerIds.length}/15 名選択中。
        </p>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
          {players.map((player) => (
            <div
              key={player.id}
              className={`p-2 border rounded cursor-pointer transition-colors ${
                selectedPlayerIds.includes(player.id)
                  ? "bg-blue-100 border-blue-500"
                  : "bg-white border-gray-300 hover:bg-gray-50"
              }`}
              onClick={() => onTogglePlayer(player.id)}
            >
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={selectedPlayerIds.includes(player.id)}
                  onChange={() => onTogglePlayer(player.id)}
                  className="rounded"
                  disabled={!selectedPlayerIds.includes(player.id) && selectedPlayerIds.length >= 15}
                />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{player.name}</div>
                  <div className="text-xs text-gray-500">背番号 {player.number} | {player.position}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h4 className="text-md font-medium mb-2">追加選手選択（8名まで）</h4>
        <p className="text-sm text-gray-600 mb-4">
          下の余白に表示する追加選手を8名まで選択してください。現在 {additionalPlayerIds.length}/8 名選択中。
        </p>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
          {players
            .filter((p) => !selectedPlayerIds.includes(p.id))
            .map((player) => (
              <div
                key={player.id}
                className={`p-2 border rounded cursor-pointer transition-colors ${
                  additionalPlayerIds.includes(player.id)
                    ? "bg-green-100 border-green-500"
                    : "bg-white border-gray-300 hover:bg-gray-50"
                }`}
                onClick={() => onToggleAdditionalPlayer(player.id)}
              >
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={additionalPlayerIds.includes(player.id)}
                    onChange={() => onToggleAdditionalPlayer(player.id)}
                    className="rounded"
                    disabled={!additionalPlayerIds.includes(player.id) && additionalPlayerIds.length >= 8}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{player.name}</div>
                    <div className="text-xs text-gray-500">背番号 {player.number} | {player.position}</div>
                  </div>
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
