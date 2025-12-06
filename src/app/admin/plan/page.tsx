"use client";

import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function PlanPage() {
  const [loading, setLoading] = useState(false);

  const handleUpgrade = async () => {
    setLoading(true);
    try {
      // Stripe の決済リンクへリダイレクト
      window.location.href = "https://buy.stripe.com/6oU00l2ny8ITbQxgx2cbC00";
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-2xl md:text-3xl font-bold mb-4">プラン</h1>
      <p className="text-sm text-muted-foreground mb-6">
        現在はベータ版のため、プラン管理は準備中です。正式リリース時には、月額380円（2週間無料）プランとして提供予定です。
      </p>

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
        <div className="pt-2">
          <Button onClick={handleUpgrade} disabled={loading} className="w-full md:w-auto">
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            有料プランにアップグレード（2週間無料）
          </Button>
        </div>
      </div>
    </div>
  );
}
