import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BarChart3, ClipboardList, Crown, RefreshCw, Target, Trophy } from "lucide-react";

export default function Wc2026TopPage() {
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
      href: "/admin/mypage#ranking",
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
