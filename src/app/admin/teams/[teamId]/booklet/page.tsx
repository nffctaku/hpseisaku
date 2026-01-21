"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { auth } from "@/lib/firebase";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import type { BookletResponse, ColorOption, PositionColors } from "./types";
import { getPositionOrder } from "./lib/booklet-utils";
import { BookletAdditionalPlayersTable } from "./components/BookletAdditionalPlayersTable";
import { BookletEditPanel } from "./components/BookletEditPanel";
import { BookletGlobalStyles } from "./components/BookletGlobalStyles";
import { BookletPlayerCard } from "./components/BookletPlayerCard";
import { BookletToolbar } from "./components/BookletToolbar";
import { ProPlanNotice } from "./components/ProPlanNotice";
import { collection, getDocs } from "firebase/firestore";
import { toSlashSeason } from "@/lib/season";
import { PrintPageLayout, type TransferRow as A3TransferRow } from "./a3/print/components/PrintPageLayout";
import { createEmptyLayout, last5Seasons } from "./a3/lib/a3-layout";
import { formations } from "@/lib/formations";
import { A3Editor } from "./a3/page";

export default function TeamBookletPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const teamId = params.teamId as string;
  const season = (searchParams.get("season") || "").trim();

  const { user, ownerUid } = useAuth();
  const isPro = user?.plan === "pro";

  const clubUid = ownerUid || user?.uid || null;

  const [data, setData] = useState<BookletResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [seasonOptions, setSeasonOptions] = useState<string[]>([]);
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([]);
  const [additionalPlayerIds, setAdditionalPlayerIds] = useState<string[]>([]);
  const [paper, setPaper] = useState<"a4" | "a3_landscape">("a4");
  const format: "a4" | "a3" = paper === "a3_landscape" ? "a3" : "a4";
  const [a3IsEditMode, setA3IsEditMode] = useState(false);
  const [a3PreviewScale, setA3PreviewScale] = useState(0.7);
  const [a3UpgradeMessage, setA3UpgradeMessage] = useState<string | null>(null);
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
      if (!clubUid) {
        setSeasonOptions([]);
        return;
      }
      try {
        const seasonsColRef = collection(db, `clubs/${clubUid}/seasons`);
        const snapshot = await getDocs(seasonsColRef);
        const seasonsData = snapshot.docs
          .map((d) => toSlashSeason(d.id))
          .filter((s) => typeof s === "string" && s.trim().length > 0)
          .sort((a, b) => b.localeCompare(a));
        setSeasonOptions(seasonsData);
      } catch (e) {
        console.warn("[TeamBookletPage] failed to load seasons", e);
        setSeasonOptions([]);
      }
    };

    void run();
  }, [clubUid]);

  useEffect(() => {
    const run = async () => {
      if (!teamId) return;
      if (season) return;
      if (!clubUid) return;

      try {
        const seasonsColRef = collection(db, `clubs/${clubUid}/seasons`);
        const snapshot = await getDocs(seasonsColRef);
        const seasonsData = snapshot.docs
          .map((d) => toSlashSeason(d.id))
          .filter((s) => typeof s === "string" && s.trim().length > 0)
          .sort((a, b) => b.localeCompare(a));

        if (seasonsData.length === 0) {
          setError("シーズンが未作成です。先にシーズンを作成してください。");
          return;
        }

        const latest = seasonsData[0];
        router.replace(`/admin/teams/${encodeURIComponent(teamId)}/booklet?season=${encodeURIComponent(latest)}`);
      } catch (e) {
        console.error(e);
        setError("シーズンの取得に失敗しました。");
      }
    };

    void run();
  }, [clubUid, router, season, teamId]);

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

  const a3PreviewScaleStorageKey = useMemo(() => {
    if (!clubUid || !teamId) return "";
    return `a3_print_preview_scale_${clubUid}_${teamId}`;
  }, [clubUid, teamId]);

  useEffect(() => {
    if (!a3PreviewScaleStorageKey) return;
    const raw = localStorage.getItem(a3PreviewScaleStorageKey);
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0.3 && n <= 1) {
      setA3PreviewScale(n);
    }
  }, [a3PreviewScaleStorageKey]);

  useEffect(() => {
    if (!a3PreviewScaleStorageKey) return;
    localStorage.setItem(a3PreviewScaleStorageKey, String(a3PreviewScale));
  }, [a3PreviewScale, a3PreviewScaleStorageKey]);

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

  const [a3Layout, setA3Layout] = useState<any>(() => createEmptyLayout() as any);
  const [a3LayoutSource, setA3LayoutSource] = useState<"saved" | "default">("default");
  const a3LayoutStorageKey = useMemo(() => {
    if (!teamId || !season) return "";
    return `booklet_a3_layout_${teamId}_${season}`;
  }, [teamId, season]);

  useEffect(() => {
    if (a3IsEditMode) return;
    if (!a3LayoutStorageKey) return;
    const saved = localStorage.getItem(a3LayoutStorageKey);
    if (!saved) {
      setA3Layout(createEmptyLayout() as any);
      setA3LayoutSource("default");
      return;
    }
    try {
      const parsed = JSON.parse(saved) as any;
      if (!parsed || typeof parsed !== "object" || !parsed.slots || typeof parsed.slots !== "object") {
        setA3Layout(createEmptyLayout() as any);
        setA3LayoutSource("default");
        return;
      }
      setA3Layout({
        ...(createEmptyLayout() as any),
        ...parsed,
        slots: {
          ...(createEmptyLayout() as any).slots,
          ...(parsed.slots as any),
        },
      });
      setA3LayoutSource("saved");
    } catch {
      setA3Layout(createEmptyLayout() as any);
      setA3LayoutSource("default");
    }
  }, [a3IsEditMode, a3LayoutStorageKey]);

  const isA3LayoutEmpty = useMemo(() => {
    const l = a3Layout as any;
    const slots = l?.slots && typeof l.slots === "object" ? Object.values(l.slots as any) : [];
    const slotsEmpty = slots.every((v) => !String(v || "").trim());
    const extrasEmpty = !Array.isArray(l?.extras) || l.extras.length === 0;
    const leagueEmpty = !(typeof l?.leagueCompetitionName === "string" && l.leagueCompetitionName.trim().length > 0);
    const cups = Array.isArray(l?.cups) ? l.cups : [];
    const cupsEmpty = cups.length === 0 || cups.every((c: any) => !String(c?.tournament || "").trim() && !String(c?.result || "").trim());
    const starters = l?.starters && typeof l.starters === "object" ? Object.values(l.starters as any) : [];
    const startersEmpty = starters.every((v) => !String(v || "").trim());
    return slotsEmpty && extrasEmpty && leagueEmpty && cupsEmpty && startersEmpty;
  }, [a3Layout]);

  const a3ResolvedLayout = useMemo(() => {
    const base = a3Layout as any;
    if (a3LayoutSource === "saved" && !isA3LayoutEmpty) return base;
    const next = createEmptyLayout() as any;
    const ids = Array.isArray(data?.players) ? data!.players.map((p) => p.id) : [];
    for (let i = 0; i < 12; i++) next.slots[`r${i}`] = ids[i] ?? null;
    for (let i = 0; i < 12; i++) next.slots[`l${i}`] = ids[12 + i] ?? null;
    next.extras = Array.isArray(base?.extras) ? base.extras.slice(0, 5) : [];
    next.leagueCompetitionName = base?.leagueCompetitionName || null;
    next.bioTitle = typeof base?.bioTitle === "string" ? base.bioTitle : "";
    next.bioBody = typeof base?.bioBody === "string" ? base.bioBody : "";
    next.cups = Array.isArray(base?.cups) ? base.cups.slice(0, next.cups.length) : next.cups;
    next.positionColors = base?.positionColors || next.positionColors;
    next.formationName = typeof base?.formationName === "string" && base.formationName.trim() ? base.formationName.trim() : next.formationName;
    next.starters = base?.starters && typeof base.starters === "object" ? base.starters : {};
    next.coachStaffId = typeof base?.coachStaffId === "string" ? base.coachStaffId : null;
    return next;
  }, [a3Layout, a3LayoutSource, data, isA3LayoutEmpty]);

  const a3PlayersById = useMemo(() => {
    const list = Array.isArray(data?.players) ? data!.players : [];
    const m = new Map<string, (typeof list)[number]>();
    for (const p of list) m.set(p.id, p);
    return m;
  }, [data]);

  const a3GetPositionColor = (position: string) => {
    const pos = (position || "").toUpperCase();
    const pc = (a3ResolvedLayout as any).positionColors || (createEmptyLayout() as any).positionColors;
    if (pos.includes("GK") || pos.includes("ゴールキーパー") || pos.includes("キーパー")) return pc.GK;
    if (
      pos.includes("DF") ||
      pos.includes("ディフェンダー") ||
      pos.includes("ディフェンス") ||
      pos.includes("CB") ||
      pos.includes("LB") ||
      pos.includes("RB") ||
      pos.includes("SB") ||
      pos.includes("センターバック") ||
      pos.includes("レフトバック") ||
      pos.includes("ライトバック")
    )
      return pc.DF;
    if (
      pos.includes("MF") ||
      pos.includes("ミッドフィルダー") ||
      pos.includes("ミッドフィールド") ||
      pos.includes("CM") ||
      pos.includes("DM") ||
      pos.includes("AM") ||
      pos.includes("LM") ||
      pos.includes("RM") ||
      pos.includes("センターミッドフィルダー") ||
      pos.includes("ディフェンシブミッドフィルダー") ||
      pos.includes("アタッキングミッドフィルダー") ||
      pos.includes("サイドミッドフィルダー")
    )
      return pc.MF;
    if (
      pos.includes("FW") ||
      pos.includes("フォワード") ||
      pos.includes("ストライカー") ||
      pos.includes("ST") ||
      pos.includes("CF") ||
      pos.includes("LW") ||
      pos.includes("RW") ||
      pos.includes("センターフォワード") ||
      pos.includes("ウインガー")
    )
      return pc.FW;
    return "bg-gray-300";
  };

  const a3Formation = useMemo(() => {
    const name = String((a3ResolvedLayout as any).formationName || "").trim();
    return formations.find((f) => f.name === name) || formations[0];
  }, [a3ResolvedLayout]);

  const a3FormationStartersByPosition = useMemo(() => {
    const out: Record<string, { id: string; number: string; name: string; photoUrl?: string } | null> = {};
    for (const pos of a3Formation.positions) {
      const pid = ((a3ResolvedLayout as any).starters || {})[pos.id] || null;
      if (!pid) {
        out[pos.id] = null;
        continue;
      }
      const p = a3PlayersById.get(pid) || null;
      if (!p) {
        out[pos.id] = null;
        continue;
      }
      out[pos.id] = {
        id: p.id,
        number: p.number != null ? String(p.number) : "-",
        name: p.name,
        ...(p.photoUrl ? { photoUrl: p.photoUrl } : {}),
      };
    }
    return out;
  }, [a3Formation.positions, a3PlayersById, a3ResolvedLayout]);

  const a3RightCards = useMemo(() => {
    return Array.from({ length: 12 }).map((_, i) => {
      const pid = (a3ResolvedLayout as any).slots?.[`r${i}`] || null;
      return pid ? a3PlayersById.get(pid) || null : null;
    });
  }, [a3PlayersById, a3ResolvedLayout]);

  const a3LeftCards = useMemo(() => {
    return Array.from({ length: 12 }).map((_, i) => {
      const pid = (a3ResolvedLayout as any).slots?.[`l${i}`] || null;
      return pid ? a3PlayersById.get(pid) || null : null;
    });
  }, [a3PlayersById, a3ResolvedLayout]);

  const a3AdditionalPlayers = useMemo(() => {
    const ids = Array.isArray((a3ResolvedLayout as any).extras) ? (a3ResolvedLayout as any).extras : [];
    return Array.from({ length: 5 }).map((_, i) => {
      const id = String(ids[i] || "").trim();
      return id ? a3PlayersById.get(id) || null : null;
    });
  }, [a3PlayersById, a3ResolvedLayout]);

  const a3Stats = useMemo(() => {
    return last5Seasons(season).map((s) => ({ season: s, league: "-", rank: "-" }));
  }, [season]);

  const a3Cups8 = useMemo(() => {
    const cups = Array.isArray((a3ResolvedLayout as any).cups) ? (a3ResolvedLayout as any).cups : (createEmptyLayout() as any).cups;
    const slice = cups.slice(0, 8);
    const padded = slice.concat(Array.from({ length: Math.max(0, 8 - slice.length) }).map(() => ({ tournament: "", result: "" })));
    return padded;
  }, [a3ResolvedLayout]);

  const a3TransfersIn12 = useMemo(() => {
    const list = Array.isArray((data as any)?.transfersIn) ? ((data as any).transfersIn as any[]) : [];
    const mapped: A3TransferRow[] = list.map((t) => ({
      position: String(t?.position || "").trim() || "-",
      playerName: String(t?.playerName || "").trim() || "-",
      type: String(t?.type || "").trim() || "完全",
      fromTo: String(t?.fromTo || "").trim() || "-",
    }));
    const slice = mapped.slice(0, 12);
    return slice.concat(Array.from({ length: Math.max(0, 12 - slice.length) }).map(() => ({ position: "", playerName: "", type: "", fromTo: "" })));
  }, [data]);

  const a3TransfersOut12 = useMemo(() => {
    const list = Array.isArray((data as any)?.transfersOut) ? ((data as any).transfersOut as any[]) : [];
    const mapped: A3TransferRow[] = list.map((t) => ({
      position: String(t?.position || "").trim() || "-",
      playerName: String(t?.playerName || "").trim() || "-",
      type: String(t?.type || "").trim() || "完全",
      fromTo: String(t?.fromTo || "").trim() || "-",
    }));
    const slice = mapped.slice(0, 12);
    return slice.concat(Array.from({ length: Math.max(0, 12 - slice.length) }).map(() => ({ position: "", playerName: "", type: "", fromTo: "" })));
  }, [data]);

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
        seasonOptions={seasonOptions}
        onSeasonChange={(nextSeason) => {
          if (!nextSeason) return;
          router.push(`/admin/teams/${encodeURIComponent(teamId)}/booklet?season=${encodeURIComponent(nextSeason)}`);
        }}
        loading={loading}
        isPro={!!isPro}
        format={format}
        onSelectFormat={(next) => {
          if (next === "a3") {
            if (!isPro) {
              setA3UpgradeMessage("A3機能はProプランのみです。プランのアップグレードが必要です。");
              return;
            }
            setA3UpgradeMessage(null);
            setPaper("a3_landscape");
            setIsEditMode(false);
            setA3IsEditMode(false);
            return;
          }
          setA3UpgradeMessage(null);
          setPaper("a4");
          setA3IsEditMode(false);
        }}
        a3IsEditMode={a3IsEditMode}
        onA3EnterEdit={() => setA3IsEditMode(true)}
        onA3ExitEdit={() => setA3IsEditMode(false)}
        onA3Print={() => window.print()}
        isEditMode={isEditMode}
        selectedCount={selectedPlayerIds.length}
        onEnterEdit={() => setIsEditMode(true)}
        onExitEdit={() => setIsEditMode(false)}
        onPrint={() => window.print()}
      />

      {a3UpgradeMessage ? (
        <div className="no-print mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {a3UpgradeMessage}
        </div>
      ) : null}

      {!isPro ? <ProPlanNotice /> : null}

      {isPro && season && format === "a3" && !a3IsEditMode ? (
        <div className="no-print mb-4 rounded-md border bg-white p-3 text-sm text-gray-900">
          <div className="grid grid-cols-1 gap-3">
            <label className="flex items-center gap-2">
              <input
                type="range"
                min={30}
                max={100}
                step={5}
                value={Math.round(a3PreviewScale * 100)}
                onChange={(e) => setA3PreviewScale(Math.max(0.3, Math.min(1, Number(e.target.value) / 100)))}
                className="flex-1"
              />
              <span className="w-12 text-right text-xs tabular-nums text-gray-700">{Math.round(a3PreviewScale * 100)}%</span>
            </label>
          </div>
        </div>
      ) : null}

      {isPro && season && format === "a3" && a3IsEditMode ? (
        <A3Editor teamId={teamId} season={season} embedded />
      ) : null}

      {isPro && season && format === "a3" && !a3IsEditMode && data ? (
        <div className="overflow-x-auto">
          <div
            className="inline-block"
            style={{
              transform: `scale(${a3PreviewScale})`,
              transformOrigin: "top left",
            }}
          >
            <PrintPageLayout
              teamName={data.teamName}
              season={season}
              logoUrl={data.club.logoUrl}
              bioTitle={String((a3ResolvedLayout as any).bioTitle || "")}
              bioBody={String((a3ResolvedLayout as any).bioBody || "")}
              formationPlayers={[...a3RightCards, ...a3LeftCards]
                .filter((p): p is NonNullable<typeof p> => !!p)
                .map((p) => ({
                  id: p.id,
                  number: String((p as any).number ?? "-") || "-",
                  name: p.name || "-",
                  ...(p.photoUrl ? { photoUrl: p.photoUrl } : {}),
                }))}
              formationName={a3Formation.name}
              formationStartersByPosition={a3FormationStartersByPosition}
              leftCards={a3LeftCards}
              rightCards={a3RightCards}
              additionalPlayers={a3AdditionalPlayers}
              getPositionColor={a3GetPositionColor}
              stats={a3Stats}
              cups={a3Cups8}
              transfersIn={a3TransfersIn12}
              transfersOut={a3TransfersOut12}
              coach={{ name: "監督名", photoUrl: null, bio: "監督の紹介文" }}
            />
          </div>
        </div>
      ) : null}

      {format === "a4" && isEditMode && (
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

      {loading ? (
        <div className="no-print mb-4 rounded-md border bg-white px-4 py-3 text-sm text-gray-700">
          <div className="flex items-center gap-3">
            <div
              className="h-4 w-4 animate-spin rounded-full border-2 border-gray-200 border-t-gray-600"
              aria-label="loading"
            />
            <div>プレビューを読み込み中...</div>
          </div>
        </div>
      ) : null}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {!loading && !error && data && data.players.length > 0 && format === "a4" && players.length === 0 ? (
        <div className="no-print text-sm text-muted-foreground">
          表示する選手が選択されていません。「選手を選択」から15名選択してください。
        </div>
      ) : null}

      {data && format === "a4" && (
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
