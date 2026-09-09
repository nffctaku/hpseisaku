"use client";

import Link from "next/link";
import Image from 'next/image';
import { Menu, ArrowLeft } from 'lucide-react';
import { AuthButton } from "./auth-button";

export interface HeaderProps {
  logoUrl?: string | null;
  clubName?: string | null;
  homePath: string;
  navLinks: React.ReactNode;
  onMenuClick: () => void;
  isMenuOpen: boolean;
  isAdminPage?: boolean;
  compact?: boolean;
  menuOnly?: boolean;
  backHref?: string;
  backLabel?: string;
}

export function Header({
  logoUrl,
  clubName,
  homePath,
  navLinks,
  onMenuClick,
  isMenuOpen,
  isAdminPage = false,
  compact = false,
  menuOnly = false,
  backHref,
  backLabel,
}: HeaderProps) {
  return (
    <header className={`${menuOnly ? 'relative bg-transparent px-4 py-3' : `bg-gray-900 px-2 ${compact ? 'py-3' : 'py-6'} sm:px-4`} text-white flex justify-between items-center`}>
      {menuOnly && logoUrl && (
        <div className="absolute left-4 top-1/2 h-8 w-8 -translate-y-1/2 overflow-hidden rounded-full">
          <Image src={logoUrl} alt={clubName || 'Club Logo'} fill className="object-contain" sizes="32px" />
        </div>
      )}
      {menuOnly && backHref && (
        <Link href={backHref} className="flex items-center gap-1 text-xs font-bold text-white/80 transition hover:text-white">
          <ArrowLeft className="h-4 w-4" />
          {backLabel}
        </Link>
      )}
      {!menuOnly && (
        <div className="flex items-center">
          {isAdminPage ? (
            <div className="flex items-center space-x-2 text-xl font-bold">
              {logoUrl && (
                <Image src={logoUrl} alt={clubName || 'Club Logo'} width={48} height={48} className="rounded-full object-contain" />
              )}
            </div>
          ) : (
            <Link href={homePath} className="flex items-center space-x-2 text-xl font-bold">
              {logoUrl && (
                <Image src={logoUrl} alt={clubName || 'Club Logo'} width={48} height={48} className="rounded-full object-contain" />
              )}
              <span>{clubName || 'CLUB'}</span>
            </Link>
          )}
        </div>
      )}
      {!menuOnly && (
        <nav className="hidden md:flex items-center space-x-6">
          {navLinks}
          <AuthButton />
        </nav>
      )}
      <div className={`${menuOnly ? 'ml-auto' : 'md:hidden'} flex items-center gap-3`}>
        {!menuOnly && isAdminPage && <AuthButton />}
        <button onClick={onMenuClick} className={menuOnly ? "ml-1 p-2" : "ml-1 rounded-full bg-black/35 p-2 ring-1 ring-white/20 backdrop-blur"}>
          <Menu size={24} />
        </button>
      </div>

      {isMenuOpen && !isAdminPage && (
        <div className="md:hidden absolute top-16 left-0 w-full bg-gray-900 z-50">
          <nav className="flex flex-col items-center space-y-4 p-4">
            {navLinks}
            <div className="w-full pt-4 border-t border-gray-700">
              <AuthButton isMobile={true} />
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
