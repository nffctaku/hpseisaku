"use client";

import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ClubEmblemUploader } from '@/components/club-emblem-uploader';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';

type TeamOption = {
  id: string;
  name: string;
  logoUrl?: string;
};

type ClubTitleItem = {
  competitionName: string;
  seasons: string[];
  pendingSeason?: string;
};

export function SettingsTab(props: {
  teams: TeamOption[];
  selectedTeamId: string;
  setSelectedTeamId: (v: string) => void;
  mainTeamLocked: boolean;

  realTeamUsage: boolean;
  setRealTeamUsage: (v: boolean) => void;
  gameTeamUsage: boolean;
  setGameTeamUsage: (v: boolean) => void;

  logoUrl: string;

  foundedYear: string;
  setFoundedYear: (v: string) => void;
  hometown: string;
  setHometown: (v: string) => void;
  stadiumName: string;
  setStadiumName: (v: string) => void;
  stadiumCapacity: string;
  setStadiumCapacity: (v: string) => void;
  stadiumPhotoUrl: string;
  setStadiumPhotoUrl: (v: string) => void;

  clubTitles: ClubTitleItem[];
  setClubTitles: (v: ClubTitleItem[]) => void;
  seasonOptions: string[];
  toSlashSeason: (season: string) => string;

  isPro: boolean;
  loading: boolean;
  onUpdate: () => void;
}) {
  const {
    teams,
    selectedTeamId,
    setSelectedTeamId,
    mainTeamLocked,
    realTeamUsage,
    setRealTeamUsage,
    gameTeamUsage,
    setGameTeamUsage,
    logoUrl,
    foundedYear,
    setFoundedYear,
    hometown,
    setHometown,
    stadiumName,
    setStadiumName,
    stadiumCapacity,
    setStadiumCapacity,
    stadiumPhotoUrl,
    setStadiumPhotoUrl,
    clubTitles,
    setClubTitles,
    seasonOptions,
    toSlashSeason,
    loading,
    onUpdate,
  } = props;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>自チームを選択</Label>
        {mainTeamLocked ? (
          <div>
            <div className="w-full rounded-md border bg-white text-gray-900 px-3 py-2 text-sm">
              {teams.find((t) => t.id === selectedTeamId)?.name || '未設定'}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              自チームは一度設定すると変更できません。チーム情報の編集はチーム管理画面から行ってください。
            </p>
          </div>
        ) : (
          <>
            <Select
              value={selectedTeamId}
              onValueChange={(value) => {
                setSelectedTeamId(value);
              }}
            >
              <SelectTrigger className="w-full bg-white text-gray-900">
                <SelectValue placeholder="登録済みチームから選択" />
              </SelectTrigger>
              <SelectContent>
                {teams.length === 0 && (
                  <SelectItem value="_no-team" disabled>
                    チームが登録されていません
                  </SelectItem>
                )}
                {teams.map((team) => (
                  <SelectItem key={team.id} value={team.id}>
                    {team.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              一度選択した自チームは後から変更できません。慎重に選択してください。
            </p>
          </>
        )}
      </div>

      <div className="space-y-2 pt-4 border-t">
        <Label>利用形態（ライセンス・著作権の確認）</Label>
        <p className="text-xs text-muted-foreground">
          ご利用の目的に応じて選択してください。いずれか1つの選択が必須です。
        </p>
        <div className="space-y-3">
          <label className="flex items-start gap-3 rounded-md border bg-white/60 p-3">
            <Checkbox
              checked={realTeamUsage}
              onCheckedChange={(checked) => {
                const v = checked === true;
                setRealTeamUsage(v);
                if (v) setGameTeamUsage(false);
              }}
            />
            <div className="space-y-1">
              <div className="text-sm font-medium text-gray-900">実在のチームとして利用する</div>
              <div className="text-xs text-muted-foreground">
                実在のクラブ名・ロゴ・選手名などを扱う場合、権利者の許諾が必要になることがあります。
              </div>
            </div>
          </label>

          <label className="flex items-start gap-3 rounded-md border bg-white/60 p-3">
            <Checkbox
              checked={gameTeamUsage}
              onCheckedChange={(checked) => {
                const v = checked === true;
                setGameTeamUsage(v);
                if (v) setRealTeamUsage(false);
              }}
            />
            <div className="space-y-1">
              <div className="text-sm font-medium text-gray-900">ゲーム内のチームとして利用する</div>
              <div className="text-xs text-muted-foreground">
                実在のチームを模したファン活動（パロディ）としてお楽しみいただけます。設定内容はご自身の責任で管理してください。
              </div>
            </div>
          </label>
        </div>
      </div>

      <div className="space-y-2 pt-4 border-t">
        <Label>クラブロゴ</Label>
        <div className="w-24 h-24 rounded-md border bg-white/60 flex items-center justify-center overflow-hidden">
          {logoUrl ? (
            <Image src={logoUrl} alt="クラブロゴ" width={96} height={96} className="object-contain" />
          ) : (
            <span className="text-xs text-muted-foreground">ロゴ未設定</span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          ロゴ画像はチーム／大会管理で設定されたエンブレムを使用し、この画面からは変更できません。
        </p>
      </div>

      <div className="space-y-2 pt-4 border-t">
        <Label>クラブ情報</Label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">創立</Label>
            <Input
              placeholder="例: 1999年"
              className="bg-white text-gray-900"
              value={foundedYear}
              onChange={(e) => setFoundedYear(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">ホームタウン</Label>
            <Input
              placeholder="例: 東京都"
              className="bg-white text-gray-900"
              value={hometown}
              onChange={(e) => setHometown(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">スタジアム名</Label>
            <Input
              placeholder="例: ○○スタジアム"
              className="bg-white text-gray-900"
              value={stadiumName}
              onChange={(e) => setStadiumName(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">収容人数</Label>
            <Input
              placeholder="例: 10,000"
              className="bg-white text-gray-900"
              inputMode="numeric"
              value={stadiumCapacity}
              onChange={(e) => setStadiumCapacity(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-2 pt-3">
          <Label className="text-xs">スタジアム写真</Label>
          <div className="w-full max-w-md">
            <ClubEmblemUploader value={stadiumPhotoUrl} onChange={(url) => setStadiumPhotoUrl(url || '')} />
          </div>
        </div>
      </div>

      <div className="space-y-2 pt-4 border-t">
        <Label>獲得タイトル</Label>
        <p className="text-xs text-muted-foreground">大会名と獲得シーズンを登録できます。</p>
        <div className="space-y-3">
          {clubTitles.map((item, index) => (
            <div key={index} className="grid grid-cols-1 gap-2 rounded-md border p-3 bg-white/60">
              <div className="space-y-1">
                <Label className="text-xs">大会名</Label>
                <Input
                  placeholder="例: ○○リーグ"
                  className="bg-white text-gray-900"
                  value={item.competitionName}
                  onChange={(e) => {
                    const next = [...clubTitles];
                    next[index] = { ...next[index], competitionName: e.target.value };
                    setClubTitles(next);
                  }}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-[1fr,auto] gap-2 items-end">
                <div className="space-y-1">
                  <Label className="text-xs">獲得シーズン（追加）</Label>
                  <Select
                    value={item.pendingSeason || ''}
                    onValueChange={(value) => {
                      const next = [...clubTitles];
                      next[index] = { ...next[index], pendingSeason: value };
                      setClubTitles(next);
                    }}
                  >
                    <SelectTrigger className="w-full bg-white text-gray-900">
                      <SelectValue placeholder="シーズン" />
                    </SelectTrigger>
                    <SelectContent>
                      {seasonOptions.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    className="bg-white text-gray-900 disabled:opacity-60"
                    disabled={!item.pendingSeason}
                    onClick={() => {
                      const pending = (item.pendingSeason || '').trim();
                      if (!pending) return;
                      const next = [...clubTitles];
                      const seasons = Array.isArray(next[index].seasons) ? next[index].seasons : [];
                      const normalized = toSlashSeason(pending);
                      next[index] = {
                        ...next[index],
                        seasons: seasons.includes(normalized) ? seasons : [...seasons, normalized].sort((a, b) => b.localeCompare(a)),
                        pendingSeason: '',
                      };
                      setClubTitles(next);
                    }}
                  >
                    追加
                  </Button>
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">登録済みシーズン</Label>
                {Array.isArray(item.seasons) && item.seasons.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {item.seasons
                      .slice()
                      .sort((a, b) => String(b).localeCompare(String(a)))
                      .map((s) => (
                        <div key={s} className="inline-flex items-center gap-2 rounded-md border bg-white px-2 py-1 text-xs text-gray-900">
                          <span>{s}</span>
                          <button
                            type="button"
                            className="text-red-500"
                            onClick={() => {
                              const next = [...clubTitles];
                              next[index] = { ...next[index], seasons: (next[index].seasons || []).filter((x) => x !== s) };
                              setClubTitles(next);
                            }}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground">未登録</div>
                )}
              </div>

              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="outline"
                  className="text-red-500 border-red-300 hover:bg-red-50"
                  onClick={() => setClubTitles(clubTitles.filter((_, i) => i !== index))}
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
            onClick={() => setClubTitles([...clubTitles, { competitionName: '', seasons: [], pendingSeason: '' }])}
          >
            タイトルを追加
          </Button>
        </div>
      </div>

      <div className="flex justify-end pt-2">
        <Button onClick={onUpdate} disabled={loading}>
          {loading ? '更新中...' : '更新する'}
        </Button>
      </div>
    </div>
  );
}
