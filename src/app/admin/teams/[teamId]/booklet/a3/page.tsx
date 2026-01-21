"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/firebase";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import type { BookletPlayer, BookletResponse } from "../types";
import { ProPlanNotice } from "../components/ProPlanNotice";
import { SlotButton } from "./components/SlotButton";
import { PreviewPanel } from "./components/PreviewPanel";
import { createEmptyLayout, last5Seasons, toCompetitionSeasonLabel } from "./lib/a3-layout";
import { useLeagueCompetitions } from "./hooks/useLeagueCompetitions";
import { useLeagueStats } from "./hooks/useLeagueStats";
import { formations } from "@/lib/formations";
import { collection, getDocs } from "firebase/firestore";

type SlotKey = `l${number}` | `r${number}`;

type ActiveKey = SlotKey | `e${number}`;

type LayoutState = {
  slots: Record<SlotKey, string | null>;
  extras: string[];
  leagueCompetitionName: string | null;
  bioTitle: string;
  bioBody: string;
  cups: CupRow[];
  formationName: string | null;
  starters: Record<string, string | null>;
  positionColors: {
    GK: string;
    DF: string;
    MF: string;
    FW: string;
  };
  coachStaffId: string | null;
};

type StaffDoc = {
  id: string;
  name?: string;
  position?: string;
  seasons?: string[];
  isPublished?: boolean;
};

type StatRow = {
  season: string;
  league: string;
  rank: string;
};

type CupRow = {
  tournament: string;
  result: string;
};

type TransferRow = {
  date: string;
  playerName: string;
  type: string;
  fromTo: string;
};

type CoachInfo = {
  name: string;
  bio: string;
};

