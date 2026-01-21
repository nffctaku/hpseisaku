"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { useClub } from "@/contexts/ClubContext";
import { db } from "@/lib/firebase";
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
  ClipboardList,
  BarChart3,
  LayoutGrid,
  NotebookPen,
} from "lucide-react";
import { collection, doc, getDoc, getDocs, limit, query, setDoc, where } from "firebase/firestore";

export default function AdminHomePage() {
  const { user } = useAuth();
  const { clubInfo } = useClub();

  const clubId = clubInfo.id || user?.clubId || user?.uid || null;
  const [mainTeamId, setMainTeamId] = useState<string | null>(null);

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

  const bookletHref = useMemo(() => {
    return mainTeamId ? `/admin/teams/${mainTeamId}/season?next=booklet` : "/admin/teams";
  }, [mainTeamId]);

  const transfersHref = useMemo(() => {
    return mainTeamId ? `/admin/teams/${mainTeamId}/transfers` : "/admin/teams";
  }, [mainTeamId]);

  const TransfersIcon = ({ className }: { className?: string }) => {
    return (
      <ArrowLeftRight className={className} />
    );
  };

  const navItems: Array<{ href: string; label: string; icon: any; external?: boolean; disabled?: boolean }> = [
    { href: "/admin/teams", label: "チーム登録", icon: Shield },
    { href: "/admin/players", label: "選手管理", icon: Users },
    { href: "/admin/competitions", label: "大会管理", icon: Trophy },
    { href: "/admin/matches", label: "試合管理", icon: Calendar },

    { href: "/admin/friendly-matches", label: "単発試合", icon: Calendar },
    { href: "/admin/analysis", label: "分析管理", icon: LineChart },
    { href: transfersHref, label: "移籍管理", icon: TransfersIcon },
    { href: bookletHref, label: "選手名鑑", icon: BookOpen },
    { href: "/admin/news", label: "ニュース管理", icon: Newspaper },

    { href: "/admin/tv", label: "TV管理", icon: Tv },
    { href: "/admin/club/info", label: "クラブ情報", icon: Settings },

    { href: "/admin/plan", label: "プラン", icon: CreditCard },
    { href: "/admin/club", label: "管理者情報", icon: LayoutGrid },
    { href: "https://forms.gle/YkvqAt14GivwrurBA", label: "問合せ", icon: Mail, external: true },
  ];

  const visibleItems = navItems;

  return (
    <div className="w-full mx-auto py-4 sm:py-6">
      <div className="sm:hidden">
        <div className="mb-5 flex items-center gap-2">
          <h1 className="text-xl font-bold tracking-tight">管理画面トップ</h1>
        </div>

        {clubId && (
          <a
            href={`/${clubId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mb-4 inline-flex w-full items-center justify-center rounded-md bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700"
          >
            HPを見る
          </a>
        )}

        <div className="grid grid-cols-4 gap-3">
          {visibleItems.map((item) => {
            const Icon = item.icon;

            const content = (
              <div
                className={
                  item.disabled
                    ? "w-full aspect-square overflow-hidden rounded-xl border bg-gray-100 text-gray-400 flex flex-col items-center justify-center p-3"
                    : "w-full aspect-square overflow-hidden rounded-xl border bg-white text-gray-900 hover:bg-gray-50 transition-colors flex flex-col items-center justify-center p-3"
                }
              >
                <Icon className="h-7 w-7" />
                <div className="mt-2 w-[6em] text-[10px] leading-tight text-center break-words">{item.label}</div>
              </div>
            );

            if (item.disabled) {
              return (
                <div key={item.label} className="block w-full">
                  {content}
                </div>
              );
            }

            if (item.external) {
              return (
                <a
                  key={item.label}
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full"
                >
                  {content}
                </a>
              );
            }

            return (
              <Link key={item.label} href={item.href} className="block w-full">
                {content}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
