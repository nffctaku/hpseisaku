"use client";

import { usePathname } from 'next/navigation';
import { Header } from "@/components/header";
import { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';

function ConditionalHeader() {
  const pathname = usePathname();
  const { user } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const clubId = user?.clubId;

  const navLinks = (
    <>
      <Link href={clubId ? `/${clubId}/news` : '/news'} className="hover:text-gray-300" onClick={() => setIsMenuOpen(false)}>NEWS</Link>
      <Link href={clubId ? `/${clubId}/tv` : '/tv'} className="hover:text-gray-300" onClick={() => setIsMenuOpen(false)}>CLUB TV</Link>
      <Link href={clubId ? `/${clubId}/club` : '/club'} className="hover:text-gray-300" onClick={() => setIsMenuOpen(false)}>CLUB</Link>
      <Link href={clubId ? `/${clubId}/results` : '/results'} className="hover:text-gray-300" onClick={() => setIsMenuOpen(false)}>MATCH</Link>
      <Link href={clubId ? `/${clubId}/table` : '/table'} className="hover:text-gray-300" onClick={() => setIsMenuOpen(false)}>TABLE</Link>
      <Link href={clubId ? `/${clubId}/players` : '/players'} className="hover:text-gray-300" onClick={() => setIsMenuOpen(false)}>PLAYERS</Link>
      {user && (
        <Link href="/admin/club" className="hover:text-gray-300" onClick={() => setIsMenuOpen(false)}>管理画面へ</Link>
      )}
    </>
  );

  if (pathname.startsWith('/admin')) {
    return null;
  }

  return (
    <Header 
      logoUrl={user?.logoUrl}
      clubName={user?.clubName}
      homePath={clubId ? `/${clubId}` : '/'}
      navLinks={navLinks}
      onMenuClick={() => setIsMenuOpen(!isMenuOpen)}
      isMenuOpen={isMenuOpen}
      isAdminPage={false}
    />
  );
}

export default function LayoutClientWrapper({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ConditionalHeader />
      {children}
    </>
  );
}
