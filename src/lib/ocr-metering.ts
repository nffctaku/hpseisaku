// 解析単位のコスト計測。
// users/{uid}/ocrMeasurements/{autoId} に保存する。
// 保存失敗は握りつぶす（計測失敗で解析を失敗扱いにしない）。
// APIキー・画像データは保存しない。

import { db, admin } from '@/lib/firebase/admin';

export interface OcrMeasurement {
  userId: string;
  matchId?: string | null;
  analysisId: string;
  imageIndex: number;
  imageKind: 'team_stats' | 'ratings' | 'events' | 'unknown';
  provider: 'openai' | 'anthropic' | 'none';
  model?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  status: 'success' | 'api_error' | 'parse_error' | 'no_info';
  slotConsumed: boolean;
  durationMs: number;
  plan: string;
  planTier: string;
  isPaid: boolean;
  isGranted: boolean;
  createdAt?: unknown;
}

export async function recordOcrMeasurement(m: OcrMeasurement): Promise<void> {
  try {
    await db
      .collection('users')
      .doc(m.userId)
      .collection('ocrMeasurements')
      .add({ ...m, createdAt: admin.firestore.FieldValue.serverTimestamp() });
  } catch (e) {
    console.error('[OCR Metering] Failed to record measurement:', e);
  }
}
