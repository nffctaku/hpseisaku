"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import type { BookletPlayer, BookletResponse } from "../types";
import { ProPlanNotice } from "../components/ProPlanNotice";
import { SlotButton } from "./components/SlotButton";
import { PreviewPanel } from "./components/PreviewPanel";
import { createEmptyLayout, last5Seasons } from "./lib/a3-layout";
import { useLeagueCompetitions } from "./hooks/useLeagueCompetitions";
import { useLeagueStats } from "./hooks/useLeagueStats";

type SlotKey = `l${number}` | `r${number}`;

type ActiveKey = SlotKey | `e${number}`;

type LayoutState = {
  slots: Record<SlotKey, string | null>;
  extras: string[];
  leagueCompetitionName: string | null;
  cups: CupRow[];
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

  const { user } = useAuth();
  const isPro = user?.plan === "pro";

  const [data, setData] = useState<BookletResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const storageKey = useMemo(() => {
    if (!teamId || !season) return "";
    return `booklet_a3_layout_${teamId}_${season}`;
  }, [teamId, season]);

  const [layout, setLayout] = useState<LayoutState>(() => createEmptyLayout());
  const [activeSlot, setActiveSlot] = useState<ActiveKey>("r0");

  useEffect(() => {
    if (!storageKey) return;
    const saved = localStorage.getItem(storageKey);
    if (!saved) {
      setLayout(createEmptyLayout());
      return;
    }
    try {
      const parsed = JSON.parse(saved) as LayoutState;
      if (!parsed || typeof parsed !== "object" || !parsed.slots || typeof parsed.slots !== "object") {
        setLayout(createEmptyLayout());
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
        cups: normalizedCups,
      });
    } catch {
      setLayout(createEmptyLayout());
    }
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey) return;
    localStorage.setItem(storageKey, JSON.stringify(layout));
  }, [layout, storageKey]);

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

  const playersById = useMemo(() => {
    const m = new Map<string, BookletPlayer>();
    for (const p of players) m.set(p.id, p);
    return m;
  }, [players]);

  const usedPlayerIds = useMemo(() => {
    const selected = new Set<string>();
    Object.values(layout.slots).forEach((id) => {
      if (id) selected.add(id);
    });
    layout.extras.forEach((id) => {
      if (id) selected.add(id);
    });
    return selected;
  }, [layout.extras, layout.slots]);

  const getAvailablePlayers = (currentId: string | null) => {
    return players.filter((p) => !usedPlayerIds.has(p.id) || p.id === currentId);
  };


  const clubUid = (user as any)?.ownerUid || user?.uid || null;

  const { competitionNames } = useLeagueCompetitions(clubUid);

  const lastSeasonForCups = useMemo(() => {
    const s = String(season || "").trim();
    const m = s.match(/^(\d{4})[-/](\d{2})$/);
    if (!m) return null;
    const start = Number(m[1]);
    if (!Number.isFinite(start)) return null;
    const prevStart = start - 1;
    const prevEnd2 = String((prevStart + 1) % 100).padStart(2, "0");
    return `${prevStart}/${prevEnd2}`;
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

  const transfers: TransferRow[] = [
    { date: "-", playerName: "-", type: "IN", fromTo: "-" },
    { date: "-", playerName: "-", type: "OUT", fromTo: "-" },
    { date: "-", playerName: "-", type: "レンタル", fromTo: "-" },
  ];

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
            <div className="text-sm font-semibold mb-3">配置（A3横・概略）</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="relative rounded-md border bg-gray-50 p-3 min-h-[360px] md:min-h-[520px]">
                <div className="text-xs font-semibold text-gray-600 mb-2">左側（下から3×3 / 9枚）</div>
                <div className="absolute left-3 right-3 bottom-3">
                  <div className="grid grid-cols-3 gap-2">
                    {Array.from({ length: 9 }).map((_, i) => {
                      const key = `l${i}` as SlotKey;
                      const pid = layout.slots[key];
                      const player = pid ? playersById.get(pid) || null : null;
                      return (
                        <SlotButton
                          key={key}
                          active={activeSlot === key}
                          label={`L${i + 1}`}
                          player={player}
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
                <div className="text-xs font-semibold text-gray-600 mb-2">右側（上から3×5 / 15枠）</div>
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-2">
                    {Array.from({ length: 15 }).map((_, i) => {
                      const key = `r${i}` as SlotKey;
                      const pid = layout.slots[key];
                      const player = pid ? playersById.get(pid) || null : null;
                      return (
                        <SlotButton
                          key={key}
                          active={activeSlot === key}
                          label={`R${i + 1}`}
                          player={player}
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
                        const key = `e${i}`;
                        return (
                          <SlotButton
                            key={key}
                            active={activeSlot === key}
                            label={`E${i + 1}`}
                            player={player}
                            options={getAvailablePlayers(pid)}
                            onClick={() => setActiveSlot(key)}
                            onAssign={(playerId) => setExtraAt(i, playerId)}
                            onClear={() => setExtraAt(i, null)}
                          />
                        );
                      })}
                    </div>
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
