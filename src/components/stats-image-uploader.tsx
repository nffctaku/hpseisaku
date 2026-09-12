"use client";

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardTitle } from '@/components/ui/card';
import { UploadCloud, X, Loader2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { STATS_IMAGE_ANALYSIS_PROMPT, StatsImageAnalysisResult } from '@/lib/stats-image-parser';
import { useAuth } from '@/contexts/AuthContext';
import { auth } from '@/lib/firebase';
import { logProPaywallView, logPlanLimitReached } from '@/lib/plan-analytics';
import { ProPaywall } from '@/components/pro-paywall';
import { PlanLimitBadge } from '@/components/plan-limit-badge';

interface StatsImageUploaderProps {
  onAnalysisComplete: (result: StatsImageAnalysisResult) => void;
  registeredTeams?: string[];
  embedded?: boolean;
}

export function StatsImageUploader({ onAnalysisComplete, registeredTeams = [], embedded = false }: StatsImageUploaderProps) {
  const { user } = useAuth();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remainingCount, setRemainingCount] = useState<number>(5);
  const [isLimitReached, setIsLimitReached] = useState(false);
  const [limit, setLimit] = useState<number>(5);
  const [usedCount, setUsedCount] = useState<number>(0);
  const [plan, setPlan] = useState<string>('free');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 上限到達時にペイウォールログを送信
  useEffect(() => {
    if (!isLimitReached || !user) return;
    void logPlanLimitReached({
      uid: user.uid,
      limitType: 'ocr',
      currentCount: usedCount,
      limit,
      plan,
      sourcePage: 'stats-image-uploader',
    });
    void logProPaywallView({ uid: user.uid, limitType: 'ocr', sourcePage: 'stats-image-uploader' });
  }, [isLimitReached, user, usedCount, limit, plan]);

  // ユーザーのプランと月のOCR使用回数を取得
  useEffect(() => {
    const fetchUserData = async () => {
      if (!user) return;

      try {
        const idToken = await auth.currentUser?.getIdToken();
        if (!idToken) return;
        const res = await fetch('/api/analyze-stats-image/usage', {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          const currentLimit = typeof data.limit === 'number' ? data.limit : 5;
          const currentCount = typeof data.currentCount === 'number' ? data.currentCount : 0;
          setPlan(data.plan || 'free');
          setLimit(currentLimit);
          setUsedCount(currentCount);
          setRemainingCount(Math.max(0, currentLimit - currentCount));
          setIsLimitReached(currentCount >= currentLimit);
        }
      } catch (e) {
        console.error('[StatsImageUploader] usage fetch failed', e);
      }
    };

    fetchUserData();
  }, [user]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('JPEG、PNG、WebP形式の画像のみアップロードできます');
      return;
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      toast.error('ファイルサイズは10MB以下にしてください');
      return;
    }

    // Validate minimum file size (avoid empty files)
    if (file.size < 100) {
      toast.error('画像ファイルが破損している可能性があります');
      return;
    }

    setSelectedFile(file);
    setError(null);

    // Create preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setPreviewUrl(reader.result as string);
    };
    reader.onerror = () => {
      toast.error('画像の読み込みに失敗しました');
      setSelectedFile(null);
      setPreviewUrl(null);
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    setPreviewUrl(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleAnalyze = async () => {
    if (!selectedFile) {
      toast.error('画像ファイルを選択してください');
      return;
    }

    if (isLimitReached) {
      return;
    }

    setIsAnalyzing(true);
    setError(null);
    console.log('[StatsImageUploader] Starting image analysis for file:', selectedFile.name);

    try {
      const { result, limit, currentCount } = await analyzeImage(selectedFile, registeredTeams);
      console.log('[StatsImageUploader] Analysis successful:', result);

      if (typeof limit === 'number' && typeof currentCount === 'number') {
        const nextRemaining = Math.max(0, limit - currentCount);
        setRemainingCount(nextRemaining);
        setIsLimitReached(nextRemaining <= 0);
      }

      onAnalysisComplete(result);
      toast.success('画像解析が完了しました');
      handleRemoveFile();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '画像解析に失敗しました';
      console.error('[StatsImageUploader] Analysis error:', err);
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const analyzeImage = async (file: File, teams: string[]): Promise<{ result: StatsImageAnalysisResult; limit?: number; currentCount?: number }> => {
    console.log('[StatsImageUploader] Converting file to base64...');
    const base64 = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        const base64Data = result.split(',')[1];
        console.log('[StatsImageUploader] Base64 conversion complete, size:', base64Data.length);
        resolve(base64Data);
      };
      reader.onerror = (error) => {
        console.error('[StatsImageUploader] FileReader error:', error);
        throw new Error('画像の読み込みに失敗しました');
      };
      reader.readAsDataURL(file);
    });

    const currentUser = auth.currentUser;
    if (!currentUser) throw new Error('ログインが必要です');
    const idToken = await currentUser.getIdToken();

    console.log('[StatsImageUploader] Calling API endpoint...');
    const response = await fetch('/api/analyze-stats-image', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        image: base64,
        imageType: file.type,
        prompt: STATS_IMAGE_ANALYSIS_PROMPT,
        registeredTeams: teams
      })
    });

    console.log('[StatsImageUploader] API response status:', response.status);

    const data = await response.json();
    console.log('[StatsImageUploader] API response data:', data);

    if (response.status === 403 && data.limit !== undefined) {
      setRemainingCount(0);
      setIsLimitReached(true);
      if (user) {
        await logProPaywallView({ uid: user.uid, limitType: 'ocr', sourcePage: 'stats-image-uploader' });
      }
      throw new Error(data.error || '今月のOCR無料枠を使い切りました。');
    }

    if (!response.ok) {
      console.error('[StatsImageUploader] API error response:', data);
      throw new Error(data.error || '画像解析に失敗しました');
    }

    if (!data.success || !data.result) {
      throw new Error('画像解析結果の取得に失敗しました');
    }

    return { result: data.result, limit: data.limit, currentCount: data.currentCount };
  };

  const content = (
    <>
      <div className="flex flex-row items-center justify-between px-0 pb-3 pt-0">
        <CardTitle className="flex items-center text-sm font-bold leading-tight tracking-tight sm:text-base">
          <span className="break-keep">試合スクショから自動入力</span>
        </CardTitle>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-emerald-400/30 bg-emerald-500/15 px-3 py-1 text-xs font-bold text-emerald-300">
            AI
          </span>
          <span className="text-[10px] font-semibold text-slate-300">
            残り{remainingCount}枚
          </span>
        </div>
      </div>
      <div className="px-0 pb-0">
        <div className="space-y-4">
          <PlanLimitBadge
            plan={plan}
            current={usedCount}
            limit={limit}
            label="OCR"
            unit="回"
          />
          {isLimitReached && user && (
            <ProPaywall
              uid={user.uid}
              limitType="ocr"
              label="試合スタッツの自動読み取り"
              current={usedCount}
              limit={limit}
              proLabel="150枚/月"
              sourcePage="stats-image-uploader"
            />
          )}
          {!selectedFile ? (
            <div
              role="button"
              tabIndex={0}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click();
              }}
              className={`flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-4 py-5 text-center transition sm:min-h-52 sm:rounded-3xl sm:px-6 sm:py-10 ${
                isLimitReached
                  ? 'border-slate-700/50 bg-slate-800/20 opacity-50'
                  : 'border-slate-600/80 bg-slate-800/30 hover:border-emerald-400/70 hover:bg-slate-800/60'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                disabled={isLimitReached}
                className="hidden"
              />
              <UploadCloud className={`mb-2 h-8 w-8 ${isLimitReached ? 'text-slate-600' : 'text-slate-500'} sm:mb-4 sm:h-10 sm:w-10`} />
              <p className={`mb-3 max-w-full text-sm font-bold leading-snug ${isLimitReached ? 'text-slate-600' : 'text-slate-400'} sm:mb-4 sm:text-base`}>
                試合のスタッツを画像から読み取る
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isLimitReached}
                onClick={(e) => {
                  e.stopPropagation();
                  fileInputRef.current?.click();
                }}
                className="h-9 rounded-xl border-slate-600 bg-slate-700/80 px-4 text-sm font-bold text-slate-100 hover:bg-slate-600 hover:text-white sm:px-5"
              >
                ファイルを選択
              </Button>
              <p className="mt-3 max-w-sm text-[10px] leading-relaxed text-slate-500">
                AIによる自動読み取りのため、まれに誤読がある場合があります。読み取り後は念のため数値をご確認ください。
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="relative overflow-hidden rounded-2xl border border-slate-700 bg-slate-950/60 p-3">
                {previewUrl && (
                  <img
                    src={previewUrl}
                    alt="Preview"
                    className="h-36 w-full rounded-xl bg-slate-900 object-contain sm:h-48"
                  />
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-4 top-4 bg-slate-900/90 text-slate-200 shadow-md hover:bg-slate-800 hover:text-white"
                  onClick={handleRemoveFile}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  onClick={handleAnalyze}
                  disabled={isAnalyzing || isLimitReached}
                  className="flex-1 rounded-xl bg-emerald-500 font-bold text-white hover:bg-emerald-600"
                >
                  {isAnalyzing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      解析中...
                    </>
                  ) : (
                    '解析して入力'
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleRemoveFile}
                  disabled={isAnalyzing}
                  className="rounded-xl border-slate-600 bg-slate-800 text-slate-100 hover:bg-slate-700 hover:text-white"
                >
                  キャンセル
                </Button>
              </div>
              {error && (
                <div className="flex items-start gap-2 rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">
                  <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );

  if (embedded) {
    return <div className="rounded-2xl border border-slate-700/70 bg-slate-900/70 p-4 text-white sm:p-5">{content}</div>;
  }

  return (
    <Card className="overflow-hidden rounded-2xl border-slate-700/70 bg-slate-900 text-white shadow-[0_18px_45px_rgba(15,23,42,0.35)] sm:rounded-3xl">
      <CardContent className="p-4 sm:p-6">{content}</CardContent>
    </Card>
  );
}
