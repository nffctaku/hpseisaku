"use client";

import { signInWithPopup, signInWithRedirect, signOut, getAdditionalUserInfo } from "firebase/auth";
import { auth, useSelfAuthDomainForRedirect } from "@/lib/firebase";
import { GoogleAuthProvider } from "firebase/auth";
import { useAuth } from "@/contexts/AuthContext";
import {
  getAcquisitionSnapshot,
  saveUserAcquisition,
  setSignupSource,
  trackEvent,
} from "@/lib/analytics";
import { useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useCareer } from "@/contexts/CareerContext";
import { Shield, Plus, Settings, CreditCard, LogOut, ChevronRight, User } from 'lucide-react';
import { getPlanTier } from '@/lib/plan-limits';

export function AuthButton({ isMobile = false }: { isMobile?: boolean }) {
  const { user } = useAuth();
  const { activeCareer, careers, switchCareer } = useCareer();
  const pathname = usePathname();
  const router = useRouter();
  const signingInRef = useRef(false);
  const isAdmin = typeof pathname === "string" && pathname.startsWith("/admin");
  console.log('[AuthButton] render', { hasUser: !!user, user });

  const planLabel = getPlanTier(user?.plan) !== 'free' ? 'Pro' : 'Free';
  const planClassName = getPlanTier(user?.plan) !== 'free'
    ? 'bg-emerald-600/20 text-emerald-200 border-emerald-500/30'
    : 'bg-slate-700/50 text-slate-200 border-slate-500/30';

  const handleSignIn = async () => {
    if (typeof window !== 'undefined') {
      const ua = window.navigator.userAgent || '';
      const isInApp = /(Line|FBAN|FBAV|Instagram|MicroMessenger|Twitter)/i.test(ua);
      if (isInApp) {
        window.alert('LINE/Instagram等のアプリ内ブラウザではGoogleログインがブロックされます。右上のメニューから「ブラウザで開く」を選ぶか、Safari/Chromeでこのページを開いてからログインしてください。');
        return;
      }
    }

    if (signingInRef.current) return;
    signingInRef.current = true;

    const snap = getAcquisitionSnapshot();
    void trackEvent("signup_cta_click", null, {
      source: snap.signupSource || "admin_login",
      firstSource: snap.firstSource,
      sampleViewed: snap.sampleViewed,
    });

    const provider = new GoogleAuthProvider();
    const ua = window.navigator.userAgent || '';
    const isMobileBrowser = /iPhone|iPad|iPod|Android/i.test(ua)
      || (/Macintosh/i.test(ua) && window.navigator.maxTouchPoints > 1);
    if (isMobileBrowser) {
      // スマホではpopupが不安定＆余分な往復になるため直接redirect。
      // redirectの認証結果はauthDomain側ストレージに保存されるため、
      // iOS等のサードパーティ制限を避けるよう自ドメインに切替える。
      // 注意: signInWithRedirectのpromiseは設計上resolveしない（画面遷移するため）。
      // awaitするとfinallyが走らずロックが残り、bfcache復帰後にボタンが
      // 無反応になるため、awaitせずcatchでエラー処理し、pageshowでロックを戻す。
      const resetLockOnPageShow = (e: PageTransitionEvent) => {
        if (e.persisted) {
          signingInRef.current = false;
          window.removeEventListener('pageshow', resetLockOnPageShow);
        }
      };
      window.addEventListener('pageshow', resetLockOnPageShow);
      try {
        useSelfAuthDomainForRedirect();
        void signInWithRedirect(auth, provider).catch((e: any) => {
          console.error('[AuthButton] Error signing in with redirect', e);
          signingInRef.current = false;
          window.alert(`ログインエラー: ${e.message || e.code || 'Unknown error'}`);
        });
      } catch (e: any) {
        console.error('[AuthButton] Error starting redirect', e);
        signingInRef.current = false;
        window.alert(`ログインエラー: ${e.message || e.code || 'Unknown error'}`);
      }
      return;
    }
    try {
      console.log('[AuthButton] Using popup');
      const result = await signInWithPopup(auth, provider);
      const info = getAdditionalUserInfo(result);
      const isNewUser = info?.isNewUser ?? false;
      if (isNewUser && result.user) {
        void saveUserAcquisition(result.user.uid);
        void trackEvent("signup_complete", result.user.uid, {
          firstSource: snap.firstSource,
          firstMedium: snap.firstMedium,
          firstCampaign: snap.firstCampaign,
          firstReferrer: snap.firstReferrer,
          sampleViewed: snap.sampleViewed,
          signupSource: snap.signupSource,
        });
      }
    } catch (error: any) {
      console.error('[AuthButton] Error signing in with popup', error);
      if (error.code === 'auth/cancelled-popup-request' || error.code === 'auth/popup-closed-by-user') {
        // 無視してOK
      } else if (error.code === 'auth/popup-blocked' || error.code === 'auth/operation-not-supported-in-this-environment') {
        // signInWithRedirectのpromiseは設計上resolveしない（画面遷移するため）。
        // awaitするとfinallyが走らずロックが残るので、awaitせずcatchのみ付ける。
        useSelfAuthDomainForRedirect();
        void signInWithRedirect(auth, provider).catch((e: any) => {
          console.error('[AuthButton] Error signing in with redirect fallback', e);
          signingInRef.current = false;
        });
      } else {
        window.alert(`ログインエラー: ${error.message || error.code || 'Unknown error'}`);
      }
    } finally {
      signingInRef.current = false;
    }
  };

  const handleSignOut = async () => {
    try {
      console.log('[AuthButton] handleSignOut start');
      await signOut(auth);
      window.location.href = '/';
    } catch (error) {
      console.error("Error signing out", error);
    }
  };

  if (user) {
    if (isMobile) {
      return null; // Already in admin, no need for this link
    }

    const otherCareers = careers.filter((c) => c.id !== activeCareer?.id);

    return (
      <div className="flex items-center gap-2">
        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${planClassName}`}>
          {planLabel}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900"
            >
              <Avatar>
                <AvatarFallback><User /></AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className={isAdmin
              ? "w-64 border-white/10 bg-[#111d2e] text-[#c8d4e8]"
              : "w-64 bg-white text-gray-900"}
          >
            {activeCareer ? (
              <div className={isAdmin ? "px-3 py-3" : "px-3 py-3 text-gray-900"}>
                <div className="flex items-center gap-3">
                  {activeCareer.clubLogo ? (
                    <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full">
                      <Image src={activeCareer.clubLogo} alt={activeCareer.clubName} fill className="object-contain" sizes="36px" />
                    </div>
                  ) : (
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-700">
                      <Shield className="h-4 w-4 text-white" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold text-emerald-400">{activeCareer.name.trim() || "名称未設定"}</div>
                    <div className="truncate text-xs text-slate-300">{activeCareer.clubName}</div>
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-1.5 text-[11px] font-bold text-emerald-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  現在使用中
                </div>
              </div>
            ) : (
              <DropdownMenuLabel>{user.displayName}</DropdownMenuLabel>
            )}

            <DropdownMenuSeparator className={isAdmin ? "bg-white/10" : ""} />

            {otherCareers.length > 0 && (
              <>
                <div className={`px-3 py-2 text-[10px] font-bold uppercase tracking-wider ${isAdmin ? "text-slate-500" : "text-slate-400"}`}>
                  最近のCareer
                </div>
                {otherCareers.slice(0, 4).map((c) => (
                  <DropdownMenuItem
                    key={c.id}
                    onClick={async () => {
                      await switchCareer(c.id);
                      router.refresh();
                    }}
                    className={isAdmin ? "cursor-pointer focus:bg-white/10 focus:text-white" : "cursor-pointer"}
                  >
                    <div className="flex w-full items-center gap-2">
                      {c.clubLogo ? (
                        <div className="relative h-5 w-5 shrink-0 overflow-hidden rounded-full">
                          <Image src={c.clubLogo} alt={c.clubName} fill className="object-contain" sizes="20px" />
                        </div>
                      ) : (
                        <Shield className="h-4 w-4 text-slate-400" />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm">{c.name.trim() || "名称未設定"}</span>
                        <span className="block truncate text-xs text-slate-400">{c.clubName}</span>
                      </span>
                    </div>
                  </DropdownMenuItem>
                ))}
                {otherCareers.length > 4 && (
                  <DropdownMenuItem asChild className={isAdmin ? "focus:bg-white/10 focus:text-white" : ""}>
                    <Link href="/admin/profile" className="flex items-center justify-between text-xs">
                      すべてのCareerを見る
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator className={isAdmin ? "bg-white/10" : ""} />
              </>
            )}

            <DropdownMenuItem asChild className={isAdmin ? "focus:bg-white/10 focus:text-white" : ""}>
              <Link href="/admin/careers/new" className="flex items-center gap-2 cursor-pointer">
                <Plus className="h-4 w-4" />
                新しいCareer
              </Link>
            </DropdownMenuItem>

            <DropdownMenuItem asChild className={isAdmin ? "focus:bg-white/10 focus:text-white" : ""}>
              <Link href="/admin/profile" className="flex items-center gap-2 cursor-pointer">
                <Settings className="h-4 w-4" />
                キャリア管理
              </Link>
            </DropdownMenuItem>

            <DropdownMenuItem asChild className={isAdmin ? "focus:bg-white/10 focus:text-white" : ""}>
              <Link href="/admin/profile" className="flex items-center gap-2 cursor-pointer">
                <User className="h-4 w-4" />
                プロフィール
              </Link>
            </DropdownMenuItem>

            <DropdownMenuItem asChild className={isAdmin ? "focus:bg-white/10 focus:text-white" : ""}>
              <Link href="/admin/plan" className="flex items-center gap-2 cursor-pointer">
                <CreditCard className="h-4 w-4" />
                プラン・契約
              </Link>
            </DropdownMenuItem>

            <DropdownMenuSeparator className={isAdmin ? "bg-white/10" : ""} />

            <DropdownMenuItem
              onClick={handleSignOut}
              className={isAdmin ? "cursor-pointer focus:bg-white/10 focus:text-white" : "cursor-pointer"}
            >
              <LogOut className="mr-2 h-4 w-4" />
              ログアウト
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  }

  if (isMobile) {
    return (
      <button onClick={handleSignIn} className="hover:text-gray-300 w-full text-center">
        ログイン
      </button>
    );
  }
  return (
    <Button
      onClick={handleSignIn}
      variant="outline"
      className="h-[54px] w-[234px] rounded-[10px] border border-gray-300 bg-white text-[15px] font-bold text-gray-900 shadow-none hover:bg-gray-50"
    >
      <svg className="mr-3 h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
      </svg>
      Googleでログイン
    </Button>
  );
}
