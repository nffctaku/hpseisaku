"use client";

import { useState, ReactNode } from 'react';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { useAuth } from '@/contexts/AuthContext';
import { ClubProvider, useClub } from '@/contexts/ClubContext';
import { AuthButton } from '@/components/auth-button';

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
    <div className="flex h-screen bg-gray-900 text-white">
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

      <div className="flex flex-col flex-1 overflow-hidden">
        <Header 
          logoUrl={clubInfo.logoUrl}
          clubName={clubInfo.clubName}
          homePath={user ? `/admin/club/${user.uid}` : '/admin'}
          navLinks={null} // No nav links in admin header
          onMenuClick={toggleSidebar}
          isMenuOpen={isSidebarOpen}
          isAdminPage={true}
        />
        <main className="flex-1 p-4 sm:p-6 md:p-8 overflow-y-auto">
          {children}
        </main>
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
