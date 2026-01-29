"use client";

import { useMemo, useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import { toDashSeason } from "@/lib/season";
import { collection, addDoc, query, onSnapshot, doc, updateDoc, deleteDoc, arrayRemove, deleteField, setDoc, getDocs } from "firebase/firestore";
import Image from 'next/image';
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { getPlanLimit, getPlanTier } from "@/lib/plan-limits";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PlayerForm } from "./player-form";
import type { PlayerFormValues } from "./player-form.schema";
import { Player, PlayerSeasonData } from "@/types/player";
import { columns } from "./players-columns";
import { PlayersDataTable } from "./players-data-table";

function stripUndefinedDeep(value: any): any {
  if (value === undefined) return undefined;

  if (Array.isArray(value)) {
    const next = value
      .map((v) => stripUndefinedDeep(v))
      .filter((v) => v !== undefined);
    return next.length > 0 ? next : undefined;
  }

  if (value && typeof value === "object") {
    const out: any = {};
    for (const [k, v] of Object.entries(value)) {
      const cleaned = stripUndefinedDeep(v);
      if (cleaned !== undefined) out[k] = cleaned;
    }
    return Object.keys(out).length > 0 ? out : undefined;
  }

  return value;
}

interface PlayerManagementProps {
  teamId: string;
  selectedSeason?: string;
}

