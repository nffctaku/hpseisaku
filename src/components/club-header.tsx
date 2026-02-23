"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Loader2, Menu, Moon, Share2, Sun, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { FaXTwitter, FaYoutube, FaTiktok, FaInstagram } from "react-icons/fa6";
import { toast } from "sonner";
import { useTheme } from "next-themes";

interface ClubHeaderProps {
  clubId: string;
  clubName?: string;
  logoUrl?: string | null;
  headerForeground?: "auto" | "light" | "dark";
  headerBackgroundColor?: string;
  snsLinks?: {
    x?: string;
    youtube?: string;
    tiktok?: string;
    instagram?: string;
  };
}

function parseColorToRgb(input: string): { r: number; g: number; b: number } | null {
  const v = input.trim();

  const hexMatch = v.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hexMatch) {
    const hex = hexMatch[1];
    if (hex.length === 3) {
      const r = parseInt(hex[0] + hex[0], 16);
      const g = parseInt(hex[1] + hex[1], 16);
      const b = parseInt(hex[2] + hex[2], 16);
      return { r, g, b };
    }
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return { r, g, b };
  }

  const rgbMatch = v.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(\d*\.?\d+)\s*)?\)$/i);
  if (rgbMatch) {
    const r = Math.min(255, Math.max(0, Number(rgbMatch[1])));
    const g = Math.min(255, Math.max(0, Number(rgbMatch[2])));
    const b = Math.min(255, Math.max(0, Number(rgbMatch[3])));
    return { r, g, b };
  }

  return null;
}

function isDarkColor(input: string): boolean | null {
  const rgb = parseColorToRgb(input);
  if (!rgb) return null;
  const { r, g, b } = rgb;
  const srgb = [r, g, b].map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  const luminance = 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
  return luminance < 0.5;
}

