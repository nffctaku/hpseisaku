"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/contexts/AuthContext";
import { useClub } from "@/contexts/ClubContext";
import { useCareer } from "@/contexts/CareerContext";
import { MAX_CAREERS } from "@/lib/career-constants";
import { db } from "@/lib/firebase";
import {
  ArrowLeftRight, BookOpen, Calendar, ChevronLeft, ChevronRight, X,
  CreditCard, Home, LineChart, Mail, Newspaper, Shield, Tv, Trophy,
  Users, LayoutGrid, Eye, Share2, History, Copy, FolderPlus, type LucideIcon,
} from "lucide-react";
import { collection, doc, getDoc, getDocs, limit, query, setDoc, where } from "firebase/firestore";
import { toast } from "sonner";
import { getPlanTier } from "@/lib/plan-limits";
import { FaXTwitter } from "react-icons/fa6";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Integration notes:
// - Replace the existing /admin page with this file; existing project imports are required.
// - Guide links are existing routes. No match schema or completion status is assumed.
// - Guide collapse preference is local to this browser/account/club, not a completion record.
// - Public status, analytics, and new Pro entitlements are not inferred here.
const OGP_CACHE_BUSTER = "20260122";
const SHARE_TEXT = "FootChronでチームHPを公開しました";
const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#08111f]";

type NavItem = {
  href: string; label: string; icon: LucideIcon;
  disabled?: boolean; badge?: string; external?: boolean;
};

