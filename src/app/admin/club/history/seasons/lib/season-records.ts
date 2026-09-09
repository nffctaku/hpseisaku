export interface SeasonRecordMatch {
  competitionSeason?: string;
  competitionName?: string;
  competitionId?: string;
  competitionType?: string;
  roundName?: string;
  matchDate?: string;
  isCompleted?: boolean;
  result?: "win" | "draw" | "loss";
  isHome?: boolean;
  goalsFor?: number;
  goalsAgainst?: number;
  homeFormation?: string;
  awayFormation?: string;
  homeSquad?: { starters: string[]; substitutes: string[] };
  awaySquad?: { starters: string[]; substitutes: string[] };
  playerStats?: any[];
  [key: string]: any;
}

export interface PlayerRef {
  playerId: string;
  playerName: string;
  position?: string;
  photoUrl?: string;
  number?: number;
  nationality?: string;
}

export interface CompetitionResult {
  competitionId: string;
  competitionName: string;
  result: string;
  isChampion: boolean;
  record?: string;
  rank?: number;
}

export interface LeaderEntry {
  player?: PlayerRef;
  value: number;
}

export interface MostUsedXI {
  playerIds: string[];
  players: PlayerRef[];
  count: number;
  formation: string;
  isTie: boolean;
}

export interface MostUsedFormation {
  formation: string;
  count: number;
  total: number;
  usage: number;
}

export interface SquadPlayer extends PlayerRef {
  matches: number;
  goals: number;
  assists: number;
}

export interface SeasonTitle {
  competitionName: string;
  season: string;
}

export type SeasonMood = "title" | "good" | "normal" | "poor";

export interface SeasonSummary {
  season: string;
  matches: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  titleCount: number;
  competitionResults: CompetitionResult[];
  mood: SeasonMood;
  imageUrl: string;
}

export interface SeasonDetail extends SeasonSummary {
  leaders: {
    matches: LeaderEntry | null;
    goals: LeaderEntry | null;
    assists: LeaderEntry | null;
    cleanSheets: LeaderEntry | null;
  };
  mostUsedXI: MostUsedXI | null;
  mostUsedFormation: MostUsedFormation | null;
  squad: Record<string, SquadPlayer[]>;
  titles: SeasonTitle[];
}

export interface ClubTitleItem {
  competitionName?: string;
  seasons?: string[];
}

export function toSlashSeason(season: string): string {
  const s = String(season || "").trim();
  if (!s) return s;
  let parts: string[] = [];
  if (s.includes("/")) parts = s.split("/");
  else if (s.includes("-")) parts = s.split("-");
  if (parts.length === 2) {
    const start = parts[0].trim();
    const end = parts[1].trim();
    if (start && end) {
      return `${start}/${end.slice(-2)}`;
    }
  }
  return s;
}

export function seasonEquals(a: string, b: string): boolean {
  return toSlashSeason(a) === toSlashSeason(b);
}

function getMatchSeason(m: SeasonRecordMatch): string {
  const raw = m.competitionSeason ?? m.season ?? "";
  return String(raw).trim();
}

function normalizeCompetitionName(name: string): string {
  return String(name || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function isGoalkeeper(position?: string): boolean {
  return (position || "").toUpperCase().includes("GK");
}

function hashString(str: string): number {
  let h = 0;
  const s = String(str || "");
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) % 1000000;
  }
  return Math.abs(h);
}

const SEASON_IMAGE_POOLS: Record<SeasonMood, string[]> = {
  title: ["/シーズン成績素材1.jpg", "/シーズン記録背景.jpg", "/レコード素材1.jpg", "/レコード素材4.jpg"],
  good: ["/シーズン成績素材2.jpg", "/選手記録背景.jpg", "/レコード素材2.jpg", "/レコード素材5.jpg"],
  normal: ["/背景スタジアム.png", "/背景スタジアム１.png", "/チーム記録背景.jpg", "/レコード素材3.jpg"],
  poor: ["/シーズン成績素材3.jpg", "/選手背景.jpg", "/移籍記録背景.jpg", "/レコード素材7.jpg"],
};

