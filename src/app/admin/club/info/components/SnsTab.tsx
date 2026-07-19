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

  const labelClass = 'text-[13px] font-semibold text-[#1B1F27]';
  const inputClass = 'h-10 rounded-lg border-[#E2E4EA] bg-white text-[#1B1F27] focus-visible:ring-[#3355FF33] focus-visible:ring-offset-0';

  return (
    <div className="rounded-[10px] border border-[#E2E4EA] bg-white p-[26px] text-[#1B1F27]">
      <div className="mb-5 flex items-center gap-2 text-sm font-bold">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#3355FF14] text-[11px] font-bold text-[#3355FF]">1</span>
        SNSリンク
      </div>
      <p className="mb-4 text-xs text-[#6B7280]">HPフッターに表示する各SNSのURLを設定します。（空欄のSNSは表示されません）</p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className={labelClass}>X</Label>
            <Input
              placeholder="https://x.com/..."
              className={inputClass}
              value={snsLinks.x || ''}
              onChange={(e) => setSnsLinks({ ...snsLinks, x: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label className={labelClass}>YouTube</Label>
            <Input
              placeholder="https://www.youtube.com/..."
              className={inputClass}
              value={snsLinks.youtube || ''}
              onChange={(e) => setSnsLinks({ ...snsLinks, youtube: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label className={labelClass}>TikTok</Label>
            <Input
              placeholder="https://www.tiktok.com/@..."
              className={inputClass}
              value={snsLinks.tiktok || ''}
              onChange={(e) => setSnsLinks({ ...snsLinks, tiktok: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label className={labelClass}>Instagram</Label>
            <Input
              placeholder="https://www.instagram.com/..."
              className={inputClass}
              value={snsLinks.instagram || ''}
              onChange={(e) => setSnsLinks({ ...snsLinks, instagram: e.target.value })}
            />
          </div>
      </div>
    </div>
  );
}