export function PlayerManagement({ teamId, selectedSeason }: PlayerManagementProps) {
  const { user, ownerUid } = useAuth();
  const clubUid = ownerUid || user?.uid;
  const isPro = user?.plan === "pro";
  const [players, setPlayers] = useState<Player[]>([]);
  const [legacyPlayers, setLegacyPlayers] = useState<Player[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);
  const [deletingPlayer, setDeletingPlayer] = useState<Player | null>(null);

  const planTier = getPlanTier(user?.plan);
  const maxPlayers = getPlanLimit("players_per_team", planTier);
  const maxPlayerPhotos = getPlanLimit("player_photos_per_team", planTier);

  const invalidatePlayerStatsCache = async (playerId: string) => {
    if (!user) return;
    const pid = typeof playerId === "string" ? playerId.trim() : "";
    if (!pid) return;
    try {
      const token = await (user as any).getIdToken();
      await fetch('/api/club/invalidate-player-stats-cache', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ playerId: pid }),
      });
    } catch (e) {
      // ignore
    }
  };

  const playerFormKey = editingPlayer ? editingPlayer.id : `new-${selectedSeason || ""}`;

  const mergedPlayers = useMemo(() => {
    const map = new Map<string, Player>();
    for (const p of legacyPlayers) map.set(p.id, p);
    for (const p of players) map.set(p.id, p);
    return Array.from(map.values());
  }, [legacyPlayers, players]);

  const filteredPlayers = useMemo(() => {
    if (!selectedSeason) return mergedPlayers as any[];

    const selectedSeasonDash = toDashSeason(selectedSeason);

    const positionOrder: Record<string, number> = {
      GK: 0,
      DF: 1,
      MF: 2,
      FW: 3,
    };

    const hasSelectedSeason = (p: any): boolean => {
      const seasons = Array.isArray(p?.seasons) ? (p.seasons as string[]) : null;
      if (seasons && seasons.includes(selectedSeason)) return true;

      const seasonData = p?.seasonData && typeof p.seasonData === "object" ? p.seasonData : null;
      if (seasonData && (seasonData[selectedSeason] || seasonData[selectedSeasonDash])) return true;

      // Legacy: players created before seasons/seasonData were introduced
      if (!seasons || seasons.length === 0) return true;
      return false;
    };

    const normalizeNumber = (n: unknown): number => {
      if (typeof n === "number" && Number.isFinite(n)) return n;
      if (typeof n === "string" && n.trim() !== "") {
        const parsed = Number(n);
        if (Number.isFinite(parsed)) return parsed;
      }
      return Number.POSITIVE_INFINITY;
    };

    const normalizePosition = (p: unknown): string => {
      if (typeof p !== "string") return "";
      return p.trim().toUpperCase();
    };

    const mergedList = mergedPlayers
      .filter((p) => hasSelectedSeason(p as any))
      .map((p) => {
        const season = ((p.seasonData || {})[selectedSeason] || (p.seasonData || {})[selectedSeasonDash]) as
          | PlayerSeasonData
          | undefined;
        const merged: Player = {
          ...p,
          number: (season?.number ?? p.number) as any,
          position: (season?.position ?? p.position) as any,
          mainPosition: (season as any)?.mainPosition ?? (p as any).mainPosition,
          subPositions: (season as any)?.subPositions ?? (p as any).subPositions,
          nationality: (season?.nationality ?? p.nationality) as any,
          age: (season?.age ?? p.age) as any,
          tenureYears: (season as any)?.tenureYears ?? (p as any).tenureYears,
          height: (season?.height ?? p.height) as any,
          weight: (season as any)?.weight ?? (p as any).weight,
          profile: (season as any)?.profile ?? (p as any).profile,
          preferredFoot: (season as any)?.preferredFoot ?? (p as any).preferredFoot,
          annualSalary: (season as any)?.annualSalary ?? (p as any).annualSalary,
          annualSalaryCurrency: (season as any)?.annualSalaryCurrency ?? (p as any).annualSalaryCurrency,
          contractEndDate: (season as any)?.contractEndDate ?? (p as any).contractEndDate,
          photoUrl: season?.photoUrl ?? p.photoUrl,
          snsLinks: season?.snsLinks ?? p.snsLinks,
          params: season?.params ?? p.params,
          manualCompetitionStats: season?.manualCompetitionStats ?? p.manualCompetitionStats,
          isPublished: typeof season?.isPublished === "boolean" ? season.isPublished : p.isPublished,
        };
        return { ...merged, __raw: p } as any;
      });

    return mergedList
      .slice()
      .sort((a: any, b: any) => {
        const pa = normalizePosition(a?.position);
        const pb = normalizePosition(b?.position);
        const oa = positionOrder[pa] ?? 999;
        const ob = positionOrder[pb] ?? 999;
        if (oa !== ob) return oa - ob;

        const na = normalizeNumber(a?.number);
        const nb = normalizeNumber(b?.number);
        if (na !== nb) return na - nb;

        const nameA = typeof a?.name === "string" ? a.name : "";
        const nameB = typeof b?.name === "string" ? b.name : "";
        return nameA.localeCompare(nameB, "ja");
      });
  }, [mergedPlayers, selectedSeason]);

  const seasonDefaults = useMemo(() => {
    if (!selectedSeason || !editingPlayer) return undefined;
    const selectedSeasonDash = toDashSeason(selectedSeason);
    const season = ((editingPlayer.seasonData || {})[selectedSeason] || (editingPlayer.seasonData || {})[selectedSeasonDash]) as
      | PlayerSeasonData
      | undefined;
    if (!season) {
      return editingPlayer;
    }
    return {
      ...editingPlayer,
      number: season.number ?? editingPlayer.number,
      position: season.position ?? editingPlayer.position,
      mainPosition: (season as any)?.mainPosition ?? (editingPlayer as any).mainPosition,
      subPositions: (season as any)?.subPositions ?? (editingPlayer as any).subPositions,
      nationality: season.nationality ?? editingPlayer.nationality,
      age: season.age ?? editingPlayer.age,
      tenureYears: (season as any)?.tenureYears ?? (editingPlayer as any).tenureYears,
      height: season.height ?? editingPlayer.height,
      weight: (season as any)?.weight ?? (editingPlayer as any).weight,
      profile: (season as any)?.profile ?? (editingPlayer as any).profile,
      preferredFoot: (season as any)?.preferredFoot ?? (editingPlayer as any).preferredFoot,
      annualSalary: (season as any)?.annualSalary ?? (editingPlayer as any).annualSalary,
      annualSalaryCurrency: (season as any)?.annualSalaryCurrency ?? (editingPlayer as any).annualSalaryCurrency,
      contractEndDate: (season as any)?.contractEndDate ?? (editingPlayer as any).contractEndDate,
      photoUrl: season.photoUrl ?? editingPlayer.photoUrl,
      snsLinks: season.snsLinks ?? editingPlayer.snsLinks,
      params: season.params ?? editingPlayer.params,
      manualCompetitionStats: season.manualCompetitionStats ?? editingPlayer.manualCompetitionStats,
      isPublished: typeof season.isPublished === "boolean" ? season.isPublished : editingPlayer.isPublished,
    } as any;
  }, [editingPlayer, selectedSeason]);

  useEffect(() => {
    if (!clubUid || !teamId) return;
    const playersColRef = collection(db, `clubs/${clubUid}/teams/${teamId}/players`);
    const q = query(playersColRef);

    const unsubscribe = onSnapshot(
      q,
      (querySnapshot) => {
        const playersData = querySnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Player));
        setPlayers(playersData);
      },
      (error) => {
        console.error("[PlayerManagement] players onSnapshot error", {
          code: (error as any)?.code,
          message: (error as any)?.message,
          path: `clubs/${clubUid}/teams/${teamId}/players`,
          uid: clubUid,
          teamId,
        });
        toast.error("選手データの取得に失敗しました（permission-denied）。権限設定をご確認ください。", {
          id: "players-permission-denied",
        });
      }
    );

    return () => unsubscribe();
  }, [clubUid, teamId]);

  useEffect(() => {
    const legacyClubUid = user?.uid;
    if (!legacyClubUid || !clubUid || legacyClubUid === clubUid) {
      setLegacyPlayers([]);
      return;
    }
    if (!teamId) return;

    const playersColRef = collection(db, `clubs/${legacyClubUid}/teams/${teamId}/players`);
    const q = query(playersColRef);

    const unsubscribe = onSnapshot(
      q,
      (querySnapshot) => {
        const playersData = querySnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Player));
        setLegacyPlayers(playersData);
      },
      (error) => {
        console.error("[PlayerManagement] legacy players onSnapshot error", {
          code: (error as any)?.code,
          message: (error as any)?.message,
          path: `clubs/${legacyClubUid}/teams/${teamId}/players`,
          uid: legacyClubUid,
          teamId,
        });
      }
    );

    return () => unsubscribe();
  }, [clubUid, teamId, user?.uid]);

  const handleFormSubmit = async (values: PlayerFormValues) => {
    if (!clubUid || !teamId) return;
    if (!selectedSeason) {
      toast.error("シーズンが選択されていません。");
      return;
    }

    const selectedSeasonDash = toDashSeason(selectedSeason);

    const prevPhotoUrl = ((seasonDefaults as any)?.photoUrl ?? (editingPlayer as any)?.photoUrl ?? '') as string;
    const nextPhotoUrl = (values as any)?.photoUrl as string | undefined;
    const isNewPhoto = Boolean(nextPhotoUrl && String(nextPhotoUrl).trim().length > 0 && (!prevPhotoUrl || String(prevPhotoUrl).trim().length === 0));

    if (isNewPhoto) {
      try {
        const playersSnap = await getDocs(collection(db, `clubs/${clubUid}/teams/${teamId}/players`));
        let count = 0;
        playersSnap.forEach((d) => {
          const p = d.data() as any;
          const url = typeof p?.photoUrl === 'string' ? p.photoUrl.trim() : '';
          if (url) count += 1;
        });

        if (Number.isFinite(maxPlayerPhotos) && count >= maxPlayerPhotos) {
          toast.error(`現在のプランでは選手画像は1チームあたり最大${maxPlayerPhotos}枚まで登録できます。`);
          return;
        }
      } catch {
        // ignore
      }
    }

    try {
      console.log("[PlayerManagement] save start", {
        clubUid,
        teamId,
        selectedSeason,
        editingPlayerId: editingPlayer?.id ?? null,
        position: values.position,
        number: values.number,
        photoUrl: values.photoUrl,
      });
      const playersColRef = collection(db, `clubs/${clubUid}/teams/${teamId}/players`);

      const paramsNormalized = values.params
        ? {
            overall: values.params.overall,
            items: Array.isArray(values.params.items)
              ? values.params.items.map((i: any) => ({
                  label: typeof i?.label === "string" ? i.label : "",
                  value: typeof i?.value === "number" ? i.value : undefined,
                }))
              : [],
          }
        : undefined;

      const manualStatsNormalized = Array.isArray(values.manualCompetitionStats)
        ? values.manualCompetitionStats
            .filter((r: any) => typeof r?.competitionId === "string" && r.competitionId.trim().length > 0)
            .map((r: any) => ({
              competitionId: r.competitionId,
              matches: typeof r?.matches === "number" ? r.matches : undefined,
              minutes: typeof r?.minutes === "number" ? r.minutes : undefined,
              goals: typeof r?.goals === "number" ? r.goals : undefined,
              assists: typeof r?.assists === "number" ? r.assists : undefined,
              yellowCards: typeof r?.yellowCards === "number" ? r.yellowCards : undefined,
              redCards: typeof r?.redCards === "number" ? r.redCards : undefined,
              avgRating: typeof r?.avgRating === "number" ? r.avgRating : undefined,
            }))
        : undefined;

      const endYear = (values as any)?.contractEndYear as number | undefined;
      const endMonth = (values as any)?.contractEndMonth as number | undefined;
      const contractEndDate =
        endYear != null && endMonth != null
          ? `${String(endYear).padStart(4, "0")}-${String(endMonth).padStart(2, "0")}`
          : undefined;

      const seasonPayload: PlayerSeasonData = {
        number: values.number,
        position: values.position as any,
        mainPosition: (values as any).mainPosition,
        subPositions: Array.isArray((values as any).subPositions) ? ((values as any).subPositions as any[]).slice(0, 3) : [],
        nationality: values.nationality,
        age: values.age,
        tenureYears: (values as any).tenureYears,
        height: values.height,
        weight: (values as any).weight,
        profile: (values as any).profile,
        preferredFoot: (values as any).preferredFoot,
        annualSalary: (values as any).annualSalary,
        annualSalaryCurrency: (values as any).annualSalaryCurrency,
        contractEndDate,
        photoUrl: values.photoUrl,
        snsLinks: values.snsLinks,
        params: paramsNormalized as any,
        manualCompetitionStats: manualStatsNormalized as any,
        isPublished: values.isPublished,
      };

      const seasonPayloadClean = (stripUndefinedDeep(seasonPayload) || {}) as any;

      let savedPlayerId: string | null = null;

      if (editingPlayer) {
        const currentSeasons = Array.isArray((editingPlayer as any)?.seasons) ? (((editingPlayer as any).seasons as string[]) || []) : [];
        const nextSeasons = currentSeasons.includes(selectedSeason) ? currentSeasons : [...currentSeasons, selectedSeason];
        const playerDocRef = doc(playersColRef, editingPlayer.id);
        const updatePayload = stripUndefinedDeep({
          name: values.name,
          position: values.position as any,
          mainPosition: (values as any).mainPosition,
          subPositions: Array.isArray((values as any).subPositions) ? ((values as any).subPositions as any[]).slice(0, 3) : [],
          number: values.number as any,
          photoUrl: values.photoUrl,
          tenureYears: (values as any).tenureYears,
          seasons: nextSeasons,
          [`seasonData.${selectedSeasonDash}`]: seasonPayloadClean,
        });
        console.log("[PlayerManagement] write players", {
          path: `clubs/${clubUid}/teams/${teamId}/players/${editingPlayer.id}`,
          photoUrl: values.photoUrl,
        });
        await updateDoc(playerDocRef, (updatePayload || {}) as any);
        savedPlayerId = editingPlayer.id;

        const rosterDocRef = doc(db, `clubs/${clubUid}/seasons/${toDashSeason(selectedSeason)}/roster`, editingPlayer.id);
        const rosterPayload = stripUndefinedDeep({
          name: values.name,
          teamId,
          seasons: nextSeasons,
          seasonData: {
            [selectedSeasonDash]: seasonPayloadClean,
          },
          number: values.number as any,
          position: values.position as any,
          mainPosition: (values as any).mainPosition,
          subPositions: Array.isArray((values as any).subPositions) ? ((values as any).subPositions as any[]).slice(0, 3) : [],
          photoUrl: values.photoUrl,
          tenureYears: (values as any).tenureYears,
        });
        console.log("[PlayerManagement] write roster", {
          path: `clubs/${clubUid}/seasons/${selectedSeason}/roster/${editingPlayer.id}`,
          photoUrl: values.photoUrl,
        });
        await setDoc(
          rosterDocRef,
          (rosterPayload || {}) as any,
          { merge: true }
        );
      } else {
        const createPayload = stripUndefinedDeep({
          ...values,
          seasons: [selectedSeason],
          seasonData: {
            [selectedSeasonDash]: seasonPayloadClean,
          },
        });
        const created = await addDoc(playersColRef, (createPayload || {}) as any);
        savedPlayerId = created.id;

        const rosterDocRef = doc(db, `clubs/${clubUid}/seasons/${toDashSeason(selectedSeason)}/roster`, created.id);
        console.log("[PlayerManagement] write roster (create)", {
          path: `clubs/${clubUid}/seasons/${toDashSeason(selectedSeason)}/roster/${created.id}`,
          photoUrl: values.photoUrl,
        });
        await setDoc(
          rosterDocRef,
          (stripUndefinedDeep({
            ...(createPayload || {}),
            teamId,
            seasons: [selectedSeason],
            seasonData: {
              [selectedSeasonDash]: seasonPayloadClean,
            },
            number: values.number as any,
            position: values.position as any,
            mainPosition: (values as any).mainPosition,
            subPositions: Array.isArray((values as any).subPositions) ? ((values as any).subPositions as any[]).slice(0, 3) : [],
            photoUrl: values.photoUrl,
            tenureYears: (values as any).tenureYears,
          }) || {}) as any,
          { merge: true }
        );
      }

      if (savedPlayerId) {
        await invalidatePlayerStatsCache(savedPlayerId);
      }

      toast.success("保存しました。", {
        id: "player-save-success",
      });
      setIsDialogOpen(false);
      setEditingPlayer(null);
    } catch (error) {
      const code = (error as any)?.code;
      const message = (error as any)?.message;
      console.error("Error saving player:", error);
      console.error("Error saving player (meta):", { code, message });

      toast.error(
        code === "permission-denied"
          ? "保存に失敗しました（permission-denied）。権限設定をご確認ください。"
          : `保存に失敗しました。${code ? ` (${code})` : ""}`,
        {
        id: "player-save-failed",
        }
      );
    }
  };


  const handleDeletePlayer = async () => {
    if (!clubUid || !deletingPlayer || !teamId) return;
    if (!selectedSeason) {
      toast.error("シーズンが選択されていません。");
      return;
    }
    const selectedSeasonDash = toDashSeason(selectedSeason);
    try {
      const playerDocRef = doc(db, `clubs/${clubUid}/teams/${teamId}/players`, deletingPlayer.id);
      const rosterDocRef = doc(db, `clubs/${clubUid}/seasons/${selectedSeasonDash}/roster`, deletingPlayer.id);
      const seasons = Array.isArray((deletingPlayer as any)?.seasons) ? ((deletingPlayer as any).seasons as string[]) : [];
      const remaining = seasons.filter((s) => s !== selectedSeason);
      if (remaining.length === 0) {
        await deleteDoc(playerDocRef);
        await deleteDoc(rosterDocRef);
      } else {
        await updateDoc(playerDocRef, {
          seasons: arrayRemove(selectedSeason),
          [`seasonData.${selectedSeasonDash}`]: deleteField(),
        } as any);

        await setDoc(
          rosterDocRef,
          {
            seasons: arrayRemove(selectedSeason),
            [`seasonData.${selectedSeasonDash}`]: deleteField(),
          } as any,
          { merge: true }
        );
      }

      await invalidatePlayerStatsCache(deletingPlayer.id);
      setDeletingPlayer(null);
    } catch (error) {
      console.error("Error deleting player: ", error);
    }
  };

  const openEditDialog = (player: Player) => {
    setEditingPlayer(player);
    setIsDialogOpen(true);
  };

  const openAddDialog = () => {
    if (Number.isFinite(maxPlayers) && filteredPlayers.length >= maxPlayers) {
      toast.error(`現在のプランでは1チームあたり選手は最大${maxPlayers}人まで登録できます。`);
      return;
    }
    setEditingPlayer(null);
    setIsDialogOpen(true);
  };

  return (
    <>
      <div className="mt-6">
        <div className="flex justify-between items-center mb-4">
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button
                onClick={openAddDialog}
                disabled={Number.isFinite(maxPlayers) && filteredPlayers.length >= maxPlayers}
                className="bg-white text-gray-900 hover:bg-gray-100 border border-border"
              >
                選手を追加
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-h-[80vh]">
              <DialogHeader>
                <DialogTitle>{editingPlayer ? '選手を編集' : '選手を追加'}</DialogTitle>
              </DialogHeader>
              <PlayerForm
                key={playerFormKey}
                onSubmit={handleFormSubmit}
                defaultValues={seasonDefaults || editingPlayer || undefined}
                defaultSeason={selectedSeason}
                ownerUid={user?.uid ?? null}
              />
            </DialogContent>
          </Dialog>
        </div>

        <PlayersDataTable columns={columns(openEditDialog, setDeletingPlayer)} data={filteredPlayers} />
      </div>

      <AlertDialog open={!!deletingPlayer} onOpenChange={() => setDeletingPlayer(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>本当に削除しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              選手「{deletingPlayer?.name}」を削除します。この操作は元に戻せません。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeletePlayer}>削除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
