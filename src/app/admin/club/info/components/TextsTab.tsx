"use client";

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type LegalPageItem = {
  title: string;
  slug: string;
  content: string;
};

export function TextsTab(props: {
  legalPages: LegalPageItem[];
  setLegalPages: (v: LegalPageItem[]) => void;
  slugify: (value: string) => string;
}) {
  const { legalPages, setLegalPages, slugify } = props;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>テキストページ（プライバシーポリシー等）</Label>
        <p className="text-xs text-muted-foreground">最大3ページまで作成できます。タイトルと本文テキストを設定すると、自動的にページが生成されます。</p>
        <div className="space-y-4">
          {legalPages.map((page, index) => (
            <div key={index} className="space-y-2 rounded-md border p-3 bg-white/60">
              <div className="grid grid-cols-1 md:grid-cols-[2fr,auto] gap-2 items-center">
                <div className="space-y-1">
                  <Label className="text-xs">タイトル</Label>
                  <Input
                    className="bg-white text-gray-900"
                    value={page.title}
                    onChange={(e) => {
                      const next = [...legalPages];
                      const newTitle = e.target.value;
                      next[index] = {
                        ...next[index],
                        title: newTitle,
                        slug: slugify(newTitle),
                      };
                      setLegalPages(next);
                    }}
                    placeholder="例）プライバシーポリシー"
                  />
                </div>
                <div className="flex md:items-end justify-end md:justify-center pt-2 md:pt-6">
                  <Button
                    type="button"
                    variant="outline"
                    className="text-red-500 border-red-300 hover:bg-red-50"
                    onClick={() => setLegalPages(legalPages.filter((_, i) => i !== index))}
                  >
                    削除
                  </Button>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">本文</Label>
                <textarea
                  className="w-full min-h-[120px] rounded-md border bg-white text-gray-900 text-sm p-2 resize-vertical"
                  value={page.content}
                  onChange={(e) => {
                    const next = [...legalPages];
                    next[index] = { ...next[index], content: e.target.value };
                    setLegalPages(next);
                  }}
                  placeholder="テキストを入力してください。改行も利用できます。"
                />
              </div>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            className="w-full bg-white text-gray-900 disabled:opacity-60"
            disabled={legalPages.length >= 3}
            onClick={() => {
              if (legalPages.length >= 3) return;
              setLegalPages([...legalPages, { title: '', slug: '', content: '' }]);
            }}
          >
            テキストページを追加
          </Button>
        </div>
      </div>
    </div>
  );
}
