"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Crown, Shield, Trophy, Users, ArrowLeftRight, ArrowRight } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useCareer } from "@/contexts/CareerContext";
import { useClub } from "@/contexts/ClubContext";
import { fetchLegacyClubTitles } from "@/lib/trophy-migration";
import { db } from "@/lib/firebase";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
} from "firebase/firestore";

const recordCards = [
  {
    href: "/admin/club/history/players",
    title: "選手記録",
    description: "歴代の出場・得点・アシストなど",
    label: "PLAYER RECORDS",
    icon: Users,
    bgImage: "/選手記録背景.jpg",
    accent: "from-red-500/45 to-red-950/30",
  },
  {
    href: "/admin/club/history/seasons",
    title: "シーズン記録",
    description: "1シーズンのベストパフォーマンス",
    label: "SEASON RECORDS",
    icon: Trophy,
    bgImage: "/シーズン記録背景.jpg",
    accent: "from-amber-400/45 to-red-950/25",
  },
  {
    href: "/admin/club/history/team",
    title: "チーム記録",
    description: "連勝・無敗・最大得失点差 など",
    label: "TEAM RECORDS",
    icon: Shield,
    bgImage: "/チーム記録背景.jpg",
    accent: "from-sky-400/35 to-red-950/25",
  },
  {
    href: "/admin/club/history/transfers",
    title: "移籍記録",
    description: "歴代の移籍金と記録",
    label: "TRANSFER RECORDS",
    icon: ArrowLeftRight,
    bgImage: "/移籍記録背景.jpg",
    accent: "from-red-500/45 to-red-950/30",
  },
  {
    href: "/admin/club/history/trophies",
    title: "トロフィールーム",
    description: "クラブが獲得した栄光の記録",
    label: "TROPHY ROOM",
    bigLabel: "TROPHY ROOM",
    cta: "トロフィーを見る",
    icon: Trophy,
    bgImage: "/trophies/room-bg.webp",
    accent: "from-amber-400/45 to-red-950/25",
  },
  {
    href: "/admin/club/history/eleven",
    title: "歴代ベストイレブン",
    description: "クラブ史に残る11人",
    label: "ALL-TIME XI",
    bigLabel: "ALL-TIME XI",
    cta: "ベストイレブンを見る",
    icon: Crown,
    bgImage: "/ベストイレブン背景.jpg",
    accent: "from-rose-500/45 to-red-950/30",
  },
];

