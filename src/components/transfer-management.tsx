"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
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

import type { Player } from "@/types/player";
import type { TransferDirection, TransferLog } from "@/types/transfer";

import { TransferForm, TransferFormValues } from "@/components/transfer-form";
import { PlayersDataTable } from "@/components/players-data-table";
import { transferColumns } from "@/components/transfers-columns";
import { toSlashSeason } from "@/lib/season";
import { formatMoneyWithSymbol } from "@/lib/money";

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

export function TransferManagement({ teamId, seasons, selectedSeason, onChangeSeason }: TransferManagementProps) {
  const { user, ownerUid } = useAuth();
  const clubUid = ownerUid || user?.uid;

  const normalizedSelectedSeason = useMemo(() => toSlashSeason(selectedSeason), [selectedSeason]);

  const [internalCurrency, setInternalCurrency] = useState<"JPY" | "EUR" | "GBP">("JPY");

  const [direction, setDirection] = useState<TransferDirection>("in");
  const [items, setItems] = useState<TransferLog[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TransferLog | null>(null);
  const [deleting, setDeleting] = useState<TransferLog | null>(null);

  const currency = (arguments[0] as any)?.currency ?? internalCurrency;
  const setCurrency = ((arguments[0] as any)?.onChangeCurrency ?? setInternalCurrency) as (c: "JPY" | "EUR" | "GBP") => void;
  const hideSeasonSelect = Boolean((arguments[0] as any)?.hideSeasonSelect);
  const hideCurrencySelect = Boolean((arguments[0] as any)?.hideCurrencySelect);

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

    const pickSeasonForPlayer = (p: Player): string | null => {
      const ps = Array.isArray(p.seasons) ? p.seasons : [];
      const normalized = ps.map((s) => toSlashSeason(s));
      for (const s of targetSeasons) {
        if (normalized.includes(s)) return s;
      }
      return null;
    };

    const seen = new Set<string>();
    const out: Player[] = [];

    // Prefer players belonging to the current season first, then previous season (OUT only).
    const orderedCandidates = targetSeasons
      .map((s) =>
        players
          .filter((p) => (Array.isArray(p.seasons) ? p.seasons : []).some((ps) => toSlashSeason(ps) === s))
          .map((p) => ({ p, season: s }))
      )
      .flat();

    for (const { p, season } of orderedCandidates) {
      const key = (p.name || "").trim();
      if (!key) continue;
      if (seen.has(key)) continue;
      seen.add(key);

      const seasonData = (p.seasonData || {})[season] as any;
      out.push({
        ...p,
        dateOfBirth: seasonData?.dateOfBirth ?? (p as any).dateOfBirth,
        position: seasonData?.position ?? (p as any).position,
      } as Player);
    }

    // Fallback: if nothing matched, keep current behavior
    if (out.length === 0) {
      return players
        .filter((p) => {
          const s = pickSeasonForPlayer(p);
          return Boolean(s);
        })
        .map((p) => {
          const s = pickSeasonForPlayer(p);
          const seasonData = s ? ((p.seasonData || {})[s] as any) : undefined;
          return {
            ...p,
            dateOfBirth: seasonData?.dateOfBirth ?? (p as any).dateOfBirth,
            position: seasonData?.position ?? (p as any).position,
          } as Player;
        });
    }

    return out;
  }, [players, selectedSeason, normalizedSelectedSeason, direction]);

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
    try {
      const ref = doc(db, `clubs/${clubUid}/teams/${teamId}/transfers`, deleting.id);
      await deleteDoc(ref);
      toast.success("移籍ログを削除しました。");
      setDeleting(null);
    } catch (error) {
      console.error("Error deleting transfer: ", error);
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
            {filteredItems.map((item) => (
              <div
                key={item.id}
                onClick={() => openEditDialog(item)}
                className="rounded-xl border border-[#263149] bg-[#141d2e] p-4 cursor-pointer hover:border-[#60a5fa] transition-colors"
              >
                <div className="flex items-center gap-3">
                  {/* Avatar */}
                  <div className="w-[34px] h-[34px] rounded-full bg-[#101827] flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-medium text-[#8b93a7]">
                      {(item.playerName || "").charAt(0) || "?"}
                    </span>
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
                        {item.age != null && ` · ${item.age}歳`}
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
                </div>
              </div>
            ))}
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
