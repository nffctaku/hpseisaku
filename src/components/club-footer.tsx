"use client";

import Image from "next/image";
import Link from "next/link";
import { FaXTwitter, FaYoutube, FaTiktok, FaInstagram } from "react-icons/fa6";

interface SponsorItem {
  imageUrl: string;
  linkUrl: string;
}

interface SnsLinks {
  x?: string;
  youtube?: string;
  tiktok?: string;
  instagram?: string;
}

interface LegalPageItem {
  title: string;
  slug: string;
}

interface ClubFooterProps {
  clubId?: string;
  sponsors?: SponsorItem[];
  snsLinks?: SnsLinks;
  legalPages?: LegalPageItem[];
}

export function ClubFooter({ clubId, sponsors = [], snsLinks = {}, legalPages = [] }: ClubFooterProps) {
  return (
    <footer className="mt-auto">
      <div className="bg-gray-900 text-gray-300 w-screen relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw]">
        <div className="container mx-auto px-4 py-4 text-xs">
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
              <Link href="/tokusho" className="hover:text-white transition-colors whitespace-nowrap">
                特定商取引法に基づく表記
              </Link>
            </div>
            <div className="flex items-center justify-center sm:justify-end gap-2">
              <span className="text-[10px] text-gray-400">Powered by</span>
              <Image
                src="/footballtop-logo-13 (1).png"
                alt="footballtop"
                width={120}
                height={24}
                className="h-5 w-auto"
              />
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