export function getSeasonMoodImage(season: string, mood: SeasonMood): string {
  const pool = SEASON_IMAGE_POOLS[mood] || SEASON_IMAGE_POOLS.normal;
  const index = hashString(season) % pool.length;
  return pool[index];
}

export function positionCategory(position?: string): string {
  const p = (position || "").toUpperCase();
  if (p.includes("GK")) return "GK";
  if (p.includes("DF") || p.includes("CB") || p.includes("LB") || p.includes("RB") || p.includes("WB")) return "DF";
  if (p.includes("MF") || p.includes("DM") || p.includes("CM") || p.includes("AM") || p.includes("WG")) return "MF";
  if (p.includes("FW") || p.includes("ST") || p.includes("CF")) return "FW";
  return "-";
}

function positionSortWeight(category: string): number {
  switch (category) {
    case "GK":
      return 0;
    case "DF":
      return 1;
    case "MF":
      return 2;
    case "FW":
      return 3;
    default:
      return 4;
  }
}

export function getAllSeasons(matches: SeasonRecordMatch[], competitions?: any[]): string[] {
  const set = new Set<string>();
  for (const m of matches) {
    const s = getMatchSeason(m);
    if (s) set.add(toSlashSeason(s));
  }
  if (Array.isArray(competitions)) {
    for (const c of competitions) {
      const raw = c?.season ?? "";
      const s = String(raw).trim();
      if (s && s !== "undefined" && s !== "null") set.add(toSlashSeason(s));
    }
  }
  return Array.from(set).sort((a, b) => b.localeCompare(a, "ja"));
}

function getMatchPlayerStats(match: SeasonRecordMatch, mainTeamId?: string | null, allPlayersMap?: Map<string, PlayerRef>): any[] {
  const stats = Array.isArray((match as any).playerStats) ? (match as any).playerStats : [];
  if (!mainTeamId || stats.length === 0) return stats;
  const hasTeamId = stats.some((p: any) => typeof p?.teamId === "string");
  if (hasTeamId) return stats.filter((p: any) => p?.teamId === mainTeamId);
  if (allPlayersMap && allPlayersMap.size > 0) {
    return stats.filter((p: any) => allPlayersMap.has(typeof p?.playerId === "string" ? p.playerId : ""));
  }
  return stats;
}

function getClubStarters(match: SeasonRecordMatch, mainTeamId?: string | null, allPlayersMap?: Map<string, PlayerRef>): string[] {
  const isHome = match.isHome === true;
  const squad = isHome ? match.homeSquad : match.awaySquad;
  if (squad && Array.isArray(squad.starters)) {
    return squad.starters.filter((id) => typeof id === "string");
  }

  const stats = getMatchPlayerStats(match, mainTeamId, allPlayersMap);
  if (stats.length === 0) return [];

  const withRole = stats.filter((p: any) => typeof p?.role === "string");
  if (withRole.length > 0) {
    const starters = withRole.filter((p: any) => p.role === "starter");
    if (starters.length > 0) return starters.map((p: any) => p.playerId).filter(Boolean);
  }

  const played = stats
    .filter((p: any) => (Number(p?.minutesPlayed) || 0) > 0 || p?.role === "starter" || typeof p?.role !== "string")
    .sort((a: any, b: any) => (Number(b?.minutesPlayed) || 0) - (Number(a?.minutesPlayed) || 0));

  if (played.length >= 11) return played.slice(0, 11).map((p: any) => p.playerId).filter(Boolean);
  return played.map((p: any) => p.playerId).filter(Boolean);
}

function getClubFormation(match: SeasonRecordMatch): string {
  const isHome = match.isHome === true;
  let formation = isHome ? match.homeFormation : match.awayFormation;
  if (!formation && (match as any).formation) formation = (match as any).formation;
  return typeof formation === "string" ? formation.trim() : "";
}

function didPlay(p: any): boolean {
  const minutes = Number(p?.minutesPlayed) || 0;
  if (minutes > 0) return true;
  if (p?.role === "starter") return true;
  if (typeof p?.role !== "string") return true;
  return false;
}

