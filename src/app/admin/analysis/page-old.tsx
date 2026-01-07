"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import {
  collection,
  getDocs,
  query,
  where,
  limit,
  doc,
  getDoc,
} from "firebase/firestore";
import { 
  Loader2, 
  Activity,
  Zap,
  BarChart3, 
  Filter,
  Calendar,
  Trophy,
  Target,
  Crown,
  Lock,
  Home,
  MapPin,
  Users,
  Goal,
  Flag,
  TrendingUp,
  TrendingDown,
  Monitor,
  Database,
  Shield,
  Sparkles,
  Gauge,
  PieChart as PieChartIcon,
  LineChart as LineChartIcon,
  Bot,
  Cpu,
  Wifi,
  Globe,
  Layers,
  Command,
  Code,
  Terminal
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from "recharts";

import type { TeamStat } from "@/types/match";

interface CompetitionDoc {
  id: string;
  name: string;
  season?: string;
  type?: "league" | "cup" | "european";
}

interface MatchForAnalysis {
  id: string;
  competitionId: string;
  competitionName: string;
  competitionSeason?: string;
  competitionType?: "league" | "cup" | "european";
  homeTeamId: string;
  awayTeamId: string;
  matchDate: string;
  scoreHome?: number;
  scoreAway?: number;
  isCompleted?: boolean;
  teamStats?: TeamStat[];
  events?: any[];
}

interface PlayerStats {
  playerId: string;
  playerName: string;
  goals: number;
  assists: number;
  matches: number;
}

interface SeasonRecord {
  season: string;
  points: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  winRate: number;
  homeWins: number;
  awayWins: number;
  leaguePosition?: number;
  cupResult?: string;
}

interface RankingData {
  round: number;
  position: number;
  played: number;
  points: number;
  record: string;
}

const MAIN_STATS = [
  { id: "possession", name: "ポゼッション", category: "パス", isPercentage: true },
  { id: "shots", name: "シュート数", category: "攻撃", isPercentage: false },
  { id: "xg", name: "xG（期待値）", category: "攻撃", isPercentage: false },
  { id: "passes", name: "パス本数", category: "パス", isPercentage: false },
  { id: "passAccuracy", name: "パス成功率", category: "パス", isPercentage: true },
];

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

function parseNumberMaybe(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return null;
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export default function AnalysisPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState<boolean>(true);
  const [competitions, setCompetitions] = useState<CompetitionDoc[]>([]);
  const [seasons, setSeasons] = useState<string[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<string>("all");
  const [selectedCompetitionId, setSelectedCompetitionId] = useState<string>("all");
  const [mainTeamId, setMainTeamId] = useState<string>("");
  const [matches, setMatches] = useState<MatchForAnalysis[]>([]);
  const [selectedStats, setSelectedStats] = useState<string[]>(MAIN_STATS.map(s => s.id));

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      setLoading(true);
      try {
        const ownerUid = (user as any).ownerUid || user.uid;

        let resolvedMainTeamId = "";
        try {
          const profilesRef = collection(db, "club_profiles");
          const qProfiles = query(profilesRef, where("ownerUid", "==", ownerUid), limit(1));
          const snap = await getDocs(qProfiles);
          if (!snap.empty) {
            const data = snap.docs[0].data() as any;
            if (typeof data.mainTeamId === "string" && data.mainTeamId.length > 0) {
              resolvedMainTeamId = data.mainTeamId;
            }
          }
        } catch {
          // ignore
        }

        if (!resolvedMainTeamId) {
          const teamsRef = query(collection(db, `clubs/${ownerUid}/teams`));
          const teamsSnap = await getDocs(teamsRef);
          if (!teamsSnap.empty) {
            resolvedMainTeamId = teamsSnap.docs[0].id;
          }
        }

        setMainTeamId(resolvedMainTeamId);

        const competitionsQueryRef = query(collection(db, `clubs/${ownerUid}/competitions`));
        const competitionsSnap = await getDocs(competitionsQueryRef);
        const competitionsData: CompetitionDoc[] = competitionsSnap.docs.map((d) => {
          const data = d.data() as any;
          return {
            id: d.id,
            name: (data.name as string) || d.id,
            season: data.season as string | undefined,
            type: data.type as "league" | "cup" | "european" | undefined,
          };
        });
        setCompetitions(competitionsData);

        const seasonSet = new Set<string>();
        competitionsData.forEach((c) => {
          if (typeof c.season === "string" && c.season.trim() !== "") seasonSet.add(c.season);
        });
        setSeasons(Array.from(seasonSet).sort((a, b) => b.localeCompare(a)));

        const allMatches: MatchForAnalysis[] = [];
        for (const comp of competitionsData) {
          if (selectedSeason !== "all" && comp.season && comp.season !== selectedSeason) {
            continue;
          }
          if (selectedCompetitionId !== "all" && comp.id !== selectedCompetitionId) {
            continue;
          }

          const roundsRef = query(collection(db, `clubs/${ownerUid}/competitions/${comp.id}/rounds`));
          const roundsSnap = await getDocs(roundsRef);

          for (const roundDoc of roundsSnap.docs) {
            const matchesRef = query(collection(db, `clubs/${ownerUid}/competitions/${comp.id}/rounds/${roundDoc.id}/matches`));
            const matchesSnap = await getDocs(matchesRef);

            for (const matchDoc of matchesSnap.docs) {
              const md = matchDoc.data() as any;
              allMatches.push({
                id: matchDoc.id,
                competitionId: comp.id,
                competitionName: comp.name,
                competitionSeason: comp.season,
                competitionType: comp.type,
                homeTeamId: md.homeTeam,
                awayTeamId: md.awayTeam,
                matchDate: md.matchDate,
                scoreHome: md.scoreHome,
                scoreAway: md.scoreAway,
                isCompleted: md.isCompleted,
                teamStats: md.teamStats as TeamStat[] | undefined,
                events: md.events as any[] | undefined,
              });
            }
          }
        }

        allMatches.sort((a, b) => new Date(a.matchDate).getTime() - new Date(b.matchDate).getTime());
        setMatches(allMatches);
      } finally {
        setLoading(false);
      }
    };

    void fetchData();
  }, [user, selectedSeason, selectedCompetitionId]);

  const visibleCompetitions = useMemo(() => {
    if (selectedSeason === "all") return competitions;
    return competitions.filter((c) => c.season === selectedSeason);
  }, [competitions, selectedSeason]);

  const seasonRecords = useMemo(() => {
    if (!mainTeamId) return [];

    const recordsBySeason = new Map<string, SeasonRecord>();

    const seasonMatches = new Map<string, MatchForAnalysis[]>();
    matches.forEach(match => {
      const season = match.competitionSeason || "不明";
      if (!seasonMatches.has(season)) {
        seasonMatches.set(season, []);
      }
      seasonMatches.get(season)!.push(match);
    });

    seasonMatches.forEach((seasonMatchList, season) => {
      let points = 0, wins = 0, draws = 0, losses = 0;
      let goalsFor = 0, goalsAgainst = 0, homeWins = 0, awayWins = 0;

      seasonMatchList.forEach(match => {
        const isHome = match.homeTeamId === mainTeamId;
        const isAway = match.awayTeamId === mainTeamId;
        
        if (!isHome && !isAway) return;
        if (!match.isCompleted || match.scoreHome === undefined || match.scoreAway === undefined) return;

        const teamScore = isHome ? match.scoreHome : match.scoreAway;
        const opponentScore = isHome ? match.scoreAway : match.scoreHome;

        goalsFor += teamScore;
        goalsAgainst += opponentScore;

        if (teamScore > opponentScore) {
          wins++;
          points += 3;
          if (isHome) homeWins++;
          else awayWins++;
        } else if (teamScore === opponentScore) {
          draws++;
          points += 1;
        } else {
          losses++;
        }
      });

      const totalMatches = wins + draws + losses;
      const winRate = totalMatches > 0 ? (wins / totalMatches) * 100 : 0;

      recordsBySeason.set(season, {
        season,
        points,
        wins,
        draws,
        losses,
        goalsFor,
        goalsAgainst,
        goalDifference: goalsFor - goalsAgainst,
        winRate,
        homeWins,
        awayWins,
      });
    });

    return Array.from(recordsBySeason.values()).sort((a, b) => b.season.localeCompare(a.season));
  }, [matches, mainTeamId]);

  const playerStats = useMemo(() => {
    if (!mainTeamId) return [];

    const statsByPlayer = new Map<string, PlayerStats>();

    matches.forEach(match => {
      const isHome = match.homeTeamId === mainTeamId;
      const isAway = match.awayTeamId === mainTeamId;
      
      if (!isHome && !isAway) return;
      if (!match.events || !Array.isArray(match.events)) return;

      match.events.forEach(event => {
        if (event.type === 'goal' && event.playerId) {
          const playerId = event.playerId;
          const playerName = event.playerName || '不明';
          
          if (!statsByPlayer.has(playerId)) {
            statsByPlayer.set(playerId, {
              playerId,
              playerName,
              goals: 0,
              assists: 0,
              matches: 0,
            });
          }
          
          const player = statsByPlayer.get(playerId)!;
          player.goals++;
        }
        
        if (event.type === 'goal' && event.assistPlayerId) {
          const assistPlayerId = event.assistPlayerId;
          const assistPlayerName = event.assistPlayerName || '不明';
          
          if (!statsByPlayer.has(assistPlayerId)) {
            statsByPlayer.set(assistPlayerId, {
              playerId: assistPlayerId,
              playerName: assistPlayerName,
              goals: 0,
              assists: 0,
              matches: 0,
            });
          }
          
          const player = statsByPlayer.get(assistPlayerId)!;
          player.assists++;
        }
      });
    });

    const teamMatches = matches.filter(m => 
      (m.homeTeamId === mainTeamId || m.awayTeamId === mainTeamId) && m.isCompleted
    );
    
    statsByPlayer.forEach(player => {
      player.matches = teamMatches.length;
    });

    return Array.from(statsByPlayer.values());
  }, [matches, mainTeamId]);

  const topGoalscorers = useMemo(() => 
    playerStats.sort((a, b) => b.goals - a.goals).slice(0, 3),
    [playerStats]
  );

  const topAssists = useMemo(() => 
    playerStats.sort((a, b) => b.assists - a.assists).slice(0, 3),
    [playerStats]
  );

  const mainStatsData = useMemo(() => {
    if (!mainTeamId) return [];

    return selectedStats.map(statId => {
      const statConfig = MAIN_STATS.find(s => s.id === statId);
      if (!statConfig) return null;

      let totalValue = 0;
      let matchCount = 0;

      matches.forEach(match => {
        const isHome = match.homeTeamId === mainTeamId;
        const isAway = match.awayTeamId === mainTeamId;
        
        if (!isHome && !isAway) return;
        if (!match.teamStats || !Array.isArray(match.teamStats)) return;

        const sideKey = isHome ? "homeValue" : "awayValue";
        const teamStat = match.teamStats.find(s => s.id === statId);
        
        if (teamStat) {
          const value = parseNumberMaybe((teamStat as any)[sideKey]);
          if (value !== null) {
            totalValue += value;
            matchCount++;
          }
        }
      });

      const avgValue = matchCount > 0 ? totalValue / matchCount : 0;
      
      return {
        id: statId,
        name: statConfig.name,
        category: statConfig.category,
        total: totalValue,
        average: avgValue,
        matches: matchCount,
        isPercentage: statConfig.isPercentage,
      };
    }).filter(Boolean);
  }, [matches, mainTeamId, selectedStats]);

  const rankingData = useMemo(() => {
    return [
      { round: 1, position: 5, played: 1, points: 0, record: "0-0-1" },
      { round: 2, position: 3, played: 2, points: 3, record: "1-0-1" },
      { round: 3, position: 1, played: 3, points: 7, record: "2-1-0" },
      { round: 4, position: 2, played: 4, points: 10, record: "3-1-0" },
      { round: 5, position: 1, played: 5, points: 13, record: "4-1-0" },
      { round: 6, position: 2, played: 6, points: 13, record: "4-1-1" },
      { round: 7, position: 1, played: 7, points: 16, record: "5-1-1" },
      { round: 8, position: 3, played: 8, points: 16, record: "5-1-2" },
      { round: 9, position: 2, played: 9, points: 19, record: "6-1-2" },
      { round: 10, position: 1, played: 10, points: 22, record: "7-1-2" },
    ];
  }, []);

  if (!user) {
    return <div className="min-h-screen flex items-center justify-center">
      <Card className="w-96">
        <CardContent className="pt-6">
          <div className="text-center text-muted-foreground">ログインが必要です。</div>
        </CardContent>
      </Card>
    </div>;
  }

  return (
    <div className="min-h-screen bg-slate-900 p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-4 md:space-y-6">
        {/* Simplified Header */}
        <div className="relative overflow-hidden rounded-2xl bg-slate-800/50 backdrop-blur-xl border border-slate-700">
          <div className="relative p-4 md:p-8">
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="absolute inset-0 bg-blue-500/20 blur-xl"></div>
                  <div className="relative p-2 md:p-3 bg-slate-700 shadow-lg" style={{clipPath: 'polygon(0 0, 100% 0, 100% 85%, 85% 100%, 0 100%)'}}>
                    <Monitor className="h-6 w-6 md:h-8 md:w-8 text-blue-400" />
                  </div>
                </div>
                <div className="space-y-1">
                  <h1 className="text-xl md:text-3xl font-bold text-white flex items-center gap-2 flex-wrap">
                    <Sparkles className="h-4 w-4 md:h-6 md:w-6 text-blue-400" />
                    分析ダッシュボード
                    <Badge className="bg-slate-700 text-blue-400 border border-slate-600 text-xs md:text-sm" style={{clipPath: 'polygon(0 0, 95% 0, 100% 50%, 95% 100%, 0 100%)'}}>
                      <Wifi className="h-3 w-3 mr-1" />
                      Live
                    </Badge>
                  </h1>
                  <p className="text-slate-400 text-sm md:text-base flex items-center gap-2">
                    <Database className="h-3 w-3 md:h-4 md:w-4 text-slate-500" />
                    チームパフォーマンスのリアルタイム分析
                  </p>
                </div>
              </div>
              
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-2 px-3 py-1.5 md:px-4 md:py-2 bg-slate-800/50 backdrop-blur-sm border border-slate-700" style={{clipPath: 'polygon(0 0, 100% 0, 100% 70%, 90% 100%, 0 100%)'}}>
                  <Activity className="h-3 w-3 md:h-4 md:w-4 text-green-400" />
                  <span className="text-white text-xs md:text-sm">システム稼働中</span>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 md:px-4 md:py-2 bg-slate-800/50 backdrop-blur-sm border border-slate-700" style={{clipPath: 'polygon(10% 0, 100% 0, 100% 100%, 0 100%)'}}>
                  <Shield className="h-3 w-3 md:h-4 md:w-4 text-blue-400" />
                  <span className="text-white text-xs md:text-sm">データ保護済み</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Simplified Filter Section */}
        <div className="relative overflow-hidden rounded-2xl bg-slate-800/50 backdrop-blur-xl border border-slate-700">
          <div className="relative p-4 md:p-6">
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-slate-700 border border-slate-600" style={{clipPath: 'polygon(0 0, 90% 0, 100% 50%, 90% 100%, 0 100%)'}}>
                  <Filter className="h-4 w-4 md:h-5 md:w-5 text-slate-400" />
                </div>
                <div>
                  <h3 className="text-white font-semibold text-sm md:text-base">データフィルター</h3>
                  <p className="text-slate-400 text-xs md:text-sm">分析対象を選択</p>
                </div>
              </div>
              
              <div className="flex flex-col sm:flex-row sm:flex-wrap items-center gap-3">
                <div className="relative w-full sm:w-auto">
                  <Select value={selectedSeason} onValueChange={setSelectedSeason}>
                    <SelectTrigger className="w-full sm:w-[200px] bg-slate-800/50 border-slate-600 text-white backdrop-blur-sm hover:bg-slate-800 transition-all">
                      <Calendar className="h-4 w-4 mr-2 text-slate-400" />
                      <SelectValue placeholder="シーズン" />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-600 text-white">
                      <SelectItem value="all" className="text-white">すべてのシーズン</SelectItem>
                      {seasons.map((s) => (
                        <SelectItem key={s} value={s} className="text-white">{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="relative w-full sm:w-auto">
                  <Select value={selectedCompetitionId} onValueChange={setSelectedCompetitionId}>
                    <SelectTrigger className="w-full sm:w-[200px] bg-slate-800/50 border-slate-600 text-white backdrop-blur-sm hover:bg-slate-800 transition-all">
                      <Trophy className="h-4 w-4 mr-2 text-slate-400" />
                      <SelectValue placeholder="大会" />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-600 text-white">
                      <SelectItem value="all" className="text-white">すべての大会</SelectItem>
                      {visibleCompetitions.map((c) => (
                        <SelectItem key={c.id} value={c.id} className="text-white">
                          {c.season ? `${c.name} (${c.season})` : c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </div>
        </div>
          {loading ? (
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-600/20 to-purple-600/20 backdrop-blur-xl border border-white/10">
            <div className="absolute inset-0 bg-grid-white/5 [mask-image:linear-gradient(to_bottom,white,transparent,white)]"></div>
            <div className="relative p-12">
              <div className="flex flex-col items-center justify-center space-y-4">
                <div className="relative">
                  <div className="absolute inset-0 bg-blue-500/20 blur-xl rounded-full"></div>
                  <div className="relative p-4 bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl">
                    <Cpu className="h-12 w-12 text-white animate-pulse" />
                  </div>
                </div>
                <div className="text-center space-y-2">
                  <div className="flex items-center justify-center gap-2">
                    <Loader2 className="h-6 w-6 text-blue-400 animate-spin" />
                    <span className="text-xl font-semibold text-white">データ処理中...</span>
                  </div>
                  <p className="text-blue-200">AI分析エンジンがデータを解析しています</p>
                  <div className="flex items-center gap-2 text-sm text-blue-300">
                    <Terminal className="h-4 w-4" />
                    <span>System Processing...</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : !mainTeamId ? (
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-red-600/20 to-orange-600/20 backdrop-blur-xl border border-white/10">
            <div className="absolute inset-0 bg-grid-white/5 [mask-image:linear-gradient(to_bottom,white,transparent,white)]"></div>
            <div className="relative p-12">
              <div className="flex flex-col items-center justify-center space-y-4">
                <div className="relative">
                  <div className="absolute inset-0 bg-red-500/20 blur-xl rounded-full"></div>
                  <div className="relative p-4 bg-gradient-to-r from-red-500 to-orange-600 rounded-xl">
                    <Shield className="h-12 w-12 text-white" />
                  </div>
                </div>
                <div className="text-center space-y-2">
                  <h3 className="text-xl font-semibold text-white">システム設定が必要</h3>
                  <p className="text-red-200">メインチームが未設定です</p>
                  <p className="text-sm text-red-300">クラブ情報でメインチーム設定を確認してください</p>
                  <div className="flex items-center gap-2 text-sm text-red-400">
                    <Code className="h-4 w-4" />
                    <span>Error: No main team configured</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <Tabs defaultValue="overview" className="space-y-6">
            <TabsList className="relative overflow-hidden rounded-xl bg-slate-800/50 backdrop-blur-xl border border-slate-700 p-1">
              <div className="relative grid grid-cols-3 md:grid-cols-5 gap-1 w-full">
                <TabsTrigger value="overview" className="relative data-[state=active]:bg-slate-700 data-[state=active]:text-white text-slate-400 hover:text-white transition-all duration-300 rounded-lg">
                  <div className="flex flex-col items-center gap-1 py-2 px-1">
                    <Gauge className="h-3 w-3 md:h-4 md:w-4" />
                    <span className="text-xs md:text-sm">概要</span>
                  </div>
                </TabsTrigger>
                <TabsTrigger value="stats" className="relative data-[state=active]:bg-slate-700 data-[state=active]:text-white text-slate-400 hover:text-white transition-all duration-300 rounded-lg">
                  <div className="flex flex-col items-center gap-1 py-2 px-1">
                    <BarChart3 className="h-3 w-3 md:h-4 md:w-4" />
                    <span className="text-xs md:text-sm">スタッツ</span>
                  </div>
                </TabsTrigger>
                <TabsTrigger value="season" className="relative data-[state=active]:bg-slate-700 data-[state=active]:text-white text-slate-400 hover:text-white transition-all duration-300 rounded-lg">
                  <div className="flex flex-col items-center gap-1 py-2 px-1">
                    <Calendar className="h-3 w-3 md:h-4 md:w-4" />
                    <span className="text-xs md:text-sm">シーズン</span>
                  </div>
                </TabsTrigger>
                <TabsTrigger value="ranking" className="relative data-[state=active]:bg-slate-700 data-[state=active]:text-white text-slate-400 hover:text-white transition-all duration-300 rounded-lg hidden md:flex">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4" />
                    <span>順位</span>
                  </div>
                </TabsTrigger>
                <TabsTrigger value="players" className="relative data-[state=active]:bg-slate-700 data-[state=active]:text-white text-slate-400 hover:text-white transition-all duration-300 rounded-lg">
                  <div className="flex flex-col items-center gap-1 py-2 px-1">
                    <Users className="h-3 w-3 md:h-4 md:w-4" />
                    <span className="text-xs md:text-sm">選手</span>
                  </div>
                </TabsTrigger>
              </div>
            </TabsList>

              {/* 概要タブ */}
              <TabsContent value="overview" className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="relative overflow-hidden rounded-xl bg-slate-800/50 backdrop-blur-xl border border-slate-700">
                    <div className="relative p-4 md:p-6">
                      <div className="flex items-center justify-between mb-4">
                        <div className="p-2 bg-slate-700" style={{clipPath: 'polygon(0 0, 100% 0, 100% 75%, 75% 100%, 0 100%)'}}>
                          <Trophy className="h-5 w-5 md:h-6 md:w-6 text-slate-400" />
                        </div>
                        <div className="flex items-center gap-1 text-xs text-slate-400">
                          <Activity className="h-3 w-3" />
                          <span className="hidden sm:inline">Live</span>
                          <span className="sm:hidden">●</span>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <p className="text-slate-400 text-sm font-medium">総試合数</p>
                        <p className="text-2xl md:text-3xl font-bold text-white">
                          {matches.filter(m => m.isCompleted).length}
                        </p>
                        <p className="text-slate-500 text-xs">Matches Played</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="relative overflow-hidden rounded-xl bg-slate-800/50 backdrop-blur-xl border border-slate-700">
                    <div className="relative p-4 md:p-6">
                      <div className="flex items-center justify-between mb-4">
                        <div className="p-2 bg-slate-700" style={{clipPath: 'polygon(25% 0, 100% 0, 100% 100%, 0 100%)'}}>
                          <Home className="h-5 w-5 md:h-6 md:w-6 text-slate-400" />
                        </div>
                        <div className="flex items-center gap-1 text-xs text-slate-400">
                          <Zap className="h-3 w-3" />
                          <span className="hidden sm:inline">Home</span>
                          <span className="sm:hidden">H</span>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <p className="text-slate-400 text-sm font-medium">ホーム勝利</p>
                        <p className="text-2xl md:text-3xl font-bold text-white">
                          {seasonRecords.reduce((sum, r) => sum + r.homeWins, 0)}
                        </p>
                        <p className="text-slate-500 text-xs">Home Wins</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="relative overflow-hidden rounded-xl bg-slate-800/50 backdrop-blur-xl border border-slate-700">
                    <div className="relative p-4 md:p-6">
                      <div className="flex items-center justify-between mb-4">
                        <div className="p-2 bg-slate-700" style={{clipPath: 'polygon(0 0, 75% 0, 100% 25%, 100% 100%, 25% 100%, 0 75%)'}}>
                          <MapPin className="h-5 w-5 md:h-6 md:w-6 text-slate-400" />
                        </div>
                        <div className="flex items-center gap-1 text-xs text-slate-400">
                          <Globe className="h-3 w-3" />
                          <span className="hidden sm:inline">Away</span>
                          <span className="sm:hidden">A</span>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <p className="text-slate-400 text-sm font-medium">アウェイ勝利</p>
                        <p className="text-2xl md:text-3xl font-bold text-white">
                          {seasonRecords.reduce((sum, r) => sum + r.awayWins, 0)}
                        </p>
                        <p className="text-slate-500 text-xs">Away Wins</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="relative overflow-hidden rounded-xl bg-slate-800/50 backdrop-blur-xl border border-slate-700">
                    <div className="relative p-4 md:p-6">
                      <div className="flex items-center justify-between mb-4">
                        <div className="p-2 bg-slate-700" style={{clipPath: 'polygon(10% 0, 100% 0, 90% 100%, 0 100%)'}}>
                          <Target className="h-5 w-5 md:h-6 md:w-6 text-slate-400" />
                        </div>
                        <div className="flex items-center gap-1 text-xs text-slate-400">
                          <Sparkles className="h-3 w-3" />
                          <span className="hidden sm:inline">Rate</span>
                          <span className="sm:hidden">%</span>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <p className="text-slate-400 text-sm font-medium">総勝率</p>
                        <p className="text-2xl md:text-3xl font-bold text-white">
                          {seasonRecords.length > 0 ? 
                            (seasonRecords.reduce((sum, r) => sum + r.winRate, 0) / seasonRecords.length).toFixed(1) 
                            : "0.0"}%
                        </p>
                        <p className="text-slate-500 text-xs">Win Rate</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="relative overflow-hidden rounded-xl bg-slate-800/50 backdrop-blur-xl border border-slate-700">
                  <div className="relative p-4 md:p-6">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="p-2 bg-slate-700" style={{clipPath: 'polygon(0 0, 85% 0, 100% 15%, 100% 85%, 85% 100%, 0 100%)'}}>
                        <Bot className="h-5 w-5 md:h-6 md:w-6 text-slate-400" />
                      </div>
                      <div className="space-y-1">
                        <h3 className="text-lg md:text-xl font-bold text-white">主要スタッツ</h3>
                        <p className="text-slate-400 text-xs md:text-sm">AI分析によるメイン5項目の平均値</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 md:gap-4">
                      {mainStatsData.map((stat, index) => (
                        <div key={stat!.id} className="relative overflow-hidden rounded-lg bg-slate-700/50 backdrop-blur-sm border border-slate-600 hover:border-slate-500 transition-all duration-300 group">
                          <div className="relative p-3 md:p-4 text-center">
                            <div className="w-6 h-6 md:w-8 md:h-8 mx-auto mb-2 md:mb-3 bg-slate-700 flex items-center justify-center" style={{clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)'}}>
                              <span className="text-white font-bold text-xs md:text-sm">{index + 1}</span>
                            </div>
                            <p className="text-slate-400 text-xs md:text-sm font-medium mb-1 md:mb-2">{stat!.name}</p>
                            <p className="text-lg md:text-2xl font-bold text-white mb-1">
                              {stat!.isPercentage ? 
                                `${stat!.average.toFixed(1)}%` : 
                                stat!.average.toFixed(1)
                              }
                            </p>
                            <div className="flex items-center justify-center gap-1 text-xs text-slate-500">
                              <Activity className="h-2 w-2 md:h-3 md:w-3" />
                              <span className="hidden md:inline">Avg</span>
                              <span className="md:hidden">平均</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </TabsContent>

              {/* スタッツタブ */}
              <TabsContent value="stats" className="space-y-6">
                <div className="relative overflow-hidden rounded-xl bg-slate-800/50 backdrop-blur-xl border border-slate-700">
                  <div className="relative p-4 md:p-6">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="p-2 bg-slate-700" style={{clipPath: 'polygon(15% 0, 100% 0, 85% 100%, 0 100%)'}}>
                        <Layers className="h-5 w-5 md:h-6 md:w-6 text-slate-400" />
                      </div>
                      <div className="space-y-1">
                        <h3 className="text-lg md:text-xl font-bold text-white">スタッツ集計</h3>
                        <p className="text-slate-400 text-xs md:text-sm">15項目から抜粋した主要スタッツのAI分析</p>
                      </div>
                    </div>
                    <div className="space-y-6">
                      <div className="p-3 md:p-4 bg-slate-700/50 rounded-lg border border-slate-600">
                        <p className="text-white font-medium mb-3 flex items-center gap-2 text-sm md:text-base">
                          <Command className="h-3 w-3 md:h-4 md:w-4 text-slate-400" />
                          表示項目選択：
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {MAIN_STATS.map((stat) => (
                            <Badge
                              key={stat.id}
                              variant={selectedStats.includes(stat.id) ? "default" : "outline"}
                              className={`cursor-pointer transition-all duration-300 text-xs ${
                                selectedStats.includes(stat.id) 
                                  ? "bg-slate-700 text-white border-slate-600 hover:bg-slate-600" 
                                  : "border-slate-600 text-slate-400 hover:text-white hover:border-slate-500"
                              }`}
                              onClick={() => {
                                if (selectedStats.includes(stat.id)) {
                                  setSelectedStats(selectedStats.filter(s => s !== stat.id));
                                } else {
                                  setSelectedStats([...selectedStats, stat.id]);
                                }
                              }}
                            >
                              <div className="flex items-center gap-1">
                                <Activity className="h-2 w-2 md:h-3 md:w-3" />
                                {stat.name}
                              </div>
                            </Badge>
                          ))}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
                        <div className="relative overflow-hidden rounded-lg bg-slate-700/50 backdrop-blur-sm border border-slate-600">
                          <div className="relative p-3 md:p-4">
                            <h4 className="font-bold text-white mb-4 flex items-center gap-2 text-sm md:text-base">
                              <Database className="h-4 w-4 md:h-5 md:w-5 text-slate-400" style={{clipPath: 'polygon(0 0, 80% 0, 100% 50%, 80% 100%, 0 100%)'}} />
                              合計値
                            </h4>
                            <div className="space-y-3">
                              {mainStatsData.map((stat) => (
                                <div key={stat!.id} className="flex justify-between items-center p-3 bg-slate-800/50 rounded-lg border border-slate-600 hover:bg-slate-800 transition-all">
                                  <span className="font-medium text-white text-sm">{stat!.name}</span>
                                  <span className="font-bold text-slate-300 text-sm">
                                    {stat!.isPercentage ? 
                                      `${stat!.total.toFixed(1)}%` : 
                                      Math.round(stat!.total)
                                    }
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>

                        <div className="relative overflow-hidden rounded-lg bg-slate-700/50 backdrop-blur-sm border border-slate-600">
                          <div className="relative p-3 md:p-4">
                            <h4 className="font-bold text-white mb-4 flex items-center gap-2 text-sm md:text-base">
                              <Gauge className="h-4 w-4 md:h-5 md:w-5 text-slate-400" style={{clipPath: 'polygon(20% 0, 100% 0, 100% 100%, 0 100%)'}} />
                              1試合平均
                            </h4>
                            <div className="space-y-3">
                              {mainStatsData.map((stat) => (
                                <div key={stat!.id} className="flex justify-between items-center p-3 bg-slate-800/50 rounded-lg border border-slate-600 hover:bg-slate-800 transition-all">
                                  <span className="font-medium text-white text-sm">{stat!.name}</span>
                                  <span className="font-bold text-slate-300 text-sm">
                                    {stat!.isPercentage ? 
                                      `${stat!.average.toFixed(1)}%` : 
                                      stat!.average.toFixed(1)
                                    }
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </TabsContent>

              {/* シーズン記録タブ */}
              <TabsContent value="season" className="space-y-6">
                <div className="relative overflow-hidden rounded-xl bg-slate-800/50 backdrop-blur-xl border border-slate-700">
                  <div className="relative p-4 md:p-6">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="p-2 bg-slate-700" style={{clipPath: 'polygon(0 0, 85% 0, 100% 15%, 100% 85%, 85% 100%, 0 100%)'}}>
                        <Calendar className="h-5 w-5 md:h-6 md:w-6 text-slate-400" />
                      </div>
                      <div className="space-y-1">
                        <h3 className="text-lg md:text-xl font-bold text-white">シーズン別成績</h3>
                        <p className="text-slate-400 text-xs md:text-sm">各シーズンの詳細戦績とAI分析結果</p>
                      </div>
                    </div>
                    <div className="space-y-4">
                      {seasonRecords.map((record) => (
                        <div key={record.season} className="relative overflow-hidden rounded-lg bg-slate-700/50 backdrop-blur-sm border border-slate-600 hover:border-slate-500 transition-all">
                          <div className="relative p-4 md:p-6">
                            <div className="flex justify-between items-start mb-4">
                              <div className="flex items-center gap-3">
                                <div className="p-2 bg-slate-700" style={{clipPath: 'polygon(25% 0, 100% 0, 75% 100%, 0 100%)'}}>
                                  <Flag className="h-4 w-4 md:h-5 md:w-5 text-slate-400" />
                                </div>
                                <h4 className="font-bold text-lg md:text-xl text-white">{record.season}</h4>
                              </div>
                              <Badge className="bg-slate-700 text-slate-300 border border-slate-600">
                                <TrendingUp className="h-3 w-3 mr-1" />
                                勝率 {record.winRate.toFixed(1)}%
                              </Badge>
                            </div>
                            
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                              <div className="text-center p-3 bg-slate-800/50 rounded-lg border border-slate-600">
                                <p className="text-slate-400 text-sm mb-1">勝点</p>
                                <p className="text-xl md:text-2xl font-bold text-white">{record.points}</p>
                              </div>
                              <div className="text-center p-3 bg-slate-800/50 rounded-lg border border-slate-600">
                                <p className="text-slate-400 text-sm mb-1">勝-分-負</p>
                                <p className="text-xl md:text-2xl font-bold text-white">{record.wins}-{record.draws}-{record.losses}</p>
                              </div>
                              <div className="text-center p-3 bg-slate-800/50 rounded-lg border border-slate-600">
                                <p className="text-slate-400 text-sm mb-1">得点-失点</p>
                                <p className="text-xl md:text-2xl font-bold text-white">{record.goalsFor}-{record.goalsAgainst}</p>
                              </div>
                              <div className="text-center p-3 bg-slate-800/50 rounded-lg border border-slate-600">
                                <p className="text-slate-400 text-sm mb-1">得失点差</p>
                                <p className="text-xl md:text-2xl font-bold text-white">{record.goalDifference > 0 ? '+' : ''}{record.goalDifference}</p>
                              </div>
                            </div>

                            <div className="flex gap-4 md:gap-6 text-sm">
                              <div className="flex items-center gap-2 px-3 py-1 bg-slate-800/50 rounded-lg border border-slate-600">
                                <Home className="h-4 w-4 text-slate-400" />
                                <span className="text-slate-300">ホーム勝利: {record.homeWins}</span>
                              </div>
                              <div className="flex items-center gap-2 px-3 py-1 bg-slate-800/50 rounded-lg border border-slate-600">
                                <MapPin className="h-4 w-4 text-slate-400" />
                                <span className="text-slate-300">アウェイ勝利: {record.awayWins}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </TabsContent>

              {/* 選手成績タブ */}
              <TabsContent value="players" className="space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
                  <div className="relative overflow-hidden rounded-xl bg-slate-800/50 backdrop-blur-xl border border-slate-700">
                    <div className="relative p-4 md:p-6">
                      <div className="flex items-center gap-3 mb-6">
                        <div className="p-2 bg-slate-700" style={{clipPath: 'polygon(0 0, 80% 0, 100% 20%, 100% 80%, 80% 100%, 0 100%)'}}>
                          <Goal className="h-5 w-5 md:h-6 md:w-6 text-slate-400" />
                        </div>
                        <div className="space-y-1">
                          <h3 className="text-lg md:text-xl font-bold text-white">ゴールランキング</h3>
                          <p className="text-slate-400 text-xs md:text-sm">AI分析によるTop 3ゴールスコアラー</p>
                        </div>
                      </div>
                      <div className="space-y-3 md:space-y-4">
                        {topGoalscorers.map((player, index) => (
                          <div key={player.playerId} className="relative overflow-hidden rounded-lg bg-slate-700/50 backdrop-blur-sm border border-slate-600 hover:border-slate-500 transition-all">
                            <div className="relative p-3 md:p-4">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 md:gap-3">
                                  <div className={`relative w-8 h-8 md:w-10 md:h-10 flex items-center justify-center font-bold text-white ${
                                    index === 0 ? 'bg-slate-600' : 
                                    index === 1 ? 'bg-slate-700' : 
                                    'bg-slate-800'
                                  }`} style={{clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)'}}>
                                    <div className="absolute inset-0 bg-white/20 blur-sm"></div>
                                    <span className="relative text-sm md:text-base">{index + 1}</span>
                                  </div>
                                  <div className="space-y-0.5 md:space-y-1">
                                    <p className="font-semibold text-white text-sm md:text-base">{player.playerName}</p>
                                    <div className="flex items-center gap-1 text-xs text-slate-400">
                                      <Trophy className="h-2 w-2 md:h-3 md:w-3" />
                                      <span className="hidden md:inline">Top Scorer</span>
                                      <span className="md:hidden">得点王</span>
                                    </div>
                                  </div>
                                </div>
                                <div className="text-right">
                                  <p className="font-bold text-lg md:text-2xl text-slate-300">{player.goals}</p>
                                  <p className="text-xs text-slate-400">{player.matches}試合</p>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="relative overflow-hidden rounded-xl bg-slate-800/50 backdrop-blur-xl border border-slate-700">
                    <div className="relative p-4 md:p-6">
                      <div className="flex items-center gap-3 mb-6">
                        <div className="p-2 bg-slate-700" style={{clipPath: 'polygon(20% 0, 100% 0, 80% 100%, 0 100%)'}}>
                          <Users className="h-5 w-5 md:h-6 md:w-6 text-slate-400" />
                        </div>
                        <div className="space-y-1">
                          <h3 className="text-lg md:text-xl font-bold text-white">アシストランキング</h3>
                          <p className="text-slate-400 text-xs md:text-sm">AI分析によるTop 3アシストプロバイダー</p>
                        </div>
                      </div>
                      <div className="space-y-3 md:space-y-4">
                        {topAssists.map((player, index) => (
                          <div key={player.playerId} className="relative overflow-hidden rounded-lg bg-slate-700/50 backdrop-blur-sm border border-slate-600 hover:border-slate-500 transition-all">
                            <div className="relative p-3 md:p-4">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 md:gap-3">
                                  <div className={`relative w-8 h-8 md:w-10 md:h-10 flex items-center justify-center font-bold text-white ${
                                    index === 0 ? 'bg-slate-600' : 
                                    index === 1 ? 'bg-slate-700' : 
                                    'bg-slate-800'
                                  }`} style={{clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)'}}>
                                    <div className="absolute inset-0 bg-white/20 blur-sm"></div>
                                    <span className="relative text-sm md:text-base">{index + 1}</span>
                                  </div>
                                  <div className="space-y-0.5 md:space-y-1">
                                    <p className="font-semibold text-white text-sm md:text-base">{player.playerName}</p>
                                    <div className="flex items-center gap-1 text-xs text-slate-400">
                                      <Users className="h-2 w-2 md:h-3 md:w-3" />
                                      <span className="hidden md:inline">Top Provider</span>
                                      <span className="md:hidden">アシスト王</span>
                                    </div>
                                  </div>
                                </div>
                                <div className="text-right">
                                  <p className="font-bold text-lg md:text-2xl text-slate-300">{player.assists}</p>
                                  <p className="text-xs text-slate-400">{player.matches}試合</p>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
        )}
      </div>
    </div>
  );
}
