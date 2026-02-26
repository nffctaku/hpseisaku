"use client";

import { useMemo, useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import { toDashSeason } from "@/lib/season";
import { collection, addDoc, query, onSnapshot, doc, updateDoc, deleteDoc, arrayRemove, deleteField, setDoc, getDocs, writeBatch } from "firebase/firestore";
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
import { POSITIONS, type PlayerFormValues } from "./player-form.schema";
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
  const [isCsvDialogOpen, setIsCsvDialogOpen] = useState(false);
  const [csvPreview, setCsvPreview] = useState<Array<{ rowNumber: number; data: any; error?: string }>>([]);
  const [csvFileName, setCsvFileName] = useState<string>("");
  const [importingCsv, setImportingCsv] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);
  const [deletingPlayer, setDeletingPlayer] = useState<Player | null>(null);

  const planTier = getPlanTier(user?.plan);
  const maxPlayers = getPlanLimit("players_per_team", planTier);
  const maxPlayerPhotos = getPlanLimit("player_photos_per_team", planTier);

  const normalizeBasePosition = (input: unknown): (typeof POSITIONS)[number] | null => {
    const raw = typeof input === "string" ? input.trim() : "";
    if (!raw) return null;
    const up = raw.toUpperCase();
    if ((POSITIONS as readonly string[]).includes(up)) return up as any;
    if (up === "GK" || up === "GOALKEEPER" || up === "KEEPER") return "GK";
    if (up === "DF" || up === "DEF" || up === "DEFENDER" || up === "CB" || up === "RB" || up === "LB") return "DF";
    if (up === "MF" || up === "MID" || up === "MIDFIELDER" || up === "AM" || up === "RM" || up === "LM" || up === "CM" || up === "DM") return "MF";
    if (up === "FW" || up === "FWD" || up === "FORWARD" || up === "STRIKER" || up === "ST" || up === "CF" || up === "RW" || up === "LW") return "FW";
    return null;
  };

  const parseCsv = (text: string): string[][] => {
    const rows: string[][] = [];
    let row: string[] = [];
    let field = "";
    let inQuotes = false;

    const pushField = () => {
      row.push(field);
      field = "";
    };
    const pushRow = () => {
      if (row.length === 1 && row[0] === "") {
        row = [];
        return;
      }
      rows.push(row);
      row = [];
    };

    const s = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (ch === '"') {
        const next = s[i + 1];
        if (inQuotes && next === '"') {
          field += '"';
          i++;
          continue;
        }
        inQuotes = !inQuotes;
        continue;
      }
      if (!inQuotes && ch === ",") {
        pushField();
        continue;
      }
      if (!inQuotes && ch === "\n") {
        pushField();
        pushRow();
        continue;
      }
      field += ch;
    }
    pushField();
    pushRow();
    return rows;
  };

  const normalizePreferredFoot = (input: unknown): 'left' | 'right' | 'both' | undefined => {
    const raw = typeof input === 'string' ? input.trim() : '';
    if (!raw) return undefined;
    if (raw === '右') return 'right';
    if (raw === '左') return 'left';
    if (raw === '両') return 'both';
    const up = raw.toLowerCase();
    if (up === 'right') return 'right';
    if (up === 'left') return 'left';
    if (up === 'both') return 'both';
    return undefined;
  };

  const normalizeNumberValue = (input: unknown): number | null => {
    if (typeof input === 'number' && Number.isFinite(input)) return input;
    const raw = typeof input === 'string' ? input.trim() : '';
    if (!raw) return null;
    const n = Number(raw);
    if (!Number.isFinite(n)) return null;
    return n;
  };

  const readCsvFile = async (file: File): Promise<string> => {
    try {
      return await file.text();
    } catch {
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('failed to read file'));
        reader.readAsText(file);
      });
    }
  };

  const downloadCsvTemplate = () => {
    try {
      const header = ["選手名", "背番号", "Pos.(GK,DF,MF,FW)", "国籍/出身", "身長", "体重", "利き足(右,左,両)", "年齢"];
      const example = ["山田太郎", "10", "FW", "日本", "178", "72", "右", "24"];
      const csv = `${header.join(",")}\n${example.join(",")}\n`;
      const withBom = `\uFEFF${csv}`;
      const blob = new Blob([withBom], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "players_template.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("テンプレートのダウンロードに失敗しました。");
    }
  };

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

    const normalizedPosition = normalizeBasePosition((values as any)?.position);
    if (!normalizedPosition) {
      toast.error("ポジションが不正です（GK/DF/MF/FW から選択してください）。");
      return;
    }
    const valuesNormalized = { ...(values as any), position: normalizedPosition } as PlayerFormValues;

    try {
      await setDoc(
        doc(db, 'club_profiles', clubUid),
        {
          publicPlayerParamsEnabled:
            typeof (values as any)?.showParamsOnPublic === 'boolean'
              ? Boolean((values as any).showParamsOnPublic)
              : true,
        },
        { merge: true }
      );
    } catch {
      // ignore
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
        position: valuesNormalized.position,
        number: valuesNormalized.number,
        photoUrl: valuesNormalized.photoUrl,
      });
      const playersColRef = collection(db, `clubs/${clubUid}/teams/${teamId}/players`);

      const paramsNormalized = valuesNormalized.params
        ? {
            overall: valuesNormalized.params.overall,
            items: Array.isArray(valuesNormalized.params.items)
              ? valuesNormalized.params.items.map((i: any) => ({
                  label: typeof i?.label === "string" ? i.label : "",
                  value: typeof i?.value === "number" ? i.value : undefined,
                }))
              : [],
          }
        : undefined;

      const manualStatsNormalized = Array.isArray(valuesNormalized.manualCompetitionStats)
        ? valuesNormalized.manualCompetitionStats
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

      const contractEndDate =
        typeof (valuesNormalized as any)?.contractEndYear === "number" &&
        Number.isFinite((valuesNormalized as any)?.contractEndYear) &&
        typeof (valuesNormalized as any)?.contractEndMonth === "number" &&
        Number.isFinite((valuesNormalized as any)?.contractEndMonth)
          ? `${String((valuesNormalized as any)?.contractEndYear).padStart(4, "0")}-${String((valuesNormalized as any)?.contractEndMonth).padStart(2, "0")}`
          : undefined;

      const snsLinksRaw = (valuesNormalized as any)?.snsLinks;
      const snsLinksClean = {
        x: typeof snsLinksRaw?.x === "string" ? snsLinksRaw.x : "",
        youtube: typeof snsLinksRaw?.youtube === "string" ? snsLinksRaw.youtube : "",
        tiktok: typeof snsLinksRaw?.tiktok === "string" ? snsLinksRaw.tiktok : "",
        instagram: typeof snsLinksRaw?.instagram === "string" ? snsLinksRaw.instagram : "",
      } as any;

      const seasonPayload: PlayerSeasonData = {
        number: valuesNormalized.number,
        position: valuesNormalized.position as any,
        mainPosition: (values as any).mainPosition,
        subPositions: Array.isArray((values as any).subPositions) ? ((values as any).subPositions as any[]).slice(0, 3) : [],
        nationality: valuesNormalized.nationality,
        age: valuesNormalized.age,
        tenureYears: (values as any).tenureYears,
        height: valuesNormalized.height,
        weight: (values as any).weight,
        profile: (values as any).profile,
        preferredFoot: (values as any).preferredFoot,
        annualSalary: (values as any).annualSalary,
        annualSalaryCurrency: (values as any).annualSalaryCurrency,
        contractEndDate,
        photoUrl: valuesNormalized.photoUrl,
        snsLinks: snsLinksClean,
        params: paramsNormalized as any,
        showParamsOnPublic: (values as any).showParamsOnPublic,
        manualCompetitionStats: manualStatsNormalized as any,
        isPublished: valuesNormalized.isPublished,
      };

      const seasonPayloadClean = (stripUndefinedDeep(seasonPayload) || {}) as any;

      let savedPlayerId: string | null = null;

      if (editingPlayer) {
        const currentSeasons = Array.isArray((editingPlayer as any)?.seasons) ? (((editingPlayer as any).seasons as string[]) || []) : [];
        const nextSeasons = currentSeasons.includes(selectedSeason) ? currentSeasons : [...currentSeasons, selectedSeason];
        const playerDocRef = doc(playersColRef, editingPlayer.id);
        const updatePayload = stripUndefinedDeep({
          name: valuesNormalized.name,
          position: valuesNormalized.position as any,
          mainPosition: (values as any).mainPosition,
          subPositions: Array.isArray((values as any).subPositions) ? ((values as any).subPositions as any[]).slice(0, 3) : [],
          number: valuesNormalized.number as any,
          photoUrl: valuesNormalized.photoUrl,
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
          name: valuesNormalized.name,
          teamId,
          seasons: nextSeasons,
          seasonData: {
            [selectedSeasonDash]: seasonPayloadClean,
          },
          number: valuesNormalized.number as any,
          position: valuesNormalized.position as any,
          mainPosition: (values as any).mainPosition,
          subPositions: Array.isArray((values as any).subPositions) ? ((values as any).subPositions as any[]).slice(0, 3) : [],
          photoUrl: valuesNormalized.photoUrl,
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
          ...valuesNormalized,
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
    const selectedSeasonSlash = selectedSeason;
    try {
      const playerDocRef = doc(db, `clubs/${clubUid}/teams/${teamId}/players`, deletingPlayer.id);
      const rosterDocRef = doc(db, `clubs/${clubUid}/seasons/${selectedSeasonDash}/roster`, deletingPlayer.id);
      const seasons = Array.isArray((deletingPlayer as any)?.seasons) ? ((deletingPlayer as any).seasons as string[]) : [];
      const normalizedTarget = String(selectedSeasonSlash || "").trim();
      const normalizedTargetDash = String(selectedSeasonDash || "").trim();
      const remaining = seasons.filter((s) => {
        const raw = typeof s === "string" ? s.trim() : "";
        if (!raw) return false;
        return raw !== normalizedTarget && raw !== normalizedTargetDash;
      });
      if (remaining.length === 0) {
        await deleteDoc(playerDocRef);
        await deleteDoc(rosterDocRef);
      } else {
        await updateDoc(playerDocRef, {
          seasons: arrayRemove(selectedSeasonSlash, selectedSeasonDash),
          [`seasonData.${selectedSeasonDash}`]: deleteField(),
        } as any);

        // Public pages use roster doc IDs as the source of truth.
        // If the player is removed from this season, the roster doc must be deleted.
        await deleteDoc(rosterDocRef);
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

  const openCsvDialog = () => {
    if (Number.isFinite(maxPlayers) && filteredPlayers.length >= maxPlayers) {
      toast.error(`現在のプランでは1チームあたり選手は最大${maxPlayers}人まで登録できます。`);
      return;
    }
    setCsvFileName("");
    setCsvPreview([]);
    setIsCsvDialogOpen(true);
  };

  const handleCsvSelected = async (file: File) => {
    setCsvFileName(file.name);
    setCsvPreview([]);

    const text = await readCsvFile(file);
    const rawRows = parseCsv(text).map((r) => r.map((c) => (typeof c === 'string' ? c.trim() : c)));
    const firstNonEmpty = rawRows.findIndex((r) => r.some((c) => String(c || '').trim() !== ''));
    const rows = firstNonEmpty >= 0 ? rawRows.slice(firstNonEmpty) : [];
    if (rows.length === 0) {
      toast.error('CSVの内容が空です。');
      return;
    }

    const normalizeHeaderCell = (v: unknown): string => {
      const raw = typeof v === 'string' ? v : '';
      return raw.replace(/\s+/g, '').trim().toLowerCase();
    };

    const headerLike = rows[0].some((c) => {
      const key = normalizeHeaderCell(c);
      const known = [
        'name',
        'number',
        'position',
        'nationality',
        'height',
        'weight',
        'foot',
        'age',
        '選手名',
        '背番号',
        'pos.(gk,df,mf,fw)',
        'pos',
        'ポジション',
        '国籍/出身',
        '身長',
        '体重',
        '利き足(右,左,両)',
        '利き足',
        '年齢',
      ].map((s) => normalizeHeaderCell(s));
      return known.includes(key);
    });
    const header = headerLike ? rows[0].map((c) => String(c || '').trim()) : [];
    const dataRows = headerLike ? rows.slice(1) : rows;

    const toCanonicalKey = (headerCell: string): string => {
      const k = normalizeHeaderCell(headerCell);
      if (k === 'name' || k === normalizeHeaderCell('選手名')) return 'name';
      if (k === 'number' || k === normalizeHeaderCell('背番号')) return 'number';
      if (k === 'position' || k === 'pos' || k === normalizeHeaderCell('ポジション') || k === normalizeHeaderCell('Pos.(GK,DF,MF,FW)')) return 'position';
      if (k === 'nationality' || k === normalizeHeaderCell('国籍/出身')) return 'nationality';
      if (k === 'height' || k === normalizeHeaderCell('身長')) return 'height';
      if (k === 'weight' || k === normalizeHeaderCell('体重')) return 'weight';
      if (k === 'foot' || k === normalizeHeaderCell('利き足') || k === normalizeHeaderCell('利き足(右,左,両)')) return 'foot';
      if (k === 'age' || k === normalizeHeaderCell('年齢')) return 'age';
      return '';
    };

    const idx = (key: string): number => {
      if (!headerLike) return -1;
      const canonical = key.toLowerCase();
      for (let i = 0; i < header.length; i++) {
        if (toCanonicalKey(header[i]) === canonical) return i;
      }
      return -1;
    };

    const getCell = (row: string[], key: string, fallbackIndex: number): string => {
      const i = idx(key);
      if (i >= 0) return String(row[i] ?? '').trim();
      return String(row[fallbackIndex] ?? '').trim();
    };

    const preview = dataRows
      .map((r, i) => {
        const rowNumber = (headerLike ? 2 : 1) + i;
        const name = getCell(r, 'name', 0);
        const numberRaw = getCell(r, 'number', 1);
        const positionRaw = getCell(r, 'position', 2);

        const nationality = getCell(r, 'nationality', 3);
        const heightRaw = getCell(r, 'height', 4);
        const weightRaw = getCell(r, 'weight', 5);
        const footRaw = getCell(r, 'foot', 6);
        const ageRaw = getCell(r, 'age', 7);

        if (!name) {
          return { rowNumber, data: { name, numberRaw, positionRaw }, error: '選手名が空です' };
        }
        const n = normalizeNumberValue(numberRaw);
        if (n === null) {
          return { rowNumber, data: { name, numberRaw, positionRaw }, error: '背番号が不正です' };
        }
        const pos = normalizeBasePosition(positionRaw);
        if (!pos) {
          return { rowNumber, data: { name, numberRaw, positionRaw }, error: 'Posが不正です（GK/DF/MF/FW）' };
        }

        const height = normalizeNumberValue(heightRaw);
        if (heightRaw && height === null) {
          return { rowNumber, data: { name, numberRaw, positionRaw }, error: '身長が不正です' };
        }
        const weight = normalizeNumberValue(weightRaw);
        if (weightRaw && weight === null) {
          return { rowNumber, data: { name, numberRaw, positionRaw }, error: '体重が不正です' };
        }
        const age = normalizeNumberValue(ageRaw);
        if (ageRaw && age === null) {
          return { rowNumber, data: { name, numberRaw, positionRaw }, error: '年齢が不正です' };
        }

        const preferredFoot = normalizePreferredFoot(footRaw);
        if (footRaw && !preferredFoot) {
          return { rowNumber, data: { name, numberRaw, positionRaw }, error: '利き足が不正です（右/左/両）' };
        }

        return {
          rowNumber,
          data: {
            name,
            number: n,
            position: pos,
            nationality: nationality || undefined,
            height: height ?? undefined,
            weight: weight ?? undefined,
            preferredFoot,
            age: age ?? undefined,
          },
        };
      })
      .filter((p) => {
        const d = p.data || {};
        return Boolean(String((d as any)?.name || '').trim() || String((d as any)?.numberRaw || '').trim() || String((d as any)?.positionRaw || '').trim());
      });

    if (preview.length === 0) {
      toast.error('CSVの内容が空です。');
      return;
    }

    setCsvPreview(preview);
  };

  const handleImportCsv = async () => {
    if (!clubUid || !teamId) return;
    if (!selectedSeason) {
      toast.error('シーズンが選択されていません。');
      return;
    }
    if (!csvPreview || csvPreview.length === 0) {
      toast.error('CSVが選択されていません。');
      return;
    }
    const hasError = csvPreview.some((p) => Boolean(p.error));
    if (hasError) {
      toast.error('エラー行があります。内容を修正してから再度お試しください。');
      return;
    }

    const rows = csvPreview.map((p) => p.data).filter(Boolean);
    if (Number.isFinite(maxPlayers) && filteredPlayers.length + rows.length > maxPlayers) {
      toast.error(`現在のプランでは1チームあたり選手は最大${maxPlayers}人まで登録できます。`);
      return;
    }

    const selectedSeasonDash = toDashSeason(selectedSeason);
    setImportingCsv(true);
    try {
      const playersColRef = collection(db, `clubs/${clubUid}/teams/${teamId}/players`);
      const batch = writeBatch(db);
      const ids: string[] = [];

      for (const r of rows) {
        const docRef = doc(playersColRef);
        ids.push(docRef.id);

        const seasonPayload: PlayerSeasonData = {
          number: (r as any).number,
          position: (r as any).position,
          nationality: (r as any).nationality,
          age: (r as any).age,
          height: (r as any).height,
          weight: (r as any).weight,
          preferredFoot: (r as any).preferredFoot,
          isPublished: true,
        };

        const seasonPayloadClean = (stripUndefinedDeep(seasonPayload) || {}) as any;
        const playerPayload = stripUndefinedDeep({
          name: (r as any).name,
          number: (r as any).number,
          position: (r as any).position,
          nationality: (r as any).nationality,
          age: (r as any).age,
          height: (r as any).height,
          weight: (r as any).weight,
          preferredFoot: (r as any).preferredFoot,
          seasons: [selectedSeason],
          seasonData: {
            [selectedSeasonDash]: seasonPayloadClean,
          },
        });
        batch.set(docRef, (playerPayload || {}) as any, { merge: true });

        const rosterDocRef = doc(db, `clubs/${clubUid}/seasons/${selectedSeasonDash}/roster`, docRef.id);
        const rosterPayload = stripUndefinedDeep({
          ...(playerPayload || {}),
          teamId,
          seasons: [selectedSeason],
          seasonData: {
            [selectedSeasonDash]: seasonPayloadClean,
          },
          number: (r as any).number,
          position: (r as any).position,
        });
        batch.set(rosterDocRef, (rosterPayload || {}) as any, { merge: true });
      }

      await batch.commit();

      await Promise.all(ids.map((id) => invalidatePlayerStatsCache(id)));

      toast.success(`${rows.length}人の選手を追加しました。`);
      setIsCsvDialogOpen(false);
      setCsvPreview([]);
      setCsvFileName("");
    } catch (e: any) {
      toast.error(e?.message || 'CSVインポートに失敗しました。');
    } finally {
      setImportingCsv(false);
    }
  };

  return (
    <>
      <div className="mt-6">
        <div className="mb-4 w-full">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button
                  onClick={openAddDialog}
                  disabled={Number.isFinite(maxPlayers) && filteredPlayers.length >= maxPlayers}
                  className="w-full bg-white text-gray-900 hover:bg-gray-100 border border-border"
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

            <Dialog open={isCsvDialogOpen} onOpenChange={setIsCsvDialogOpen}>
              <DialogTrigger asChild>
                <Button
                  type="button"
                  onClick={openCsvDialog}
                  disabled={Number.isFinite(maxPlayers) && filteredPlayers.length >= maxPlayers}
                  className="w-full bg-white text-gray-900 hover:bg-gray-100 border border-border"
                >
                  CSVで追加（準備中）
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-h-[80vh]">
                <DialogHeader>
                  <DialogTitle>CSVで選手を追加</DialogTitle>
                </DialogHeader>

                <div className="space-y-3">
                  <div className="text-sm text-muted-foreground">
                    必須：name（選手名）, number（背番号）, position（GK/DF/MF/FW）
                  </div>

                  <Button type="button" variant="outline" onClick={downloadCsvTemplate} className="w-full bg-white text-gray-900 border border-border hover:bg-gray-100">
                    テンプレートCSVをダウンロード
                  </Button>

                  <div className="space-y-2">
                    <input
                      type="file"
                      accept=".csv,text/csv"
                      onChange={async (e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        await handleCsvSelected(f);
                      }}
                    />
                    {csvFileName ? <div className="text-xs text-muted-foreground">{csvFileName}</div> : null}
                  </div>

                  {csvPreview.length > 0 ? (
                    <div className="rounded-md border bg-white p-2">
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-semibold">プレビュー</div>
                        <div className="text-xs text-muted-foreground">
                          {csvPreview.filter((p) => !p.error).length}件OK / {csvPreview.filter((p) => p.error).length}件エラー
                        </div>
                      </div>

                      <div className="mt-2 space-y-1">
                        {csvPreview.slice(0, 10).map((p) => (
                          <div key={`${p.rowNumber}`} className="flex items-start justify-between gap-2 text-xs">
                            <div className="min-w-0">
                              <div className="truncate">
                                {p.data?.name} #{p.data?.number} {p.data?.position}
                              </div>
                              {p.error ? <div className="text-red-600">{p.rowNumber}行目: {p.error}</div> : null}
                            </div>
                          </div>
                        ))}
                        {csvPreview.length > 10 ? (
                          <div className="text-xs text-muted-foreground">…他{csvPreview.length - 10}件</div>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  <Button
                    type="button"
                    disabled={importingCsv || csvPreview.length === 0 || csvPreview.some((p) => Boolean(p.error))}
                    onClick={handleImportCsv}
                    className="w-full"
                  >
                    {importingCsv ? '取り込み中...' : '取り込みを実行'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
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
