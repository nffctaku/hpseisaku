"use client";

import { useState } from "react";
import { auth } from "@/lib/firebase";
import { useRouter } from "next/navigation";

export default function FixPlayerPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [playerId, setPlayerId] = useState("L2PTA5NeGgjHxLDywcc4");
  const [clubId, setClubId] = useState("0Px6FAwAafT2ssDGa0xz61FJro03");
  const [teamId, setTeamId] = useState("mUa1lsUSA0bJCAHyhq8w");
  const router = useRouter();

  const fixPlayerData = async () => {
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
      const response = await fetch("/api/admin/fix-player-data", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ playerId, clubId, teamId }),
      });

      const data = await response.json();
      if (response.ok) {
        setResult(data);
      } else {
        setError(data.message || "修正に失敗しました");
      }
    } catch (e: any) {
      setError(e.message || "エラーが発生しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">選手データ修正</h1>
      
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">特定の選手データを修正</h2>
        <p className="text-gray-600 mb-4">
          配列形式のシーズンデータをオブジェクト形式に変換して、公開ページで正しく表示されるようにします。
        </p>
        
        <div className="space-y-4 mb-4">
          <div>
            <label className="block text-sm font-medium mb-1">選手ID</label>
            <input
              type="text"
              value={playerId}
              onChange={(e) => setPlayerId(e.target.value)}
              className="w-full border rounded px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">クラブID</label>
            <input
              type="text"
              value={clubId}
              onChange={(e) => setClubId(e.target.value)}
              className="w-full border rounded px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">チームID</label>
            <input
              type="text"
              value={teamId}
              onChange={(e) => setTeamId(e.target.value)}
              className="w-full border rounded px-3 py-2"
            />
          </div>
        </div>
        
        <button
          onClick={fixPlayerData}
          disabled={loading}
          className="bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white px-6 py-2 rounded"
        >
          {loading ? "修正中..." : "修正実行"}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-6">
          {error}
        </div>
      )}

      {result && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded mb-6">
          <p className="font-semibold">修正完了</p>
          <p>{result.message}</p>
          {result.updatedKeys && (
            <p className="text-sm mt-2">更新したキー: {result.updatedKeys.join(", ")}</p>
          )}
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
