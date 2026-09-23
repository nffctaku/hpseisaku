"use client";

// 複数画像OCR + 確認フローの統合パネル。
// 1) 複数画像を選択し画像種別（自動/チームスタッツ/評価/イベント）を指定
// 2) /api/analyze-stats-image の複数画像モードで一括解析（部分失敗を保持）
// 3) 成功分を OcrReviewPanel で確認 → 確定時のみ Firestore へ適用
// 確認前には一切保存しない。

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardTitle } from '@/components/ui/card';
import { UploadCloud, X, Loader2, AlertCircle, RotateCcw, ChevronDown, ChevronUp, Camera } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { auth } from '@/lib/firebase';
import { ProPaywall } from '@/components/pro-paywall';
import { OcrReviewPanel, type OcrImageResultItem } from '@/components/ocr-review-panel';
import type { MatchDetails, Player } from '@/types/match';
import type { OcrImageKind } from '@/lib/stats-image-parser';

const KIND_LABELS: Record<OcrImageKind, string> = {
  team_stats: 'チームスタッツ',
  ratings: '選手評価',
  events: '試合イベント',
};

const MAX_IMAGES = 10;

interface PendingImage {
  file: File;
  previewUrl: string;
  kind: OcrImageKind;
  /** 再送時に元の画像位置を保持（予約キーの衝突防止） */
  index?: number;
}

interface ImageOutcome {
  index: number;
  ok: boolean;
  status: string;
  result?: OcrImageResultItem['result'];
  error?: string;
  retryAfterSec?: number;
  slotConsumed: boolean;
  kind: OcrImageKind;
  previewUrl?: string;
  file?: File;
}

interface MatchOcrPanelProps {
  match: MatchDetails;
  matchDocPath: string;
  homePlayers: Player[];
  awayPlayers: Player[];
  registeredTeams?: string[];
  onApplied?: () => void;
  embedded?: boolean;
  /** 折りたたみ欄内表示: 外枠・見出しを出さず中身だけ描画 */
  bare?: boolean;
  /** 外側（折りたたみ見出し）が取得済みの利用枚数。指定時はパネル側のfetchを省略 */
  usage?: { plan: string; usedCount: number; limit: number } | null;
  /** 解析後の消費を外側の残り枚数表示へ反映する */
  onUsageChange?: (usage: { usedCount: number; limit: number }) => void;
}

