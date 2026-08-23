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
  name?: string;
  label?: string;
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
  recentForm?: ('W' | 'D' | 'L')[];
}

interface LeagueTableProps {
  competitions: Competition[];
  clubId?: string;
  variant?: 'home' | 'table';
  minCardOnMobile?: boolean;
  colorTheme?: 'dark' | 'light';
  themeColor?: string;
  currentClubName?: string;
}

function isLeagueRoundName(name: unknown): boolean {
  if (typeof name !== "string") return false;
  const s = name.trim();
  if (!s) return false;
  return /^第\s*\d+\s*節$/.test(s);
}

export function LeagueTable({ competitions, clubId, variant = 'home', minCardOnMobile = false, colorTheme = 'dark', themeColor = '#8A1E24', currentClubName }: LeagueTableProps) {
  const isDark = colorTheme === 'dark';
  const [standings, setStandings] = useState<Standing[]>([]);
  const [loading, setLoading] = useState(true);
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

        if (!competitionData || !Array.isArray((competitionData as any).teams) || (competitionData as any).teams.length === 0) {
          setStandings([]);
          setErrorMessage("大会に参加チームが設定されていません");
          return;
        }

        // Prefer manually saved standings if present
        if (!standingsSnap.empty) {
          const teamMatchesMap = new Map<string, { teamId: string; result: 'W' | 'D' | 'L'; date: any }[]>();
          for (const teamId of competitionData.teams) {
            teamMatchesMap.set(teamId, []);
          }

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

          const allMatches = matchesByRound.flat();
          allMatches.sort((a, b) => {
            const dateA = a.matchDate ? new Date(a.matchDate).getTime() : 0;
            const dateB = b.matchDate ? new Date(b.matchDate).getTime() : 0;
            if (dateA === 0 && dateB === 0) return 0;
            if (dateA === 0) return 1;
            if (dateB === 0) return -1;
            return dateA - dateB;
          });

          for (const match of allMatches) {
            if (match.scoreHome == null || match.scoreAway == null || match.scoreHome === '' || match.scoreAway === '') {
              continue;
            }

            const homeTeamId = match.homeTeam;
            const awayTeamId = match.awayTeam;
            const homeScore = Number(match.scoreHome);
            const awayScore = Number(match.scoreAway);

            const homeMatches = teamMatchesMap.get(homeTeamId) || [];
            const homeResult = homeScore > awayScore ? 'W' : homeScore < awayScore ? 'L' : 'D';
            homeMatches.push({ teamId: homeTeamId, result: homeResult, date: match.matchDate });
            if (homeMatches.length > 5) homeMatches.shift();
            teamMatchesMap.set(homeTeamId, homeMatches);

            const awayMatches = teamMatchesMap.get(awayTeamId) || [];
            const awayResult = awayScore > homeScore ? 'W' : awayScore < homeScore ? 'L' : 'D';
            awayMatches.push({ teamId: awayTeamId, result: awayResult, date: match.matchDate });
            if (awayMatches.length > 5) awayMatches.shift();
            teamMatchesMap.set(awayTeamId, awayMatches);
          }

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
              const matches = teamMatchesMap.get(d.id) || [];
              const recentForm = matches.map(m => m.result) as ('W' | 'D' | 'L')[];

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
                recentForm,
              } as Standing;
            })
            .sort((a, b) => a.rank - b.rank);

          setStandings(fetchedStandings);
          setLoading(false);
          return;
        }

        // 3. Initialize standings for all participating teams
        const standingsMap = new Map<string, Standing>();
        const teamMatchesMap = new Map<string, { teamId: string; result: 'W' | 'D' | 'L'; date: any }[]>();
        
        for (const teamId of competitionData.teams) {
            const teamInfo = teamsMap.get(teamId);
            standingsMap.set(teamId, {
                id: teamId,
                teamName: teamInfo?.name || 'Unknown Team',
                logoUrl: teamInfo?.logoUrl,
                rank: 0, played: 0, wins: 0, draws: 0, losses: 0,
                goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0,
            });
            teamMatchesMap.set(teamId, []);
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
            return matchesSnap.docs.map(matchDoc => matchDoc.data() as any);
          })
        );

        const allMatches = matchesByRound.flat();
        // Sort matches by date if available, otherwise preserve order
        allMatches.sort((a, b) => {
          const dateA = a.matchDate ? new Date(a.matchDate).getTime() : 0;
          const dateB = b.matchDate ? new Date(b.matchDate).getTime() : 0;
          if (dateA === 0 && dateB === 0) return 0;
          if (dateA === 0) return 1;
          if (dateB === 0) return -1;
          return dateA - dateB;
        });

        for (const match of allMatches) {
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
            
            // Track recent form for home team
            const homeMatches = teamMatchesMap.get(homeTeamId) || [];
            const homeResult = homeScore > awayScore ? 'W' : homeScore < awayScore ? 'L' : 'D';
            homeMatches.push({ teamId: homeTeamId, result: homeResult, date: match.matchDate });
            if (homeMatches.length > 5) homeMatches.shift();
            teamMatchesMap.set(homeTeamId, homeMatches);
          }

          if (awayStanding) {
            awayStanding.played += 1;
            awayStanding.goalsFor += awayScore;
            awayStanding.goalsAgainst += homeScore;
            if (awayScore > homeScore) awayStanding.wins += 1;
            else if (awayScore < homeScore) awayStanding.losses += 1;
            else awayStanding.draws += 1;
            
            // Track recent form for away team
            const awayMatches = teamMatchesMap.get(awayTeamId) || [];
            const awayResult = awayScore > homeScore ? 'W' : awayScore < homeScore ? 'L' : 'D';
            awayMatches.push({ teamId: awayTeamId, result: awayResult, date: match.matchDate });
            if (awayMatches.length > 5) awayMatches.shift();
            teamMatchesMap.set(awayTeamId, awayMatches);
          }
        }

        // 5. Finalize points and goal difference, then sort
        const finalStandings = Array.from(standingsMap.values()).map(s => {
            s.points = (s.wins * 3) + s.draws;
            s.goalDifference = s.goalsFor - s.goalsAgainst;
            const matches = teamMatchesMap.get(s.id) || [];
            s.recentForm = matches.map(m => m.result) as ('W' | 'D' | 'L')[];
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
      <div className={`p-4 rounded-2xl text-center shadow-sm border ${isDark ? 'bg-[#101116] text-slate-400 border-white/10' : 'bg-white text-muted-foreground border-black/10'}`}>
        <p>表示できる大会がありません。</p>
      </div>
    );
  }

  return (
    <>
      {loading ? (
        <div className={`flex justify-center items-center h-48 ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      ) : errorMessage ? (
        <div className="text-center py-10">
          <p className={isDark ? 'text-slate-400' : 'text-muted-foreground'}>{errorMessage}</p>
        </div>
      ) : standings.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-[#0B1410]/10 bg-white shadow-sm">
          <Table className="min-w-[900px] w-full table-auto text-xs text-[#0B1410]">
            <TableHeader>
              <TableRow className="border-b border-[#0B1410]/10 bg-[#0B1410]/[0.025] hover:bg-[#0B1410]/[0.025]">
                <TableHead className="w-[52px] px-2 py-3 text-center text-[10px] font-black text-[#0B1410]/55">順位</TableHead>
                <TableHead className="min-w-[150px] px-2 py-3 text-[10px] font-black text-[#0B1410]/55">クラブ</TableHead>
                <TableHead className="w-[50px] px-2 py-3 text-right text-[10px] font-black text-[#0B1410]/55">試</TableHead>
                <TableHead className="w-[58px] px-2 py-3 text-right text-[10px] font-black text-[#0B1410]/55">勝</TableHead>
                <TableHead className="w-[58px] px-2 py-3 text-right text-[10px] font-black text-[#0B1410]/55">分</TableHead>
                <TableHead className="w-[58px] px-2 py-3 text-right text-[10px] font-black text-[#0B1410]/55">負</TableHead>
                <TableHead className="w-[58px] px-2 py-3 text-right text-[10px] font-black text-[#0B1410]/55">得</TableHead>
                <TableHead className="w-[58px] px-2 py-3 text-right text-[10px] font-black text-[#0B1410]/55">失</TableHead>
                <TableHead className="w-[58px] px-2 py-3 text-right text-[10px] font-black text-[#0B1410]/55">±</TableHead>
                <TableHead className="w-[160px] px-2 py-3 text-center text-[10px] font-black text-[#0B1410]/55">直近5試合</TableHead>
                <TableHead className="w-[48px] px-2 py-3 text-right text-[10px] font-black text-[#0B1410]/55">点</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {standings.map((team) => {
                const rankLabel = rankLabels.find(r => team.rank >= r.from && team.rank <= r.to);
                const rankColor = rankLabel ? (
                  rankLabel.color === 'green' ? '#22c55e' :
                  rankLabel.color === 'red' ? '#ef4444' :
                  rankLabel.color === 'orange' ? '#f97316' :
                  rankLabel.color === 'blue' ? '#3b82f6' :
                  rankLabel.color === 'yellow' ? '#eab308' :
                  '#6b7280'
                ) : 'transparent';
                const isCurrentClub = currentClubName ? team.teamName.trim().toLowerCase() === currentClubName.trim().toLowerCase() : false;

                return (
                  <TableRow
                    key={team.id}
                    className="h-[50px] border-b border-[#0B1410]/10 transition-colors last:border-b-0 hover:bg-[#0B1410]/[0.025] sm:h-[56px]"
                    style={isCurrentClub ? { backgroundColor: `${themeColor}14` } : undefined}
                  >
                    <TableCell className="px-0 py-0 text-center tabular-nums">
                      <div className="flex h-[50px] items-center justify-center gap-2 sm:h-[56px]">
                        <span className="h-full w-1 shrink-0" style={{ backgroundColor: isCurrentClub ? themeColor : rankColor }} />
                        <span className="min-w-6 text-sm font-black text-[#0B1410]">{team.rank}</span>
                      </div>
                    </TableCell>
                    <TableCell className="min-w-0 px-2 py-2 sm:px-4">
                      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
                        {team.logoUrl ? (
                          <Image
                            src={team.logoUrl}
                            alt={team.teamName}
                            width={30}
                            height={30}
                            className="h-6 w-6 shrink-0 rounded-full object-contain sm:h-8 sm:w-8"
                          />
                        ) : (
                          <div className="h-6 w-6 shrink-0 rounded-full bg-[#0B1410]/10 sm:h-8 sm:w-8" />
                        )}
                        <span className={`truncate text-[13px] text-[#0B1410] sm:text-sm ${isCurrentClub ? 'font-black' : 'font-bold'}`}>{team.teamName}</span>
                      </div>
                    </TableCell>
                    <TableCell className="px-1 py-2 text-right text-sm font-semibold tabular-nums text-[#0B1410]/80">{team.played}</TableCell>
                    <TableCell className="px-2 py-2 text-right text-sm font-semibold tabular-nums text-[#0B1410]/70">{team.wins}</TableCell>
                    <TableCell className="px-2 py-2 text-right text-sm font-semibold tabular-nums text-[#0B1410]/70">{team.draws}</TableCell>
                    <TableCell className="px-2 py-2 text-right text-sm font-semibold tabular-nums text-[#0B1410]/70">{team.losses}</TableCell>
                    <TableCell className="px-2 py-2 text-right text-sm font-semibold tabular-nums text-[#0B1410]/70">{team.goalsFor}</TableCell>
                    <TableCell className="px-2 py-2 text-right text-sm font-semibold tabular-nums text-[#0B1410]/70">{team.goalsAgainst}</TableCell>
                    <TableCell className="px-2 py-2 text-right text-sm font-semibold tabular-nums text-[#0B1410]/70">{formatGoalDifference(team.goalDifference)}</TableCell>
                    <TableCell className="px-2 py-2 text-center">
                      {team.recentForm && team.recentForm.length > 0 ? (
                        <div className="flex justify-center gap-1">
                          {team.recentForm.map((result, idx) => (
                            <span
                              key={idx}
                              className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-black"
                              style={{
                                backgroundColor: result === 'W' ? '#22c55e' : result === 'D' ? '#94a3b8' : '#ef4444',
                                color: '#fff',
                              }}
                            >
                              {result}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-[11px] font-semibold text-[#0B1410]/40">-</span>
                      )}
                    </TableCell>
                    <TableCell className="px-2 py-2 text-right text-base font-black tabular-nums" style={{ color: isCurrentClub ? themeColor : '#0B1410' }}>{team.points}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {rankLabels.length > 0 && (
            <div className="flex flex-wrap gap-x-4 gap-y-2 border-t border-[#0B1410]/10 px-4 py-3">
              {rankLabels.map((label, index) => {
                const color = label.color === 'green' ? '#22c55e' : label.color === 'red' ? '#ef4444' : label.color === 'orange' ? '#f97316' : label.color === 'blue' ? '#3b82f6' : label.color === 'yellow' ? '#eab308' : '#6b7280';
                return (
                  <div key={index} className="flex items-center gap-1.5 text-[11px] font-semibold text-[#0B1410]/65">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
                    <span>{label.name || label.label || `順位 ${label.from}-${label.to}`}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="text-center py-10">
          <p className={isDark ? 'text-slate-400' : 'text-muted-foreground'}>表示できる順位情報がありません</p>
        </div>
      )}
    </>
  );
}
