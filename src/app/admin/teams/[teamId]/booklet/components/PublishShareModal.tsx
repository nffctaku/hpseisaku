"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, ExternalLink, Globe, Loader2, Lock, Share2, X } from "lucide-react";
import { auth } from "@/lib/firebase";
import { publicBookletCardLimit } from "@/lib/booklet-limits";
import type { BookletPlayer } from "../types";

type ShareState = {
  publicId: string;
  isPublished: boolean;
  showFormation: boolean;
  showIntroduction: boolean;
};

export type PublishPayload = {
  teamId: string;
  season: string;
  cardPlayerIds: string[];
  additionalPlayerIds: string[];
  showParameterGraph: boolean;
  positionColors: { GK: string; DF: string; MF: string; FW: string };
  formationName: string | null;
  starters: Record<string, string | null>;
  bioTitle: string;
  bioBody: string;
};

export function PublishShareModal({
  open,
  onClose,
  isPro,
  players,
  buildPayload,
}: {
  open: boolean;
  onClose: () => void;
  isPro: boolean;
  players: BookletPlayer[];
  buildPayload: () => Omit<PublishPayload, never>;
}) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [share, setShare] = useState<ShareState | null>(null);
  const [showFormation, setShowFormation] = useState(true);
  const [showIntroduction, setShowIntroduction] = useState(true);
  const [publishIds, setPublishIds] = useState<string[]>([]);
  // 親の再レンダーで選択中のピッカー状態が巻き戻らないよう、初期化はモーダルopenごと1回
  const publishInitRef = useRef(false);

  const cardLimit = publicBookletCardLimit(isPro ? "pro" : "free");

  // 保存時はロースター順で cardPlayerIds を生成（選択順=配列順を維持）
  const orderedPublishIds = useMemo(() => {
    const set = new Set(publishIds);
    return players.filter((p) => set.has(p.id)).map((p) => p.id);
  }, [players, publishIds]);

  const togglePublish = useCallback(
    (playerId: string) => {
      setPublishIds((prev) => {
        if (prev.includes(playerId)) return prev.filter((id) => id !== playerId);
        if (prev.length >= cardLimit) return prev; // プラン上限を超えて追加しない
        return [...prev, playerId];
      });
    },
    [cardLimit]
  );

  const fetchShare = useCallback(async () => {
    const payload = buildPayload();
    const token = await auth.currentUser?.getIdToken();
    if (!token) {
      setError("ログインが必要です。");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/booklet-share?teamId=${encodeURIComponent(payload.teamId)}&season=${encodeURIComponent(payload.season)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json?.message || "取得に失敗しました。");
        return;
      }
      const s = json?.share;
      if (s) {
        setShare({
          publicId: s.publicId,
          isPublished: s.isPublished,
          showFormation: s.showFormation,
          showIntroduction: s.showIntroduction,
        });
        setShowFormation(s.showFormation);
        setShowIntroduction(s.showIntroduction);
        if (!publishInitRef.current) {
          publishInitRef.current = true;
          const saved = Array.isArray(s.cardPlayerIds) ? s.cardPlayerIds : [];
          // 保存済み選択（存在する選手のみ）。なければ先頭から上限までを初期選択
          const validIds = new Set(players.map((p) => p.id));
          const restored = saved.filter(
            (id: unknown): id is string => typeof id === "string" && validIds.has(id)
          );
          setPublishIds(restored.length > 0 ? restored : players.slice(0, cardLimit).map((p) => p.id));
        }
      } else {
        setShare(null);
        if (!publishInitRef.current) {
          publishInitRef.current = true;
          setPublishIds(players.slice(0, cardLimit).map((p) => p.id));
        }
      }
    } catch {
      setError("取得に失敗しました。");
    } finally {
      setLoading(false);
    }
  }, [buildPayload, players, cardLimit]);

  useEffect(() => {
    if (!open) {
      publishInitRef.current = false;
      return;
    }
    setCopied(false);
    void fetchShare();
  }, [open, fetchShare]);

  const save = async (isPublished: boolean) => {
    const payload = buildPayload();
    const token = await auth.currentUser?.getIdToken();
    if (!token) {
      setError("ログインが必要です。");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/booklet-share", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...payload,
          cardPlayerIds: orderedPublishIds,
          isPublished,
          showFormation: isPro ? showFormation : false,
          showIntroduction: isPro ? showIntroduction : false,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json?.message || "保存に失敗しました。");
        return;
      }
      const s = json?.share;
      if (s) {
        setShare({
          publicId: s.publicId,
          isPublished: s.isPublished,
          showFormation: s.showFormation,
          showIntroduction: s.showIntroduction,
        });
      }
    } catch {
      setError("保存に失敗しました。");
    } finally {
      setSaving(false);
    }
  };

  const publicUrl = share?.publicId
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/booklet/${share.publicId}`
    : null;

  const shareText = share?.isPublished ? "選手名鑑を公開しました" : "";
  const xShareUrl = publicUrl
    ? `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(publicUrl)}`
    : null;
  const lineShareUrl = publicUrl
    ? `https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(publicUrl)}`
    : null;

  if (!open) return null;

  return (
    <div
      className="no-print fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-blue-600" />
            <h2 className="text-base font-bold text-gray-900">名鑑を公開・シェア</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8 text-gray-400">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <div className="space-y-4">
            {error ? (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            ) : null}

            {/* 公開状態 */}
            <div className="rounded-xl border border-gray-200 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-bold text-gray-900">公開状態</div>
                  <div className="mt-0.5 text-xs text-gray-500">
                    {share?.isPublished ? "公開中" : "非公開"}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => save(!(share?.isPublished))}
                  className={`h-9 min-w-20 rounded-full px-4 text-xs font-bold text-white disabled:opacity-50 ${
                    share?.isPublished ? "bg-gray-500 hover:bg-gray-600" : "bg-emerald-600 hover:bg-emerald-700"
                  }`}
                >
                  {saving ? "..." : share?.isPublished ? "非公開にする" : "公開する"}
                </button>
              </div>
            </div>

            {/* 公開URL */}
            {share?.isPublished && publicUrl ? (
              <div className="rounded-xl border border-gray-200 p-4">
                <div className="mb-2 text-xs font-bold text-gray-500">公開URL</div>
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    value={publicUrl}
                    className="h-9 min-w-0 flex-1 rounded-lg border border-gray-200 bg-gray-50 px-2 text-xs text-gray-700"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(publicUrl);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      } catch {}
                    }}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
                    title="URLをコピー"
                  >
                    {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                  </button>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <a
                    href={publicUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex h-9 items-center justify-center gap-1.5 rounded-lg border border-gray-200 text-xs font-bold text-gray-700 hover:bg-gray-50"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    プレビュー
                  </a>
                  {xShareUrl ? (
                    <a
                      href={xShareUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex h-9 items-center justify-center gap-1.5 rounded-lg bg-gray-900 text-xs font-bold text-white hover:bg-gray-800"
                    >
                      <Share2 className="h-3.5 w-3.5" />
                      Xでシェア
                    </a>
                  ) : null}
                  {lineShareUrl ? (
                    <a
                      href={lineShareUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[#06C755] text-xs font-bold text-white hover:opacity-90"
                    >
                      <Share2 className="h-3.5 w-3.5" />
                      LINE
                    </a>
                  ) : null}
                </div>
              </div>
            ) : null}

            {/* 公開選手（Web名鑑） */}
            <div className="rounded-xl border border-gray-200 p-4">
              <div className="mb-1 flex items-center justify-between">
                <div className="text-xs font-bold text-gray-500">公開選手（Web名鑑）</div>
                <div className="text-xs font-bold text-gray-700">
                  {orderedPublishIds.length}/{cardLimit}名
                </div>
              </div>
              <p className="mb-3 text-[11px] leading-relaxed text-gray-400">
                {isPro
                  ? "Proプランでは最大30名まで公開できます。"
                  : "Freeプランでは最大21名まで公開できます。Proでは30名まで公開可能です。"}
              </p>
              {orderedPublishIds.length > cardLimit ? (
                <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-700">
                  上限を超えています。先頭{cardLimit}名のみ公開されます。公開対象を選び直してください。
                </div>
              ) : null}
              <div className="grid max-h-56 grid-cols-2 gap-1.5 overflow-y-auto pr-1">
                {players.map((player) => {
                  const checked = publishIds.includes(player.id);
                  const disabled = !checked && publishIds.length >= cardLimit;
                  return (
                    <label
                      key={player.id}
                      className={`flex min-w-0 items-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs ${
                        checked
                          ? "border-blue-400 bg-blue-50"
                          : disabled
                            ? "border-gray-200 bg-gray-50 opacity-50"
                            : "border-gray-200 bg-white hover:bg-gray-50"
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5 shrink-0 rounded"
                        checked={checked}
                        disabled={disabled}
                        onChange={() => togglePublish(player.id)}
                      />
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-gray-900">
                          {player.name || "-"}
                        </span>
                        <span className="block truncate text-[10px] text-gray-500">
                          {player.number != null ? `#${player.number}` : "-"} {player.position || ""}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* 公開内容 */}
            <div className="rounded-xl border border-gray-200 p-4">
              <div className="mb-3 text-xs font-bold text-gray-500">公開内容</div>
              <div className="space-y-2.5">
                <label className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-gray-900">選手プロフィールカード</span>
                  <span className="text-xs text-gray-400">常時公開</span>
                </label>
                {(["showFormation", "showIntroduction"] as const).map((key) => {
                  const label = key === "showFormation" ? "フォーメーション" : "チーム紹介";
                  const checked = key === "showFormation" ? showFormation : showIntroduction;
                  const setter = key === "showFormation" ? setShowFormation : setShowIntroduction;
                  return (
                    <label key={key} className="flex items-center justify-between gap-3">
                      <span className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
                        {label}
                        {!isPro ? <Lock className="h-3.5 w-3.5 text-amber-500" /> : null}
                      </span>
                      {isPro ? (
                        <button
                          type="button"
                          onClick={() => setter(!checked)}
                          className={`h-7 min-w-14 rounded-full px-3 text-[11px] font-bold text-white ${
                            checked ? "bg-emerald-600" : "bg-gray-400"
                          }`}
                          aria-pressed={checked}
                        >
                          {checked ? "ON" : "OFF"}
                        </button>
                      ) : (
                        <span className="text-xs font-semibold text-amber-600">Pro</span>
                      )}
                    </label>
                  );
                })}
              </div>
              {isPro ? (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => save(share?.isPublished ?? false)}
                  className="mt-4 h-10 w-full rounded-xl bg-blue-600 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? "保存中..." : "公開内容を更新"}
                </button>
              ) : null}
            </div>

            {!isPro ? (
              <p className="text-[11px] leading-relaxed text-gray-400">
                フォーメーション・チーム紹介の公開はProプランの機能です。選手カードの共有は無料でご利用いただけます。
              </p>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
