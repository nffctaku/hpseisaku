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
  gameTeamUsage?: boolean;
}

export function ClubFooter({
  clubId,
  clubName,
  sponsors = [],
  snsLinks = {},
  legalPages = [],
  gameTeamUsage,
}: ClubFooterProps) {
  return (
    <footer className="mt-auto" data-debug="club-footer-v2">
      <div className="bg-gray-900 text-gray-300 w-full">
        <div className="container mx-auto px-4 py-6">
          <div className="flex flex-col gap-4">
            <div className="text-center">
              {sponsors.length > 0 && (
                <div className="mb-3 flex flex-wrap justify-center gap-3">
                  {sponsors
                    .filter((s) => typeof s?.imageUrl === "string" && s.imageUrl.trim().length > 0)
                    .map((s, index) => (
                      <Link
                        key={`${s.imageUrl}-${index}`}
                        href={s.linkUrl || "#"}
                        target={s.linkUrl ? "_blank" : undefined}
                        rel={s.linkUrl ? "noopener noreferrer" : undefined}
                        className="inline-flex items-center justify-center"
                      >
                        <Image
                          src={s.imageUrl}
                          alt={`sponsor-${index + 1}`}
                          width={240}
                          height={80}
                          className="h-16 w-auto object-contain"
                        />
                      </Link>
                    ))}
                </div>
              )}
              <div className="text-[10px] font-semibold text-white whitespace-normal break-words leading-snug">
                {gameTeamUsage ? (
                  <>
                    このチームは実在のチームを模した
                    <br className="sm:hidden" />
                    ファン活動（パロディ）として利用しています。
                  </>
                ) : (
                  clubName || clubId || ""
                )}
              </div>

              {!clubId && (
                <div className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs">
                  <Link href="/terms" className="hover:text-white transition-colors whitespace-nowrap">
                    利用規約
                  </Link>
                  <Link href="/tokusho" className="hover:text-white transition-colors whitespace-nowrap">
                    特定商取引法に基づく表記
                  </Link>
                </div>
              )}

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
                <Link href="/" className="inline-flex items-center justify-center">
                  <Image
                    src="/footballtop-logo-13 (1).png"
                    alt="footballtop"
                    width={160}
                    height={32}
                    className="h-6 w-auto"
                  />
                </Link>

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