export function ClubHeader({
  clubId,
  clubName,
  logoUrl,
  headerForeground = "auto",
  headerBackgroundColor,
  snsLinks,
}: ClubHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [navigatingTo, setNavigatingTo] = useState<string | null>(null);
  const [partnersEnabled, setPartnersEnabled] = useState(false);
  const [resolvedClubName, setResolvedClubName] = useState<string | undefined>(clubName);
  const [resolvedLogoUrl, setResolvedLogoUrl] = useState<string | null | undefined>(logoUrl);
  const [resolvedSnsLinks, setResolvedSnsLinks] = useState<ClubHeaderProps['snsLinks']>(snsLinks);
  const [resolvedHeaderBackgroundColor, setResolvedHeaderBackgroundColor] = useState<string | undefined>(
    typeof headerBackgroundColor === 'string' ? headerBackgroundColor : undefined
  );
  const [menuSettings, setMenuSettings] = useState<{
    menuShowNews: boolean;
    menuShowTv: boolean;
    menuShowClub: boolean;
    menuShowTransfers: boolean;
    menuShowMatches: boolean;
    menuShowTable: boolean;
    menuShowStats: boolean;
    menuShowSquad: boolean;
    menuShowPartner: boolean;
  }>({
    menuShowNews: true,
    menuShowTv: true,
    menuShowClub: true,
    menuShowTransfers: true,
    menuShowMatches: true,
    menuShowTable: true,
    menuShowStats: true,
    menuShowSquad: true,
    menuShowPartner: true,
  });
  const pathname = usePathname();
  const { theme, resolvedTheme, setTheme } = useTheme();

  const isNavigating = navigatingTo != null;
  const isDark = (resolvedTheme || theme) === "dark";

  const computedForeground = (() => {
    if (headerForeground === "light") return "text-white";
    if (headerForeground === "dark") return "text-black";

    if (resolvedHeaderBackgroundColor) {
      const bgIsDark = isDarkColor(resolvedHeaderBackgroundColor);
      if (bgIsDark === true) return "text-white";
      if (bgIsDark === false) return "text-black";
    }

    return isDark ? "text-white" : "text-black";
  })();

  const menuIsDark = (() => {
    if (resolvedHeaderBackgroundColor) {
      const bgIsDark = isDarkColor(resolvedHeaderBackgroundColor);
      if (bgIsDark != null) return bgIsDark;
    }
    return true;
  })();

  const menuTextClass = menuIsDark ? "text-white" : "text-black";
  const menuBorderClass = menuIsDark ? "border-white/15" : "border-black/15";
  const menuIconBgClass = menuIsDark ? "bg-white/5" : "bg-black/5";
  const menuBgStyle = resolvedHeaderBackgroundColor
    ? ({ backgroundColor: resolvedHeaderBackgroundColor } as const)
    : ({ backgroundColor: "#000" } as const);

  useEffect(() => {
    setResolvedClubName(clubName);
  }, [clubName]);

  useEffect(() => {
    setResolvedLogoUrl(logoUrl);
  }, [logoUrl]);

  useEffect(() => {
    setResolvedSnsLinks(snsLinks);
  }, [snsLinks]);

  useEffect(() => {
    setResolvedHeaderBackgroundColor(typeof headerBackgroundColor === 'string' ? headerBackgroundColor : undefined);
  }, [headerBackgroundColor]);

  useEffect(() => {
    let cancelled = false;

    const needsFallback =
      !resolvedClubName ||
      resolvedClubName.trim().length === 0 ||
      resolvedClubName === 'クラブ名未設定' ||
      resolvedClubName === clubId ||
      !resolvedLogoUrl;

    if (!needsFallback) return;

    const run = async () => {
      try {
        const res = await fetch(`/api/club-summary/${encodeURIComponent(clubId)}`, {
          method: 'GET',
          cache: 'no-store',
        });
        if (!res.ok) return;
        const json = (await res.json()) as any;
        if (cancelled) return;

        const profile = (json?.profile || {}) as any;
        const nextName = typeof profile?.clubName === 'string' ? profile.clubName : undefined;
        const nextLogo = typeof profile?.logoUrl === 'string' ? profile.logoUrl : undefined;
        const nextBg = typeof profile?.homeBgColor === 'string' ? profile.homeBgColor : undefined;
        const nextSns = (profile?.snsLinks || json?.snsLinks) as any;

        if (nextName && (!resolvedClubName || resolvedClubName === clubId)) {
          setResolvedClubName(nextName);
        }
        if (nextLogo && !resolvedLogoUrl) {
          setResolvedLogoUrl(nextLogo);
        }
        if (nextBg && !resolvedHeaderBackgroundColor) {
          setResolvedHeaderBackgroundColor(nextBg);
        }
        if (nextSns && !resolvedSnsLinks) {
          setResolvedSnsLinks(nextSns);
        }
      } catch {
        // ignore
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [clubId, resolvedClubName, resolvedLogoUrl, resolvedHeaderBackgroundColor, resolvedSnsLinks]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const res = await fetch(`/api/public/club/${encodeURIComponent(clubId)}/partners-enabled`, {
          method: "GET",
          cache: "no-store",
        });
        if (!res.ok) return;
        const json = (await res.json()) as any;
        if (cancelled) return;
        setPartnersEnabled(Boolean(json?.enabled));
      } catch {
        // ignore
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [clubId]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const res = await fetch(`/api/public/club/${encodeURIComponent(clubId)}/menu-settings`, {
          method: "GET",
          cache: "no-store",
        });
        if (!res.ok) return;
        const json = (await res.json()) as any;
        if (cancelled) return;
        const s = (json?.settings || {}) as any;
        setMenuSettings({
          menuShowNews: s.menuShowNews !== false,
          menuShowTv: s.menuShowTv !== false,
          menuShowClub: s.menuShowClub !== false,
          menuShowTransfers: s.menuShowTransfers !== false,
          menuShowMatches: s.menuShowMatches !== false,
          menuShowTable: s.menuShowTable !== false,
          menuShowStats: s.menuShowStats !== false,
          menuShowSquad: s.menuShowSquad !== false,
          menuShowPartner: s.menuShowPartner !== false,
        });
      } catch {
        // ignore
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [clubId]);

  const navLinkClass = (active: boolean, disabled: boolean) =>
    `${active ? "text-primary" : ""} ${disabled ? "opacity-60 pointer-events-none" : ""} hover:text-primary transition-colors inline-flex items-center gap-1.5`;

  const handleShare = async () => {
    try {
      const url = typeof window !== "undefined" ? window.location.href : "";
      if (!url) return;

      const title = resolvedClubName || clubName || "クラブ";
      const text = `${title}のHP`;

      if (typeof (navigator as any)?.share === "function") {
        await (navigator as any).share({ title, text, url });
        return;
      }

      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        toast.success("URLをコピーしました");
        return;
      }

      const ta = document.createElement("textarea");
      ta.value = url;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      toast.success("URLをコピーしました");
    } catch {
      toast.error("共有に失敗しました");
    }
  };

  return (
    <header
      className={`w-full border-b border-border/60 relative z-20 ${computedForeground} ${
        resolvedHeaderBackgroundColor ? "" : "bg-background/80 backdrop-blur"
      }`}
      style={resolvedHeaderBackgroundColor ? { backgroundColor: resolvedHeaderBackgroundColor } : undefined}
    >
      <div className="container mx-auto px-3 sm:px-4 py-2.5 sm:py-3 flex items-center justify-between gap-3 sm:gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Link href={`/${clubId}`} className="w-9 h-9 sm:w-10 sm:h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center overflow-hidden">
            {resolvedLogoUrl ? (
              <Image
                src={resolvedLogoUrl}
                alt={resolvedClubName || clubName || "Club emblem"}
                width={48}
                height={48}
                className="object-contain"
              />
            ) : (
              <span className="text-xs text-muted-foreground">LOGO</span>
            )}
          </Link>
          <div className="flex flex-col min-w-0">
            <span className="text-xs sm:text-sm md:text-lg font-semibold leading-tight max-w-[8rem] xs:max-w-[10rem] sm:max-w-none truncate">
              {resolvedClubName || clubName || "クラブ名未設定"}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 text-[11px] sm:text-xs md:text-sm">
          <button
            type="button"
            className="p-2 flex items-center justify-center hover:opacity-80"
            onClick={() => setTheme(isDark ? "light" : "dark")}
            aria-label="テーマ切替"
          >
            {isDark ? <Sun className="w-5 h-5" strokeWidth={2.2} /> : <Moon className="w-5 h-5" strokeWidth={2.2} />}
          </button>

          <button
            type="button"
            className="p-2 flex items-center justify-center hover:opacity-80"
            onClick={handleShare}
            aria-label="共有"
          >
            <Share2 className="w-5 h-5" strokeWidth={2.2} />
          </button>

          {/* Mobile hamburger */}
          <button
            type="button"
            className="sm:hidden p-2 flex items-center justify-center hover:opacity-80 relative z-30"
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((prev) => !prev);
            }}
            aria-label="メニューを開く"
          >
            <Menu className="w-5 h-5" strokeWidth={2.2} />
          </button>

          {/* Desktop navigation */}
          <nav className="hidden sm:flex items-center gap-2.5 sm:gap-4 md:gap-6">
            {menuSettings.menuShowNews && (
              <Link
                href={`/${clubId}/news`}
                className={navLinkClass(pathname?.startsWith(`/${clubId}/news`) ?? false, isNavigating)}
                onClick={() => setNavigatingTo(`/${clubId}/news`)}
              >
                News
              </Link>
            )}
            {menuSettings.menuShowTv && (
              <Link
                href={`/${clubId}/tv`}
                className={navLinkClass(pathname?.startsWith(`/${clubId}/tv`) ?? false, isNavigating)}
                onClick={() => setNavigatingTo(`/${clubId}/tv`)}
              >
                TV
              </Link>
            )}
            {menuSettings.menuShowClub && (
              <Link
                href={`/${clubId}/club`}
                className={navLinkClass(pathname?.startsWith(`/${clubId}/club`) ?? false, isNavigating)}
                onClick={() => setNavigatingTo(`/${clubId}/club`)}
              >
                Club
              </Link>
            )}
            {menuSettings.menuShowTransfers && (
              <Link
                href={`/${clubId}/transfers`}
                className={navLinkClass(pathname?.startsWith(`/${clubId}/transfers`) ?? false, isNavigating)}
                onClick={() => setNavigatingTo(`/${clubId}/transfers`)}
              >
                Transfers
              </Link>
            )}
            {menuSettings.menuShowMatches && (
              <Link
                href={`/${clubId}/results`}
                className={navLinkClass(pathname?.startsWith(`/${clubId}/results`) ?? false, isNavigating)}
                onClick={() => setNavigatingTo(`/${clubId}/results`)}
              >
                Matches
              </Link>
            )}
            {menuSettings.menuShowTable && (
              <Link
                href={`/${clubId}/table`}
                className={navLinkClass(pathname?.startsWith(`/${clubId}/table`) ?? false, isNavigating)}
                onClick={() => setNavigatingTo(`/${clubId}/table`)}
              >
                Table
              </Link>
            )}
            {menuSettings.menuShowStats && (
              <Link
                href={`/${clubId}/stats`}
                className={navLinkClass(pathname?.startsWith(`/${clubId}/stats`) ?? false, isNavigating)}
                onClick={() => setNavigatingTo(`/${clubId}/stats`)}
              >
                Stats
              </Link>
            )}
            {menuSettings.menuShowSquad && (
              <Link
                href={`/${clubId}/players`}
                className={navLinkClass(pathname?.startsWith(`/${clubId}/players`) ?? false, isNavigating)}
                onClick={() => setNavigatingTo(`/${clubId}/players`)}
              >
                Squad
              </Link>
            )}

            {partnersEnabled && menuSettings.menuShowPartner && (
              <Link
                href={`/${clubId}/partner`}
                className={navLinkClass(pathname?.startsWith(`/${clubId}/partner`) ?? false, isNavigating)}
                onClick={() => setNavigatingTo(`/${clubId}/partner`)}
              >
                Partner
              </Link>
            )}

            {isNavigating && (
              <span className="inline-flex items-center text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
              </span>
            )}
          </nav>
        </div>
      </div>

      {/* Mobile dropdown menu */}
      {menuOpen && (
        <div className={`sm:hidden fixed inset-0 z-50 ${menuTextClass} pointer-events-auto`} style={menuBgStyle}>
          <div className="h-full w-full overflow-y-auto">
            <div className="container mx-auto px-4 pt-4 pb-8">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <div className={`w-16 h-16 rounded-full overflow-hidden ${menuIconBgClass} flex items-center justify-center`}>
                    {resolvedLogoUrl ? (
                      <Image
                        src={resolvedLogoUrl}
                        alt={resolvedClubName || clubName || "Club emblem"}
                        width={64}
                        height={64}
                        className="object-contain"
                      />
                    ) : null}
                  </div>
                  <div className="text-sm font-semibold tracking-wide leading-tight truncate max-w-[12rem]">{resolvedClubName || clubName || ""}</div>
                </div>

                <button
                  type="button"
                  className="p-2 hover:opacity-80"
                  onClick={() => setMenuOpen(false)}
                  aria-label="メニューを閉じる"
                >
                  <X className="w-6 h-6" strokeWidth={2.2} />
                </button>
              </div>

              <nav className="mt-8">
                <div className="flex flex-col">
                  {[
                    menuSettings.menuShowNews ? { href: `/${clubId}/news`, label: "News" } : null,
                    menuSettings.menuShowTv ? { href: `/${clubId}/tv`, label: "TV" } : null,
                    menuSettings.menuShowClub ? { href: `/${clubId}/club`, label: "Club" } : null,
                    menuSettings.menuShowTransfers ? { href: `/${clubId}/transfers`, label: "Transfers" } : null,
                    menuSettings.menuShowMatches ? { href: `/${clubId}/results`, label: "Matches" } : null,
                    menuSettings.menuShowTable ? { href: `/${clubId}/table`, label: "Table" } : null,
                    menuSettings.menuShowStats ? { href: `/${clubId}/stats`, label: "Stats" } : null,
                    menuSettings.menuShowSquad ? { href: `/${clubId}/players`, label: "Squad" } : null,
                    partnersEnabled && menuSettings.menuShowPartner ? { href: `/${clubId}/partner`, label: "Partner" } : null,
                  ].filter(Boolean)
                    .map((item) => (
                      <Link
                        key={(item as any).href}
                        href={(item as any).href}
                        className="py-3 text-lg font-black tracking-wide hover:opacity-80 transition-opacity"
                        onClick={() => {
                          setNavigatingTo((item as any).href);
                          setMenuOpen(false);
                        }}
                      >
                        {(item as any).label}
                      </Link>
                    ))}
                </div>
              </nav>

              {resolvedSnsLinks && (resolvedSnsLinks.x || resolvedSnsLinks.youtube || resolvedSnsLinks.tiktok || resolvedSnsLinks.instagram) && (
                <div className={`mt-10 pt-6 border-t ${menuBorderClass} flex justify-center gap-4`}>
                  {resolvedSnsLinks.youtube && (
                    <Link
                      href={resolvedSnsLinks.youtube}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`w-10 h-10 rounded-full ${menuIconBgClass} flex items-center justify-center`}
                    >
                      <FaYoutube className="w-5 h-5" />
                    </Link>
                  )}
                  {resolvedSnsLinks.x && (
                    <Link
                      href={resolvedSnsLinks.x}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`w-10 h-10 rounded-full ${menuIconBgClass} flex items-center justify-center`}
                    >
                      <FaXTwitter className="w-4 h-4" />
                    </Link>
                  )}
                  {resolvedSnsLinks.tiktok && (
                    <Link
                      href={resolvedSnsLinks.tiktok}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`w-10 h-10 rounded-full ${menuIconBgClass} flex items-center justify-center`}
                    >
                      <FaTiktok className="w-4 h-4" />
                    </Link>
                  )}
                  {resolvedSnsLinks.instagram && (
                    <Link
                      href={resolvedSnsLinks.instagram}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`w-10 h-10 rounded-full ${menuIconBgClass} flex items-center justify-center`}
                    >
                      <FaInstagram className="w-4 h-4" />
                    </Link>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