function isCupCompetition(matches: SeasonRecordMatch[], competitionName: string): boolean {
  const lower = competitionName.toLowerCase();
  if (lower.includes("cup") || lower.includes("カップ") || lower.includes("杯")) return true;
  return matches.some((m) => typeof m.roundName === "string" && m.roundName.trim().length > 0);
}

function formatRoundResult(roundName?: string, isChampion = false, matchResult?: string): string {
  if (isChampion) return "CHAMPIONS";
  const r = String(roundName || "").trim();
  if (!r) return "-";
  const upper = r.toUpperCase();
  const lower = r.toLowerCase();

  if (upper.includes("FINAL") || lower.includes("決勝")) {
    if (matchResult === "win") return "CHAMPIONS";
    return "RUNNERS-UP";
  }
  if (upper.includes("SEMI") || lower.includes("準決勝") || lower.includes("ベスト4")) return "BEST 4";
  if (upper.includes("QUARTER") || lower.includes("準々決勝") || lower.includes("ベスト8")) return "BEST 8";
  if (upper.includes("ROUND OF 16") || lower.includes("16強") || lower.includes("ベスト16")) return "BEST 16";
  if (upper.includes("ROUND OF 32") || lower.includes("32強") || lower.includes("ベスト32")) return "BEST 32";
  if (upper.includes("ROUND OF 64") || lower.includes("64強")) return "BEST 64";
  if (lower.includes("round") || lower.includes("ラウンド")) {
    const match = r.match(/\d+/);
    if (match) return `ROUND ${match[0]}`;
  }
  if (lower.includes("group") || lower.includes("グループ")) return "GROUP STAGE";
  return r;
}

function buildCompetitionResult(
  competitionMatches: SeasonRecordMatch[],
  competitionName: string,
  clubTitles: ClubTitleItem[],
  season: string,
  competitionRankMap?: Map<string, number>
): CompetitionResult {
  const wins = competitionMatches.filter((m) => m.result === "win").length;
  const draws = competitionMatches.filter((m) => m.result === "draw").length;
  const losses = competitionMatches.filter((m) => m.result === "loss").length;

  const normalizedName = normalizeCompetitionName(competitionName);
  const championSeason = clubTitles.find((t) => {
    if (!t.competitionName) return false;
    const nameMatch = normalizeCompetitionName(t.competitionName) === normalizedName;
    const seasons = Array.isArray(t.seasons) ? t.seasons : [];
    return nameMatch && seasons.some((s) => seasonEquals(s, season));
  });

  const isChampion = Boolean(championSeason);

  const competitionId = competitionMatches[0]?.competitionId || "";
  let rank: number | undefined;
  if (isChampion) {
    rank = 1;
  } else if (competitionRankMap) {
    rank = competitionRankMap.get(String(competitionId)) ?? competitionRankMap.get(normalizedName) ?? undefined;
  }

  const sortedByDate = [...competitionMatches].sort((a, b) => {
    const da = String(a.matchDate || "");
    const db = String(b.matchDate || "");
    if (da && db) return db.localeCompare(da);
    return 0;
  });

  const latestMatch = sortedByDate[0];
  const cup = isCupCompetition(competitionMatches, competitionName);

  if (cup) {
    return {
      competitionId,
      competitionName,
      result: formatRoundResult(latestMatch?.roundName, isChampion, latestMatch?.result),
      isChampion,
      record: `${wins}勝 / ${draws}分 / ${losses}敗`,
      rank,
    };
  }

  return {
    competitionId,
    competitionName,
    result: isChampion ? "CHAMPIONS" : "LEAGUE",
    isChampion,
    record: `${wins}勝 / ${draws}分 / ${losses}敗`,
    rank,
  };
}

