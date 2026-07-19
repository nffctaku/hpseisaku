"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { useClub } from "@/contexts/ClubContext";
import { db } from "@/lib/firebase";
import { SystemAnnouncement } from "@/components/system-announcement";
import { Input } from "@/components/ui/input";
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
      { href: "/admin/settings", label: "変更履歴", icon: History },
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

  return (
    <div className="w-full mx-auto py-4 sm:py-6 px-4 md:px-0 min-h-screen">
      <SystemAnnouncement />
      
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-sm text-gray-400">こんにちは</p>
          <p className="text-lg font-semibold text-white">{clubInfo?.clubName || "チーム"}さん</p>
        </div>
        <div className="px-3 py-1 rounded-full bg-green-100 text-green-700 text-sm font-medium">
          公開中
        </div>
      </div>

      {/* Action Buttons */}
      {clubId && (
        <div className="grid grid-cols-2 gap-3 mb-6">
          <a
            href={`/${clubId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700"
          >
            <Eye className="h-4 w-4" />
            HPを見る
          </a>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center justify-center gap-2 rounded-md bg-white px-4 py-3 text-sm font-semibold text-gray-900 border border-gray-200 hover:bg-gray-50"
              >
                <Share2 className="h-4 w-4" />
                HPをシェア
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-48 bg-white text-gray-900 border border-gray-200 shadow-lg"
            >
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault();
                  handleShareHpOnX();
                }}
              >
                <div className="flex items-center gap-2">
                  <FaXTwitter className="h-4 w-4" />
                  <span className="text-sm">Xでシェア</span>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={async (e) => {
                  e.preventDefault();
                  await handleShareHp();
                }}
              >
                <div className="flex items-center gap-2">
                  <Copy className="h-4 w-4" />
                  <span className="text-sm">URLをコピー</span>
                </div>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      {/* Sections */}
      <div className="space-y-8">
        {/* はじめに */}
        <Section title="はじめに" items={navItemsBySection.frequent} />
        
        {/* コンテンツ */}
        <Section title="コンテンツ" items={navItemsBySection.content} />
        
        {/* 記録・分析 */}
        <Section title="記録・分析" items={navItemsBySection.analysis} />
        
        {/* アカウント */}
        <Section title="アカウント" items={navItemsBySection.account} />
      </div>

      {shouldShowAdminHomeAd ? (
        <div className="mt-8 rounded-xl border border-white/10 bg-white/5 p-3">
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
    </div>
  );
}

function Section({ title, items }: { title: string; items: Array<{ href: string; label: string; icon: any; disabled?: boolean; badge?: { text: string; color: string }; external?: boolean }> }) {
  if (items.length === 0) return null;

  return (
    <div>
      <h3 className="text-sm text-gray-400 mb-3">{title}</h3>
      <div className="grid grid-cols-2 gap-3">
        {items.map((item) => {
          const Icon = item.icon;
          const content = (
            <div className="relative">
              {item.badge && (
                <div className={`absolute -top-1 -right-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                  item.badge.color === 'orange' ? 'bg-orange-100 text-orange-700' : 'bg-red-100 text-red-700'
                }`}>
                  {item.badge.text}
                </div>
              )}
              <div
                className={`bg-white rounded-xl p-4 flex flex-col items-center justify-center gap-2 ${
                  item.disabled
                    ? "opacity-50 cursor-not-allowed"
                    : "hover:shadow-md transition-shadow cursor-pointer"
                }`}
              >
                <Icon className="h-6 w-6 text-gray-700" />
                <span className="text-sm font-medium text-gray-900 text-center">{item.label}</span>
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
