"use client";

import { useMemo, useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useClub } from '@/contexts/ClubContext';
import { auth, db } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import Image from 'next/image';
import { collection, getDocs, query, where, limit, doc, updateDoc, setDoc } from 'firebase/firestore';
import { SettingsTab } from './components/SettingsTab';
import { LayoutTab } from './components/LayoutTab';
import { TextsTab } from './components/TextsTab';
import { SnsTab } from './components/SnsTab';

interface TeamOption {
  id: string;
  name: string;
  logoUrl?: string;
}

interface LegalPageItem {
  title: string;
  slug: string;
  content: string;
}

interface ClubTitleItem {
  competitionName: string;
  seasons: string[];
  pendingSeason?: string;
}

const toSlashSeason = (season: string): string => {
  if (!season) return season;
  const s = String(season).trim();
  const mDash = s.match(/^(\d{4})-(\d{2})$/);
  if (mDash) return `${mDash[1]}/${mDash[2]}`;
  const mSlash = s.match(/^(\d{4})\/(\d{2})$/);
  if (mSlash) return `${mSlash[1]}/${mSlash[2]}`;
  return s;
};

const generateSeasonOptions = (): string[] => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const currentStart = month >= 7 ? year : year - 1;
  const out: string[] = [];
  for (let y = currentStart; y >= 1960; y -= 1) {
    out.push(`${y}/${String((y + 1) % 100).padStart(2, '0')}`);
  }
  return out;
};

const slugify = (value: string): string => {
  return value
    .trim()
    // 連続する空白をハイフンに変換し、それ以外の文字（日本語など）はそのまま残す
    .replace(/\s+/g, '-');
};

