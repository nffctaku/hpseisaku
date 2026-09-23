import { NextRequest, NextResponse } from 'next/server';
import {
  STATS_IMAGE_ANALYSIS_PROMPT,
  RATINGS_IMAGE_ANALYSIS_PROMPT,
  EVENTS_IMAGE_ANALYSIS_PROMPT,
  StatsImageAnalysisResult,
  StatsImageAnalysisWithMatching,
  RatingsImageAnalysisResult,
  EventsImageAnalysisResult,
  OcrImageKind,
  matchTeamNames,
} from '@/lib/stats-image-parser';
import { auth, db, admin } from '@/lib/firebase/admin';
import { getPlanLimit } from '@/lib/plan-limits';
import { getEffectivePlanForUid } from '@/lib/server-plan';
import { touchUserActivity } from '@/lib/server-activity';
import {
  reserveOcrSlot,
  finalizeOcrSlot,
  ocrMonthKey,
  ocrAnalysisDocRef,
} from '@/lib/ocr-usage';
import {
  isAllowedImageType,
  isValidBase64Image,
  isUsableResult,
  sanitizeRatingsResult,
  sanitizeEventsResult,
} from '@/lib/ocr-validation';
import { recordOcrMeasurement } from '@/lib/ocr-metering';
import { preprocessEventsImage } from '@/lib/ocr-image-preprocess';

// APIキーの設定（環境変数から取得）
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const MAX_IMAGE_SIZE = 25 * 1024 * 1024; // 25MB base64 limit
const MAX_IMAGES_PER_REQUEST = 10;

// ===== リクエスト/レスポンス型 =====

interface LegacyAnalyzeImageRequest {
  image: string;
  imageType?: string;
  prompt?: string;
  careerId?: string | null;
  registeredTeams?: Array<{ id: string; name: string }>;
}

interface MultiImageRequest {
  analysisId: string; // 冪等キー（クライアント生成。再送はこれで重複排除）
  matchId?: string | null;
  careerId?: string | null;
  images: Array<{
    image: string;
    imageType?: string;
    kind?: OcrImageKind; // 省略時は 'team_stats'（従来互換）
    prompt?: string;
    /** 失敗分の再送時に元の画像位置を保持するための任意index。
     *  省略時は配列内の位置。予約キー `${analysisId}:${index}` の
     *  衝突を防ぎ、確定済みスロットの結果が別画像に返るのを防ぐ。 */
    index?: number;
  }>;
  registeredTeams?: Array<{ id: string; name: string }>;
}

interface ImageResult {
  index: number;
  ok: boolean;
  status: 'success' | 'api_error' | 'parse_error' | 'no_info' | 'limit' | 'rate_limit' | 'cooldown' | 'invalid';
  result?: StatsImageAnalysisWithMatching | RatingsImageAnalysisResult | EventsImageAnalysisResult;
  error?: string;
  retryAfterSec?: number;
  slotConsumed: boolean;
}

interface MultiImageResponse {
  success: boolean;
  results: ImageResult[];
  limit?: number;
  currentCount?: number;
}

interface AnalyzeImageResponse {
  success: boolean;
  result?: StatsImageAnalysisWithMatching;
  error?: string;
  limit?: number;
  currentCount?: number;
}

// ===== AI呼び出し（トークン計測付き） =====

interface AiCallResult {
  result: unknown;
  provider: 'openai' | 'anthropic';
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  durationMs: number;
}

const mockCallCounts: Record<string, number> = {};

