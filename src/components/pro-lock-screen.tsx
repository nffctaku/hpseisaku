"use client";

import Link from "next/link";
import { Crown, Lock } from "lucide-react";

export function ProLockScreen() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center bg-[#050a12] px-6 text-center text-white">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/10">
        <Lock className="h-8 w-8 text-yellow-400" />
      </div>
      <h1 className="mt-6 text-2xl font-black">Pro メンバー限定</h1>
      <p className="mt-2 text-sm font-bold text-white/70">
        この機能は Pro プランでご利用いただけます。
      </p>
      <Link
        href="/admin/plan"
        className="mt-6 inline-flex items-center gap-2 rounded-full bg-yellow-500 px-6 py-2.5 text-sm font-black text-slate-950 transition hover:bg-yellow-400"
      >
        <Crown className="h-4 w-4" />
        プランをアップグレード
      </Link>
    </div>
  );
}
