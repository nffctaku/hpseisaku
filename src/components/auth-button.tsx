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

  const shouldUseRedirect = () => {
    if (typeof window === 'undefined') return false;
    const ua = window.navigator.userAgent || '';
    // iOS Safari / iOS in-app browsers often block popups
    const isiOS = /iPhone|iPad|iPod/i.test(ua);
    const isInApp = /(Line|FBAN|FBAV|Instagram|MicroMessenger|Twitter)/i.test(ua);
    return isiOS || isInApp;
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
    );
  }

  if (isMobile) {
    return (
      <button onClick={handleSignIn} className="hover:text-gray-300 w-full text-center">
        ログイン
      </button>
    );
  }
  return <Button onClick={handleSignIn}>Login</Button>;
}
