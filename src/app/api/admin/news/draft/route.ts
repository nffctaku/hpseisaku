import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { getMatchDataForClub } from "@/lib/matches";
import { getMatchForAdmin } from "@/lib/match-admin";
import { getMatchContextForAi, MatchContext, StreakContext } from "@/lib/match-context";
import { getGoalEvents, isOwnGoalEvent, isPenaltyEvent } from "@/lib/match-scorers";
import { getActiveClubUid } from "@/lib/career-server";
import { MatchDetails, TeamStat } from "@/types/match";

function normalizeMatchDate(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString().split("T")[0];
  if (typeof value === "object" && value !== null && "toDate" in value) {
    try {
      const dt = (value as { toDate: () => Date }).toDate();
      if (dt instanceof Date) return dt.toISOString().split("T")[0];
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOpenAiResponse(value: unknown): value is { choices: { message?: { content?: string } }[] } {
  if (!isRecord(value) || !Array.isArray(value.choices) || value.choices.length === 0) return false;
  return value.choices.every((c: unknown) => {
    if (!isRecord(c)) return false;
    if (c.message === undefined) return true;
    if (!isRecord(c.message)) return false;
    const content = c.message.content;
    return typeof content === "string" || typeof content === "undefined";
  });
}

function isDraftResponse(value: unknown): value is { title: string; body: string; description?: string } {
  return isRecord(value) && typeof value.title === "string" && typeof value.body === "string";
}

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

async function getUidFromRequest(request: Request): Promise<string | null> {
  const authHeader = request.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const idToken = authHeader.substring(7);
    try {
      const decodedToken = await getAuth().verifyIdToken(idToken);
      return decodedToken.uid;
    } catch {
      return null;
    }
  }
  return null;
}

function formatScore(match: MatchDetails): string {
  const home = match.scoreHome ?? null;
  const away = match.scoreAway ?? null;
  if (home === null || away === null) return "-";
  const base = `${home} - ${away}`;
  if (match.pkScoreHome != null && match.pkScoreAway != null) {
    return `${base} （PK: ${match.pkScoreHome} - ${match.pkScoreAway}）`;
  }
  return base;
}

function formatDate(matchDate: string): string {
  if (!matchDate) return "";
  const normalized = matchDate.replace(/\//g, "-").split("T")[0];
  return normalized;
}

function formatTeamStats(match: MatchDetails, selfIsHome?: boolean, selfLabel?: string, opponentLabel?: string): string {
  const stats = match.teamStats || [];
  if (stats.length === 0) return "チームスタッツは登録されていません。";
  return stats
    .map((s) => {
      let leftLabel = match.homeTeamName;
      let rightLabel = match.awayTeamName;
      if (selfIsHome !== undefined) {
        leftLabel = selfIsHome ? selfLabel || "自クラブ" : opponentLabel || "対戦相手";
        rightLabel = selfIsHome ? opponentLabel || "対戦相手" : selfLabel || "自クラブ";
      }
      return `${s.name}: ${leftLabel} ${s.homeValue} / ${rightLabel} ${s.awayValue}`;
    })
    .join("\n");
}

function resultLabel(result: "win" | "loss" | "draw"): string {
  if (result === "win") return "勝利";
  if (result === "loss") return "敗北";
  return "引き分け";
}

function streakText(streak: { wins: number; losses: number; unbeaten: number }): string {
  const parts: string[] = [];
  if (streak.wins > 0) parts.push(`連勝${streak.wins}`);
  if (streak.losses > 0) parts.push(`連敗${streak.losses}`);
  if (streak.unbeaten > 0 && streak.wins === 0) parts.push(`無敗${streak.unbeaten}`);
  if (streak.unbeaten > streak.wins && streak.wins > 0) parts.push(`無敗${streak.unbeaten}`);
  return parts.length > 0 ? parts.join(" / ") : "なし";
}

function streakMeaning(context: MatchContext): string {
  const ctx = context.sameCompetitionStreak || context.officialStreak;
  if (!ctx) return "特になし";
  const before = ctx.before;
  const after = ctx.after;
  const parts: string[] = [];
  if (before.losses > 0 && after.losses === 0) parts.push(`${before.losses}連敗を止めた`);
  if (before.wins > 0 && after.wins === 0) parts.push(`${before.wins}連勝を止めた`);
  if (before.unbeaten > 0 && after.unbeaten === 0) parts.push(`${before.unbeaten}試合無敗を終わらせた`);
  if (before.losses > 0 && after.losses > before.losses) parts.push(`連敗を${after.losses}に伸ばした`);
  if (before.wins > 0 && after.wins > before.wins) parts.push(`連勝を${after.wins}に伸ばした`);
  if (before.unbeaten > 0 && after.unbeaten > before.unbeaten) parts.push(`無敗を${after.unbeaten}試合に伸ばした`);
  return parts.join("、") || "特になし";
}

function formatContext(context: MatchContext): string {
  const sections: string[] = [];

  const sameCompBefore = context.sameCompetitionStreak?.before;
  const sameCompAfter = context.sameCompetitionStreak?.after;

  sections.push(
    `【自クラブ基準の試合情報】\n` +
      `- 記事掲載クラブ: ${context.clubName || context.selfTeamName || "不明"}\n` +
      `- 自クラブチームID: ${context.selfTeamId}\n` +
      `- 対戦相手: ${context.opponentTeamName}\n` +
      `- 会場: ${context.selfIsHome ? "ホーム" : "アウェイ"}\n` +
      `- 自クラブ得点: ${context.selfScore}\n` +
      `- 相手得点: ${context.opponentScore}\n` +
      `- 自クラブ結果: ${resultLabel(context.selfResult)}\n` +
      (sameCompBefore
        ? `- 試合前の連勝: ${sameCompBefore.wins} / 連敗: ${sameCompBefore.losses} / 無敗: ${sameCompBefore.unbeaten}\n` +
          `- 今回を含む連勝: ${sameCompAfter?.wins ?? 0} / 連敗: ${sameCompAfter?.losses ?? 0} / 無敗: ${sameCompAfter?.unbeaten ?? 0}\n`
        : "") +
      `- 今回の意味: ${streakMeaning(context)}`
  );

  if (context.recent5SameCompetition.length > 0) {
    const lines = ["【自クラブの直近5試合（同一シーズン・同一大会）】"];
    for (const r of context.recent5SameCompetition) {
      const date = r.match.matchDate ? r.match.matchDate.replace(/-/g, "/") : "";
      const homeAway = r.isHome ? "ホーム" : "アウェイ";
      lines.push(`- ${date} ${homeAway} ${r.score} vs ${r.opponentName}（${resultLabel(r.result)}）`);
    }
    sections.push(lines.join("\n"));
  }

  if (context.officialStreak) {
    const { before, after } = context.officialStreak;
    sections.push(
      `【連勝/連敗/無敗（${before.scope}）】\n- 試合前: ${streakText(before)}\n- 今回を含む: ${streakText(after)}`
    );
  }

  if (context.table) {
    const t = context.table;
    const rowText = t.topRows
      .map((r) => `${r.rank}位 ${r.teamName} ${r.points}Pt（${r.played}試合） GD${r.goalDiff}`)
      .join("\n");
    const topTwoText = t.isTopTwoDirect
      ? `試合前時点で1位と2位の直接対決です。勝ち点差は${t.pointsGap}ptです。「天王山」という表現は使わず、「首位攻防戦」「勝ち点${t.pointsGap}差の直接対決」など具体的に表現してください。`
      : "上位対決を「天王山」と表現しないでください。";
    sections.push(
      `【試合前時点の暫定順位（${t.competitionName}${t.season ? ` ${t.season}` : ""}）】\n${rowText}\n\n自クラブ: ${t.ownRank}位 ${t.ownPoints}Pt（${t.ownPlayed}試合消化）\n対戦相手: ${t.opponentRank ? `${t.opponentRank}位` : "不明"}\n${topTwoText}\n${t.note}`
    );
  }

  if (context.headToHead.length > 0) {
    const lines = ["【今回までの直接対決（同一シーズン・同一大会）】"];
    for (const h of context.headToHead) {
      const date = h.match.matchDate ? h.match.matchDate.replace(/-/g, "/") : "";
      lines.push(`- ${date} ${h.score}（${resultLabel(h.result)}）`);
    }
    sections.push(lines.join("\n"));
  }

  return sections.join("\n\n");
}

function shortName(name: string): string {
  if (!name) return "";
  const parts = name.trim().split(/\s+/);
  if (parts.length <= 1) return name;
  return parts[parts.length - 1] ?? name;
}

function parseStatValue(value: string | number | null | undefined): number | string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "number") return value;
  const cleaned = String(value).replace(/,/g, "").replace(/\s/g, "").replace(/％/g, "%").replace("%", "");
  const num = Number(cleaned);
  return Number.isNaN(num) ? String(value) : num;
}

function buildStats(match: MatchDetails, selfIsHome: boolean): Record<string, number | string> {
  const stats = match.teamStats || [];
  const out: Record<string, number | string> = {};

  const nameMap: Record<string, string> = {
    "ボール支配率": "possession",
    "possession": "possession",
    "支配率": "possession",
    "シュート": "shots",
    "shots": "shots",
    "シュート(枠内)": "shotsOnTarget",
    "シュート（枠内）": "shotsOnTarget",
    "枠内シュート": "shotsOnTarget",
    "ショットオンターゲット": "shotsOnTarget",
    "shots on target": "shotsOnTarget",
    "コーナーキック": "corners",
    "corners": "corners",
    "フリーキック": "freeKicks",
    "free kicks": "freeKicks",
    "オフサイド": "offsides",
    "offsides": "offsides",
    "パス": "passes",
    "passes": "passes",
    "イエローカード": "yellowCards",
    "yellow cards": "yellowCards",
    "レッドカード": "redCards",
    "red cards": "redCards",
    "ファウル": "fouls",
    "fouls": "fouls",
  };

  for (const stat of stats) {
    const key = nameMap[stat.name.toLowerCase().replace(/\s+/g, "")] || stat.name;
    const raw = selfIsHome ? stat.homeValue : stat.awayValue;
    const value = parseStatValue(raw);
    if (value !== undefined) {
      out[key] = value;
    }
  }

  return out;
}

function streakJson(streakCtx: StreakContext | null, afterResult: "win" | "loss" | "draw") {
  if (!streakCtx) {
    return { type: "none", count: 0, scope: "none" };
  }
  const before = streakCtx.before;
  let type: "win" | "loss" | "none" = "none";
  let count = 0;
  if (before.wins > 0) {
    type = "win";
    count = before.wins;
  } else if (before.losses > 0) {
    type = "loss";
    count = before.losses;
  }
  return { type, count, scope: before.scope };
}

function streakAfterJson(streakCtx: StreakContext | null) {
  if (!streakCtx) {
    return { type: "none", count: 0, scope: "none" };
  }
  const after = streakCtx.after;
  let type: "win" | "loss" | "none" = "none";
  let count = 0;
  if (after.wins > 0) {
    type = "win";
    count = after.wins;
  } else if (after.losses > 0) {
    type = "loss";
    count = after.losses;
  }
  return { type, count, scope: after.scope };
}

function buildNarrativeFacts(match: MatchDetails, context: MatchContext) {
  const duration = match.matchDuration || 90;
  const selfId = context.selfTeamId;
  const streakCtx = context.sameCompetitionStreak || context.officialStreak;

  // 止めた連続記録（2連勝/2連敗以上のみ。「1連敗」は日本語として不自然でニュース価値もない）
  let streakStopped: string | null = null;
  if (streakCtx && streakCtx.before.losses >= 2 && streakCtx.after.losses === 0) {
    streakStopped = `${streakCtx.before.losses}連敗`;
  } else if (streakCtx && streakCtx.before.wins >= 2 && streakCtx.after.wins === 0) {
    streakStopped = `${streakCtx.before.wins}連勝`;
  }

  // 今回を含む同一大会の連続記録（連勝/連敗/無敗は2試合〜、未勝利は3試合〜のみ返す）
  const after = streakCtx?.after;
  let currentCompetitionStreak: string | null = null;
  if (after && after.wins >= 2) currentCompetitionStreak = `${after.wins}連勝`;
  else if (after && after.losses >= 2) currentCompetitionStreak = `${after.losses}連敗`;
  else if (after && after.winless >= 3) currentCompetitionStreak = `${after.winless}試合未勝利`;
  else if (after && after.unbeaten >= 2) currentCompetitionStreak = `${after.unbeaten}試合無敗`;

  // 得点経過から逆転・決勝点を算出
  const goalEvents = getGoalEvents(match.events)
    .slice()
    .sort((a, b) => (Number(a.minute) || 0) - (Number(b.minute) || 0));
  let selfGoals = 0;
  let oppGoals = 0;
  let trailed = false;
  let winningGoalMinute: number | null = null;
  for (const e of goalEvents) {
    const creditedToSelf = e.teamId === selfId ? !isOwnGoalEvent(e) : isOwnGoalEvent(e);
    if (creditedToSelf) selfGoals++;
    else oppGoals++;
    if (selfGoals < oppGoals) trailed = true;
    if (selfGoals > oppGoals) winningGoalMinute = Number(e.minute) || null;
  }
  const comebackWin = context.selfResult === "win" && trailed;
  const lateWinner =
    context.selfResult === "win" && winningGoalMinute != null && winningGoalMinute >= Math.max(80, duration - 10);

  // 何試合ぶりの勝利か（同一大会の過去試合を前回勝利まで遡る。match-context側で最大30試合）
  const firstWinInMatches =
    context.selfResult === "win" ? context.matchesSinceLastWinSameCompetition : null;

  // 最高評価選手・チームセーブ
  const rated = (match.playerStats || []).filter(
    (p) => p.teamId === selfId && typeof p.rating === "number" && p.playerName
  );
  const top = rated.sort((a, b) => b.rating - a.rating)[0];
  const topRatedPlayer = top ? { name: top.playerName, rating: top.rating } : null;

  // セーブはチーム単位のスタッツのため、GK個人の記録としては断定しない
  const savesStat = (match.teamStats || []).find(
    (s) => s.name === "セーブ" || s.name.toLowerCase() === "saves"
  );
  const savesRaw = savesStat ? (context.selfIsHome ? savesStat.homeValue : savesStat.awayValue) : undefined;
  const savesParsed = parseStatValue(savesRaw);
  const teamSaves = typeof savesParsed === "number" ? savesParsed : null;

  // ---- 記事候補イベント（keyEvents全量とは別に、ニュース価値のあるものだけ）----
  // 退場・PK失敗・投入選手が後の得点に絡んだ交代のみ。通常のイエロー・普通の交代は含めない
  const notableEvents: { type: string; minute: number | string; team: string; description: string }[] = [];
  for (const e of match.events || []) {
    const team = e.teamId === selfId ? context.selfTeamName : context.opponentTeamName;
    if (e.type === "card" && e.cardColor === "red") {
      notableEvents.push({ type: "red_card", minute: e.minute, team, description: `${e.playerName || team}が退場` });
    } else if (e.type === "pk_miss") {
      notableEvents.push({ type: "pk_miss", minute: e.minute, team, description: `${team}がPKを失敗` });
    } else if (e.type === "substitution" && e.inPlayerName) {
      const subMinute = Number(e.minute) || 0;
      const involved = goalEvents
        .filter((g) => (Number(g.minute) || 0) > subMinute)
        .some((g) => g.playerName === e.inPlayerName || g.assistPlayerName === e.inPlayerName);
      if (involved) {
        notableEvents.push({ type: "impact_sub", minute: e.minute, team, description: `${e.inPlayerName}が投入後に得点に絡んだ` });
      }
    }
  }

  // ---- 記事候補スタッツ（閾値を超えた特徴的なものだけ）----
  // 45〜55%のポゼッション・母数の少ない精度系・平凡な評価点は含めない
  const notableStats: string[] = [];
  const findStat = (names: string[]) =>
    (match.teamStats || []).find((s) => names.includes(s.name.toLowerCase().replace(/\s+/g, "")));
  const poss = findStat(["ボール支配率", "possession", "支配率"]);
  if (poss) {
    const selfP = Number(parseStatValue(context.selfIsHome ? poss.homeValue : poss.awayValue)) || 0;
    const oppP = Number(parseStatValue(context.selfIsHome ? poss.awayValue : poss.homeValue)) || 0;
    if (Math.abs(selfP - oppP) >= 15) {
      notableStats.push(`ボール支配率 自クラブ${selfP}% / 相手${oppP}%`);
    }
  }
  const shots = findStat(["シュート", "shots"]);
  if (shots) {
    const selfSh = Number(parseStatValue(context.selfIsHome ? shots.homeValue : shots.awayValue)) || 0;
    const oppSh = Number(parseStatValue(context.selfIsHome ? shots.awayValue : shots.homeValue)) || 0;
    if (Math.abs(selfSh - oppSh) >= 8) {
      notableStats.push(`シュート数 自クラブ${selfSh}本 / 相手${oppSh}本`);
    }
  }
  if (teamSaves != null && teamSaves >= 5) {
    notableStats.push(`チーム${teamSaves}セーブ`);
  }
  if (topRatedPlayer && topRatedPlayer.rating >= 8.5) {
    notableStats.push(`${topRatedPlayer.name}がチーム最高評価${topRatedPlayer.rating}`);
  }

  return {
    cleanSheet: context.opponentScore === 0,
    streakStopped,
    currentCompetitionStreak,
    lateWinner,
    comebackWin,
    firstWinInMatches,
    scorerAgainstFormerClub: null,
    topRatedPlayer,
    teamSaves,
    goalkeeperSaves: null,
    notableEvents,
    notableStats,
  };
}

function buildInputJson(match: MatchDetails, context: MatchContext, memo?: string): unknown {
  const streakCtx = context.sameCompetitionStreak || context.officialStreak;
  const streakBefore = streakJson(streakCtx, context.selfResult);
  const streakAfter = streakAfterJson(streakCtx);

  const endedLosingStreak =
    streakCtx && streakCtx.before.losses > 0 && streakCtx.after.losses === 0 ? streakCtx.before.losses : null;
  const endedWinningStreak =
    streakCtx && streakCtx.before.wins > 0 && streakCtx.after.wins === 0 ? streakCtx.before.wins : null;

  const goals = getGoalEvents(match.events).map((e) => ({
    team: e.teamId === context.selfTeamId ? context.selfTeamName : context.opponentTeamName,
    player: e.playerName || "不明",
    minute: e.minute,
    isOwnGoal: isOwnGoalEvent(e),
    isPenalty: isPenaltyEvent(e),
  }));

  // 交代・カード・PK失敗などの非ゴールイベント（記事の具体的な出来事として利用）
  const keyEvents = (match.events || [])
    .filter((e) => e.type === "substitution" || e.type === "card" || e.type === "pk_miss")
    .sort((a, b) => (Number(a.minute) || 0) - (Number(b.minute) || 0))
    .map((e) => ({
      type: e.type,
      minute: e.minute,
      team: e.teamId === context.selfTeamId ? context.selfTeamName : context.opponentTeamName,
      player: e.playerName || undefined,
      cardColor: e.cardColor || undefined,
      in: e.inPlayerName || undefined,
      out: e.outPlayerName || undefined,
    }));

  const stats = buildStats(match, context.selfIsHome);

  const recentMatches = context.recent5SameCompetition.map((r) => ({
    date: r.match.matchDate || "",
    opponent: r.opponentName,
    venue: r.isHome ? "home" : "away",
    score: r.score,
    result: r.result,
  }));

  return {
    selfTeam: context.selfTeamName,
    selfTeamShortName: shortName(context.clubName || context.selfTeamName),
    narrativeFacts: buildNarrativeFacts(match, context),
    opponentTeam: context.opponentTeamName,
    venue: context.selfIsHome ? "home" : "away",
    selfScore: context.selfScore,
    opponentScore: context.opponentScore,
    result: context.selfResult,
    competition: match.competitionName || "",
    round: match.roundName || "",
    matchDate: formatDate(match.matchDate),
    goals,
    keyEvents,
    streakBefore,
    streakAfter,
    context: {
      endedLosingStreak,
      endedWinningStreak,
      isTitleDecider: context.table?.isTopTwoDirect ? false : false,
      isTopOfTableClash: !!context.table?.isTopTwoDirect,
      isRelegationBattle: false,
    },
    stats: Object.keys(stats).length > 0 ? stats : null,
    recent5: recentMatches,
    userMemo: memo || "",
  };
}

// 本文末尾に固定フォーマットで付与する得点者一覧（AIには生成させない）
// 自クラブの得点のみ。0得点確定なら「なし」、得点したのに得点者未登録なら欄自体を出さない
function buildScorersBlock(match: MatchDetails, context: MatchContext): string {
  const selfId = context.selfTeamId;
  const selfGoalEvents = getGoalEvents(match.events)
    .filter((e) => (e.teamId === selfId ? !isOwnGoalEvent(e) : isOwnGoalEvent(e)))
    .sort((a, b) => (Number(a.minute) || 0) - (Number(b.minute) || 0));

  if (selfGoalEvents.length === 0) {
    return context.selfScore === 0 ? "【得点者】\nなし" : "";
  }
  const lines = selfGoalEvents.map((e) => {
    const min = e.minute ?? e.minuteText ?? "";
    const tag = `${isOwnGoalEvent(e) ? " (OG)" : ""}${isPenaltyEvent(e) ? " (PK)" : ""}`;
    return `${min ? `${min}' ` : ""}${e.playerName || "不明"}${tag}`;
  });
  return ["【得点者】", ...lines].join("\n");
}

function buildPrompt(match: MatchDetails, context: MatchContext, memo?: string, length: "short" | "standard" = "standard"): string {
  const inputJson = JSON.stringify(buildInputJson(match, context, memo), null, 2);
  const lengthRules =
    length === "short"
      ? `【記事の長さ：short】
・本文を200〜300文字程度にする（末尾に自動付与される得点者欄は文字数に含めない）
・主要テーマは1〜2個
・補足的なスタッツやイベントは原則省略
・簡潔に事実をまとめる`
      : `【記事の長さ：standard】
・本文を400〜600文字程度にする（末尾に自動付与される得点者欄は文字数に含めない）
・主要テーマは2〜4個
・notableEvents / notableStats / シーズン文脈を必要に応じて使用する
・ただし文字数を埋めるための一般論や推測は禁止`;

  return `あなたはサッカークラブ公式サイトの編集者です。
提供された試合データだけを使用し、自クラブ視点の日本語記事を作成してください。

【最優先ルール】
・記事の主語は必ず自クラブにする
・ホーム／アウェイの位置から自クラブを推測しない
・勝敗、スコア、連勝・連敗は提供された計算済みデータに従う
・提供されていない出来事、戦術、選手コメント、負傷情報を創作しない
・スタッツから「圧倒した」「支配した」「苦戦した」と断定しない
・得点者情報が未登録の場合、未登録であることを本文に書かず省略する
・得点者情報の未登録と無得点を区別する
・事実が少ない場合は文章を短くする
・同じ内容を言い換えて繰り返さない
・記事は今回の試合の事実だけで締める。次戦・今後・期待・意気込みへの言及は一切禁止

【記事の構成】
1. タイトル
2. 日付、大会、節、対戦相手、最終スコア
3. 得点経過や主要イベント
4. スタッツがある場合は、数値を事実として紹介
5. 連勝・連敗、直近成績、順位など今回と関係する文脈
6. 簡潔な締め

【タイトル】
・自クラブ名または一般的な短縮名を入れる
・対戦相手、結果、この試合の意味が分かる内容にする
・35〜55文字を目安にする
・過度な煽りや記号の多用を避ける
・ゲーム名が提供されている場合、必要に応じて末尾に入れる

良い例：
「フォレスト、イゴール・ジェズスの同点弾で7連敗をストップ」
「フォレスト、フラムに4－1快勝　連敗を2で止める」

【本文】
・クラブ公式ニュースとして自然で読みやすい文体にする
・選手名、クラブ名の表記を記事内で統一する
・一文を長くしすぎず、2〜4段落に分ける
・ひと言メモがある場合は、その内容を記事へ自然に反映する
・ひと言メモを事実データより優先しない

${lengthRules}

【編集判断】
記事は「利用可能なデータをできるだけ多く紹介するもの」ではない。
編集者として、その試合を象徴する重要な事実だけを選択する。

・記事の中心テーマは原則2〜3個まで
・重要度の低いデータは、存在していても積極的に省略する
・文字数を満たすために情報を追加してはいけない
・指定された文字数より短くても、記事として完結していれば問題ない
・得点者一覧は本文末尾に自動付与されるため、本文中に「得点者」欄や得点者リストを作らない

【原則として記事に書かない】
・通常のイエローカード
・試合結果に直接影響していない通常の選手交代
・45〜55%程度のポゼッション
・母数が少ない場合のシュート精度などの割合スタッツ
・特徴的ではない選手評価点
・単なる直近5試合の成績

【優先して記事に使用する】
・決勝点、同点弾、逆転弾
・連勝、連敗ストップ、◯試合ぶりの勝利
・クリーンシート
・退場、PK、負傷など試合に大きく影響したイベント
・明確に突出したスタッツ
・ユーザーのひと言メモ
・その試合固有の選手記録

【表現ルール】
・「戦力を維持した」「安定感を示した」「重要な勝利となった」など、事実から直接確認できない評価表現は禁止
・順位変動は、試合前後の順位データが存在するときだけ書く
・「接戦」「激闘」など、スタッツ等の裏付けがない断定評価は使わない

【連勝・連敗】
・試合前の記録と試合後の記録を混同しない
・引き分けで連敗が終了した場合は「連敗を止めた」と表現する
・1試合引き分けただけで「無敗に転じた」と表現しない
・勝利した場合のみ「連勝」として数える
・大会別と公式戦全体を混同しない

【順位・重要試合】
・試合当時の順位データがある場合だけ使用する
・現在の順位を過去の試合に使用しない
・「天王山」「首位攻防戦」「残留争い」は、提供された判定がtrueの場合だけ使用する
・順位や勝ち点差を具体的に書く

【SEO】
・自クラブ名、対戦相手、大会名、節、試合結果を自然に含める
・検索キーワードを不自然に繰り返さない
・ゲーム内の記録の場合、現実の試合と誤認されない表現にする

【記事の見どころ】
・narrativeFacts と「ひと言メモ」を、記事の見どころを判断する主要情報として使用する
・構造化された試合データとひと言メモが矛盾する場合は、構造化データを優先する
・ひと言メモにのみ存在する事実は、ユーザー提供情報として記事に使用してよい
・入力されたすべての情報を書く必要はない
・最もニュース価値の高い1〜3個の事実を選び、それを中心に記事を構成する

【テーマ選択の優先順位】
1. 勝敗を決めた出来事
2. 連勝・連敗の開始／終了
3. ◯試合ぶりの勝利
4. 逆転勝利
5. 終盤の決勝点
6. 選手の特筆すべき記録
7. クリーンシート
8. ひと言メモの重要トピック
9. 順位・重要試合
10. 特徴的なスタッツ
11. 直近成績

【narrativeFacts の各項目】
・null / false / 空の項目は記事に一切書かない
・cleanSheet が true なら無失点（クリーンシート）に触れてよい
・streakStopped がある場合は止めた連続記録として扱う（例: "2連敗" → 「2連敗を止めた」）
・currentCompetitionStreak は今回を含む同一大会の連続記録（例: "3連勝" / "4試合無敗" / "5試合未勝利"）。大会別の記録なので、別大会や全体の記録とは混同しない
・lateWinner が true なら終盤の決勝点として強調してよい
・comebackWin が true なら逆転勝利として扱ってよい
・firstWinInMatches が数値なら「◯試合ぶりの勝利」と表現してよい
・topRatedPlayer があれば最高評価の選手として名前と評価点を紹介してよい
・teamSaves が数値なら「チームとして◯本のシュートを防いだ」程度の扱いに留め、特定GKの個人記録と断定しない
・goalkeeperSaves が {player, saves} の形式であれば「その選手が◯セーブを記録」と書いてよい。null の場合はGK個人のセーブ数を記事に書かない
・scorerAgainstFormerClub に選手名があれば古巣戦での得点として扱ってよい
・notableEvents / notableStats は編集部が選定した「記事候補」のイベント・スタッツ。優先して記事に使用する
・keyEvents は試合の全イベント記録。通常のイエローカード・普通の交代が含まれるが、原則として記事には書かない

【締め方】
・最終段落で今後の展望・意気込みを創作しない
・以下のような汎用的な締め文・展望表現は一切使わない：
  「今後の巻き返しが期待される」「さらなる改善が期待される」「改善を目指す」
  「さらなる成長が期待される」「前進の兆しを見せた」「手応えを感じた」
  「次戦に向けて弾みをつけたい」「弾みをつける」「次戦に期待」
  「今後の戦いに注目したい」「今後に期待」「ここから調子を上げていきたい」
・具体的な展望データがなければ、今回の試合の事実で記事を終える（例: 「シティを無得点に抑え、連敗を3で止めた。」）
・記事に十分な事実がなければ、2段落程度で終了してよい。水増ししない

【禁止表現】
・「1連敗」「1連勝」という表現は使わない（日本語として不自然）。1試合だけの記録は「前節の敗戦」「前節の勝利」等で表現する
・「2試合未勝利」程度の短い未勝利記録は記事の主要テーマにしない（3試合以上の未勝利なら扱ってよい）

【出力】
JSONだけを返してください。

{
  "title": "記事タイトル",
  "body": "段落を改行で区切った本文",
  "description": "検索結果やSNS共有に使う80〜120文字の要約"
}

【入力】
${inputJson}`.trim();
}

function validateGeneratedDraft(title: string, content: string, context: MatchContext): { ok: boolean; reason?: string } {
  const text = title + content;
  const result = context.selfResult;
  const streak = context.sameCompetitionStreak || context.officialStreak;
  const before = streak?.before;
  const after = streak?.after;
  const has = (patterns: string[]) => patterns.some((p) => text.includes(p));

  // 汎用的な締め文・展望表現の検出（全結果共通）
  const GENERIC_CLOSER_PATTERNS: { re: RegExp; label: string }[] = [
    { re: /さらなる改善|改善を目指|改善が期待|さらなる成長|成長が期待/, label: "改善・成長系" },
    { re: /弾みをつけ|弾みに/, label: "弾み系" },
    { re: /今後の試合[でに]|今後に期待|今後の戦いに注目|今後の活躍/, label: "今後系" },
    { re: /次戦に向け|次戦に期待|次回の試合/, label: "次戦系" },
    { re: /巻き返しが期待|巻き返しを図|巻き返しを狙/, label: "巻き返し系" },
    { re: /調子を上げ|波に乗りたい|波に乗って/, label: "調子系" },
    { re: /前進の兆し|光明を見出|手応えを感じ|収穫となった|収穫を得た/, label: "兆し・収穫系" },
    { re: /重要な勝利|重要な一勝|大きな勝利とな|価値ある勝利/, label: "重要勝利系" },
    { re: /安定感を示|戦力を維持|地力を見せ|存在感を示/, label: "抽象評価系" },
    { re: /順位を上げ|順位が上昇|順位を上昇|浮上した|順位を抜い/, label: "順位変動系" },
  ];
  const closerHit = GENERIC_CLOSER_PATTERNS.find((p) => p.re.test(text));
  if (closerHit) {
    return { ok: false, reason: `汎用的な締め・展望表現がある（${closerHit.label}）` };
  }
  if (/1連敗|1連勝/.test(text)) {
    return { ok: false, reason: "「1連敗」「1連勝」の表現がある" };
  }

  if (result === "win") {
    if (has(["敗戦", "敗北", "負けた", "敗れた", "喫した", "敗局"])) {
      return { ok: false, reason: "勝利試合なのに敗戦・負けを示す表現がある" };
    }
    if (before && after) {
      if (before.losses > 0 && after.losses === 0 && has(["連敗を喫", "連敗が続", "連敗は続", "連敗を重ね"])) {
        return { ok: false, reason: "連敗を止めた試合なのに連敗が続いている表現がある" };
      }
      if (before.wins > 0 && after.wins > before.wins && has(["連勝を止め", "連勝が途切れ", "連勝は途切れ"])) {
        return { ok: false, reason: "連勝を伸ばした試合なのに連勝を止めた表現がある" };
      }
    }
  } else if (result === "loss") {
    if (has(["勝利した", "勝利を収め", "勝利を上げ", "勝利を挙げ", "勝った"])) {
      return { ok: false, reason: "敗北試合なのに勝利・勝ちを示す表現がある" };
    }
    if (before && after) {
      if (before.losses > 0 && after.losses > before.losses && has(["連敗を止め", "連敗を断ち切", "連敗をストップ", "連敗から脱", "連敗脱出"])) {
        return { ok: false, reason: "連敗が続いているのに連敗を止めた表現がある" };
      }
      if (before.wins > 0 && after.wins === 0 && has(["連勝を伸ば", "連勝を続", "連勝を重ね", "連勝継続"])) {
        return { ok: false, reason: "連勝が途切れた試合なのに連勝を伸ばした表現がある" };
      }
    }
  } else if (result === "draw") {
    // 「今回の試合で勝った／負けた」と断定する表現だけをNGにする。
    // 「勝」「敗」単体や「連敗を止めた」「勝利には届かなかった」は誤検知になるため含めない
    const DRAW_CONTRADICTION_PATTERNS: { re: RegExp; label: string }[] = [
      { re: /勝利(?:した|を収めた|を飾った|を挙げた|を上げた|を手に)/, label: "勝利した系" },
      { re: /白星(?:を挙げた|を飾った|を収めた)/, label: "白星系" },
      { re: /勝ち切った|勝ちを収めた|勝ち越した/, label: "勝ち切った系" },
      { re: /勝点3(?:を獲得|を手に|を加え)/, label: "勝点3獲得" },
      { re: /相手を下した|下して/, label: "相手を下した" },
      { re: /敗れた|敗戦を喫した|敗戦となった|敗北を喫した|敗北した/, label: "敗れた系" },
      { re: /黒星(?:を喫した|となった|がついた)/, label: "黒星系" },
      { re: /相手に屈した|屈した/, label: "屈した系" },
    ];
    const hit = DRAW_CONTRADICTION_PATTERNS.find((p) => p.re.test(text));
    if (hit) {
      return { ok: false, reason: `引き分けなのに勝敗を示す表現がある（${hit.label}）` };
    }
    // スコア+勝敗断定は「今回の試合スコア」に限定（「前節2-1で勝利」等の過去試合記述は許可）
    const scoreRe = new RegExp(
      `${context.selfScore}\\s*[-－]\\s*${context.opponentScore}で(?:勝利|敗戦|勝ち|負け)` +
        `|${context.opponentScore}\\s*[-－]\\s*${context.selfScore}で(?:勝利|敗戦|勝ち|負け)`
    );
    if (scoreRe.test(text)) {
      return { ok: false, reason: "引き分けなのに勝敗を示す表現がある（スコア+勝敗断定）" };
    }
    if (before && after) {
      if (before.losses > 0 && after.losses === 0 && has(["連敗を喫", "連敗が続", "連敗は続", "連敗を重ね", "連敗となった"])) {
        return { ok: false, reason: "引き分けで連敗が止まった試合なのに連敗が続いている表現がある" };
      }
      if (before.wins > 0 && after.wins === 0 && has(["連勝を伸ば", "連勝継続", "連勝を重ね"])) {
        return { ok: false, reason: "連勝が止まった試合なのに連勝が続いている表現がある" };
      }
    }
  }

  return { ok: true };
}

async function callOpenAI(prompt: string): Promise<{ title: string; content: string; description?: string }> {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "あなたはサッカークラブのニュースライターです。提供された試合データのみに基づき、JSON形式でニュースのタイトルと本文を返してください。",
          },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.7,
        max_tokens: 1200,
      }),
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`OpenAI API error: ${text}`);
    }

    const rawData: unknown = await response.json();
    if (!isOpenAiResponse(rawData)) {
      throw new Error("Invalid AI response structure");
    }
    const content = rawData.choices[0]?.message?.content || "";

    const parsed: unknown = JSON.parse(content);
    if (!isDraftResponse(parsed)) {
      throw new Error("Invalid AI response JSON");
    }

    return { title: parsed.title, content: parsed.body, description: parsed.description };
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("timeout");
    }
    throw error;
  }
}

