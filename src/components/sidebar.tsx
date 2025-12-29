"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useClub } from '@/contexts/ClubContext';
import { cn } from '@/lib/utils';
import { Trophy, Shield, Home, Newspaper, Tv, BarChart, Users, Calendar, Settings, CreditCard, LineChart } from 'lucide-react';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const { clubInfo } = useClub();
  const clubId = clubInfo.id || user?.clubId || null;

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

  const navItems = [
    { href: `/admin/club/info`, label: 'クラブ情報', icon: Settings },
    { href: `/admin/news`, label: 'ニュース管理', icon: Newspaper },
    { href: `/admin/tv`, label: 'TV管理', icon: Tv },
    { href: `/admin/records`, label: 'チーム記録', icon: BarChart },
    { href: `/admin/analysis`, label: '分析管理', icon: LineChart },
    { href: `/admin/matches`, label: '試合管理', icon: Calendar },
    { href: `/admin/friendly-matches`, label: '単発試合', icon: Calendar },
    { href: `/admin/players`, label: '選手管理', icon: Users },
    { href: `/admin/competitions`, label: '大会管理', icon: Trophy },
    { href: '/admin/teams', label: 'チーム登録', icon: Shield },
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

          return (
            <Link
              key={item.label}
              href={href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-gray-300 transition-all',
                'hover:bg-gray-700 hover:text-white', // Style for enabled link
                pathname.startsWith(item.href) && 'bg-gray-900 text-white' // Style for active link
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
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
