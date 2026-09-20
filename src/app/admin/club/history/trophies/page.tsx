"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import {
  collection,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { useCareer } from "@/contexts/CareerContext";
import { trackEvent } from "@/lib/analytics";
import { toSlashSeason } from "@/lib/season";
import {
  TrophyTitle,
  toTrophyTitle,
  normalizeTitleName,
  sortSeasonsAsc,
  trophyImageSrc,
  TROPHY_IMAGE_PRESETS,
  TROPHY_ROOM_BG,
  TROPHY_TITLE_MAX_LENGTH,
} from "@/lib/trophies";
import {
  fetchLegacyClubTitles,
  migrateLegacyClubTitles,
  TrophyMigrationResult,
} from "@/lib/trophy-migration";
import { Trophy, Plus, MoreVertical, Pencil, ImageIcon, CalendarPlus, CalendarX, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type DialogMode =
  | { kind: "create" }
  | { kind: "edit"; trophy: TrophyTitle }
  | { kind: "addSeason"; trophy: TrophyTitle }
  | { kind: "removeSeason"; trophy: TrophyTitle }
  | null;

export default function TrophyRoomAdminPage() {
  const { user } = useAuth();
  const { activeCareer } = useCareer();
  const clubUid = activeCareer?.clubUid ?? null;
  const careerId = activeCareer?.id ?? null;
  const ownerUid = activeCareer?.ownerId ?? null;
  const clubProfileId = clubUid;
  const isOwner = Boolean(user && ownerUid && user.uid === ownerUid);

  const [trophies, setTrophies] = useState<TrophyTitle[]>([]);
  const [legacyCount, setLegacyCount] = useState(0);
  const [migrationResult, setMigrationResult] = useState<TrophyMigrationResult | null>(null);
  const [migrating, setMigrating] = useState(false);
  const [seasonOptions, setSeasonOptions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogMode>(null);
  const [deleteTarget, setDeleteTarget] = useState<TrophyTitle | null>(null);

  const [formName, setFormName] = useState("");
  const [formSeason, setFormSeason] = useState("");
  const [formImageKey, setFormImageKey] = useState(TROPHY_IMAGE_PRESETS[0].key);
  const [formError, setFormError] = useState<string | null>(null);

  const analyticsBase = useMemo(
    () => ({ careerId, clubUid, clubProfileId, source: "admin_trophy_room" }),
    [careerId, clubUid, clubProfileId]
  );

  const totalWins = useMemo(
    () => trophies.reduce((n, t) => n + t.winningSeasons.length, 0),
    [trophies]
  );
  const latestSeason = useMemo(() => {
    const all = trophies.flatMap((t) => t.winningSeasons);
    return all.length > 0 ? sortSeasonsAsc(all)[all.length - 1] : null;
  }, [trophies]);

  const load = useCallback(async () => {
    if (!clubUid || !careerId) return;
    setLoading(true);
    setError(null);
    try {
      const [trophySnap, seasonSnap, legacy] = await Promise.all([
        getDocs(collection(db, `clubs/${clubUid}/trophies`)),
        getDocs(collection(db, `clubs/${clubUid}/seasons`)),
        fetchLegacyClubTitles(clubUid).catch(() => [] as Awaited<ReturnType<typeof fetchLegacyClubTitles>>),
      ]);
      const trophyList = trophySnap.docs
        .map((d) => toTrophyTitle(d.id, d.data() as Record<string, unknown>))
        .filter((t) => t.careerId === careerId);
      setTrophies(trophyList);
      // legacy pendiente: título legacy cuyo nombre no existe en trophies
      // o al que le falta alguna season → todavía migrable.
      const trophyByName = new Map(trophyList.map((t) => [t.normalizedTitleName, t]));
      setLegacyCount(
        legacy.filter((item) => {
          const normalized = normalizeTitleName(item.competitionName);
          if (!normalized || item.seasons.length === 0) return false;
          const t = trophyByName.get(normalized);
          if (!t) return true;
          return item.seasons.some((s) => !t.winningSeasons.includes(s));
        }).length
      );
      setSeasonOptions(
        seasonSnap.docs
          .map((d) => toSlashSeason(d.id))
          .filter((s) => s.trim().length > 0)
      );
    } catch (e) {
      console.error("[TrophyRoom] load failed", e);
      setError("タイトルの取得に失敗しました。時間をおいて再度お試しください。");
    } finally {
      setLoading(false);
    }
  }, [clubUid, careerId]);

  useEffect(() => {
    setTrophies([]);
    setLegacyCount(0);
    setMigrationResult(null);
    setSeasonOptions([]);
    if (!clubUid || !careerId) {
      setLoading(false);
      return;
    }
    void load();
  }, [clubUid, careerId, load]);

  useEffect(() => {
    if (!loading && user && careerId) {
      void trackEvent("trophy_room_view", user.uid, analyticsBase);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user, careerId]);

  const openCreate = () => {
    setFormName("");
    setFormSeason("");
    setFormImageKey(TROPHY_IMAGE_PRESETS[0].key);
    setFormError(null);
    setDialog({ kind: "create" });
  };

  const openEdit = (t: TrophyTitle) => {
    setFormName(t.titleName);
    setFormImageKey(TROPHY_IMAGE_PRESETS.some((p) => p.key === t.trophyImageKey) ? t.trophyImageKey : TROPHY_IMAGE_PRESETS[0].key);
    setFormError(null);
    setDialog({ kind: "edit", trophy: t });
  };

  const openAddSeason = (t: TrophyTitle) => {
    setFormSeason("");
    setFormError(null);
    setDialog({ kind: "addSeason", trophy: t });
  };

  const openRemoveSeason = (t: TrophyTitle) => {
    setFormSeason("");
    setFormError(null);
    setDialog({ kind: "removeSeason", trophy: t });
  };

  const guardWrite = () => {
    if (!isOwner) {
      setFormError("このクラブの編集権限がありません。");
      return false;
    }
    if (!clubUid || !careerId) {
      setFormError("Careerが選択されていません。");
      return false;
    }
    return true;
  };

  const handleCreate = async () => {
    if (!guardWrite() || saving) return;
    const name = formName.trim();
    const season = toSlashSeason(formSeason.trim());
    if (!name) return setFormError("タイトル名を入力してください。");
    if (name.length > TROPHY_TITLE_MAX_LENGTH) return setFormError(`タイトル名は${TROPHY_TITLE_MAX_LENGTH}文字以内で入力してください。`);
    if (!season) return setFormError("獲得シーズンを入力してください。");
    const normalized = normalizeTitleName(name);
    if (trophies.some((t) => t.normalizedTitleName === normalized)) {
      return setFormError("同名のタイトルが既に存在します。既存タイトルの「獲得シーズンを追加」から登録してください。");
    }
    setSaving(true);
    setFormError(null);
    try {
      const ref = doc(collection(db, `clubs/${clubUid}/trophies`));
      await setDoc(ref, {
        ownerUid: ownerUid,
        clubUid,
        clubProfileId,
        careerId,
        titleName: name,
        normalizedTitleName: normalized,
        trophyImageKey: formImageKey,
        winningSeasons: [season],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      void trackEvent("trophy_title_create", user!.uid, { ...analyticsBase, trophyTitleId: ref.id });
      setDialog(null);
      await load();
    } catch (e) {
      console.error("[TrophyRoom] create failed", e);
      setFormError("タイトルの作成に失敗しました。");
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async (t: TrophyTitle) => {
    if (!guardWrite() || saving) return;
    const name = formName.trim();
    if (!name) return setFormError("タイトル名を入力してください。");
    if (name.length > TROPHY_TITLE_MAX_LENGTH) return setFormError(`タイトル名は${TROPHY_TITLE_MAX_LENGTH}文字以内で入力してください。`);
    const normalized = normalizeTitleName(name);
    if (trophies.some((x) => x.id !== t.id && x.normalizedTitleName === normalized)) {
      return setFormError("同名のタイトルが既に存在します。");
    }
    setSaving(true);
    setFormError(null);
    try {
      await updateDoc(doc(db, `clubs/${clubUid}/trophies`, t.id), {
        titleName: name,
        normalizedTitleName: normalized,
        trophyImageKey: formImageKey,
        updatedAt: serverTimestamp(),
      });
      void trackEvent("trophy_title_edit", user!.uid, { ...analyticsBase, trophyTitleId: t.id });
      setDialog(null);
      await load();
    } catch (e) {
      console.error("[TrophyRoom] edit failed", e);
      setFormError("タイトルの更新に失敗しました。");
    } finally {
      setSaving(false);
    }
  };

  const handleAddSeason = async (t: TrophyTitle) => {
    if (!guardWrite() || saving) return;
    const season = toSlashSeason(formSeason.trim());
    if (!season) return setFormError("獲得シーズンを入力してください。");
    if (t.winningSeasons.includes(season)) {
      return setFormError("このシーズンは既に登録されています。");
    }
    setSaving(true);
    setFormError(null);
    try {
      await updateDoc(doc(db, `clubs/${clubUid}/trophies`, t.id), {
        winningSeasons: arrayUnion(season),
        updatedAt: serverTimestamp(),
      });
      void trackEvent("trophy_season_add", user!.uid, { ...analyticsBase, trophyTitleId: t.id });
      setDialog(null);
      await load();
    } catch (e) {
      console.error("[TrophyRoom] add season failed", e);
      setFormError("シーズンの追加に失敗しました。");
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveSeason = async (t: TrophyTitle, season: string) => {
    if (!guardWrite() || saving) return;
    if (t.winningSeasons.length <= 1) {
      setDialog(null);
      setDeleteTarget(t);
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await updateDoc(doc(db, `clubs/${clubUid}/trophies`, t.id), {
        winningSeasons: arrayRemove(season),
        updatedAt: serverTimestamp(),
      });
      setDialog(null);
      await load();
    } catch (e) {
      console.error("[TrophyRoom] remove season failed", e);
      setFormError("シーズンの削除に失敗しました。");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTitle = async () => {
    const t = deleteTarget;
    if (!t || !guardWrite() || saving) return;
    setSaving(true);
    try {
      await deleteDoc(doc(db, `clubs/${clubUid}/trophies`, t.id));
      void trackEvent("trophy_title_delete", user!.uid, { ...analyticsBase, trophyTitleId: t.id });
      setDeleteTarget(null);
      await load();
    } catch (e) {
      console.error("[TrophyRoom] delete failed", e);
      setError("タイトルの削除に失敗しました。");
    } finally {
      setSaving(false);
    }
  };

  const handleMigrate = async () => {
    if (!isOwner || !clubUid || !careerId || !ownerUid || migrating) return;
    setMigrating(true);
    setError(null);
    try {
      const result = await migrateLegacyClubTitles({
        clubUid,
        careerId,
        ownerUid,
        clubProfileId: clubProfileId ?? undefined,
      });
      setMigrationResult(result);
      void trackEvent("trophy_legacy_migrate", user!.uid, analyticsBase);
      await load();
    } catch (e) {
      console.error("[TrophyRoom] migration failed", e);
      setError("既存タイトルの移行に失敗しました。時間をおいて再度お試しください。");
    } finally {
      setMigrating(false);
    }
  };

  const migrationCard = legacyCount > 0 ? (
    <div className="w-full max-w-md rounded-lg border border-amber-400/30 bg-amber-400/10 p-4">
      <p className="text-xs font-black text-amber-200">
        以前の形式で登録されたタイトル {legacyCount} 件を検出しました。
      </p>
      <p className="mt-1 text-[11px] font-bold leading-4 text-amber-200/70">
        トロフィールームへ移行すると、公開ページの表示が新しい形式に切り替わります。既存データは削除されません。
      </p>
      <Button onClick={handleMigrate} disabled={!isOwner || migrating} className="mt-3 w-full gap-1.5" variant="secondary">
        {migrating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trophy className="h-4 w-4" />}
        既存タイトルを移行する
      </Button>
    </div>
  ) : null;

  const dialogTitle = dialog?.kind === "create" ? "新しいタイトルを作成"
    : dialog?.kind === "edit" ? "タイトルを編集"
    : dialog?.kind === "addSeason" ? "獲得シーズンを追加"
    : dialog?.kind === "removeSeason" ? "獲得シーズンを削除" : "";

  return (
    <div className="relative min-h-screen bg-[#050a12] pb-6 text-white">
      <header className="relative -mx-4 -mt-4 overflow-hidden sm:-mx-6 sm:-mt-6 md:-mx-8 md:-mt-8">
        <Image src={TROPHY_ROOM_BG} alt="" fill priority className="object-cover object-center md:scale-125 md:origin-right md:object-contain md:object-right" sizes="100vw" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-[#0a1226]/70 to-black/45" />
        <div className="relative mx-auto flex max-w-5xl flex-col gap-4 px-4 py-6 sm:px-6 md:min-h-[360px] md:justify-center md:px-8">
          <div className="min-w-0">
            <Trophy className="h-6 w-6 shrink-0 text-yellow-400 sm:h-7 sm:w-7" strokeWidth={2.4} />
            <h1 className="mt-2 whitespace-nowrap text-2xl font-black leading-none tracking-[-0.04em] text-slate-100 sm:text-4xl">
              TROPHY <span className="text-yellow-400">ROOM</span>
            </h1>
            <p className="mt-1.5 text-xs font-bold text-slate-300 sm:text-sm">トロフィールーム</p>
            <p className="mt-2 text-xs font-bold text-white/70 sm:text-sm">クラブが獲得した栄光の記録</p>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-bold text-white/75">
              <span><span className="font-mono text-base font-black text-yellow-300">{trophies.length > 0 ? trophies.length : "—"}</span> タイトル</span>
              <span><span className="font-mono text-base font-black text-yellow-300">{trophies.length > 0 ? totalWins : "—"}</span> 回優勝</span>
              <span>最新 <span className="font-mono text-base font-black text-yellow-300">{latestSeason ?? "—"}</span></span>
            </div>
          </div>
          {trophies.length > 0 && (
            <button
              onClick={openCreate}
              disabled={!isOwner || saving}
              className="inline-flex h-11 items-center justify-center gap-1.5 self-start rounded-lg border border-yellow-400/70 bg-yellow-400/10 px-4 text-sm font-black text-yellow-300 transition hover:bg-yellow-400/20 disabled:opacity-50"
            >
              <Plus className="h-4 w-4" /> 新しいタイトル
            </button>
          )}
        </div>
      </header>
      <div className="mx-auto max-w-5xl">

        {!isOwner && user ? (
          <p className="mt-4 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs font-bold text-amber-300">
            このクラブの編集権限がないため、閲覧のみ可能です。
          </p>
        ) : null}
        {error && (
          <p className="mt-4 rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-xs font-bold text-red-300">{error}</p>
        )}
        {migrationResult && (
          <p className="mt-4 rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-xs font-bold text-emerald-300">
            移行完了: {migrationResult.legacyCount}件検出 → {migrationResult.created}件作成
            {migrationResult.seasonsMerged > 0 ? `・既存タイトルに${migrationResult.seasonsMerged}シーズン統合` : ""}
            {migrationResult.skippedEmpty > 0 ? `・${migrationResult.skippedEmpty}件スキップ（名前またはシーズン未設定）` : ""}
          </p>
        )}

        {loading ? (
          <div className="mt-16 flex items-center justify-center gap-2 text-sm font-bold text-white/60">
            <Loader2 className="h-4 w-4 animate-spin" /> 読み込み中…
          </div>
        ) : trophies.length === 0 ? (
          <div className="mt-12 flex flex-col items-center rounded-xl border border-white/10 bg-slate-950/60 px-6 py-14 text-center">
            <div className="relative h-28 w-28 overflow-hidden rounded-full border border-white/10">
              <Image src={TROPHY_ROOM_BG} alt="" fill className="object-cover object-right" sizes="112px" />
            </div>
            <p className="mt-5 text-sm font-black text-white">クラブが獲得したタイトルを記録しましょう。</p>
            <p className="mt-1 max-w-sm text-xs font-bold leading-5 text-white/60">
              優勝シーズンを追加すると、クラブの歴史として公開ページに表示されます。
            </p>
            {migrationCard ? <div className="mt-6">{migrationCard}</div> : null}
            <Button onClick={openCreate} disabled={!isOwner} className="mt-5 gap-1.5" variant={legacyCount > 0 ? "outline" : "default"}>
              <Plus className="h-4 w-4" /> 最初のタイトルを作成
            </Button>
          </div>
        ) : (
          <div>
            {migrationCard ? <div className="mt-6 flex justify-center sm:justify-start">{migrationCard}</div> : null}
            <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
            {trophies.map((t) => (
              <div key={t.id} className="rounded-xl border border-white/10 bg-gradient-to-b from-[#0c1526] to-[#070c16] p-3">
                <div className="flex gap-3">
                  <div
                    className="relative h-36 w-28 shrink-0 overflow-hidden rounded-lg border border-yellow-500/30 sm:h-44 sm:w-36"
                    style={{
                      background:
                        "radial-gradient(ellipse at 50% -15%, rgba(253, 224, 71, 0.32), rgba(250, 204, 21, 0.10) 45%, transparent 70%), radial-gradient(ellipse at 50% 120%, #14203a 0%, #050a12 70%)",
                    }}
                  >
                    <div className="pointer-events-none absolute bottom-1.5 left-1/2 h-4 w-4/5 -translate-x-1/2 rounded-[50%] bg-gradient-to-b from-slate-400/70 to-black/90 shadow-[0_3px_8px_rgba(0,0,0,0.9)]" />
                    <Image
                      src={trophyImageSrc(t.trophyImageKey)}
                      alt={t.titleName}
                      fill
                      className="object-contain p-2 pb-5 drop-shadow-[0_8px_10px_rgba(0,0,0,0.8)]"
                      sizes="(max-width: 640px) 112px, 144px"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-1">
                      <div className="min-w-0">
                        <h2 className="truncate text-sm font-black text-white">{t.titleName}</h2>
                        <p className="mt-0.5 text-[11px] font-bold text-yellow-400/90">{t.winningSeasons.length}回獲得</p>
                      </div>
                      {isOwner && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button className="-m-1.5 shrink-0 rounded-md p-3 text-white/60 transition hover:bg-white/10 hover:text-white" aria-label="メニュー">
                              <MoreVertical className="h-4 w-4" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="border-white/10 bg-slate-900 text-white">
                            <DropdownMenuItem onClick={() => openEdit(t)} className="gap-2">
                              <Pencil className="h-3.5 w-3.5" /> タイトル名・画像を編集
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openAddSeason(t)} className="gap-2">
                              <CalendarPlus className="h-3.5 w-3.5" /> 獲得シーズンを追加
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openRemoveSeason(t)} className="gap-2" disabled={t.winningSeasons.length === 0}>
                              <CalendarX className="h-3.5 w-3.5" /> 獲得シーズンを削除
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setDeleteTarget(t)} className="gap-2 text-red-400 focus:text-red-400">
                              <Trash2 className="h-3.5 w-3.5" /> タイトルを削除
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {sortSeasonsAsc(t.winningSeasons).map((s) => (
                        <span key={s} className="rounded-full border border-white/15 bg-white/5 px-2.5 py-0.5 font-mono text-[11px] font-black text-white/85">
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
            </div>
          </div>
        )}
      </div>

      <Dialog open={dialog !== null} onOpenChange={(open) => { if (!open && !saving) setDialog(null); }}>
        <DialogContent className="border-white/10 bg-slate-950 text-white">
          <DialogHeader>
            <DialogTitle>{dialogTitle}</DialogTitle>
          </DialogHeader>

          {(dialog?.kind === "create" || dialog?.kind === "edit") && (
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-bold text-white/70">タイトル名</label>
                <Input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  maxLength={TROPHY_TITLE_MAX_LENGTH}
                  placeholder="例：リーグ優勝"
                  className="border-white/15 bg-white/5 text-white"
                />
              </div>
              {dialog.kind === "create" && (
                <div>
                  <label className="mb-1.5 block text-xs font-bold text-white/70">獲得シーズン</label>
                  <Input
                    value={formSeason}
                    onChange={(e) => setFormSeason(e.target.value)}
                    placeholder="例：2026/27"
                    list="trophy-season-options"
                    className="border-white/15 bg-white/5 text-white"
                  />
                </div>
              )}
              <div>
                <label className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-white/70">
                  <ImageIcon className="h-3.5 w-3.5" /> トロフィー画像
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {TROPHY_IMAGE_PRESETS.map((p) => (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => setFormImageKey(p.key)}
                      className={`relative aspect-square overflow-hidden rounded-lg border-2 transition ${formImageKey === p.key ? "border-yellow-400 ring-2 ring-yellow-400/40" : "border-white/10 opacity-70 hover:opacity-100"}`}
                      style={{ background: "radial-gradient(ellipse at 50% -10%, rgba(250, 204, 21, 0.14), transparent 55%), radial-gradient(ellipse at 50% 120%, #101a30 0%, #050a12 70%)" }}
                      aria-label={p.label}
                      aria-pressed={formImageKey === p.key}
                    >
                      <Image src={p.src} alt={p.label} fill className="object-contain p-1.5" sizes="80px" />
                    </button>
                  ))}
                </div>
              </div>
              {formError && <p className="text-xs font-bold text-red-400">{formError}</p>}
              <Button
                onClick={() => (dialog.kind === "create" ? handleCreate() : handleEdit(dialog.trophy))}
                disabled={saving || !isOwner}
                className="w-full"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : dialog.kind === "create" ? "作成する" : "保存する"}
              </Button>
            </div>
          )}

          {dialog?.kind === "addSeason" && (
            <div className="space-y-4">
              <p className="text-xs font-bold text-white/60">{dialog.trophy.titleName} に獲得シーズンを追加します。</p>
              <Input
                value={formSeason}
                onChange={(e) => setFormSeason(e.target.value)}
                placeholder="例：2026/27"
                list="trophy-season-options"
                className="border-white/15 bg-white/5 text-white"
              />
              {formError && <p className="text-xs font-bold text-red-400">{formError}</p>}
              <Button onClick={() => handleAddSeason(dialog.trophy)} disabled={saving || !isOwner} className="w-full">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "追加する"}
              </Button>
            </div>
          )}

          {dialog?.kind === "removeSeason" && (
            <div className="space-y-3">
              <p className="text-xs font-bold text-white/60">削除するシーズンを選択してください。</p>
              <div className="flex flex-col gap-2">
                {sortSeasonsAsc(dialog.trophy.winningSeasons).map((s) => (
                  <button
                    key={s}
                    onClick={() => handleRemoveSeason(dialog.trophy, s)}
                    disabled={saving}
                    className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm font-bold text-white transition hover:border-red-400/40 hover:bg-red-400/10 disabled:opacity-50"
                  >
                    <span className="font-mono">{s}</span>
                    <Trash2 className="h-3.5 w-3.5 text-red-400" />
                  </button>
                ))}
              </div>
              {dialog.trophy.winningSeasons.length === 1 && (
                <p className="text-[11px] font-bold text-amber-300">最後のシーズンを削除すると、タイトル自体の削除に進みます。</p>
              )}
              {formError && <p className="text-xs font-bold text-red-400">{formError}</p>}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <datalist id="trophy-season-options">
        {seasonOptions.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>

      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open && !saving) setDeleteTarget(null); }}>
        <AlertDialogContent className="border-white/10 bg-slate-950 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>タイトルを削除しますか？</AlertDialogTitle>
            <AlertDialogDescription className="text-white/60">
              「{deleteTarget?.titleName}」と獲得シーズン {deleteTarget?.winningSeasons.length ?? 0} 件を削除します。この操作は取り消せません。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>キャンセル</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteTitle} disabled={saving} className="bg-red-600 hover:bg-red-700">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "削除する"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
