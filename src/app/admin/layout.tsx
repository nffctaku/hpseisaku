"use client";

import { useEffect, useState, ReactNode } from 'react';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { useAuth } from '@/contexts/AuthContext';
import { ClubProvider, useClub } from '@/contexts/ClubContext';
import { AuthButton } from '@/components/auth-button';
import Link from 'next/link';
import Image from 'next/image';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { useRouter, usePathname } from 'next/navigation';

function AdminLayoutContent({ children }: { children: ReactNode }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const { user } = useAuth();
  const { clubInfo } = useClub();
  const [tosChecked, setTosChecked] = useState(false);
  const [tosLoading, setTosLoading] = useState(false);
  const [tosOpen, setTosOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  const allowHorizontalScroll = (pathname || '').includes('/booklet');

  const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);

  useEffect(() => {
    const checkConsent = async () => {
      if (!user?.uid) return;
      setTosLoading(true);
      try {
        const tosVersion = '2025-12-30';
        const ref = doc(db, 'user_consents', user.uid);
        const snap = await getDoc(ref);
        const data = snap.exists() ? (snap.data() as any) : null;
        const accepted = Boolean(data?.tosAcceptedAt) && String(data?.tosVersion || '') === tosVersion;
        setTosOpen(!accepted);
      } catch (e) {
        console.error('[AdminLayout] failed to check tos consent', e);
        setTosOpen(true);
      } finally {
        setTosLoading(false);
      }
    };
    void checkConsent();
  }, [user?.uid]);

  const handleAcceptTos = async () => {
    if (!user?.uid) return;
    if (!tosChecked) return;
    setTosLoading(true);
    try {
      const tosVersion = '2025-12-30';
      const ref = doc(db, 'user_consents', user.uid);
      await setDoc(
        ref,
        {
          tosVersion,
          tosAcceptedAt: serverTimestamp(),
        },
        { merge: true }
      );
      setTosOpen(false);
    } catch (e) {
      console.error('[AdminLayout] failed to accept tos', e);
    } finally {
      setTosLoading(false);
    }
  };

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
    <div className="flex min-h-screen w-full bg-gray-900 text-white">
      <Dialog open={tosOpen} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-lg" onPointerDownOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>利用規約への同意</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-sm text-slate-700">
            <p>
              サービスの利用を開始するには、利用規約に同意してください。
            </p>
            <div className="flex items-start gap-3">
              <Checkbox
                checked={tosChecked}
                onCheckedChange={(v) => setTosChecked(Boolean(v))}
                className="border-slate-400 bg-white data-[state=checked]:bg-sky-600 data-[state=checked]:text-white"
              />
              <p className="leading-relaxed">
                <Link href="/terms" className="underline text-sky-700 hover:text-sky-800" target="_blank" rel="noreferrer">
                  利用規約
                </Link>
                <span>と</span>
                <Link href="/privacy" className="underline text-sky-700 hover:text-sky-800" target="_blank" rel="noreferrer">
                  プライバシーポリシー
                </Link>
                <span>に同意します。</span>
              </p>
            </div>
            <Button
              type="button"
              className="w-full"
              disabled={!tosChecked || tosLoading}
              onClick={handleAcceptTos}
            >
              同意して開始
            </Button>
          </div>
        </DialogContent>
      </Dialog>
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

      <div className="flex flex-col flex-1 w-full min-w-0">
        <Header 
          logoUrl={clubInfo.logoUrl || user?.logoUrl}
          clubName={clubInfo.clubName || user?.clubName}
          homePath={user ? `/admin/club/${user.uid}` : '/admin'}
          navLinks={null} // No nav links in admin header
          onMenuClick={toggleSidebar}
          isMenuOpen={isSidebarOpen}
          isAdminPage={true}
        />
        <main
          className={`flex-1 w-full p-4 pb-24 sm:p-6 sm:pb-24 md:p-8 md:pb-8 overflow-y-auto ${
            allowHorizontalScroll ? 'overflow-x-auto' : 'overflow-x-hidden'
          }`}
        >
          {children}
        </main>
        <footer className="border-t border-gray-800 px-4 sm:px-6 md:px-8 py-4 text-xs text-gray-400">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex flex-wrap justify-center sm:justify-start gap-x-4 gap-y-1">
              <Link href="/terms" className="hover:text-white transition-colors whitespace-nowrap">
                利用規約
              </Link>
              <Link href="/privacy" className="hover:text-white transition-colors whitespace-nowrap">
                プライバシーポリシー
              </Link>
              <Link href="/tokusho" className="hover:text-white transition-colors whitespace-nowrap">
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
