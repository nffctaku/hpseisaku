"use client";

import { useState } from 'react';
import { Check, Plus } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { HexColorInput, HexColorPicker } from 'react-colorful';

export function LayoutTab(props: {
  homeBgColor: string;
  setHomeBgColor: (v: string) => void;
  homeColorTheme: 'dark' | 'light';
  setHomeColorTheme: (v: 'dark' | 'light') => void;
  headerLayout: 'center' | 'left';
  setHeaderLayout: (v: 'center' | 'left') => void;
  homeLayout: 'default' | 'pattern2';
  setHomeLayout: (v: 'default' | 'pattern2') => void;
}) {
  const { homeBgColor, setHomeBgColor, homeColorTheme, setHomeColorTheme, headerLayout, setHeaderLayout, homeLayout, setHomeLayout } = props;
  const [customColorOpen, setCustomColorOpen] = useState(false);

  const presetColors = [
    { value: '#ffffff', label: 'ホワイト' },
    { value: '#0b1f3b', label: 'ネイビー' },
    { value: '#60a5fa', label: 'ブルー' },
    { value: '#facc15', label: 'イエロー' },
    { value: '#ef4444', label: 'レッド' },
    { value: '#7f1d1d', label: 'ワイン' },
    { value: '#16a34a', label: 'グリーン' },
  ];
  const effectiveBgColor = homeBgColor || '#ffffff';
  const isCustomColor = Boolean(homeBgColor) && !presetColors.some((c) => c.value === effectiveBgColor);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>HPトップ配色</Label>
        <div className="grid grid-cols-2 gap-2">
          {[
            { value: 'dark' as const, label: 'ダーク', description: '黒背景・暗いカード' },
            { value: 'light' as const, label: 'ホワイト', description: '白背景・明るいカード' },
          ].map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setHomeColorTheme(item.value)}
              className={`rounded-md border px-3 py-3 text-left transition-colors ${
                homeColorTheme === item.value
                  ? 'border-blue-500 bg-blue-500 text-white'
                  : 'border-border bg-white text-gray-900 hover:bg-gray-50'
              }`}
            >
              <div className="text-sm font-bold">{item.label}</div>
              <div className={`mt-1 text-xs ${homeColorTheme === item.value ? 'text-white/80' : 'text-gray-500'}`}>{item.description}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label>トップページレイアウト</Label>
        <div className="grid gap-2 sm:grid-cols-2">
          {[
            { value: 'pattern2' as const, label: 'パターン①', description: '直近3試合・順位表・選手名鑑をすっきり表示' },
            { value: 'default' as const, label: 'パターン②', description: 'ヒーロー・ニュース・試合結果' },
          ].map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setHomeLayout(item.value)}
              className={`rounded-md border px-3 py-3 text-left transition-colors ${
                homeLayout === item.value
                  ? 'border-blue-500 bg-blue-500 text-white'
                  : 'border-border bg-white text-gray-900 hover:bg-gray-50'
              }`}
            >
              <div className="text-sm font-bold">{item.label}</div>
              <div className={`mt-1 text-xs ${homeLayout === item.value ? 'text-white/80' : 'text-gray-500'}`}>{item.description}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label>ヘッダーレイアウト</Label>
        <div className="grid grid-cols-2 gap-2">
          {[
            { value: 'left' as const, label: '左エンブレム', description: '左にロゴとチーム名' },
            { value: 'center' as const, label: '中央エンブレム', description: '中央にロゴのみ' },
          ].map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setHeaderLayout(item.value)}
              className={`rounded-md border px-3 py-3 text-left transition-colors ${
                headerLayout === item.value
                  ? 'border-blue-500 bg-blue-500 text-white'
                  : 'border-border bg-white text-gray-900 hover:bg-gray-50'
              }`}
            >
              <div className="text-sm font-bold">{item.label}</div>
              <div className={`mt-1 text-xs ${headerLayout === item.value ? 'text-white/80' : 'text-gray-500'}`}>{item.description}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="homeBgColor">HPトップ背景色</Label>
        <p className="text-xs text-muted-foreground">クラブのHPトップ全体の背景色を設定します。</p>
        <div className="grid grid-cols-2 gap-2">
          {presetColors.map((item) => {
            const selected = !isCustomColor && effectiveBgColor === item.value;
            return (
              <button
                key={item.value}
                type="button"
                onClick={() => setHomeBgColor(item.value)}
                className={`flex items-center gap-2 rounded-md border px-3 py-2.5 text-left transition-colors ${
                  selected
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-border bg-white hover:bg-gray-50'
                }`}
              >
                <span
                  className="h-5 w-5 shrink-0 rounded border border-black/10"
                  style={{ backgroundColor: item.value }}
                />
                <span className="flex-1 text-sm font-medium text-gray-900">{item.label}</span>
                {selected && <Check className="h-4 w-4 shrink-0 text-blue-500" aria-hidden="true" />}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setCustomColorOpen(true)}
            className={`flex items-center gap-2 rounded-md border px-3 py-2.5 text-left transition-colors ${
              isCustomColor
                ? 'border-blue-500 bg-blue-50'
                : 'border-border bg-white hover:bg-gray-50'
            }`}
          >
            {isCustomColor ? (
              <span
                className="h-5 w-5 shrink-0 rounded border border-black/10"
                style={{ backgroundColor: effectiveBgColor }}
              />
            ) : (
              <Plus className="h-4 w-4 shrink-0 text-gray-500" aria-hidden="true" />
            )}
            <span className="flex-1 text-sm font-medium text-gray-900">カスタム</span>
            {isCustomColor && <Check className="h-4 w-4 shrink-0 text-blue-500" aria-hidden="true" />}
          </button>
        </div>

        <div>
          <button
            type="button"
            onClick={() => setCustomColorOpen((v) => !v)}
            className="flex items-center gap-1 text-sm text-gray-900"
          >
            <span aria-hidden="true">{customColorOpen ? '▾' : '▸'}</span>
            カスタムカラーの詳細設定（任意）
          </button>
          {customColorOpen && (
            <div className="mt-3 grid gap-3 rounded-md border bg-white/60 p-3">
              <div className="w-full max-w-sm rounded-md border bg-white p-3">
                <HexColorPicker color={effectiveBgColor} onChange={setHomeBgColor} />
              </div>

              <div className="flex items-center gap-2">
                <div
                  className="h-9 w-9 rounded border"
                  style={{ backgroundColor: effectiveBgColor }}
                  aria-label="現在の色"
                />
                <div className="flex-1">
                  <HexColorInput
                    color={effectiveBgColor}
                    onChange={setHomeBgColor}
                    prefixed
                    className="h-9 w-full rounded-md border bg-white px-3 text-sm text-gray-900"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        <p className="text-xs text-muted-foreground">未選択の場合は標準の背景色になります。</p>
      </div>
    </div>
  );
}
