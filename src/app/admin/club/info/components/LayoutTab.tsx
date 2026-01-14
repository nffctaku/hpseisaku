"use client";

import { Label } from '@/components/ui/label';
import { HexColorInput, HexColorPicker } from 'react-colorful';

export function LayoutTab(props: {
  homeBgColor: string;
  setHomeBgColor: (v: string) => void;
}) {
  const { homeBgColor, setHomeBgColor } = props;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="homeBgColor">HPトップ背景色</Label>
        <p className="text-xs text-muted-foreground mb-1">下の色をクリックして選択できます。</p>
        <div className="flex flex-wrap gap-3 items-center">
          {[
            '#ffffff',
            '#0b1f3b',
            '#60a5fa',
            '#facc15',
            '#ef4444',
            '#7f1d1d',
            '#16a34a',
          ].map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => setHomeBgColor(color)}
              className={`w-8 h-8 rounded-full border transition-transform ${
                homeBgColor === color ? 'ring-2 ring-primary scale-110' : 'hover:scale-105'
              }`}
              style={{ backgroundColor: color }}
              aria-label={color}
            />
          ))}
          <div className="flex items-center gap-2 text-xs text-muted-foreground ml-2">
            <span>現在の色:</span>
            <div className="w-10 h-6 rounded border" style={{ backgroundColor: homeBgColor || '#ffffff' }} />
          </div>
        </div>

        <details className="rounded-md border bg-white/60 p-3">
          <summary className="cursor-pointer text-sm text-gray-900">色を細かく調整（任意）</summary>
          <div className="mt-3 grid gap-3">
            <div className="w-full max-w-sm rounded-md border bg-white p-3">
              <HexColorPicker color={homeBgColor || '#ffffff'} onChange={setHomeBgColor} />
            </div>

            <div className="flex items-center gap-2">
              <div
                className="h-9 w-9 rounded border"
                style={{ backgroundColor: homeBgColor || '#ffffff' }}
                aria-label="現在の色"
              />
              <div className="flex-1">
                <HexColorInput
                  color={homeBgColor || '#ffffff'}
                  onChange={setHomeBgColor}
                  prefixed
                  className="h-9 w-full rounded-md border bg-white px-3 text-sm text-gray-900"
                />
              </div>
            </div>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">通常は上の色をクリックするだけでOKです。</p>
        </details>

        <p className="text-xs text-muted-foreground">クラブのHPトップ全体の背景色を変更できます。未選択の場合は標準の背景色になります。</p>
      </div>
      <div className="space-y-2 pt-4 border-t">
        <Label htmlFor="layoutType">表示レイアウト</Label>
        <div className="w-full rounded-md border bg-white text-gray-900 px-3 py-2 text-sm">標準レイアウト</div>
        <p className="text-xs text-muted-foreground">
          現在は標準レイアウトのみ利用できます。今後プランに応じてレイアウトが追加される予定です。
        </p>
      </div>
    </div>
  );
}