export function computeSeasonSummary(
  matches: SeasonRecordMatch[],
  competitions: any[] | undefined,
  clubTitles: ClubTitleItem[],
  allPlayersMap: Map<string, PlayerRef>,
  mainTeamId: string | null,
  season: string
): SeasonSummary {
  const seasonMatches = matches.filter((m) => seasonEquals(String(m.competitionSeason ?? m.season ?? ""), season));

  const completedMatches = seasonMatches.filter((m) => m.isCompleted);

  let wins = 0;
  let draws = 0;
  let losses = 0;
  let goalsFor = 0;
  let goalsAgainst = 0;

  for (const m of completedMatches) {
    if (m.result === "win") wins++;
    else if (m.result === "draw") draws++;
    else if (m.result === "loss") losses++;
    goalsFor += typeof m.goalsFor === "number" ? m.goalsFor : 0;
    goalsAgainst += typeof m.goalsAgainst === "number" ? m.goalsAgainst : 0;
  }

  const titleCount = clubTitles.filter((t) => {
    const seasons = Array.isArray(t.seasons) ? t.seasons : [];
    return seasons.some((s) => seasonEquals(s, season));
  }).length;

  const competitionRankMap = new Map<string, number>();
  if (Array.isArray(competitions) && mainTeamId) {
    for (const c of competitions) {
      const anyC = c as any;
      const teams = anyC?.teams;
      if (Array.isArray(teams)) {
        const idx = teams.indexOf(mainTeamId);
        if (idx >= 0) {
          const rank = idx + 1;
          const id = anyC?.id || "";
          const name = anyC?.name || "";
          if (id) competitionRankMap.set(String(id), rank);
          if (name) competitionRankMap.set(normalizeCompetitionName(String(name)), rank);
        }
      }
    }
  }

  const competitionMap = new Map<string, SeasonRecordMatch[]>();
  for (const m of seasonMatches) {
    const id = String(m.competitionId || m.competitionName || "unknown");
    const list = competitionMap.get(id) || [];
    list.push(m);
    competitionMap.set(id, list);
  }

  const competitionResults: CompetitionResult[] = [];
  for (const [id, list] of competitionMap.entries()) {
    const name = list[0]?.competitionName || id;
    competitionResults.push(buildCompetitionResult(list, name, clubTitles, season, competitionRankMap));
  }

  competitionResults.sort((a, b) => {
    if (a.isChampion && !b.isChampion) return -1;
    if (!a.isChampion && b.isChampion) return 1;
    return a.competitionName.localeCompare(b.competitionName, "ja");
  });

  const totalMatches = wins + draws + losses;
  const winRate = totalMatches > 0 ? wins / totalMatches : 0;
  let mood: SeasonMood = "normal";
  if (titleCount > 0) {
    mood = "title";
  } else if (winRate >= 0.55 && (goalsFor - goalsAgainst) >= 0) {
    mood = "good";
  } else if (winRate < 0.35 || (goalsFor - goalsAgainst) < -15 || losses > wins + draws) {
    mood = "poor";
  }

  return {
    season,
    matches: totalMatches,
    wins,
    draws,
    losses,
    goalsFor,
    goalsAgainst,
    goalDifference: goalsFor - goalsAgainst,
    titleCount,
    competitionResults,
    mood,
    imageUrl: getSeasonMoodImage(season, mood),
  };
}

export function computeSeasonLeaders(
  matches: SeasonRecordMatch[],
  allPlayersMap: Map<string, PlayerRef>,
  mainTeamId: string | null,
  season: string
): { matches: LeaderEntry | null; goals: LeaderEntry | null; assists: LeaderEntry | null; cleanSheets: LeaderEntry | null } {
  const seasonMatches = matches.filter((m) => seasonEquals(getMatchSeason(m), season));
  const stats = new Map<string, { player: PlayerRef; matches: number; goals: number; assists: number; cleanSheets: number }>();

  for (const m of seasonMatches) {
    const players = getMatchPlayerStats(m, mainTeamId, allPlayersMap);
    for (const p of players) {
      const id = typeof p?.playerId === "string" ? p.playerId : "";
      if (!id) continue;
      if (!didPlay(p)) continue;

      const ref = allPlayersMap.get(id) || {
        playerId: id,
        playerName: typeof p?.playerName === "string" ? p.playerName : "Unknown",
        position: typeof p?.position === "string" ? p.position : undefined,
        photoUrl: undefined,
      };

      const cur = stats.get(id) || { player: ref, matches: 0, goals: 0, assists: 0, cleanSheets: 0 };
      cur.matches += 1;
      cur.goals += Number(p?.goals) || 0;
      cur.assists += Number(p?.assists) || 0;

      const pos = ref.position || p?.position || "";
      if (isGoalkeeper(pos) && m.isCompleted && typeof m.goalsAgainst === "number" && m.goalsAgainst === 0) {
        cur.cleanSheets += 1;
      }

      stats.set(id, cur);
    }
  }

  const entries = Array.from(stats.values());

  function top(selector: (e: typeof entries[0]) => number): LeaderEntry | null {
    const sorted = [...entries]
      .filter((e) => selector(e) > 0)
      .sort((a, b) => {
        const diff = selector(b) - selector(a);
        if (diff !== 0) return diff;
        return a.player.playerName.localeCompare(b.player.playerName, "ja");
      });
    if (sorted.length === 0) return null;
    return { player: sorted[0].player, value: selector(sorted[0]) };
  }

  return {
    matches: top((e) => e.matches),
    goals: top((e) => e.goals),
    assists: top((e) => e.assists),
    cleanSheets: top((e) => e.cleanSheets),
  };
}

