"use client";

import Link from "next/link";
import Image from 'next/image';
import { Menu, Moon, Sun } from 'lucide-react';
import { AuthButton } from "./auth-button";
import { useTheme } from "next-themes";

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
  const { theme, resolvedTheme, setTheme } = useTheme();
  const isDark = (resolvedTheme || theme) === "dark";

  return (
    <header className="bg-background text-foreground p-4 flex justify-between items-center border-b border-border/60">
      <div className="flex items-center">
        {isAdminPage ? (
          <div className="flex items-center space-x-2 text-xl font-bold">
            {logoUrl && (
              <Image src={logoUrl} alt={clubName || 'Club Logo'} width={32} height={32} className="rounded-full object-contain" />
            )}
          </div>
        ) : (
          <Link href={homePath} className="flex items-center space-x-2 text-xl font-bold">
            {logoUrl && (
              <Image src={logoUrl} alt={clubName || 'Club Logo'} width={32} height={32} className="rounded-full object-contain" />
            )}
            <span>{clubName || 'CLUB'}</span>
          </Link>
        )}
      </div>
      <nav className="hidden md:flex items-center space-x-6">
        {navLinks}
        <button
          type="button"
          onClick={() => setTheme(isDark ? "light" : "dark")}
          className="inline-flex items-center justify-center rounded-md border border-border/60 p-2 hover:bg-muted/40"
          aria-label="テーマ切替"
        >
          {isDark ? <Sun size={18} /> : <Moon size={18} />}
        </button>
        <AuthButton />
      </nav>
      <div className="md:hidden flex items-center gap-3">
        <button
          type="button"
          onClick={() => setTheme(isDark ? "light" : "dark")}
          className="inline-flex items-center justify-center rounded-md border border-border/60 p-2 hover:bg-muted/40"
          aria-label="テーマ切替"
        >
          {isDark ? <Sun size={18} /> : <Moon size={18} />}
        </button>
        {isAdminPage && <AuthButton />}
        <button onClick={onMenuClick} className="ml-1">
          <Menu size={24} />
        </button>
      </div>

      {isMenuOpen && !isAdminPage && (
        <div className="md:hidden absolute top-16 left-0 w-full bg-background z-50 border-t border-border/60">
          <nav className="flex flex-col items-center space-y-4 p-4">
            {navLinks}
            <div className="w-full pt-4 border-t border-border/60">
              <AuthButton isMobile={true} />
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