export default function AdminHomePage() {
  const { user } = useAuth();
  const { clubInfo } = useClub();
  const { activeCareer } = useCareer();
  const uid = user?.uid;
  // データパスはアクティブCareerのclubUidを優先（auth uid は旧Careerルートを指すため不可）
  const clubUid = activeCareer?.clubUid || uid || null;
  const clubId = clubInfo?.id || user?.clubId || uid || null;
  const [teamState, setTeamState] = useState<{ uid: string; id: string | null } | null>(null);
  const [draftState, setDraftState] = useState<{ uid: string; count: number } | null>(null);
  const mainTeamId = teamState?.uid === clubUid ? teamState?.id : null;
  const draftNewsCount = draftState?.uid === clubUid ? draftState?.count || 0 : 0;
  const isPro = getPlanTier(user?.plan) !== "free";
  const adsenseClient = (process.env.NEXT_PUBLIC_ADSENSE_CLIENT || "").trim();
  const adsenseSlot = (process.env.NEXT_PUBLIC_ADSENSE_SLOT_ADMIN_HOME || "").trim();
  const showAd = Boolean(adsenseClient && adsenseSlot);
  const adRequested = useRef(false);

  // Preserve the existing UID-based team lookup and single-team fallback.
  useEffect(() => {
    if (!clubUid) return;
    let cancelled = false;
    const publish = (id: string | null) => {
      if (!cancelled) setTeamState({ uid: clubUid, id });
    };
    const readMainTeam = (data: { mainTeamId?: unknown }) =>
      typeof data.mainTeamId === "string" ? data.mainTeamId.trim() : "";
    const run = async () => {
      try {
        const profileRef = doc(db, "club_profiles", clubUid);
        const profile = await getDoc(profileRef);
        if (cancelled) return;
        const directId = profile.exists() ? readMainTeam(profile.data()) : "";
        if (directId) { publish(directId); return; }
        const owners = uid
          ? await getDocs(query(collection(db, "club_profiles"), where("ownerUid", "==", uid), where("clubUid", "==", clubUid), limit(1)))
          : { empty: true, docs: [] as any[] };
        if (cancelled) return;
        const ownerId = owners.empty ? "" : readMainTeam(owners.docs[0].data());
        if (ownerId) { publish(ownerId); return; }
        const teams = await getDocs(query(collection(db, `clubs/${clubUid}/teams`), limit(2)));
        if (cancelled) return;
        if (teams.size !== 1) { publish(null); return; }
        const id = teams.docs[0].id;
        publish(id);
        try {
          const payload = { ownerUid: uid, clubUid, mainTeamId: id };
          await setDoc(profileRef, payload, { merge: true });
          if (!owners.empty && owners.docs[0].id !== clubUid) {
            await setDoc(owners.docs[0].ref, payload, { merge: true });
          }
        } catch {
          // Lookup still succeeds if optional profile persistence is denied.
        }
      } catch { publish(null); }
    };
    void run();
    return () => { cancelled = true; };
  }, [clubUid, uid]);

  useEffect(() => {
    if (!clubUid) return;
    let cancelled = false;
    const run = async () => {
      try {
        const snapshot = await getDocs(query(collection(db, `clubs/${clubUid}/news`), where("status", "==", "draft")));
        if (!cancelled) setDraftState({ uid: clubUid!, count: snapshot.size });
      } catch {
        if (!cancelled) setDraftState({ uid: clubUid!, count: 0 });
      }
    };
    void run();
    return () => { cancelled = true; };
  }, [clubUid]);

  useEffect(() => {
    if (!showAd || adRequested.current) return;
    const w = window as unknown as { adsbygoogle?: object[] };
    try {
      w.adsbygoogle = w.adsbygoogle || [];
      w.adsbygoogle.push({});
      adRequested.current = true;
    } catch { /* Existing ad script may not be available yet. */ }
  }, [showAd]);

  const hpHref = clubId ? `/${encodeURIComponent(clubId)}` : null;
  const getShareUrl = () => hpHref
    ? `${window.location.origin}${hpHref}?v=${encodeURIComponent(OGP_CACHE_BUSTER)}` : "";
  const shareOnX = () => {
    const url = getShareUrl();
    if (!url) return;
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(SHARE_TEXT)}&url=${encodeURIComponent(url)}`, "_blank", "noopener,noreferrer");
  };
  const copyUrl = async () => {
    const url = getShareUrl();
    if (!url) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const previous = document.activeElement;
        const textarea = document.createElement("textarea");
        textarea.value = url;
        textarea.style.position = "fixed";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        try {
          textarea.focus();
          textarea.select();
          if (!document.execCommand("copy")) throw new Error("Copy failed");
        } finally {
          textarea.remove();
          if (previous instanceof HTMLElement) previous.focus();
        }
      }
      toast.success("URLをコピーしました");
    } catch { toast.error("URLをコピーできませんでした。HPを開いてURLをコピーしてください。"); }
  };
  const shareHp = async () => {
    const url = getShareUrl();
    if (!url) return;
    if (typeof navigator.share !== "function") { await copyUrl(); return; }
    try { await navigator.share({ title: "FootChron", text: SHARE_TEXT, url }); }
    catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      toast.error("共有できませんでした。URLのコピーをお試しください。");
    }
  };

  const sections: { title: string; color: string; items: NavItem[] }[] = [
    { title: "チーム・試合", color: "#60a5fa", items: [
      { href: "/admin/teams", label: "チーム管理", icon: Shield },
      { href: "/admin/players", label: "選手管理", icon: Users },
      { href: "/admin/competitions", label: "大会管理", icon: Trophy },
      { href: "/admin/matches", label: "試合管理", icon: Calendar },
    ] },
    { title: "コンテンツ", color: "#a78bfa", items: [
      { href: "/admin/news", label: "ニュース管理", icon: Newspaper, badge: draftNewsCount > 0 ? `下書${draftNewsCount}` : undefined },
      { href: "/admin/tv", label: "TV管理", icon: Tv },
      { href: "/admin/club/info", label: "クラブ情報", icon: Home },
      { href: "/admin/design", label: "デザイン", icon: LayoutGrid, disabled: !isPro },
    ] },
    { title: "記録・分析", color: "#1fd760", items: [
      { href: mainTeamId ? `/admin/teams/${encodeURIComponent(mainTeamId)}/booklet` : "/admin/teams", label: "選手名鑑", icon: BookOpen },
      { href: "/admin/analysis", label: "分析管理", icon: LineChart },
      { href: "/admin/club/history", label: "クラブ史", icon: History },
      { href: mainTeamId ? `/admin/teams/${encodeURIComponent(mainTeamId)}/transfers` : "/admin/teams", label: "移籍管理", icon: ArrowLeftRight },
    ] },
    { title: "アカウント", color: "#f59e0b", items: [
      { href: "/admin/plan", label: "プラン", icon: CreditCard },
      { href: "https://docs.google.com/forms/d/e/1FAIpQLSeu1Yb6hQUtAwdHbrIlaxIL3F_mBgvhDy1KPdAqz728tERXMw/viewform", label: "問合せ", icon: Mail, external: true },
    ] },
  ];

  return (
    <div className="relative mx-auto w-full max-w-5xl text-[#c8d4e8]">
      <div className="fixed inset-0 -z-10" aria-hidden="true">
        <Image src="/背景スタジアム１.png" alt="" fill priority className="object-cover object-center opacity-30" sizes="100vw" />
        <div className="absolute inset-0 bg-[#08111f]/70" />
      </div>

      <div className="relative z-10">
        <header className="mb-1">
          {hpHref && (
            <div className="mx-auto mt-1 w-fit grid grid-cols-2 gap-1">
              <a href={hpHref} target="_blank" rel="noopener noreferrer" className={`flex min-h-8 items-center justify-center gap-1.5 rounded-lg bg-[#1fd760] px-2 py-1 text-[10px] font-bold text-[#080c14] transition hover:bg-[#17c054] ${FOCUS}`}>
                <Eye className="h-3.5 w-3.5" aria-hidden="true" />HPを見る
              </a>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" className={`flex min-h-8 items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-[#111d2e] px-2 py-1 text-[10px] font-bold transition hover:bg-[#1a2540] ${FOCUS}`}>
                    <Share2 className="h-3.5 w-3.5" aria-hidden="true" />HPをシェア
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52 border-white/10 bg-[#111d2e] text-[#c8d4e8]">
                  <DropdownMenuItem onSelect={shareOnX} className="min-h-11 cursor-pointer gap-2 focus:bg-white/10 focus:text-white"><FaXTwitter className="h-4 w-4" />Xでシェア</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => { void copyUrl(); }} className="min-h-11 cursor-pointer gap-2 focus:bg-white/10 focus:text-white"><Copy className="h-4 w-4" />URLをコピー</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => { void shareHp(); }} className="min-h-11 cursor-pointer gap-2 focus:bg-white/10 focus:text-white"><Share2 className="h-4 w-4" />その他の方法で共有</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </header>

        <FirstStepsCard />

        <NewCareerCard />

        <nav aria-label="管理メニュー" className="space-y-5">
          {sections.map((section) => <Section key={section.title} {...section} />)}
        </nav>
        {showAd && (
          <div className="mt-8 rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <ins className="adsbygoogle" style={{ display: "block" }} data-ad-client={adsenseClient} data-ad-slot={adsenseSlot} data-ad-format="auto" data-full-width-responsive="true" />
          </div>
        )}
        <footer className="mt-8 border-t border-white/10 pb-8 pt-4 text-center text-xs text-slate-400">FootChron 管理画面</footer>
      </div>
    </div>
  );
}