export function computeMostUsedXI(
  matches: SeasonRecordMatch[],
  allPlayersMap: Map<string, PlayerRef>,
  mainTeamId: string | null,
  season: string
): MostUsedXI | null {
  const seasonMatches = matches.filter((m) => seasonEquals(getMatchSeason(m), season));
  const lineupMap = new Map<string, { count: number; formationMap: Map<string, number>; playerIds: string[] }>();

  for (const m of seasonMatches) {
    const starters = getClubStarters(m, mainTeamId, allPlayersMap);
    if (starters.length === 0) continue;
    const sortedIds = [...starters].sort();
    const key = sortedIds.join(",");

    const entry = lineupMap.get(key) || { count: 0, formationMap: new Map<string, number>(), playerIds: sortedIds };
    entry.count += 1;

    const formation = getClubFormation(m) || "不明";
    entry.formationMap.set(formation, (entry.formationMap.get(formation) || 0) + 1);
    lineupMap.set(key, entry);
  }

  const entries = Array.from(lineupMap.values()).sort((a, b) => b.count - a.count);
  if (entries.length === 0) return null;

  const maxCount = entries[0].count;
  const topEntries = entries.filter((e) => e.count === maxCount);
  const top = topEntries[0];

  let formation = "";
  const formationEntries = Array.from(top.formationMap.entries()).sort((a, b) => b[1] - a[1]);
  if (formationEntries.length > 0) formation = formationEntries[0][0];

  if (!formation && topEntries.length > 1) {
    // if tied, use most common formation across all tied sets
    const combined = new Map<string, number>();
    for (const e of topEntries) {
      for (const [f, c] of e.formationMap.entries()) {
        combined.set(f, (combined.get(f) || 0) + c);
      }
    }
    const combinedSorted = Array.from(combined.entries()).sort((a, b) => b[1] - a[1]);
    if (combinedSorted.length > 0) formation = combinedSorted[0][0];
  }

  const players = top.playerIds
    .map((id) => allPlayersMap.get(id))
    .filter((p): p is PlayerRef => Boolean(p));

  return {
    playerIds: top.playerIds,
    players,
    count: top.count,
    formation: formation || "不明",
    isTie: topEntries.length > 1,
  };
}

export function computeMostUsedFormation(
  matches: SeasonRecordMatch[],
  mainTeamId: string | null,
  season: string
): MostUsedFormation | null {
  const seasonMatches = matches.filter((m) => seasonEquals(getMatchSeason(m), season));
  const map = new Map<string, number>();
  let counted = 0;

  for (const m of seasonMatches) {
    const formation = getClubFormation(m);
    if (!formation) continue;
    counted += 1;
    map.set(formation, (map.get(formation) || 0) + 1);
  }

  if (map.size === 0) return null;

  const entries = Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  const total = seasonMatches.length;
  const [formation, count] = entries[0];

  return {
    formation,
    count,
    total,
    usage: total > 0 ? Math.round((count / total) * 1000) / 10 : 0,
  };
}

