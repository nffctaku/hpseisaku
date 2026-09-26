import { db } from "@/lib/firebase/admin";
import { expandSeasonVariants } from "../[playerId]/design-test/lib/season";
import { deriveEventPlayerCounts, buildNameToIdFromStats } from "@/lib/match-event-stats";

export interface MatchRecord {
  season: string;
  competitionName: string;
  roundName: string;
  matchDate: string;
  matchTime?: string;
  opponentName: string;
  opponentTeamId?: string;
  opponentTeamLogo?: string;
  ha: "(H)" | "(A)" | "(-)";
  scoreHome: number | null;
  scoreAway: number | null;
  result: "W" | "D" | "L" | "-";
  minutesPlayed: number | null;
  goals: number | null;
  assists: number | null;
}

export interface PlayerStatsWithRecords {
  stats: { appearances: number; goals: number; assists: number };
  matches: MatchRecord[];
}

export async function getMatchStatsForPlayers(
  ownerUid: string,
  playerIds: string[],
  allSeasons: string[],
  activeSeason?: string,
  players?: any[]
): Promise<Map<string, PlayerStatsWithRecords>> {
  const stats = new Map<string, PlayerStatsWithRecords>();
  const idSet = new Set(playerIds);
  const allVariants = new Set(allSeasons.flatMap((s) => expandSeasonVariants(s)));
  const activeVariants = activeSeason
    ? new Set(expandSeasonVariants(activeSeason))
    : null;

  for (const pid of playerIds) {
    stats.set(pid, {
      stats: { appearances: 0, goals: 0, assists: 0 },
      matches: [],
    });
  }

  const teamsSnap = await db.collection(`clubs/${ownerUid}/teams`).get();
  const teamNameMap = new Map<string, string>();
  const teamLogoMap = new Map<string, string>();
  for (const doc of teamsSnap.docs) {
    const d = doc.data() as any;
    teamNameMap.set(doc.id, typeof d?.name === "string" ? d.name : doc.id);
    teamLogoMap.set(doc.id, typeof d?.logoUrl === "string" ? d.logoUrl : "");
  }

  const compsSnap = await db.collection(`clubs/${ownerUid}/competitions`).get();

  for (const compDoc of compsSnap.docs) {
    const compData = compDoc.data() as any;
    const compSeasonRaw =
      typeof compData?.season === "string" ? String(compData.season).trim() : "";
    if (!compSeasonRaw || !allVariants.has(compSeasonRaw)) continue;

    const compName =
      typeof compData?.name === "string" && compData.name.trim().length > 0
        ? compData.name
        : compDoc.id;

    const roundsSnap = await compDoc.ref.collection("rounds").get();
    for (const roundDoc of roundsSnap.docs) {
      const roundData = roundDoc.data() as any;
      const roundName =
        typeof roundData?.name === "string" && roundData.name.trim().length > 0
          ? roundData.name
          : roundDoc.id;

      const matchesSnap = await roundDoc.ref.collection("matches").get();
      for (const matchDoc of matchesSnap.docs) {
        const m = matchDoc.data() as any;
        const ps = Array.isArray(m?.playerStats) ? (m.playerStats as any[]) : [];

        const matchDate = typeof m?.matchDate === "string" ? m.matchDate : "";
        const matchTime = typeof m?.matchTime === "string" ? m.matchTime : undefined;
        const homeTeamId = typeof m?.homeTeam === "string" ? m.homeTeam : "";
        const awayTeamId = typeof m?.awayTeam === "string" ? m.awayTeam : "";
        const homeTeamName =
          (typeof m?.homeTeamName === "string" && m.homeTeamName) ||
          teamNameMap.get(homeTeamId) ||
          "-";
        const awayTeamName =
          (typeof m?.awayTeamName === "string" && m.awayTeamName) ||
          teamNameMap.get(awayTeamId) ||
          "-";
        const scoreHome = typeof m?.scoreHome === "number" ? m.scoreHome : null;
        const scoreAway = typeof m?.scoreAway === "number" ? m.scoreAway : null;

        const byPlayer = new Map<string, any>();
        for (const s of ps) {
          const pid = typeof s?.playerId === "string" ? s.playerId : "";
          if (!pid || !idSet.has(pid)) continue;
          byPlayer.set(pid, s);
        }

        // heal-on-read: playerStats 行の導出値が古い／イベント対象選手の行がない
        // 既存データを救済するため、events から導出値を計算する。
        // 格納値は一切書き換えず、表示集計では max(stored, derived) を使う
        // （手入力値を減らさない）。
        const evs = Array.isArray(m?.events) ? (m.events as any[]) : [];
        const matchDuration = typeof m?.matchDuration === "number" ? m.matchDuration : 90;
        const evDerived =
          evs.length > 0
            ? deriveEventPlayerCounts(evs, buildNameToIdFromStats(ps), matchDuration)
            : null;

        // playerStats 行を持たないがイベントに登場する対象選手（行なし選手）
        if (evDerived) {
          for (const pid of evDerived.involved) {
            if (pid.startsWith("custom_") || !idSet.has(pid) || byPlayer.has(pid)) continue;
            byPlayer.set(pid, {
              playerId: pid,
              teamId: evDerived.teamIdByPlayer.get(pid) || "",
              minutesPlayed: evDerived.subMinutes.get(pid) ?? 0,
              goals: evDerived.goals.get(pid) ?? 0,
              assists: evDerived.assists.get(pid) ?? 0,
              yellowCards: evDerived.yellowCards.get(pid) ?? 0,
              redCards: evDerived.redCards.get(pid) ?? 0,
              __healedFromEvents: true,
            });
          }
        }

        const isActiveSeason =
          activeVariants && activeVariants.has(compSeasonRaw);

        for (const [pid, s] of byPlayer.entries()) {
          const playerTeamId = typeof s?.teamId === "string" ? s.teamId : "";
          const isHome = Boolean(playerTeamId)
            ? playerTeamId === homeTeamId
            : true;
          const isAway = Boolean(playerTeamId)
            ? playerTeamId === awayTeamId
            : false;
          const ha: "(H)" | "(A)" | "(-)" = isHome
            ? "(H)"
            : isAway
            ? "(A)"
            : "(-)";
          const opponentName = isHome
            ? awayTeamName
            : isAway
            ? homeTeamName
            : "-";
          const opponentTeamId = isHome
            ? awayTeamId
            : isAway
            ? homeTeamId
            : "";
          const opponentTeamLogo = isHome
            ? teamLogoMap.get(awayTeamId) || ""
            : isAway
            ? teamLogoMap.get(homeTeamId) || ""
            : "";

          const myScore = isHome ? scoreHome : isAway ? scoreAway : scoreHome;
          const oppScore = isHome ? scoreAway : isAway ? scoreHome : scoreAway;
          let result: "W" | "D" | "L" | "-" = "-";
          if (typeof myScore === "number" && typeof oppScore === "number") {
            if (myScore > oppScore) result = "W";
            else if (myScore === oppScore) result = "D";
            else result = "L";
          }

          const minutesPlayed = Number(s?.minutesPlayed);
          const minutes = Number.isFinite(minutesPlayed) ? minutesPlayed : null;
          const goals = Number(s?.goals);
          const goalsVal = Number.isFinite(goals) ? goals : null;
          const assists = Number(s?.assists);
          const assistsVal = Number.isFinite(assists) ? assists : null;

          // heal-on-read: イベント導出値と格納値の大きい方を採用
          // （手入力の上乗せ値を消さず、欠落したイベント分を補完する）
          const effGoals = Math.max(goalsVal ?? 0, evDerived?.goals.get(pid) ?? 0);
          const effAssists = Math.max(assistsVal ?? 0, evDerived?.assists.get(pid) ?? 0);
          // minutes>0 またはイベント登場（得点/交代等）を出場とみなす
          const played = (minutes ?? 0) > 0 || (evDerived?.involved.has(pid) ?? false);

          const entry = stats.get(pid);
          if (!entry) continue;

          if (isActiveSeason) {
            if (played) entry.stats.appearances += 1;
            entry.stats.goals += effGoals;
            entry.stats.assists += effAssists;
          }

          entry.matches.push({
            season: compSeasonRaw,
            competitionName: compName,
            roundName,
            matchDate,
            matchTime,
            opponentName,
            opponentTeamId,
            opponentTeamLogo,
            ha,
            scoreHome,
            scoreAway,
            result,
            minutesPlayed: minutes,
            goals: effGoals,
            assists: effAssists,
          });
        }
      }
    }
  }

  if (activeVariants && Array.isArray(players)) {
    for (const p of players) {
      const pid = typeof p?.id === "string" ? p.id : "";
      const entry = stats.get(pid);
      if (!entry) continue;

      const seasonData =
        p?.seasonData && typeof p.seasonData === "object" ? (p.seasonData as any) : {};
      let manualRows: any[] = [];
      for (const variant of activeVariants) {
        const sd = seasonData?.[variant];
        if (sd?.manualCompetitionStats && Array.isArray(sd.manualCompetitionStats)) {
          manualRows = sd.manualCompetitionStats;
          break;
        }
      }
      if (manualRows.length === 0 && Array.isArray(p?.manualCompetitionStats)) {
        manualRows = (p.manualCompetitionStats as any[]).filter((r: any) =>
          activeVariants.has(r?.season)
        );
      }

      for (const r of manualRows) {
        const m =
          typeof r?.matches === "number" && Number.isFinite(r.matches) ? r.matches : 0;
        const g =
          typeof r?.goals === "number" && Number.isFinite(r.goals) ? r.goals : 0;
        const a =
          typeof r?.assists === "number" && Number.isFinite(r.assists) ? r.assists : 0;
        entry.stats.appearances += m;
        entry.stats.goals += g;
        entry.stats.assists += a;
      }
    }
  }

  for (const v of stats.values()) {
    v.matches.sort((a, b) => {
      const aMs = Date.parse(a.matchDate) || 0;
      const bMs = Date.parse(b.matchDate) || 0;
      return bMs - aMs;
    });
  }

  return stats;
}
