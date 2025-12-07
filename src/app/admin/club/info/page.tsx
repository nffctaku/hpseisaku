"use client";

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { auth, db } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { ClubEmblemUploader } from '@/components/club-emblem-uploader';
import Image from 'next/image';
import { collection, getDocs, query, where, limit } from 'firebase/firestore';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface TeamOption {
  id: string;
  name: string;
  logoUrl?: string;
}

interface SponsorItem {
  imageUrl: string;
  linkUrl: string;
}

interface LegalPageItem {
  title: string;
  slug: string;
  content: string;
}

const slugify = (value: string): string => {
  return value
    .trim()
    // 連続する空白をハイフンに変換し、それ以外の文字（日本語など）はそのまま残す
    .replace(/\s+/g, '-');
};

export default function ClubInfoPage() {
  const { user, refreshUserProfile } = useAuth();
  const isPro = user?.plan === "pro";
  const [clubName, setClubName] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [homeBgColor, setHomeBgColor] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string>('');
  const [layoutType, setLayoutType] = useState<string>('default');
  const [mainTeamLocked, setMainTeamLocked] = useState(false);
  const [sponsors, setSponsors] = useState<SponsorItem[]>([]);
  const [snsLinks, setSnsLinks] = useState<{ x?: string; youtube?: string; tiktok?: string; instagram?: string }>({});
  const [legalPages, setLegalPages] = useState<LegalPageItem[]>([]);

  useEffect(() => {
    if (user) {
      setClubName(user.clubName || '');
      setLogoUrl(user.logoUrl || '');
      if (user.layoutType && typeof user.layoutType === 'string') {
        setLayoutType(user.layoutType);
      }
    }
  }, [user]);

  // Load existing mainTeamId from club_profiles to lock selection after first set
  useEffect(() => {
    const loadMainTeam = async () => {
      if (!user) return;
      try {
        const profilesRef = collection(db, 'club_profiles');
        const qProfiles = query(profilesRef, where('ownerUid', '==', user.uid), limit(1));
        const snap = await getDocs(qProfiles);
        if (!snap.empty) {
          const data = snap.docs[0].data() as any;
          if (data.mainTeamId) {
            setSelectedTeamId(data.mainTeamId as string);
            setMainTeamLocked(true);
          }
          if (Array.isArray(data.sponsors)) {
            setSponsors(
              data.sponsors.map((s: any) => ({
                imageUrl: typeof s.imageUrl === 'string' ? s.imageUrl : '',
                linkUrl: typeof s.linkUrl === 'string' ? s.linkUrl : '',
              }))
            );
          }
          if (data.snsLinks && typeof data.snsLinks === 'object') {
            setSnsLinks({
              x: data.snsLinks.x || '',
              youtube: data.snsLinks.youtube || '',
              tiktok: data.snsLinks.tiktok || '',
              instagram: data.snsLinks.instagram || '',
            });
          }

          if (Array.isArray(data.legalPages)) {
            setLegalPages(
              data.legalPages.map((p: any) => ({
                title: typeof p.title === 'string' ? p.title : '',
                slug: typeof p.slug === 'string' ? p.slug : '',
                content: typeof p.content === 'string' ? p.content : '',
              }))
            );
          }

          if (typeof data.homeBgColor === 'string') {
            setHomeBgColor(data.homeBgColor);
          }
        }
      } catch (error) {
        console.error('Error loading main team for club info:', error);
        toast.error('クラブの自チーム情報の取得に失敗しました。');
      }
    };

    loadMainTeam();
  }, [user]);

  useEffect(() => {
    const fetchTeams = async () => {
      if (!user) return;

      try {
        const teamsQueryRef = query(collection(db, `clubs/${user.uid}/teams`));
        const teamsSnap = await getDocs(teamsQueryRef);
        const teamsData: TeamOption[] = teamsSnap.docs.map(doc => ({
          id: doc.id,
          name: (doc.data().name as string) || doc.id,
          logoUrl: doc.data().logoUrl as string | undefined,
        }));
        teamsData.sort((a, b) => a.name.localeCompare(b.name));
        setTeams(teamsData);
      } catch (error) {
        console.error('Error fetching teams for club info:', error);
        toast.error('チーム一覧の取得に失敗しました。');
      }
    };

    fetchTeams();
  }, [user]);

  const handleUpdate = async () => {
    if (!user || !auth.currentUser) {
      toast.error('ログインしていません。');
      return;
    }

    setLoading(true);
    try {
      const mainTeam = teams.find((t) => t.id === selectedTeamId);
      const effectiveLogoUrl = mainTeam?.logoUrl || logoUrl;

      const idToken = await auth.currentUser.getIdToken();
      const updateResponse = await fetch('/api/club/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({ clubName, logoUrl: effectiveLogoUrl, layoutType, mainTeamId: selectedTeamId, sponsors, snsLinks, legalPages, homeBgColor }),
      });

      if (!updateResponse.ok) {
        const data = await updateResponse.json();
        throw new Error(data.message || '更新に失敗しました。');
      }

      toast.success('クラブ情報が更新されました。');
      
      if (refreshUserProfile) {
        await refreshUserProfile();
      }

    } catch (error: any) {
      toast.error(error.message || '更新中にエラーが発生しました。');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto py-10">
      <h1 className="text-3xl font-bold mb-6">クラブ情報編集</h1>
      <Card>
        <CardHeader>
          <CardTitle>クラブ設定</CardTitle>
          <CardDescription>クラブ名とロゴを編集します。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>自チームを選択</Label>
            {mainTeamLocked ? (
              <div>
                <div className="w-full rounded-md border bg-white text-gray-900 px-3 py-2 text-sm">
                  {teams.find(t => t.id === selectedTeamId)?.name || '未設定'}
                </div>
          <div className="space-y-2 pt-4 border-t">
            <Label htmlFor="homeBgColor">HPトップ背景色</Label>
            <p className="text-xs text-muted-foreground mb-1">下の色から選択してください。</p>
            <div className="flex flex-wrap gap-3 items-center">
              {[
                '#ffffff', // 白（デフォルト）
                '#0b1f3b', // 紺
                '#60a5fa', // 水色
                '#facc15', // 黄色
                '#ef4444', // 赤
                '#7f1d1d', // 暗めの赤
                '#16a34a', // 緑
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
                <div
                  className="w-10 h-6 rounded border"
                  style={{ backgroundColor: homeBgColor || '#ffffff' }}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">クラブのHPトップ全体の背景色を変更できます。未選択の場合は標準の背景色になります。</p>
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
                    {teams.map(team => (
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
          <div className="space-y-2">
            <Label htmlFor="layoutType">表示レイアウト</Label>
            <div className="w-full rounded-md border bg-white text-gray-900 px-3 py-2 text-sm">
              標準レイアウト
            </div>
            <p className="text-xs text-muted-foreground">
              現在は標準レイアウトのみ利用できます。今後プランに応じてレイアウトが追加される予定です。
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="clubName">クラブ名</Label>
            <Input 
              id="clubName" 
              value={clubName}
              disabled
            />
            <p className="text-xs text-muted-foreground">クラブ名はチーム管理側で設定された情報を表示しており、この画面からは変更できません。</p>
          </div>
          <div className="space-y-2">
            <Label>ロゴ画像</Label>
            <div className="w-24 h-24 border rounded-lg bg-white flex items-center justify-center overflow-hidden">
              {logoUrl ? (
                <Image src={logoUrl} alt="クラブロゴ" width={96} height={96} className="object-contain" />
              ) : (
                <span className="text-xs text-muted-foreground">ロゴ未設定</span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">ロゴ画像はチーム／大会管理で設定されたエンブレムを使用し、この画面からは変更できません。</p>
          </div>
          <div className="space-y-2 pt-4 border-t">
            <Label>スポンサー</Label>
            <p className="text-xs text-muted-foreground">HP下部に表示するスポンサーのロゴとリンク先URLを設定します。</p>
            <div className="space-y-3">
              {sponsors.map((sponsor, index) => (
                <div key={index} className="space-y-3 rounded-md border p-3 bg-white/60">
                  <div className="w-full max-w-xs">
                    <ClubEmblemUploader
                      value={sponsor.imageUrl}
                      onChange={(url) => {
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
          <div className="space-y-2 pt-4 border-t">
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
          <div className="space-y-2 pt-4 border-t">
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
        </CardContent>
        <CardFooter>
          <Button onClick={handleUpdate} disabled={loading}>
            {loading ? '更新中...' : '更新する'}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
