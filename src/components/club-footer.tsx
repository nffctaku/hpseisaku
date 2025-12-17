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
  const hasSns = Boolean(snsLinks.x || snsLinks.youtube || snsLinks.tiktok || snsLinks.instagram);
  const hasLegal = Boolean(clubId && legalPages.length > 0);

  if (sponsors.length === 0 && !hasSns && !hasLegal) return null;

  return (
    <footer className="mt-12 border-t border-border bg-white">
      <div className="container mx-auto px-4 py-8 space-y-8">
        {sponsors.length > 0 && (
          <div className="flex flex-col items-center gap-4">
            <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">PARTNERS</span>
            <div className="flex flex-wrap justify-center gap-4 md:gap-6">
              {sponsors.map((sponsor, idx) => (
                <Link
                  key={idx}
                  href={sponsor.linkUrl || "#"}
                  target={sponsor.linkUrl ? "_blank" : undefined}
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center rounded-md bg-background p-1 shadow-sm border hover:shadow-md transition-shadow w-[160px] h-[72px]"
                >
                  {sponsor.imageUrl ? (
                    <div className="relative w-full h-full">
                      <Image
                        src={sponsor.imageUrl}
                        alt={`スポンサー${idx + 1}`}
                        fill
                        className="object-contain"
                      />
                    </div>
                  ) : (
                    <span className="text-[10px] text-muted-foreground">NO LOGO</span>
                  )}
                </Link>
              ))}
            </div>
          </div>
        )}

        {hasSns && (
          <div className="flex flex-col items-center gap-4">
            <div className="flex items-center gap-4">
              {snsLinks.youtube && (
                <Link href={snsLinks.youtube} target="_blank" rel="noopener noreferrer" className="w-9 h-9 rounded-full bg-background flex items-center justify-center text-foreground hover:bg-primary hover:text-primary-foreground transition-colors">
                  <FaYoutube className="w-5 h-5" />
                </Link>
              )}
              {snsLinks.x && (
                <Link href={snsLinks.x} target="_blank" rel="noopener noreferrer" className="w-9 h-9 rounded-full bg-background flex items-center justify-center text-foreground hover:bg-primary hover:text-primary-foreground transition-colors">
                  <FaXTwitter className="w-4 h-4" />
                </Link>
              )}
              {snsLinks.tiktok && (
                <Link href={snsLinks.tiktok} target="_blank" rel="noopener noreferrer" className="w-9 h-9 rounded-full bg-background flex items-center justify-center text-foreground hover:bg-primary hover:text-primary-foreground transition-colors">
                  <FaTiktok className="w-4 h-4" />
                </Link>
              )}
              {snsLinks.instagram && (
                <Link href={snsLinks.instagram} target="_blank" rel="noopener noreferrer" className="w-9 h-9 rounded-full bg-background flex items-center justify-center text-foreground hover:bg-primary hover:text-primary-foreground transition-colors">
                  <FaInstagram className="w-4 h-4" />
                </Link>
              )}
            </div>
          </div>
        )}

        {hasLegal && clubId && (
          <div className="border-t border-border/60 pt-4 flex flex-wrap justify-center gap-4 text-[11px] text-muted-foreground">
            {legalPages.map((page, idx) => (
              <Link
                key={idx}
                href={`/${clubId}/p/${page.slug}`}
                className="hover:text-primary transition-colors"
              >
                {page.title || page.slug}
              </Link>
            ))}
          </div>
        )}
      </div>
    </footer>
  );
}
