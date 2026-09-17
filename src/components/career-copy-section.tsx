"use client";

import * as React from "react";
import { Career } from "@/lib/career";
import { CopyableSourceData, CopyOptions } from "@/lib/career-copy";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Loader2, Lock, Users, Shield, Settings, Swords, AlertCircle } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { auth } from "@/lib/firebase";

export interface CopySummary {
  sourceCareerId: string;
  sourceName: string;
  sourceClubName: string;
  sourceClubId?: string | null;
  copyPlayers: boolean;
  playerSeasonId?: string;
  playerSeasonName?: string;
  playerCount: number;
  copyTeams: boolean;
  teamCount: number;
  opponentCount: number;
  copySettings: boolean;
  overLimit: boolean;
  limitReason?: string;
  planName: string;
}

interface CareerCopySectionProps {
  sourceCareer: Career;
  onChange: (payload: CopyOptions | null) => void;
  onReadyChange: (ready: boolean) => void;
  onSummaryChange?: (summary: CopySummary | null) => void;
}

const MAX_BATCH_WRITES = 500;

function planLabel(plan: { plan: string } | undefined): string {
  if (!plan) return "Free";
  if (plan.plan === "pro") return "Pro";
  if (plan.plan === "officia") return "Pro（認定）";
  return "Free";
}

function isPro(plan: { plan: string } | undefined): boolean {
  return plan?.plan === "pro" || plan?.plan === "officia";
}