function FirstStepsCard() {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={`mb-2 flex w-full min-h-10 items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#111d2e] px-4 py-2 transition hover:bg-white/5 ${FOCUS}`}
      >
        <span className="flex items-center gap-3 text-xs font-semibold text-white">
          <span className="text-base" aria-hidden="true">📖</span>
          <span className="flex flex-col items-start leading-tight">
            <span>はじめての方へ</span>
            <span className="text-[10px] font-normal text-slate-400">使い方を見る</span>
          </span>
        </span>
        <ChevronRight className="h-4 w-4 text-slate-400" aria-hidden="true" />
      </button>
      {isOpen && <TutorialModal onClose={() => setIsOpen(false)} />}
    </>
  );
}

function NewCareerCard() {
  const { careers, loading } = useCareer();
  const activeCount = careers.filter((c) => c.status !== "deleted").length;
  const isFull = !loading && activeCount >= MAX_CAREERS;

  const body = (
    <>
      <span className="flex min-w-0 items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-emerald-400/30 bg-emerald-400/10" aria-hidden="true">
          <FolderPlus className="h-4 w-4 text-emerald-400" />
        </span>
        <span className="flex min-w-0 flex-col items-start leading-tight">
          <span className="text-xs font-semibold text-white">新しいCareerを作成</span>
          <span className="text-[10px] font-normal text-slate-400">新作開始や別チーム用に、新しい記録を追加できます。</span>
          <span className="text-[10px] font-normal text-emerald-300/80">最大3件まで。選手の基本情報は作成時に引き継げます。</span>
        </span>
      </span>
      {isFull ? (
        <span className="shrink-0 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] font-bold text-slate-400">作成上限（3件）</span>
      ) : (
        <span className={`flex shrink-0 items-center gap-1 rounded-lg bg-[#1fd760] px-3 py-1.5 text-[10px] font-bold text-[#080c14] transition group-hover:bg-[#17c054]`}>
          作成する<ChevronRight className="h-3 w-3" aria-hidden="true" />
        </span>
      )}
    </>
  );

  const baseClass = `group mb-5 flex w-full items-center justify-between gap-3 rounded-xl border border-emerald-400/20 bg-[#111d2e] px-4 py-3 ${FOCUS}`;
  if (isFull) {
    return <div aria-disabled="true" className={`${baseClass} opacity-80`}>{body}</div>;
  }
  return (
    <Link href="/admin/careers/new" className={`${baseClass} transition hover:bg-white/5`}>
      {body}
    </Link>
  );
}

