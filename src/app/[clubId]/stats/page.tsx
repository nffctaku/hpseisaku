"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, ArrowUpDown } from "lucide-react";
import { ClubHeader } from "@/components/club-header";
import { ClubFooter } from "@/components/club-footer";
import { PartnerStripClient } from "@/components/partner-strip-client";
import { SeasonPerformance } from "@/components/season-performance";

function parseColorToRgb(input: string): { r: number; g: number; b: number } | null {
  const v = input.trim();

  const hexMatch = v.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hexMatch) {
    const hex = hexMatch[1];
    if (hex.length === 3) {
      const r = parseInt(hex[0] + hex[0], 16);
      const g = parseInt(hex[1] + hex[1], 16);
      const b = parseInt(hex[2] + hex[2], 16);
      return { r, g, b };
    }
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return { r, g, b };
  }

  const rgbMatch = v.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(\d*\.?\d+)\s*)?\)$/i);
  if (rgbMatch) {
    const r = Math.min(255, Math.max(0, Number(rgbMatch[1])));
    const g = Math.min(255, Math.max(0, Number(rgbMatch[2])));
    const b = Math.min(255, Math.max(0, Number(rgbMatch[3])));
    return { r, g, b };
  }

  return null;
}

function isDarkColor(input: string): boolean | null {
  const rgb = parseColorToRgb(input);
  if (!rgb) return null;
  const { r, g, b } = rgb;
  const srgb = [r, g, b].map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  const luminance = 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
  return luminance < 0.5;
}

interface TeamOption {
  id: string;
  name: string;
}

interface CompetitionDoc {
  id: string;
  name: string;
  season?: string;
  format?: string;
}

interface PlayerRow {
  id: string;
  name: string;
  number?: number;
  position?: string;
  teamId?: string;
  manualCompetitionStats?: any[];
  seasonData?: Record<string, any>;
}

interface StatsDataResponse {
  ownerUid: string;
  profile: any;
  mainTeamId: string | null;
  resolvedMainTeamId?: string | null;
  teams: TeamOption[];
  competitions: CompetitionDoc[];
  players: PlayerRow[];
  matches: MatchForRecords[];
  aggregatedStats?: Record<string, AggregatedPlayerStats>;
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

