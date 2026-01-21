"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { collection, getDocs } from "firebase/firestore";

import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { toSlashSeason } from "@/lib/season";
import { Button } from "@/components/ui/button";
import { TransferManagement } from "@/components/transfer-management";

interface Season {
  id: string;
  isPublic?: boolean;
}

export default function TeamTransfersPage() {
  const { user, ownerUid } = useAuth();
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();

  const teamId = params.teamId as string;
  const clubUid = ownerUid || user?.uid;

  const seasonFromQuery = (searchParams.get("season") || "").trim();
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<string>(seasonFromQuery);

  useEffect(() => {
    if (!clubUid) return;

    const seasonsColRef = collection(db, `clubs/${clubUid}/seasons`);
    getDocs(seasonsColRef).then((snapshot) => {
      const seasonsData = snapshot.docs
        .map((d) => ({ id: toSlashSeason(d.id), ...(d.data() as any) } as Season))
        .sort((a, b) => b.id.localeCompare(a.id));

      setSeasons(seasonsData);
      if (seasonsData.length > 0) {
        const hasQuery = Boolean(seasonFromQuery);
        const exists = hasQuery ? seasonsData.some((s) => s.id === seasonFromQuery) : false;
        const next = exists ? seasonFromQuery : seasonsData[0].id;

        setSelectedSeason(next);

        // Keep URL stable and shareable (but do not force season selection page)
        if (!hasQuery || !exists) {
          router.replace(`/admin/teams/${teamId}/transfers?season=${encodeURIComponent(next)}`);
        }
      } else {
        setSelectedSeason("");
      }
    });
  }, [clubUid, seasonFromQuery, router, teamId]);

  const seasonIds = seasons.map((s) => s.id);

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <h1 className="text-2xl font-bold truncate sm:text-3xl">移籍管理</h1>
          {selectedSeason && (
            <span className="inline-flex items-center rounded-full bg-white/10 px-2.5 py-1 text-xs font-semibold text-white whitespace-nowrap">
              {selectedSeason}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            className="bg-white text-gray-900 border border-border hover:bg-gray-100 whitespace-nowrap"
            disabled={!selectedSeason}
            onClick={() => {
              if (!selectedSeason) return;
              router.push(`/admin/teams/${teamId}?season=${encodeURIComponent(selectedSeason)}`);
            }}
          >
            選手管理へ戻る
          </Button>
        </div>
      </div>

      {selectedSeason ? (
        <TransferManagement
          teamId={teamId}
          seasons={seasonIds}
          selectedSeason={selectedSeason}
          onChangeSeason={(seasonId) => {
            setSelectedSeason(seasonId);
            router.replace(`/admin/teams/${teamId}/transfers?season=${encodeURIComponent(seasonId)}`);
          }}
        />
      ) : (
        <div className="space-y-3">
          <p>シーズンを選択または追加してください。</p>
          <Button
            type="button"
            variant="outline"
            className="bg-white text-gray-900 border border-border hover:bg-gray-100"
            onClick={() => router.push(`/admin/teams/${teamId}/season`)}
          >
            シーズン選択へ
          </Button>
        </div>
      )}
    </div>
  );
}