async function callAiApi(
  image: string,
  imageType: string,
  prompt: string,
  kind: OcrImageKind
): Promise<AiCallResult> {
  const startedAt = Date.now();
  // ローカル検証用モック: OCR_MOCK_RESPONSE_JSON に {kind別 or 単一} のJSONを設定すると
  // 提供元APIを呼ばず固定結果を返す（予約・検証・計測のサーバー経路は実動作する）。
  const mockJson = process.env.OCR_MOCK_RESPONSE_JSON;
  if (mockJson) {
    try {
      const parsed = JSON.parse(mockJson);
      const entry = parsed[kind] ?? parsed;
      // kind別の値が配列なら呼び出し順に消費（部分失敗→再試行成功の検証用）
      const idx = (mockCallCounts[kind] = (mockCallCounts[kind] ?? 0) + 1) - 1;
      const result = Array.isArray(entry) ? entry[Math.min(idx, entry.length - 1)] : entry;
      return {
        result, provider: 'openai', model: 'mock',
        inputTokens: null, outputTokens: null, durationMs: Date.now() - startedAt,
      };
    } catch {
      throw new Error('mock_parse_error');
    }
  }
  // イベント画面のみタイムライン領域をクロップ+拡大して送信（ratings/team_statsは元画像のまま）
  if (kind === 'events') {
    const pp = await preprocessEventsImage(image, imageType);
    image = pp.image;
    imageType = pp.imageType;
  }
  // 検証・運用切替用: OCR_AI_PROVIDER=openai|anthropic で提供元を強制できる
  // デフォルトはAnthropic(Haiku 4.5)優先。OpenAIはANTHROPICキー未設定時または明示指定時のみ
  const providerOverride = (process.env.OCR_AI_PROVIDER || '').toLowerCase();
  const preferClaude = providerOverride ? providerOverride === 'anthropic' : !!ANTHROPIC_API_KEY;
  const preferOpenAI = providerOverride ? providerOverride === 'openai' : !ANTHROPIC_API_KEY && !!OPENAI_API_KEY;
  if (preferOpenAI && OPENAI_API_KEY) {
    const r = await analyzeWithOpenAI(image, imageType, prompt);
    return { ...r, provider: 'openai', durationMs: Date.now() - startedAt };
  }
  if (preferClaude && ANTHROPIC_API_KEY) {
    const r = await analyzeWithClaude(image, imageType, prompt);
    return { ...r, provider: 'anthropic', durationMs: Date.now() - startedAt };
  }
  if (OPENAI_API_KEY) {
    const r = await analyzeWithOpenAI(image, imageType, prompt);
    return { ...r, provider: 'openai', durationMs: Date.now() - startedAt };
  }
  if (ANTHROPIC_API_KEY) {
    const r = await analyzeWithClaude(image, imageType, prompt);
    return { ...r, provider: 'anthropic', durationMs: Date.now() - startedAt };
  }
  throw new Error('no_api_key');
}

// ===== 画像1枚の解析処理（予約→AI→検証→確定/解放） =====

