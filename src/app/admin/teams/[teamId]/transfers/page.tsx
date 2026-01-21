"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { collection, getDocs } from "firebase/firestore";

import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { toSlashSeason } from "@/lib/season";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TransferManagement } from "@/components/transfer-management";
import { toast } from "sonner";
import { auth } from "@/lib/firebase";

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

  const [currency, setCurrency] = useState<"JPY" | "EUR" | "GBP">("JPY");

  const [transfersPublic, setTransfersPublic] = useState<boolean>(true);
  const [savingTransfersPublic, setSavingTransfersPublic] = useState(false);

  useEffect(() => {
    const loadTransfersPublic = async () => {
      if (!clubUid) return;
      try {
        const token = await auth.currentUser?.getIdToken();
        if (!token) return;

        const res = await fetch("/api/club/transfers-public", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!res.ok) return;
        const json = (await res.json().catch(() => ({}))) as any;
        if (typeof json?.transfersPublic === "boolean") {
          setTransfersPublic(Boolean(json.transfersPublic));
        }
      } catch (e) {
        console.error("[TeamTransfersPage] Failed to load transfersPublic", e);
      }
    };

    loadTransfersPublic();
  }, [clubUid]);

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
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold truncate sm:text-3xl">移籍管理</h1>
        </div>
      </div>

      <div className="mb-4">
        <details className="group rounded-lg border border-border bg-white/80">
          <summary
            className="cursor-pointer list-none [&::-webkit-details-marker]:hidden px-4 py-3"
            style={{ listStyle: "none" }}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="font-semibold text-sm text-gray-900">設定</div>
              <div className="inline-flex items-center gap-2 text-xs text-gray-700">
                <span>{selectedSeason || "-"}</span>
                <span> / </span>
                <span>{currency}</span>
                <span className="inline-flex h-4 w-4 items-center justify-center text-gray-700 transition-transform group-open:rotate-180">
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </div>
            </div>
          </summary>

          <div className="px-4 pb-4 pt-1 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
              <div className="space-y-1">
                <div className="text-xs text-gray-700">シーズン</div>
                <Select
                  value={selectedSeason}
                  onValueChange={(seasonId) => {
                    setSelectedSeason(seasonId);
                    router.replace(`/admin/teams/${teamId}/transfers?season=${encodeURIComponent(seasonId)}`);
                  }}
                >
                  <SelectTrigger className="w-full bg-white text-gray-900">
                    <SelectValue placeholder="シーズン" />
                  </SelectTrigger>
                  <SelectContent>
                    {seasonIds.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <div className="text-xs text-gray-700">通貨</div>
                <Select value={currency} onValueChange={(v) => setCurrency(v as any)}>
                  <SelectTrigger className="w-full bg-white text-gray-900">
                    <SelectValue placeholder="通貨" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="JPY">JPY(￥)</SelectItem>
                    <SelectItem value="EUR">EUR(€)</SelectItem>
                    <SelectItem value="GBP">GBP(￡)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <div className="text-xs text-gray-700">公開</div>
                <label className="flex items-center gap-2 rounded-md border border-border bg-white px-3 py-2 text-xs font-medium text-gray-900 whitespace-nowrap">
                  <Checkbox
                    checked={transfersPublic}
                    disabled={!clubUid || savingTransfersPublic}
                    onCheckedChange={async (checked) => {
                      if (!clubUid) return;
                      const next = checked === true;
                      const prev = transfersPublic;

                      setTransfersPublic(next);
                      setSavingTransfersPublic(true);
                      try {
                        const token = await auth.currentUser?.getIdToken();
                        if (!token) throw new Error("missing token");

                        const res = await fetch("/api/club/transfers-public", {
                          method: "POST",
                          headers: {
                            "Content-Type": "application/json",
                            Authorization: `Bearer ${token}`,
                          },
                          body: JSON.stringify({ transfersPublic: next }),
                        });

                        if (!res.ok) {
                          const body = await res.json().catch(() => ({}));
                          throw new Error(body?.message || "failed");
                        }

                        toast.success(next ? "移籍情報を公開しました。" : "移籍情報を非公開にしました。", {
                          id: "transfers-public-updated",
                        });
                      } catch (e) {
                        console.error("[TeamTransfersPage] Failed to update transfersPublic", e);
                        setTransfersPublic(prev);
                        toast.error("移籍情報の公開設定の更新に失敗しました。", { id: "transfers-public-update-error" });
                      } finally {
                        setSavingTransfersPublic(false);
                      }
                    }}
                  />
                  <span>移籍情報を公開する</span>
                </label>
              </div>
            </div>
          </div>
        </details>
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
          currency={currency}
          onChangeCurrency={setCurrency}
          hideSeasonSelect
          hideCurrencySelect
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
