"use client";

import { useState, useEffect } from 'react';
import { useAuth } from "@/contexts/AuthContext";
import { useAnalysisData } from "../hooks/use-analysis-data";
import { collection, query, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useRouter } from "next/navigation";

function TeamVsTeamPage() {
  const router = useRouter();
  const { user, ownerUid } = useAuth();
  const { filteredMatches } = useAnalysisData();
  
  // useAnalysisDataからmainTeamIdを取得
  const mainTeamId = '4YlnB4MNHT8YlprIvjDO'; // ログから確認した値
  const actualUid = ownerUid || user?.uid; // ownerUidを優先
  
  const [teamNames, setTeamNames] = useState<Map<string, string>>(new Map());
  const [teamLogos, setTeamLogos] = useState<Map<string, string>>(new Map());
  const [loadingTeams, setLoadingTeams] = useState(true);
  const [selectedOpponent, setSelectedOpponent] = useState<any>(null);
  const [opponentMatches, setOpponentMatches] = useState<any[]>([]);

  // チーム情報を取得
  useEffect(() => {
    const fetchTeams = async () => {
      if (!actualUid) {
        setLoadingTeams(false);
        return;
      }
      
      try {
        const teamsQuery = query(collection(db, `clubs/${actualUid}/teams`));
        const teamsSnapshot = await getDocs(teamsQuery);
        
        const nameMap = new Map<string, string>();
        const logoMap = new Map<string, string>();
        
        teamsSnapshot.forEach((doc) => {
          const teamData = doc.data();
          const teamId = doc.id;
          const teamName = teamData.name || teamData.teamName || teamData.clubName || `チーム ${teamId.slice(0, 8)}`;
          const logoUrl = teamData.logoUrl || teamData.logo || '';
          
          nameMap.set(teamId, teamName);
          if (logoUrl) logoMap.set(teamId, logoUrl);
        });
        
        setTeamNames(nameMap);
        setTeamLogos(logoMap);
      } catch (error) {
        console.error('Error fetching teams:', error);
      } finally {
        setLoadingTeams(false);
      }
    };

    fetchTeams();
  }, [actualUid]);

  // 対戦相手との過去対戦成績を取得
  const getOpponentMatches = (opponentId: string) => {
    const myTeamMatches = filteredMatches.filter(match => 
      match.scoreHome !== null && match.scoreHome !== undefined && 
      match.scoreAway !== null && match.scoreAway !== undefined
    );
    
    const matches = myTeamMatches.filter(match => 
      (match.homeTeam === mainTeamId && match.awayTeam === opponentId) ||
      (match.homeTeam === opponentId && match.awayTeam === mainTeamId)
    );
    
    return matches.map(match => {
      const isHome = match.homeTeam === mainTeamId;
      const myScore = isHome ? match.scoreHome : match.scoreAway;
      const opponentScore = isHome ? match.scoreAway : match.scoreHome;
      
      return {
        ...match,
        isHome,
        myScore,
        opponentScore,
        result: myScore > opponentScore ? 'win' : myScore < opponentScore ? 'loss' : 'draw'
      };
    }).sort((a, b) => new Date(b.matchDate).getTime() - new Date(a.matchDate).getTime());
  };

  // 対戦相手をクリックした時の処理
  const handleOpponentClick = (opponent: any) => {
    const matches = getOpponentMatches(opponent.opponentId);
    setSelectedOpponent(opponent);
    setOpponentMatches(matches);
  };
  
  if (!user) {
    return <div className="min-h-screen flex items-center justify-center">
      <div className="text-white">ログインが必要です。</div>
    </div>;
  }

  if (loadingTeams) {
    return <div className="min-h-screen flex items-center justify-center">
      <div className="text-white">チーム情報を読み込み中...</div>
    </div>;
  }

  // スコアが入力されている試合のみをフィルタリング
  const myTeamMatches = filteredMatches.filter(match => 
    match.scoreHome !== null && match.scoreHome !== undefined && 
    match.scoreAway !== null && match.scoreAway !== undefined
  );

  // 対戦相手ごとの成績を集計
  const opponentStats = new Map<string, {
    opponentId: string;
    opponentName: string;
    matches: number;
    wins: number;
    draws: number;
    losses: number;
    goalsFor: number;
    goalsAgainst: number;
    goalDifference: number;
  }>();

  myTeamMatches.forEach(match => {
    const homeTeamId = match.homeTeam;
    const awayTeamId = match.awayTeam;
    const homeScore = match.scoreHome || 0;
    const awayScore = match.scoreAway || 0;

    let opponentId: string;
    let myTeamIsHome: boolean;

    if (homeTeamId === mainTeamId) {
      opponentId = awayTeamId;
      myTeamIsHome = true;
    } else {
      opponentId = homeTeamId;
      myTeamIsHome = false;
    }

    // 自チームは除外
    if (opponentId === mainTeamId) return;

    const opponentName = teamNames.get(opponentId) || `対戦相手 ${opponentId.slice(0, 8)}`;

    if (!opponentStats.has(opponentId)) {
      opponentStats.set(opponentId, {
        opponentId: opponentId,
        opponentName: opponentName,
        matches: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalDifference: 0,
      });
    }

    const stats = opponentStats.get(opponentId)!;
    stats.matches++;

    if (myTeamIsHome) {
      stats.goalsFor += homeScore;
      stats.goalsAgainst += awayScore;
      if (homeScore > awayScore) {
        stats.wins++;
      } else if (homeScore < awayScore) {
        stats.losses++;
      } else {
        stats.draws++;
      }
    } else {
      stats.goalsFor += awayScore;
      stats.goalsAgainst += homeScore;
      if (awayScore > homeScore) {
        stats.wins++;
      } else if (awayScore < homeScore) {
        stats.losses++;
      } else {
        stats.draws++;
      }
    }

    stats.goalDifference = stats.goalsFor - stats.goalsAgainst;
  });

  // 勝利数でソート
  const sortedOpponents = Array.from(opponentStats.values())
    .sort((a, b) => b.wins - a.wins || b.matches - a.matches);

  // 全体の合計
  const totalWins = Array.from(opponentStats.values()).reduce((sum, stat) => sum + stat.wins, 0);
  const totalMatches = Array.from(opponentStats.values()).reduce((sum, stat) => sum + stat.matches, 0);
  const overallWinRate = totalMatches > 0 ? ((totalWins / totalMatches) * 100).toFixed(1) : '0.0';

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-4 md:space-y-6">
        <div className="relative overflow-hidden rounded-xl bg-slate-800/50 backdrop-blur-xl border border-slate-700">
          <div className="relative p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-white">対戦成績分析</h2>
              <button
                type="button"
                onClick={() => router.back()}
                className="px-3 py-2 rounded-lg bg-slate-700/60 hover:bg-slate-700 text-white text-sm border border-slate-600"
              >
                戻る
              </button>
            </div>
            
            {/* 概要カード */}
            <div className="flex justify-center gap-2 mb-6 flex-nowrap">
              <div className="bg-slate-700/50 rounded-lg p-2 border border-slate-600 text-center flex-1 flex-shrink-0">
                <p className="text-slate-400 text-xs">試合数</p>
                <p className="text-sm font-bold text-white">{totalMatches}</p>
              </div>
              <div className="bg-slate-700/50 rounded-lg p-2 border border-slate-600 text-center flex-1 flex-shrink-0">
                <p className="text-slate-400 text-xs">対チーム数</p>
                <p className="text-sm font-bold text-white">{sortedOpponents.length}</p>
              </div>
              <div className="bg-slate-700/50 rounded-lg p-2 border border-slate-600 text-center flex-1 flex-shrink-0">
                <p className="text-slate-400 text-xs">勝率</p>
                <p className="text-sm font-bold text-yellow-400">{overallWinRate}%</p>
              </div>
            </div>

            {/* 対戦成績テーブル */}
            <div className="bg-slate-800/50 rounded-lg overflow-hidden">
              <div className="p-4 md:p-6 border-b border-slate-700">
                <h2 className="text-lg font-bold text-white">
                  対戦相手別成績
                </h2>
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-700">
                    <tr>
                      <th className="text-left py-2 md:py-3 px-2 md:px-4 text-slate-300 font-medium text-xs md:text-sm">
                        対戦相手
                      </th>
                      <th className="text-center py-2 md:py-3 px-2 md:px-4 text-slate-300 font-medium text-xs md:text-sm">
                        試合
                      </th>
                      <th className="text-center py-2 md:py-3 px-2 md:px-4 text-slate-300 font-medium text-xs md:text-sm">
                        勝
                      </th>
                      <th className="text-center py-2 md:py-3 px-2 md:px-4 text-slate-300 font-medium text-xs md:text-sm">
                        分
                      </th>
                      <th className="text-center py-2 md:py-3 px-2 md:px-4 text-slate-300 font-medium text-xs md:text-sm">
                        負
                      </th>
                      <th className="text-center py-2 md:py-3 px-2 md:px-4 text-slate-300 font-medium text-xs md:text-sm">
                        得点
                      </th>
                      <th className="text-center py-2 md:py-3 px-2 md:px-4 text-slate-300 font-medium text-xs md:text-sm">
                        失点
                      </th>
                      <th className="text-center py-2 md:py-3 px-2 md:px-4 text-slate-300 font-medium text-xs md:text-sm">
                        差
                      </th>
                      <th className="text-center py-2 md:py-3 px-2 md:px-4 text-slate-300 font-medium text-xs md:text-sm">
                        勝率
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedOpponents.map((opponent) => (
                      <tr key={opponent.opponentId} className="border-t border-slate-700 hover:bg-slate-700/50">
                        <td className="py-2 md:py-3 px-2 md:px-4">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 md:w-8 md:h-8 bg-transparent rounded-full flex items-center justify-center flex-shrink-0">
                              {teamLogos.get(opponent.opponentId) ? (
                                <img 
                                  src={teamLogos.get(opponent.opponentId)} 
                                  alt={opponent.opponentName}
                                  className="w-full h-full rounded-full object-cover"
                                />
                              ) : (
                                <div className="w-full h-full bg-slate-600 rounded-full flex items-center justify-center text-slate-200">
                                  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <path d="M12 2l8 4v6c0 5-3.5 9.5-8 10-4.5-.5-8-5-8-10V6l8-4z" />
                                  </svg>
                                </div>
                              )}
                            </div>
                            <div>
                              <p 
                                className="text-white text-xs md:text-sm font-medium truncate max-w-[100px] md:max-w-[150px] hover:text-blue-400 cursor-pointer"
                                onClick={() => handleOpponentClick(opponent)}
                              >
                                {opponent.opponentName}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="text-center py-2 md:py-3 px-2 md:px-4 text-white text-xs md:text-sm">{opponent.matches}</td>
                        <td className="text-center py-2 md:py-3 px-2 md:px-4">
                          <span className="text-green-400 font-medium text-xs md:text-sm">{opponent.wins}</span>
                        </td>
                        <td className="text-center py-2 md:py-3 px-2 md:px-4">
                          <span className="text-yellow-400 font-medium text-xs md:text-sm">{opponent.draws}</span>
                        </td>
                        <td className="text-center py-2 md:py-3 px-2 md:px-4">
                          <span className="text-red-400 font-medium text-xs md:text-sm">{opponent.losses}</span>
                        </td>
                        <td className="text-center py-2 md:py-3 px-2 md:px-4 text-white text-xs md:text-sm">{opponent.goalsFor}</td>
                        <td className="text-center py-2 md:py-3 px-2 md:px-4 text-white text-xs md:text-sm">{opponent.goalsAgainst}</td>
                        <td className="text-center py-2 md:py-3 px-2 md:px-4 text-white text-xs md:text-sm">
                          <span className={opponent.goalDifference >= 0 ? 'text-green-400' : 'text-red-400'}>
                            {opponent.goalDifference > 0 ? '+' : ''}{opponent.goalDifference}
                          </span>
                        </td>
                        <td className="text-center py-2 md:py-3 px-2 md:px-4">
                          <span className={`font-medium text-xs md:text-sm ${
                            opponent.matches > 0 ? 
                              ((opponent.wins / opponent.matches) * 100) >= 60 ? 'text-green-400' : 
                              ((opponent.wins / opponent.matches) * 100) >= 40 ? 'text-yellow-400' : 'text-red-400'
                            : 'text-slate-400'
                          }`}>
                            {opponent.matches > 0 ? ((opponent.wins / opponent.matches) * 100).toFixed(1) : '0.0'}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              
              {sortedOpponents.length === 0 && (
                <div className="text-center text-slate-400 py-8 md:py-12">
                  <p className="text-base md:text-lg mb-2">対戦成績データがありません</p>
                  <div className="mt-3 md:mt-4">
                    <p className="text-xs md:text-sm mb-3 md:mb-4">現在のデータ状況:</p>
                    <div className="bg-slate-700/30 rounded-lg p-3 md:p-4 text-left max-w-md mx-auto">
                      <p className="text-xs md:text-sm">・総試合数: {myTeamMatches.length}</p>
                      <p className="text-xs md:text-sm">・完了試合数: {filteredMatches.filter((m: any) => m.isCompleted).length}</p>
                      <p className="text-xs md:text-sm mt-2 text-slate-500">スコアが入力された試合が登録されると表示されます</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 対戦成績モーダル */}
      {selectedOpponent && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-800 rounded-xl max-w-4xl w-full max-h-[80vh] overflow-hidden">
            <div className="p-6 border-b border-slate-700">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-transparent rounded-full flex items-center justify-center">
                    {teamLogos.get(selectedOpponent.opponentId) ? (
                      <img 
                        src={teamLogos.get(selectedOpponent.opponentId)} 
                        alt={selectedOpponent.opponentName}
                        className="w-full h-full rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-slate-600 rounded-full flex items-center justify-center text-slate-200">
                        <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M12 2l8 4v6c0 5-3.5 9.5-8 10-4.5-.5-8-5-8-10V6l8-4z" />
                        </svg>
                      </div>
                    )}
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-white">{selectedOpponent.opponentName}</h3>
                    <p className="text-slate-400 text-sm">過去の対戦成績</p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedOpponent(null)}
                  className="text-slate-400 hover:text-white text-2xl"
                >
                  ×
                </button>
              </div>
            </div>
            
            <div className="p-6 overflow-y-auto max-h-[60vh]">
              <div className="flex justify-center gap-2 mb-6 flex-nowrap">
                <div className="bg-slate-700 rounded-lg p-2 border border-slate-600 text-center flex-1 flex-shrink-0">
                  <p className="text-slate-400 text-xs">試合</p>
                  <p className="text-sm font-bold text-white">{opponentMatches.length}</p>
                </div>
                <div className="bg-slate-700 rounded-lg p-2 border border-slate-600 text-center flex-1 flex-shrink-0">
                  <p className="text-slate-400 text-xs">勝</p>
                  <p className="text-sm font-bold text-green-400">{selectedOpponent.wins}</p>
                </div>
                <div className="bg-slate-700 rounded-lg p-2 border border-slate-600 text-center flex-1 flex-shrink-0">
                  <p className="text-slate-400 text-xs">分</p>
                  <p className="text-sm font-bold text-yellow-400">{selectedOpponent.draws}</p>
                </div>
                <div className="bg-slate-700 rounded-lg p-2 border border-slate-600 text-center flex-1 flex-shrink-0">
                  <p className="text-slate-400 text-xs">負</p>
                  <p className="text-sm font-bold text-red-400">{selectedOpponent.losses}</p>
                </div>
                <div className="bg-slate-700 rounded-lg p-2 border border-slate-600 text-center flex-1 flex-shrink-0">
                  <p className="text-slate-400 text-xs">勝率</p>
                  <p className="text-sm font-bold text-blue-400">
                    {selectedOpponent.matches > 0 ? ((selectedOpponent.wins / selectedOpponent.matches) * 100).toFixed(1) : '0.0'}%
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                {opponentMatches.map((match) => (
                  <div key={match.id} className="bg-slate-700 rounded-lg overflow-hidden border border-slate-600">
                    <div className="px-4 py-3">
                      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-7 h-7 rounded-full overflow-hidden bg-transparent flex items-center justify-center flex-shrink-0">
                            {(() => {
                              const id = match.isHome ? mainTeamId : selectedOpponent.opponentId;
                              const name = match.isHome
                                ? (teamNames.get(mainTeamId) || '自チーム')
                                : selectedOpponent.opponentName;
                              const logo = teamLogos.get(id);
                              if (!logo) {
                                return (
                                  <div className="w-full h-full rounded-full bg-slate-600 flex items-center justify-center text-slate-200">
                                    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                      <path d="M12 2l8 4v6c0 5-3.5 9.5-8 10-4.5-.5-8-5-8-10V6l8-4z" />
                                    </svg>
                                  </div>
                                );
                              }
                              return <img src={logo} alt={name} className="w-full h-full object-cover" />;
                            })()}
                          </div>
                          <p className="text-white font-semibold text-sm truncate">
                            {match.isHome ? (teamNames.get(mainTeamId) || '自チーム') : selectedOpponent.opponentName}
                          </p>
                        </div>

                        <div className="px-3 py-1 rounded-full bg-red-500 text-white font-bold text-sm flex-shrink-0">
                          {match.isHome ? `${match.myScore} - ${match.opponentScore}` : `${match.opponentScore} - ${match.myScore}`}
                        </div>

                        <div className="flex items-center gap-2 min-w-0 justify-end">
                          <p className="text-white font-semibold text-sm truncate text-right">
                            {match.isHome ? selectedOpponent.opponentName : (teamNames.get(mainTeamId) || '自チーム')}
                          </p>
                          <div className="w-7 h-7 rounded-full overflow-hidden bg-transparent flex items-center justify-center flex-shrink-0">
                            {(() => {
                              const id = match.isHome ? selectedOpponent.opponentId : mainTeamId;
                              const name = match.isHome
                                ? selectedOpponent.opponentName
                                : (teamNames.get(mainTeamId) || '自チーム');
                              const logo = teamLogos.get(id);
                              if (!logo) {
                                return (
                                  <div className="w-full h-full rounded-full bg-slate-600 flex items-center justify-center text-slate-200">
                                    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                      <path d="M12 2l8 4v6c0 5-3.5 9.5-8 10-4.5-.5-8-5-8-10V6l8-4z" />
                                    </svg>
                                  </div>
                                );
                              }
                              return <img src={logo} alt={name} className="w-full h-full object-cover" />;
                            })()}
                          </div>
                        </div>
                      </div>

                      <div className="mt-2 flex items-center justify-center gap-2 text-xs text-slate-300">
                        <span>{typeof (match as any).competitionName === 'string' ? (match as any).competitionName : '—'}</span>
                        <span className="text-slate-500">/</span>
                        <span>{match.matchDate ? new Date(match.matchDate).toLocaleDateString('ja-JP') : '—'}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {opponentMatches.length === 0 && (
                <div className="text-center text-slate-400 py-8">
                  <p>対戦成績がありません</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default TeamVsTeamPage;