function TutorialModal({ onClose }: { onClose: () => void }) {
  const STEPS = [
    { title: "① チーム登録", href: "/admin/teams", label: "チーム管理へ進む", image: "/レクチャー２.jpg" },
    { title: "② 選手登録", href: "/admin/players", label: "選手管理へ進む", image: "/レクチャー１.jpg" },
    { title: "③ 大会・日程", href: "/admin/competitions", label: "大会管理へ進む", image: "/レクチャー３.jpg" },
    { title: "④ 試合結果入力", href: "/admin/matches", label: "試合一覧へ", image: "/レクチャー４.jpg" },
    { title: "⑤ 試合詳細記録", href: "/admin/matches", label: "試合一覧へ", image: "/レクチャー５.jpg" },
    { title: "⑥ 入力完了", label: "閉じる", image: "/レクチャー６.jpg" },
  ] as const;
  const [currentIndex, setCurrentIndex] = useState(0);
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const gesture = useRef({
    isPinching: false,
    initialDistance: 0,
    initialMid: { x: 0, y: 0 },
    initialScale: 1,
    initialTranslate: { x: 0, y: 0 },
    start: { x: 0, y: 0 },
    hasMoved: false,
  });
  const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const resetTransform = () => { setScale(1); setTranslate({ x: 0, y: 0 }); };

  const toggleZoom = (clientX: number, clientY: number) => {
    if (scale > 1) { resetTransform(); return; }
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) { setScale(2); return; }
    const center = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    const m = { x: clientX - center.x, y: clientY - center.y };
    const newScale = 2;
    setTranslate({ x: m.x - m.x * newScale, y: m.y - m.y * newScale });
    setScale(newScale);
  };

  const goNext = () => { if (currentIndex < STEPS.length - 1) { setCurrentIndex(i => i + 1); resetTransform(); } };
  const goPrev = () => { if (currentIndex > 0) { setCurrentIndex(i => i - 1); resetTransform(); } };
  const goTo = (i: number) => { setCurrentIndex(i); resetTransform(); };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    isDragging.current = true;
    const p = { x: e.clientX, y: e.clientY };
    pointers.current.set(e.pointerId, p);
    if (pointers.current.size === 1) {
      gesture.current = {
        ...gesture.current,
        isPinching: false,
        start: p,
        hasMoved: false,
        initialScale: scale,
        initialTranslate: { ...translate },
      };
    } else if (pointers.current.size === 2) {
      const pts = Array.from(pointers.current.values());
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      gesture.current = {
        ...gesture.current,
        isPinching: true,
        initialDistance: dist,
        initialMid: mid,
        initialScale: scale,
        initialTranslate: { ...translate },
        hasMoved: false,
      };
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = Array.from(pointers.current.values());
    if (pointers.current.size === 2 && gesture.current.isPinching) {
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const ratio = gesture.current.initialDistance ? dist / gesture.current.initialDistance : 1;
      const newScale = clamp(gesture.current.initialScale * ratio, 1, 3);
      const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      const t = gesture.current.initialTranslate;
      const s0 = gesture.current.initialScale;
      const newX = mid.x - (gesture.current.initialMid.x - t.x) * (newScale / s0);
      const newY = mid.y - (gesture.current.initialMid.y - t.y) * (newScale / s0);
      setScale(newScale);
      setTranslate({ x: newX, y: newY });
      return;
    }
    if (pointers.current.size === 1) {
      const start = gesture.current.start;
      const current = pts[0];
      const dx = current.x - start.x;
      const dy = current.y - start.y;
      if (Math.hypot(dx, dy) > 10) gesture.current.hasMoved = true;
      if (scale > 1) {
        setTranslate({ x: gesture.current.initialTranslate.x + dx, y: gesture.current.initialTranslate.y + dy });
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const ended = pointers.current.get(e.pointerId) || { x: e.clientX, y: e.clientY };
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 1) {
      const remaining = Array.from(pointers.current.values())[0];
      gesture.current = {
        ...gesture.current,
        isPinching: false,
        start: remaining,
        initialScale: scale,
        initialTranslate: { ...translate },
        hasMoved: false,
      };
      return;
    }
    if (pointers.current.size === 0) {
      isDragging.current = false;
      if (gesture.current.isPinching) {
        gesture.current.isPinching = false;
        if (scale <= 1.05) resetTransform();
        return;
      }
      const start = gesture.current.start;
      const dx = ended.x - start.x;
      const dy = ended.y - start.y;
      const dist = Math.hypot(dx, dy);
      if (scale === 1) {
        if (dist > 50) {
          if (dx < 0) goNext();
          else if (dx > 0) goPrev();
          resetTransform();
          return;
        }
        if (dist < 12) {
          toggleZoom(ended.x, ended.y);
          return;
        }
      }
      gesture.current.hasMoved = false;
    }
  };

  const handlePointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) isDragging.current = false;
  };

  const step = STEPS[currentIndex];
  const transformStyle = { transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`, transition: isDragging.current ? "none" : "transform 200ms ease-out" };

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 p-0 sm:p-6" role="dialog" aria-modal="true" aria-label="使い方">
      <div className="relative flex h-[80vh] w-full flex-col overflow-hidden bg-[#0d1927] sm:h-[70vh] sm:max-w-5xl sm:rounded-2xl">
        <div
          ref={containerRef}
          className="relative flex-1 min-h-0 overflow-hidden touch-none bg-black/40 pt-24"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          style={{ touchAction: "none" }}
        >
          <div onPointerDown={(e) => e.stopPropagation()} className="absolute left-1/2 top-3 z-10 w-[90%] -translate-x-1/2 grid grid-cols-3 gap-2 rounded-2xl border border-white/10 bg-[#0d1927]/80 px-3 py-2">
            {STEPS.map((s, i) => (
              <button
                key={s.title}
                type="button"
                onClick={() => goTo(i)}
                className={`w-full truncate rounded-full px-2 py-1 text-[11px] font-bold sm:px-3 sm:py-2 sm:text-xs ${i === currentIndex ? "bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/30" : "bg-white/5 text-slate-300 hover:bg-white/10"}`}
              >
                {s.title}
              </button>
            ))}
          </div>
          <div className="relative h-full w-full" style={transformStyle}>
            <Image src={step.image} alt={step.title} fill priority className="pointer-events-none object-contain" sizes="100vw" />
          </div>
          <button type="button" onClick={onClose} onPointerDown={(e) => e.stopPropagation()} aria-label="閉じる" className={`absolute right-3 bottom-3 z-20 flex h-10 w-10 items-center justify-center rounded-full border border-white/30 bg-white/15 text-white shadow-lg transition hover:bg-white/25 ${FOCUS}`}>
            <X className="h-6 w-6" aria-hidden="true" />
          </button>
        </div>

        <div className="shrink-0 border-t border-white/10 p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <button type="button" onClick={goPrev} disabled={currentIndex === 0} className={`flex items-center gap-1 rounded-lg bg-white/10 px-4 py-2 text-sm font-bold text-white transition hover:bg-white/20 disabled:opacity-40 ${FOCUS}`}>
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />前へ
            </button>
            <span className="text-sm font-bold text-white">{currentIndex + 1} / {STEPS.length}</span>
            <button type="button" onClick={goNext} disabled={currentIndex === STEPS.length - 1} className={`flex items-center gap-1 rounded-lg bg-white/10 px-4 py-2 text-sm font-bold text-white transition hover:bg-white/20 disabled:opacity-40 ${FOCUS}`}>
              次へ<ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          {(step as any).href ? (
            <Link href={(step as any).href} className={`flex min-h-12 items-center justify-center rounded-xl bg-[#1fd760] px-4 py-3 text-sm font-black text-[#080c14] transition hover:bg-[#17c054] ${FOCUS}`}>
              {step.label}
            </Link>
          ) : (
            <button type="button" onClick={onClose} className={`flex min-h-12 items-center justify-center rounded-xl bg-[#1fd760] px-4 py-3 text-sm font-black text-[#080c14] transition hover:bg-[#17c054] ${FOCUS}`}>
              {step.label}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ title, items, color }: { title: string; items: NavItem[]; color: string }) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-3">
        <div className="h-px w-3" style={{ backgroundColor: color }} />
        <h2 className="text-xs font-bold tracking-wider" style={{ color }}>{title}</h2>
        <div className="h-px flex-1 bg-white/10" />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        {items.map((item) => {
          const Icon = item.icon;
          const content = <>
            {item.badge && <span className="absolute right-1 top-1 rounded-full border border-amber-400/25 bg-amber-400/10 px-2 py-0.5 text-[10px] font-bold text-amber-400">{item.badge}</span>}
            <span className="flex h-11 w-11 items-center justify-center rounded-xl border" style={{ borderColor: `${color}33` }}><Icon className="h-5 w-5" style={{ color, strokeWidth: 1.8 }} aria-hidden="true" /></span>
            <span className="text-center text-sm font-semibold leading-tight">{item.label}</span>
            {item.disabled && <span className="text-[10px] text-slate-400">Pro対象</span>}
          </>;
          const className = `relative flex min-h-28 flex-col items-center justify-center gap-3 rounded-2xl border border-transparent px-2 py-5 ${FOCUS}`;
          if (item.disabled) return <div key={item.label} aria-disabled="true" className={`${className} opacity-60`}>{content}</div>;
          if (item.external) return <a key={item.label} href={item.href} target="_blank" rel="noopener noreferrer" className={`${className} hover:border-white/10 hover:bg-white/5`}>{content}</a>;
          return <Link key={item.label} href={item.href} className={`${className} hover:border-white/10 hover:bg-white/5`}>{content}</Link>;
        })}
      </div>
    </section>
  );
}
