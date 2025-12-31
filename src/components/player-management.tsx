"use client";

import { useMemo, useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import { collection, addDoc, query, onSnapshot, doc, updateDoc, deleteDoc, arrayRemove, deleteField, setDoc } from "firebase/firestore";
import Image from 'next/image';
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
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
import { PlayerForm, PlayerFormValues } from "./player-form";
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
  const { user } = useAuth();
  const clubUid = (user as any)?.ownerUid || user?.uid;
  const isPro = user?.plan === "pro";
  const [players, setPlayers] = useState<Player[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);
  const [deletingPlayer, setDeletingPlayer] = useState<Player | null>(null);

  const playerFormKey = editingPlayer ? editingPlayer.id : `new-${selectedSeason || ""}`;

  const filteredPlayers = useMemo(() => {
    if (!selectedSeason) return players as any[];

    return players
      .filter((p) => (p.seasons || []).includes(selectedSeason))
      .map((p) => {
        const season = (p.seasonData || {})[selectedSeason] as PlayerSeasonData | undefined;
        const merged: Player = {
          ...p,
          number: (season?.number ?? p.number) as any,
          position: (season?.position ?? p.position) as any,
          nationality: (season?.nationality ?? p.nationality) as any,
          age: (season?.age ?? p.age) as any,
          height: (season?.height ?? p.height) as any,
          weight: (season as any)?.weight ?? (p as any).weight,
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
  }, [players, selectedSeason]);

  const seasonDefaults = useMemo(() => {
    if (!selectedSeason || !editingPlayer) return undefined;
    const season = (editingPlayer.seasonData || {})[selectedSeason] as PlayerSeasonData | undefined;
    if (!season) {
      return editingPlayer;
    }
    return {
      ...editingPlayer,
      number: season.number ?? editingPlayer.number,
      position: season.position ?? editingPlayer.position,
      nationality: season.nationality ?? editingPlayer.nationality,
      age: season.age ?? editingPlayer.age,
      height: season.height ?? editingPlayer.height,
      weight: (season as any)?.weight ?? (editingPlayer as any).weight,
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

  const handleFormSubmit = async (values: PlayerFormValues) => {
    if (!clubUid || !teamId) return;
    if (!selectedSeason) {
      toast.error("シーズンが選択されていません。");
      return;
    }
    try {
      console.log("[PlayerManagement] save start", {
        clubUid,
        teamId,
        selectedSeason,
        editingPlayerId: editingPlayer?.id ?? null,
        position: values.position,
        number: values.number,
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
        nationality: values.nationality,
        age: values.age,
        height: values.height,
        weight: (values as any).weight,
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

      if (editingPlayer) {
        const currentSeasons = Array.isArray((editingPlayer as any)?.seasons) ? (((editingPlayer as any).seasons as string[]) || []) : [];
        const nextSeasons = currentSeasons.includes(selectedSeason) ? currentSeasons : [...currentSeasons, selectedSeason];
        const playerDocRef = doc(playersColRef, editingPlayer.id);
        const updatePayload = stripUndefinedDeep({
          name: values.name,
          position: values.position as any,
          number: values.number as any,
          seasons: nextSeasons,
          [`seasonData.${selectedSeason}`]: seasonPayloadClean,
        });
        await updateDoc(playerDocRef, (updatePayload || {}) as any);

        const rosterDocRef = doc(db, `clubs/${clubUid}/seasons/${selectedSeason}/roster`, editingPlayer.id);
        await setDoc(
          rosterDocRef,
          {
            name: values.name,
            teamId,
            seasons: nextSeasons,
            seasonData: {
              [selectedSeason]: seasonPayloadClean,
            },
            number: values.number as any,
            position: values.position as any,
            photoUrl: values.photoUrl,
          } as any,
          { merge: true }
        );
      } else {
        const createPayload = stripUndefinedDeep({
          ...values,
          seasons: [selectedSeason],
          seasonData: {
            [selectedSeason]: seasonPayloadClean,
          },
        });
        const created = await addDoc(playersColRef, (createPayload || {}) as any);

        const rosterDocRef = doc(db, `clubs/${clubUid}/seasons/${selectedSeason}/roster`, created.id);
        await setDoc(
          rosterDocRef,
          {
            ...(createPayload || {}),
            teamId,
            seasons: [selectedSeason],
            seasonData: {
              [selectedSeason]: seasonPayloadClean,
            },
            number: values.number as any,
            position: values.position as any,
            photoUrl: values.photoUrl,
          } as any,
          { merge: true }
        );
      }

      toast.success("保存しました。", {
        id: "player-save-success",
      });
      setIsDialogOpen(false);
      setEditingPlayer(null);
    } catch (error) {
      console.error("Error saving player: ", {
        code: (error as any)?.code,
        message: (error as any)?.message,
        error,
      });
      const code = (error as any)?.code;
      toast.error(`保存に失敗しました。${code ? ` (${code})` : ""}`, {
        id: "player-save-failed",
      });
    }
  };


  const handleDeletePlayer = async () => {
    if (!clubUid || !deletingPlayer || !teamId) return;
    if (!selectedSeason) {
      toast.error("シーズンが選択されていません。");
      return;
    }
    try {
      const playerDocRef = doc(db, `clubs/${clubUid}/teams/${teamId}/players`, deletingPlayer.id);
      const seasons = Array.isArray((deletingPlayer as any)?.seasons) ? ((deletingPlayer as any).seasons as string[]) : [];
      const remaining = seasons.filter((s) => s !== selectedSeason);
      if (remaining.length === 0) {
        await deleteDoc(playerDocRef);
      } else {
        await updateDoc(playerDocRef, {
          seasons: arrayRemove(selectedSeason),
          [`seasonData.${selectedSeason}`]: deleteField(),
        } as any);
      }
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
    if (!isPro && filteredPlayers.length >= 26) {
      toast.error("無料プランでは1チームあたり選手は最大26人まで登録できます。");
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
                disabled={!isPro && filteredPlayers.length >= 26}
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
