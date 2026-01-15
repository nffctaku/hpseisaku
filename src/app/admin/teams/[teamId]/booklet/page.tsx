"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import type { BookletResponse, ColorOption, PositionColors } from "./types";
import { getPositionOrder } from "./lib/booklet-utils";
import { BookletAdditionalPlayersTable } from "./components/BookletAdditionalPlayersTable";
import { BookletEditPanel } from "./components/BookletEditPanel";
import { BookletGlobalStyles } from "./components/BookletGlobalStyles";
import { BookletPlayerCard } from "./components/BookletPlayerCard";
import { BookletToolbar } from "./components/BookletToolbar";
import { ProPlanNotice } from "./components/ProPlanNotice";

export default function TeamBookletPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const teamId = params.teamId as string;
  const season = (searchParams.get("season") || "").trim();

  const { user } = useAuth();
  const isPro = user?.plan === "pro";

  const [data, setData] = useState<BookletResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([]);
  const [additionalPlayerIds, setAdditionalPlayerIds] = useState<string[]>([]);
  const [paper, setPaper] = useState<"a4" | "a3_landscape">("a4");
  const [positionColors, setPositionColors] = useState<PositionColors>({
    GK: "bg-rose-300",
    DF: "bg-blue-300",
    MF: "bg-green-300",
    FW: "bg-orange-300",
  });

  const colorOptions: ColorOption[] = [
    { name: "赤", value: "bg-rose-300" },
    { name: "青", value: "bg-blue-300" },
    { name: "緑", value: "bg-green-300" },
    { name: "オレンジ", value: "bg-orange-300" },
    { name: "紫", value: "bg-purple-300" },
    { name: "黄色", value: "bg-yellow-300" },
    { name: "灰色", value: "bg-gray-300" },
    { name: "ピンク", value: "bg-pink-300" },
  ];

  useEffect(() => {
    const run = async () => {
      if (!teamId || !season) return;
      setLoading(true);
      setError(null);

      try {
        const token = await auth.currentUser?.getIdToken();
        if (!token) {
          setError("ログインが必要です。");
          setLoading(false);
          return;
        }

        const res = await fetch(`/api/admin/booklet?teamId=${encodeURIComponent(teamId)}&season=${encodeURIComponent(season)}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setError(body?.message || "取得に失敗しました");
          setLoading(false);
          return;
        }

        const json = (await res.json()) as BookletResponse;
        setData(json);
        
        // localStorageから選択状態を復元
        const storageKey = `booklet_selection_${teamId}_${season}`;
        const savedSelection = localStorage.getItem(storageKey);
        
        if (savedSelection) {
          try {
            const parsed = JSON.parse(savedSelection);
            setSelectedPlayerIds(parsed.selectedPlayerIds || json.players.slice(0, 15).map(p => p.id));
            setAdditionalPlayerIds(parsed.additionalPlayerIds || []);
            setPositionColors(
              parsed.positionColors || {
                GK: "bg-rose-300",
                DF: "bg-blue-300",
                MF: "bg-green-300",
                FW: "bg-orange-300",
              }
            );
          } catch (e) {
            // パースエラーの場合はデフォルト値を使用
            setSelectedPlayerIds(json.players.slice(0, 15).map(p => p.id));
            setAdditionalPlayerIds([]);
          }
        } else {
          // 初期状態では最初の15人を選択
          setSelectedPlayerIds(json.players.slice(0, 15).map(p => p.id));
          setAdditionalPlayerIds([]);
        }
      } catch (e) {
        console.error(e);
        setError("取得に失敗しました");
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, [teamId, season]);

  useEffect(() => {
    if (isPro) return;
    if (paper !== "a4") setPaper("a4");
  }, [isPro, paper]);

  useEffect(() => {
    if (!data?.players || data.players.length === 0) return;
    if (selectedPlayerIds.length > 0) return;
    setSelectedPlayerIds(data.players.slice(0, 15).map((p) => p.id));
  }, [data, selectedPlayerIds.length]);

  // 選択状態が変更されたらlocalStorageに保存
  useEffect(() => {
    if (!teamId || !season) return;
    
    const storageKey = `booklet_selection_${teamId}_${season}`;
    const selectionData = {
      selectedPlayerIds,
      additionalPlayerIds,
      positionColors
    };
    
    localStorage.setItem(storageKey, JSON.stringify(selectionData));
  }, [selectedPlayerIds, additionalPlayerIds, positionColors, teamId, season]);

  const players = useMemo(() => {
    const list = Array.isArray(data?.players) ? data!.players : [];
    
    const sortedList = [...list].sort((a, b) => {
      // まずメインポジションでソート
      const aOrder = getPositionOrder(a.mainPosition || a.position || "");
      const bOrder = getPositionOrder(b.mainPosition || b.position || "");
      
      if (aOrder !== bOrder) return aOrder - bOrder;
      
      // ポジションが同じ場合は背番号でソート
      const an = typeof a.number === "number" ? a.number : 9999;
      const bn = typeof b.number === "number" ? b.number : 9999;
      if (an !== bn) return an - bn;
      
      // 最後に名前でソート
      return String(a.name || "").localeCompare(String(b.name || ""));
    });
    
    if (isEditMode) {
      return sortedList;
    }
    
    // 編集モードでない場合は選択された15人のみ表示
    return sortedList.filter(p => selectedPlayerIds.includes(p.id));
  }, [data, isEditMode, selectedPlayerIds]);

  const getPositionColor = (position: string) => {
    const pos = (position || "").toUpperCase();
    
    // GKの判定
    if (pos.includes('GK') || pos.includes('ゴールキーパー') || pos.includes('キーパー')) {
      return positionColors.GK;
    }
    
    // DFの判定
    if (pos.includes('DF') || pos.includes('ディフェンダー') || pos.includes('ディフェンス') || 
        pos.includes('CB') || pos.includes('LB') || pos.includes('RB') || pos.includes('SB') ||
        pos.includes('センターバック') || pos.includes('レフトバック') || pos.includes('ライトバック')) {
      return positionColors.DF;
    }
    
    // MFの判定
    if (pos.includes('MF') || pos.includes('ミッドフィルダー') || pos.includes('ミッドフィールド') ||
        pos.includes('CM') || pos.includes('DM') || pos.includes('AM') || pos.includes('LM') || pos.includes('RM') ||
        pos.includes('センターミッドフィルダー') || pos.includes('ディフェンシブミッドフィルダー') || 
        pos.includes('アタッキングミッドフィルダー') || pos.includes('サイドミッドフィルダー')) {
      return positionColors.MF;
    }
    
    // FWの判定
    if (pos.includes('FW') || pos.includes('フォワード') || pos.includes('ストライカー') ||
        pos.includes('ST') || pos.includes('CF') || pos.includes('LW') || pos.includes('RW') ||
        pos.includes('センターフォワード') || pos.includes('ウインガー')) {
      return positionColors.FW;
    }
    
    // デフォルト色
    return "bg-gray-500";
  };

  const handlePlayerToggle = (playerId: string) => {
    setSelectedPlayerIds(prev => {
      if (prev.includes(playerId)) {
        return prev.filter(id => id !== playerId);
      } else {
        if (prev.length >= 15) {
          return prev; // 15人以上は選択できない
        }
        return [...prev, playerId];
      }
    });
  };

  const handleAdditionalPlayerToggle = (playerId: string) => {
    setAdditionalPlayerIds(prev => {
      if (prev.includes(playerId)) {
        return prev.filter(id => id !== playerId);
      } else {
        if (prev.length >= 8) {
          return prev; // 8人以上は選択できない
        }
        return [...prev, playerId];
      }
    });
  };

  return (
    <div className="text-gray-900">
      <BookletGlobalStyles paper={paper} />

      <BookletToolbar
        clubName={data?.club?.clubName || ""}
        teamName={data?.teamName || ""}
        season={season}
        loading={loading}
        isPro={!!isPro}
        isEditMode={isEditMode}
        selectedCount={selectedPlayerIds.length}
        paper={paper}
        onChangePaper={(p) => setPaper(p)}
        onEnterEdit={() => setIsEditMode(true)}
        onExitEdit={() => setIsEditMode(false)}
        onPrint={() => window.print()}
      />

      {isPro && season ? (
        <div className="no-print mb-4 flex flex-wrap items-center gap-2">
          <Link
            href={`/admin/teams/${encodeURIComponent(teamId)}/booklet/a3?season=${encodeURIComponent(season)}`}
            className="px-3 py-2 rounded-md bg-slate-700 text-white text-sm font-semibold"
          >
            A3配置を編集
          </Link>
          <Link
            href={`/admin/teams/${encodeURIComponent(teamId)}/booklet/a3/print?season=${encodeURIComponent(season)}`}
            className="px-3 py-2 rounded-md bg-slate-700 text-white text-sm font-semibold"
          >
            A3配置で印刷
          </Link>
        </div>
      ) : null}

      {!isPro ? <ProPlanNotice /> : null}

      {isEditMode && (
        <>
          {/* ポジション色選択 */}
          {/* 選手選択 */}
          {/* 追加選手選択 */}
          <BookletEditPanel
            players={data?.players || []}
            selectedPlayerIds={selectedPlayerIds}
            additionalPlayerIds={additionalPlayerIds}
            positionColors={positionColors}
            colorOptions={colorOptions}
            onChangePositionColor={(position, value) =>
              setPositionColors((prev) => ({
                ...prev,
                [position]: value,
              }))
            }
            onTogglePlayer={handlePlayerToggle}
            onToggleAdditionalPlayer={handleAdditionalPlayerToggle}
          />
        </>
      )}

      {loading && <p className="text-sm text-muted-foreground">読み込み中...</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {!loading && !error && data && data.players.length > 0 && players.length === 0 ? (
        <div className="no-print text-sm text-muted-foreground">
          表示する選手が選択されていません。「選手を選択」から15名選択してください。
        </div>
      ) : null}

      {data && (
        <div className="mx-auto">
          <div className="print-page">
            <div
              className={`${paper === "a3_landscape" ? "w-[420mm]" : "w-[210mm]"} min-h-[297mm] mx-auto bg-white`}
            >
              <div className="px-[6mm] pt-[10mm]">
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <div className="text-2xl font-black leading-tight truncate">{data.club.clubName}</div>
                    <div className="text-sm text-gray-600 mt-1 truncate">
                      {data.teamName} / {season}
                    </div>
                  </div>
                  {data.club.logoUrl ? (
                    <div className="relative w-[40mm] h-[12mm]">
                      <Image src={data.club.logoUrl} alt={data.club.clubName} fill className="object-contain" sizes="160px" />
                    </div>
                  ) : null}
                </div>

                <div
                  className={`mt-[6mm] grid ${paper === "a3_landscape" ? "grid-cols-5" : "grid-cols-3"} gap-[1.5mm]`}
                >
                  {players.map((p) => (
                    <BookletPlayerCard
                      key={p.id}
                      player={p}
                      positionColorClass={getPositionColor(p.mainPosition || p.position)}
                    />
                  ))}
                </div>
                
                {/* 追加選手セクション */}
                <BookletAdditionalPlayersTable
                  players={data?.players.filter((p) => additionalPlayerIds.includes(p.id)) || []}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