  const allowedPlayerIds = new Set(players.map((p) => p.id));

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
      const hasAnyValue =
        typeof r?.matches === "number" ||
        typeof r?.minutes === "number" ||
        typeof r?.goals === "number" ||
        typeof r?.assists === "number" ||
        typeof r?.yellowCards === "number" ||
        typeof r?.redCards === "number";
      if (!hasAnyValue) continue;
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
        if (!allowedPlayerIds.has(playerId)) continue;
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

interface PublicPlayerStatsViewProps {
  teams: TeamOption[];
  competitions: CompetitionDoc[];
  players: PlayerRow[];
  matches: any[];
  aggregatedStats?: Record<string, AggregatedPlayerStats>;
  mainTeamId?: string | null;
  selectedSeason: string;
  setSelectedSeason: (value: string) => void;
  selectedCompetitionId: string;
  setSelectedCompetitionId: (value: string) => void;
}

function PublicPlayerStatsView({
  teams,
  competitions,
  players,
  matches,
  aggregatedStats,
  mainTeamId,
  selectedSeason,
  setSelectedSeason,
  selectedCompetitionId,
  setSelectedCompetitionId,
}: PublicPlayerStatsViewProps) {
  const [sortConfig, setSortConfig] = useState<{ key: keyof AggregatedPlayerStats; direction: "asc" | "desc" } | null>(null);

  const seasons = useMemo(() => {
    const set = new Set<string>();
    competitions.forEach((c: CompetitionDoc) => {
      if (c.season && typeof c.season === "string" && c.season.trim() !== "") set.add(c.season);
    });
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [competitions]);

  const teamFilteredPlayers = useMemo(() => {
    return mainTeamId ? players.filter((p: PlayerRow) => p.teamId === mainTeamId) : players;
  }, [players, mainTeamId]);

  const playersWithResolvedManualStats = useMemo(() => {
    const normalizeRows = (rows: any[] | undefined): any[] => (Array.isArray(rows) ? rows : []);

    return teamFilteredPlayers.map((p) => {
      const seasonData = p.seasonData && typeof p.seasonData === "object" ? p.seasonData : {};

      if (selectedSeason !== "all") {
        const sd = (seasonData as any)?.[selectedSeason];
        const seasonManual = normalizeRows((sd as any)?.manualCompetitionStats);
        const legacyManual = normalizeRows(p.manualCompetitionStats);
        return {
          ...p,
          manualCompetitionStats: seasonManual.length > 0 ? seasonManual : legacyManual,
        };
      }

      const allSeasonManual = Object.values(seasonData)
        .flatMap((v: any) => normalizeRows(v?.manualCompetitionStats));
      const legacyManual = normalizeRows(p.manualCompetitionStats);

      return {
        ...p,
        manualCompetitionStats: [...allSeasonManual, ...legacyManual],
      };
    });
  }, [teamFilteredPlayers, selectedSeason]);

  const stats = useMemo(() => {
    if (aggregatedStats && typeof aggregatedStats === 'object') return aggregatedStats;
    return aggregatePlayerStats(matches, playersWithResolvedManualStats, competitions, selectedSeason || "all", selectedCompetitionId);
  }, [aggregatedStats, matches, playersWithResolvedManualStats, competitions, selectedSeason, selectedCompetitionId]);

  const filteredPlayersByTeam = playersWithResolvedManualStats;

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
  const router = useRouter();
  const [pageAllowed, setPageAllowed] = useState<boolean | null>(null);
  const [ownerUid, setOwnerUid] = useState<string | null>(null);
  const [loadingOwner, setLoadingOwner] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const cid = typeof clubId === "string" ? clubId.trim() : "";
      if (!cid) return;
      try {
        const res = await fetch(`/api/public/club/${encodeURIComponent(cid)}/menu-settings`, {
          method: "GET",
          cache: "no-store",
        });
        if (!res.ok) {
          if (cancelled) return;
          setPageAllowed(true);
          return;
        }
        const json = (await res.json()) as any;
        const allowed = (json?.settings?.menuShowStats ?? true) !== false;
        if (cancelled) return;
        setPageAllowed(allowed);
        if (!allowed) {
          router.replace(`/${cid}`);
        }
      } catch {
        if (cancelled) return;
        setPageAllowed(true);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [clubId, router]);

  if (pageAllowed === false) {
    return null;
  }
  const [clubName, setClubName] = useState<string>("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [snsLinks, setSnsLinks] = useState<{ x?: string; youtube?: string; tiktok?: string; instagram?: string }>({});
  const [sponsors, setSponsors] = useState<any[]>([]);
  const [legalPages, setLegalPages] = useState<any[]>([]);
  const [homeBgColor, setHomeBgColor] = useState<string | null>(null);
  const [gameTeamUsage, setGameTeamUsage] = useState<boolean>(false);
  const [mainTeamId, setMainTeamId] = useState<string | null>(null);
  const [statsData, setStatsData] = useState<StatsDataResponse | null>(null);
  const [statsDataAll, setStatsDataAll] = useState<StatsDataResponse | null>(null);
  const [selectedSeason, setSelectedSeason] = useState<string>("");
  const [selectedCompetitionId, setSelectedCompetitionId] = useState<string>("all");
  const [performanceSeason, setPerformanceSeason] = useState<string>("");

  const seasons = useMemo(() => {
    const set = new Set<string>();
    ((statsDataAll ?? statsData)?.competitions || []).forEach((c) => {
      if (c.season && typeof c.season === "string" && c.season.trim() !== "") set.add(c.season);
    });
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [statsData, statsDataAll]);

  const fetchStatsData = async (opts?: { season?: string; competitionId?: string; showLoading?: boolean }) => {
    if (!clubId) return;
    if (opts?.showLoading) {
      setLoadingOwner(true);
    }
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (opts?.season) qs.set('season', opts.season);
      if (opts?.competitionId) qs.set('competitionId', opts.competitionId);
      const suffix = qs.toString() ? `?${qs.toString()}` : '';
      const res = await fetch(`/api/club/${clubId}/stats-data${suffix}`);
      if (!res.ok) {
        let bodyText = '';
        try {
          bodyText = await res.text();
        } catch {
          bodyText = '';
        }
        console.error('stats-data API error', {
          status: res.status,
          statusText: res.statusText,
          body: bodyText,
        });
        throw new Error("クラブ情報の取得に失敗しました");
      }
      const data = (await res.json()) as StatsDataResponse;
      setOwnerUid(data.ownerUid);
      if (!opts?.season && !opts?.competitionId) {
        setStatsDataAll(data);
      }
      setStatsData(data);
      const profile = (data as any).profile || {};
      setClubName(profile.clubName || "");
      setLogoUrl(profile.logoUrl ?? null);
      setSnsLinks((profile as any).snsLinks && typeof (profile as any).snsLinks === 'object' ? (profile as any).snsLinks : {});
      setSponsors(Array.isArray((profile as any).sponsors) ? (profile as any).sponsors : []);
      setLegalPages(Array.isArray((profile as any).legalPages) ? (profile as any).legalPages : []);
      setHomeBgColor(typeof (profile as any).homeBgColor === 'string' ? (profile as any).homeBgColor : null);
      setGameTeamUsage(Boolean((profile as any).gameTeamUsage));
      const rawMainTeamId = typeof (profile as any).mainTeamId === "string" ? (profile as any).mainTeamId : data.mainTeamId;
      const resolved = typeof (data as any)?.resolvedMainTeamId === 'string' ? (data as any).resolvedMainTeamId : null;
      setMainTeamId(resolved || rawMainTeamId);
    } catch (e) {
      console.error(e);
      setError("クラブ情報の取得中にエラーが発生しました。");
    } finally {
      if (opts?.showLoading) {
        setLoadingOwner(false);
      }
    }
  };

  useEffect(() => {
    fetchStatsData({ showLoading: true });
  }, [clubId]);

  useEffect(() => {
    if (seasons.length > 0 && !performanceSeason) {
      setPerformanceSeason(seasons[0]);
    }
  }, [seasons, performanceSeason]);

  // Stats list filter: fixed to the latest season (except the league-by-competition section)
  useEffect(() => {
    if (seasons.length > 0 && !selectedSeason) {
      setSelectedSeason(seasons[0]);
    }
  }, [seasons, selectedSeason]);

  useEffect(() => {
    if (!clubId) return;
    // When filters change, fetch server-filtered + cached aggregate.
    fetchStatsData({ season: selectedSeason || 'all', competitionId: selectedCompetitionId, showLoading: false });
  }, [clubId, selectedSeason, selectedCompetitionId]);

  const pageFg = (() => {
    if (homeBgColor) {
      const bgIsDark = isDarkColor(homeBgColor);
      if (bgIsDark === true) return "text-white";
      if (bgIsDark === false) return "text-black";
    }
    return "text-foreground";
  })();

  const pageMuted =
    pageFg === "text-white" ? "text-white/80" : pageFg === "text-black" ? "text-black/70" : "text-muted-foreground";

  return (
    <main className="min-h-screen" style={homeBgColor ? { backgroundColor: homeBgColor } : undefined}>
      {clubId && (
        <ClubHeader
          clubId={clubId}
          clubName={clubName}
          logoUrl={logoUrl}
          snsLinks={snsLinks}
          headerBackgroundColor={homeBgColor ?? undefined}
        />
      )}
      <div className="container mx-auto px-4 py-8">
        <h1 className={`text-2xl md:text-3xl font-bold mb-4 ${pageFg}`}>STATS</h1>
        <p className={`text-sm mb-6 ${pageMuted}`}>
          
        </p>

        {loadingOwner ? (
          <div className={`flex items-center justify-center py-10 ${pageMuted}`.trim()}>
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            <span>読み込み中...</span>
          </div>
        ) : error ? (
          <div className={`text-sm py-4 ${pageFg}`.trim()}>{error}</div>
        ) : !ownerUid || !statsData ? (
          <div className={`text-sm py-4 ${pageMuted}`.trim()}>
            クラブのオーナー情報が取得できませんでした。
          </div>
      ) : (
        <>
          <SeasonPerformance
            matches={(statsDataAll ?? statsData).matches}
            competitions={(statsDataAll ?? statsData).competitions}
            teams={(statsDataAll ?? statsData).teams}
            mainTeamId={mainTeamId}
            selectedSeason={performanceSeason}
            onSeasonChange={setPerformanceSeason}
          />

            <div className="mt-8 flex flex-wrap items-center gap-2 justify-end">
              <Select value={selectedCompetitionId} onValueChange={setSelectedCompetitionId}>
                <SelectTrigger className="w-full sm:w-[180px] bg-white text-gray-900 border">
                  <SelectValue placeholder="大会を選択" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">すべての大会</SelectItem>
                  {statsData.competitions.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <PublicPlayerStatsView
              teams={statsData.teams}
              competitions={statsData.competitions}
              players={statsData.players}
              matches={statsData.matches}
              aggregatedStats={statsData.aggregatedStats}
              mainTeamId={mainTeamId}
              selectedSeason={selectedSeason}
              setSelectedSeason={setSelectedSeason}
              selectedCompetitionId={selectedCompetitionId}
              setSelectedCompetitionId={setSelectedCompetitionId}
            />
          </>
        )}
      </div>

      {clubId && <PartnerStripClient clubId={clubId} />}
      <ClubFooter
        clubId={clubId}
        clubName={clubName}
        sponsors={sponsors}
        snsLinks={snsLinks}
        legalPages={legalPages}
        gameTeamUsage={Boolean(gameTeamUsage)}
      />
    </main>
  );
}
