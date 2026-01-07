"use client";

import { useAuth } from "@/contexts/AuthContext";
import { Lock, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface PremiumGuardProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function PremiumGuard({ children, fallback }: PremiumGuardProps) {
  const { user } = useAuth();
  
  // ユーザーのプレミアムステータスを確認（実際の実装に合わせて調整）
  const isPremium = (user as any)?.isPremium || false;

  if (isPremium) {
    return <>{children}</>;
  }

  if (fallback) {
    return <>{fallback}</>;
  }

  return (
    <Card className="max-w-2xl mx-auto">
      <CardHeader className="text-center">
        <div className="mx-auto w-16 h-16 bg-gradient-to-r from-yellow-400 to-amber-600 rounded-full flex items-center justify-center mb-4">
          <Crown className="h-8 w-8 text-white" />
        </div>
        <CardTitle className="text-2xl">プレミアム機能</CardTitle>
        <CardDescription>
          この分析機能はプレミアムプラン限定です
        </CardDescription>
      </CardHeader>
      <CardContent className="text-center space-y-4">
        <div className="bg-gray-50 rounded-lg p-4">
          <h4 className="font-semibold mb-2">プレミアムプランで利用できる機能：</h4>
          <ul className="text-sm text-gray-600 space-y-1">
            <li>• 詳細なスタッツ分析（15項目以上）</li>
            <li>• シーズン別成績推移</li>
            <li>• 順位変動グラフ</li>
            <li>• 個人成績Top3ランキング</li>
            <li>• ホーム/アウェイ別成績</li>
            <li>• 大会別詳細分析</li>
          </ul>
        </div>
        <Button className="w-full bg-gradient-to-r from-yellow-400 to-amber-600 hover:from-yellow-500 hover:to-amber-700">
          <Lock className="mr-2 h-4 w-4" />
          プレミアムプランにアップグレード
        </Button>
      </CardContent>
    </Card>
  );
}