async function analyzeOneImage(params: {
  uid: string;
  image: string;
  imageType: string;
  kind: OcrImageKind;
  prompt: string;
  reservationKey: string;
  analysisId: string;
  imageIndex: number;
  monthKey: string;
  limit: number;
  plan: string;
  planTier: string;
  isPaid: boolean;
  isGranted: boolean;
  matchId?: string | null;
  careerId?: string | null;
  registeredTeams: Array<{ id: string; name: string }>;
}): Promise<ImageResult> {
  const { uid, image, imageType, kind, prompt, reservationKey, analysisId, imageIndex, monthKey, limit, plan, planTier, isPaid, isGranted, matchId, careerId, registeredTeams } = params;

  // --- 画像バリデーション ---
  if (!isAllowedImageType(imageType)) {
    return { index: imageIndex, ok: false, status: 'invalid', error: '未対応の画像形式です', slotConsumed: false };
  }
  if (!isValidBase64Image(image)) {
    return { index: imageIndex, ok: false, status: 'invalid', error: '画像データが無効です', slotConsumed: false };
  }

  // --- 枠予約（トランザクション。上限超過・レート制限・冪等性をここで処理） ---
  const reservation = await reserveOcrSlot({ uid, reservationKey, limit, monthKey });
  if (!reservation.ok) {
    if (reservation.reason === 'limit') {
      return { index: imageIndex, ok: false, status: 'limit', error: '今月のOCR無料枠を使い切りました。', slotConsumed: false };
    }
    if (reservation.reason === 'cooldown') {
      return { index: imageIndex, ok: false, status: 'cooldown', error: '読み取り不能な解析が続いたため一時的に制限されています', retryAfterSec: reservation.retryAfterSec, slotConsumed: false };
    }
    return { index: imageIndex, ok: false, status: 'rate_limit', error: '短時間の解析回数が上限に達しました', retryAfterSec: reservation.retryAfterSec, slotConsumed: false };
  }

  // 同一キー再送: 確定済みならキャッシュ結果を返し、予約中なら処理中として返す
  if (reservation.duplicate === 'consumed') {
    const cached = await ocrAnalysisDocRef(uid, analysisId).get();
    const cachedResult = cached.exists ? (cached.data()?.results?.[String(imageIndex)] as ImageResult['result'] | undefined) : undefined;
    if (cachedResult) {
      return { index: imageIndex, ok: true, status: 'success', result: cachedResult, slotConsumed: false };
    }
    return { index: imageIndex, ok: true, status: 'success', slotConsumed: false };
  }
  if (reservation.duplicate === 'reserved') {
    return { index: imageIndex, ok: false, status: 'rate_limit', error: '同じ解析が進行中です', slotConsumed: false };
  }

  // --- AI呼び出し（トランザクション外） ---
  let aiResult: AiCallResult | null = null;
  let callError: Error | null = null;
  try {
    aiResult = await callAiApi(image, imageType, prompt, kind);
  } catch (e) {
    callError = e instanceof Error ? e : new Error(String(e));
  }

  const measure = async (status: 'success' | 'api_error' | 'parse_error' | 'no_info', consumed: boolean) => {
    await recordOcrMeasurement({
      userId: uid,
      matchId,
      careerId,
      analysisId,
      imageIndex,
      imageKind: kind,
      provider: aiResult?.provider ?? (ANTHROPIC_API_KEY ? 'anthropic' : OPENAI_API_KEY ? 'openai' : 'none'),
      model: aiResult?.model ?? null,
      inputTokens: aiResult?.inputTokens ?? null,
      outputTokens: aiResult?.outputTokens ?? null,
      status,
      slotConsumed: consumed,
      durationMs: aiResult?.durationMs ?? 0,
      plan,
      planTier,
      isPaid,
      isGranted,
    });
  };

  // AI呼び出し失敗 → 予約解放（消費なし）
  if (!aiResult) {
    await finalizeOcrSlot({ uid, reservationKey, usable: false, noInfo: false, plan, monthKey });
    await measure('api_error', false);
    const msg = callError?.message === 'timeout'
      ? '画像解析がタイムアウトしました'
      : callError?.message === 'no_api_key'
        ? '画像解析APIキーが設定されていません'
        : '画像解析に失敗しました';
    return { index: imageIndex, ok: false, status: 'api_error', error: msg, slotConsumed: false };
  }

  // --- 結果検証・正規化 ---
  let parsed: StatsImageAnalysisWithMatching | RatingsImageAnalysisResult | EventsImageAnalysisResult;
  try {
    if (kind === 'ratings') {
      const r = aiResult.result as RatingsImageAnalysisResult;
      parsed = sanitizeRatingsResult({ kind: 'ratings', match: r?.match as RatingsImageAnalysisResult['match'], players: r?.players ?? [] });
    } else if (kind === 'events') {
      const r = aiResult.result as EventsImageAnalysisResult;
      parsed = sanitizeEventsResult({ kind: 'events', match: r?.match as EventsImageAnalysisResult['match'], events: r?.events ?? [] });
    } else {
      parsed = transformTeamStatsResult(aiResult.result, registeredTeams);
    }
  } catch (e) {
    await finalizeOcrSlot({ uid, reservationKey, usable: false, noInfo: false, plan, monthKey });
    await measure('parse_error', false);
    return { index: imageIndex, ok: false, status: 'parse_error', error: '画像解析結果の解析に失敗しました', slotConsumed: false };
  }

  // --- 「使える情報」判定 ---
  const usable = isUsableResult(parsed, kind);
  if (!usable) {
    // 正常応答だが読み取り情報なし → 解放 + 連続noInfoカウント
    await finalizeOcrSlot({ uid, reservationKey, usable: false, noInfo: true, plan, monthKey });
    await measure('no_info', false);
    return { index: imageIndex, ok: false, status: 'no_info', error: '使える情報が読み取れませんでした', slotConsumed: false };
  }

  // --- 消費確定 + 結果キャッシュ（冪等再送用） ---
  await finalizeOcrSlot({ uid, reservationKey, usable: true, plan, monthKey, limit });
  await measure('success', true);
  try {
    await ocrAnalysisDocRef(uid, analysisId).set(
      { results: { [String(imageIndex)]: parsed }, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true }
    );
  } catch (e) {
    console.error('[API] Failed to cache analysis result:', e);
  }

  return { index: imageIndex, ok: true, status: 'success', result: parsed, slotConsumed: true };
}

