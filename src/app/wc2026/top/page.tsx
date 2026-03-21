"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BarChart3, ClipboardList, Crown, RefreshCw, Target, Trophy } from "lucide-react";

type CountdownParts = {
  done: boolean;
  totalMs: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
};

function computeCountdownParts(target: Date, now: Date): CountdownParts {
  const diffMs = target.getTime() - now.getTime();
  if (Number.isNaN(diffMs)) {
    return { done: true, totalMs: 0, days: 0, hours: 0, minutes: 0, seconds: 0 };
  }
  if (diffMs <= 0) {
    return { done: true, totalMs: 0, days: 0, hours: 0, minutes: 0, seconds: 0 };
  }

  const totalSeconds = Math.floor(diffMs / 1000);
  const days = Math.floor(totalSeconds / (60 * 60 * 24));
  const hours = Math.floor((totalSeconds - days * 60 * 60 * 24) / (60 * 60));
  const minutes = Math.floor((totalSeconds - days * 60 * 60 * 24 - hours * 60 * 60) / 60);
  const seconds = totalSeconds - days * 60 * 60 * 24 - hours * 60 * 60 - minutes * 60;

  return { done: false, totalMs: diffMs, days, hours, minutes, seconds };
}

export default function Wc2026TopPage() {
  const openingMatchKickoff = useMemo(() => new Date("2026-06-11T04:00:00+09:00"), []);
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => {
      window.clearInterval(id);
    };
  }, []);

  const countdown = useMemo(() => computeCountdownParts(openingMatchKickoff, now), [openingMatchKickoff, now]);

  const items = [
    {
      title: "予想する",
      description: "/admin/sandbox/wc2026",
      href: "/admin/sandbox/wc2026",
      icon: Target,
    },
    {
      title: "結果",
      description: "/wc2026",
      href: "/wc2026",
      icon: Trophy,
    },
    {
      title: "ランキング",
      description: "参加ユーザーランキング",
      href: "/wc2026/ranking",
      icon: BarChart3,
    },
    {
      title: "マイページ",
      description: "/admin/mypage",
      href: "/admin/mypage",
      icon: Crown,
    },
    {
      title: "結果入力管理",
      description: "/admin/wc2026/results",
      href: "/admin/wc2026/results",
      icon: ClipboardList,
    },
    {
      title: "更新管理",
      description: "/admin/wc2026/recompute",
      href: "/admin/wc2026/recompute",
      icon: RefreshCw,
    },
  ] as const;

  return (
    <div className="relative">
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900" />
      <div className="container mx-auto py-10 space-y-6">
        <div className="rounded-2xl border bg-white/5 backdrop-blur px-5 py-6 sm:px-8 sm:py-8">
          <div className="flex flex-col gap-2">
            <div className="text-xs text-slate-300">/wc2026/top</div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">WC2026 予想プラットフォーム</h1>
            <div className="text-sm text-slate-300">
              予想・結果・ランキング・管理画面へのショートカット
            </div>
            <div className="mt-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
              <div className="text-xs text-slate-300">開幕戦まで</div>
              {countdown.done ? (
                <div className="mt-1 text-lg font-bold text-white">開幕</div>
              ) : (
                <div className="mt-1 text-lg font-bold text-white">
                  {countdown.days}日 {countdown.hours}時間 {countdown.minutes}分 {countdown.seconds}秒
                </div>
              )}
              <div className="mt-1 text-[11px] text-slate-400">
                日本時間: {openingMatchKickoff.toLocaleString()}
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <Card key={item.href} className="bg-white/5 text-white border-white/10">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-white/10">
                      <Icon className="h-5 w-5" />
                    </span>
                    <span>{item.title}</span>
                  </CardTitle>
                  <CardDescription className="text-slate-300">{item.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button
                    asChild
                    className="w-full bg-blue-600 text-white hover:bg-blue-500 focus-visible:ring-blue-400"
                  >
                    <Link href={item.href}>{item.title}</Link>
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
