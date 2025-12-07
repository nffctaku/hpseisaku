"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";

export default function PlanPage() {
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();
  const isPro = user?.plan === "pro";

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
      });

      if (!res.ok) {
        alert("請求情報画面の作成に失敗しました。");
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

      <div className="max-w-xl space-y-4 bg-white text-gray-900 border rounded-lg p-6">
        <div>
          <h2 className="text-lg font-semibold mb-1">Pro プラン</h2>
          <p className="text-sm text-muted-foreground">月額 380円（2週間無料トライアル付き）</p>
        </div>
        <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
          <li>画像アップロード機能のフル利用</li>
          <li>スタッツ・順位表などの高度な機能</li>
          <li>その他の制限緩和（詳細は今後追加予定）</li>
        </ul>
        <div className="pt-4 flex flex-col gap-2">
          {isPro ? (
            <>
              <p className="text-sm font-semibold text-emerald-700">
                現在 Pro プランをご利用中です。
              </p>
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
                disabled={loading}
                className="w-full md:w-auto bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm px-6 py-2 rounded-md shadow-md"
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                有料プランにアップグレード（2週間無料）
              </Button>
              <p className="text-xs text-muted-foreground">
                ボタンを押すと Stripe の決済画面が開きます。
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
