"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { collection, getDocs, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { usePlayerStats, PlayerStats as AggregatedPlayerStats } from "@/hooks/usePlayerStats";
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
  ownerUid: string;
  mainTeamId?: string | null;
}

function PublicCompetitionRecords({ ownerUid, mainTeamId }: PublicCompetitionRecordsProps) {
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string>("");
  const [seasons, setSeasons] = useState<string[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<string>("all");
  const [competitions, setCompetitions] = useState<CompetitionDoc[]>([]);
  const [selectedCompetitionId, setSelectedCompetitionId] = useState<string>("all");
  const [matches, setMatches] = useState<MatchForRecords[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    if (!ownerUid) {
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      setLoading(true);
      try {
        const teamsQueryRef = query(collection(db, `clubs/${ownerUid}/teams`));
        const teamsSnap = await getDocs(teamsQueryRef);
        let teamsData: TeamOption[] = teamsSnap.docs.map((doc) => ({
          id: doc.id,
          name: ((doc.data() as any).name as string) || doc.id,
        }));
        teamsData.sort((a, b) => a.name.localeCompare(b.name));

        if (mainTeamId) {
          teamsData = teamsData.filter((t) => t.id === mainTeamId);
        }

        setTeams(teamsData);

        const competitionsQueryRef = query(collection(db, `clubs/${ownerUid}/competitions`));
        const competitionsSnap = await getDocs(competitionsQueryRef);

        const competitionsData: CompetitionDoc[] = competitionsSnap.docs.map((doc) => {
          const data = doc.data() as any;
          return {
            id: doc.id,
            name: (data.name as string) || doc.id,
            season: data.season as string | undefined,
          };
        });

        const seasonSet = new Set<string>();
        competitionsData.forEach((comp) => {
          if (comp.season && typeof comp.season === "string" && comp.season.trim() !== "") {
            seasonSet.add(comp.season);
          }
        });
        const seasonList = Array.from(seasonSet).sort((a, b) => a.localeCompare(b));
        setSeasons(seasonList);
        setCompetitions(competitionsData);

        const allMatches: MatchForRecords[] = [];

        for (const compDoc of competitionsData) {
          if (selectedSeason !== "all" && compDoc.season && compDoc.season !== selectedSeason) {
            continue;
          }

          if (selectedCompetitionId !== "all" && compDoc.id !== selectedCompetitionId) {
            continue;
          }

          const roundsQueryRef = query(collection(db, `clubs/${ownerUid}/competitions/${compDoc.id}/rounds`));
          const roundsSnap = await getDocs(roundsQueryRef);

          for (const roundDoc of roundsSnap.docs) {
            const matchesQueryRef = query(
              collection(db, `clubs/${ownerUid}/competitions/${compDoc.id}/rounds/${roundDoc.id}/matches`)
            );
            const matchesSnap = await getDocs(matchesQueryRef);

            for (const matchDoc of matchesSnap.docs) {
              const matchData = matchDoc.data() as any;
              allMatches.push({
                id: matchDoc.id,
                competitionId: compDoc.id,
                competitionName: compDoc.name,
                competitionSeason: compDoc.season,
                homeTeamId: matchData.homeTeam,
                awayTeamId: matchData.awayTeam,
                matchDate: matchData.matchDate,
                scoreHome: matchData.scoreHome,
                scoreAway: matchData.scoreAway,
                teamStats: matchData.teamStats as any[] | undefined,
              });
            }
          }
        }

        allMatches.sort((a, b) => new Date(a.matchDate).getTime() - new Date(b.matchDate).getTime());
        setMatches(allMatches);

        if (mainTeamId) {
          setSelectedTeamId(mainTeamId);
        } else if (!selectedTeamId && teamsData.length > 0) {
          setSelectedTeamId(teamsData[0].id);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [ownerUid, selectedSeason, selectedCompetitionId, selectedTeamId, mainTeamId]);

  const recordsByCompetition: CompetitionRecordRow[] = useMemo(() => {
    if (!selectedTeamId) return [];

    const byComp = new Map<string, CompetitionRecordRow>();

    for (const match of matches) {
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
  }, [matches, selectedTeamId]);

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

      {loading ? (
        <div className="flex items-center justify-center py-10 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          <span>集計中...</span>
        </div>
      ) : !selectedTeamId ? (
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
  ownerUid: string;
  mainTeamId?: string | null;
}

function PublicPlayerStatsView({ ownerUid, mainTeamId }: PublicPlayerStatsViewProps) {
  const [seasons, setSeasons] = useState<string[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<string>("all");
  const [competitions, setCompetitions] = useState<{ id: string; name: string }[]>([]);
  const [selectedCompetition, setSelectedCompetition] = useState<string>("all");
  const [players, setPlayers] = useState<
    {
      id: string;
      name: string;
      number?: string;
      position?: string;
      teamId?: string;
    }[]
  >([]);
  const [selectedTeam, setSelectedTeam] = useState<string>(mainTeamId || "all");
  const [sortConfig, setSortConfig] = useState<{
    key: keyof AggregatedPlayerStats;
    direction: "asc" | "desc";
  } | null>(null);

  const { stats, loading: statsLoading } = usePlayerStats(
    ownerUid,
    selectedSeason || "all",
    selectedCompetition
  );

  useEffect(() => {
    if (!ownerUid) return;
    const fetchCompetitions = async () => {
      const comps: { id: string; name: string }[] = [];
      const seasonSet = new Set<string>();
      const querySnapshot = await getDocs(collection(db, `clubs/${ownerUid}/competitions`));
      querySnapshot.forEach((doc) => {
        const data = doc.data() as any;
        comps.push({ id: doc.id, name: data.name });
        if (data.season) {
          seasonSet.add(data.season as string);
        }
      });
      setCompetitions(comps);
      if (seasonSet.size > 0) {
        const seasonIds = Array.from(seasonSet).sort((a, b) => b.localeCompare(a));
        setSeasons(seasonIds);
      }
    };
    fetchCompetitions();
  }, [ownerUid]);

  useEffect(() => {
    if (!ownerUid) return;
    const fetchPlayers = async () => {
      const resultPlayers: {
        id: string;
        name: string;
        number?: string;
        position?: string;
        teamId?: string;
      }[] = [];
      const teamsSnapshot = await getDocs(collection(db, `clubs/${ownerUid}/teams`));
      for (const teamDoc of teamsSnapshot.docs) {
        if (mainTeamId && teamDoc.id !== mainTeamId) continue;
        const playersSnapshot = await getDocs(
          collection(db, `clubs/${ownerUid}/teams/${teamDoc.id}/players`)
        );
        playersSnapshot.forEach((pDoc) => {
          const data = pDoc.data() as any;
          resultPlayers.push({
            id: pDoc.id,
            name: data.name,
            number: data.number,
            position: data.position,
            teamId: teamDoc.id,
          });
        });
      }
      resultPlayers.sort((a, b) => a.name.localeCompare(b.name));
      setPlayers(resultPlayers);
    };
    fetchPlayers();
  }, [ownerUid, mainTeamId]);

  useEffect(() => {
    if (mainTeamId) {
      setSelectedTeam(mainTeamId);
    }
  }, [mainTeamId]);

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
        <Select value={selectedCompetition} onValueChange={setSelectedCompetition}>
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

      {statsLoading ? (
        <div className="flex justify-center items-center h-64">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-white text-gray-900">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="p-3 text-left font-semibold w-1/3">選手</th>
                <th
                  className="p-3 text-center font-semibold cursor-pointer"
                  onClick={() => requestSort("appearances")}
                >
                  出場 {renderSortArrow("appearances")}
                </th>
                <th
                  className="p-3 text-center font-semibold cursor-pointer hidden sm:table-cell"
                  onClick={() => requestSort("minutes")}
                >
                  分 {renderSortArrow("minutes")}
                </th>
                <th
                  className="p-3 text-center font-semibold cursor-pointer"
                  onClick={() => requestSort("goals")}
                >
                  G {renderSortArrow("goals")}
                </th>
                <th
                  className="p-3 text-center font-semibold cursor-pointer"
                  onClick={() => requestSort("assists")}
                >
                  A {renderSortArrow("assists")}
                </th>
                <th
                  className="p-3 text-center font-semibold cursor-pointer hidden sm:table-cell"
                  onClick={() => requestSort("yellowCards")}
                >
                  Y {renderSortArrow("yellowCards")}
                </th>
                <th
                  className="p-3 text-center font-semibold cursor-pointer hidden sm:table-cell"
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
                    <td className="p-3 flex items-center gap-2 min-w-0">
                      <span className="text-muted-foreground w-6 text-center shrink-0">{player.number}</span>
                      {player.position ? (
                        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                          {player.position}
                        </span>
                      ) : null}
                      <span className="truncate whitespace-nowrap">{player.name}</span>
                    </td>
                    <td className="p-3 text-center">{playerStats.appearances}</td>
                    <td className="p-3 text-center hidden sm:table-cell">{playerStats.minutes}</td>
                    <td className="p-3 text-center">{playerStats.goals}</td>
                    <td className="p-3 text-center">{playerStats.assists}</td>
                    <td className="p-3 text-center hidden sm:table-cell">{playerStats.yellowCards}</td>
                    <td className="p-3 text-center hidden sm:table-cell">{playerStats.redCards}</td>
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

  useEffect(() => {
    const fetchOwner = async () => {
      if (!clubId) return;
      setLoadingOwner(true);
      setError(null);
      try {
        const res = await fetch(`/api/club/${clubId}`);
        if (!res.ok) {
          throw new Error("クラブ情報の取得に失敗しました");
        }
        const data = await res.json();
        const fromCompetitions = Array.isArray(data.competitions)
          ? data.competitions[0]?.ownerUid
          : null;
        if (fromCompetitions) {
          setOwnerUid(fromCompetitions);
          const profile = (data as any).profile || {};
          setClubName(profile.clubName || "");
          setLogoUrl(profile.logoUrl ?? null);
          setMainTeamId(typeof profile.mainTeamId === "string" ? profile.mainTeamId : null);
        } else {
          setError("クラブのオーナー情報が見つかりませんでした。");
        }
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
        ) : !ownerUid ? (
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
              <PublicCompetitionRecords ownerUid={ownerUid} mainTeamId={mainTeamId} />
            </TabsContent>
            <TabsContent value="players" className="mt-4">
              <PublicPlayerStatsView ownerUid={ownerUid} mainTeamId={mainTeamId} />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </main>
  );
}
