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
  const { user, ownerUid, refreshUserProfile } = useAuth();
  const planTier = getPlanTier(user?.plan);
  const isPro = planTier === "pro";
  const isOfficia = planTier === "officia";
  const isPaid = planTier !== "free";
  const searchParams = useSearchParams();

  useEffect(() => {
    const result = searchParams.get("result");
    if (result === "success") {
      void refreshUserProfile?.();
    }
  }, [refreshUserProfile, searchParams]);

  const handleUpgrade = async (opts?: { plan?: "pro" | "officia"; productId?: string }) => {
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
        body: JSON.stringify({ plan: opts?.plan, productId: opts?.productId }),
      });

      if (!res.ok) {
        let detail = '';
        try {
          const data = await res.json();
          const msg = typeof (data as any)?.error === 'string' ? (data as any).error : '';
          const code = typeof (data as any)?.code === 'string' ? (data as any).code : '';
          detail = [msg, code].filter(Boolean).join(' ');
        } catch {
          try {
            detail = await res.text();
          } catch {
            detail = '';
          }
        }
        alert(`決済ページの作成に失敗しました。${detail ? `\n${detail}` : ''}`);
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
        body: JSON.stringify({ ownerUid: ownerUid || user?.uid }),
      });

      if (!res.ok) {
        let detail = '';
        try {
          const data = await res.json();
          const msg = typeof (data as any)?.error === 'string' ? (data as any).error : '';
          const code = typeof (data as any)?.code === 'string' ? (data as any).code : '';
          detail = [msg, code].filter(Boolean).join(' ');
          if (process.env.NODE_ENV !== "production") {
            console.error("[create-portal-session] failed", data);
          }
        } catch {
          try {
            detail = await res.text();
          } catch {
            detail = '';
          }
        }
        alert(`請求情報の取得に失敗しました。${detail ? `\n${detail}` : ''}`);
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

      <div className="grid gap-4 max-w-5xl md:grid-cols-4">
        <div className="space-y-4 bg-white text-gray-900 border rounded-lg p-6">
          <div>
            <h2 className="text-lg font-semibold mb-1">Free プラン</h2>
            <p className="text-sm text-muted-foreground">月額 0円</p>
          </div>
          <div className="pt-4 flex flex-col gap-2">
            {!isPaid ? (
              <p className="text-sm font-semibold text-emerald-700">現在 Free プランをご利用中です。</p>
            ) : (
              <p className="text-sm text-muted-foreground">現在のプラン: {isPro ? "Pro" : "Officia"}</p>
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
                  onClick={() => handleUpgrade({ plan: "pro" })}
                  disabled={loading || isOfficia}
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
            <h2 className="text-lg font-semibold mb-1">Officia 年間プラン</h2>
            <p className="text-sm text-muted-foreground">年額 22,000円</p>
          </div>
          <div className="pt-4 flex flex-col gap-2">
            {isOfficia ? (
              <>
                <p className="text-sm font-semibold text-emerald-700">現在 Officia プランをご利用中です。</p>
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
                {isPro ? (
                  <>
                    <p className="text-xs text-muted-foreground">
                      現在 Pro プランをご利用中です。Officia への変更は Stripe の画面から行ってください。
                    </p>
                    <Button
                      onClick={handleOpenBillingPortal}
                      disabled={loading}
                      variant="outline"
                      className="w-full md:w-auto text-sm"
                    >
                      {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      契約内容の確認・変更はこちら
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      onClick={() => handleUpgrade({ plan: "officia", productId: "prod_TtnQto5avOK0S9" })}
                      disabled={loading}
                      className="w-full md:w-auto bg-slate-900 hover:bg-slate-800 text-white font-semibold text-sm px-6 py-2 rounded-md shadow-md"
                    >
                      {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Officia 年間プランに申し込む
                    </Button>
                    <p className="text-xs text-muted-foreground">ボタンを押すと Stripe の決済画面が開きます。</p>
                  </>
                )}
              </>
            )}
          </div>
        </div>

        <div className="space-y-4 bg-white text-gray-900 border rounded-lg p-6">
          <div>
            <h2 className="text-lg font-semibold mb-1">Officia プラン</h2>
            <p className="text-sm text-muted-foreground">月額 1,980円</p>
          </div>
          <div className="pt-4 flex flex-col gap-2">
            {isOfficia ? (
              <>
                <p className="text-sm font-semibold text-emerald-700">現在 Officia プランをご利用中です。</p>
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
                {isPro ? (
                  <>
                    <p className="text-xs text-muted-foreground">
                      現在 Pro プランをご利用中です。Officia への変更は Stripe の画面から行ってください。
                    </p>
                    <Button
                      onClick={handleOpenBillingPortal}
                      disabled={loading}
                      variant="outline"
                      className="w-full md:w-auto text-sm"
                    >
                      {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      契約内容の確認・変更はこちら
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      onClick={() => handleUpgrade({ plan: "officia", productId: "prod_Ttjx45ygceCBbw" })}
                      disabled={loading}
                      className="w-full md:w-auto bg-slate-900 hover:bg-slate-800 text-white font-semibold text-sm px-6 py-2 rounded-md shadow-md"
                    >
                      {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Officia プランに申し込む
                    </Button>
                    <p className="text-xs text-muted-foreground">ボタンを押すと Stripe の決済画面が開きます。</p>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
