"use client";

import { useEffect } from "react";

export default function EditCompetitionError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[edit/competition] error:", error);
  }, [error]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-900 text-white p-6">
      <h2 className="text-xl font-bold mb-4">大会編集ページでエラーが発生しました</h2>
      <p className="text-sm text-red-300 mb-6 max-w-md break-all">{error.message}</p>
      <button
        type="button"
        onClick={() => reset()}
        className="px-4 py-2 bg-orange-500 rounded text-white hover:bg-orange-600"
      >
        再試行
      </button>
    </div>
  );
}
