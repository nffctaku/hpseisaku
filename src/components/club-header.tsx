"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Menu } from "lucide-react";
import { FaXTwitter, FaYoutube, FaTiktok, FaInstagram } from "react-icons/fa6";

interface ClubHeaderProps {
  clubId: string;
  clubName?: string;
  logoUrl?: string | null;
  snsLinks?: {
    x?: string;
    youtube?: string;
    tiktok?: string;
    instagram?: string;
  };
}

export function ClubHeader({ clubId, clubName, logoUrl, snsLinks }: ClubHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="w-full border-b border-border/60 bg-background/80 backdrop-blur relative z-20">
      <div className="container mx-auto px-3 sm:px-4 py-2.5 sm:py-3 flex items-center justify-between gap-3 sm:gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Link href={`/${clubId}`} className="w-9 h-9 sm:w-10 sm:h-10 md:w-12 md:h-12 rounded-full bg-white flex items-center justify-center overflow-hidden border border-border">
            {logoUrl ? (
              <Image
                src={logoUrl}
                alt={clubName || "Club emblem"}
                width={48}
                height={48}
                className="object-contain"
              />
            ) : (
              <span className="text-xs text-muted-foreground">LOGO</span>
            )}
          </Link>
          <div className="flex flex-col min-w-0">
            <span className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wider">CLUB</span>
            <span className="text-xs sm:text-sm md:text-lg font-semibold leading-tight max-w-[8rem] xs:max-w-[10rem] sm:max-w-none truncate">
              {clubName || "クラブ名未設定"}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 text-[11px] sm:text-xs md:text-sm">
          {/* Mobile hamburger */}
          <button
            type="button"
            className="sm:hidden p-2 flex items-center justify-center hover:opacity-80"
            onClick={() => setMenuOpen((prev) => !prev)}
            aria-label="メニューを開く"
          >
            <Menu className="w-5 h-5" strokeWidth={2.2} />
          </button>

          {/* Desktop navigation */}
          <nav className="hidden sm:flex items-center gap-2.5 sm:gap-4 md:gap-6">
            <Link href={`/${clubId}/news`} className="hover:text-primary transition-colors">
              News
            </Link>
            <Link href={`/${clubId}/tv`} className="hover:text-primary transition-colors">
              TV
            </Link>
            <Link href={`/${clubId}/club`} className="hover:text-primary transition-colors">
              Club
            </Link>
            <Link href={`/${clubId}/results`} className="hover:text-primary transition-colors">
              Matches
            </Link>
            <Link href={`/${clubId}/table`} className="hover:text-primary transition-colors">
              Table
            </Link>
            <Link href={`/${clubId}/stats`} className="hover:text-primary transition-colors">
              Stats
            </Link>
            <Link href={`/${clubId}/players`} className="hover:text-primary transition-colors">
              Squad
            </Link>
          </nav>
        </div>
      </div>

      {/* Mobile dropdown menu */}
      {menuOpen && (
        <div className="sm:hidden border-t border-border/60 bg-black text-white">
          <nav className="container mx-auto px-3 py-4 flex flex-col gap-2 text-base text-center">
            <Link
              href={`/${clubId}/news`}
              className="py-4 rounded hover:bg-white/10 transition-colors"
              onClick={() => setMenuOpen(false)}
            >
              News
            </Link>
            <Link
              href={`/${clubId}/tv`}
              className="py-4 rounded hover:bg-white/10 transition-colors"
              onClick={() => setMenuOpen(false)}
            >
              TV
            </Link>
            <Link
              href={`/${clubId}/club`}
              className="py-4 rounded hover:bg-white/10 transition-colors"
              onClick={() => setMenuOpen(false)}
            >
              Club
            </Link>
            <Link
              href={`/${clubId}/results`}
              className="py-4 rounded hover:bg-white/10 transition-colors"
              onClick={() => setMenuOpen(false)}
            >
              Matches
            </Link>
            <Link
              href={`/${clubId}/table`}
              className="py-4 rounded hover:bg-white/10 transition-colors"
              onClick={() => setMenuOpen(false)}
            >
              Table
            </Link>
            <Link
              href={`/${clubId}/stats`}
              className="py-4 rounded hover:bg-white/10 transition-colors"
              onClick={() => setMenuOpen(false)}
            >
              Stats
            </Link>
            <Link
              href={`/${clubId}/players`}
              className="py-4 rounded hover:bg-white/10 transition-colors"
              onClick={() => setMenuOpen(false)}
            >
              Squad
            </Link>
            {snsLinks && (snsLinks.x || snsLinks.youtube || snsLinks.tiktok || snsLinks.instagram) && (
              <div className="mt-3 pt-3 border-t border-border/60 flex justify-center gap-4 text-white">
                {snsLinks.youtube && (
                  <Link href={snsLinks.youtube} target="_blank" rel="noopener noreferrer" className="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center">
                    <FaYoutube className="w-5 h-5" />
                  </Link>
                )}
                {snsLinks.x && (
                  <Link href={snsLinks.x} target="_blank" rel="noopener noreferrer" className="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center">
                    <FaXTwitter className="w-4 h-4" />
                  </Link>
                )}
                {snsLinks.tiktok && (
                  <Link href={snsLinks.tiktok} target="_blank" rel="noopener noreferrer" className="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center">
                    <FaTiktok className="w-4 h-4" />
                  </Link>
                )}
                {snsLinks.instagram && (
                  <Link href={snsLinks.instagram} target="_blank" rel="noopener noreferrer" className="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center">
                    <FaInstagram className="w-4 h-4" />
                  </Link>
                )}
              </div>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
