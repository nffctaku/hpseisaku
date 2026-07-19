"use client";

import { useMemo, useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useClub } from '@/contexts/ClubContext';
import { auth, db } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { collection, getDocs, query, where, limit, doc, updateDoc, setDoc } from 'firebase/firestore';
import { SettingsTab } from './components/SettingsTab';
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

export default function ClubInfoPage() {
  const { user, refreshUserProfile } = useAuth();
  const { fetchClubInfo } = useClub();
  const [clubName, setClubName] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
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
          }
          if (typeof data.mainTeamLocked === 'boolean') {
            setMainTeamLocked(Boolean(data.mainTeamLocked));
          } else {
            setMainTeamLocked(false);
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
    <div className="min-h-screen pb-[104px]">
      <div className="mx-auto w-full max-w-[640px] px-5 py-8">
        <div className="mb-5">
          <h1 className="text-[22px] font-bold leading-tight">クラブ情報編集</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">基本設定、クラブ詳細、タイトル管理、SNSリンクを編集します。</p>
        </div>

        <Tabs defaultValue="settings" className="w-full">
          <TabsList className="mb-5 grid h-auto w-full grid-cols-2 gap-1 rounded-lg bg-[#F8F9FB] p-1">
            <TabsTrigger value="settings" className="rounded-md px-3 py-2 text-[13px] font-semibold text-[#6B7280] data-[state=active]:bg-[#3355FF] data-[state=active]:!text-white">クラブ設定</TabsTrigger>
            <TabsTrigger value="sns" className="rounded-md px-3 py-2 text-[13px] font-semibold text-[#6B7280] data-[state=active]:bg-[#3355FF] data-[state=active]:!text-white">SNSリンク</TabsTrigger>
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
              />
            </TabsContent>

            <TabsContent value="sns">
              <SnsTab snsLinks={snsLinks} setSnsLinks={setSnsLinks} />
            </TabsContent>
        </Tabs>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-[#E2E4EA] bg-white">
        <div className="mx-auto flex min-h-[72px] w-full max-w-[640px] items-center justify-between gap-4 px-5">
          <div className="font-mono text-xs text-[#9CA3AF]">{loading ? '保存中...' : 'すべて保存済みです'}</div>
          <Button
            onClick={handleUpdate}
            disabled={loading}
            className="h-10 rounded-lg bg-[#1F9D63] px-5 text-sm font-bold text-white hover:bg-[#188653]"
          >
            {loading ? '更新中...' : '更新する'}
          </Button>
        </div>
      </div>
    </div>
  );
}
