"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useSearchParams } from "next/navigation";
import { getPlanTier } from "@/lib/plan-limits";
import Image from "next/image";

export default function PlanPage() {
  const [loading, setLoading] = useState(false);
  const { user, refreshUserProfile } = useAuth();
  const planTier = getPlanTier(user?.plan);
  const isPro = planTier === "pro";
  const isTm = planTier === "tm";
  const searchParams = useSearchParams();

  useEffect(() => {
    const result = searchParams.get("result");
    if (result === "success") {
      void refreshUserProfile?.();
    }
  }, [refreshUserProfile, searchParams]);

  const handleUpgrade = async () => {
    setLoading(true);
    try {
      const idToken = await (await import("firebase/auth")).getAuth().currentUser?.getIdToken();
      if (!idToken) {
        alert("ログインしてからプランを変更してください。");
        return;
      }

      const res = await fetch("/api/stripe/create-checkout-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
      });

      if (!res.ok) {
        alert("決済ページの作成に失敗しました。");
        return;
      }

      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert("決済ページのURLを取得できませんでした。");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleOpenBillingPortal = async () => {
    setLoading(true);
    try {
      const authModule = await import("firebase/auth");
      const idToken = await authModule.getAuth().currentUser?.getIdToken();

      if (!idToken) {
        alert("ログインしてから請求情報を確認してください。");
        return;
      }

      const res = await fetch("/api/stripe/create-portal-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ ownerUid: (user as any)?.ownerUid || user?.uid }),
      });

      if (!res.ok) {
        let msg = "請求情報画面の作成に失敗しました。";
        try {
          const data = await res.json();
          if (data?.error) msg = String(data.error);
          if (data?.diag) {
            msg += `\n\nDIAG:\n${JSON.stringify(data.diag, null, 2)}`;
          }
          if (data?.debug && process.env.NODE_ENV !== "production") {
            msg += `\n\nDEBUG:\n${JSON.stringify(data.debug, null, 2)}`;
          }
        } catch {
          // ignore
        }
        alert(msg);
        return;
      }

      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert("請求情報画面のURLを取得できませんでした。");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-2xl md:text-3xl font-bold mb-4">プラン</h1>

      <div className="mb-6">
        <div className="relative w-full sm:hidden">
          <Image
            src="/最新プラン.jpg"
            alt="プラン内容"
            width={1170}
            height={2532}
            className="w-full h-auto"
            sizes="100vw"
            priority
          />
        </div>
        <div className="hidden sm:block w-full max-w-5xl">
          <Image
            src="/プラン画像PC.png"
            alt="プラン内容"
            width={1920}
            height={1080}
            className="w-full h-auto"
            sizes="(min-width: 768px) 1024px, 100vw"
            priority
          />
        </div>
      </div>

      <div className="grid gap-4 max-w-5xl md:grid-cols-3">
        <div className="space-y-4 bg-white text-gray-900 border rounded-lg p-6">
          <div>
            <h2 className="text-lg font-semibold mb-1">Free プラン</h2>
            <p className="text-sm text-muted-foreground">月額 0円</p>
          </div>
          <div className="pt-4 flex flex-col gap-2">
            {!isPro && !isTm ? (
              <p className="text-sm font-semibold text-emerald-700">現在 Free プランをご利用中です。</p>
            ) : (
              <p className="text-sm text-muted-foreground">現在のプラン: {isPro ? "Pro" : "TM"}</p>
            )}
          </div>
        </div>

        <div className="space-y-4 bg-white text-gray-900 border rounded-lg p-6">
          <div>
            <h2 className="text-lg font-semibold mb-1">Pro プラン</h2>
            <p className="text-sm text-muted-foreground">月額 380円</p>
          </div>
          <div className="pt-4 flex flex-col gap-2">
            {isPro ? (
              <>
                <p className="text-sm font-semibold text-emerald-700">現在 Pro プランをご利用中です。</p>
                <p className="text-xs text-muted-foreground">
                  決済と請求管理は Stripe 上で行われます。プランの変更や解約は、下記ボタンから開く Stripe の画面で行ってください。
                </p>
                <Button
                  onClick={handleOpenBillingPortal}
                  disabled={loading}
                  variant="outline"
                  className="w-full md:w-auto text-sm"
                >
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  契約内容の確認・解約はこちら
                </Button>
              </>
            ) : (
              <>
                <Button
                  onClick={handleUpgrade}
                  disabled={loading || isTm}
                  className="w-full md:w-auto bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm px-6 py-2 rounded-md shadow-md"
                >
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  有料プランにアップグレード
                </Button>
                <p className="text-xs text-muted-foreground">ボタンを押すと Stripe の決済画面が開きます。</p>
              </>
            )}
          </div>
        </div>

        <div className="space-y-4 bg-white text-gray-900 border rounded-lg p-6">
          <div>
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-semibold mb-1">TM プラン</h2>
              <span className="text-xs font-semibold px-2 py-1 rounded-full bg-slate-200 text-slate-700">準備中</span>
            </div>
            <p className="text-sm text-muted-foreground">チーム向け（決済準備中）</p>
          </div>
          <div className="pt-4 flex flex-col gap-2">
            {isTm ? (
              <p className="text-sm font-semibold text-emerald-700">現在 TM プランをご利用中です。</p>
            ) : (
              <p className="text-sm text-muted-foreground">準備中です。</p>
            )}
            <Button disabled variant="outline" className="w-full md:w-auto text-sm">
              準備中
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
