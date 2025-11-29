"use client";

import { signInWithPopup, signOut } from "firebase/auth";
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

  const handleSignIn = async () => {
    const provider = new GoogleAuthProvider();
    try {
      console.log('[AuthButton] handleSignIn start');
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Error signing in with Google", error);
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
        <DropdownMenuContent align="end">
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
