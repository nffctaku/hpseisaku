"use client";

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type SnsLinks = {
  x?: string;
  youtube?: string;
  tiktok?: string;
  instagram?: string;
};

export function SnsTab(props: { snsLinks: SnsLinks; setSnsLinks: (v: SnsLinks) => void }) {
  const { snsLinks, setSnsLinks } = props;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>SNSリンク</Label>
        <p className="text-xs text-muted-foreground">HPフッターに表示する各SNSのURLを設定します。（空欄のSNSは表示されません）</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">X</Label>
            <Input
              placeholder="https://x.com/..."
              className="bg-white text-gray-900"
              value={snsLinks.x || ''}
              onChange={(e) => setSnsLinks({ ...snsLinks, x: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">YouTube</Label>
            <Input
              placeholder="https://www.youtube.com/..."
              className="bg-white text-gray-900"
              value={snsLinks.youtube || ''}
              onChange={(e) => setSnsLinks({ ...snsLinks, youtube: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">TikTok</Label>
            <Input
              placeholder="https://www.tiktok.com/@..."
              className="bg-white text-gray-900"
              value={snsLinks.tiktok || ''}
              onChange={(e) => setSnsLinks({ ...snsLinks, tiktok: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Instagram</Label>
            <Input
              placeholder="https://www.instagram.com/..."
              className="bg-white text-gray-900"
              value={snsLinks.instagram || ''}
              onChange={(e) => setSnsLinks({ ...snsLinks, instagram: e.target.value })}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