export default function ClubInfoPage() {
  const { user, refreshUserProfile } = useAuth();
  const { fetchClubInfo } = useClub();
  const isPro = user?.plan === "pro";
  const [clubName, setClubName] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [homeBgColor, setHomeBgColor] = useState<string>('');
  const [foundedYear, setFoundedYear] = useState<string>('');
  const [hometown, setHometown] = useState<string>('');
  const [stadiumName, setStadiumName] = useState<string>('');
  const [stadiumCapacity, setStadiumCapacity] = useState<string>('');
  const [stadiumPhotoUrl, setStadiumPhotoUrl] = useState<string>('');
  const [clubTitles, setClubTitles] = useState<ClubTitleItem[]>([]);
  const seasonOptions = useMemo(() => generateSeasonOptions(), []);
  const [loading, setLoading] = useState(false);
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string>('');
  const [layoutType, setLayoutType] = useState<string>('default');
  const [mainTeamLocked, setMainTeamLocked] = useState(false);
  const [snsLinks, setSnsLinks] = useState<{ x?: string; youtube?: string; tiktok?: string; instagram?: string }>({});
  const [legalPages, setLegalPages] = useState<LegalPageItem[]>([]);
  const [realTeamUsage, setRealTeamUsage] = useState<boolean>(false);
  const [gameTeamUsage, setGameTeamUsage] = useState<boolean>(false);
  const [transfersPublic, setTransfersPublic] = useState<boolean>(true);

  const syncClubProfileFromTeam = async (team: TeamOption, teamId: string) => {
    if (!user) return;

    const nextClubName = (team?.name || '').trim();
    const nextLogoUrl = (team?.logoUrl || '').trim();
    if (!nextClubName && !nextLogoUrl) return;

    try {
      const payload: Record<string, any> = {
        ownerUid: user.uid,
        mainTeamId: teamId,
      };
      if (nextClubName) payload.clubName = nextClubName;
      payload.logoUrl = nextLogoUrl ? nextLogoUrl : null;

      // uid doc
      await setDoc(doc(db, 'club_profiles', user.uid), payload, { merge: true });

      // any legacy docs where ownerUid == uid
      const profilesRef = collection(db, 'club_profiles');
      const qProfiles = query(profilesRef, where('ownerUid', '==', user.uid), limit(10));
      const snap = await getDocs(qProfiles);
      await Promise.all(
        snap.docs
          .filter((d) => d.id !== user.uid)
          .map((d) => setDoc(d.ref, payload, { merge: true }))
      );

      if (refreshUserProfile) {
        await refreshUserProfile();
      }
      if (fetchClubInfo) {
        await fetchClubInfo();
      }
    } catch (e) {
      console.error('Failed to auto sync club profile from team:', e);
    }
  };

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
          if (typeof data.realTeamUsage === 'boolean') {
            setRealTeamUsage(Boolean(data.realTeamUsage));
          }
          if (typeof data.gameTeamUsage === 'boolean') {
            setGameTeamUsage(Boolean(data.gameTeamUsage));
          }
          if (typeof data.transfersPublic === 'boolean') {
            setTransfersPublic(Boolean(data.transfersPublic));
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

          if (typeof data.foundedYear === 'string') {
            setFoundedYear(data.foundedYear);
          }
          if (typeof data.hometown === 'string') {
            setHometown(data.hometown);
          }
          if (typeof data.stadiumName === 'string') {
            setStadiumName(data.stadiumName);
          }
          if (typeof data.stadiumCapacity === 'string') {
            setStadiumCapacity(data.stadiumCapacity);
          }

          if (typeof data.stadiumPhotoUrl === 'string') {
            setStadiumPhotoUrl(data.stadiumPhotoUrl);
          }

          if (Array.isArray(data.clubTitles)) {
            setClubTitles(
              data.clubTitles.map((t: any) => ({
                competitionName: typeof t?.competitionName === 'string' ? t.competitionName : '',
                seasons: Array.isArray(t?.seasons)
                  ? (t.seasons as any[])
                      .map((s) => (typeof s === 'string' ? toSlashSeason(s) : ''))
                      .filter((s) => s.length > 0)
                  : typeof t?.season === 'string'
                    ? [toSlashSeason(t.season)]
                    : [],
                pendingSeason: '',
              }))
            );
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

        const candidateTeamId = selectedTeamId || teamsData[0]?.id || '';
        const candidateTeam = candidateTeamId ? teamsData.find((t) => t.id === candidateTeamId) : undefined;

        // 画面表示の初期値（クラブ設定未更新でも、チーム登録情報を自動反映）
        if (candidateTeam) {
          if (!clubName || clubName.trim().length === 0) {
            setClubName(candidateTeam.name || '');
          }
          if (!logoUrl || logoUrl.trim().length === 0) {
            setLogoUrl(candidateTeam.logoUrl || '');
          }
        }

        // メインチームが決まっている場合は、そのチームの名前とロゴをクラブ表示用にも反映する
        if (selectedTeamId) {
          const mainTeam = teamsData.find(t => t.id === selectedTeamId);
          if (mainTeam) {
            setClubName(mainTeam.name || '');
            setLogoUrl(mainTeam.logoUrl || '');
          }
        }

        // club_profiles が未設定のときは、初回だけ自動で同期する（更新ボタン不要）
        if (candidateTeam && user && (!user.clubName || !user.logoUrl)) {
          await syncClubProfileFromTeam(candidateTeam, candidateTeamId);
        }
      } catch (error) {
        console.error('Error fetching teams for club info:', error);
        toast.error('チーム一覧の取得に失敗しました。');
      }
    };

    fetchTeams();
  }, [user, selectedTeamId]);

  const handleUpdate = async () => {
    if (!user || !auth.currentUser) {
      toast.error('ログインしていません。');
      return;
    }

    if (!realTeamUsage && !gameTeamUsage) {
      toast.error('利用形態を選択してください。');
      return;
    }

    setLoading(true);
    try {
      const mainTeam = teams.find((t) => t.id === selectedTeamId);
      // 画面で設定したクラブロゴを最優先し、それが空の場合のみメインチームのロゴを使う
      const effectiveLogoUrl = (logoUrl && logoUrl.length > 0) ? logoUrl : (mainTeam?.logoUrl || '');
      const effectiveClubName = clubName && clubName.length > 0 ? clubName : (mainTeam?.name || '');

      const idToken = await auth.currentUser.getIdToken();
      const updateResponse = await fetch('/api/club/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          clubName: effectiveClubName,
          logoUrl: effectiveLogoUrl,
          layoutType,
          mainTeamId: selectedTeamId,
          realTeamUsage,
          gameTeamUsage,
          transfersPublic,
          snsLinks,
          legalPages,
          homeBgColor,
          foundedYear,
          hometown,
          stadiumName,
          stadiumCapacity,
          stadiumPhotoUrl,
          clubTitles: clubTitles.map((t) => ({
            competitionName: t.competitionName,
            seasons: Array.isArray(t.seasons)
              ? Array.from(new Set(t.seasons.map((s) => toSlashSeason(s)).filter((s) => s.length > 0))).sort((a, b) => b.localeCompare(a))
              : [],
          })),
        }),
      });

      if (!updateResponse.ok) {
        const data = await updateResponse.json();
        throw new Error(data.message || '更新に失敗しました。');
      }

      // メインチームのチーム情報も同期（IDで紐付けたまま、表示だけ更新）
      if (user && mainTeam && selectedTeamId) {
        try {
          const teamDocRef = doc(db, `clubs/${user.uid}/teams`, selectedTeamId);
          await updateDoc(teamDocRef, {
            name: effectiveClubName,
            logoUrl: effectiveLogoUrl,
          });
        } catch (syncError) {
          console.error('Failed to sync main team with club info:', syncError);
        }
      }

      toast.success('クラブ情報が更新されました。');
      
      if (refreshUserProfile) {
        await refreshUserProfile();
      }

      // ヘッダー左上のロゴ／クラブ名も最新の club_profiles / teams に合わせて更新
      if (fetchClubInfo) {
        await fetchClubInfo();
      }

    } catch (error: any) {
      toast.error(error.message || '更新中にエラーが発生しました。');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto py-10">
      <h1 className="text-2xl sm:text-3xl font-bold mb-6">クラブ情報編集</h1>
      <Card>
        <CardHeader>
          <CardTitle>クラブ情報編集</CardTitle>
          <CardDescription>クラブ設定・テキストページ・SNSリンクを編集します。</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="settings" className="w-full">
            <TabsList className="mb-4 w-full justify-start flex-wrap h-auto gap-1">
              <TabsTrigger value="settings" className="px-2 sm:px-3 text-xs sm:text-sm">クラブ設定</TabsTrigger>
              <TabsTrigger value="layout" className="px-2 sm:px-3 text-xs sm:text-sm">レイアウト</TabsTrigger>
              <TabsTrigger value="texts" className="px-2 sm:px-3 text-xs sm:text-sm">テキスト</TabsTrigger>
              <TabsTrigger value="sns" className="px-2 sm:px-3 text-xs sm:text-sm">SNSリンク</TabsTrigger>
            </TabsList>

            <TabsContent value="settings">
              <SettingsTab
                teams={teams}
                selectedTeamId={selectedTeamId}
                setSelectedTeamId={setSelectedTeamId}
                mainTeamLocked={mainTeamLocked}
                realTeamUsage={realTeamUsage}
                setRealTeamUsage={setRealTeamUsage}
                gameTeamUsage={gameTeamUsage}
                setGameTeamUsage={setGameTeamUsage}
                transfersPublic={transfersPublic}
                setTransfersPublic={setTransfersPublic}
                logoUrl={logoUrl}
                foundedYear={foundedYear}
                setFoundedYear={setFoundedYear}
                hometown={hometown}
                setHometown={setHometown}
                stadiumName={stadiumName}
                setStadiumName={setStadiumName}
                stadiumCapacity={stadiumCapacity}
                setStadiumCapacity={setStadiumCapacity}
                stadiumPhotoUrl={stadiumPhotoUrl}
                setStadiumPhotoUrl={setStadiumPhotoUrl}
                clubTitles={clubTitles}
                setClubTitles={setClubTitles}
                seasonOptions={seasonOptions}
                toSlashSeason={toSlashSeason}
                isPro={isPro}
                loading={loading}
                onUpdate={handleUpdate}
              />
            </TabsContent>

            <TabsContent value="layout">
              <LayoutTab homeBgColor={homeBgColor} setHomeBgColor={setHomeBgColor} />
            </TabsContent>

            <TabsContent value="texts">
              <TextsTab legalPages={legalPages} setLegalPages={setLegalPages} slugify={slugify} />
            </TabsContent>

            <TabsContent value="sns">
              <SnsTab snsLinks={snsLinks} setSnsLinks={setSnsLinks} />
            </TabsContent>
          </Tabs>
        </CardContent>
        <CardFooter>
          <div className="w-full flex justify-center">
            <Button
              onClick={handleUpdate}
              disabled={loading}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
            {loading ? '更新中...' : '更新する'}
            </Button>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}
