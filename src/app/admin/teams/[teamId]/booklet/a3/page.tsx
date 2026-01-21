"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import type { BookletPlayer } from "../types";
import { createEmptyLayout, last5Seasons } from "./lib/a3-layout";
import { useLeagueCompetitions } from "./hooks/useLeagueCompetitions";
import { useLeagueStats } from "./hooks/useLeagueStats";
import { formations } from "@/lib/formations";
import { useBookletData } from "./hooks/useBookletData";
import { useStaffList } from "./hooks/useStaffList";
import { A3EditorView } from "./components/A3EditorView";
import type { ActiveKey, CoachInfo, LayoutState, SlotKey, StatRow, TransferRow } from "./types";

export function A3Editor({
  teamId,
  season,
  embedded,
}: {
  teamId: string;
  season: string;
  embedded?: boolean;
}) {

  const { user, ownerUid } = useAuth();
  const isPro = user?.plan === "pro";

  const { data, loading, error } = useBookletData(teamId, season);

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

  const { staffList } = useStaffList(clubUid, teamId);

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

  return (
    <A3EditorView
      isPro={!!isPro}
      embedded={!!embedded}
      teamId={teamId}
      season={season}
      data={data}
      loading={loading}
      error={error}
      layout={layout}
      setLayout={setLayout}
      activeSlot={activeSlot}
      setActiveSlot={setActiveSlot}
      activeFormationPosId={activeFormationPosId}
      setActiveFormationPosId={setActiveFormationPosId}
      players={players}
      playersById={playersById}
      usedCardPlayerIds={usedCardPlayerIds}
      formation={formation}
      padPitchCoord={padPitchCoord}
      getAvailableStarters={getAvailableStarters}
      colorOptions={colorOptions}
      getPositionColor={getPositionColor}
      staffList={staffList}
      competitionNames={competitionNames}
      cupCompetitionNames={cupCompetitionNames}
      stats={stats}
      transfers={transfers}
      coach={coach}
      handleAssignTo={handleAssignTo}
      handleClear={handleClear}
      handleClearAll={handleClearAll}
      setExtraAt={setExtraAt}
    />
  );
}

export default function TeamBookletA3EditorPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const teamId = params.teamId as string;
  const season = (searchParams.get("season") || "").trim();
  return <A3Editor teamId={teamId} season={season} />;
}
