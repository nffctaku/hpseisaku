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
    opponentTeam: context.opponentTeamName,
    venue: context.selfIsHome ? "home" : "away",
    selfScore: context.selfScore,
    opponentScore: context.opponentScore,
    result: context.selfResult,
    competition: match.competitionName || "",
    round: match.roundName || "",
    matchDate: formatDate(match.matchDate),
    goals,
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

function buildPrompt(match: MatchDetails, context: MatchContext, memo?: string): string {
  const inputJson = JSON.stringify(buildInputJson(match, context, memo), null, 2);

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
・300〜600文字を目安にする
・データが少なければ150〜300文字でもよい
・クラブ公式ニュースとして自然で読みやすい文体にする
・選手名、クラブ名の表記を記事内で統一する
・一文を長くしすぎず、2〜4段落に分ける
・ひと言メモがある場合は、その内容を記事へ自然に反映する
・ひと言メモを事実データより優先しない

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
    if (has(["勝利", "敗戦", "敗北", "負けた", "敗れた"])) {
      return { ok: false, reason: "引き分けなのに勝敗を示す表現がある" };
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

    const prompt = buildPrompt(match, context, memo);
    const result = await callOpenAI(prompt);

    const validation = validateGeneratedDraft(result.title, result.content, context);
    if (!validation.ok) {
      console.error("[draft POST] generated draft contradiction:", validation.reason);
      return NextResponse.json({ error: `生成された文章に矛盾が検出されたため返却できません: ${validation.reason}` }, { status: 500 });
    }

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[draft POST] error", error);
    const message = error instanceof Error ? error.message : "下書き生成に失敗しました。";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
