"use client";

import { useParams } from "next/navigation";
import { useMemo } from "react";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useSeasonRecordsData } from "../hooks/use-season-records-data";
import { SeasonDetailView } from "../components/SeasonDetailView";
import { computeSeasonDetail, toSlashSeason } from "../lib/season-records";

export default function SeasonDetailPage() {
  const params = useParams();
  const rawSeasonId = typeof params?.seasonId === "string" ? params.seasonId : "";
  const seasonId = toSlashSeason(decodeURIComponent(rawSeasonId));

  const { matches, competitions, clubTitles, allPlayersMap, mainTeamId, loading, error } = useSeasonRecordsData();

  const detail = useMemo(() => {
    if (!seasonId) return null;
    return computeSeasonDetail(matches, competitions, clubTitles, allPlayersMap, mainTeamId, seasonId);
  }, [matches, competitions, clubTitles, allPlayersMap, mainTeamId, seasonId]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#050a12] text-white">
        <p className="text-sm font-bold">読み込み中...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#050a12] text-white">
        <p className="text-sm font-bold text-red-400">{error}</p>
      </div>
    );
  }

  if (!seasonId || !detail) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#050a12] px-4 text-white">
        <p className="text-lg font-bold text-white">シーズンが見つかりません</p>
        <p className="mt-2 text-sm text-slate-400">指定されたシーズンデータは存在しません</p>
        <Link
          href="/admin/club/history/seasons"
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-bold text-white transition hover:bg-white/20"
        >
          <ArrowLeft className="h-4 w-4" />
          シーズン一覧へ
        </Link>
      </div>
    );
  }

  return <SeasonDetailView detail={detail} season={seasonId} />;
}