export function MatchOcrPanel({
  match,
  matchDocPath,
  homePlayers,
  awayPlayers,
  registeredTeams = [],
  onApplied,
  embedded = false,
  bare = false,
  usage = null,
  onUsageChange,
}: MatchOcrPanelProps) {
  const { user } = useAuth();
  const [pending, setPending] = useState<PendingImage[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [outcomes, setOutcomes] = useState<ImageOutcome[] | null>(null);
  const [analysisId, setAnalysisId] = useState('');
  const [remainingCount, setRemainingCount] = useState<number>(0);
  const [isLimitReached, setIsLimitReached] = useState(false);
  const [limit, setLimit] = useState<number>(15);
  const [usedCount, setUsedCount] = useState<number>(0);
  const [plan, setPlan] = useState<string>('free');
  const [cooldownSec, setCooldownSec] = useState(0);
  const [zoomedUrl, setZoomedUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // クールダウンカウントダウン
  useEffect(() => {
    if (cooldownSec <= 0) return;
    const t = setInterval(() => setCooldownSec((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldownSec]);

  // 使用量取得（外側から usage が渡された場合はそれを使いfetchしない）
  useEffect(() => {
    if (usage) {
      setPlan(usage.plan || 'free');
      setLimit(usage.limit);
      setUsedCount(usage.usedCount);
      setRemainingCount(Math.max(0, usage.limit - usage.usedCount));
      setIsLimitReached(usage.usedCount >= usage.limit);
      return;
    }
    const fetchUsage = async () => {
      if (!user) return;
      try {
        const idToken = await auth.currentUser?.getIdToken();
        if (!idToken) return;
        const res = await fetch('/api/analyze-stats-image/usage', {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          const l = typeof data.limit === 'number' ? data.limit : 15;
          const c = typeof data.currentCount === 'number' ? data.currentCount : 0;
          setPlan(data.plan || 'free');
          setLimit(l);
          setUsedCount(c);
          setRemainingCount(Math.max(0, l - c));
          setIsLimitReached(c >= l);
        }
      } catch (e) {
        console.error('[MatchOcrPanel] usage fetch failed', e);
      }
    };
    fetchUsage();
  }, [user, usage]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    const valid = files.filter((f) => {
      if (!allowedTypes.includes(f.type)) {
        toast.error(`${f.name}: JPEG/PNG/WebPのみ対応しています`);
        return false;
      }
      if (f.size > 10 * 1024 * 1024) {
        toast.error(`${f.name}: 10MB以下にしてください`);
        return false;
      }
      return true;
    });
    const room = Math.max(0, MAX_IMAGES - pending.length);
    const accepted = valid.slice(0, room);
    if (valid.length > room) {
      toast.warning(`最大${MAX_IMAGES}枚までです`);
    }
    accepted.forEach((file) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPending((prev) => [
          ...prev,
          { file, previewUrl: reader.result as string, kind: 'team_stats' },
        ]);
      };
      reader.readAsDataURL(file);
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removePending = (idx: number) =>
    setPending((prev) => prev.filter((_, i) => i !== idx));

  const setPendingKind = (idx: number, kind: PendingImage['kind']) =>
    setPending((prev) => prev.map((p, i) => (i === idx ? { ...p, kind } : p)));

const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
      reader.onerror = () => reject(new Error('画像の読み込みに失敗しました'));
      reader.readAsDataURL(file);
    });

  const analyze = async (targets: PendingImage[], reuseAnalysisId?: string) => {
    if (!targets.length || isLimitReached || isAnalyzing) return;
    setIsAnalyzing(true);
    const id = reuseAnalysisId || `an_${user?.uid}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    setAnalysisId(id);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error('ログインが必要です');
      const images = await Promise.all(
        targets.map(async (p, i) => ({
          image: await fileToBase64(p.file),
          imageType: p.file.type,
          kind: p.kind,
          index: p.index ?? i,
        }))
      );
      const response = await fetch('/api/analyze-stats-image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          analysisId: id,
          matchId: match.id,
          images,
          registeredTeams,
        }),
      });
      const data = await response.json();
      if (response.status === 403) {
        setIsLimitReached(true);
        setRemainingCount(0);
        throw new Error(data.error || '今月のOCR無料枠を使い切りました。');
      }
      if (!response.ok || !Array.isArray(data.results)) {
        throw new Error(data.error || '画像解析に失敗しました');
      }

      const mapped: ImageOutcome[] = data.results.map((r: any, i: number) => ({
        index: typeof r.index === 'number' ? r.index : i,
        ok: !!r.ok,
        status: r.status || 'api_error',
        result: r.result,
        error: r.error,
        retryAfterSec: r.retryAfterSec,
        slotConsumed: !!r.slotConsumed,
        kind: images[i].kind,
        previewUrl: targets[i]?.previewUrl,
        file: targets[i]?.file,
      }));
      setOutcomes((prev) => {
        // 再試行時は失敗分を新結果で上書き
        if (!prev) return mapped;
        const merged = [...prev];
        for (const m of mapped) {
          const idx = prev.findIndex((p) => p.previewUrl === m.previewUrl);
          if (idx >= 0) merged[idx] = m; else merged.push(m);
        }
        return merged;
      });

      if (typeof data.limit === 'number' && typeof data.currentCount === 'number') {
        setUsedCount(data.currentCount);
        setRemainingCount(Math.max(0, data.limit - data.currentCount));
        setIsLimitReached(data.currentCount >= data.limit);
        // 折りたたみ見出しの残り枚数表示にも反映
        onUsageChange?.({ usedCount: data.currentCount, limit: data.limit });
      }
      const anyCooldown = data.results.find((r: any) => r.status === 'cooldown' && r.retryAfterSec);
      if (anyCooldown) setCooldownSec(anyCooldown.retryAfterSec);
      setPending([]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '画像解析に失敗しました';
      toast.error(msg);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const retryFailed = () => {
    if (!outcomes) return;
    const failed = outcomes.filter((o) => !o.ok && o.status !== 'limit' && o.file);
    if (!failed.length) return;
    analyze(
      failed.map((f) => ({ file: f.file!, previewUrl: f.previewUrl || '', kind: f.kind, index: f.index })),
      analysisId
    );
  };

  const okResults: OcrImageResultItem[] = (outcomes || [])
    .filter((o) => o.ok && o.result)
    .map((o) => ({ index: o.index, kind: o.kind, result: o.result! }));
  const failedResults = (outcomes || []).filter((o) => !o.ok);

  const reset = () => {
    setPending([]);
    setOutcomes(null);
    setAnalysisId('');
  };

  const content = (
    <>
      {!bare && (
      <div className="flex items-center justify-between pb-3">
        <CardTitle className="text-sm font-bold sm:text-base">試合画像から自動入力</CardTitle>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold text-slate-300">
            {plan === 'free' ? (
              <>Free　残り{remainingCount}枚</>
            ) : (
              <><span className="font-bold text-emerald-400">Pro</span>　残り{remainingCount}枚</>
            )}
          </span>
        </div>
      </div>
      )}


      {isLimitReached && user && (
        <div className="mt-2">
          <ProPaywall uid={user.uid} limitType="ocr" label="試合スタッツの自動読み取り" current={usedCount} limit={limit} proLabel="300枚/月" sourcePage="match-ocr-panel" />
        </div>
      )}
      {cooldownSec > 0 && (
        <div className="mt-2 flex items-center gap-2 rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-xs text-amber-200">
          <AlertCircle className="h-4 w-4" />
          読み取り不能が続いたため一時制限中です（残り約{Math.ceil(cooldownSec / 60)}分）
        </div>
      )}

      {/* 解析結果なし: 画像選択 */}
      {!outcomes && (
        <div className="mt-3 space-y-3">
          <div
            role="button"
            tabIndex={0}
            onClick={() => !isLimitReached && fileInputRef.current?.click()}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click(); }}
            className={`flex min-h-24 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-4 py-5 text-center transition ${
              isLimitReached ? 'border-slate-700/50 bg-slate-800/20 opacity-50' : 'border-slate-600/80 bg-slate-800/30 hover:border-emerald-400/70'
            }`}
          >
            <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleFileSelect} disabled={isLimitReached} className="hidden" />
            <UploadCloud className="mb-2 h-8 w-8 text-slate-500" />
            <p className="text-sm font-bold text-slate-400">スクリーンショットを選択</p>
            <p className="mt-1 text-[10px] text-slate-500">複数選択可・1回最大{MAX_IMAGES}枚</p>
            <p className="mt-0.5 text-[10px] text-slate-500">試合イベント・選手評価・試合スタッツ</p>
          </div>

          {pending.length > 0 && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                {pending.map((p, i) => (
                  <div key={i} className="overflow-hidden rounded-xl border border-slate-700 bg-slate-900">
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => setZoomedUrl(p.previewUrl)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setZoomedUrl(p.previewUrl); }}
                      className="relative block w-full cursor-zoom-in"
                    >
                      <img src={p.previewUrl} alt={`画像${i + 1}`} className="aspect-video w-full bg-black object-contain" />
                      <button
                        type="button"
                        aria-label="画像を削除"
                        onClick={(e) => { e.stopPropagation(); removePending(i); }}
                        className="absolute right-1 top-1 rounded bg-slate-900/80 p-1 text-slate-300 hover:bg-slate-800"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="space-y-1.5 p-2">
                      <div className="text-[11px] font-bold text-slate-300">画像{i + 1}</div>
                      <select
                        value={p.kind}
                        onChange={(e) => setPendingKind(i, e.target.value as PendingImage['kind'])}
                        className="h-8 w-full rounded bg-slate-800 text-xs text-slate-100"
                      >
                        {Object.entries(KIND_LABELS).map(([v, l]) => (
                          <option key={v} value={v}>{l}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  onClick={() => analyze(pending)}
                  disabled={isAnalyzing || isLimitReached || cooldownSec > 0}
                  className="flex-1 bg-emerald-500 font-bold hover:bg-emerald-600"
                >
                  {isAnalyzing ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />解析中...</>) : `${pending.length}枚を解析`}
                </Button>
                <Button type="button" variant="outline" onClick={() => setPending([])} disabled={isAnalyzing}
                  className="border-slate-600 bg-slate-800 text-slate-100 hover:bg-slate-700">
                  クリア
                </Button>
              </div>
            </div>
          )}
          <ul className="space-y-0.5 text-[10px] text-slate-500">
            <li>読み取り後に内容を確認してから試合へ反映します。</li>
            <li>正しく読み取れた画像1枚につき、利用枚数を1枚消費します。</li>
            <li>読み取り結果に誤りがある場合は、修正または削除してください。</li>
          </ul>
        </div>
      )}

      {/* 解析結果あり: 失敗一覧 + 確認パネル */}
      {outcomes && (
        <div className="mt-3 space-y-3">
          {failedResults.length > 0 && (
            <div className="rounded-xl border border-red-400/30 bg-red-500/10 p-3">
              <div className="mb-1 flex items-center gap-1 text-xs font-bold text-red-200">
                <AlertCircle className="h-3 w-3" />{failedResults.length}枚の解析に失敗（枠は消費されません）
              </div>
              {failedResults.map((f, i) => (
                <div key={i} className="flex items-center gap-2 text-xs text-red-200/80">
                  {f.previewUrl && <img src={f.previewUrl} alt="" className="h-8 w-8 rounded object-cover" />}
                  <span>{KIND_LABELS[f.kind]}: {f.error || f.status}</span>
                </div>
              ))}
              {failedResults.some((f) => f.status === 'api_error' || f.status === 'parse_error' || f.status === 'no_info') && (
                <Button type="button" size="sm" variant="outline" onClick={retryFailed} disabled={isAnalyzing || cooldownSec > 0}
                  className="mt-2 border-red-400/40 text-red-100 hover:bg-red-500/20">
                  <RotateCcw className="mr-1 h-3 w-3" />失敗分を再試行（追取消費なし）
                </Button>
              )}
            </div>
          )}

          {okResults.length > 0 ? (
            <OcrReviewPanel
              match={match}
              matchDocPath={matchDocPath}
              homePlayers={homePlayers}
              awayPlayers={awayPlayers}
              results={okResults}
              analysisId={analysisId}
              onApplied={() => { reset(); onApplied?.(); }}
              onCancel={reset}
            />
          ) : (
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={reset}
                className="border-slate-600 bg-slate-800 text-slate-100 hover:bg-slate-700">
                画像を選び直す
              </Button>
            </div>
          )}
        </div>
      )}

      {/* 画像拡大表示（閉じると種別選択状態を維持したまま一覧へ戻る） */}
      {zoomedUrl && (
        <div
          role="dialog"
          aria-label="画像の拡大表示"
          onClick={() => setZoomedUrl(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
        >
          <button
            type="button"
            aria-label="閉じる"
            onClick={() => setZoomedUrl(null)}
            className="absolute right-3 top-3 rounded-full bg-slate-800/80 p-2 text-white hover:bg-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
          <img src={zoomedUrl} alt="拡大画像" className="max-h-full max-w-full object-contain" />
        </div>
      )}
    </>
  );

  if (bare) {
    return <div className="text-white">{content}</div>;
  }
  if (embedded) {
    return <div className="rounded-2xl border border-slate-700/70 bg-slate-900/70 p-4 text-white sm:p-5">{content}</div>;
  }
  return (
    <Card className="overflow-hidden rounded-2xl border-slate-700/70 bg-slate-900 text-white shadow-[0_18px_45px_rgba(15,23,42,0.35)] sm:rounded-3xl">
      <CardContent className="p-4 sm:p-6">{content}</CardContent>
    </Card>
  );
}

// 「試合イベント」タブ用の折りたたみセクション。
// 見出し行に残り枚数を常時表示し、タップでアップロード〜確認UIを展開する。
// 適用が完了したら自動で閉じ、onApplied で登録済みイベント側を更新する。
export function MatchOcrCollapsible({
  onApplied,
  ...panelProps
}: Omit<MatchOcrPanelProps, 'embedded' | 'bare' | 'usage' | 'onUsageChange'>) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [usage, setUsage] = useState<{ plan: string; usedCount: number; limit: number } | null>(null);

  // 閉じた状態でも残り枚数を出すため、利用枚数は外側で取得する
  useEffect(() => {
    const fetchUsage = async () => {
      if (!user) return;
      try {
        const idToken = await auth.currentUser?.getIdToken();
        if (!idToken) return;
        const res = await fetch('/api/analyze-stats-image/usage', {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && typeof data.limit === 'number' && typeof data.currentCount === 'number') {
          setUsage({ plan: data.plan || 'free', usedCount: data.currentCount, limit: data.limit });
        }
      } catch (e) {
        console.error('[MatchOcrCollapsible] usage fetch failed', e);
      }
    };
    fetchUsage();
  }, [user]);

  const remaining = usage ? Math.max(0, usage.limit - usage.usedCount) : null;
  const isFree = !usage || usage.plan === 'free';

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900/70 text-white">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full flex-wrap items-center gap-x-2 gap-y-1 px-4 py-3 text-left text-sm font-bold text-slate-100"
      >
        <span className="flex items-center gap-2">
          <Camera className="h-4 w-4 shrink-0 text-slate-400" />
          試合画像から自動読み取り
          <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300">β版</span>
        </span>
        <span className="ml-auto flex items-center gap-2">
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
              isFree ? 'bg-slate-600/60 text-slate-300' : 'bg-emerald-500/25 text-emerald-300'
            }`}
          >
            {isFree ? 'Free' : 'Pro'}
          </span>
          {remaining != null && <span className="text-xs font-semibold text-slate-300">残り{remaining}枚</span>}
          {open ? <ChevronUp className="h-4 w-4 shrink-0 text-slate-400" /> : <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />}
        </span>
      </button>
      {open && (
        <div className="px-4 pb-4">
          <MatchOcrPanel
            {...panelProps}
            bare
            usage={usage}
            onUsageChange={(u) =>
              setUsage((prev) => (prev ? { ...prev, ...u } : { plan: 'free', ...u }))
            }
            onApplied={() => {
              setOpen(false);
              onApplied?.();
            }}
          />
        </div>
      )}
    </div>
  );
}
