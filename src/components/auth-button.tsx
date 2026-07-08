"use client";

import { signInWithPopup, signInWithRedirect, signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { GoogleAuthProvider } from "firebase/auth";
import { useAuth } from "@/contexts/AuthContext";
import Link from "next/link";
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
import { User } from 'lucide-react';

export function AuthButton({ isMobile = false }: { isMobile?: boolean }) {
  const { user } = useAuth();
  console.log('[AuthButton] render', { hasUser: !!user, user });

  const planLabel = user?.plan === 'pro' ? 'Pro' : 'Free';
  const planClassName = user?.plan === 'pro'
    ? 'bg-emerald-600/20 text-emerald-200 border-emerald-500/30'
    : 'bg-slate-700/50 text-slate-200 border-slate-500/30';

  const shouldUseRedirect = () => {
    if (typeof window === 'undefined') return false;
    const ua = window.navigator.userAgent || '';
    // In-app browsers often block popups
    const isInApp = /(Line|FBAN|FBAV|Instagram|MicroMessenger|Twitter)/i.test(ua);
    return isInApp;
  };

  const handleSignIn = async () => {
    const provider = new GoogleAuthProvider();
    try {
      console.log('[AuthButton] handleSignIn start');
      if (shouldUseRedirect()) {
        window.alert('LINE/Instagram等のアプリ内ブラウザではGoogleログインがブロックされます。Safari/Chromeでこのページを開いてからログインしてください。');
        return;
      }
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Error signing in with Google", error);
      // Fallback for popup-blocked / cancelled popup requests
      try {
        await signInWithRedirect(auth, provider);
      } catch (e) {
        console.error('Error signing in with redirect fallback', e);
      }
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
    return (
      <div className="flex items-center gap-2">
        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${planClassName}`}>
          {planLabel}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger>
            <Avatar>
              <AvatarFallback><User /></AvatarFallback>
            </Avatar>
          </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="bg-white text-gray-900">
          <DropdownMenuLabel>{user.displayName}</DropdownMenuLabel>
          <DropdownMenuSeparator />
                    <Link href="/admin/club">
            <DropdownMenuItem>管理ダッシュボード</DropdownMenuItem>
          </Link>
          <DropdownMenuItem onClick={handleSignOut}>ログアウト</DropdownMenuItem>
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