// ===== メインハンドラ =====

export async function POST(req: NextRequest) {
  console.log('[API] Image analysis request received');
  try {
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!token) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const decoded = await auth.verifyIdToken(token);
    const uid = decoded.uid;

    const effectivePlan = await getEffectivePlanForUid(uid);
    const { plan, tier, isPaid, isGranted } = effectivePlan;
    const limit = getPlanLimit('ocr_per_month', tier);
    const currentMonthKey = ocrMonthKey();
    const usageSnap = await db.collection('users').doc(uid).collection('usage').doc(currentMonthKey).get();
    const currentCount = usageSnap.exists ? (Number((usageSnap.data() as Record<string, unknown>)?.count) || 0) : 0;

    const body = await req.json();

    // ===== 複数画像モード =====
    if (Array.isArray(body.images)) {
      const multi = body as MultiImageRequest;
      if (multi.images.length === 0 || multi.images.length > MAX_IMAGES_PER_REQUEST) {
        return NextResponse.json<MultiImageResponse>(
          { success: false, results: [], error: undefined } as never,
          { status: 400 }
        );
      }
      const analysisId = typeof multi.analysisId === 'string' && multi.analysisId.trim()
        ? multi.analysisId.trim()
        : `auto_${uid}_${Date.now()}`;
      const registeredTeams = Array.isArray(multi.registeredTeams) ? multi.registeredTeams : [];

      const results: ImageResult[] = [];
      for (let i = 0; i < multi.images.length; i++) {
        const img = multi.images[i];
        const kind: OcrImageKind =
          img.kind === 'ratings' || img.kind === 'events' ? img.kind : 'team_stats';
        const prompt =
          img.prompt ||
          (kind === 'ratings'
            ? RATINGS_IMAGE_ANALYSIS_PROMPT
            : kind === 'events'
              ? EVENTS_IMAGE_ANALYSIS_PROMPT
              : STATS_IMAGE_ANALYSIS_PROMPT);

        // 再送時はクライアント指定の元indexを使い、確定済みスロットと衝突しない
        const imageIndex =
          typeof img.index === 'number' && Number.isInteger(img.index) && img.index >= 0
            ? img.index
            : i;
        const r = await analyzeOneImage({
          uid,
          image: img.image,
          imageType: img.imageType || 'image/jpeg',
          kind,
          prompt,
          reservationKey: `${analysisId}:${imageIndex}`,
          analysisId,
          imageIndex,
          monthKey: currentMonthKey,
          limit,
          plan: plan || 'free',
          planTier: tier,
          isPaid,
          isGranted,
          matchId: multi.matchId ?? null,
          careerId: typeof multi.careerId === 'string' && multi.careerId ? multi.careerId : null,
          registeredTeams,
        });
        results.push(r);

        // 上限到達以降の画像は全てlimitで返す（予約しない）
        if (r.status === 'limit') {
          try {
            await db.collection('analyticsEvents').add({
              eventName: 'plan_limit_reached',
              userId: uid,
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
              properties: { uid, limitType: 'ocr', currentCount, limit, plan, sourcePage: 'analyze-stats-image' },
            });
          } catch (e) {
            console.warn('[API] plan_limit_reached event failed', e);
          }
          for (let j = i + 1; j < multi.images.length; j++) {
            const restIdx =
              typeof multi.images[j].index === 'number' && Number.isInteger(multi.images[j].index) && (multi.images[j].index as number) >= 0
                ? (multi.images[j].index as number)
                : j;
            results.push({ index: restIdx, ok: false, status: 'limit', error: '今月のOCR無料枠を使い切りました。', slotConsumed: false });
          }
          break;
        }
      }

      const consumedCount = results.filter((r) => r.slotConsumed).length;
      await touchUserActivity(uid);
      return NextResponse.json<MultiImageResponse>({
        success: true,
        results,
        limit,
        currentCount: currentCount + consumedCount,
      });
    }

    // ===== 従来互換：単一画像モード =====
    const legacy = body as LegacyAnalyzeImageRequest;
    const { image, imageType = 'image/jpeg', prompt = STATS_IMAGE_ANALYSIS_PROMPT, registeredTeams = [] } = legacy;

    if (!image || typeof image !== 'string' || image.length === 0) {
      return NextResponse.json<AnalyzeImageResponse>(
        { success: false, error: '画像データが提供されていません' },
        { status: 400 }
      );
    }
    if (image.length > MAX_IMAGE_SIZE) {
      return NextResponse.json<AnalyzeImageResponse>(
        { success: false, error: '画像サイズが大きすぎます（最大25MB）' },
        { status: 400 }
      );
    }
    if (!ANTHROPIC_API_KEY && !OPENAI_API_KEY) {
      return NextResponse.json<AnalyzeImageResponse>(
        { success: false, error: '画像解析APIキーが設定されていません' },
        { status: 500 }
      );
    }

    const legacyAnalysisId = `legacy_${uid}_${Date.now()}`;
    const r = await analyzeOneImage({
      uid,
      image,
      imageType,
      kind: 'team_stats',
      prompt,
      reservationKey: `${legacyAnalysisId}:0`,
      analysisId: legacyAnalysisId,
      imageIndex: 0,
      monthKey: currentMonthKey,
      limit,
      plan: plan || 'free',
      planTier: tier,
      isPaid,
      isGranted,
      matchId: null,
      careerId: typeof legacy.careerId === 'string' && legacy.careerId ? legacy.careerId : null,
      registeredTeams,
    });

    if (!r.ok) {
      const status = r.status === 'limit' ? 403 : r.status === 'invalid' ? 400 : 500;
      if (r.status === 'limit') {
        await db.collection('analyticsEvents').add({
          eventName: 'plan_limit_reached',
          userId: uid,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          properties: { uid, limitType: 'ocr', currentCount, limit, plan, sourcePage: 'analyze-stats-image' },
        });
      }
      return NextResponse.json<AnalyzeImageResponse>(
        { success: false, error: r.error, limit, currentCount },
        { status }
      );
    }

    await touchUserActivity(uid);
    return NextResponse.json<AnalyzeImageResponse>({
      success: true,
      result: r.result as StatsImageAnalysisWithMatching,
      limit,
      currentCount: currentCount + 1,
    });
  } catch (error) {
    console.error('Image analysis error:', error);
    let errorMessage = '画像解析に失敗しました';
    if (error instanceof Error) {
      if (error.message.includes('API key')) errorMessage = 'APIキーが無効です';
      else if (error.message.includes('rate limit')) errorMessage = 'APIリクエスト制限を超えました。しばらく待ってから再試行してください';
      else if (error.message.includes('timeout')) errorMessage = '画像解析がタイムアウトしました';
      else if (error.message.includes('JSON')) errorMessage = '画像解析結果の解析に失敗しました';
      else errorMessage = `画像解析に失敗しました: ${error.message}`;
    }
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}

