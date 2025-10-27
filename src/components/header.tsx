"use client";

import Link from "next/link";
import Image from 'next/image';
import { Menu } from 'lucide-react';
import { AuthButton } from "./auth-button";

export interface HeaderProps {
  logoUrl?: string | null;
  clubName?: string | null;
  homePath: string;
  navLinks: React.ReactNode;
  onMenuClick: () => void;
  isMenuOpen: boolean;
  isAdminPage?: boolean;
}

export function Header({
  logoUrl,
  clubName,
  homePath,
  navLinks,
  onMenuClick,
  isMenuOpen,
  isAdminPage = false
}: HeaderProps) {
  return (
    <header className="bg-gray-900 text-white p-4 flex justify-between items-center">
      <div className="flex items-center">
        <Link href={homePath} className="flex items-center space-x-2 text-xl font-bold">
          {logoUrl && (
            <Image src={logoUrl} alt={clubName || 'Club Logo'} width={32} height={32} className="rounded-full object-contain" />
          )}
          <span>{clubName || 'CLUB'}</span>
        </Link>
      </div>
      <nav className="hidden md:flex items-center space-x-6">
        {navLinks}
        <AuthButton />
      </nav>
      <div className="md:hidden flex items-center">
        <button onClick={onMenuClick} className="ml-4">
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