export default function TeamBookletA3EditorPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const teamId = params.teamId as string;
  const season = (searchParams.get("season") || "").trim();

  const { user, ownerUid } = useAuth();
  const isPro = user?.plan === "pro";

  const [data, setData] = useState<BookletResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const storageKey = useMemo(() => {
    if (!teamId || !season) return "";
    return `booklet_a3_layout_${teamId}_${season}`;
  }, [teamId, season]);

  const activeFormationPosStorageKey = useMemo(() => {
    if (!teamId || !season) return "";
    return `booklet_a3_active_pos_${teamId}_${season}`;
  }, [teamId, season]);

  const [layout, setLayout] = useState<LayoutState>(() => createEmptyLayout());
  const [activeSlot, setActiveSlot] = useState<ActiveKey>("r0");
  const [activeFormationPosId, setActiveFormationPosId] = useState<string | null>(null);
  const [hasLoadedLayout, setHasLoadedLayout] = useState(false);
  const [layoutSource, setLayoutSource] = useState<"saved" | "empty">("empty");
  const [didAutoFillSlots, setDidAutoFillSlots] = useState(false);

  useEffect(() => {
    if (!storageKey) return;
    const saved = localStorage.getItem(storageKey);
    if (!saved) {
      setLayout(createEmptyLayout());
      setLayoutSource("empty");
      setHasLoadedLayout(true);
      return;
    }
    try {
      const parsed = JSON.parse(saved) as LayoutState;
      if (!parsed || typeof parsed !== "object" || !parsed.slots || typeof parsed.slots !== "object") {
        setLayout(createEmptyLayout());
        setLayoutSource("empty");
        setHasLoadedLayout(true);
        return;
      }
      const normalizedCups = (() => {
        const defaults = createEmptyLayout().cups;
        const raw = (parsed as any).cups;
        const list = Array.isArray(raw) ? raw : [];
        const mapped = list
          .map((x: any) => ({
            tournament: typeof x?.tournament === "string" ? String(x.tournament) : "",
            result: typeof x?.result === "string" ? String(x.result) : "",
          }))
          .slice(0, defaults.length);
        while (mapped.length < defaults.length) mapped.push({ tournament: "", result: "" });
        return mapped;
      })();
      setLayout({
        slots: {
          ...createEmptyLayout().slots,
          ...(parsed.slots as any),
        },
        extras: Array.isArray((parsed as any).extras)
          ? (parsed as any).extras.filter((x: any) => typeof x === "string" && x.trim().length > 0).slice(0, 5)
          : [],
        leagueCompetitionName:
          typeof (parsed as any).leagueCompetitionName === "string" && String((parsed as any).leagueCompetitionName).trim().length > 0
            ? String((parsed as any).leagueCompetitionName).trim()
            : null,
        bioTitle: typeof (parsed as any).bioTitle === "string" ? String((parsed as any).bioTitle) : "",
        bioBody: typeof (parsed as any).bioBody === "string" ? String((parsed as any).bioBody) : "",
        cups: normalizedCups,
        formationName:
          typeof (parsed as any).formationName === "string" && String((parsed as any).formationName).trim().length > 0
            ? String((parsed as any).formationName).trim()
            : createEmptyLayout().formationName,
        starters: (() => {
          const raw = (parsed as any).starters;
          return raw && typeof raw === "object" ? (raw as any) : {};
        })(),
        positionColors: (() => {
          const d = (createEmptyLayout() as any).positionColors;
          const raw = (parsed as any).positionColors;
          if (!raw || typeof raw !== "object") return d;
          return {
            GK: typeof raw.GK === "string" ? raw.GK : d.GK,
            DF: typeof raw.DF === "string" ? raw.DF : d.DF,
            MF: typeof raw.MF === "string" ? raw.MF : d.MF,
            FW: typeof raw.FW === "string" ? raw.FW : d.FW,
          };
        })(),
        coachStaffId: (() => {
          const raw = (parsed as any).coachStaffId;
          return typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : null;
        })(),
      });
      setLayoutSource("saved");
      setHasLoadedLayout(true);
    } catch {
      setLayout(createEmptyLayout());
      setLayoutSource("empty");
      setHasLoadedLayout(true);
    }
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey) return;
    if (!hasLoadedLayout) return;
    localStorage.setItem(storageKey, JSON.stringify(layout));
  }, [hasLoadedLayout, layout, storageKey]);

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

        const res = await fetch(
          `/api/admin/booklet?teamId=${encodeURIComponent(teamId)}&season=${encodeURIComponent(season)}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setError(body?.message || "取得に失敗しました");
          setLoading(false);
          return;
        }

        const json = (await res.json()) as BookletResponse;
        setData(json);
      } catch (e) {
        console.error(e);
        setError("取得に失敗しました");
      } finally {
        setLoading(false);
      }
    };
    void run();
  }, [teamId, season]);

  const players = useMemo(() => {
    const list = Array.isArray(data?.players) ? data!.players : [];
    return [...list].sort((a, b) => {
      const an = typeof a.number === "number" ? a.number : 9999;
      const bn = typeof b.number === "number" ? b.number : 9999;
      if (an !== bn) return an - bn;
      return String(a.name || "").localeCompare(String(b.name || ""));
    });
  }, [data]);

  useEffect(() => {
    if (!hasLoadedLayout) return;
    if (layoutSource !== "empty") return;
    if (didAutoFillSlots) return;
    if (!data) return;

    const slotValues = Object.values(layout.slots || {});
    const slotsAlreadyFilled = slotValues.some((v) => !!String(v || "").trim());
    if (slotsAlreadyFilled) {
      setDidAutoFillSlots(true);
      return;
    }

    const ids = players.map((p) => p.id);
    if (ids.length === 0) return;

    setLayout((prev) => {
      const nextSlots: Record<SlotKey, string | null> = { ...(prev.slots as any) };
      for (let i = 0; i < 12; i++) nextSlots[`r${i}` as SlotKey] = ids[i] ?? null;
      for (let i = 0; i < 12; i++) nextSlots[`l${i}` as SlotKey] = ids[12 + i] ?? null;
      return {
        ...prev,
        slots: nextSlots,
      };
    });
    setDidAutoFillSlots(true);
  }, [data, didAutoFillSlots, hasLoadedLayout, layout.slots, layoutSource, players]);

  const playersById = useMemo(() => {
    const m = new Map<string, BookletPlayer>();
    for (const p of players) m.set(p.id, p);
    return m;
  }, [players]);

  const usedCardPlayerIds = useMemo(() => {
    const selected = new Set<string>();
    Object.values(layout.slots).forEach((id) => {
      if (id) selected.add(id);
    });
    layout.extras.forEach((id) => {
      if (id) selected.add(id);
    });
    return selected;
  }, [layout.extras, layout.slots]);

  const formation = useMemo(() => {
    const name = String(layout.formationName || "").trim();
    return formations.find((f) => f.name === name) || formations[0];
  }, [layout.formationName]);

  const padPitchCoord = useMemo(() => {
    const pad = 7;
    return (v: number) => {
      const n = Number(v);
      if (!Number.isFinite(n)) return 50;
      const clamped = Math.max(0, Math.min(100, n));
      return pad + ((100 - 2 * pad) * clamped) / 100;
    };
  }, []);

  useEffect(() => {
    const ids = formation.positions.map((p) => p.id);
    if (ids.length === 0) {
      setActiveFormationPosId(null);
      return;
    }
    setActiveFormationPosId((prev) => (prev && ids.includes(prev) ? prev : ids[0]));
  }, [formation.positions]);

  useEffect(() => {
    if (!activeFormationPosStorageKey) return;
    if (!hasLoadedLayout) return;
    const saved = localStorage.getItem(activeFormationPosStorageKey);
    const s = String(saved || "").trim();
    if (!s) return;
    if (formation.positions.some((p) => p.id === s)) {
      setActiveFormationPosId(s);
    }
  }, [activeFormationPosStorageKey, formation.positions, hasLoadedLayout]);

  useEffect(() => {
    if (!activeFormationPosStorageKey) return;
    if (!hasLoadedLayout) return;
    if (!activeFormationPosId) return;
    localStorage.setItem(activeFormationPosStorageKey, activeFormationPosId);
  }, [activeFormationPosId, activeFormationPosStorageKey, hasLoadedLayout]);

  const getAvailableStarters = (currentId: string | null) => {
    const inStarters = new Set<string>();
    Object.values(layout.starters || {}).forEach((id) => {
      if (id) inStarters.add(id);
    });
    return players.filter((p) => !inStarters.has(p.id) || p.id === currentId);
  };

  const getAvailablePlayers = (currentId: string | null) => {
    return players.filter((p) => !usedCardPlayerIds.has(p.id) || p.id === currentId);
  };

  const colorOptions = useMemo(() => {
    return [
      { name: "赤", value: "bg-rose-300" },
      { name: "青", value: "bg-blue-300" },
      { name: "緑", value: "bg-green-300" },
      { name: "オレンジ", value: "bg-orange-300" },
      { name: "紫", value: "bg-purple-300" },
      { name: "黄色", value: "bg-yellow-300" },
      { name: "灰色", value: "bg-gray-300" },
      { name: "ピンク", value: "bg-pink-300" },
    ];
  }, []);

  const getPositionColor = (position: string) => {
    const pos = (position || "").toUpperCase();
    const pc = (layout as any).positionColors || (createEmptyLayout() as any).positionColors;
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


  const clubUid = ownerUid || user?.uid || null;

  const [staffList, setStaffList] = useState<StaffDoc[]>([]);

  useEffect(() => {
    const run = async () => {
      if (!clubUid || !teamId) {
        setStaffList([]);
        return;
      }
      try {
        const snap = await getDocs(collection(db, `clubs/${clubUid}/teams/${teamId}/staff`));
        const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as StaffDoc));
        setStaffList(list);
      } catch (e) {
        console.warn("[A3Editor] failed to load staff list", e);
        setStaffList([]);
      }
    };
    void run();
  }, [clubUid, teamId]);

  const { competitionNames } = useLeagueCompetitions(clubUid);

  const lastSeasonForCups = useMemo(() => {
    const s = String(season || "").trim();
    const m = s.match(/^(\d{4})([-/])(\d{2}|\d{4})$/);
    if (!m) return null;
    const start = Number(m[1]);
    const delim = m[2];
    const endRaw = m[3];
    if (!Number.isFinite(start)) return null;
    const prevStart = start - 1;
    if (endRaw.length === 4) {
      const prevEnd4 = String(prevStart + 1);
      return `${prevStart}${delim}${prevEnd4}`;
    }
    const prevEnd2 = String((prevStart + 1) % 100).padStart(2, "0");
    return `${prevStart}${delim}${prevEnd2}`;
  }, [season]);

  const { competitionNames: cupCompetitionNames } = useLeagueCompetitions(clubUid, {
    season: lastSeasonForCups,
    formats: ["cup", "league_cup"],
  });
  const seasonsForStats = useMemo(() => last5Seasons(season), [season]);
  const { leagueStats } = useLeagueStats({
    clubUid,
    teamId,
    leagueCompetitionName: layout.leagueCompetitionName,
    seasons: seasonsForStats,
  });

  const setExtraAt = (index: number, playerId: string | null) => {
    setLayout((prev) => {
      const next = [...prev.extras];
      while (next.length < 5) next.push("");

      const v = (playerId || "").trim();
      const prevId = String(next[index] || "").trim();

      // remove duplicates
      const deduped = next.map((x, i) => {
        const s = String(x || "").trim();
        if (!s) return "";
        if (i !== index && s === v && v) return "";
        return s;
      });

      deduped[index] = v;

      const normalized = deduped.filter((x) => String(x || "").trim().length > 0).slice(0, 5);
      return { ...prev, extras: normalized };
    });
  };

  const stats: StatRow[] = leagueStats.length > 0 ? leagueStats : last5Seasons(season).map((s) => ({ season: s, league: "-", rank: "-" }));

  const transfers: TransferRow[] = [];

  const coach: CoachInfo = {
    name: "監督名",
    bio: "監督の紹介文（モックアップ）。後でFirestoreから流し込めるように差し替え予定。",
  };

  const handleAssignTo = (slot: SlotKey, playerId: string | null) => {
    setLayout((prev) => ({
      ...prev,
      slots: {
        ...prev.slots,
        [slot]: playerId,
      },
    }));
  };

  const handleClear = (slot: SlotKey) => {
    setLayout((prev) => ({
      ...prev,
      slots: {
        ...prev.slots,
        [slot]: null,
      },
    }));
  };

  const handleClearAll = () => {
    setLayout(createEmptyLayout());
  };

  if (!isPro) {
    return <ProPlanNotice />;
  }

  return (
    <div className="text-gray-900">
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/admin/teams/${encodeURIComponent(teamId)}/booklet?season=${encodeURIComponent(season)}`}
            className="px-3 py-2 rounded-md bg-gray-700 text-white text-sm font-semibold"
          >
            名鑑へ戻る
          </Link>
          <Link
            href={`/admin/teams/${encodeURIComponent(teamId)}/booklet/a3/print?season=${encodeURIComponent(season)}`}
            className="px-3 py-2 rounded-md bg-emerald-600 text-white text-sm font-semibold"
          >
            印刷プレビュー
          </Link>
        </div>
        <button
          type="button"
          onClick={handleClearAll}
          className="px-3 py-2 rounded-md bg-white text-gray-900 text-sm font-semibold border border-gray-300"
        >
          全クリア
        </button>
      </div>

      <div className="mb-4">
        <h1 className="text-2xl font-bold">A3 選手名鑑（配置編集）</h1>
        <div className="text-sm text-muted-foreground">
          {data?.club?.clubName || ""} / {data?.teamName || ""} / {season}
        </div>
        <div className="mt-2 text-xs text-muted-foreground">
          変更内容は自動保存されます。大会（リーグ）は右下プレビュー内で選択します。
          {layout.leagueCompetitionName ? `（選択中: ${layout.leagueCompetitionName}）` : ""}
        </div>
      </div>

      {loading && <div className="text-sm text-muted-foreground">読み込み中...</div>}
      {error && <div className="text-sm text-red-600">{error}</div>}

      {!loading && !error && data ? (
        <div className="grid grid-cols-1 gap-6">
          <div className="border rounded-lg bg-white p-4">
            <div className="text-sm font-semibold mb-3">紹介文</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="text-xs text-gray-700 block">
                <div className="font-semibold mb-1">タイトル</div>
                <input
                  className="w-full border border-gray-300 rounded-md px-2 py-1 text-sm"
                  value={layout.bioTitle || ""}
                  onChange={(e) =>
                    setLayout((prev) => ({
                      ...prev,
                      bioTitle: String(e.target.value || ""),
                    }))
                  }
                  placeholder="例：今季の目標"
                />
              </label>
              <label className="text-xs text-gray-700 block">
                <div className="font-semibold mb-1">本文</div>
                <textarea
                  className="w-full border border-gray-300 rounded-md px-2 py-1 text-sm min-h-[92px]"
                  value={layout.bioBody || ""}
                  onChange={(e) =>
                    setLayout((prev) => ({
                      ...prev,
                      bioBody: String(e.target.value || ""),
                    }))
                  }
                  placeholder="チームの特徴や今季の目標など"
                />
              </label>
            </div>
          </div>

          <div className="border rounded-lg bg-white p-4">
            <div className="text-sm font-semibold mb-3">配置（A3横・概略）</div>

            <div className="mb-4 rounded-md border bg-white p-3">
              <div className="text-sm font-semibold text-gray-900 mb-2">フォーメーション</div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="space-y-3">
                  <label className="text-xs text-gray-700 block">
                    <div className="font-semibold mb-1">フォーメーション選択</div>
                    <select
                      className="w-full border border-gray-300 rounded-md px-2 py-1 text-sm"
                      value={formation.name}
                      onChange={(e) => {
                        const nextFormationName = String(e.target.value || "").trim();
                        const nextFormation = formations.find((f) => f.name === nextFormationName) || formations[0];

                        setLayout((prev) => {
                          const prevStarters = prev.starters || {};

                          // keep selected players, but remap them to the new formation's position ids
                          const selectedIds = Object.values(prevStarters)
                            .map((v) => String(v || "").trim())
                            .filter((v) => !!v);

                          const uniqSelected: string[] = [];
                          for (const id of selectedIds) {
                            if (!uniqSelected.includes(id)) uniqSelected.push(id);
                          }

                          const nextStarters: Record<string, string | null> = {};
                          const used = new Set<string>();

                          // If some position ids are shared across formations, keep those assignments first
                          for (const pos of nextFormation.positions) {
                            const existing = String(prevStarters[pos.id] || "").trim();
                            if (existing && !used.has(existing)) {
                              nextStarters[pos.id] = existing;
                              used.add(existing);
                            }
                          }

                          // Fill remaining positions with the remaining selected players
                          let poolIndex = 0;
                          for (const pos of nextFormation.positions) {
                            if (nextStarters[pos.id]) continue;
                            while (poolIndex < uniqSelected.length && used.has(uniqSelected[poolIndex])) poolIndex++;
                            if (poolIndex < uniqSelected.length) {
                              nextStarters[pos.id] = uniqSelected[poolIndex];
                              used.add(uniqSelected[poolIndex]);
                              poolIndex++;
                            } else {
                              nextStarters[pos.id] = null;
                            }
                          }

                          return {
                            ...prev,
                            formationName: nextFormationName,
                            starters: nextStarters,
                          };
                        });
                      }}
                    >
                      {formations.map((f) => (
                        <option key={f.name} value={f.name}>
                          {f.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="text-xs text-gray-600">
                    <div className="font-semibold mb-1">ポジション選択（〇をクリック）</div>
                    <div className="relative w-full aspect-[16/10] rounded-md overflow-hidden bg-emerald-700 border border-emerald-800">
                      <svg viewBox="0 0 100 60" className="absolute inset-0 w-full h-full">
                        <rect x="2" y="2" width="96" height="56" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="1" />
                        <line x1="2" y1="30" x2="98" y2="30" stroke="rgba(255,255,255,0.85)" strokeWidth="1" />
                        <circle cx="50" cy="30" r="6" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="1" />
                        <rect x="38" y="2" width="24" height="10" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="1" />
                        <rect x="42" y="2" width="16" height="5" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="1" />
                        <rect x="38" y="48" width="24" height="10" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="1" />
                        <rect x="42" y="53" width="16" height="5" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="1" />
                      </svg>

                      {formation.positions.map((pos) => {
                        const isActive = activeFormationPosId === pos.id;
                        const x = padPitchCoord(pos.coordinates.x);
                        const y = padPitchCoord(pos.coordinates.y);
                        return (
                          <button
                            key={pos.id}
                            type="button"
                            onClick={() => setActiveFormationPosId(pos.id)}
                            className={
                              "absolute -translate-x-1/2 -translate-y-1/2 rounded-full border text-[10px] font-semibold px-2 py-1 transition-all " +
                              (isActive
                                ? "bg-amber-300 text-emerald-950 border-amber-200 shadow-lg ring-4 ring-white/80 scale-110"
                                : "bg-white/90 text-emerald-900 border-white/80 shadow-sm hover:scale-105")
                            }
                            style={{ left: `${100 - x}%`, top: `${100 - y}%` }}
                          >
                            {pos.label}
                          </button>
                        );
                      })}
                    </div>
                    <div className="mt-2 text-[11px] text-gray-500">
                      選択中: {formation.positions.find((p) => p.id === activeFormationPosId)?.label || "-"}
                    </div>
                  </div>

                  <div className="rounded-md border bg-white p-3">
                    <div className="text-xs font-semibold text-gray-700 mb-2">割当（選択中）</div>
                    {(() => {
                      const pos = formation.positions.find((p) => p.id === activeFormationPosId) || null;
                      if (!pos) return <div className="text-[11px] text-gray-500">ポジションがありません</div>;
                      const currentId = (layout.starters || {})[pos.id] || null;
                      return (
                        <label className="flex items-center gap-2">
                          <span className="w-10 text-[11px] font-semibold text-gray-700">{pos.label}</span>
                          <select
                            className="flex-1 border border-gray-300 rounded-md px-2 py-1 text-[11px]"
                            value={currentId || ""}
                            onChange={(e) => {
                              const v = String(e.target.value || "").trim();
                              setLayout((prev) => ({
                                ...prev,
                                starters: {
                                  ...(prev.starters || {}),
                                  [pos.id]: v || null,
                                },
                              }));
                            }}
                          >
                            <option value="">未設定</option>
                            {getAvailableStarters(currentId).map((p) => (
                              <option key={p.id} value={p.id}>
                                {(p.number != null ? String(p.number) : "-") + " " + p.name}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            className="px-2 py-1 rounded-md border border-gray-300 text-[11px] font-semibold text-gray-700"
                            onClick={() =>
                              setLayout((prev) => ({
                                ...prev,
                                starters: {
                                  ...(prev.starters || {}),
                                  [pos.id]: null,
                                },
                              }))
                            }
                          >
                            クリア
                          </button>
                        </label>
                      );
                    })()}
                  </div>
                </div>

                <div className="md:col-span-2 text-xs text-gray-600">
                  <div className="font-semibold mb-1">先発11人（選択中ポジションに割当）</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {formation.positions.map((pos) => {
                      const currentId = (layout.starters || {})[pos.id] || null;
                      const player = currentId ? playersById.get(currentId) || null : null;
                      const isActive = activeFormationPosId === pos.id;
                      return (
                        <button
                          key={pos.id}
                          type="button"
                          onClick={() => setActiveFormationPosId(pos.id)}
                          className={
                            "flex items-center justify-between gap-2 rounded-md border px-2 py-2 text-left transition-colors " +
                            (isActive ? "border-amber-500 bg-amber-50 ring-2 ring-amber-200" : "border-gray-200 bg-white hover:bg-gray-50")
                          }
                        >
                          <span className="w-10 text-[11px] font-semibold text-gray-700">{pos.label}</span>
                          <span className="flex-1 text-[11px] text-gray-700 truncate">
                            {player ? `${player.number != null ? String(player.number) : "-"} ${player.name}` : "未設定"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-md border bg-white p-3 mt-4">
              <div className="text-xs font-semibold text-gray-700 mb-2">帯の色（ポジション別）</div>
              <div className="grid grid-cols-2 gap-2">
                {([
                  ["GK", (layout as any).positionColors?.GK],
                  ["DF", (layout as any).positionColors?.DF],
                  ["MF", (layout as any).positionColors?.MF],
                  ["FW", (layout as any).positionColors?.FW],
                ] as Array<["GK" | "DF" | "MF" | "FW", string]>).map(([k, v]) => (
                  <label key={k} className="flex items-center gap-2">
                    <span className="w-10 text-[11px] font-semibold text-gray-700">{k}</span>
                    <select
                      className="flex-1 border border-gray-300 rounded-md px-2 py-1 text-[11px]"
                      value={v || (createEmptyLayout() as any).positionColors[k]}
                      onChange={(e) =>
                        setLayout((prev) => ({
                          ...prev,
                          positionColors: {
                            ...(prev as any).positionColors,
                            [k]: e.target.value,
                          },
                        }))
                      }
                    >
                      {colorOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.name}
                        </option>
                      ))}
                    </select>
                    <div className={`w-5 h-5 rounded ${v || (createEmptyLayout() as any).positionColors[k]}`} />
                  </label>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="relative rounded-md border bg-gray-50 p-3 min-h-[360px] md:min-h-[520px]">
                <div className="text-xs font-semibold text-gray-600 mb-2">左側（下から3×4 / 12枚）</div>
                <div className="mt-3 md:absolute md:left-3 md:right-3 md:bottom-3">
                  <div className="grid grid-cols-3 gap-2">
                    {Array.from({ length: 12 }).map((_, i) => {
                      const key = `l${i}` as SlotKey;
                      const pid = layout.slots[key];
                      const player = pid ? playersById.get(pid) || null : null;
                      const pos = player?.mainPosition || player?.position || "";
                      return (
                        <SlotButton
                          key={key}
                          active={activeSlot === key}
                          label={`L${i + 1}`}
                          player={player}
                          positionColorClass={getPositionColor(pos)}
                          options={getAvailablePlayers(pid || null)}
                          onClick={() => setActiveSlot(key)}
                          onAssign={(playerId) => handleAssignTo(key, playerId)}
                          onClear={() => handleClear(key)}
                        />
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="relative rounded-md border bg-gray-50 p-3 min-h-[360px] md:min-h-[520px]">
                <div className="text-xs font-semibold text-gray-600 mb-2">右側（上から3×4 / 12枠）</div>
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-2">
                    {Array.from({ length: 12 }).map((_, i) => {
                      const key = `r${i}` as SlotKey;
                      const pid = layout.slots[key];
                      const player = pid ? playersById.get(pid) || null : null;
                      const pos = player?.mainPosition || player?.position || "";
                      return (
                        <SlotButton
                          key={key}
                          active={activeSlot === key}
                          label={`R${i + 1}`}
                          player={player}
                          positionColorClass={getPositionColor(pos)}
                          options={getAvailablePlayers(pid || null)}
                          onClick={() => setActiveSlot(key)}
                          onAssign={(playerId) => handleAssignTo(key, playerId)}
                          onClear={() => handleClear(key)}
                        />
                      );
                    })}
                  </div>

                  <div className="rounded-md border bg-white p-3">
                    <div className="text-xs font-semibold text-gray-700 mb-2">追加選手（最大5名）</div>
                    <div className="grid grid-cols-5 gap-2">
                      {Array.from({ length: 5 }).map((_, i) => {
                        const pid = layout.extras[i] || null;
                        const player = pid ? playersById.get(pid) || null : null;
                        const key = `e${i}` as ActiveKey;
                        const pos = player?.mainPosition || player?.position || "";
                        return (
                          <SlotButton
                            key={key}
                            active={activeSlot === key}
                            label={`E${i + 1}`}
                            player={player}
                            positionColorClass={getPositionColor(pos)}
                            options={getAvailablePlayers(pid)}
                            onClick={() => setActiveSlot(key)}
                            onAssign={(playerId) => setExtraAt(i, playerId)}
                            onClear={() => setExtraAt(i, null)}
                          />
                        );
                      })}
                    </div>
                  </div>

                  <div className="rounded-md border bg-white p-3">
                    <div className="text-xs font-semibold text-gray-700 mb-2">監督（スタッフから選択）</div>
                    <select
                      className="w-full border border-gray-300 rounded-md px-2 py-1 text-sm"
                      value={layout.coachStaffId || ""}
                      onChange={(e) => {
                        const v = String(e.target.value || "").trim();
                        setLayout((prev) => ({
                          ...prev,
                          coachStaffId: v ? v : null,
                        }));
                      }}
                    >
                      <option value="">自動（position=監督を優先）</option>
                      {(() => {
                        const seasonRaw = String(season || "").trim();
                        const seasonLabel = toCompetitionSeasonLabel(seasonRaw) || seasonRaw;
                        const published = (s: StaffDoc) => s.isPublished !== false;
                        const inSeason = (s: StaffDoc) => {
                          const arr = Array.isArray(s.seasons) ? s.seasons : [];
                          if (!seasonLabel) return true;
                          return arr.includes(seasonLabel) || arr.includes(seasonRaw);
                        };
                        const list = staffList
                          .filter((s) => published(s))
                          .sort((a, b) => {
                            const as = inSeason(a) ? 0 : 1;
                            const bs = inSeason(b) ? 0 : 1;
                            if (as !== bs) return as - bs;
                            return String(a.name || "").localeCompare(String(b.name || ""));
                          });
                        return list.map((s) => (
                          <option key={s.id} value={s.id}>
                            {String(s.name || "-")}
                            {String(s.position || "").trim() ? `（${String(s.position || "").trim()}）` : ""}
                          </option>
                        ));
                      })()}
                    </select>
                  </div>

                  <PreviewPanel
                    leagueCompetitionName={layout.leagueCompetitionName}
                    competitionNames={competitionNames}
                    onLeagueCompetitionNameChange={(next) =>
                      setLayout((prev) => ({
                        ...prev,
                        leagueCompetitionName: next,
                      }))
                    }
                    stats={stats}
                    cupCompetitionNames={cupCompetitionNames}
                    cups={layout.cups}
                    onCupsChange={(next) =>
                      setLayout((prev) => ({
                        ...prev,
                        cups: next,
                      }))
                    }
                    transfers={transfers}
                    coach={coach}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
