"use client";

type StatRow = {
  season: string;
  league: string;
  rank: string;
};

type CupRow = {
  tournament: string;
  result: string;
};

type TransferRow = {
  date: string;
  playerName: string;
  type: string;
  fromTo: string;
};

type CoachInfo = {
  name: string;
  bio: string;
};

export function PreviewPanel({
  leagueCompetitionName,
  competitionNames,
  onLeagueCompetitionNameChange,
  cupCompetitionNames,
  stats,
  cups,
  onCupsChange,
  transfers,
  coach,
}: {
  leagueCompetitionName: string | null;
  competitionNames: string[];
  onLeagueCompetitionNameChange: (next: string | null) => void;
  cupCompetitionNames: string[];
  stats: StatRow[];
  cups: CupRow[];
  onCupsChange: (next: CupRow[]) => void;
  transfers: TransferRow[];
  coach: CoachInfo;
}) {
  return (
    <details className="rounded-md border bg-white" open>
      <summary className="cursor-pointer select-none px-3 py-2 text-xs font-semibold text-gray-700">右下（プレビュー）</summary>
      <div className="p-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="border border-gray-300">
            <div className="bg-gray-50 px-2 py-1 text-[9px] font-semibold whitespace-nowrap">リーグ成績（過去5シーズン）</div>
            <div className="p-2 border-b border-gray-200">
              <div className="text-[9px] text-gray-600 mb-1 whitespace-nowrap">大会（リーグ）を選択</div>
              <select
                value={leagueCompetitionName || ""}
                onChange={(e) => onLeagueCompetitionNameChange(String(e.target.value || "").trim() || null)}
                className="w-full rounded border border-gray-200 bg-white px-2 py-1 text-[10px]"
              >
                <option value="">（リーグ大会を選択）</option>
                {competitionNames.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
            <table className="w-full text-[10px]">
              <thead>
                <tr>
                  <th className="border border-gray-300 px-1 py-[2px] text-left text-[9px] whitespace-nowrap">シーズン</th>
                  <th className="border border-gray-300 px-1 py-[2px] text-left text-[9px] whitespace-nowrap">リーグ</th>
                  <th className="border border-gray-300 px-1 py-[2px] text-right text-[9px] whitespace-nowrap">順位</th>
                </tr>
              </thead>
              <tbody>
                {stats.map((row, idx) => (
                  <tr key={idx}>
                    <td className="border border-gray-300 px-1 py-[2px]">{row.season}</td>
                    <td className="border border-gray-300 px-1 py-[2px]">{row.league}</td>
                    <td className="border border-gray-300 px-1 py-[2px] text-right">{row.rank}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="border border-gray-300">
            <div className="bg-gray-50 px-2 py-1 text-[9px] font-semibold whitespace-nowrap">昨シーズン 他大会成績</div>
            <table className="w-full text-[10px]">
              <thead>
                <tr>
                  <th className="border border-gray-300 px-1 py-[2px] text-left text-[9px] whitespace-nowrap">大会</th>
                  <th className="border border-gray-300 px-1 py-[2px] text-left text-[9px] whitespace-nowrap">成績</th>
                </tr>
              </thead>
              <tbody>
                {cups.map((c, idx) => (
                  <tr key={idx}>
                    <td className="border border-gray-300 px-1 py-[2px]">
                      <select
                        value={c.tournament || ""}
                        onChange={(e) => {
                          const v = String(e.target.value || "");
                          const next = cups.slice();
                          next[idx] = { ...next[idx], tournament: v };
                          onCupsChange(next);
                        }}
                        className="w-full rounded border border-gray-200 bg-white px-1 py-[2px] text-[10px]"
                      >
                        <option value="">（大会を選択）</option>
                        {cupCompetitionNames.map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="border border-gray-300 px-1 py-[2px]">
                      <input
                        value={c.result || ""}
                        onChange={(e) => {
                          const v = String(e.target.value || "");
                          const next = cups.slice();
                          next[idx] = { ...next[idx], result: v };
                          onCupsChange(next);
                        }}
                        className="w-full rounded border border-gray-200 bg-white px-1 py-[2px] text-[10px]"
                        placeholder="ベスト8"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {Array.isArray(transfers) && transfers.length > 0 && (
              <div className="mt-2 border-t border-gray-200">
                <div className="bg-gray-50 px-2 py-1 text-[9px] font-semibold whitespace-nowrap">移籍情報</div>
                <ul className="p-2 text-[10px] space-y-1">
                  {transfers.map((t, idx) => (
                    <li key={idx} className="border-b border-gray-200 pb-1">
                      <span className="font-semibold">{t.type}</span>
                      <span className="mx-2">{t.playerName}</span>
                      <span className="text-gray-600">{t.fromTo}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </details>
  );
}