export async function GET(request: NextRequest) {
  try {
    const uid = await getUidFromRequest(request);
    if (!uid) {
      return NextResponse.json({ error: "認証されていません。" }, { status: 401 });
    }

    const clubUid = await getActiveClubUid(uid);

    const matchData = await getMatchDataForClub(clubUid, { includeAllSeasons: true });
    const matches = matchData.allOwnPastMatches.map((m) => ({
      ...m,
      matchDate: normalizeMatchDate(m.matchDate),
    }));

    return NextResponse.json({ matches, mainSeason: matchData.mainSeason });
  } catch (error) {
    console.error("[draft GET] error", error);
    return NextResponse.json({ error: "試合の取得に失敗しました。" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const uid = await getUidFromRequest(request);
    if (!uid) {
      return NextResponse.json({ error: "認証されていません。" }, { status: 401 });
    }

    const rawBody: unknown = await request.json().catch(() => ({}));
    const body =
      typeof rawBody === "object" && rawBody !== null ? (rawBody as Record<string, unknown>) : {};
    const competitionId =
      typeof body.competitionId === "string" ? body.competitionId : typeof body.competitionId === "number" ? String(body.competitionId) : "";
    const roundId =
      typeof body.roundId === "string" ? body.roundId : typeof body.roundId === "number" ? String(body.roundId) : "";
    const matchId =
      typeof body.matchId === "string" ? body.matchId : typeof body.matchId === "number" ? String(body.matchId) : "";
    const memo = typeof body.memo === "string" ? body.memo : "";
    const length: "short" | "standard" = body.length === "short" ? "short" : "standard";

    const clubUid = await getActiveClubUid(uid);

    if (!competitionId || !roundId || !matchId) {
      return NextResponse.json({ error: "試合の指定が必要です。" }, { status: 400 });
    }

    const match = await getMatchForAdmin(clubUid, competitionId, roundId, matchId);
    if (!match) {
      return NextResponse.json({ error: "試合が見つかりません。" }, { status: 404 });
    }

    if (match.scoreHome == null || match.scoreAway == null) {
      return NextResponse.json({ error: "完了していない試合です。" }, { status: 400 });
    }

    const context = await getMatchContextForAi(clubUid, match);
    if (!context) {
      return NextResponse.json({ error: "自クラブの mainTeamId が設定されていないため、文脈を取得できません。" }, { status: 400 });
    }

    const basePrompt = buildPrompt(match, context, memo, length);

    // 検証失敗時は不合格理由をフィードバックして1回だけ自動再生成する
    let result: { title: string; content: string; description?: string } | null = null;
    let lastReason = "";
    for (let attempt = 0; attempt < 2; attempt++) {
      const prompt =
        attempt === 0
          ? basePrompt
          : `${basePrompt}\n\n【重要：前回の出力は不合格でした】\n不合格理由: ${lastReason}\n今回の試合の事実だけで構成し、展望・期待・意気込みの表現は一切使わず、事実で記事を終えてください。`;
      const generated = await callOpenAI(prompt);
      const validation = validateGeneratedDraft(generated.title, generated.content, context);
      if (validation.ok) {
        result = generated;
        break;
      }
      lastReason = validation.reason || "unknown";
      console.error(`[draft POST] generated draft contradiction (attempt ${attempt + 1}):`, {
        reason: validation.reason,
        selfResult: context.selfResult,
        title: generated.title,
        body: generated.content,
      });
    }

    if (!result) {
      return NextResponse.json({ error: `生成された文章に問題が検出されたため返却できません: ${lastReason}` }, { status: 500 });
    }

    // 得点者一覧はAI生成ではなく構造化データから本文末尾に付与する
    const scorersBlock = buildScorersBlock(match, context);
    const content = scorersBlock ? `${result.content}\n\n${scorersBlock}` : result.content;

    return NextResponse.json({ ok: true, title: result.title, content, description: result.description });
  } catch (error) {
    console.error("[draft POST] error", error);
    const message = error instanceof Error ? error.message : "下書き生成に失敗しました。";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
