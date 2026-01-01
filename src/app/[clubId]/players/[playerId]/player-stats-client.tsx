"use client";

import { useEffect, useMemo, useState } from "react";
import { PublicPlayerSeasonSummaries, PublicSeasonSummaryRow } from "@/components/public-player-season-summaries";

type ApiPlayerStats = {
  appearances: number;
  minutes: number;
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
  ratingSum: number;
  ratingCount: number;
};

type ApiResponse = {
  playerId: string;
  statsSeason: string | null;
  seasonStats: ApiPlayerStats;
  careerStats: ApiPlayerStats;
  seasonSummaries: PublicSeasonSummaryRow[] | null;
};

function formatAvg(stats: ApiPlayerStats): string {
  if (!stats || stats.ratingCount <= 0) return "-";
  const avg = stats.ratingSum / stats.ratingCount;
  if (!Number.isFinite(avg) || avg <= 0) return "-";
  return avg.toFixed(2);
}

export function PlayerStatsClient({ clubId, playerId }: { clubId: string; playerId: string }) {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/public/club/${encodeURIComponent(clubId)}/players/${encodeURIComponent(playerId)}/stats?includeSummaries=1`, {
      cache: "force-cache",
    })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(typeof body?.error === "string" ? body.error : `Failed to load stats (${res.status})`);
        }
        return (await res.json()) as ApiResponse;
      })
      .then((json) => {
        if (cancelled) return;
        setData(json);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load stats");
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [clubId, playerId]);

  const seasonAvg = useMemo(() => (data ? formatAvg(data.seasonStats) : "-"), [data]);
  const careerAvg = useMemo(() => (data ? formatAvg(data.careerStats) : "-"), [data]);

  if (loading) {
    return <div className="mt-8 text-sm text-muted-foreground">スタッツ取得中...</div>;
  }

  if (error) {
    return <div className="mt-8 text-sm text-muted-foreground">スタッツ取得に失敗しました: {error}</div>;
  }

  if (!data) {
    return <div className="mt-8 text-sm text-muted-foreground">スタッツなし</div>;
  }

  const seasonLabel = data.statsSeason ? data.statsSeason : "最新";

  return (
    <div className="mt-8">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
        <div className="border rounded-lg p-4">
          <p className="text-sm text-muted-foreground">{seasonLabel} 出場</p>
          <p className="text-2xl font-bold">{data.seasonStats.appearances}</p>
        </div>
        <div className="border rounded-lg p-4">
          <p className="text-sm text-muted-foreground">{seasonLabel} 得点</p>
          <p className="text-2xl font-bold">{data.seasonStats.goals}</p>
        </div>
        <div className="border rounded-lg p-4">
          <p className="text-sm text-muted-foreground">{seasonLabel} アシスト</p>
          <p className="text-2xl font-bold">{data.seasonStats.assists}</p>
        </div>
        <div className="border rounded-lg p-4">
          <p className="text-sm text-muted-foreground">{seasonLabel} 平均評価</p>
          <p className="text-2xl font-bold">{seasonAvg}</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
        <div className="border rounded-lg p-4">
          <p className="text-sm text-muted-foreground">通算 出場</p>
          <p className="text-2xl font-bold">{data.careerStats.appearances}</p>
        </div>
        <div className="border rounded-lg p-4">
          <p className="text-sm text-muted-foreground">通算 得点</p>
          <p className="text-2xl font-bold">{data.careerStats.goals}</p>
        </div>
        <div className="border rounded-lg p-4">
          <p className="text-sm text-muted-foreground">通算 アシスト</p>
          <p className="text-2xl font-bold">{data.careerStats.assists}</p>
        </div>
        <div className="border rounded-lg p-4">
          <p className="text-sm text-muted-foreground">通算 平均評価</p>
          <p className="text-2xl font-bold">{careerAvg}</p>
        </div>
      </div>

      {Array.isArray(data.seasonSummaries) && data.seasonSummaries.length > 0 ? (
        <PublicPlayerSeasonSummaries rows={data.seasonSummaries} />
      ) : null}
    </div>
  );
}
