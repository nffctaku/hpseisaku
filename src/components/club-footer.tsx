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
  clubName?: string;
  sponsors?: SponsorItem[];
  snsLinks?: SnsLinks;
  legalPages?: LegalPageItem[];
}

export function ClubFooter({ clubId, clubName, sponsors = [], snsLinks = {}, legalPages = [] }: ClubFooterProps) {
  return (
    <footer className="mt-auto" data-debug="club-footer-v2">
      <div className="bg-gray-900 text-gray-300 w-full">
        <div className="container mx-auto px-4 py-6">
          <div className="flex flex-col gap-4">
            <div className="text-center">
              <div className="text-sm font-semibold text-white">{clubName || clubId || ""}</div>

              {clubId && legalPages.length > 0 && (
                <div className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs">
                  {legalPages
                    .filter((p) => typeof p?.slug === "string" && p.slug.trim().length > 0)
                    .filter((p, index, arr) => arr.findIndex((x) => x.slug === p.slug) === index)
                    .map((p, index) => (
                      <Link
                        key={`${p.slug}-${index}`}
                        href={`/${clubId}/legal/${p.slug}`}
                        className="hover:text-white transition-colors whitespace-nowrap"
                      >
                        {p.title}
                      </Link>
                    ))}
                </div>
              )}
            </div>

            <div className="border-t border-gray-700 pt-4">
              <div className="flex flex-col items-center gap-3">
                <Image
                  src="/footballtop-logo-13 (1).png"
                  alt="footballtop"
                  width={160}
                  height={32}
                  className="h-6 w-auto"
                />

                <div className="text-center text-xs text-gray-300 leading-relaxed">
                  Footballに特化し
                  <br />
                  HPを作成出来るWEBアプリ
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
