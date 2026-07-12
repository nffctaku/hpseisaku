"use client";

import { useState } from "react";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export default function AdminMigrationsPage() {
  const { user } = useAuth();
  const [migrating, setMigrating] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string; migratedCount?: number } | null>(null);

  const runMigration = async () => {
    if (!auth.currentUser) {
      toast.error("ログインしていません。");
      return;
    }

    setMigrating(true);
    setResult(null);

    try {
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch("/api/admin/migrate-player-data", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "移行に失敗しました。");
      }

      setResult({
        success: true,
        message: data.message || "移行が完了しました。",
        migratedCount: data.migratedCount,
      });
      toast.success("移行が完了しました。");
    } catch (e: any) {
      setResult({
        success: false,
        message: e.message || "移行に失敗しました。",
      });
      toast.error(e.message || "移行に失敗しました。");
    } finally {
      setMigrating(false);
    }
  };

  return (
    <div className="container max-w-4xl mx-auto py-8 px-4">
      <h1 className="text-2xl font-bold mb-6">データ移行</h1>

      <Card>
        <CardHeader>
          <CardTitle>選手データ移行</CardTitle>
          <CardDescription>
            既存の選手データの age と tenureYears を dateOfBirth と joinedSeason に変換します。
            この移行は一度だけ実行してください。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <h3 className="font-semibold text-yellow-900 mb-2">注意事項</h3>
            <ul className="list-disc list-inside text-sm text-yellow-800 space-y-1">
              <li>この移行は既存の age から dateOfBirth を計算して設定します</li>
              <li>既存の tenureYears から joinedSeason を計算して設定します</li>
              <li>移行は一度だけ実行してください（複数回実行しても問題ありません）</li>
              <li>移行中は他の操作を行わないでください</li>
            </ul>
          </div>

          <Button onClick={runMigration} disabled={migrating} className="w-full">
            {migrating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                移行中...
              </>
            ) : (
              "移行を実行"
            )}
          </Button>

          {result && (
            <div
              className={`p-4 rounded-lg ${
                result.success
                  ? "bg-green-50 border border-green-200"
                  : "bg-red-50 border border-red-200"
              }`}
            >
              <p
                className={`text-sm ${
                  result.success ? "text-green-900" : "text-red-900"
                }`}
              >
                {result.message}
                {result.migratedCount !== undefined && (
                  <span className="ml-2 font-semibold">
                    ({result.migratedCount}件の選手データを移行)
                  </span>
                )}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