// ===== チームスタッツ結果の変換（従来ロジック） =====

function transformTeamStatsResult(
  result: unknown,
  registeredTeams: Array<{ id: string; name: string }>
): StatsImageAnalysisWithMatching {
  const raw = result as Record<string, unknown>;

  // 既に正規化済み構造
  if (raw.match && raw.team_stats && raw.percentage_stats) {
    const direct = raw as unknown as StatsImageAnalysisResult;
    return {
      ...direct,
      team_matching: matchTeamNames(direct.match.home_team, direct.match.away_team, registeredTeams),
    };
  }

  const matchInfo = raw.match_info as Record<string, unknown> | undefined;
  const finalScore = (matchInfo?.final_score as string) || '0:0';
  const [scoreHome, scoreAway] = finalScore.split(':').map(Number);

  let statistics: Record<string, { home?: unknown; away?: unknown }> = {};
  let performanceMetrics: Record<string, { home?: unknown; away?: unknown }> = {};

  if (raw.statistics) {
    statistics = raw.statistics as typeof statistics;
    performanceMetrics = (raw.performance_metrics as typeof performanceMetrics) || {};
  } else if (raw.home_team_stats && raw.away_team_stats) {
    const homeStats = raw.home_team_stats as Record<string, unknown>;
    const awayStats = raw.away_team_stats as Record<string, unknown>;
    statistics = {
      possession: { home: homeStats.position, away: awayStats.position },
      ball_recovery: { home: homeStats.ball_recovery, away: awayStats.ball_recovery },
      shots: { home: homeStats.shot, away: awayStats.shot },
      goals: { home: null, away: null },
      passes: { home: homeStats.pass, away: awayStats.pass },
      tackles: { home: homeStats.tackle, away: awayStats.tackle },
      tackles_won: { home: homeStats.tackle_success, away: awayStats.tackle_success },
      interceptions: { home: homeStats.interception, away: awayStats.interception },
      clearances: { home: homeStats.clearance, away: awayStats.clearance },
      fouls: { home: homeStats.fouls, away: awayStats.fouls },
      offsides: { home: homeStats.offside, away: awayStats.offside },
      corners: { home: homeStats.corner, away: awayStats.corner },
      free_kicks: { home: homeStats.free_kick, away: awayStats.free_kick },
      penalties_against: { home: homeStats.penalty_kick, away: awayStats.penalty_kick },
      yellow_cards: { home: homeStats.yellow_card, away: awayStats.yellow_card },
    };
    performanceMetrics = {
      dribble_success_rate: { home: homeStats.dribble_success_rate, away: awayStats.dribble_success_rate },
      shot_accuracy: { home: homeStats.shot_accuracy, away: awayStats.shot_accuracy },
      pass_accuracy: { home: homeStats.pass_accuracy, away: awayStats.pass_accuracy },
    };
  }

  const num = (v: unknown): number | null => (v !== undefined && v !== null ? Number(v) : null);
  const pair = (o: { home?: unknown; away?: unknown } | undefined) => ({
    home: num(o?.home),
    away: num(o?.away),
  });

  const transformed: StatsImageAnalysisResult = {
    match: {
      home_team: (matchInfo?.home_team as string) || null,
      away_team: (matchInfo?.away_team as string) || null,
      score_home: scoreHome || null,
      score_away: scoreAway || null,
      match_time: (matchInfo?.match_time as string) || null,
    },
    team_stats: {
      shots: pair(statistics.shots),
      possession: pair(statistics.possession),
      yellow_cards: pair(statistics.yellow_cards),
      corners: pair(statistics.corners),
      ball_recovery_time_sec: pair(statistics.ball_recovery),
      expected_goals: pair(statistics.goals),
      passes: pair(statistics.passes),
      tackles: pair(statistics.tackles),
      tackles_won: pair(statistics.tackles_won),
      interceptions: pair(statistics.interceptions),
      saves: { home: null, away: null },
      fouls_committed: pair(statistics.fouls),
      offsides: pair(statistics.offsides),
      free_kicks: pair(statistics.free_kicks),
      penalty_kicks: pair(statistics.penalties_against),
    },
    percentage_stats: {
      dribble_success_rate: pair(performanceMetrics.dribble_success_rate),
      shot_accuracy: pair(performanceMetrics.shot_accuracy),
      pass_accuracy: pair(performanceMetrics.pass_accuracy),
    },
  };

  return {
    ...transformed,
    team_matching: matchTeamNames(transformed.match.home_team, transformed.match.away_team, registeredTeams),
  };
}

