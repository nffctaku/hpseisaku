import React from "react";
import type { BookletPlayer } from "../types";

export function BookletAdditionalPlayersTable({
  players,
}: {
  players: BookletPlayer[];
}) {
  if (!players || players.length === 0) return null;

  return (
    <div className="mt-[8mm] px-[6mm]">
      <div className="text-center text-lg font-bold mb-[4mm]">Other Members</div>
      <div className="border border-gray-300">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50">
              <th className="border border-gray-300 px-2 py-1 text-left">背番号</th>
              <th className="border border-gray-300 px-2 py-1 text-left">名前</th>
              <th className="border border-gray-300 px-2 py-1 text-left">ポジション</th>
              <th className="border border-gray-300 px-2 py-1 text-left">身長/体重</th>
              <th className="border border-gray-300 px-2 py-1 text-left">年齢</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p) => (
              <tr key={p.id}>
                <td className="border border-gray-300 px-2 py-1">{p.number ?? "-"}</td>
                <td className="border border-gray-300 px-2 py-1">{p.name}</td>
                <td className="border border-gray-300 px-2 py-1">
                  {((p.position || "").toUpperCase().match(/^(FW|MF|DF|GK)$/)?.[1] as any) || ""}
                </td>
                <td className="border border-gray-300 px-2 py-1">
                  {p.height != null ? `${p.height}cm` : "-"}/{p.weight != null ? `${p.weight}kg` : "-"}
                </td>
                <td className="border border-gray-300 px-2 py-1">{p.age != null ? `${p.age}歳` : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