export function CareerCopySection({
  sourceCareer,
  onChange,
  onReadyChange,
  onSummaryChange,
}: CareerCopySectionProps) {
  const [data, setData] = React.useState<CopyableSourceData | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [copyTeams, setCopyTeams] = React.useState(true);
  const [copySettings, setCopySettings] = React.useState(false);
  const [copyPlayers, setCopyPlayers] = React.useState(false);
  const [selectedSeasonId, setSelectedSeasonId] = React.useState<string>("");

  React.useEffect(() => {
    setError(null);
    setData(null);
    setLoading(true);
    setCopyPlayers(false);
    setSelectedSeasonId("");
    onReadyChange(false);
    onChange(null);
    onSummaryChange?.(null);

    const fetchData = async () => {
      try {
        const token = await auth.currentUser?.getIdToken();
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (token) headers.Authorization = `Bearer ${token}`;
        const res = await fetch(`/api/careers/copy?sourceCareerId=${encodeURIComponent(sourceCareer.id)}`, {
          credentials: "same-origin",
          headers,
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || "データ取得に失敗しました");
        const body = (await res.json()) as { ok: boolean; data: CopyableSourceData };
        setData(body.data);
        setLoading(false);
      } catch (e: any) {
        setError(e.message || "データ取得に失敗しました");
        setLoading(false);
      }
    };
    fetchData();
  }, [sourceCareer.id, onReadyChange, onChange, onSummaryChange]);

  React.useEffect(() => {
    if (data && data.seasons.length > 0 && !selectedSeasonId) {
      setSelectedSeasonId(data.seasons[0].id);
    }
  }, [data, selectedSeasonId]);

  const selectedSeason = data?.seasons?.find((s) => s.id === selectedSeasonId);
  const selectedPlayerCount =
    (data?.playerCountsBySeason?.find((c) => c.seasonId === selectedSeasonId)?.count ?? 0) +
    (data?.playerCountsBySeason?.find((c) => c.seasonId === "_all")?.count ?? 0);
  const canCopyPlayers = isPro(data?.plan);

  // 選手1人につき players + roster の2書き込み
  const batchTotal = 4 + (copyTeams ? (data?.opponentCount ?? 0) : 0) + (copyPlayers ? selectedPlayerCount * 2 : 0);
  const overLimit = data ? batchTotal > MAX_BATCH_WRITES : false;
  const limitReason = overLimit
    ? `コピー対象が多すぎるため、Firestore 書き込み上限（${MAX_BATCH_WRITES}件）を超えます。引き継ぎ項目を減らしてください。`
    : undefined;

  const payload: CopyOptions | null = React.useMemo(() => {
    if (!data) return null;
    const wantsPlayers = canCopyPlayers && copyPlayers && selectedSeasonId.trim().length > 0;
    const wantsTeams = copyTeams;
    const wantsSettings = copySettings;
    if (!wantsPlayers && !wantsTeams && !wantsSettings) return null;
    return {
      sourceCareerId: sourceCareer.id,
      copyPlayers: wantsPlayers,
      playerSourceSeasonId: wantsPlayers ? selectedSeasonId : undefined,
      copyTeams: wantsTeams,
      copySettings: wantsSettings,
    };
  }, [data, sourceCareer.id, canCopyPlayers, copyPlayers, selectedSeasonId, copyTeams, copySettings]);

  const summary: CopySummary | null = React.useMemo(() => {
    if (!data) return null;
    const wantsPlayers = canCopyPlayers && copyPlayers && selectedSeasonId.trim().length > 0;
    const wantsTeams = copyTeams;
    const wantsSettings = copySettings;
    if (!wantsPlayers && !wantsTeams && !wantsSettings && !overLimit) return null;
    return {
      sourceCareerId: sourceCareer.id,
      sourceName: data.sourceCareerName,
      sourceClubName: data.sourceClubName,
      sourceClubId: sourceCareer.clubId,
      copyPlayers: wantsPlayers,
      playerSeasonId: wantsPlayers ? selectedSeasonId : undefined,
      playerSeasonName: wantsPlayers ? selectedSeason?.name || selectedSeasonId : undefined,
      playerCount: wantsPlayers ? selectedPlayerCount : 0,
      copyTeams: wantsTeams,
      teamCount: wantsTeams ? data.teamCount : 0,
      opponentCount: wantsTeams ? data.opponentCount : 0,
      copySettings: wantsSettings,
      overLimit,
      limitReason,
      planName: planLabel(data.plan),
    };
  }, [data, sourceCareer, canCopyPlayers, copyPlayers, selectedSeasonId, selectedSeason, selectedPlayerCount, copyTeams, copySettings, overLimit, limitReason]);

  React.useEffect(() => {
    onChange(payload);
    onSummaryChange?.(summary);

    const ready =
      !!data &&
      !loading &&
      !error &&
      !overLimit &&
      (!copyPlayers || (canCopyPlayers && selectedSeasonId.trim().length > 0));

    onReadyChange(ready);
  }, [
    payload,
    summary,
    data,
    loading,
    error,
    overLimit,
    copyPlayers,
    canCopyPlayers,
    selectedSeasonId,
    onChange,
    onReadyChange,
    onSummaryChange,
  ]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 text-sm text-slate-500">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        引き継ぎ可能なデータを確認中
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        <AlertCircle className="mr-2 inline h-4 w-4" />
        {error}
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="break-words text-sm font-bold text-slate-900">{data.sourceCareerName}</p>
            <p className="mt-0.5 break-words text-xs text-slate-500">
              {data.sourceClubName}
              {sourceCareer.clubId ? ` · https://footchron.com/${sourceCareer.clubId}` : ""}
            </p>
          </div>
          <span
            className={`shrink-0 rounded px-2 py-0.5 text-xs font-bold ${
              isPro(data.plan) ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"
            }`}
          >
            {planLabel(data.plan)}
          </span>
        </div>
      </div>

      <div className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white p-4">
        <p className="pb-3 text-sm font-bold text-slate-900">引き継ぎ項目</p>

        <div className="flex items-start justify-between gap-4 py-4">
          <div className="min-w-0 flex-1">
            <Label htmlFor="copy-teams" className="flex flex-wrap items-center gap-2 text-sm font-bold text-slate-900">
              <Swords className="h-4 w-4 text-slate-500" />
              登録チーム・対戦クラブ
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
                Free/Pro共通
              </span>
            </Label>
            <p className="mt-1 text-xs text-slate-500">
              チーム {data.teamCount}件 / 対戦クラブ {data.opponentCount}件
            </p>
          </div>
          <Switch id="copy-teams" checked={copyTeams} onCheckedChange={setCopyTeams} className="shrink-0" />
        </div>

        <div className="flex items-start justify-between gap-4 py-4">
          <div className="min-w-0 flex-1">
            <Label htmlFor="copy-settings" className="flex flex-wrap items-center gap-2 text-sm font-bold text-slate-900">
              <Settings className="h-4 w-4 text-slate-500" />
              エンブレム・カラー・表示設定
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
                Free/Pro共通
              </span>
            </Label>
            <p className="mt-1 text-xs text-slate-500">エンブレム・カラー・SNS・フッターなど</p>
          </div>
          <Switch id="copy-settings" checked={copySettings} onCheckedChange={setCopySettings} className="shrink-0" />
        </div>

        <div className="py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <Label
                htmlFor="copy-players"
                className="flex flex-wrap items-center gap-2 text-sm font-bold text-slate-900"
              >
                <Users className="h-4 w-4 text-slate-500" />
                選手の基本情報
                <span
                  className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold ${
                    canCopyPlayers ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {canCopyPlayers ? "Pro対象" : "Pro限定"}
                </span>
              </Label>
              <p className="mt-1 text-xs text-slate-500">
                名前・背番号・ポジション・プロフィール等
              </p>
              {!canCopyPlayers && (
                <p className="mt-2 text-xs text-slate-500">
                  Freeプランでは選手の引き継ぎはできません
                </p>
              )}
            </div>
            <Switch
              id="copy-players"
              checked={canCopyPlayers && copyPlayers}
              onCheckedChange={setCopyPlayers}
              disabled={!canCopyPlayers}
              className="shrink-0"
            />
          </div>

          {canCopyPlayers && copyPlayers && (
            <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3">
              <Label htmlFor="player-season" className="mb-2 block text-xs font-bold text-slate-900">
                選手の引き継ぎ元シーズン
              </Label>
              <Select value={selectedSeasonId} onValueChange={setSelectedSeasonId}>
                <SelectTrigger id="player-season" className="!h-12 !w-full !bg-white !text-base !text-slate-900 data-[placeholder]:!text-slate-500">
                  <SelectValue placeholder="引き継ぎ元シーズンを選択" />
                </SelectTrigger>
                <SelectContent>
                  {data.seasons.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name || s.id}（
                      {data.playerCountsBySeason.find((c) => c.seasonId === s.id)?.count ?? 0}人）
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-2 text-xs text-slate-500">
                選択したシーズンの選手 {selectedPlayerCount}人を引き継ぎます
              </p>
            </div>
          )}
        </div>
      </div>

      {overLimit && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <AlertCircle className="mr-2 inline h-4 w-4" />
          {limitReason}
        </div>
      )}

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
        <p className="mb-2 text-xs font-bold text-slate-700">引き継がれないもの</p>
        <ul className="list-disc space-y-1 pl-4">
          <li>大会・試合日程・試合結果</li>
          <li>選手の成績・スタッツ・履歴</li>
          <li>元の公開URL</li>
        </ul>
      </div>
    </div>
  );
}
