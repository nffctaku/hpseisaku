"use client";

import { signInWithPopup, signInWithRedirect, signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { GoogleAuthProvider } from "firebase/auth";
import { doc, setDoc, deleteDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
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
        await signInWithRedirect(auth, provider);
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
      className="bg-blue-600 text-white hover:bg-blue-700"
    >
      Login
    </Button>
  );
}
