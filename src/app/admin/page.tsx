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
  CheckCircle2,
  Circle,
  Copy,
  Loader2,
  Share2,
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

  const SHOW_TUTORIAL = false;

  const [tutorialLoading, setTutorialLoading] = useState(false);
  const [hasTeam, setHasTeam] = useState(false);
  const [hasPlayer, setHasPlayer] = useState(false);
  const [hasCompetition, setHasCompetition] = useState(false);
  const [hasMatch, setHasMatch] = useState(false);

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

  const getHpUrl = () => {
    if (!clubId) return "";
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return origin ? `${origin}/${clubId}` : `/${clubId}`;
  };

  const handleShareHpOnX = () => {
    try {
      if (!clubId) return;
      const url = getHpUrl();
      if (!url) return;

      const title = clubInfo?.clubName || "クラブ";
      const text = `${title}のHP`;
      const intent = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
      window.open(intent, "_blank", "noopener,noreferrer");
    } catch {
      toast.error("共有に失敗しました");
    }
  };

  useEffect(() => {
    const clubUid = user?.uid;
    if (!clubUid) return;

    const run = async () => {
      setTutorialLoading(true);
      try {
        const teamsSnap = await getDocs(query(collection(db, `clubs/${clubUid}/teams`), limit(1)));
        const hasAnyTeam = teamsSnap.size > 0;
        setHasTeam(hasAnyTeam);

        let hasAnyPlayer = false;
        if (hasAnyTeam) {
          const teamId = teamsSnap.docs[0].id;
          const playersSnap = await getDocs(query(collection(db, `clubs/${clubUid}/teams/${teamId}/players`), limit(1)));
          hasAnyPlayer = playersSnap.size > 0;
        }
        setHasPlayer(hasAnyPlayer);

        const competitionsSnap = await getDocs(query(collection(db, `clubs/${clubUid}/competitions`), limit(1)));
        const hasAnyCompetition = competitionsSnap.size > 0;
        setHasCompetition(hasAnyCompetition);

        let hasAnyMatch = false;

        const friendlySnap = await getDocs(query(collection(db, `clubs/${clubUid}/friendly_matches`), limit(1)));
        if (friendlySnap.size > 0) {
          hasAnyMatch = true;
        }

        if (!hasAnyMatch) {
          const legacySnap = await getDocs(query(collection(db, `clubs/${clubUid}/matches`), limit(1)));
          if (legacySnap.size > 0) {
            hasAnyMatch = true;
          }
        }

        if (!hasAnyMatch && hasAnyCompetition) {
          const compId = competitionsSnap.docs[0].id;
          const roundsSnap = await getDocs(query(collection(db, `clubs/${clubUid}/competitions/${compId}/rounds`), limit(1)));
          if (roundsSnap.size > 0) {
            const roundId = roundsSnap.docs[0].id;
            const matchesSnap = await getDocs(
              query(collection(db, `clubs/${clubUid}/competitions/${compId}/rounds/${roundId}/matches`), limit(1))
            );
            if (matchesSnap.size > 0) {
              hasAnyMatch = true;
            }
          }
        }

        setHasMatch(hasAnyMatch);
      } catch {
      } finally {
        setTutorialLoading(false);
      }
    };

    void run();
  }, [user?.uid]);

  const bookletHref = useMemo(() => {
    return mainTeamId ? `/admin/teams/${mainTeamId}/booklet` : "/admin/teams";
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

  const handleShareHp = async () => {
    try {
      if (!clubId) return;
      const url = getHpUrl();
      if (!url) return;

      const title = clubInfo?.clubName || "クラブ";
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
    <div className="w-full mx-auto py-4 sm:py-6">
      <div className="sm:hidden">
        <div className="mb-5 flex items-center gap-2">
          <h1 className="text-xl font-bold tracking-tight">管理画面トップ</h1>
        </div>

        {SHOW_TUTORIAL ? (
          <div className="mb-4 rounded-xl border bg-white p-4 text-gray-900">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">はじめての方（4ステップ）</div>
              {tutorialLoading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
            </div>

            <div className="mt-3 space-y-2">
              <TutorialStep
                done={hasTeam}
                title="1. チーム登録"
                href="/admin/teams"
                cta="チーム登録へ"
              />
              <TutorialStep
                done={hasPlayer}
                title="2. 選手登録"
                href="/admin/players"
                cta="選手管理へ"
              />
              <TutorialStep
                done={hasCompetition}
                title="3. 大会登録"
                href="/admin/competitions"
                cta="大会管理へ"
              />
              <TutorialStep
                done={hasMatch}
                title="4. 試合登録"
                href="/admin/matches"
                cta="試合管理へ"
              />
            </div>
          </div>
        ) : null}

        {clubId && (
          <div className="mb-4 grid grid-cols-2 gap-3">
            <a
              href={`/${clubId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-full items-center justify-center rounded-md bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700"
            >
              HPを見る
            </a>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-white px-4 py-3 text-sm font-semibold text-gray-900 border border-gray-200 hover:bg-gray-50"
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

function TutorialStep({ done, title, href, cta }: { done: boolean; title: string; href: string; cta: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border bg-gray-50 px-3 py-2">
      <div className="flex items-center gap-2 min-w-0">
        {done ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
        ) : (
          <Circle className="h-4 w-4 text-muted-foreground" />
        )}
        <div className="text-xs font-medium truncate">{title}</div>
      </div>

      <Link
        href={href}
        className={
          done
            ? "text-[11px] text-muted-foreground hover:underline whitespace-nowrap"
            : "text-[11px] text-blue-700 hover:underline whitespace-nowrap"
        }
      >
        {cta}
      </Link>
    </div>
  );
}
