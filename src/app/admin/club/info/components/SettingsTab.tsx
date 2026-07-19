"use client";

import { useState } from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ClubEmblemUploader } from '@/components/club-emblem-uploader';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

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
  } = props;

  const [activeSection, setActiveSection] = useState<'basic' | 'detail'>('basic');

  const cardClass = 'rounded-[10px] border border-[#E2E4EA] bg-white p-[26px]';
  const labelClass = 'text-[13px] font-semibold text-[#1B1F27]';
  const helpClass = 'text-xs text-[#9CA3AF]';
  const inputClass = 'h-10 rounded-lg border-[#E2E4EA] bg-white text-[#1B1F27] focus-visible:ring-[#3355FF33] focus-visible:ring-offset-0';
  const sectionTabClass = (value: 'basic' | 'detail') =>
    `flex-1 rounded-md px-3 py-2 text-sm font-semibold transition ${activeSection === value ? 'bg-[#3355FF] !text-white' : 'text-[#6B7280]'}`;
  const titleCount = clubTitles.filter((t) => t.competitionName.trim() || t.seasons.length > 0).length;

  return (
    <div className="space-y-6 text-[#1B1F27]">
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-[#F8F9FB] p-1">
        <button type="button" className={sectionTabClass('basic')} onClick={() => setActiveSection('basic')}>基本設定</button>
        <button type="button" className={sectionTabClass('detail')} onClick={() => setActiveSection('detail')}>
          クラブ詳細{titleCount > 0 ? <span className="ml-1 font-mono text-xs opacity-75">{titleCount}</span> : null}
        </button>
      </div>

      {activeSection === 'basic' ? (
        <div className="space-y-5">
          <div className={cardClass}>
            <div className="mb-5 flex items-center gap-2 text-sm font-bold">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#3355FF14] text-[11px] font-bold text-[#3355FF]">1</span>
              自チーム設定
            </div>
            <div className="space-y-2">
              <Label className={labelClass}>自チームを選択</Label>
        {mainTeamLocked ? (
          <div>
            <div className="w-full rounded-md border bg-white text-gray-900 px-3 py-2 text-sm">
              {teams.find((t) => t.id === selectedTeamId)?.name || '未設定'}
            </div>
            <p className={`${helpClass} mt-1`}>
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
              <SelectTrigger className={inputClass}>
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
            <p className={helpClass}>
              一度選択した自チームは後から変更できません。慎重に選択してください。
            </p>
          </>
        )}
            </div>
          </div>

          <div className={cardClass}>
            <div className="mb-5 flex items-center gap-2 text-sm font-bold">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#3355FF14] text-[11px] font-bold text-[#3355FF]">2</span>
              クラブロゴ
            </div>
            <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-lg border border-[#E2E4EA] bg-white">
              {logoUrl ? (
                <Image src={logoUrl} alt="クラブロゴ" width={64} height={64} className="object-contain" />
              ) : (
                <span className="text-xs text-[#9CA3AF]">ロゴ未設定</span>
              )}
            </div>
            <p className={`${helpClass} mt-2`}>
              ロゴ画像はチーム／大会管理で設定されたエンブレムを使用し、この画面からは変更できません。
            </p>
          </div>

          <div className={cardClass}>
            <div className="mb-5 flex items-center gap-2 text-sm font-bold">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#3355FF14] text-[11px] font-bold text-[#3355FF]">3</span>
              利用形態
            </div>
            <p className="mb-3 text-xs text-[#6B7280]">ご利用の目的に応じて選択してください。いずれか1つの選択が必須です。</p>
            <div className="space-y-3">
              <button
                type="button"
                className={`w-full rounded-lg border p-4 text-left transition ${realTeamUsage ? 'border-[#3355FF] bg-[#3355FF14]' : 'border-[#E2E4EA] bg-white'}`}
                onClick={() => {
                  setRealTeamUsage(true);
                  setGameTeamUsage(false);
                }}
              >
                <div className="flex items-start gap-3">
                  <span className={`mt-0.5 h-4 w-4 rounded-full border ${realTeamUsage ? 'border-[#3355FF] bg-[#3355FF] shadow-[inset_0_0_0_4px_white]' : 'border-[#E2E4EA] bg-white'}`} />
                  <span>
                    <span className="block text-sm font-semibold text-[#1B1F27]">実在のチームとして利用する</span>
                    <span className="mt-1 block text-xs text-[#6B7280]">実在のクラブ名・ロゴ・選手名などを扱う場合、権利者の許諾が必要になることがあります。</span>
                  </span>
                </div>
              </button>
              <button
                type="button"
                className={`w-full rounded-lg border p-4 text-left transition ${gameTeamUsage ? 'border-[#3355FF] bg-[#3355FF14]' : 'border-[#E2E4EA] bg-white'}`}
                onClick={() => {
                  setGameTeamUsage(true);
                  setRealTeamUsage(false);
                }}
              >
                <div className="flex items-start gap-3">
                  <span className={`mt-0.5 h-4 w-4 rounded-full border ${gameTeamUsage ? 'border-[#3355FF] bg-[#3355FF] shadow-[inset_0_0_0_4px_white]' : 'border-[#E2E4EA] bg-white'}`} />
                  <span>
                    <span className="block text-sm font-semibold text-[#1B1F27]">ゲーム内のチームとして利用する</span>
                    <span className="mt-1 block text-xs text-[#6B7280]">実在のチームを模したファン活動（パロディ）としてお楽しみいただけます。</span>
                  </span>
                </div>
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {activeSection === 'detail' ? (
        <div className="space-y-5">
          <div className={cardClass}>
            <div className="mb-5 flex items-center gap-2 text-sm font-bold">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#3355FF14] text-[11px] font-bold text-[#3355FF]">1</span>
              クラブ情報
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className={labelClass}>創立</Label>
            <Input
              placeholder="例: 1999年"
              className={inputClass}
              value={foundedYear}
              onChange={(e) => setFoundedYear(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className={labelClass}>ホームタウン</Label>
            <Input
              placeholder="例: 東京都"
              className={inputClass}
              value={hometown}
              onChange={(e) => setHometown(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className={labelClass}>スタジアム名</Label>
            <Input
              placeholder="例: ○○スタジアム"
              className={inputClass}
              value={stadiumName}
              onChange={(e) => setStadiumName(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className={labelClass}>収容人数</Label>
            <Input
              placeholder="例: 10,000"
              className={inputClass}
              inputMode="numeric"
              value={stadiumCapacity}
              onChange={(e) => setStadiumCapacity(e.target.value)}
            />
          </div>
            </div>

            <div className="mt-5 space-y-2">
              <Label className={labelClass}>スタジアム写真</Label>
              <div className="rounded-lg border border-dashed border-[#E2E4EA] bg-white p-4 transition hover:border-[#3355FF] hover:bg-[#3355FF14]">
                <ClubEmblemUploader value={stadiumPhotoUrl} onChange={(url) => setStadiumPhotoUrl(url || '')} />
              </div>
            </div>
          </div>

          <div className={cardClass}>
            <div className="mb-5 flex items-center gap-2 text-sm font-bold">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#3355FF14] text-[11px] font-bold text-[#3355FF]">2</span>
              獲得タイトル管理
            </div>
          <p className="mb-4 text-xs text-[#6B7280]">大会名と獲得シーズンを登録できます。</p>
          <div className="space-y-3">
            {clubTitles.map((item, index) => (
            <div key={index} className="grid grid-cols-1 gap-3 rounded-lg border border-[#E2E4EA] bg-[#F8F9FB] p-4">
              <div className="space-y-1">
                <Label className={labelClass}>大会名</Label>
                <Input
                  placeholder="例: ○○リーグ"
                  className={inputClass}
                  value={item.competitionName}
                  onChange={(e) => {
                    const next = [...clubTitles];
                    next[index] = { ...next[index], competitionName: e.target.value };
                    setClubTitles(next);
                  }}
                />
              </div>

              <div className="grid grid-cols-1 items-end gap-2 sm:grid-cols-[1fr_auto]">
                <div className="space-y-1">
                  <Label className={labelClass}>獲得シーズン（追加）</Label>
                  <Select
                    value={item.pendingSeason || ''}
                    onValueChange={(value) => {
                      const next = [...clubTitles];
                      next[index] = { ...next[index], pendingSeason: value };
                      setClubTitles(next);
                    }}
                  >
                    <SelectTrigger className={inputClass}>
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
                    className="h-10 rounded-lg border-[#E2E4EA] bg-white text-[#1B1F27] disabled:opacity-60"
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
                <Label className={labelClass}>登録済みシーズン</Label>
                {Array.isArray(item.seasons) && item.seasons.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {item.seasons
                      .slice()
                      .sort((a, b) => String(b).localeCompare(String(a)))
                      .map((s) => (
                        <div key={s} className="inline-flex items-center gap-2 rounded-full border border-[#E2E4EA] bg-white px-2 py-1 font-mono text-xs text-[#1B1F27]">
                          <span>{s}</span>
                          <button
                            type="button"
                            className="flex h-5 w-5 items-center justify-center rounded-full bg-[#D9302510] text-[#D93025]"
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
                  <div className="text-xs italic text-[#9CA3AF]">未登録</div>
                )}
              </div>

              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="outline"
                  className="border-[#D93025]/30 text-[#D93025] hover:bg-[#D9302510]"
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
            className="w-full border-dashed border-[#E2E4EA] bg-white text-[#1B1F27] disabled:opacity-60"
            onClick={() => setClubTitles([...clubTitles, { competitionName: '', seasons: [], pendingSeason: '' }])}
          >
            ＋ タイトルを追加
          </Button>
          </div>
        </div>
        </div>
      ) : null}
    </div>
  );
}
