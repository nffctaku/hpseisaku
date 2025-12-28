"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, ArrowUpDown } from "lucide-react";
import { ClubHeader } from "@/components/club-header";

interface TeamOption {
  id: string;
  name: string;
}

interface CompetitionDoc {
  id: string;
  name: string;
  season?: string;
}

interface PlayerRow {
  id: string;
  name: string;
  number?: number;
  position?: string;
  teamId?: string;
  manualCompetitionStats?: any[];
}

interface StatsDataResponse {
  ownerUid: string;
  profile: any;
  mainTeamId: string | null;
  teams: TeamOption[];
  competitions: CompetitionDoc[];
  players: PlayerRow[];
  matches: MatchForRecords[];
}

type AggregatedPlayerStats = {
  appearances: number;
  minutes: number;
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
};

function aggregatePlayerStats(
  matches: any[],
  players: PlayerRow[],
  competitions: CompetitionDoc[],
  selectedSeason: string,
  selectedCompetitionId: string
): Record<string, AggregatedPlayerStats> {
  const result: Record<string, AggregatedPlayerStats> = {};

  const compsFiltered = competitions.filter((c) => {
    if (selectedSeason !== "all" && c.season !== selectedSeason) return false;
    if (selectedCompetitionId !== "all" && c.id !== selectedCompetitionId) return false;
    return true;
  });
  const compIds = new Set(compsFiltered.map((c) => c.id));

  const manualByCompetition = new Map<string, Map<string, any>>();
  for (const p of players) {
    const rows = Array.isArray(p.manualCompetitionStats) ? p.manualCompetitionStats : [];
    for (const r of rows) {
      const compId = typeof r?.competitionId === "string" ? r.competitionId : "";
      if (!compId || !compIds.has(compId)) continue;
      const map = manualByCompetition.get(compId) ?? new Map<string, any>();
      map.set(p.id, r);
      manualByCompetition.set(compId, map);
    }
  }

  for (const comp of compsFiltered) {
    const manualForThisCompetition = manualByCompetition.get(comp.id) ?? new Map<string, any>();

    for (const [playerId, m] of manualForThisCompetition.entries()) {
      if (!result[playerId]) {
        result[playerId] = { appearances: 0, minutes: 0, goals: 0, assists: 0, yellowCards: 0, redCards: 0 };
      }
      result[playerId].appearances += typeof m?.matches === "number" ? m.matches : 0;
      result[playerId].minutes += typeof m?.minutes === "number" ? m.minutes : 0;
      result[playerId].goals += typeof m?.goals === "number" ? m.goals : 0;
      result[playerId].assists += typeof m?.assists === "number" ? m.assists : 0;
      result[playerId].yellowCards += typeof m?.yellowCards === "number" ? m.yellowCards : 0;
      result[playerId].redCards += typeof m?.redCards === "number" ? m.redCards : 0;
    }

    const matchesForComp = matches.filter((m) => m?.competitionId === comp.id);
    for (const match of matchesForComp) {
      const ps = Array.isArray((match as any)?.playerStats) ? (match as any).playerStats : [];
      for (const stat of ps) {
        const playerId = stat?.playerId;
        if (!playerId) continue;
        if (manualForThisCompetition.has(playerId)) continue;
        if (!result[playerId]) {
          result[playerId] = { appearances: 0, minutes: 0, goals: 0, assists: 0, yellowCards: 0, redCards: 0 };
        }
        const minutesPlayed = Number(stat.minutesPlayed) || 0;
        result[playerId].appearances += minutesPlayed > 0 ? 1 : 0;
        result[playerId].minutes += minutesPlayed;
        result[playerId].goals += Number(stat.goals) || 0;
        result[playerId].assists += Number(stat.assists) || 0;
        result[playerId].yellowCards += Number(stat.yellowCards) || 0;
        result[playerId].redCards += Number(stat.redCards) || 0;
      }
    }
  }

  return result;
}

