"use client";

import { useEffect, useMemo, useState, Fragment } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useCareer } from "@/contexts/CareerContext";
import { useClub } from "@/contexts/ClubContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { toast } from "sonner";
import { auth } from "@/lib/firebase";
import { CareerCopySection, type CopySummary } from "@/components/career-copy-section";
import { type CopyOptions } from "@/lib/career-copy";
import { normalizeSlug, validateSlug } from "@/lib/slug";
import { toDashSeason, generateSeasonOptions } from "@/lib/season";
import { MAX_CAREERS } from "@/lib/career-constants";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Step = "basic" | "copy" | "confirm" | "success";

interface CopyResultPayload {
  copied: {
    players: number;
    skippedPlayers: number;
    skippedPlayerDetails: { playerId: string; reason: string }[];
    teams: number;
    opponents: number;
    settings: boolean;
  };
}

export default function NewCareerPage() {
  const { user } = useAuth();
  const { activeCareer, careers, loading: careersLoading, refreshCareers } = useCareer();
  const { fetchClubInfo } = useClub();
  const router = useRouter();

  const [step, setStep] = useState<Step>("basic");

  const [recordName, setRecordName] = useState("");
  const [clubName, setClubName] = useState("");
  const [clubId, setClubId] = useState("");
  const [clubIdTouched, setClubIdTouched] = useState(false);
  const [clubIdError, setClubIdError] = useState("");

  const [startSeason, setStartSeason] = useState("");
  const [startSeasonTouched, setStartSeasonTouched] = useState(false);

  const [selectedSourceId, setSelectedSourceId] = useState<string>("");
  const [copyPayload, setCopyPayload] = useState<CopyOptions | null>(null);
  const [copySummary, setCopySummary] = useState<CopySummary | null>(null);
  const [copyReady, setCopyReady] = useState(true);

  const [createdSlug, setCreatedSlug] = useState<string | null>(null);
  const [createdCareerId, setCreatedCareerId] = useState<string | null>(null);
  const [copyResult, setCopyResult] = useState<CopyResultPayload | null>(null);
  const [loading, setLoading] = useState(false);

  const publicBaseUrl = "https://footchron.com";

  useEffect(() => {
    void refreshCareers();
  }, [refreshCareers]);

  const eligibleSources = useMemo(
    () => (careers || []).filter((c) => c.status !== "creating"),
    [careers]
  );

  useEffect(() => {
    if (!careersLoading && eligibleSources.length > 0 && !selectedSourceId) {
      const preferred = activeCareer?.id
        ? eligibleSources.find((c) => c.id === activeCareer.id)
        : undefined;
      setSelectedSourceId(preferred?.id ?? eligibleSources[0].id);
    }
  }, [careersLoading, eligibleSources, activeCareer, selectedSourceId]);

  const forbiddenIds = useMemo(
    () => [user?.uid, ...(careers || []).map((c) => c.clubUid)].filter(Boolean) as string[],
    [user?.uid, careers]
  );

  useEffect(() => {
    if (!clubIdTouched) return;
    const result = validateSlug(clubId, { forbiddenValues: forbiddenIds });
    setClubIdError(result.ok ? "" : result.message || "");
  }, [clubId, clubIdTouched, forbiddenIds]);

  const selectedSourceCareer = useMemo(
    () => eligibleSources.find((c) => c.id === selectedSourceId) || null,
    [eligibleSources, selectedSourceId]
  );

  const normalizedSlug = useMemo(() => normalizeSlug(clubId), [clubId]);
  const publicUrlPreview = `${publicBaseUrl}/${normalizedSlug}`;

  const seasonOptions = useMemo(() => generateSeasonOptions(), []);
  const startSeasonId = useMemo(() => toDashSeason(startSeason.trim()), [startSeason]);
  const startSeasonValid = startSeason.trim().length > 0 && !startSeasonId.includes("/") && startSeasonId !== "." && startSeasonId !== "..";

  const reachedLimit = (careers || []).length >= MAX_CAREERS;

  const basicValid =
    !!recordName.trim() &&
    !!clubName.trim() &&
    !!clubId.trim() &&
    !!startSeason.trim() &&
    !clubIdError &&
    validateSlug(clubId, { forbiddenValues: forbiddenIds }).ok &&
    startSeasonValid;

  const copyStepReady = !selectedSourceCareer || copyReady;

  const canGoToCopy = basicValid;
  const canGoToConfirm = copyStepReady;

  const handleNext = () => {
    if (step === "basic") {
      setClubIdTouched(true);
      setStartSeasonTouched(true);
      if (!basicValid) {
        if (!recordName.trim()) toast.error("記録名を入力してください");
        else if (!clubName.trim()) toast.error("クラブ名を入力してください");
        else if (!clubId.trim()) toast.error("公開URLを入力してください");
        else if (clubIdError) toast.error(clubIdError);
        else if (!startSeason.trim()) toast.error("開始シーズンを入力してください");
        else if (!startSeasonValid) toast.error("開始シーズンの形式が正しくありません");
        return;
      }
      setStep("copy");
      return;
    }
    if (step === "copy") {
      if (!copyStepReady) {
        toast.error("引き継ぎ設定を確認してください");
        return;
      }
      setStep("confirm");
    }
  };

  const handleBack = () => {
    if (step === "copy") setStep("basic");
    if (step === "confirm") setStep("copy");
  };

  const handleCreate = async () => {
    if (!user?.uid) return;
    const slugValidation = validateSlug(clubId, { forbiddenValues: forbiddenIds });
    if (!slugValidation.ok) {
      toast.error(slugValidation.message || "公開URLが正しくありません");
      return;
    }
    if (!basicValid) {
      toast.error("基本情報を確認してください");
      return;
    }

    setLoading(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch("/api/careers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          recordName: recordName.trim(),
          clubName: clubName.trim(),
          clubId: clubId.trim(),
          startSeason: startSeason.trim(),
          copyOptions: copyPayload,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; clubId?: string; careerId?: string; message?: string; copyResult?: CopyResultPayload | null };
      if (!res.ok) {
        toast.error(json.message || "作成に失敗しました");
        setLoading(false);
        return;
      }
      setCreatedSlug(json.clubId ?? normalizedSlug);
      setCreatedCareerId(json.careerId ?? null);
      setCopyResult(json.copyResult ?? null);
      setStep("success");
      const skipped = json.copyResult?.copied?.skippedPlayers ?? 0;
      if (skipped > 0) {
        toast.warning(`記録を作成しました（選手${skipped}人は引き継げませんでした）`);
      } else {
        toast.success("記録を作成しました");
      }
      await refreshCareers();
      await fetchClubInfo();
    } catch (e: any) {
      toast.error(e?.message || "作成中にエラーが発生しました");
    } finally {
      setLoading(false);
    }
  };

  const renderStepIndicator = () => {
    const steps = [
      { key: "basic", label: "基本情報" },
      { key: "copy", label: "引き継ぎ" },
      { key: "confirm", label: "確認" },
    ];
    return (
      <div className="mb-6 flex items-start">
        {steps.map((s, index) => {
          const isActive = step === (s.key as Step) || (step === "success" && s.key === "confirm");
          const isCompleted =
            (step === "copy" && s.key === "basic") ||
            (step === "confirm" && (s.key === "basic" || s.key === "copy")) ||
            (step === "success" && s.key !== "confirm");
          const reached = isActive || isCompleted;
          return (
            <Fragment key={s.key}>
              <div className="flex flex-1 flex-col items-center">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${
                    reached ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-500"
                  }`}
                >
                  {isCompleted ? <Check className="h-4 w-4" /> : index + 1}
                </div>
                <span
                  className={`mt-2 whitespace-nowrap text-xs font-bold sm:text-sm ${
                    reached ? "text-emerald-600" : "text-slate-500"
                  }`}
                >
                  {s.label}
                </span>
              </div>
              {index < 2 && <div className="mx-2 mt-4 h-px flex-1 min-w-8 bg-slate-200" />}
            </Fragment>
          );
        })}
      </div>
    );
  };

  if (reachedLimit && step === "basic") {
    return (
      <div className="min-h-screen bg-[#F3F4F7] p-4 pt-10">
        <div className="mx-auto max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="mb-2 text-lg font-bold text-slate-900">新しい記録を作成</h1>
          <p className="text-sm text-slate-600">
            記録数の上限（{MAX_CAREERS}件）に達しています。新しい記録を作成するには、既存の記録を整理するか切り替えてからお試しください。
          </p>
          <Button className="mt-6 w-full" onClick={() => router.push("/admin/careers")}>
            記録一覧へ
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F3F4F7] px-4 py-6">
      <div className="mx-auto w-full max-w-lg">
        <h1 className="mb-5 text-xl font-bold text-slate-900">新しい記録を作成</h1>

        {renderStepIndicator()}

        {step === "basic" && (
          <div className="space-y-5 rounded-lg border border-slate-200 bg-white p-5">
            <div>
              <Label htmlFor="recordName" className="flex items-center gap-2 text-sm font-bold text-slate-900">
                記録名
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">必須</span>
              </Label>
              <Input
                id="recordName"
                value={recordName}
                onChange={(e) => setRecordName(e.target.value)}
                placeholder="例：2027年度、新チーム"
                className="mt-2 !h-12 !bg-white !text-base !text-slate-900 !placeholder:text-slate-500 focus-visible:border-emerald-500 focus-visible:ring-emerald-500"
              />
            </div>

            <div>
              <Label htmlFor="clubName" className="flex items-center gap-2 text-sm font-bold text-slate-900">
                クラブ名
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">必須</span>
              </Label>
              <Input
                id="clubName"
                value={clubName}
                onChange={(e) => setClubName(e.target.value)}
                placeholder="例：Nottingham Forest"
                className="mt-2 !h-12 !bg-white !text-base !text-slate-900 !placeholder:text-slate-500 focus-visible:border-emerald-500 focus-visible:ring-emerald-500"
              />
            </div>

            <div>
              <Label htmlFor="startSeason" className="flex items-center gap-2 text-sm font-bold text-slate-900">
                開始シーズン
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">必須</span>
              </Label>
              <Select
                value={startSeason}
                onValueChange={(v) => {
                  setStartSeason(v);
                  setStartSeasonTouched(true);
                }}
              >
                <SelectTrigger
                  id="startSeason"
                  className="mt-2 !h-12 !w-full !bg-white !text-base !text-slate-900 data-[placeholder]:!text-slate-500"
                >
                  <SelectValue placeholder="開始シーズンを選択" />
                </SelectTrigger>
                <SelectContent>
                  {seasonOptions.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {startSeasonTouched && !startSeasonValid && (
                <p className="mt-1.5 text-xs text-red-600">開始シーズンを選択してください</p>
              )}
            </div>

            <div>
              <Label htmlFor="clubId" className="flex items-center gap-2 text-sm font-bold text-slate-900">
                公開URL
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">必須</span>
              </Label>
              <p className="mt-2 block text-sm text-slate-500 sm:hidden">{publicBaseUrl}/</p>
              <div className="mt-1 flex flex-col items-stretch overflow-hidden rounded-md border border-slate-300 bg-white focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500 sm:flex-row">
                <span className="hidden items-center bg-slate-100 px-3 text-sm text-slate-600 sm:flex">
                  {publicBaseUrl}/
                </span>
                <Input
                  id="clubId"
                  value={clubId}
                  onChange={(e) => {
                    setClubId(e.target.value);
                    setClubIdTouched(true);
                  }}
                  onBlur={() => setClubIdTouched(true)}
                  placeholder="nffc-2027"
                  className="h-12 flex-1 !rounded-none !border-0 !bg-white !text-base !text-slate-900 !placeholder:text-slate-400 focus-visible:!ring-0"
                />
              </div>
              <p className="mt-1.5 text-xs text-slate-500">
                半角英数字・ハイフン・アンダースコアが使えます
              </p>
              {clubIdTouched && clubIdError && <p className="mt-1.5 text-xs text-red-600">{clubIdError}</p>}
            </div>

            <Button
              onClick={handleNext}
              disabled={!canGoToCopy}
              className="h-12 w-full bg-emerald-600 text-base font-bold hover:bg-emerald-700 disabled:bg-slate-300"
            >
              引き継ぎ設定へ
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </div>
        )}

        {step === "copy" && (
          <div className="space-y-4">
            {eligibleSources.length === 0 ? (
              <div className="rounded-lg border border-slate-200 bg-white p-5">
                <p className="text-sm font-bold text-slate-900">引き継ぎ元がありません</p>
                <p className="mt-1 text-sm text-slate-500">
                  作成済みの記録がないため、基本情報のみで新しい記録を作成します。
                </p>
              </div>
            ) : (
              <div className="rounded-lg border border-slate-200 bg-white p-5">
                <Label htmlFor="source-career" className="text-sm font-bold text-slate-900">
                  引き継ぎ元の記録
                </Label>
                <Select value={selectedSourceId} onValueChange={setSelectedSourceId}>
                  <SelectTrigger id="source-career" className="mt-2 !h-12 !w-full !bg-white !text-base !text-slate-900 data-[placeholder]:!text-slate-500">
                    <SelectValue placeholder="記録を選択" />
                  </SelectTrigger>
                  <SelectContent>
                    {eligibleSources.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}（{c.clubName}）
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedSourceCareer && (
                  <CareerCopySection
                    key={selectedSourceCareer.id}
                    sourceCareer={selectedSourceCareer}
                    onChange={setCopyPayload}
                    onReadyChange={setCopyReady}
                    onSummaryChange={setCopySummary}
                  />
                )}
              </div>
            )}

            <div className="flex justify-between gap-3">
              <Button variant="outline" onClick={handleBack} className="h-12 px-6">
                <ArrowLeft className="mr-1 h-4 w-4" />
                戻る
              </Button>
              <Button
                onClick={handleNext}
                disabled={!canGoToConfirm}
                className="h-12 bg-emerald-600 px-6 font-bold hover:bg-emerald-700 disabled:bg-slate-300"
              >
                次へ
                <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {step === "confirm" && (
          <div className="space-y-4">
            <div className="rounded-lg border border-slate-200 bg-white p-5">
              <h2 className="mb-4 text-base font-bold text-slate-900">作成内容の確認</h2>

              <div className="space-y-4">
                <div>
                  <p className="text-xs font-medium text-slate-500">記録名</p>
                  <p className="break-all font-medium text-slate-900">{recordName}</p>
                </div>

                <div>
                  <p className="text-xs font-medium text-slate-500">クラブ名</p>
                  <p className="break-all font-medium text-slate-900">{clubName}</p>
                </div>

                <div>
                  <p className="text-xs font-medium text-slate-500">公開URL</p>
                  <p className="break-all font-medium text-slate-900">{publicUrlPreview}</p>
                </div>

                <div>
                  <p className="text-xs font-medium text-slate-500">開始シーズン</p>
                  <p className="break-all font-medium text-slate-900">{startSeason}</p>
                </div>

                <div>
                  <p className="text-xs font-medium text-slate-500">引き継ぎ元</p>
                  {selectedSourceCareer && copySummary ? (
                    <ul className="mt-1 space-y-1.5 text-sm text-slate-700">
                      <li>{copySummary.sourceName}（{copySummary.sourceClubName}）</li>
                      {copySummary.copyTeams && <li>チーム・対戦クラブ：{copySummary.teamCount}件 / {copySummary.opponentCount}件</li>}
                      {copySummary.copySettings && <li>エンブレム・カラー・表示設定</li>}
                      {copySummary.copyPlayers && (
                        <li>
                          選手の引き継ぎ元シーズン：{copySummary.playerSeasonName || copySummary.playerSeasonId}（{copySummary.playerCount}人）
                        </li>
                      )}
                      {!copySummary.copyTeams && !copySummary.copySettings && !copySummary.copyPlayers && (
                        <li>引き継ぎなし（基本情報のみ）</li>
                      )}
                    </ul>
                  ) : (
                    <p className="text-sm text-slate-500">引き継ぎなし（基本情報のみ）</p>
                  )}
                </div>

                {copySummary?.overLimit && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                    {copySummary.limitReason}
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-between gap-3">
              <Button variant="outline" onClick={handleBack} className="h-12 px-6">
                <ArrowLeft className="mr-1 h-4 w-4" />
                戻る
              </Button>
              <Button
                onClick={handleCreate}
                disabled={loading}
                className="h-12 bg-emerald-600 px-6 font-bold hover:bg-emerald-700 disabled:bg-slate-300"
              >
                {loading ? "作成中..." : "記録を作成"}
                <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {step === "success" && (
          <div className="rounded-lg border border-slate-200 bg-white p-6 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
              <Check className="h-6 w-6" />
            </div>
            <h2 className="mt-4 text-lg font-bold text-slate-900">
              {recordName} を作成しました
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              切り替えて管理を始めましょう
            </p>
            <p className="mt-3 break-all text-sm text-slate-500">
              {publicBaseUrl}/{createdSlug || normalizedSlug}
            </p>
            {copyResult?.copied && (
              <div className="mt-4 space-y-2 text-left">
                {copyResult.copied.players > 0 && (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
                    選手 {copyResult.copied.players}人を引き継ぎました
                  </div>
                )}
                {copyPayload?.copyPlayers && copyResult.copied.players === 0 && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                    <p className="font-bold">選手が1人も引き継がれませんでした</p>
                    <p className="mt-1">
                      引き継ぎ対象を選択していましたが、コピーされた選手は0人です。管理画面の選手一覧を確認してください。
                    </p>
                  </div>
                )}
                {copyResult.copied.skippedPlayers > 0 && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                    <p className="font-bold">
                      {copyResult.copied.skippedPlayers}人は引き継げませんでした
                    </p>
                    <ul className="mt-1 list-disc space-y-0.5 pl-4">
                      {[...new Set(copyResult.copied.skippedPlayerDetails.map((s) => s.reason))].map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
              <Button
                onClick={() => router.push("/admin/careers")}
                className="h-12 bg-emerald-600 font-bold hover:bg-emerald-700"
              >
                管理を始める
              </Button>
              {createdSlug && (
                <Button
                  variant="outline"
                  onClick={() => router.push(`/${createdSlug}`)}
                  className="h-12"
                >
                  公開ページを見る
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
