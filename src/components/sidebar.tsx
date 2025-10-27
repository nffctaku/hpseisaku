"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { Trophy, Shield, Home, Newspaper, Tv, BarChart, Users, Calendar, Settings } from 'lucide-react';

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const clubId = user?.clubId;

  const navItems = [
    { href: `/admin/club/info`, label: 'クラブ情報', icon: Settings, requiredClub: true },
    { href: `/admin/news`, label: 'ニュース管理', icon: Newspaper, requiredClub: true },
    { href: `/admin/tv`, label: 'TV管理', icon: Tv, requiredClub: true },
    { href: `/admin/records`, label: 'チーム記録', icon: BarChart, requiredClub: true },
    { href: `/admin/players`, label: '選手管理', icon: Users, requiredClub: true },
    { href: `/admin/stats`, label: 'スタッツ管理', icon: BarChart, requiredClub: true },
    { href: `/admin/matches`, label: '試合管理', icon: Calendar, requiredClub: true },
    { href: `/admin/competitions`, label: '大会管理', icon: Trophy, requiredClub: true },
    { href: '/admin/teams', label: 'チーム登録', icon: Shield, requiredClub: false },
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
      <nav className="flex flex-col space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          // A link is disabled if it requires a clubId and it's not available yet.
          const isDisabled = item.requiredClub && !clubId;
          // Adjust href for disabled links to prevent navigation.
          const href = isDisabled ? '#' : item.href;

          return (
            <Link
              key={item.label}
              href={href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-gray-300 transition-all',
                isDisabled
                  ? 'cursor-not-allowed text-gray-500' // Style for disabled link
                  : 'hover:bg-gray-700 hover:text-white', // Style for enabled link
                !isDisabled && pathname.startsWith(item.href) && 'bg-gray-900 text-white' // Style for active link
              )}
              aria-disabled={isDisabled}
              onClick={(e) => {
                if (isDisabled) {
                  e.preventDefault(); // Prevent navigation for disabled links
                }
              }}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
