"use client";

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, getDocs, doc, getDoc } from 'firebase/firestore';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2 } from 'lucide-react';
import Image from 'next/image';

interface Competition {
  id: string;
  name: string;
  ownerUid: string;
}

type RankLabelColor = "green" | "red" | "orange" | "blue" | "yellow";

interface RankLabelRule {
  from: number;
  to: number;
  color: RankLabelColor;
}

interface Standing {
  id: string;
  rank: number;
  teamName: string;
  logoUrl?: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
}

interface LeagueTableProps {
  competitions: Competition[];
  clubId?: string;
  variant?: 'home' | 'table';
  minCardOnMobile?: boolean;
}

function isLeagueRoundName(name: unknown): boolean {
  if (typeof name !== "string") return false;
  const s = name.trim();
  if (!s) return false;
  return /^第\s*\d+\s*節$/.test(s);
}

export function LeagueTable({ competitions, clubId, variant = 'home', minCardOnMobile = false }: LeagueTableProps) {
  const [standings, setStandings] = useState<Standing[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCompetition, setSelectedCompetition] = useState<{ name: string; logoUrl?: string } | null>(null);
  const [rankLabels, setRankLabels] = useState<RankLabelRule[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchStandingsViaPublicApi = async (clubIdArg: string, competitionId: string) => {
    const res = await fetch(
      `/api/public/club/${encodeURIComponent(clubIdArg)}/standings?competitionId=${encodeURIComponent(competitionId)}`,
      { method: "GET" }
    );
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(text || `Public standings API failed (${res.status})`);
    }
    const json = (await res.json()) as any;
    if (json?.selectedCompetition) setSelectedCompetition(json.selectedCompetition);
    if (Array.isArray(json?.rankLabels)) setRankLabels(json.rankLabels);
    if (typeof json?.errorMessage === "string" && json.errorMessage) {
      setErrorMessage(String(json.errorMessage));
    }
    const rows = Array.isArray(json?.standings) ? (json.standings as Standing[]) : [];
    setStandings(rows);
  };

  const formatGoalDifference = (value: number) => {
    if (value > 0) return `+${value}`;
    return `${value}`;
  };

  useEffect(() => {
    if (!competitions || competitions.length === 0) {
      setLoading(false);
      setErrorMessage(null);
      return;
    }

    const fetchStandings = async () => {
      setLoading(true);
      setErrorMessage(null);
      try {
        const selectedComp =
          (competitions.find((c) => (c as any).showOnHome) as Competition | undefined) ||
          competitions[0];
        if (!selectedComp) return;

        // Public pages (unauthenticated) should not read Firestore directly.
        // If clubId is available, always use the public API to avoid permission-denied console errors.
        if (clubId && selectedComp?.id) {
          await fetchStandingsViaPublicApi(clubId, selectedComp.id);
          return;
        }

        const competitionDocRef = doc(db, `clubs/${selectedComp.ownerUid}/competitions`, selectedComp.id);

        // 1. Fetch teams + competition doc + (optional) manually saved standings in parallel
        const [allTeamsSnap, competitionSnap, standingsSnap] = await Promise.all([
          getDocs(query(collection(db, `clubs/${selectedComp.ownerUid}/teams`))),
          getDoc(competitionDocRef),
          getDocs(collection(competitionDocRef, 'standings')),
        ]);

        const teamsMap = new Map<string, { name: string; logoUrl?: string }>();
        allTeamsSnap.forEach((d) => {
          teamsMap.set(d.id, { name: (d.data() as any).name, logoUrl: (d.data() as any).logoUrl });
        });

        const competitionData = competitionSnap.data() as any;

        const fetchedRankLabels: RankLabelRule[] = Array.isArray((competitionData as any)?.rankLabels)
          ? ((competitionData as any).rankLabels as any[])
              .map((r) => ({
                from: Number((r as any).from),
                to: Number((r as any).to),
                color: (r as any).color as RankLabelColor,
              }))
              .filter(
                (r) =>
                  Number.isFinite(r.from) &&
                  Number.isFinite(r.to) &&
                  r.from > 0 &&
                  r.to > 0 &&
                  r.from <= r.to &&
                  ["green", "red", "orange", "blue", "yellow"].includes(r.color)
              )
          : [];

        setRankLabels(fetchedRankLabels);

        // Save selected competition info (name/logo) for display
        setSelectedCompetition({
          name: (competitionData && (competitionData as any).name) || selectedComp.name,
          logoUrl: competitionData ? (competitionData as any).logoUrl : undefined,
        });

        if (!competitionData || !Array.isArray((competitionData as any).teams) || (competitionData as any).teams.length === 0) {
          setStandings([]);
          setErrorMessage("大会に参加チームが設定されていません");
          return;
        }

        // Prefer manually saved standings if present
        if (!standingsSnap.empty) {
          const fetchedStandings = standingsSnap.docs
            .map((d) => {
              const data = d.data() as any;
              const teamInfo = teamsMap.get(d.id);
              const wins = typeof data.wins === 'number' ? data.wins : 0;
              const draws = typeof data.draws === 'number' ? data.draws : 0;
              const goalsFor = typeof data.goalsFor === 'number' ? data.goalsFor : 0;
              const goalsAgainst = typeof data.goalsAgainst === 'number' ? data.goalsAgainst : 0;

              const points = typeof data.points === 'number' ? data.points : (wins * 3 + draws);
              const goalDifference =
                typeof data.goalDifference === 'number' ? data.goalDifference : (goalsFor - goalsAgainst);

              return {
                id: d.id,
                rank: typeof data.rank === 'number' ? data.rank : 0,
                teamName: teamInfo?.name || data.teamName || 'Unknown Team',
                logoUrl: teamInfo?.logoUrl,
                played: typeof data.played === 'number' ? data.played : 0,
                wins,
                draws,
                losses: typeof data.losses === 'number' ? data.losses : 0,
                goalsFor,
                goalsAgainst,
                goalDifference,
                points,
              } as Standing;
            })
            .sort((a, b) => a.rank - b.rank);

          setStandings(fetchedStandings);
          setLoading(false);
          return;
        }

        // 3. Initialize standings for all participating teams
        const standingsMap = new Map<string, Standing>();
        for (const teamId of competitionData.teams) {
            const teamInfo = teamsMap.get(teamId);
            standingsMap.set(teamId, {
                id: teamId,
                teamName: teamInfo?.name || 'Unknown Team',
                logoUrl: teamInfo?.logoUrl,
                rank: 0, played: 0, wins: 0, draws: 0, losses: 0,
                goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0,
            });
        }

        // 4. Fetch all matches and calculate results (rounds->matches in parallel)
        const roundsSnap = await getDocs(collection(competitionDocRef, 'rounds'));
        const format = (competitionData as any)?.format;
        const roundDocs =
          format === 'league_cup'
            ? roundsSnap.docs.filter((d) => isLeagueRoundName((d.data() as any)?.name))
            : roundsSnap.docs;

        const matchesByRound = await Promise.all(
          roundDocs.map(async (roundDoc) => {
            const matchesSnap = await getDocs(collection(roundDoc.ref, 'matches'));
            return matchesSnap.docs.map((matchDoc) => matchDoc.data() as any);
          })
        );

        for (const match of matchesByRound.flat()) {
          if (match.scoreHome == null || match.scoreAway == null || match.scoreHome === '' || match.scoreAway === '') {
            continue;
          }

          const homeTeamId = match.homeTeam;
          const awayTeamId = match.awayTeam;
          const homeScore = Number(match.scoreHome);
          const awayScore = Number(match.scoreAway);

          const homeStanding = standingsMap.get(homeTeamId);
          const awayStanding = standingsMap.get(awayTeamId);

          if (homeStanding) {
            homeStanding.played += 1;
            homeStanding.goalsFor += homeScore;
            homeStanding.goalsAgainst += awayScore;
            if (homeScore > awayScore) homeStanding.wins += 1;
            else if (homeScore < awayScore) homeStanding.losses += 1;
            else homeStanding.draws += 1;
          }

          if (awayStanding) {
            awayStanding.played += 1;
            awayStanding.goalsFor += awayScore;
            awayStanding.goalsAgainst += homeScore;
            if (awayScore > homeScore) awayStanding.wins += 1;
            else if (awayScore < homeScore) awayStanding.losses += 1;
            else awayStanding.draws += 1;
          }
        }

        // 5. Finalize points and goal difference, then sort
        const finalStandings = Array.from(standingsMap.values()).map(s => {
            s.points = (s.wins * 3) + s.draws;
            s.goalDifference = s.goalsFor - s.goalsAgainst;
            return s;
        });

        finalStandings.sort((a, b) => {
            if (a.points !== b.points) return b.points - a.points;
            if (a.goalDifference !== b.goalDifference) return b.goalDifference - a.goalDifference;
            if (a.goalsFor !== b.goalsFor) return b.goalsFor - a.goalsFor;
            return a.teamName.localeCompare(b.teamName);
        });

        // 6. Assign ranks
        const rankedStandings = finalStandings.map((s, index) => ({ ...s, rank: index + 1 }));

        setStandings(rankedStandings);
      } catch (error) {
        console.error("Error calculating standings: ", error);
        const rawMsg =
          typeof (error as any)?.message === 'string' && (error as any).message
            ? String((error as any).message)
            : "";

        setStandings([]);
        const msg = rawMsg || "順位表の取得に失敗しました";
        setErrorMessage(msg);
      } finally {
        setLoading(false);
      }
    };

    fetchStandings();
  }, [competitions, clubId]);

  if (!competitions || competitions.length === 0) {
    return (
      <div className="bg-card text-card-foreground p-4 rounded-2xl text-center text-muted-foreground shadow-sm border-0">
        <p>表示できる大会がありません。</p>
      </div>
    );
  }

  return (
    <div
      className={
        variant === 'table'
          ? 'mx-auto max-w-[520px] bg-card text-card-foreground p-4 rounded-2xl shadow-sm border-0'
          : minCardOnMobile
            ? 'bg-white text-card-foreground p-2 rounded-xl shadow-none border-0 sm:bg-card sm:p-3 sm:rounded-2xl sm:shadow-sm sm:border sm:border-border'
            : 'bg-card text-card-foreground p-2 sm:p-3 rounded-2xl shadow-sm border border-border'
      }
    >
      {selectedCompetition && (
        <div className="flex items-center gap-2 mb-2">
          {selectedCompetition.logoUrl && (
            <Image
              src={selectedCompetition.logoUrl}
              alt={selectedCompetition.name}
              width={22}
              height={22}
              className="rounded-full object-contain"
            />
          )}
          <h3 className="text-xs sm:text-sm font-semibold truncate">
            {selectedCompetition.name}
          </h3>
        </div>
      )}
      {loading ? (
        <div className="flex justify-center items-center h-48">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      ) : errorMessage ? (
        <div className="text-center py-10">
          <p className="text-muted-foreground">{errorMessage}</p>
        </div>
      ) : standings.length > 0 ? (
        <div className={variant === 'table' ? 'overflow-x-hidden' : 'overflow-x-hidden sm:overflow-x-auto'}>
          <Table
            className={
              variant === 'table'
                ? 'w-full table-fixed text-xs'
                : 'w-full table-fixed sm:table-auto sm:min-w-[440px] text-xs'
            }
          >
            <TableHeader className={variant === 'table' ? "[&_tr]:border-0" : undefined}>
              <TableRow className={variant === 'table' ? "border-0" : undefined}>
                <TableHead className="w-[24px] px-2 py-1 sm:w-[32px] sm:px-2 sm:py-1">#</TableHead>
                <TableHead className="px-2 py-1 sm:px-2 sm:py-1">Club</TableHead>
                <TableHead className="w-[36px] text-right tabular-nums px-2 py-1 sm:w-auto sm:px-2 sm:py-1">試</TableHead>

                {variant === 'table' ? (
                  <>
                    <TableHead className="hidden sm:table-cell text-right tabular-nums px-1 py-0.5 sm:px-2 sm:py-1">勝</TableHead>
                    <TableHead className="hidden sm:table-cell text-right tabular-nums px-1 py-0.5 sm:px-2 sm:py-1">分</TableHead>
                    <TableHead className="hidden sm:table-cell text-right tabular-nums px-1 py-0.5 sm:px-2 sm:py-1">負</TableHead>
                    <TableHead className="hidden sm:table-cell text-right tabular-nums px-1 py-0.5 sm:px-2 sm:py-1">得</TableHead>
                    <TableHead className="hidden sm:table-cell text-right tabular-nums px-1 py-0.5 sm:px-2 sm:py-1">失</TableHead>
                  </>
                ) : (
                  <>
                    <TableHead className="hidden sm:table-cell text-right px-1 py-0.5 sm:px-2 sm:py-1">勝</TableHead>
                    <TableHead className="hidden sm:table-cell text-right px-1 py-0.5 sm:px-2 sm:py-1">分</TableHead>
                    <TableHead className="hidden sm:table-cell text-right px-1 py-0.5 sm:px-2 sm:py-1">負</TableHead>
                  </>
                )}

                <TableHead className="w-[44px] text-right tabular-nums px-1 py-0.5 sm:w-auto sm:px-2 sm:py-1">±</TableHead>
                <TableHead className="w-[36px] text-right tabular-nums px-1 py-0.5 sm:w-auto sm:px-2 sm:py-1">点</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {standings.map((team) => (
                <TableRow key={team.id} className={variant === 'table' ? "border-0" : undefined}>
                  <TableCell className="font-medium px-2 py-1 sm:px-2 sm:py-1 relative">
                    {(() => {
                      const rule = rankLabels.find((r) => team.rank >= r.from && team.rank <= r.to);
                      if (!rule) return null;
                      const colorClass =
                        rule.color === "green"
                          ? "bg-emerald-500"
                          : rule.color === "red"
                            ? "bg-red-500"
                            : rule.color === "orange"
                              ? "bg-orange-500"
                              : rule.color === "blue"
                                ? "bg-blue-500"
                                : "bg-yellow-400";
                      return (
                        <span
                          className={`absolute left-0 top-0 bottom-0 ${colorClass}`}
                          style={{ width: "4px", top: "1px", bottom: "1px" }}
                        />
                      );
                    })()}
                    {team.rank}
                  </TableCell>
                  <TableCell className="px-2 py-1 sm:px-2 sm:py-1">
                    <div className="flex items-center gap-1.5">
                      {team.logoUrl ? (
                        <Image
                          src={team.logoUrl}
                          alt={team.teamName}
                          width={18}
                          height={18}
                          className="rounded-full object-contain"
                        />
                      ) : (
                        <div className="w-[18px] h-[18px] bg-muted rounded-full" />
                      )}
                      <span className="truncate max-w-[130px] sm:max-w-none text-[13px] sm:text-xs">{team.teamName}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums px-2 py-1 sm:px-2 sm:py-1">{team.played}</TableCell>
                  {variant === 'table' ? (
                    <>
                      <TableCell className="hidden sm:table-cell text-right tabular-nums px-1 py-0.5 sm:px-2 sm:py-1">{team.wins}</TableCell>
                      <TableCell className="hidden sm:table-cell text-right tabular-nums px-1 py-0.5 sm:px-2 sm:py-1">{team.draws}</TableCell>
                      <TableCell className="hidden sm:table-cell text-right tabular-nums px-1 py-0.5 sm:px-2 sm:py-1">{team.losses}</TableCell>
                      <TableCell className="hidden sm:table-cell text-right tabular-nums px-1 py-0.5 sm:px-2 sm:py-1">{team.goalsFor}</TableCell>
                      <TableCell className="hidden sm:table-cell text-right tabular-nums px-1 py-0.5 sm:px-2 sm:py-1">{team.goalsAgainst}</TableCell>
                    </>
                  ) : (
                    <>
                      <TableCell className="hidden sm:table-cell text-right px-1 py-0.5 sm:px-2 sm:py-1">{team.wins}</TableCell>
                      <TableCell className="hidden sm:table-cell text-right px-1 py-0.5 sm:px-2 sm:py-1">{team.draws}</TableCell>
                      <TableCell className="hidden sm:table-cell text-right px-1 py-0.5 sm:px-2 sm:py-1">{team.losses}</TableCell>
                    </>
                  )}
                  <TableCell className="text-right tabular-nums px-1 py-0.5 sm:px-2 sm:py-1">{formatGoalDifference(team.goalDifference)}</TableCell>
                  <TableCell className="text-right tabular-nums px-1 py-0.5 sm:px-2 sm:py-1 font-bold">{team.points}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="text-center py-10">
          <p className="text-muted-foreground">表示できる順位情報がありません</p>
        </div>
      )}
    </div>
  );
}
