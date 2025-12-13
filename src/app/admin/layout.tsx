"use client";

import { useState, ReactNode } from 'react';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { useAuth } from '@/contexts/AuthContext';
import { ClubProvider, useClub } from '@/contexts/ClubContext';
import { AuthButton } from '@/components/auth-button';
import Link from 'next/link';
import Image from 'next/image';

function AdminLayoutContent({ children }: { children: ReactNode }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const { user } = useAuth();
  const { clubInfo } = useClub();
  
  const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);

  // 未ログイン時は、管理画面の代わりにログイン画面を表示
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white px-4">
        <div className="max-w-sm w-full text-center space-y-4">
          <h1 className="text-2xl font-bold">ログインまたは新規作成</h1>
          <p className="text-sm text-gray-300">
            Googleアカウントでログインすると、この画面からクラブや大会の管理を始められます。
          </p>
          <div className="flex justify-center mt-4">
            <AuthButton />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen w-screen bg-gray-900 text-white">
      {/* Sidebar for mobile (overlay) */}
      <div
        className={`fixed inset-0 z-30 bg-black/60 transition-opacity duration-300 md:hidden ${isSidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={toggleSidebar}
      />
      <div className={`fixed inset-y-0 left-0 z-40 w-64 transform transition-transform duration-300 md:hidden ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <Sidebar />
      </div>

      {/* Sidebar for desktop (static) */}
      <div className="hidden md:block w-64 flex-shrink-0">
        <Sidebar />
      </div>

      <div className="flex flex-col flex-1 w-full">
        <Header 
          logoUrl={clubInfo.logoUrl || user?.logoUrl}
          clubName={clubInfo.clubName || user?.clubName}
          homePath={user ? `/admin/club/${user.uid}` : '/admin'}
          navLinks={null} // No nav links in admin header
          onMenuClick={toggleSidebar}
          isMenuOpen={isSidebarOpen}
          isAdminPage={true}
        />
        <main className="flex-1 w-full p-4 pb-24 sm:p-6 sm:pb-24 md:p-8 md:pb-8 overflow-y-auto overflow-x-hidden">
          {children}
        </main>
        <footer className="border-t border-gray-800 px-4 sm:px-6 md:px-8 py-4 text-xs text-gray-400">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex flex-wrap justify-center sm:justify-start gap-x-4 gap-y-1">
              <Link
                href="https://www.footballtop.net/terms"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-white transition-colors whitespace-nowrap"
              >
                利用規約
              </Link>
              <Link
                href="https://www.locofootball.com/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-white transition-colors whitespace-nowrap"
              >
                プライバシーポリシー
              </Link>
              <Link
                href="/tokusho"
                className="hover:text-white transition-colors whitespace-nowrap"
              >
                特定商取引法に基づく表記
              </Link>
            </div>
            <div className="flex items-center justify-center sm:justify-end gap-2">
              <span className="text-[10px] text-gray-500">Powered by</span>
              <Image
                src="/footballtop-logo-13 (1).png"
                alt="footballtop"
                width={120}
                height={24}
                className="h-5 w-auto"
              />
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <ClubProvider>
      <AdminLayoutContent>{children}</AdminLayoutContent>
    </ClubProvider>
  );
}
