"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { useClub } from "@/contexts/ClubContext";
import { db } from "@/lib/firebase";
import { SystemAnnouncement } from "@/components/system-announcement";
import {
  ArrowLeftRight,
  BookOpen,
  Calendar,
  CreditCard,
  Home,
  LineChart,
  Mail,
  Newspaper,
  Settings,
  Shield,
  Tv,
  Trophy,
  Users,
  LayoutGrid,
  Eye,
  Share2,
  History,
  Copy,
  Image as ImageIcon,
} from "lucide-react";
import { collection, doc, getDoc, getDocs, limit, query, setDoc, where } from "firebase/firestore";
import { toast } from "sonner";
import { FaXTwitter } from "react-icons/fa6";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function AdminHomePage() {
  const { user } = useAuth();
  const { clubInfo } = useClub();

  const clubId = clubInfo.id || user?.clubId || user?.uid || null;
  const [mainTeamId, setMainTeamId] = useState<string | null>(null);
  const [draftNewsCount, setDraftNewsCount] = useState(0);
  const [unreadMailCount, setUnreadMailCount] = useState(0);

  const adsenseClient = (process.env.NEXT_PUBLIC_ADSENSE_CLIENT || "").trim();
  const adsenseSlotAdminHome = (process.env.NEXT_PUBLIC_ADSENSE_SLOT_ADMIN_HOME || "").trim();
  const shouldShowAdminHomeAd = Boolean(adsenseClient && adsenseSlotAdminHome);

  const isPro = user?.plan === "pro";

  const OGP_CACHE_BUSTER = "20260122";
  const SHARE_TEXT = "FootChronでチームHPを公開しました";

  useEffect(() => {
    const run = async () => {
      const clubUid = user?.uid;
      if (!clubUid) {
        setMainTeamId(null);
        return;
      }

      try {
        const clubProfileByUidRef = doc(db, "club_profiles", clubUid);

        const byUidSnap = await getDoc(clubProfileByUidRef);
        if (byUidSnap.exists()) {
          const data = byUidSnap.data() as any;
          const next = typeof data?.mainTeamId === "string" ? String(data.mainTeamId).trim() : "";
          if (next) {
            setMainTeamId(next);
            return;
          }
        }

        const ownerQuery = query(collection(db, "club_profiles"), where("ownerUid", "==", clubUid), limit(1));
        const ownerSnap = await getDocs(ownerQuery);
        if (!ownerSnap.empty) {
          const data = ownerSnap.docs[0].data() as any;
          const next = typeof data?.mainTeamId === "string" ? String(data.mainTeamId).trim() : "";
          if (next) {
            setMainTeamId(next);
            return;
          }
        }

        const teamsSnap = await getDocs(query(collection(db, `clubs/${clubUid}/teams`), limit(2)));
        if (teamsSnap.size === 1) {
          const onlyTeamId = teamsSnap.docs[0].id;
          setMainTeamId(onlyTeamId);

          try {
            const payload = { ownerUid: clubUid, mainTeamId: onlyTeamId };
            await setDoc(clubProfileByUidRef, payload, { merge: true });
            if (!ownerSnap.empty) {
              const ownerDocRef = ownerSnap.docs[0].ref;
              if (ownerDocRef.id !== clubUid) {
                await setDoc(ownerDocRef, payload, { merge: true });
              }
            }
          } catch {
          }

          return;
        }

        setMainTeamId(null);
      } catch {
        setMainTeamId(null);
      }
    };
    void run();
  }, [user?.uid]);

  useEffect(() => {
    if (!shouldShowAdminHomeAd) return;
    const w = window as any;
    try {
      w.adsbygoogle = w.adsbygoogle || [];
      w.adsbygoogle.push({});
    } catch {
    }
  }, [shouldShowAdminHomeAd]);

  // Fetch draft news count
  useEffect(() => {
    const clubUid = user?.uid;
    if (!clubUid) return;

    const run = async () => {
      try {
        const newsSnap = await getDocs(query(
          collection(db, `clubs/${clubUid}/news`),
          where("status", "==", "draft")
        ));
        setDraftNewsCount(newsSnap.size);
      } catch {
        setDraftNewsCount(0);
      }
    };
    void run();
  }, [user?.uid]);

  // Fetch unread mail count (notifications)
  useEffect(() => {
    const clubUid = user?.uid;
    if (!clubUid) return;

    const run = async () => {
      try {
        const notificationsSnap = await getDocs(query(
          collection(db, `clubs/${clubUid}/notifications`),
          where("read", "==", false)
        ));
        setUnreadMailCount(notificationsSnap.size);
      } catch {
        setUnreadMailCount(0);
      }
    };
    void run();
  }, [user?.uid]);

  const getHpUrl = () => {
    if (!clubId) return "";
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const base = origin ? `${origin}/${clubId}` : `/${clubId}`;
    return `${base}?v=${encodeURIComponent(OGP_CACHE_BUSTER)}`;
  };

  const handleShareHpOnX = () => {
    try {
      if (!clubId) return;
      const url = getHpUrl();
      if (!url) return;

      const intent = `https://twitter.com/intent/tweet?text=${encodeURIComponent(SHARE_TEXT)}&url=${encodeURIComponent(url)}`;
      window.open(intent, "_blank", "noopener,noreferrer");
    } catch {
      toast.error("共有に失敗しました");
    }
  };

  const bookletHref = useMemo(() => {
    return mainTeamId ? `/admin/teams/${mainTeamId}/booklet` : "/admin/teams";
  }, [mainTeamId]);

  const transfersHref = useMemo(() => {
    return mainTeamId ? `/admin/teams/${mainTeamId}/transfers` : "/admin/teams";
  }, [mainTeamId]);

  const navItemsBySection = {
    frequent: [
      { href: "/admin/teams", label: "チーム管理", icon: Shield },
      { href: "/admin/players", label: "選手管理", icon: Users },
      { href: "/admin/competitions", label: "大会管理", icon: Trophy },
      { href: "/admin/matches", label: "試合管理", icon: Calendar },
    ],
    content: [
      { href: "/admin/news", label: "ニュース管理", icon: Newspaper, badge: draftNewsCount > 0 ? { text: `下書${draftNewsCount}`, color: "orange" } : undefined },
      { href: "/admin/tv", label: "TV管理", icon: Tv },
      { href: "/admin/club/info", label: "クラブ情報", icon: Home },
      { href: "/admin/design", label: "デザイン", icon: LayoutGrid, disabled: !isPro },
    ],
    analysis: [
      { href: bookletHref, label: "選手名鑑", icon: BookOpen },
      { href: "/admin/analysis", label: "分析管理", icon: LineChart },
      { href: transfersHref, label: "移籍管理", icon: ArrowLeftRight },
    ],
    account: [
      { href: "/admin/plan", label: "プラン", icon: CreditCard },
      { href: "https://docs.google.com/forms/d/e/1FAIpQLSeu1Yb6hQUtAwdHbrIlaxIL3F_mBgvhDy1KPdAqz728tERXMw/viewform", label: "問合せ", icon: Mail, external: true },
    ],
  };

  const handleShareHp = async () => {
    try {
      if (!clubId) return;
      const url = getHpUrl();
      if (!url) return;

      const title = "FootChron";
      const text = SHARE_TEXT;

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

  const categoryColors = {
    frequent: '#60a5fa',
    content: '#a78bfa',
    analysis: '#1fd760',
    account: '#f59e0b',
  };

  const sectionLabels = {
    frequent: 'はじめに',
    content: 'コンテンツ',
    analysis: '記録・分析',
    account: 'アカウント',
  };

  return (
    <div className="w-full mx-auto max-w-5xl px-0 py-0">
      {/* PC Layout */}
      <div className="hidden sm:block">
        {/* Header */}
        <div className="flex items-start justify-between mb-1">
          <div>
            <p className="text-[12px]" style={{ color: 'rgba(255,255,255,0.38)' }}>
              こんにちは
            </p>
            <p
              className="text-[28px] font-black italic leading-none"
              style={{ color: '#f0f4ff', fontFamily: 'var(--font-barlow-condensed)' }}
            >
              {clubInfo?.clubName || "チーム"}さん
            </p>
          </div>
          {clubId && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full" style={{ backgroundColor: 'rgba(31,215,96,0.09)', border: '1px solid rgba(31,215,96,0.25)' }}>
              <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: '#1fd760' }} />
              <span className="text-[12px] font-bold" style={{ color: '#1fd760' }}>
                公開中
              </span>
            </div>
          )}
        </div>

        {/* HP Buttons */}
        {clubId && (
          <div className="grid grid-cols-2 gap-3 mb-4">
            <a
              href={`/${clubId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 rounded-xl px-0 py-3 text-[14px] font-bold transition-colors"
              style={{ backgroundColor: '#1fd760', color: '#080c14' }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#17c054'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#1fd760'}
            >
              <Eye className="h-4 w-4" />
              HPを見る
            </a>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex items-center justify-center gap-2 rounded-xl px-0 py-3 text-[14px] font-bold transition-all"
                  style={{ backgroundColor: '#111d2e', border: '1px solid rgba(255,255,255,0.1)', color: '#c8d4e8' }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#1a2540';
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#111d2e';
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)';
                  }}
                >
                  <Share2 className="h-4 w-4" />
                  HPをシェア
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-48"
                style={{ backgroundColor: '#111d2e', border: '1px solid rgba(255,255,255,0.1)' }}
              >
                <DropdownMenuItem
                  onSelect={(e) => {
                    e.preventDefault();
                    handleShareHpOnX();
                  }}
                  className="text-[14px] cursor-pointer hover:bg-white/5"
                >
                  <div className="flex items-center gap-2" style={{ color: '#c8d4e8' }}>
                    <FaXTwitter className="h-4 w-4" />
                    <span className="text-sm">Xでシェア</span>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={async (e) => {
                    e.preventDefault();
                    await handleShareHp();
                  }}
                  className="text-[14px] cursor-pointer hover:bg-white/5"
                >
                  <div className="flex items-center gap-2" style={{ color: '#c8d4e8' }}>
                    <Copy className="h-4 w-4" />
                    <span className="text-sm">URLをコピー</span>
                  </div>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}

        {/* Sections */}
        <div className="space-y-4">
          {Object.entries(navItemsBySection).map(([key, items]) => {
            const categoryKey = key as keyof typeof categoryColors;
            const color = categoryColors[categoryKey];
            const label = sectionLabels[categoryKey];
            return <Section key={key} title={label} items={items} color={color} />;
          })}
        </div>
      </div>

      {/* Mobile Layout */}
      <div className="sm:hidden max-w-lg mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between mb-1">
          <div>
            <p className="text-[12px]" style={{ color: 'rgba(255,255,255,0.38)' }}>
              こんにちは
            </p>
            <p
              className="text-[28px] font-black italic leading-none"
              style={{ color: '#f0f4ff', fontFamily: 'var(--font-barlow-condensed)' }}
            >
              {clubInfo?.clubName || "チーム"}さん
            </p>
          </div>
          {clubId && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full" style={{ backgroundColor: 'rgba(31,215,96,0.09)', border: '1px solid rgba(31,215,96,0.25)' }}>
              <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: '#1fd760' }} />
              <span className="text-[12px] font-bold" style={{ color: '#1fd760' }}>
                公開中
              </span>
            </div>
          )}
        </div>

        {/* HP Buttons */}
        {clubId && (
          <div className="grid grid-cols-2 gap-3 mb-4">
            <a
              href={`/${clubId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 rounded-xl px-0 py-3 text-[14px] font-bold transition-colors"
              style={{ backgroundColor: '#1fd760', color: '#080c14' }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#17c054'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#1fd760'}
            >
              <Eye className="h-4 w-4" />
              HPを見る
            </a>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex items-center justify-center gap-2 rounded-xl px-0 py-3 text-[14px] font-bold transition-all"
                  style={{ backgroundColor: '#111d2e', border: '1px solid rgba(255,255,255,0.1)', color: '#c8d4e8' }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#1a2540';
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#111d2e';
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)';
                  }}
                >
                  <Share2 className="h-4 w-4" />
                  HPをシェア
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-48"
                style={{ backgroundColor: '#111d2e', border: '1px solid rgba(255,255,255,0.1)' }}
              >
                <DropdownMenuItem
                  onSelect={(e) => {
                    e.preventDefault();
                    handleShareHpOnX();
                  }}
                  className="text-[14px] cursor-pointer hover:bg-white/5"
                >
                  <div className="flex items-center gap-2" style={{ color: '#c8d4e8' }}>
                    <FaXTwitter className="h-4 w-4" />
                    <span className="text-sm">Xでシェア</span>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={async (e) => {
                    e.preventDefault();
                    await handleShareHp();
                  }}
                  className="text-[14px] cursor-pointer hover:bg-white/5"
                >
                  <div className="flex items-center gap-2" style={{ color: '#c8d4e8' }}>
                    <Copy className="h-4 w-4" />
                    <span className="text-sm">URLをコピー</span>
                  </div>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}

        {/* Sections */}
        <div className="space-y-4">
          {Object.entries(navItemsBySection).map(([key, items]) => {
            const categoryKey = key as keyof typeof categoryColors;
            const color = categoryColors[categoryKey];
            const label = sectionLabels[categoryKey];
            return <Section key={key} title={label} items={items} color={color} />;
          })}
        </div>
      </div>

      {shouldShowAdminHomeAd ? (
        <div className="mt-8 rounded-xl border p-3" style={{ borderColor: 'rgba(255,255,255,0.07)', backgroundColor: 'rgba(255,255,255,0.03)' }}>
          <ins
            className="adsbygoogle"
            style={{ display: "block" }}
            data-ad-client={adsenseClient}
            data-ad-slot={adsenseSlotAdminHome}
            data-ad-format="auto"
            data-full-width-responsive="true"
          />
        </div>
      ) : null}

      {/* Footer */}
      <div className="mt-8 pt-4 pb-8 text-center border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        <p className="text-[12px]" style={{ color: 'rgba(255,255,255,0.2)' }}>
          FootChron 管理画面
        </p>
      </div>
    </div>
  );
}

function Section({ title, items, color }: { title: string; items: Array<{ href: string; label: string; icon: any; disabled?: boolean; badge?: { text: string; color: string }; external?: boolean }>; color: string }) {
  if (items.length === 0) return null;

  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        <div className="w-3 h-px" style={{ backgroundColor: color }} />
        <h3 className="text-[11px] font-black tracking-[0.12em] uppercase leading-none" style={{ color, fontFamily: 'var(--font-barlow-condensed)' }}>
          {title}
        </h3>
        <div className="flex-1 h-px" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }} />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {items.map((item) => {
          const Icon = item.icon;
          const content = (
            <div className="relative">
              {item.badge && (
                <div className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ backgroundColor: 'rgba(245,158,11,0.13)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.27)' }}>
                  {item.badge.text}
                </div>
              )}
              <div
                className={`flex flex-col items-center justify-center gap-3 p-5 rounded-2xl transition-all ${
                  item.disabled
                    ? "opacity-50 cursor-not-allowed"
                    : "cursor-pointer hover:-translate-y-0.5"
                }`}
                style={{
                  backgroundColor: 'transparent',
                  border: '1px solid transparent',
                }}
                onMouseEnter={(e) => {
                  if (!item.disabled) {
                    e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.035)';
                    e.currentTarget.style.borderColor = `${color}35`;
                    e.currentTarget.style.boxShadow = 'none';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!item.disabled) {
                    e.currentTarget.style.backgroundColor = 'transparent';
                    e.currentTarget.style.borderColor = 'transparent';
                    e.currentTarget.style.boxShadow = 'none';
                  }
                }}
              >
                <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'transparent', border: `1px solid ${color}22` }}>
                  <Icon className="h-5 w-5" style={{ color, strokeWidth: '1.8' }} />
                </div>
                <span className="text-[14px] font-semibold text-center leading-tight" style={{ color: '#c8d4e8' }}>
                  {item.label}
                </span>
              </div>
            </div>
          );

          if (item.disabled) {
            return <div key={item.label}>{content}</div>;
          }

          if (item.external) {
            return (
              <a
                key={item.label}
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                className="block"
              >
                {content}
              </a>
            );
          }

          return (
            <Link key={item.label} href={item.href} className="block">
              {content}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