export default function ClubHistoryPage() {
  const { user } = useAuth();
  const { activeCareer } = useCareer();
  const { clubInfo } = useClub();
  const clubUid = activeCareer?.clubUid;
  const careerId = activeCareer?.id;
  const publicClubId = clubInfo.id || user?.clubId || activeCareer?.clubId || null;
  const [seasonCount, setSeasonCount] = useState(0);
  const [matchCount, setMatchCount] = useState(0);
  const [titleCount, setTitleCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const isPro = user?.plan === "pro";

  useEffect(() => {
    let cancelled = false;
    setSeasonCount(0);
    setMatchCount(0);
    setTitleCount(0);
    if (!clubUid || !careerId) return;
    const run = async () => {
      setLoading(true);
      try {
        // mainTeamId を取得
        let mainTeamId: string | null = null;
        try {
          const profileSnap = await getDoc(doc(db, "club_profiles", clubUid));
          if (profileSnap.exists()) {
            const data = profileSnap.data() as { mainTeamId?: string };
            if (typeof data?.mainTeamId === "string") mainTeamId = data.mainTeamId.trim();
          }
        } catch (e) {
          console.warn("[ClubHistoryPage] mainTeamId load failed", e);
        }

        const [competitionsSnap, friendlySnap, publicSnap, titlesSnap, legacyTitles] = await Promise.all([
          getDocs(query(collection(db, `clubs/${clubUid}/competitions`))),
          getDocs(query(collection(db, `clubs/${clubUid}/friendly_matches`))),
          getDocs(query(collection(db, `clubs/${clubUid}/public_match_index`))),
          getDocs(query(collection(db, `clubs/${clubUid}/trophies`))),
          fetchLegacyClubTitles(clubUid).catch(() => [] as Awaited<ReturnType<typeof fetchLegacyClubTitles>>),
        ]);

        const seasonsSet = new Set<string>();
        competitionsSnap.docs.forEach((d) => {
          const season = (d.data() as { season?: string }).season;
          if (typeof season === "string" && season.trim().length > 0) {
            seasonsSet.add(season);
          }
        });

        const isOwnMatch = (m: { homeTeam?: unknown; awayTeam?: unknown }) =>
          typeof m.homeTeam === "string" && m.homeTeam === mainTeamId ||
          typeof m.awayTeam === "string" && m.awayTeam === mainTeamId;

        const scoredPublicMatches = publicSnap.docs.filter((d) => {
          const data = d.data() as { homeTeam?: unknown; awayTeam?: unknown; scoreHome?: unknown; scoreAway?: unknown };
          return isOwnMatch(data) && typeof data.scoreHome === "number" && typeof data.scoreAway === "number";
        }).length;

        const scoredFriendlyMatches = friendlySnap.docs.filter((d) => {
          const data = d.data() as { homeTeam?: unknown; awayTeam?: unknown; scoreHome?: unknown; scoreAway?: unknown };
          return isOwnMatch(data) && typeof data.scoreHome === "number" && typeof data.scoreAway === "number";
        }).length;

        // タイトル数: 新Trophyの獲得回数合計。未移行（このCareerのtrophiesが空）なら
        // legacy clubTitles の seasons 合計へフォールバック（同名タイトルは統合して数える）。
        const careerTrophies = titlesSnap.docs
          .map((d) => d.data() as { careerId?: unknown; winningSeasons?: unknown })
          .filter((t) => t.careerId === careerId);
        const trophyWins = careerTrophies.reduce(
          (sum, t) => sum + (Array.isArray(t.winningSeasons) ? t.winningSeasons.length : 0), 0
        );
        const legacyWins = new Map<string, Set<string>>();
        for (const item of legacyTitles) {
          const key = item.competitionName.trim().replace(/\s+/g, " ").toLowerCase();
          const cur = legacyWins.get(key) || new Set<string>();
          for (const s of item.seasons) cur.add(s);
          legacyWins.set(key, cur);
        }
        const legacyTotal = [...legacyWins.values()].reduce((sum, s) => sum + s.size, 0);

        if (cancelled) return;
        setSeasonCount(seasonsSet.size);
        setMatchCount(mainTeamId ? scoredPublicMatches + scoredFriendlyMatches : 0);
        setTitleCount(careerTrophies.length > 0 ? trophyWins : legacyTotal);
      } catch (e) {
        console.error("[ClubHistoryPage] fetch counts failed", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => { cancelled = true; };
  }, [clubUid, careerId]);

  const stats = [
    { label: "シーズン", value: loading ? "-" : String(seasonCount), href: null as string | null },
    { label: "試合", value: loading ? "-" : String(matchCount), href: null as string | null },
    { label: "タイトル", value: loading ? "-" : String(titleCount), href: publicClubId ? `/${publicClubId}/trophies` : null },
  ];

  return (
    <div className="relative min-h-screen bg-[#050a12] text-white">
      <Image src="/レコード素材７.jpg" alt="" fill priority className="object-cover object-center opacity-45" sizes="100vw" />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,10,18,0.50)_0%,rgba(5,10,18,0.88)_36%,rgba(5,10,18,0.66)_100%)]" />
      <div className="absolute inset-x-0 top-0 h-1 bg-red-500" />

      <section className="relative z-10 overflow-hidden">
        <Image src="/レコード素材７.jpg" alt="" fill priority className="object-cover object-top opacity-70" sizes="100vw" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/45 to-black/15" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#050a12]/85 via-transparent to-[#050a12]/25" />
        <div className="relative z-10 px-4 pb-6 pt-16 sm:px-6 sm:pb-8 sm:pt-20 lg:px-6 lg:pb-8 lg:pt-8">
          <div className="flex min-h-[220px] flex-col justify-between sm:min-h-[260px] lg:min-h-[150px] lg:flex-row lg:items-end">
            <div>
              <h1 className="text-[42px] font-black leading-[0.92] tracking-[-0.08em] text-slate-100 sm:text-6xl lg:text-[64px]">
                CLUB <span className="text-yellow-400">RECORDS</span>
              </h1>
              <p className="mt-4 max-w-xs text-[13px] font-bold leading-6 text-slate-200 sm:max-w-lg sm:text-base lg:mt-2">
                積み重ねたシーズンが、クラブの歴史になる。
              </p>
              <p className="mt-1 hidden text-[11px] font-black tracking-[0.16em] text-slate-400 lg:block">A HISTORY BUILT BY YOU.</p>
            </div>
            <div className="flex items-end justify-center gap-1 lg:justify-start">
              {stats.map((stat, index) => {
                const isLast = index === stats.length - 1;
                const inner = (
                  <div className="px-2 text-center sm:px-3">
                    <div className="text-2xl font-black leading-none text-white sm:text-3xl">{stat.value}</div>
                    <div className="mt-1 text-[10px] font-bold text-slate-300 sm:text-xs">{stat.label}</div>
                  </div>
                );
                return (
                  <div key={stat.label} className="flex items-center">
                    {stat.href ? (
                      <Link href={stat.href} className="rounded transition hover:opacity-70" title="トロフィールームを見る">
                        {inner}
                      </Link>
                    ) : (
                      inner
                    )}
                    {!isLast && <span className="mx-2 text-lg text-slate-500 sm:mx-3">|</span>}
                  </div>
                );
              })}
            </div>
            <div className="mt-6 hidden max-w-xs text-right lg:block">
              <p className="text-3xl font-black leading-none text-white/90">“</p>
              <p className="text-sm font-black leading-6 text-white">過去があるから、<br />次のシーズンももっと面白くなる。</p>
              <p className="mt-1 text-[10px] font-bold tracking-[0.16em] text-slate-400">RIVERMONT FC</p>
            </div>
          </div>
        </div>
      </section>

      <div className="relative z-10 px-2 pb-8 sm:px-3 lg:px-4">
        <section className="mt-7 grid grid-cols-2 gap-2 sm:gap-3 lg:mt-3 lg:grid-cols-4">
          {recordCards.slice(0, 4).map((card) => {
            const Icon = card.icon;
            return (
              <Link
                key={card.title}
                href={card.href}
                className={`group relative flex min-h-[220px] flex-col justify-between overflow-hidden rounded-lg border border-white/10 bg-slate-950 p-3 text-left shadow-[0_12px_30px_rgba(0,0,0,0.28)] transition ${isPro ? 'hover:opacity-90' : 'opacity-60'} lg:min-h-[300px]`}
              >
                <Image src={card.bgImage} alt="" fill className="object-cover" sizes="(max-width: 640px) 45vw, 320px" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/35 to-black/10" />
                <div className="relative z-10 flex items-start justify-between">
                  <Icon className="h-6 w-6 text-white" strokeWidth={2.4} />
                </div>
                <div className="relative z-10">
                  <h2 className="text-[15px] font-black leading-none text-white">{card.title}</h2>
                  <p className="mt-1 text-[9px] font-bold tracking-[0.08em] text-slate-200">{card.label}</p>
                  <p className="mt-4 text-[10px] font-bold leading-4 text-slate-200">{card.description}</p>
                </div>
                <div className="absolute bottom-3 right-2 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-white/25 bg-black/35 text-white transition group-hover:translate-x-0.5">
                  <ArrowRight className="h-3 w-3" />
                </div>
                {!isPro && (
                  <div className="absolute right-2 top-2 z-20 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-black text-yellow-400 border border-yellow-400/40">
                    PRO
                  </div>
                )}
              </Link>
            );
          })}
          {recordCards.slice(4).map((card) => {
            const Icon = card.icon;
            return (
              <Link
                key={card.title}
                href={card.href}
                className={`group relative col-span-2 flex min-h-[190px] flex-col justify-between overflow-hidden rounded-lg border border-white/10 bg-slate-950 p-4 text-left shadow-[0_12px_30px_rgba(0,0,0,0.28)] transition ${isPro ? 'hover:opacity-90' : 'opacity-60'} lg:col-span-4 lg:min-h-[280px] lg:p-6`}
              >
                <Image src={card.bgImage} alt="" fill className="object-cover" sizes="100vw" />
                <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/35 to-black/10" />
                <div className="relative z-10 flex items-center gap-2">
                  <Icon className="h-5 w-5 text-white" strokeWidth={2.4} />
                  <span className="text-[13px] font-black text-white">{card.title}</span>
                </div>
                <div className="relative z-10 max-w-[60%]">
                  <p className="text-[11px] font-bold tracking-[0.08em] text-slate-200">{card.label}</p>
                  <h2 className="mt-1 text-3xl font-black leading-none tracking-[-0.08em] text-white sm:text-5xl">{card.bigLabel}</h2>
                  <p className="mt-3 text-[11px] font-bold text-slate-200">{card.description}</p>
                </div>
                <div className="relative z-10 mt-3 inline-flex w-fit items-center gap-2 rounded-full border border-white/55 bg-black/25 px-4 py-2 text-[10px] font-bold text-white">
                  {card.cta}
                  <ArrowRight className="h-3 w-3" />
                </div>
                {!isPro && (
                  <div className="absolute right-3 top-3 z-20 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-black text-yellow-400 border border-yellow-400/40">
                    PRO
                  </div>
                )}
              </Link>
            );
          })}
        </section>
      </div>
    </div>
  );
}