interface MatchForRecords {
  id: string;
  competitionId: string;
  competitionName: string;
  competitionSeason?: string;
  homeTeamId: string;
  awayTeamId: string;
  matchDate: string;
  scoreHome?: number | null;
  scoreAway?: number | null;
  teamStats?: any[];
}

interface CompetitionRecordRow {
  competitionId: string;
  competitionName: string;
  competitionSeason?: string;
  matches: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  shots?: number;
  shotsOnTarget?: number;
  possessionAvg?: number;
}

interface PublicCompetitionRecordsProps {
  teams: TeamOption[];
  competitions: CompetitionDoc[];
  matches: MatchForRecords[];
  mainTeamId?: string | null;
}

function PublicCompetitionRecords({ teams, competitions, matches, mainTeamId }: PublicCompetitionRecordsProps) {
  const [selectedTeamId, setSelectedTeamId] = useState<string>(mainTeamId || "");
  const [selectedSeason, setSelectedSeason] = useState<string>("all");
  const [selectedCompetitionId, setSelectedCompetitionId] = useState<string>("all");

  useEffect(() => {
    if (mainTeamId) {
      setSelectedTeamId(mainTeamId);
    } else if (!selectedTeamId && teams.length > 0) {
      setSelectedTeamId(teams[0].id);
    }
  }, [mainTeamId, selectedTeamId, teams]);

  const seasons = useMemo(() => {
    const set = new Set<string>();
    competitions.forEach((c) => {
      if (c.season && typeof c.season === "string" && c.season.trim() !== "") set.add(c.season);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [competitions]);

  const filteredMatches = useMemo(() => {
    const allowedCompetitionIds = new Set(
      competitions
        .filter((c) => {
          if (selectedSeason !== "all" && c.season !== selectedSeason) return false;
          if (selectedCompetitionId !== "all" && c.id !== selectedCompetitionId) return false;
          return true;
        })
        .map((c) => c.id)
    );
    return matches
      .filter((m) => allowedCompetitionIds.has(m.competitionId))
      .slice()
      .sort((a, b) => new Date(a.matchDate).getTime() - new Date(b.matchDate).getTime());
  }, [competitions, matches, selectedCompetitionId, selectedSeason]);

  const recordsByCompetition: CompetitionRecordRow[] = useMemo(() => {
    if (!selectedTeamId) return [];

    const byComp = new Map<string, CompetitionRecordRow>();

    for (const match of filteredMatches) {
      const isHome = match.homeTeamId === selectedTeamId;
      const isAway = match.awayTeamId === selectedTeamId;
      if (!isHome && !isAway) continue;

      const hasScores = typeof match.scoreHome === "number" && typeof match.scoreAway === "number";
      if (!hasScores) continue;

      const key = match.competitionId;
      if (!byComp.has(key)) {
        byComp.set(key, {
          competitionId: match.competitionId,
          competitionName: match.competitionName,
          competitionSeason: match.competitionSeason,
          matches: 0,
          wins: 0,
          draws: 0,
          losses: 0,
          goalsFor: 0,
          goalsAgainst: 0,
          shots: 0,
          shotsOnTarget: 0,
          possessionAvg: undefined,
        });
      }

      const row = byComp.get(key)!;
      row.matches += 1;

      const gf = isHome ? match.scoreHome! : match.scoreAway!;
      const ga = isHome ? match.scoreAway! : match.scoreHome!;
      row.goalsFor += gf;
      row.goalsAgainst += ga;

      if (gf > ga) row.wins += 1;
      else if (gf === ga) row.draws += 1;
      else row.losses += 1;

      if (match.teamStats && Array.isArray(match.teamStats)) {
        const sideKey = isHome ? "homeValue" : "awayValue";

        for (const stat of match.teamStats) {
          const rawVal = (stat as any)[sideKey];
          const numVal = typeof rawVal === "number" ? rawVal : parseFloat(String(rawVal));
          if (isNaN(numVal)) {
            continue;
          }

          if (stat.id === "shots") {
            row.shots = (row.shots || 0) + numVal;
          } else if (stat.id === "shotsOnTarget") {
            row.shotsOnTarget = (row.shotsOnTarget || 0) + numVal;
          } else if (stat.id === "possession") {
            row.possessionAvg = (row.possessionAvg || 0) + numVal;
          }
        }
      }
    }

    for (const row of byComp.values()) {
      if (row.matches > 0 && typeof row.possessionAvg === "number") {
        row.possessionAvg = row.possessionAvg / row.matches;
      } else {
        row.possessionAvg = undefined;
      }
    }

    return Array.from(byComp.values()).sort((a, b) => a.competitionName.localeCompare(b.competitionName));
  }, [filteredMatches, selectedTeamId]);

  return (
    <div className="py-6 space-y-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2">
        <div className="flex flex-wrap items-center gap-2 justify-end">
          <Select value={selectedSeason} onValueChange={setSelectedSeason}>
            <SelectTrigger className="w-[180px] bg-white text-gray-900">
              <SelectValue placeholder="シーズンを選択" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">すべてのシーズン</SelectItem>
              {seasons.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={selectedCompetitionId} onValueChange={setSelectedCompetitionId}>
            <SelectTrigger className="w-[180px] bg-white text-gray-900">
              <SelectValue placeholder="大会を選択" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">すべての大会</SelectItem>
              {competitions.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {!selectedTeamId ? (
        <div className="text-center py-10 text-muted-foreground">
          チームを選択すると大会ごとの成績が表示されます。
        </div>
      ) : recordsByCompetition.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground">
          選択した条件の試合記録がありません。
        </div>
      ) : (
        <div className="bg-white text-gray-900 border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>大会</TableHead>
                <TableHead>シーズン</TableHead>
                <TableHead className="text-right">試合</TableHead>
                <TableHead className="text-right">勝</TableHead>
                <TableHead className="text-right">分</TableHead>
                <TableHead className="text-right">敗</TableHead>
                <TableHead className="text-right">得点</TableHead>
                <TableHead className="text-right">失点</TableHead>
                <TableHead className="text-right">得失点</TableHead>
                <TableHead className="text-right">シュート</TableHead>
                <TableHead className="text-right">枠内S</TableHead>
                <TableHead className="text-right">支配率(平均)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recordsByCompetition.map((row) => {
                const goalDiff = row.goalsFor - row.goalsAgainst;
                const possessionDisplay =
                  typeof row.possessionAvg === "number" ? `${row.possessionAvg.toFixed(1)}%` : "-";

                return (
                  <TableRow key={row.competitionId}>
                    <TableCell>{row.competitionName}</TableCell>
                    <TableCell>{row.competitionSeason || "-"}</TableCell>
                    <TableCell className="text-right">{row.matches}</TableCell>
                    <TableCell className="text-right">{row.wins}</TableCell>
                    <TableCell className="text-right">{row.draws}</TableCell>
                    <TableCell className="text-right">{row.losses}</TableCell>
                    <TableCell className="text-right">{row.goalsFor}</TableCell>
                    <TableCell className="text-right">{row.goalsAgainst}</TableCell>
                    <TableCell className="text-right">{goalDiff}</TableCell>
                    <TableCell className="text-right">{row.shots ?? "-"}</TableCell>
                    <TableCell className="text-right">{row.shotsOnTarget ?? "-"}</TableCell>
                    <TableCell className="text-right">{possessionDisplay}</TableCell>
                  </TableRow>
                );
              })}

              {(() => {
                const totals = recordsByCompetition.reduce(
                  (acc, row) => {
                    acc.matches += row.matches;
                    acc.wins += row.wins;
                    acc.draws += row.draws;
                    acc.losses += row.losses;
                    acc.goalsFor += row.goalsFor;
                    acc.goalsAgainst += row.goalsAgainst;
                    if (typeof row.shots === "number") acc.shots += row.shots;
                    if (typeof row.shotsOnTarget === "number") acc.shotsOnTarget += row.shotsOnTarget;
                    if (typeof row.possessionAvg === "number") {
                      acc.possessionSum += row.possessionAvg;
                      acc.possessionCount += 1;
                    }
                    return acc;
                  },
                  {
                    matches: 0,
                    wins: 0,
                    draws: 0,
                    losses: 0,
                    goalsFor: 0,
                    goalsAgainst: 0,
                    shots: 0,
                    shotsOnTarget: 0,
                    possessionSum: 0,
                    possessionCount: 0,
                  }
                );

                const totalGoalDiff = totals.goalsFor - totals.goalsAgainst;
                const totalPossessionAvg =
                  totals.possessionCount > 0 ? totals.possessionSum / totals.possessionCount : undefined;
                const totalPossessionDisplay =
                  typeof totalPossessionAvg === "number" ? `${totalPossessionAvg.toFixed(1)}%` : "-";

                return (
                  <TableRow className="font-semibold bg-gray-50">
                    <TableCell>合計</TableCell>
                    <TableCell>-</TableCell>
                    <TableCell className="text-right">{totals.matches}</TableCell>
                    <TableCell className="text-right">{totals.wins}</TableCell>
                    <TableCell className="text-right">{totals.draws}</TableCell>
                    <TableCell className="text-right">{totals.losses}</TableCell>
                    <TableCell className="text-right">{totals.goalsFor}</TableCell>
                    <TableCell className="text-right">{totals.goalsAgainst}</TableCell>
                    <TableCell className="text-right">{totalGoalDiff}</TableCell>
                    <TableCell className="text-right">{totals.shots || "-"}</TableCell>
                    <TableCell className="text-right">{totals.shotsOnTarget || "-"}</TableCell>
                    <TableCell className="text-right">{totalPossessionDisplay}</TableCell>
                  </TableRow>
                );
              })()}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

interface PublicPlayerStatsViewProps {
  teams: TeamOption[];
  competitions: CompetitionDoc[];
  players: PlayerRow[];
  matches: any[];
  mainTeamId?: string | null;
}

function PublicPlayerStatsView({ teams, competitions, players, matches, mainTeamId }: PublicPlayerStatsViewProps) {
  const [selectedSeason, setSelectedSeason] = useState<string>("all");
  const [selectedCompetition, setSelectedCompetition] = useState<string>("all");
  const [selectedTeam, setSelectedTeam] = useState<string>(mainTeamId || "all");
  const [sortConfig, setSortConfig] = useState<{ key: keyof AggregatedPlayerStats; direction: "asc" | "desc" } | null>(null);

  useEffect(() => {
    if (mainTeamId) {
      setSelectedTeam(mainTeamId);
    }
  }, [mainTeamId]);

  const seasons = useMemo(() => {
    const set = new Set<string>();
    competitions.forEach((c) => {
      if (c.season && typeof c.season === "string" && c.season.trim() !== "") set.add(c.season);
    });
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [competitions]);

  const teamFilteredPlayers = useMemo(() => {
    const base = mainTeamId ? players.filter((p) => p.teamId === mainTeamId) : players;
    return selectedTeam === "all" ? base : base.filter((p) => p.teamId === selectedTeam);
  }, [players, selectedTeam, mainTeamId]);

  const stats = useMemo(
    () => aggregatePlayerStats(matches, players, competitions, selectedSeason || "all", selectedCompetition),
    [matches, players, competitions, selectedSeason, selectedCompetition]
  );

  const filteredPlayersByTeam =
    selectedTeam === "all" ? players : players.filter((p) => p.teamId === selectedTeam);

  const sortedPlayers = [...filteredPlayersByTeam].sort((a, b) => {
    if (sortConfig) {
      const aStats =
        stats[a.id] || {
          appearances: 0,
          minutes: 0,
          goals: 0,
          assists: 0,
          yellowCards: 0,
          redCards: 0,
        };
      const bStats =
        stats[b.id] || {
          appearances: 0,
          minutes: 0,
          goals: 0,
          assists: 0,
          yellowCards: 0,
          redCards: 0,
        };
      const aValue = aStats[sortConfig.key];
      const bValue = bStats[sortConfig.key];

      if (aValue < bValue) return sortConfig.direction === "asc" ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === "asc" ? 1 : -1;
    }
    const an = typeof a.number === "number" ? a.number : parseFloat(String(a.number ?? ""));
    const bn = typeof b.number === "number" ? b.number : parseFloat(String(b.number ?? ""));
    const aNum = Number.isFinite(an) ? an : 9999;
    const bNum = Number.isFinite(bn) ? bn : 9999;
    return aNum - bNum;
  });

  const requestSort = (key: keyof AggregatedPlayerStats) => {
    let direction: "asc" | "desc" = "desc";
    if (sortConfig && sortConfig.key === key && sortConfig.direction === "desc") {
      direction = "asc";
    }
    setSortConfig({ key, direction });
  };

  const renderSortArrow = (key: keyof AggregatedPlayerStats) => {
    if (!sortConfig || sortConfig.key !== key) {
      return <ArrowUpDown className="ml-2 h-4 w-4 opacity-30" />;
    }
    return sortConfig.direction === "desc" ? "↓" : "↑";
  };

  return (
    <div className="space-y-6 py-6">
      <div className="flex flex-wrap gap-2 justify-end">
        <Select value={selectedTeam} onValueChange={setSelectedTeam}>
          <SelectTrigger className="w-full sm:w-[180px] bg-white text-gray-900">
            <SelectValue placeholder="チームを選択" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">すべてのチーム</SelectItem>
            {teams.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={selectedCompetition} onValueChange={setSelectedCompetition}>
          <SelectTrigger className="w-full sm:w-[180px] bg-white text-gray-900">
            <SelectValue placeholder="大会を選択" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">すべての大会</SelectItem>
            {competitions.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {sortedPlayers.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground">表示できる選手がいません。</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-white text-gray-900">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="p-2 sm:p-3 text-left font-semibold w-[45%]">選手</th>
              <th
                className="p-2 sm:p-3 text-center font-semibold cursor-pointer"
                onClick={() => requestSort("appearances")}
              >
                出場 {renderSortArrow("appearances")}
              </th>
              <th
                className="p-2 sm:p-3 text-center font-semibold cursor-pointer hidden sm:table-cell"
                onClick={() => requestSort("minutes")}
              >
                分 {renderSortArrow("minutes")}
              </th>
              <th
                className="p-2 sm:p-3 text-center font-semibold cursor-pointer"
                onClick={() => requestSort("goals")}
              >
                G {renderSortArrow("goals")}
              </th>
              <th
                className="p-2 sm:p-3 text-center font-semibold cursor-pointer"
                onClick={() => requestSort("assists")}
              >
                A {renderSortArrow("assists")}
              </th>
              <th
                className="p-2 sm:p-3 text-center font-semibold cursor-pointer hidden sm:table-cell"
                onClick={() => requestSort("yellowCards")}
              >
                Y {renderSortArrow("yellowCards")}
              </th>
              <th
                className="p-2 sm:p-3 text-center font-semibold cursor-pointer hidden sm:table-cell"
                onClick={() => requestSort("redCards")}
              >
                R {renderSortArrow("redCards")}
              </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {sortedPlayers.map((player) => {
                const playerStats =
                  stats[player.id] || {
                    appearances: 0,
                    minutes: 0,
                    goals: 0,
                    assists: 0,
                    yellowCards: 0,
                    redCards: 0,
                  };
                return (
                  <tr key={player.id}>
                    <td className="p-2 sm:p-3 flex items-center gap-2 min-w-0">
                      <span className="text-muted-foreground w-6 text-center shrink-0">{player.number}</span>
                      {player.position ? (
                        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                          {player.position}
                        </span>
                      ) : null}
                      <span className="truncate whitespace-nowrap">{player.name}</span>
                    </td>
                    <td className="p-2 sm:p-3 text-center">{playerStats.appearances}</td>
                    <td className="p-2 sm:p-3 text-center hidden sm:table-cell">{playerStats.minutes}</td>
                    <td className="p-2 sm:p-3 text-center">{playerStats.goals}</td>
                    <td className="p-2 sm:p-3 text-center">{playerStats.assists}</td>
                    <td className="p-2 sm:p-3 text-center hidden sm:table-cell">{playerStats.yellowCards}</td>
                    <td className="p-2 sm:p-3 text-center hidden sm:table-cell">{playerStats.redCards}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function ClubStatsPage() {
  const params = useParams();
  const clubId = params?.clubId as string | undefined;
  const [ownerUid, setOwnerUid] = useState<string | null>(null);
  const [loadingOwner, setLoadingOwner] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [clubName, setClubName] = useState<string>("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [mainTeamId, setMainTeamId] = useState<string | null>(null);
  const [statsData, setStatsData] = useState<StatsDataResponse | null>(null);

  useEffect(() => {
    const fetchOwner = async () => {
      if (!clubId) return;
      setLoadingOwner(true);
      setError(null);
      try {
        const res = await fetch(`/api/club/${clubId}/stats-data`);
        if (!res.ok) {
          throw new Error("クラブ情報の取得に失敗しました");
        }
        const data = (await res.json()) as StatsDataResponse;
        setOwnerUid(data.ownerUid);
        setStatsData(data);
        const profile = (data as any).profile || {};
        setClubName(profile.clubName || "");
        setLogoUrl(profile.logoUrl ?? null);
        setMainTeamId(typeof (profile as any).mainTeamId === "string" ? (profile as any).mainTeamId : data.mainTeamId);
      } catch (e) {
        console.error(e);
        setError("クラブ情報の取得中にエラーが発生しました。");
      } finally {
        setLoadingOwner(false);
      }
    };

    fetchOwner();
  }, [clubId]);

  return (
    <main className="min-h-screen">
      {clubId && (
        <ClubHeader clubId={clubId} clubName={clubName} logoUrl={logoUrl} />
      )}
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-2xl md:text-3xl font-bold mb-4">STATS</h1>
        <p className="text-sm text-muted-foreground mb-6">
          クラブの大会成績・選手成績をまとめて閲覧できるページです。
        </p>

        {loadingOwner ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            <span>読み込み中...</span>
          </div>
        ) : error ? (
          <div className="text-sm text-red-600 py-4">{error}</div>
        ) : !ownerUid || !statsData ? (
          <div className="text-sm text-muted-foreground py-4">
            クラブのオーナー情報が取得できませんでした。
          </div>
        ) : (
          <Tabs defaultValue="competitions" className="mt-4">
            <TabsList className="grid w-full grid-cols-2 max-w-md">
              <TabsTrigger value="competitions">大会成績</TabsTrigger>
              <TabsTrigger value="players">選手成績</TabsTrigger>
            </TabsList>
            <TabsContent value="competitions" className="mt-4">
              <PublicCompetitionRecords
                teams={statsData.teams}
                competitions={statsData.competitions}
                matches={statsData.matches}
                mainTeamId={mainTeamId}
              />
            </TabsContent>
            <TabsContent value="players" className="mt-4">
              <PublicPlayerStatsView
                teams={statsData.teams}
                competitions={statsData.competitions}
                players={statsData.players}
                matches={statsData.matches}
                mainTeamId={mainTeamId}
              />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </main>
  );
}
