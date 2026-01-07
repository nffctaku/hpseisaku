"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useAnalysisData } from "../hooks/use-analysis-data";
import { collection, query, getDocs, doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Users, Trophy, Shield, X, ChevronsUpDown } from "lucide-react";

interface TeamVsTeamPageProps {
  competitions: any[];
}

export default function TeamVsTeamPage({ competitions }: TeamVsTeamPageProps) {
  const { user } = useAuth();
  const { filteredMatches } = useAnalysisData();
  
  const [teamNames, setTeamNames] = useState<Map<string, string>>(new Map());
  const [teamsMap, setTeamsMap] = useState<Map<string, any>>(new Map());
  const [loadingTeamNames, setLoadingTeamNames] = useState(true);
  const [selectedOpponent, setSelectedOpponent] = useState<any>(null);
  const [sortField, setSortField] = useState<string>('matches');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [error, setError] = useState<string | null>(null);
  
  const teamsCacheRef = useRef<Map<string, string>>(new Map());

  // 自チームIDを取得
  const myTeamId = user?.uid;

  // ソート関数
  const computeSortedOpponents = (stats: Map<string, any>, field: string, order: 'asc' | 'desc') => {
    if (!stats || stats.size === 0) return [];
    
    const opponents = Array.from(stats.values()).map(opponent => ({
      ...opponent,
      winRate: opponent.matches > 0 ? (opponent.wins / opponent.matches * 100).toFixed(1) : '0.0',
      goalDifference: opponent.goalsFor - opponent.goalsAgainst
    })).filter(opponent => opponent.matches > 0);
    
    return [...opponents].sort((a, b) => {
      let aValue: any, bValue: any;
      
      switch (field) {
        case 'opponentName':
          aValue = a.opponentName;
          bValue = b.opponentName;
          break;
        case 'matches':
          aValue = a.matches;
          bValue = b.matches;
          break;
        case 'wins':
          aValue = a.wins;
          bValue = b.wins;
          break;
        case 'draws':
          aValue = a.draws;
          bValue = b.draws;
          break;
        case 'losses':
          aValue = a.losses;
          bValue = b.losses;
          break;
        case 'goalsFor':
          aValue = a.goalsFor;
          bValue = b.goalsFor;
          break;
        case 'goalsAgainst':
          aValue = a.goalsAgainst;
          bValue = b.goalsAgainst;
          break;
        case 'goalDifference':
          aValue = a.goalDifference;
          bValue = b.goalDifference;
          break;
        case 'winRate':
          aValue = parseFloat(a.winRate);
          bValue = parseFloat(b.winRate);
          break;
        default:
          aValue = a.opponentName;
          bValue = b.opponentName;
      }
      
      if (typeof aValue === 'string') {
        return order === 'asc' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
      } else {
        return order === 'asc' ? aValue - bValue : bValue - aValue;
      }
    });
  };

  // チーム名を取得
  const fetchTeamNames = async () => {
    try {
      const teamsQuery = query(collection(db, `clubs/${user.uid}/teams`));
      const teamsSnapshot = await getDocs(teamsQuery);
      
      const teamNameMap = new Map<string, string>();
      const teamsDataMap = new Map<string, any>();
      
      teamsSnapshot.forEach((doc) => {
        const teamData = doc.data();
        const teamName = teamData.name || teamData.teamName || teamData.clubName || doc.id;
        teamNameMap.set(doc.id, teamName);
        teamsDataMap.set(doc.id, { id: doc.id, ...teamData });
      });
      
      teamsCacheRef.current = teamNameMap;
      setTeamNames(teamNameMap);
      setTeamsMap(teamsDataMap);
    } catch (error) {
      console.error('Error fetching team names:', error);
      setError('チーム情報の取得に失敗しました');
    } finally {
      setLoadingTeamNames(false);
    }
  };

  useEffect(() => {
    if (filteredMatches.length > 0 && !loadingTeamNames) {
      fetchTeamNames();
    }
  }, [filteredMatches, loadingTeamNames]);

  // ソートハンドラー
  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  // コンペティション情報を取得
  const getCompetitionInfo = (competitionId: string) => {
    const comp = competitions.find(c => c.id === competitionId);
    const compData = comp as any;
    return {
      name: compData?.name || compData?.competitionName || competitionId,
      logo: compData?.logo || compData?.logoUrl || null
    };
  };

  // 対戦相手との過去の試合を取得
  const getOpponentMatches = (opponentId: string) => {
    const myTeamMatches = filteredMatches.filter(match => 
      match.scoreHome !== null && match.scoreHome !== undefined && 
      match.scoreAway !== null && match.scoreAway !== undefined
    );
    
    return myTeamMatches.filter(match => 
      match.homeTeam === opponentId || match.awayTeam === opponentId
    ).sort((a, b) => new Date(b.matchDate).getTime() - new Date(a.matchDate).getTime());
  };

  // チーム情報を取得
  const getTeamInfo = (teamId: string) => {
    const teamName = teamNames.get(teamId);
    const teamInfo = teamsMap.get(teamId);
    if (teamInfo) {
      return {
        name: teamName,
        logo: teamInfo.logoUrl || null
      };
    }
    
    return {
      name: teamName || 'Unknown Team',
      logo: null
    };
  };

  if (!user) {
    return <div className="min-h-screen flex items-center justify-center">
      <div className="text-white">ログインが必要です。</div>
    </div>;
  }

  if (loadingTeamNames || teamNames.size === 0) {
    return <div className="min-h-screen flex items-center justify-center">
      <div className="text-white">読み込み中...</div>
    </div>;
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-900 p-4 md:p-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-red-400">エラーが発生しました: {error}</div>
        </div>
      </div>
    );
  }

  // スコアが入力されている試合のみをフィルタリング
  const myTeamMatches = filteredMatches.filter(match => 
    match.scoreHome !== null && match.scoreHome !== undefined && 
    match.scoreAway !== null && match.scoreAway !== undefined
  );

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
    homeMatches: number;
    awayMatches: number;
  }>();

  myTeamMatches.forEach(match => {
    const homeTeamId = match.homeTeam;
    const awayTeamId = match.awayTeam;
    const homeScore = match.scoreHome || 0;
    const awayScore = match.scoreAway || 0;

    let opponentId: string;
    let myTeamIsHome: boolean;

    if (homeTeamId === myTeamId) {
      opponentId = awayTeamId;
      myTeamIsHome = true;
    } else {
      opponentId = homeTeamId;
      myTeamIsHome = false;
    }

    const opponentName = teamNames.get(opponentId) || 'Unknown Team';

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
        homeMatches: 0,
        awayMatches: 0,
      });
    }

    const stats = opponentStats.get(opponentId)!;
    stats.matches++;

    if (myTeamIsHome) {
      stats.homeMatches++;
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
      stats.awayMatches++;
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
  });

  // 全試合の勝率を計算
  const totalWins = Array.from(opponentStats.values()).reduce((sum, stat) => sum + stat.wins, 0);
  const totalMatches = Array.from(opponentStats.values()).reduce((sum, stat) => sum + stat.matches, 0);
  const overallWinRate = totalMatches > 0 ? ((totalWins / totalMatches) * 100).toFixed(1) : '0.0';

  // ソート適用
  const sorted = computeSortedOpponents(opponentStats, sortField, sortOrder);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-4 md:space-y-6">
        <div className="relative overflow-hidden rounded-xl bg-slate-800/50 backdrop-blur-xl border border-slate-700">
          <div className="relative p-6">
            <h2 className="text-2xl font-bold text-white mb-6">対戦成績分析</h2>
            
            {/* 概要カード */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-slate-700/50 rounded-lg p-4 border border-slate-600">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-slate-400 text-sm">総試合数</p>
                    <p className="text-2xl font-bold text-white">{totalMatches}</p>
                  </div>
                  <div className="bg-blue-500/20 rounded-lg p-3">
                    <Users className="h-6 w-6 text-blue-400" />
                  </div>
                </div>
              </div>
              
              <div className="bg-slate-700/50 rounded-lg p-4 border border-slate-600">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-slate-400 text-sm">勝利数</p>
                    <p className="text-2xl font-bold text-green-400">{totalWins}</p>
                  </div>
                  <div className="bg-green-500/20 rounded-lg p-3">
                    <Trophy className="h-6 w-6 text-green-400" />
                  </div>
                </div>
              </div>
              
              <div className="bg-slate-700/50 rounded-lg p-4 border border-slate-600">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-slate-400 text-sm">勝率</p>
                    <p className="text-2xl font-bold text-yellow-400">{overallWinRate}%</p>
                  </div>
                  <div className="bg-yellow-500/20 rounded-lg p-3">
                    <Trophy className="h-6 w-6 text-yellow-400" />
                  </div>
                </div>
              </div>
              
              <div className="bg-slate-700/50 rounded-lg p-4 border border-slate-600">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-slate-400 text-sm">対戦相手</p>
                    <p className="text-2xl font-bold text-white">{sorted.length}</p>
                  </div>
                  <div className="bg-purple-500/20 rounded-lg p-3">
                    <Users className="h-6 w-6 text-purple-400" />
                  </div>
                </div>
              </div>
            </div>

            {/* 対戦成績テーブル */}
            <div className="bg-slate-800/50 rounded-lg overflow-hidden">
              <div className="p-4 md:p-6 border-b border-slate-700">
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <Users className="h-5 w-5 text-blue-400" />
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
                      <th 
                        className="text-center py-2 md:py-3 px-2 md:px-4 text-slate-300 font-medium text-xs md:text-sm cursor-pointer hover:text-white transition-colors"
                        onClick={() => handleSort('matches')}
                      >
                        <div className="flex items-center justify-center gap-1">
                          <span className="hidden md:inline">試合</span>
                          <span className="md:hidden">試</span>
                          <ChevronsUpDown className={`w-3 h-3 ${sortField === 'matches' ? 'text-blue-400' : 'text-slate-500'}`} />
                        </div>
                      </th>
                      <th 
                        className="text-center py-2 md:py-3 px-2 md:px-4 text-slate-300 font-medium text-xs md:text-sm cursor-pointer hover:text-white transition-colors"
                        onClick={() => handleSort('wins')}
                      >
                        <div className="flex items-center justify-center gap-1">
                          勝
                          <ChevronsUpDown className={`w-3 h-3 ${sortField === 'wins' ? 'text-blue-400' : 'text-slate-500'}`} />
                        </div>
                      </th>
                      <th 
                        className="text-center py-2 md:py-3 px-2 md:px-4 text-slate-300 font-medium text-xs md:text-sm cursor-pointer hover:text-white transition-colors"
                        onClick={() => handleSort('draws')}
                      >
                        <div className="flex items-center justify-center gap-1">
                          分
                          <ChevronsUpDown className={`w-3 h-3 ${sortField === 'draws' ? 'text-blue-400' : 'text-slate-500'}`} />
                        </div>
                      </th>
                      <th 
                        className="text-center py-2 md:py-3 px-2 md:px-4 text-slate-300 font-medium text-xs md:text-sm cursor-pointer hover:text-white transition-colors"
                        onClick={() => handleSort('losses')}
                      >
                        <div className="flex items-center justify-center gap-1">
                          負
                          <ChevronsUpDown className={`w-3 h-3 ${sortField === 'losses' ? 'text-blue-400' : 'text-slate-500'}`} />
                        </div>
                      </th>
                      <th 
                        className="text-center py-2 md:py-3 px-2 md:px-4 text-slate-300 font-medium text-xs md:text-sm cursor-pointer hover:text-white transition-colors"
                        onClick={() => handleSort('goalsFor')}
                      >
                        <div className="flex items-center justify-center gap-1">
                          <span className="hidden md:inline">得点</span>
                          <span className="md:hidden">得</span>
                          <ChevronsUpDown className={`w-3 h-3 ${sortField === 'goalsFor' ? 'text-blue-400' : 'text-slate-500'}`} />
                        </div>
                      </th>
                      <th 
                        className="text-center py-2 md:py-3 px-2 md:px-4 text-slate-300 font-medium text-xs md:text-sm cursor-pointer hover:text-white transition-colors"
                        onClick={() => handleSort('goalsAgainst')}
                      >
                        <div className="flex items-center justify-center gap-1">
                          <span className="hidden md:inline">失点</span>
                          <span className="md:hidden">失</span>
                          <ChevronsUpDown className={`w-3 h-3 ${sortField === 'goalsAgainst' ? 'text-blue-400' : 'text-slate-500'}`} />
                        </div>
                      </th>
                      <th 
                        className="text-center py-2 md:py-3 px-2 md:px-4 text-slate-300 font-medium text-xs md:text-sm cursor-pointer hover:text-white transition-colors"
                        onClick={() => handleSort('goalDifference')}
                      >
                        <div className="flex items-center justify-center gap-1">
                          差
                          <ChevronsUpDown className={`w-3 h-3 ${sortField === 'goalDifference' ? 'text-blue-400' : 'text-slate-500'}`} />
                        </div>
                      </th>
                      <th 
                        className="text-center py-2 md:py-3 px-2 md:px-4 text-slate-300 font-medium text-xs md:text-sm cursor-pointer hover:text-white transition-colors"
                        onClick={() => handleSort('winRate')}
                      >
                        <div className="flex items-center justify-center gap-1">
                          勝率
                          <ChevronsUpDown className={`w-3 h-3 ${sortField === 'winRate' ? 'text-blue-400' : 'text-slate-500'}`} />
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((opponent, index) => (
                      <tr 
                        key={opponent.opponentId}
                        className="border-t border-slate-700 hover:bg-slate-700/50 cursor-pointer transition-colors"
                        onClick={() => setSelectedOpponent(opponent)}
                      >
                        <td className="py-2 md:py-3 px-2 md:px-4">
                          <div className="flex items-center gap-2 md:gap-3">
                            <div className="w-6 h-6 md:w-8 md:h-8 bg-transparent rounded-full flex items-center justify-center flex-shrink-0">
                              {getTeamInfo(opponent.opponentId).logo ? (
                                <img 
                                  src={getTeamInfo(opponent.opponentId).logo} 
                                  alt={opponent.opponentName}
                                  className="w-full h-full rounded-full object-cover"
                                />
                              ) : (
                                <Shield className="h-3 w-3 md:h-4 md:w-4 text-slate-400" />
                              )}
                            </div>
                            <div>
                              <p className="text-white text-xs md:text-sm font-medium truncate max-w-[100px] md:max-w-[150px]">
                                {opponent.opponentName}
                              </p>
                              <p className="text-slate-500 text-xs">H{opponent.homeMatches} A{opponent.awayMatches}</p>
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
                            parseFloat(opponent.winRate) >= 60 ? 'text-green-400' : 
                            parseFloat(opponent.winRate) >= 40 ? 'text-yellow-400' : 'text-red-400'
                          }`}>
                            {opponent.winRate}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              
              {sorted.length === 0 && (
                <div className="text-center text-slate-400 py-8 md:py-12">
                  <Shield className="h-8 md:h-12 w-8 md:w-12 mx-auto mb-3 md:mb-4 text-slate-500" />
                  <p className="text-base md:text-lg mb-2">対戦成績データがありません</p>
                  <div className="mt-3 md:mt-4">
                    <p className="text-xs md:text-sm mb-3 md:mb-4">現在のデータ状況:</p>
                    <div className="bg-slate-700/30 rounded-lg p-3 md:p-4 text-left max-w-md mx-auto">
                      <p className="text-xs md:text-sm">・総試合数: {filteredMatches.length}</p>
                      <p className="text-xs md:text-sm">・自チーム試合数: {myTeamMatches.length}</p>
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

      {/* 試合詳細モーダル */}
      {selectedOpponent && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-lg w-full max-w-2xl max-h-[90vh] overflow-hidden">
            <div className="p-4 md:p-6 border-b border-slate-700 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <Users className="h-5 w-5 text-blue-400" />
                {selectedOpponent.opponentName} との対戦成績
              </h3>
              <button
                onClick={() => setSelectedOpponent(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto h-[calc(90vh-140px)]">
              <div className="space-y-4">
                {getOpponentMatches(selectedOpponent.opponentId).map((match) => {
                  const isHome = match.homeTeam === myTeamId;
                  const myScore = isHome ? match.scoreHome : match.scoreAway;
                  const opponentScore = isHome ? match.scoreAway : match.scoreHome;
                  
                  return (
                    <div key={match.id} className="bg-slate-700 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className="text-xs text-slate-400">
                            {match.matchDate ? new Date(match.matchDate).toLocaleDateString('ja-JP') : '日付不明'}
                          </div>
                          <div className="text-xs text-slate-400">
                            {getCompetitionInfo(match.competitionId).name}
                          </div>
                        </div>
                        <div className="text-xs text-slate-400">
                          {isHome ? 'ホーム' : 'アウェイ'}
                        </div>
                      </div>
                      
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="flex flex-col items-center">
                            <div className="w-6 h-6 bg-transparent rounded-full flex items-center justify-center">
                              {getTeamInfo(myTeamId).logo ? (
                                <img 
                                  src={getTeamInfo(myTeamId).logo} 
                                  alt="チーム"
                                  className="w-full h-full rounded-full object-cover"
                                />
                              ) : (
                                <Shield className="h-3 w-3 text-slate-400" />
                              )}
                            </div>
                            <span className="text-white text-xs max-w-[60px] truncate block text-center">{getTeamInfo(myTeamId).name}</span>
                          </div>
                          
                          <div className="flex items-center gap-4">
                            <span className={`text-lg font-bold ${
                              myScore > opponentScore ? 'text-green-400' : 
                              myScore < opponentScore ? 'text-red-400' : 'text-yellow-400'
                            }`}>
                              {myScore}
                            </span>
                            <span className="text-slate-400">-</span>
                            <span className={`text-lg font-bold ${
                              opponentScore > myScore ? 'text-green-400' : 
                              opponentScore < myScore ? 'text-red-400' : 'text-yellow-400'
                            }`}>
                              {opponentScore}
                            </span>
                          </div>
                          
                          <div className="flex items-center gap-2">
                            <div className="flex flex-col items-center">
                              <div className="w-6 h-6 bg-transparent rounded-full flex items-center justify-center">
                                {getTeamInfo(selectedOpponent.opponentId).logo ? (
                                  <img 
                                    src={getTeamInfo(selectedOpponent.opponentId).logo} 
                                    alt={selectedOpponent.opponentName}
                                    className="w-full h-full rounded-full object-cover"
                                  />
                                ) : (
                                  <Shield className="h-3 w-3 text-slate-400" />
                                )}
                              </div>
                              <span className="text-white text-xs max-w-[60px] truncate block text-center">{selectedOpponent.opponentName}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