// ===== AI API呼び出し =====

interface RawAiResponse {
  result: unknown;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
}

async function analyzeWithClaude(
  image: string,
  imageType: string,
  prompt: string
): Promise<RawAiResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);
  const model = 'claude-haiku-4-5-20251001';

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: imageType, data: image } },
              { type: 'text', text: prompt },
            ],
          },
        ],
      }),
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Claude API error: ${error}`);
    }

    const data = await response.json();
    const content = data.content[0].text;
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('JSON response not found in Claude output');
    }

    return {
      result: JSON.parse(jsonMatch[0]),
      model: data.model || model,
      inputTokens: data.usage?.input_tokens ?? null,
      outputTokens: data.usage?.output_tokens ?? null,
    };
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('timeout');
    }
    throw error;
  }
}

async function analyzeWithOpenAI(
  image: string,
  imageType: string,
  prompt: string
): Promise<RawAiResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);
  const model = 'gpt-4o';

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY!}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: `data:${imageType};base64,${image}` } },
              { type: 'text', text: prompt },
            ],
          },
        ],
        max_tokens: 4096,
      }),
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${error}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content;
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('JSON response not found in OpenAI output');
    }

    return {
      result: JSON.parse(jsonMatch[0]),
      model: data.model || model,
      inputTokens: data.usage?.prompt_tokens ?? null,
      outputTokens: data.usage?.completion_tokens ?? null,
    };
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('timeout');
    }
    throw error;
  }
}
