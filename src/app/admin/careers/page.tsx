"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useCareer } from "@/contexts/CareerContext";
import type { Career } from "@/lib/career";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Shield, Plus, Check, ChevronLeft, ChevronRight, Save, X, Trash2, RotateCcw, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { auth } from "@/lib/firebase";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

function formatSeasonRange(start: string | null | undefined, latest: string | null | undefined): string {
  if (!start && !latest) return "未設定";
  if (start && !latest) return `${start}〜`;
  if (start && latest && start !== latest) return `${start} 〜 ${latest}`;
  return start || latest || "未設定";
}

export default function CareersPage() {
  const { user } = useAuth();
  const { activeCareer, careers, loading, error, switchCareer, refreshCareers } = useCareer();
  const router = useRouter();
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [dialog, setDialog] = useState<{ mode: "delete" | "restore"; career: Career } | null>(null);
  const [confirmName, setConfirmName] = useState("");
  const [actioning, setActioning] = useState(false);

  const startEditing = (career: { id: string; name: string }) => {
    setEditingId(career.id);
    setDraftName(career.name);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setDraftName("");
  };

  const handleRename = async (careerId: string) => {
    const trimmed = draftName.trim();
    if (!trimmed) {
      toast.error("記録名を入力してください");
      return;
    }
    setSavingName(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`/api/careers/${encodeURIComponent(careerId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: trimmed }),
      });
      const json = (await res.json()) as { ok?: boolean; message?: string };
      if (!res.ok || !json.ok) throw new Error(json.message || "更新に失敗しました");
      toast.success("記録名を更新しました");
      setEditingId(null);
      await refreshCareers();
    } catch (e: any) {
      toast.error(e?.message || "記録名の更新に失敗しました");
    } finally {
      setSavingName(false);
    }
  };

  const handleSwitch = async (careerId: string) => {
    if (careerId === activeCareer?.id) return;
    setSwitchingId(careerId);
    try {
      await switchCareer(careerId);
      toast.success("Careerを切り替えました");
      router.push("/admin");
    } catch (e) {
      toast.error("Careerの切り替えに失敗しました");
    } finally {
      setSwitchingId(null);
    }
  };

  const openDialog = (mode: "delete" | "restore", career: Career) => {
    setDialog({ mode, career });
    setConfirmName("");
    setActioning(false);
  };

  const closeDialog = () => {
    setDialog(null);
    setConfirmName("");
    setActioning(false);
  };

  const handleConfirm = async () => {
    if (!dialog) return;
    const { mode, career } = dialog;
    if (career.name !== confirmName.trim()) {
      toast.error("記録名が一致しません。対象を確認してください。");
      return;
    }

    setActioning(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`/api/careers/${encodeURIComponent(career.id)}`, {
        method: mode === "delete" ? "DELETE" : "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await res.json()) as { ok?: boolean; message?: string };
      if (!res.ok || !json.ok) throw new Error(json.message || "処理に失敗しました");
      toast.success(mode === "delete" ? "記録を削除しました" : "記録を復元しました");
      closeDialog();
      await refreshCareers();
    } catch (e: any) {
      toast.error(e?.message || "処理に失敗しました");
    } finally {
      setActioning(false);
    }
  };

  return (
    <div className="-m-4 min-h-full bg-[#F3F4F7] p-4 text-gray-900 sm:-m-6 sm:p-6 md:-m-8 md:p-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-950">キャリア管理</h1>
            <p className="text-sm text-slate-500">Careerの一覧・切り替えを行えます</p>
          </div>
          <Button
            asChild
            className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700"
          >
            <Link href="/admin/careers/new" className="flex items-center gap-1.5">
              <Plus className="h-4 w-4" />
              新しいCareer
            </Link>
          </Button>
        </div>

        <Link
          href="/admin"
          className="mb-4 inline-flex items-center gap-1 text-sm font-bold text-slate-600 hover:text-slate-900"
        >
          <ChevronLeft className="h-4 w-4" />
          管理トップに戻る
        </Link>

        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-8 text-center text-sm text-red-700">
            {error}
          </div>
        ) : loading ? (
          <div className="rounded-2xl bg-white p-8 text-center text-sm text-slate-500">読み込み中...</div>
        ) : careers.length === 0 ? (
          <div className="rounded-2xl bg-white p-8 text-center text-sm text-slate-500">
            Careerがありません。新しいCareerを作成してください。
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {careers.map((career) => {
              const isActive = career.id === activeCareer?.id;
              return (
                <div
                  key={career.id}
                  className={`relative flex flex-col rounded-2xl border bg-white p-5 shadow-sm transition ${
                    isActive ? "border-emerald-500 ring-1 ring-emerald-500" : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full bg-slate-100">
                        {career.clubLogo ? (
                          <Image
                            src={career.clubLogo}
                            alt={career.clubName}
                            fill
                            className="object-contain"
                            sizes="48px"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-slate-400">
                            <Shield className="h-5 w-5" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        {editingId === career.id ? (
                          <div className="flex items-center gap-1">
                            <Input
                              value={draftName}
                              onChange={(e) => setDraftName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") void handleRename(career.id);
                                if (e.key === "Escape") cancelEditing();
                              }}
                              disabled={savingName}
                              className="h-8 rounded-lg border-slate-200 bg-white text-sm"
                              autoFocus
                            />
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0 text-emerald-600"
                              disabled={savingName}
                              onClick={() => void handleRename(career.id)}
                            >
                              <Save className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0 text-slate-400"
                              disabled={savingName}
                              onClick={cancelEditing}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => startEditing(career)}
                            className="text-left"
                          >
                            <div className="truncate text-base font-bold text-gray-950 hover:text-emerald-700">
                              {career.name}
                              {career.id === activeCareer?.id && (
                                <span className="ml-2 inline-flex items-center rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
                                  使用中
                                </span>
                              )}
                            </div>
                          </button>
                        )}
                        <div className="truncate text-sm font-semibold text-slate-600">{career.clubName}</div>
                        {career.clubId && (
                          <div className="text-xs text-slate-400">
                            {typeof window !== "undefined" ? window.location.origin : "https://..."}/{career.clubId}
                          </div>
                        )}
                        {career.status === "creating" && (
                          <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                            作成中（コピー未完了）
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 space-y-1 text-sm text-slate-500">
                    <div className="flex items-center gap-1">
                      <span className="font-bold text-slate-700">{formatSeasonRange(career.startSeason, career.latestSeason)}</span>
                    </div>
                    <div>{career.seasonCount} Seasons</div>
                  </div>

                  <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
                    {career.status === "deleted" ? (
                      <Button
                        size="sm"
                        className="flex-1 rounded-lg border border-emerald-200 bg-emerald-50 text-xs font-bold text-emerald-700 hover:bg-emerald-100"
                        onClick={() => openDialog("restore", career)}
                      >
                        <RotateCcw className="mr-1 h-3 w-3" />
                        復元
                      </Button>
                    ) : isActive ? (
                      <span className="inline-flex flex-1 items-center justify-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-700">
                        <Check className="h-3 w-3" />
                        使用中
                      </span>
                    ) : career.status === "creating" ? (
                      <span className="w-full rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-center text-xs font-bold text-amber-700">
                        作成完了後に切り替え可能です
                      </span>
                    ) : (
                      <Button
                        size="sm"
                        className="flex-1 rounded-lg bg-slate-900 text-xs font-bold text-white hover:bg-slate-800"
                        disabled={switchingId === career.id}
                        onClick={() => handleSwitch(career.id)}
                      >
                        {switchingId === career.id ? "切り替え中..." : "このCareerに切り替える"}
                      </Button>
                    )}
                    {career.status !== "deleted" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="shrink-0 rounded-lg border-red-200 text-xs font-bold text-red-600 hover:bg-red-50 hover:text-red-700"
                        onClick={() => openDialog("delete", career)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <Dialog open={!!dialog} onOpenChange={(open) => !open && closeDialog()}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {dialog?.mode === "delete" ? (
                  <>
                    <AlertTriangle className="h-5 w-5 text-red-600" />
                    この記録を削除
                  </>
                ) : (
                  <>
                    <RotateCcw className="h-5 w-5 text-emerald-600" />
                    記録を復元
                  </>
                )}
              </DialogTitle>
              <DialogDescription asChild>
                <div className="space-y-2 pt-2 text-sm text-slate-600">
                  <p>
                    {dialog?.mode === "delete"
                      ? "削除するとこの記録の管理・公開ページが利用できなくなります。他の記録には影響しません。"
                      : "復元すると公開URLも復活します。3件上限を超えている場合は復元できません。"}
                  </p>
                  {dialog && (
                    <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
                      <div className="font-bold text-slate-900">{dialog.career.name}</div>
                      <div className="text-slate-600">{dialog.career.clubName}</div>
                      {dialog.career.clubId && (
                        <div className="text-xs text-slate-500">
                          {typeof window !== "undefined" ? window.location.origin : "https://..."}/{dialog.career.clubId}
                        </div>
                      )}
                    </div>
                  )}
                  <p>
                    確認のため、<strong>記録名</strong>を入力してください。
                  </p>
                </div>
              </DialogDescription>
            </DialogHeader>
            <Input
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              placeholder={dialog?.career.name}
              disabled={actioning}
              className="mt-2"
            />
            <DialogFooter className="mt-4 gap-2">
              <Button variant="outline" onClick={closeDialog} disabled={actioning}>
                キャンセル
              </Button>
              <Button
                onClick={() => void handleConfirm()}
                disabled={actioning}
                className={
                  dialog?.mode === "delete"
                    ? "bg-red-600 text-white hover:bg-red-700"
                    : "bg-emerald-600 text-white hover:bg-emerald-700"
                }
              >
                {actioning
                  ? dialog?.mode === "delete"
                    ? "削除中..."
                    : "復元中..."
                  : dialog?.mode === "delete"
                  ? "削除する"
                  : "復元する"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
