import { NextRequest, NextResponse } from 'next/server';
import { STATS_IMAGE_ANALYSIS_PROMPT, TEAM_MATCHING_PROMPT, StatsImageAnalysisResult, StatsImageAnalysisWithMatching, matchTeamNames } from '@/lib/stats-image-parser';

// APIキーの設定（環境変数から取得）
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

interface AnalyzeImageRequest {
  image: string; // Base64 encoded image
  imageType?: string; // MIME type of the image (e.g., image/jpeg, image/png)
  prompt?: string;
  registeredTeams?: Array<{ id: string; name: string }>;
}

interface AnalyzeImageResponse {
  success: boolean;
  result?: StatsImageAnalysisWithMatching;
  error?: string;
}

export async function POST(req: NextRequest) {
  console.log('[API] Image analysis request received');
  try {
    const body: AnalyzeImageRequest = await req.json();
    const { image, imageType = 'image/jpeg', prompt = STATS_IMAGE_ANALYSIS_PROMPT, registeredTeams = [] } = body;
    console.log('[API] Request body parsed, image length:', image?.length, 'image type:', imageType, 'registered teams:', registeredTeams.length);

    // Validate image data
    if (!image) {
      return NextResponse.json<AnalyzeImageResponse>(
        { success: false, error: '画像データが提供されていません' },
        { status: 400 }
      );
    }

    // Validate image format (basic check for base64)
    if (typeof image !== 'string' || image.length === 0) {
      return NextResponse.json<AnalyzeImageResponse>(
        { success: false, error: '画像データが無効です' },
        { status: 400 }
      );
    }

    // Validate image size (base64 string should not be too large)
    const MAX_IMAGE_SIZE = 25 * 1024 * 1024; // 25MB base64 limit
    if (image.length > MAX_IMAGE_SIZE) {
      return NextResponse.json<AnalyzeImageResponse>(
        { success: false, error: '画像サイズが大きすぎます（最大25MB）' },
        { status: 400 }
      );
    }

    // APIキーのチェック
    if (!ANTHROPIC_API_KEY && !OPENAI_API_KEY) {
      console.error('[API] No API keys configured');
      return NextResponse.json<AnalyzeImageResponse>(
        { success: false, error: '画像解析APIキーが設定されていません' },
        { status: 500 }
      );
    }

    console.log('[API] Using', OPENAI_API_KEY ? 'OpenAI API' : 'Claude Vision API');

    let result: StatsImageAnalysisResult;

    // OpenAI APIを使用（優先 - Claudeモデル名の問題回避）
    if (OPENAI_API_KEY) {
      console.log('[API] Calling OpenAI Vision API...');
      result = await analyzeWithOpenAI(image, imageType, prompt);
    } else if (ANTHROPIC_API_KEY) {
      // Claude Vision APIを使用（フォールバック）
      console.log('[API] Calling Claude Vision API...');
      result = await analyzeWithClaude(image, imageType, prompt);
    } else {
      return NextResponse.json<AnalyzeImageResponse>(
        { success: false, error: '画像解析APIが利用できません' },
        { status: 500 }
      );
    }

    console.log('[API] Analysis result received:', result);

    // レスポンス構造を変換（Claude APIの応答形式に対応）
    if ((result as any).match && (result as any).team_stats && (result as any).percentage_stats) {
      const directResult = result as StatsImageAnalysisResult;
      const teamMatching = matchTeamNames(
        directResult.match.home_team,
        directResult.match.away_team,
        registeredTeams
      );

      return NextResponse.json<AnalyzeImageResponse>({
        success: true,
        result: { ...directResult, team_matching: teamMatching }
      });
    }

    const finalScore = (result as any).match_info?.final_score || '0:0';
    const [scoreHome, scoreAway] = finalScore.split(':').map(Number);
    
    // 複数のレスポンス構造に対応
    let statistics: any = {};
    let performanceMetrics: any = {};
    
    // statistics + performance_metrics 構造
    if ((result as any).statistics) {
      statistics = (result as any).statistics;
      performanceMetrics = (result as any).performance_metrics || {};
    } 
    // home_team_stats + away_team_stats 構造
    else if ((result as any).home_team_stats && (result as any).away_team_stats) {
      const homeStats = (result as any).home_team_stats;
      const awayStats = (result as any).away_team_stats;
      
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
        yellow_cards: { home: homeStats.yellow_card, away: awayStats.yellow_card }
      };
      
      performanceMetrics = {
        dribble_success_rate: { home: homeStats.dribble_success_rate, away: awayStats.dribble_success_rate },
        shot_accuracy: { home: homeStats.shot_accuracy, away: awayStats.shot_accuracy },
        pass_accuracy: { home: homeStats.pass_accuracy, away: awayStats.pass_accuracy }
      };
    }
    
    const transformedResult: StatsImageAnalysisResult = {
      match: {
        home_team: (result as any).match_info?.home_team || null,
        away_team: (result as any).match_info?.away_team || null,
        score_home: scoreHome || null,
        score_away: scoreAway || null,
        match_time: (result as any).match_info?.match_time || null,
      },
      team_stats: {
        shots: {
          home: statistics.shots?.home !== undefined ? Number(statistics.shots.home) : null,
          away: statistics.shots?.away !== undefined ? Number(statistics.shots.away) : null,
        },
        possession: {
          home: statistics.possession?.home !== undefined ? Number(statistics.possession.home) : null,
          away: statistics.possession?.away !== undefined ? Number(statistics.possession.away) : null,
        },
        yellow_cards: {
          home: statistics.yellow_cards?.home !== undefined ? Number(statistics.yellow_cards.home) : null,
          away: statistics.yellow_cards?.away !== undefined ? Number(statistics.yellow_cards.away) : null,
        },
        corners: {
          home: statistics.corners?.home !== undefined ? Number(statistics.corners.home) : null,
          away: statistics.corners?.away !== undefined ? Number(statistics.corners.away) : null,
        },
        ball_recovery_time_sec: {
          home: statistics.ball_recovery?.home !== undefined ? Number(statistics.ball_recovery.home) : null,
          away: statistics.ball_recovery?.away !== undefined ? Number(statistics.ball_recovery.away) : null,
        },
        expected_goals: {
          home: statistics.goals?.home !== undefined ? Number(statistics.goals.home) : null,
          away: statistics.goals?.away !== undefined ? Number(statistics.goals.away) : null,
        },
        passes: {
          home: statistics.passes?.home !== undefined ? Number(statistics.passes.home) : null,
          away: statistics.passes?.away !== undefined ? Number(statistics.passes.away) : null,
        },
        tackles: {
          home: statistics.tackles?.home !== undefined ? Number(statistics.tackles.home) : null,
          away: statistics.tackles?.away !== undefined ? Number(statistics.tackles.away) : null,
        },
        tackles_won: {
          home: statistics.tackles_won?.home !== undefined ? Number(statistics.tackles_won.home) : null,
          away: statistics.tackles_won?.away !== undefined ? Number(statistics.tackles_won.away) : null,
        },
        interceptions: {
          home: statistics.interceptions?.home !== undefined ? Number(statistics.interceptions.home) : null,
          away: statistics.interceptions?.away !== undefined ? Number(statistics.interceptions.away) : null,
        },
        saves: {
          home: null,
          away: null,
        },
        fouls_committed: {
          home: statistics.fouls?.home !== undefined ? Number(statistics.fouls.home) : null,
          away: statistics.fouls?.away !== undefined ? Number(statistics.fouls.away) : null,
        },
        offsides: {
          home: statistics.offsides?.home !== undefined ? Number(statistics.offsides.home) : null,
          away: statistics.offsides?.away !== undefined ? Number(statistics.offsides.away) : null,
        },
        free_kicks: {
          home: statistics.free_kicks?.home !== undefined ? Number(statistics.free_kicks.home) : null,
          away: statistics.free_kicks?.away !== undefined ? Number(statistics.free_kicks.away) : null,
        },
        penalty_kicks: {
          home: statistics.penalties_against?.home !== undefined ? Number(statistics.penalties_against.home) : null,
          away: statistics.penalties_against?.away !== undefined ? Number(statistics.penalties_against.away) : null,
        },
      },
      percentage_stats: {
        dribble_success_rate: {
          home: performanceMetrics.dribble_success_rate?.home !== undefined ? Number(performanceMetrics.dribble_success_rate.home) : null,
          away: performanceMetrics.dribble_success_rate?.away !== undefined ? Number(performanceMetrics.dribble_success_rate.away) : null,
        },
        shot_accuracy: {
          home: performanceMetrics.shot_accuracy?.home !== undefined ? Number(performanceMetrics.shot_accuracy.home) : null,
          away: performanceMetrics.shot_accuracy?.away !== undefined ? Number(performanceMetrics.shot_accuracy.away) : null,
        },
        pass_accuracy: {
          home: performanceMetrics.pass_accuracy?.home !== undefined ? Number(performanceMetrics.pass_accuracy.home) : null,
          away: performanceMetrics.pass_accuracy?.away !== undefined ? Number(performanceMetrics.pass_accuracy.away) : null,
        },
      },
    };

    // 解析結果の検証
    if (!transformedResult) {
      return NextResponse.json<AnalyzeImageResponse>(
        { success: false, error: '画像解析結果が無効です' },
        { status: 500 }
      );
    }

    // チーム名マッチング
    const teamMatching = matchTeamNames(
      transformedResult.match.home_team,
      transformedResult.match.away_team,
      registeredTeams
    );

    return NextResponse.json<AnalyzeImageResponse>({ 
      success: true, 
      result: { ...transformedResult, team_matching: teamMatching } 
    });
  } catch (error) {
    console.error('Image analysis error:', error);
    console.error('Error details:', JSON.stringify(error, null, 2));
    
    // エラーメッセージの生成
    let errorMessage = '画像解析に失敗しました';
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
      if (error.message.includes('API key')) {
        errorMessage = 'APIキーが無効です';
      } else if (error.message.includes('rate limit')) {
        errorMessage = 'APIリクエスト制限を超えました。しばらく待ってから再試行してください';
      } else if (error.message.includes('timeout')) {
        errorMessage = '画像解析がタイムアウトしました';
      } else if (error.message.includes('JSON')) {
        errorMessage = '画像解析結果の解析に失敗しました';
      } else {
        errorMessage = `画像解析に失敗しました: ${error.message}`;
      }
    }

    return NextResponse.json<AnalyzeImageResponse>(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}

async function analyzeWithClaude(
  image: string,
  imageType: string,
  prompt: string
): Promise<StatsImageAnalysisResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout

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
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4096,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: imageType,
                  data: image,
                },
              },
              {
                type: 'text',
                text: prompt,
              },
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
    
    // JSONパース
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('JSON response not found in Claude output');
    }

    return JSON.parse(jsonMatch[0]);
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
): Promise<StatsImageAnalysisResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY!}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: {
                  url: `data:${imageType};base64,${image}`,
                },
              },
              {
                type: 'text',
                text: prompt,
              },
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
    
    // JSONパース
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('JSON response not found in OpenAI output');
    }

    return JSON.parse(jsonMatch[0]);
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('timeout');
    }
    throw error;
  }
}
