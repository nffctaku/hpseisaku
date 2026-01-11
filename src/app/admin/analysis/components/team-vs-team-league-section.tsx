"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";

type MatchLike = {
  id?: string;
  homeTeam?: string;
  awayTeam?: string;
  scoreHome?: number | null;
  scoreAway?: number | null;
  matchDate?: any;
  competitionName?: string;
};

type OpponentStat = {
  opponentId: string;
  opponentName: string;
  matches: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
};

export function TeamVsTeamLeagueSection({
  clubUid,
  teamId,
  matches,
}: {
  clubUid: string;
  teamId: string;
  matches: MatchLike[];
}) {
  const [teamNames, setTeamNames] = useState<Map<string, string>>(new Map());
  const [teamLogos, setTeamLogos] = useState<Map<string, string>>(new Map());
  const [loadingTeams, setLoadingTeams] = useState(true);

  const [selectedOpponent, setSelectedOpponent] = useState<OpponentStat | null>(null);

  useEffect(() => {
    const fetchTeams = async () => {
      setLoadingTeams(true);
      try {
        const teamsSnap = await getDocs(collection(db, "clubs", clubUid, "teams"));
        const nameMap = new Map<string, string>();
        const logoMap = new Map<string, string>();
        teamsSnap.forEach((d) => {
          const teamData = d.data() as any;
          const id = d.id;
          const name = teamData?.name || teamData?.teamName || teamData?.clubName || `チーム ${id.slice(0, 8)}`;
          const logo = teamData?.logoUrl || teamData?.logo || "";
          nameMap.set(id, String(name));
          if (typeof logo === "string" && logo.length > 0) logoMap.set(id, logo);
        });
        setTeamNames(nameMap);
        setTeamLogos(logoMap);
      } finally {
        setLoadingTeams(false);
      }
    };

    fetchTeams();
  }, [clubUid]);

  const scoredMatches = useMemo(() => {
    return (Array.isArray(matches) ? matches : []).filter((m) => {
      if (!m) return false;
      if (m.scoreHome == null || m.scoreAway == null) return false;
      const h = String(m.homeTeam || "");
      const a = String(m.awayTeam || "");
      if (!h || !a) return false;
      return h === teamId || a === teamId;
    });
  }, [matches, teamId]);

  const opponentStats = useMemo(() => {
    const map = new Map<string, OpponentStat>();

    for (const m of scoredMatches) {
      const homeTeamId = String(m.homeTeam || "");
      const awayTeamId = String(m.awayTeam || "");
      const homeScore = typeof m.scoreHome === "number" ? m.scoreHome : 0;
      const awayScore = typeof m.scoreAway === "number" ? m.scoreAway : 0;

      let opponentId = "";
      let myTeamIsHome = false;

      if (homeTeamId === teamId) {
        opponentId = awayTeamId;
        myTeamIsHome = true;
      } else if (awayTeamId === teamId) {
        opponentId = homeTeamId;
        myTeamIsHome = false;
      } else {
        continue;
      }

      if (!opponentId || opponentId === teamId) continue;

      const opponentName = teamNames.get(opponentId) || `対戦相手 ${opponentId.slice(0, 8)}`;
      if (!map.has(opponentId)) {
        map.set(opponentId, {
          opponentId,
          opponentName,
          matches: 0,
          wins: 0,
          draws: 0,
          losses: 0,
          goalsFor: 0,
          goalsAgainst: 0,
          goalDifference: 0,
        });
      }

      const s = map.get(opponentId)!;
      s.matches += 1;

      if (myTeamIsHome) {
        s.goalsFor += homeScore;
        s.goalsAgainst += awayScore;
        if (homeScore > awayScore) s.wins += 1;
        else if (homeScore < awayScore) s.losses += 1;
        else s.draws += 1;
      } else {
        s.goalsFor += awayScore;
        s.goalsAgainst += homeScore;
        if (awayScore > homeScore) s.wins += 1;
        else if (awayScore < homeScore) s.losses += 1;
        else s.draws += 1;
      }

      s.goalDifference = s.goalsFor - s.goalsAgainst;
    }

    const sorted = Array.from(map.values()).sort((a, b) => b.wins - a.wins || b.matches - a.matches);
    return sorted;
  }, [scoredMatches, teamId, teamNames]);

  const opponentMatches = useMemo(() => {
    if (!selectedOpponent) return [] as any[];
    const opponentId = selectedOpponent.opponentId;

    return scoredMatches
      .filter((m) => {
        const h = String(m.homeTeam || "");
        const a = String(m.awayTeam || "");
        return (h === teamId && a === opponentId) || (h === opponentId && a === teamId);
      })
      .map((m) => {
        const isHome = String(m.homeTeam || "") === teamId;
        const myScore = isHome ? (m.scoreHome ?? 0) : (m.scoreAway ?? 0);
        const opponentScore = isHome ? (m.scoreAway ?? 0) : (m.scoreHome ?? 0);
        return {
          ...m,
          isHome,
          myScore,
          opponentScore,
          result: myScore > opponentScore ? "win" : myScore < opponentScore ? "loss" : "draw",
        };
      })
      .sort((a: any, b: any) => {
        const ta = a?.matchDate ? new Date(a.matchDate).getTime() : 0;
        const tb = b?.matchDate ? new Date(b.matchDate).getTime() : 0;
        return tb - ta;
      });
  }, [selectedOpponent, scoredMatches, teamId]);

  const totals = useMemo(() => {
    const totalMatches = opponentStats.reduce((sum, s) => sum + s.matches, 0);
    const totalWins = opponentStats.reduce((sum, s) => sum + s.wins, 0);
    const winRate = totalMatches > 0 ? ((totalWins / totalMatches) * 100).toFixed(1) : "0.0";
    return { totalMatches, totalWins, winRate, opponentCount: opponentStats.length };
  }, [opponentStats]);

  return (
    <div className="relative overflow-hidden rounded-xl bg-slate-800/50 backdrop-blur-xl border border-slate-700">
      <div className="relative pt-3 px-3 pb-2 sm:pt-4 sm:px-4 sm:pb-3">
        <div className="flex items-center gap-2 mb-2">
          <div className="text-white text-sm font-semibold">チーム別対戦成績</div>
          <div className="text-[11px] text-slate-400">リーグ戦</div>
        </div>

        <div className="flex justify-center gap-2 mb-3 flex-nowrap">
          <div className="bg-slate-700/50 rounded-lg p-2 border border-slate-600 text-center flex-1 flex-shrink-0">
            <p className="text-slate-400 text-xs">試合数</p>
            <p className="text-sm font-bold text-white">{totals.totalMatches}</p>
          </div>
          <div className="bg-slate-700/50 rounded-lg p-2 border border-slate-600 text-center flex-1 flex-shrink-0">
            <p className="text-slate-400 text-xs">対チーム数</p>
            <p className="text-sm font-bold text-white">{totals.opponentCount}</p>
          </div>
          <div className="bg-slate-700/50 rounded-lg p-2 border border-slate-600 text-center flex-1 flex-shrink-0">
            <p className="text-slate-400 text-xs">勝率</p>
            <p className="text-sm font-bold text-yellow-400">{totals.winRate}%</p>
          </div>
        </div>

        <div className="bg-slate-800/50 rounded-lg overflow-hidden">
          <div className="p-3 border-b border-slate-700">
            <div className="text-white font-semibold text-sm">対戦相手別成績</div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-700">
                <tr>
                  <th className="text-left py-2 px-2 text-slate-300 font-medium text-xs">対戦相手</th>
                  <th className="text-center py-2 px-2 text-slate-300 font-medium text-xs">試合</th>
                  <th className="text-center py-2 px-2 text-slate-300 font-medium text-xs">勝</th>
                  <th className="text-center py-2 px-2 text-slate-300 font-medium text-xs">分</th>
                  <th className="text-center py-2 px-2 text-slate-300 font-medium text-xs">負</th>
                  <th className="text-center py-2 px-2 text-slate-300 font-medium text-xs">得点</th>
                  <th className="text-center py-2 px-2 text-slate-300 font-medium text-xs">失点</th>
                  <th className="text-center py-2 px-2 text-slate-300 font-medium text-xs">差</th>
                  <th className="text-center py-2 px-2 text-slate-300 font-medium text-xs">勝率</th>
                </tr>
              </thead>
              <tbody>
                {opponentStats.map((opponent) => (
                  <tr key={opponent.opponentId} className="border-t border-slate-700 hover:bg-slate-700/50">
                    <td className="py-2 px-2">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 bg-transparent rounded-full flex items-center justify-center flex-shrink-0">
                          {teamLogos.get(opponent.opponentId) ? (
                            <img
                              src={teamLogos.get(opponent.opponentId)}
                              alt={opponent.opponentName}
                              className="w-full h-full rounded-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full bg-slate-600 rounded-full flex items-center justify-center text-slate-200">
                              <svg
                                viewBox="0 0 24 24"
                                className="w-4 h-4"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                aria-hidden="true"
                              >
                                <path d="M12 2l8 4v6c0 5-3.5 9.5-8 10-4.5-.5-8-5-8-10V6l8-4z" />
                              </svg>
                            </div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <button
                            type="button"
                            className="text-white text-xs font-medium truncate max-w-[140px] hover:text-blue-400"
                            onClick={() => setSelectedOpponent(opponent)}
                          >
                            {opponent.opponentName}
                          </button>
                        </div>
                      </div>
                    </td>
                    <td className="text-center py-2 px-2 text-white text-xs">{opponent.matches}</td>
                    <td className="text-center py-2 px-2">
                      <span className="text-green-400 font-medium text-xs">{opponent.wins}</span>
                    </td>
                    <td className="text-center py-2 px-2">
                      <span className="text-yellow-400 font-medium text-xs">{opponent.draws}</span>
                    </td>
                    <td className="text-center py-2 px-2">
                      <span className="text-red-400 font-medium text-xs">{opponent.losses}</span>
                    </td>
                    <td className="text-center py-2 px-2 text-white text-xs">{opponent.goalsFor}</td>
                    <td className="text-center py-2 px-2 text-white text-xs">{opponent.goalsAgainst}</td>
                    <td className="text-center py-2 px-2 text-white text-xs">
                      <span className={opponent.goalDifference >= 0 ? "text-green-400" : "text-red-400"}>
                        {opponent.goalDifference > 0 ? "+" : ""}
                        {opponent.goalDifference}
                      </span>
                    </td>
                    <td className="text-center py-2 px-2">
                      <span
                        className={`font-medium text-xs ${
                          opponent.matches > 0
                            ? (opponent.wins / opponent.matches) * 100 >= 60
                              ? "text-green-400"
                              : (opponent.wins / opponent.matches) * 100 >= 40
                                ? "text-yellow-400"
                                : "text-red-400"
                            : "text-slate-400"
                        }`}
                      >
                        {opponent.matches > 0 ? ((opponent.wins / opponent.matches) * 100).toFixed(1) : "0.0"}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {opponentStats.length === 0 && (
            <div className="text-center text-slate-400 py-8">
              <p className="text-sm">対戦成績データがありません</p>
              {!loadingTeams && (
                <div className="mt-2">
                  <p className="text-xs text-slate-500">スコアが入力されたリーグ戦が登録されると表示されます</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {selectedOpponent && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-800 rounded-xl max-w-4xl w-full max-h-[80vh] overflow-hidden border border-slate-700">
            <div className="p-4 border-b border-slate-700">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 bg-transparent rounded-full flex items-center justify-center overflow-hidden flex-shrink-0">
                    {teamLogos.get(selectedOpponent.opponentId) ? (
                      <img
                        src={teamLogos.get(selectedOpponent.opponentId)}
                        alt={selectedOpponent.opponentName}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-slate-600 rounded-full" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-white font-bold truncate">{selectedOpponent.opponentName}</h3>
                    <p className="text-slate-400 text-sm">過去の対戦成績</p>
                  </div>
                </div>
                <button type="button" onClick={() => setSelectedOpponent(null)} className="text-slate-300 hover:text-white text-2xl">
                  ×
                </button>
              </div>
            </div>

            <div className="p-4 overflow-y-auto max-h-[60vh]">
              <div className="space-y-2">
                {opponentMatches.map((match: any) => (
                  <div key={String(match.id)} className="bg-slate-700/40 rounded-lg overflow-hidden border border-slate-600/50">
                    <div className="px-4 py-3">
                      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                        <div className="text-slate-200 text-sm truncate">{match.isHome ? "自チーム" : selectedOpponent.opponentName}</div>
                        <div
                          className={`px-3 py-1 rounded-full text-white font-bold text-sm flex-shrink-0 ${
                            match.result === 'win'
                              ? 'bg-emerald-600/80'
                              : match.result === 'loss'
                                ? 'bg-red-600/80'
                                : 'bg-slate-900/40'
                          }`}
                        >
                          {match.isHome ? `${match.myScore} - ${match.opponentScore}` : `${match.opponentScore} - ${match.myScore}`}
                        </div>
                        <div className="text-slate-200 text-sm truncate text-right">{match.isHome ? selectedOpponent.opponentName : "自チーム"}</div>
                      </div>
                      <div className="mt-2 flex items-center justify-center gap-2 text-xs text-slate-300">
                        <span>{typeof match.competitionName === "string" ? match.competitionName : "—"}</span>
                        <span className="text-slate-500">/</span>
                        <span>{match.matchDate ? new Date(match.matchDate).toLocaleDateString("ja-JP") : "—"}</span>
                      </div>
                    </div>
                  </div>
                ))}

                {opponentMatches.length === 0 && (
                  <div className="text-center text-slate-400 py-8">
                    <p>対戦成績がありません</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
