import { useEffect, useState } from "react";
import { auth } from "@/lib/firebase";
import type { BookletResponse } from "../../types";

export function useBookletData(teamId: string, season: string, clubUid?: string | null) {
  const [data, setData] = useState<BookletResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    const run = async () => {
      if (!teamId || !season || !clubUid) return;
      setLoading(true);
      setError(null);
      try {
        const token = await auth.currentUser?.getIdToken();
        if (!token) {
          if (!cancelled) {
            setError("ログインが必要です。");
            setLoading(false);
          }
          return;
        }

        const res = await fetch(
          `/api/admin/booklet?teamId=${encodeURIComponent(teamId)}&season=${encodeURIComponent(season)}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (cancelled) return;

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setError(body?.message || "取得に失敗しました");
          setLoading(false);
          return;
        }

        const json = (await res.json()) as BookletResponse;
        setData(json);
      } catch (e) {
        console.error(e);
        if (!cancelled) setError("取得に失敗しました");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void run();
    return () => { cancelled = true; };
  }, [teamId, season, clubUid]);

  return { data, loading, error, setData, setError };
}
