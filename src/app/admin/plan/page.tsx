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

  const handleOpenBillingPortal = async (opts?: { flow?: "manage" | "cancel" }) => {
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
        body: JSON.stringify({ ownerUid: ownerUid || user?.uid, flow: opts?.flow || "manage" }),
      });

      if (!res.ok) {
        let detail = '';
        try {
          const data = await res.json();
          const msg = typeof (data as any)?.error === 'string' ? (data as any).error : '';
          const code = typeof (data as any)?.code === 'string' ? (data as any).code : '';
          const base = [msg, code].filter(Boolean).join(' ');
          detail = base || JSON.stringify(data);
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
    <div className="min-h-screen bg-[#0b1220] p-4 md:p-8">
      <div className="mx-auto max-w-4xl">
        <h1 className="text-2xl md:text-3xl font-bold text-white mb-8">プラン</h1>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Free Card */}
          <div className="relative rounded-xl border border-[#263149] bg-[#141d2e] p-6 shadow-lg">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-[14px] font-semibold text-white">Free プラン</h2>
              <p className="text-[20px] font-semibold text-[#e5e7eb]">月額 0円</p>
            </div>
            <p className="text-[11px] text-[#8b93a7] mb-6">まずは無料で始められます</p>
            
            <ul className="space-y-3 mb-6">
              <li className="flex items-start gap-2">
                <svg className="w-5 h-5 text-[#4b5563] flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-sm text-[#6b7280]">選手登録 30名まで（1シーズン）</span>
              </li>
              <li className="flex items-start gap-2">
                <svg className="w-5 h-5 text-[#4b5563] flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-sm text-[#6b7280]">選手画像登録 20枚まで（1シーズン）</span>
              </li>
              <li className="flex items-start gap-2">
                <svg className="w-5 h-5 text-[#4b5563] flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-sm text-[#6b7280]">チーム画像登録 20枚まで</span>
              </li>
              <li className="flex items-start gap-2">
                <svg className="w-5 h-5 text-[#4b5563] flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-sm text-[#6b7280]">チーム登録数 無制限</span>
              </li>
              <li className="flex items-start gap-2">
                <svg className="w-5 h-5 text-[#4b5563] flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-sm text-[#6b7280]">大会作成 3つまで（1シーズン）</span>
              </li>
              <li className="flex items-start gap-2">
                <svg className="w-5 h-5 text-[#4b5563] flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-sm text-[#6b7280]">選手名鑑生成 A4ver</span>
              </li>
            </ul>

            {!isPaid ? (
              <p className="text-sm font-semibold text-white">現在 Free プランをご利用中です。</p>
            ) : (
              <Button
                onClick={() => handleOpenBillingPortal({ flow: "cancel" })}
                disabled={loading}
                variant="outline"
                className="w-full border-[#4b5563] text-[#6b7280] hover:bg-[#263149] hover:text-white"
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                プラン変更
              </Button>
            )}
          </div>

          {/* Pro Card */}
          <div className="relative rounded-xl border border-[#60a5fa] bg-[#1a2438] p-6 shadow-lg">
            <div className="absolute -top-3 left-4">
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-[#60a5fa] text-[#0b1220]">
                おすすめ
              </span>
            </div>
            
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-[14px] font-semibold text-white">Pro プラン</h2>
              <p className="text-[20px] font-semibold text-[#60a5fa]">月額 380円</p>
            </div>
            <p className="text-[11px] text-[#8b93a7] mb-6">チーム運営を本格的にサポート</p>
            
            <ul className="space-y-3 mb-6">
              <li className="flex items-start gap-2">
                <svg className="w-5 h-5 text-[#60a5fa] flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-sm text-white">選手登録 30名まで（1シーズン）</span>
              </li>
              <li className="flex items-start gap-2">
                <svg className="w-5 h-5 text-[#60a5fa] flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-sm text-white">選手画像登録 30枚まで（1シーズン）</span>
              </li>
              <li className="flex items-start gap-2">
                <svg className="w-5 h-5 text-[#60a5fa] flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-sm text-white">チーム登録数 <span className="text-[#60a5fa] font-semibold">無制限</span></span>
              </li>
              <li className="flex items-start gap-2">
                <svg className="w-5 h-5 text-[#60a5fa] flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-sm text-white">大会作成 <span className="text-[#60a5fa] font-semibold">無制限</span>（1シーズン）</span>
              </li>
              <li className="flex items-start gap-2">
                <svg className="w-5 h-5 text-[#60a5fa] flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-sm text-white">選手名鑑生成 <span className="text-[#60a5fa] font-semibold">フル機能</span></span>
              </li>
            </ul>

            {isPro ? (
              <>
                <p className="text-sm font-semibold text-white mb-3">現在 Pro プランをご利用中です。</p>
                <Button
                  onClick={() => handleOpenBillingPortal({ flow: "cancel" })}
                  disabled={loading}
                  variant="outline"
                  className="w-full border-[#60a5fa] text-[#60a5fa] hover:bg-[#60a5fa] hover:text-[#0b1220]"
                >
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  契約内容の確認・解約
                </Button>
              </>
            ) : (
              <>
                <Button
                  onClick={() => handleUpgrade({ plan: "pro" })}
                  disabled={loading || isOfficia}
                  className="w-full bg-[#60a5fa] hover:bg-[#3b82f6] text-white font-semibold"
                >
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Proプランにアップグレード
                </Button>
                <p className="text-xs text-[#8b93a7] mt-2 text-center">ボタンを押すと Stripe の決済画面が開きます。</p>
              </>
            )}
          </div>
        </div>

        <div className="mt-8 p-4 rounded-lg border border-[#263149] bg-[#141d2e]">
          <p className="text-xs text-[#8b93a7] leading-relaxed">
            ※ 利用者の規模・運営体制により内容が変更になる可能性があります。<br />
            ※ 悪質な無制限利用と運営が判断した場合は、該当ユーザーの利用を制限する場合があります。
          </p>
        </div>
      </div>
    </div>
  );
}
