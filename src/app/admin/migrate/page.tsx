"use client";

import { useState } from "react";
import { auth } from "@/lib/firebase";
import { useRouter } from "next/navigation";

export default function MigratePage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const runMigration = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const user = auth.currentUser;
      if (!user) {
        setError("ログインが必要です");
        return;
      }

      const token = await user.getIdToken();
      const response = await fetch("/api/admin/migrate-player-data", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      const data = await response.json();
      if (response.ok) {
        setResult(data);
      } else {
        setError(data.message || "マイグレーションに失敗しました");
      }
    } catch (e: any) {
      setError(e.message || "エラーが発生しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">データマイグレーション</h1>
      
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">シーズンデータ配列→オブジェクト変換</h2>
        <p className="text-gray-600 mb-4">
          このマイグレーションは、データベース内の配列形式のシーズンデータをオブジェクト形式に変換します。
          これにより、体重などの選手データが公開ページで正しく表示されるようになります。
        </p>
        
        <button
          onClick={runMigration}
          disabled={loading}
          className="bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white px-6 py-2 rounded"
        >
          {loading ? "実行中..." : "マイグレーション実行"}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-6">
          {error}
        </div>
      )}

      {result && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded mb-6">
          <p className="font-semibold">マイグレーション完了</p>
          <p>移行した選手数: {result.migratedCount}</p>
        </div>
      )}

      <button
        onClick={() => router.back()}
        className="text-gray-600 hover:text-gray-800"
      >
        ← 戻る
      </button>
    </div>
  );
}