export function computeSeasonSquad(
  matches: SeasonRecordMatch[],
  allPlayersMap: Map<string, PlayerRef>,
  mainTeamId: string | null,
  season: string
): Record<string, SquadPlayer[]> {
  const seasonMatches = matches.filter((m) => seasonEquals(getMatchSeason(m), season));
  const stats = new Map<string, SquadPlayer>();

  for (const m of seasonMatches) {
    const players = getMatchPlayerStats(m, mainTeamId, allPlayersMap);
    for (const p of players) {
      const id = typeof p?.playerId === "string" ? p.playerId : "";
      if (!id) continue;
      if (!didPlay(p)) continue;

      const ref = allPlayersMap.get(id);
      const pos = ref?.position || p?.position || "";
      const cat = positionCategory(pos);

      const cur = stats.get(id) || {
        playerId: id,
        playerName: typeof p?.playerName === "string" ? p.playerName : ref?.playerName || "Unknown",
        position: pos || ref?.position,
        photoUrl: ref?.photoUrl,
        number: ref?.number,
        nationality: ref?.nationality,
        matches: 0,
        goals: 0,
        assists: 0,
      };
      cur.matches += 1;
      cur.goals += Number(p?.goals) || 0;
      cur.assists += Number(p?.assists) || 0;
      stats.set(id, cur);
    }
  }

  const grouped: Record<string, SquadPlayer[]> = {};
  for (const p of stats.values()) {
    const cat = positionCategory(p.position);
    grouped[cat] = grouped[cat] || [];
    grouped[cat].push(p);
  }

  for (const cat of Object.keys(grouped)) {
    grouped[cat].sort((a, b) => {
      if (b.matches !== a.matches) return b.matches - a.matches;
      return a.playerName.localeCompare(b.playerName, "ja");
    });
  }

  const ordered: Record<string, SquadPlayer[]> = {};
  const cats = ["GK", "DF", "MF", "FW", "-"];
  for (const cat of cats) {
    if (grouped[cat]?.length) ordered[cat] = grouped[cat];
  }

  return ordered;
}

export function computeSeasonTitles(clubTitles: ClubTitleItem[], season: string): SeasonTitle[] {
  const result: SeasonTitle[] = [];
  for (const t of clubTitles) {
    const name = typeof t?.competitionName === "string" ? t.competitionName : "";
    const seasons = Array.isArray(t?.seasons) ? t.seasons : [];
    if (name && seasons.some((s) => seasonEquals(s, season))) {
      result.push({ competitionName: name, season: toSlashSeason(season) });
    }
  }
  return result;
}

export function computeSeasonDetail(
  matches: SeasonRecordMatch[],
  competitions: any[] | undefined,
  clubTitles: ClubTitleItem[],
  allPlayersMap: Map<string, PlayerRef>,
  mainTeamId: string | null,
  season: string
): SeasonDetail {
  const summary = computeSeasonSummary(matches, competitions, clubTitles, allPlayersMap, mainTeamId, season);
  const leaders = computeSeasonLeaders(matches, allPlayersMap, mainTeamId, season);
  const mostUsedXI = computeMostUsedXI(matches, allPlayersMap, mainTeamId, season);
  const mostUsedFormation = computeMostUsedFormation(matches, mainTeamId, season);
  const squad = computeSeasonSquad(matches, allPlayersMap, mainTeamId, season);
  const titles = computeSeasonTitles(clubTitles, season);

  return {
    ...summary,
    leaders,
    mostUsedXI,
    mostUsedFormation,
    squad,
    titles,
  };
}

export function buildAllPlayersMap(
  allPlayers: { playerId: string; playerName: string; position?: string; photoUrl?: string; number?: number; nationality?: string }[]
): Map<string, PlayerRef> {
  const map = new Map<string, PlayerRef>();
  for (const p of allPlayers) {
    if (typeof p?.playerId !== "string") continue;
    map.set(p.playerId, {
      playerId: p.playerId,
      playerName: p.playerName || "Unknown",
      position: p.position,
      photoUrl: p.photoUrl,
      number: p.number,
      nationality: p.nationality,
    });
  }
  return map;
}
