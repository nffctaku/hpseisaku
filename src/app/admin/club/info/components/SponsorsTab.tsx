"use client";

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ClubEmblemUploader } from '@/components/club-emblem-uploader';

type SponsorItem = {
  imageUrl: string;
  linkUrl: string;
};

export function SponsorsTab(props: {
  sponsors: SponsorItem[];
  setSponsors: (v: SponsorItem[]) => void;
  isPro: boolean;
}) {
  const { sponsors, setSponsors, isPro } = props;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>スポンサー</Label>
        <p className="text-xs text-muted-foreground">HP下部に表示するスポンサーのロゴとリンク先URLを設定します。</p>
        <div className="space-y-3">
          {sponsors.map((sponsor, index) => (
            <div key={index} className="space-y-3 rounded-md border p-3 bg-white/60">
              <div className="w-full max-w-xs">
                <ClubEmblemUploader
                  value={sponsor.imageUrl}
                  onChange={(url: string | null) => {
                    const next = [...sponsors];
                    next[index] = { ...next[index], imageUrl: url || '' };
                    setSponsors(next);
                  }}
                />
              </div>
              <Input
                placeholder="クリック時に遷移するURL (https://...)"
                className="bg-white text-gray-900"
                value={sponsor.linkUrl}
                onChange={(e) => {
                  const next = [...sponsors];
                  next[index] = { ...next[index], linkUrl: e.target.value };
                  setSponsors(next);
                }}
              />
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="outline"
                  className="text-red-500 border-red-300 hover:bg-red-50"
                  onClick={() => {
                    setSponsors(sponsors.filter((_, i) => i !== index));
                  }}
                >
                  削除
                </Button>
              </div>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            className="w-full bg-white text-gray-900 disabled:opacity-60"
            disabled={!isPro && sponsors.length >= 1}
            onClick={() => {
              if (!isPro && sponsors.length >= 1) return;
              setSponsors([...sponsors, { imageUrl: '', linkUrl: '' }]);
            }}
          >
            スポンサーを追加
          </Button>
        </div>
      </div>
    </div>
  );
}
