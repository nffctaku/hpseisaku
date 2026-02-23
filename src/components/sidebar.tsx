"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useClub } from '@/contexts/ClubContext';
import { cn } from '@/lib/utils';
import {
  ArrowLeftRight,
  Trophy,
  Shield,
  Home,
  Newspaper,
  Tv,
  Users,
  Calendar,
  Settings,
  CreditCard,
  LineChart,
  BookOpen,
  Mail,
  LayoutGrid,
} from 'lucide-react';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { db } from '@/lib/firebase';
import { collection, doc, getDoc, getDocs, query, where, limit, setDoc } from 'firebase/firestore';

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const { clubInfo } = useClub();
  const clubId = clubInfo.id || user?.clubId || user?.uid || null;

  const canManagePartners =
    user?.uid === 'gNDzHTPlzVZK8cOl7ogxQBRvugH2' ||
    Boolean(user?.ownerUid && user?.uid && user.uid === user.ownerUid);

  const [mainTeamId, setMainTeamId] = useState<string | null>(null);

  const bookletHref = mainTeamId
    ? `/admin/teams/${mainTeamId}/booklet`
    : '/admin/teams';

  const transfersHref = mainTeamId
    ? `/admin/teams/${mainTeamId}/transfers`
    : '/admin/teams';

  useEffect(() => {
    const run = async () => {
      const clubUid = user?.uid;
      if (!clubUid) {
        setMainTeamId(null);
        return;
      }

      try {
        const clubProfileByUidRef = doc(db, 'club_profiles', clubUid);

        // Prefer docId == uid schema
        const byUidSnap = await getDoc(clubProfileByUidRef);
        if (byUidSnap.exists()) {
          const data = byUidSnap.data() as any;
          const next = typeof data?.mainTeamId === 'string' ? String(data.mainTeamId).trim() : '';
          if (next) {
            setMainTeamId(next);
            return;
          }
        }

        // Fallback: ownerUid == uid schema
        const ownerQuery = query(collection(db, 'club_profiles'), where('ownerUid', '==', clubUid), limit(1));
        const ownerSnap = await getDocs(ownerQuery);
        if (!ownerSnap.empty) {
          const data = ownerSnap.docs[0].data() as any;
          const next = typeof data?.mainTeamId === 'string' ? String(data.mainTeamId).trim() : '';
          if (next) {
            setMainTeamId(next);
            return;
          }
        }

        // Final fallback: if exactly one team exists, treat it as main team
        const teamsSnap = await getDocs(query(collection(db, `clubs/${clubUid}/teams`), limit(2)));
        if (teamsSnap.size === 1) {
          const onlyTeamId = teamsSnap.docs[0].id;
          setMainTeamId(onlyTeamId);

          // Persist to club_profiles for stability
          try {
            const payload = { ownerUid: clubUid, mainTeamId: onlyTeamId };
            await setDoc(clubProfileByUidRef, payload, { merge: true });
            if (!ownerSnap.empty) {
              const ownerDocRef = ownerSnap.docs[0].ref;
              if (ownerDocRef.id !== clubUid) {
                await setDoc(ownerDocRef, payload, { merge: true });
              }
            }
          } catch (e) {
            console.warn('[Sidebar] failed to persist auto mainTeamId', e);
          }

          return;
        }

        setMainTeamId(null);
      } catch (e) {
        console.warn('[Sidebar] failed to load mainTeamId', e);
        setMainTeamId(null);
      }
    };

    void run();
  }, [user?.uid]);

  console.log('[Sidebar] club id debug', {
    clubInfo,
    userClubId: user?.clubId,
    resolvedClubId: clubId,
  });

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      window.location.href = '/';
    } catch (error) {
      console.error('Error signing out from sidebar', error);
    }
  };

  const TransfersIcon = ({ className }: { className?: string }) => {
    return (
      <ArrowLeftRight className={className} />
    );
  };

  const navItems: Array<{ href: string; label: string; icon: any; external?: boolean; disabled?: boolean }> = [
    { href: `/admin/club/info`, label: 'クラブ情報', icon: Settings },
    { href: `/admin/news`, label: 'ニュース管理', icon: Newspaper },
    { href: `/admin/tv`, label: 'TV管理', icon: Tv },
    { href: `/admin/design`, label: 'デザイン', icon: LayoutGrid },
    { href: `/admin/partners`, label: 'パートナー管理', icon: Shield, disabled: !canManagePartners },
    { href: `/admin/analysis`, label: '分析管理', icon: LineChart },
    { href: transfersHref, label: '移籍管理', icon: TransfersIcon },
    { href: `/admin/matches`, label: '試合管理', icon: Calendar },
    { href: `/admin/friendly-matches`, label: '単発試合', icon: Calendar },
    { href: `/admin/players`, label: '選手管理', icon: Users },
    { href: bookletHref, label: '選手名鑑', icon: BookOpen },
    { href: `/admin/competitions`, label: '大会管理', icon: Trophy },
    { href: '/admin/teams', label: 'チーム登録', icon: Shield },
    { href: 'https://forms.gle/YkvqAt14GivwrurBA', label: '問合せ', icon: Mail, external: true },
    { href: `/admin/plan`, label: 'プラン', icon: CreditCard },
  ];

  return (
    <aside className="w-64 bg-gray-800 p-4 flex flex-col">
      <h2 className="text-white text-xl font-bold mb-4">管理メニュー</h2>
      {clubId && (
        <Link
          href={`/${clubId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 rounded-lg bg-blue-600 px-3 py-2 text-white transition-all hover:bg-blue-700 mb-4"
        >
          <Home className="h-4 w-4 flex-shrink-0" />
          <span className="truncate min-w-0">HP表示</span>
        </Link>
      )}
      <nav className="flex flex-col space-y-1 flex-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const href = item.href;
          const isExternal = Boolean((item as any).external);
          const isDisabled = Boolean((item as any).disabled);

          return (
            isExternal ? (
              <a
                key={item.label}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-gray-300 transition-all',
                  'hover:bg-gray-700 hover:text-white'
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </a>
            ) : isDisabled ? (
              <div
                key={item.label}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-gray-400 transition-all',
                  'opacity-60 cursor-not-allowed'
                )}
                aria-disabled="true"
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </div>
            ) : (
              <Link
                key={item.label}
                href={href}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-gray-300 transition-all',
                  'hover:bg-gray-700 hover:text-white',
                  pathname.startsWith(item.href) && 'bg-gray-900 text-white'
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            )
          );
        })}
      </nav>
      <button
        type="button"
        onClick={handleSignOut}
        className="mt-4 w-full rounded-lg px-3 py-2 text-left text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
      >
        ログアウト
      </button>
    </aside>
  );
}
