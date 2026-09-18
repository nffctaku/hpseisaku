"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useCareer } from "@/contexts/CareerContext";
import { auth, db } from "@/lib/firebase";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";

import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import Image from "next/image";
import { Trash2, Users } from "lucide-react";

import type { Player } from "@/types/player";
import type { TransferDirection, TransferLog } from "@/types/transfer";

import { TransferForm, TransferFormValues } from "@/components/transfer-form";
import { PlayersDataTable } from "@/components/players-data-table";
import { transferColumns } from "@/components/transfers-columns";
import { toSlashSeason, toDashSeason } from "@/lib/season";
import { formatMoneyWithSymbol } from "@/lib/money";
import { pickPlayerPhotoUrl } from "@/lib/player-photo";
import { tryCalculateAge } from "@/lib/player-calculations";

interface TransferManagementProps {
  teamId: string;
  seasons: string[];
  selectedSeason: string;
  onChangeSeason: (seasonId: string) => void;

  currency?: "JPY" | "EUR" | "GBP";
  onChangeCurrency?: (currency: "JPY" | "EUR" | "GBP") => void;
  hideSeasonSelect?: boolean;
  hideCurrencySelect?: boolean;
}

export function TransferManagement({
  teamId,
  seasons,
  selectedSeason,
  onChangeSeason,
  currency: currencyProp,
  onChangeCurrency,
}: TransferManagementProps) {
  const { user, clubProfileId } = useAuth();
  const { activeCareer } = useCareer();
  const clubUid = activeCareer?.clubUid || user?.clubUid || user?.uid;

  const normalizedSelectedSeason = useMemo(() => toSlashSeason(selectedSeason), [selectedSeason]);

  const [internalCurrency, setInternalCurrency] = useState<"JPY" | "EUR" | "GBP">("JPY");

  const [direction, setDirection] = useState<TransferDirection>("in");
  const [items, setItems] = useState<TransferLog[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TransferLog | null>(null);
  const [deleting, setDeleting] = useState<TransferLog | null>(null);

  const currency = currencyProp ?? internalCurrency;

  const transferFormKey = editing ? `${editing.id}-${currency}` : `new-${selectedSeason}-${direction}-${currency}`;

  const formatCurrencyAmount = (currency: string, amount: number): string => {
    if (currency === "EUR") {
      return `€${(amount / 1000000).toFixed(1)}M`;
    }
    return formatMoneyWithSymbol(amount, currency);
  };

  useEffect(() => {
    if (!clubUid || !teamId) return;
    const colRef = collection(db, `clubs/${clubUid}/teams/${teamId}/transfers`);
    const q = query(colRef);

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as TransferLog));
        setItems(list);
      },
      (error) => {
        const code = (error as any)?.code;
        console.error("[TransferManagement] transfers onSnapshot error", error, {
          code,
          path: `clubs/${clubUid}/teams/${teamId}/transfers`,
        });
        toast.error(code === "permission-denied" ? "移籍ログの取得に失敗しました（permission-denied）。" : "移籍ログの取得に失敗しました。", {
          id: "transfer-onSnapshot-error",
        });
      }
    );

    return () => unsubscribe();
  }, [clubUid, teamId]);

  useEffect(() => {
    if (!clubUid || !teamId) return;
    const colRef = collection(db, `clubs/${clubUid}/teams/${teamId}/players`);
    const q = query(colRef);

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as Player));
        setPlayers(list);
      },
      (error) => {
        const code = (error as any)?.code;
        console.error("[TransferManagement] players onSnapshot error", error, {
          code,
          path: `clubs/${clubUid}/teams/${teamId}/players`,
        });
      }
    );

    return () => unsubscribe();
  }, [clubUid, teamId]);

  const filteredPlayers = useMemo(() => {
    if (!selectedSeason) return players;

    const target = normalizedSelectedSeason;
    const m = String(target).match(/^\s*(\d{4})\/(\d{2})\s*$/);
    const prevSeason = m
      ? `${String(Number(m[1]) - 1)}/${String((Number(m[2]) - 1 + 100) % 100).padStart(2, "0")}`
      : null;

    const targetSeasons = direction === "out" && prevSeason ? [target, prevSeason] : [target];

    // 選手管理の hasSelectedSeason と同一の所属判定：
    // - seasons 配列に対象シーズンを含む（slash/dash 両表記を正規化して比較）
    // - seasonData に対象シーズンのキーがある（slash/dash 両対応）
    // - seasons 未設定のレガシー選手は全シーズン所属とみなす
    const pickSeasonForPlayer = (p: Player): string | null => {
      const ps = Array.isArray(p.seasons) ? (p.seasons as string[]) : null;
      const sd = p.seasonData && typeof p.seasonData === "object" ? (p.seasonData as any) : null;
      for (const s of targetSeasons) {
        const dash = toDashSeason(s);
        if (ps && ps.some((x) => toDashSeason(x) === dash)) return s;
        if (sd && (sd[s] || sd[dash])) return s;
      }
      if (!ps || ps.length === 0) return target;
      return null;
    };

    const seen = new Set<string>();
    const out: Player[] = [];

    // Prefer players belonging to the current season first, then previous season (OUT only).
    for (const season of targetSeasons) {
      for (const p of players) {
        if (seen.has(p.id)) continue;
        if (pickSeasonForPlayer(p) !== season) continue;
        seen.add(p.id);

        const sd = (p.seasonData || {}) as any;
        const seasonData = sd[season] || sd[toDashSeason(season)];
        out.push({
          ...p,
          dateOfBirth: seasonData?.dateOfBirth ?? (p as any).dateOfBirth,
          position: seasonData?.position ?? (p as any).position,
        } as Player);
      }
    }

    return out;
  }, [players, selectedSeason, normalizedSelectedSeason, direction]);

  // playerId → 選択シーズンの画像URL・生年月日（選手管理と同じ解決順）
  const playerInfoById = useMemo(() => {
    const m = new Map<string, { photoUrl?: string; dateOfBirth?: string }>();
    for (const p of players) {
      const url = pickPlayerPhotoUrl(p as any, normalizedSelectedSeason);
      const sd = (p.seasonData || {}) as any;
      const sdSeason = sd[normalizedSelectedSeason] || sd[toDashSeason(normalizedSelectedSeason)] || {};
      const dob = sdSeason?.dateOfBirth ?? (p as any).dateOfBirth;
      m.set(p.id, {
        photoUrl: url || undefined,
        dateOfBirth: typeof dob === "string" && dob.trim() ? dob : undefined,
      });
    }
    return m;
  }, [players, normalizedSelectedSeason]);

  const filteredItems = useMemo(() => {
    const target = normalizedSelectedSeason;
    return items
      .filter((t) => toSlashSeason(t.season) === target)
      .filter((t) => t.direction === direction)
      .sort((a, b) => (a.playerName || "").localeCompare(b.playerName || ""));
  }, [items, normalizedSelectedSeason, direction]);

  const openAddDialog = () => {
    setEditing(null);
    setIsDialogOpen(true);
  };

  const openEditDialog = (row: TransferLog) => {
    setEditing(row);
    setIsDialogOpen(true);
  };

  const handleFormSubmit = async (values: TransferFormValues) => {
    if (!clubUid || !teamId) return;

    const payload: any = {
      season: values.season,
      direction: values.direction,
      kind: (values as any).kind || "完全",
      playerName: values.playerName,
      counterparty: values.counterparty,
      ownerUid: clubUid,
      clubProfileId: clubProfileId || null,
      updatedAt: serverTimestamp(),
    };

    if (values.playerId && values.playerId.trim().length > 0) {
      payload.playerId = values.playerId;
    }
    if (values.dateOfBirth && values.dateOfBirth.trim().length > 0) {
      payload.dateOfBirth = values.dateOfBirth;
    }
    if (values.position && values.position.trim().length > 0) {
      payload.position = values.position;
    }
    if (values.fee != null) {
      payload.fee = values.fee;
      payload.feeCurrency = currency;
    }

    if (values.direction === "in") {
      if (values.annualSalary != null) {
        payload.annualSalary = values.annualSalary;
        payload.annualSalaryCurrency = currency;
      }
      if (values.contractYears != null) {
        payload.contractYears = values.contractYears;
      }
    }

    try {
      const colRef = collection(db, `clubs/${clubUid}/teams/${teamId}/transfers`);
      if (editing) {
        const ref = doc(colRef, editing.id);
        await updateDoc(ref, payload);
        toast.success("移籍ログを更新しました。");
      } else {
        await addDoc(colRef, { ...payload, createdAt: serverTimestamp() });
        toast.success("移籍ログを追加しました。");
      }
      setIsDialogOpen(false);
      setEditing(null);
    } catch (error) {
      console.error("Error saving transfer: ", error);
      toast.error("移籍ログの保存に失敗しました。権限や入力内容をご確認ください。");
    }
  };

  const handleDelete = async () => {
    if (!clubUid || !teamId || !deleting) return;
    const target = deleting;
    try {
      // 一覧から即時に消す（失敗時はonSnapshotが元に戻す）
      setItems((prev) => prev.filter((t) => t.id !== target.id));
      setDeleting(null);
      setIsDialogOpen(false);
      setEditing(null);

      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error("missing auth");
      const idToken = await currentUser.getIdToken();
      const res = await fetch("/api/club/transfers/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ teamId, transferId: target.id }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as any)?.error || "failed");
      }
      toast.success("移籍ログを削除しました。");
    } catch (error) {
      console.error("Error deleting transfer: ", error);
      // 失敗時は再取得して一覧を復元
      try {
        const snap = await getDocs(collection(db, `clubs/${clubUid}/teams/${teamId}/transfers`));
        setItems(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as TransferLog)));
      } catch {
        // ignore
      }
      toast.error("移籍ログの削除に失敗しました。");
    }
  };

  return (
    <>
      <div className="mt-6 space-y-4">
        {/* IN/OUT Pill Toggle */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setDirection("in")}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              direction === "in"
                ? "bg-[#141d2e] text-[#4ade80] border border-[#4ade80]"
                : "bg-[#141d2e] text-[#8b93a7] border border-[#263149] hover:text-white"
            }`}
          >
            IN
          </button>
          <button
            type="button"
            onClick={() => setDirection("out")}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              direction === "out"
                ? "bg-[#141d2e] text-[#f87171] border border-[#f87171]"
                : "bg-[#141d2e] text-[#8b93a7] border border-[#263149] hover:text-white"
            }`}
          >
            OUT
          </button>
        </div>

        {/* Add Button */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <button
              type="button"
              onClick={openAddDialog}
              className="w-full py-3 rounded-xl bg-[#60a5fa] text-white font-medium hover:bg-[#3b82f6] transition-colors"
            >
              ＋ 選手の移籍を記録する
            </button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-h-[80vh] bg-[#101827] border-[#263149]">
            <DialogHeader>
              <DialogTitle className="text-white">{editing ? "移籍ログを編集" : "移籍ログを追加"}</DialogTitle>
            </DialogHeader>
            <TransferForm
              key={transferFormKey}
              onSubmit={handleFormSubmit}
              defaultValues={
                editing
                  ? ({
                      ...(editing as any),
                      feeCurrency: currency,
                      annualSalaryCurrency: currency,
                    } as any)
                  : ({
                      feeCurrency: currency,
                      annualSalaryCurrency: currency,
                    } as any)
              }
              fixedCurrency={currency}
              season={selectedSeason}
              direction={direction}
              players={filteredPlayers}
            />
            {editing ? (
              <button
                type="button"
                onClick={() => setDeleting(editing)}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-[#f87171]/40 bg-[#f87171]/10 px-4 py-2.5 text-sm font-medium text-[#f87171] transition-colors hover:bg-[#f87171]/20"
              >
                <Trash2 className="h-4 w-4" />
                この移籍記録を削除
              </button>
            ) : null}
          </DialogContent>
        </Dialog>

        {/* Transfer Cards List */}
        {filteredItems.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-[#263149] bg-[#141d2e] p-8 text-center">
            <p className="text-sm text-[#8b93a7] mb-2">まだ記録がありません</p>
            <p className="text-xs text-[#6b7280]">「＋ 選手の移籍を記録する」ボタンから追加してください</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredItems.map((item) => {
              const info = item.playerId ? playerInfoById.get(item.playerId) : undefined;
              // 年齢は記録のage → 記録のdateOfBirth → 選手プロフィールのdateOfBirth の順で導出
              const displayAge =
                item.age ??
                tryCalculateAge((item as any).dateOfBirth, normalizedSelectedSeason) ??
                tryCalculateAge(info?.dateOfBirth, normalizedSelectedSeason);
              return (
              <div
                key={item.id}
                onClick={() => openEditDialog(item)}
                className="rounded-xl border border-[#263149] bg-[#141d2e] p-4 cursor-pointer hover:border-[#60a5fa] transition-colors"
              >
                <div className="flex items-center gap-3">
                  {/* Avatar: 選手管理と同じ h-16 w-16 角丸四角、画像→人型アイコン */}
                  <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded bg-white/10 -ml-4 -mt-4 -mb-4">
                    {info?.photoUrl ? (
                      <Image
                        src={info.photoUrl}
                        alt={item.playerName || ""}
                        fill
                        className="object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-white/25">
                        <Users className="h-8 w-8" />
                      </div>
                    )}
                  </div>

                  {/* Player Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-white truncate">
                      {item.playerName || "-"}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      {/* Position Badge */}
                      {item.position && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-[rgba(96,165,250,0.12)] text-[#60a5fa]">
                          {item.position}
                        </span>
                      )}
                      {/* Metadata */}
                      <span className="text-xs text-[#8b93a7] truncate">
                        {item.counterparty || "-"}
                        {displayAge != null && ` · ${displayAge}歳`}
                      </span>
                    </div>
                  </div>

                  {/* Amount */}
                  <div className="text-right">
                    {(item as any).fee != null && (
                      <p className="text-sm font-semibold text-white">
                        {formatCurrencyAmount((item as any).feeCurrency || currency, (item as any).fee)}
                      </p>
                    )}
                    {direction === "in" && (item as any).annualSalary != null && (
                      <p className="text-xs text-[#8b93a7]">
                        年俸: {formatCurrencyAmount((item as any).annualSalaryCurrency || currency, (item as any).annualSalary)}
                      </p>
                    )}
                  </div>

                  {/* Delete Button */}
                  <button
                    type="button"
                    aria-label={`${item.playerName || "この選手"}を移籍記録から削除`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleting(item);
                    }}
                    className="ml-1 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-[#8b93a7] transition-colors hover:bg-[#f87171]/15 hover:text-[#f87171]"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              );
            })}
          </div>
        )}
      </div>

      <AlertDialog open={!!deleting} onOpenChange={() => setDeleting(null)}>
        <AlertDialogContent className="bg-[#101827] border-[#263149]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">本当に削除しますか？</AlertDialogTitle>
            <AlertDialogDescription className="text-[#8b93a7]">
              移籍ログ「{deleting?.playerName}」を削除します。この操作は元に戻せません。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-[#141d2e] text-white border-[#263149] hover:bg-[#263149]">キャンセル</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-[#f87171] text-white hover:bg-[#dc2626]">削除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
