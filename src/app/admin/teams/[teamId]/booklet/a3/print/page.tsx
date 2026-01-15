"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/firebase";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import type { BookletResponse } from "../../types";
import { BookletGlobalStyles } from "../../components/BookletGlobalStyles";
import { ProPlanNotice } from "../../components/ProPlanNotice";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { PrintPageLayout } from "./components/PrintPageLayout";

type StatRow = {
  season: string;
  league: string;
  rank: string;
};

type TransferRow = {
  date: string;
  playerName: string;
  type: string;
  fromTo: string;
};

type CupRow = {
  tournament: string;
  result: string;
};

type CoachInfo = {
  name: string;
  photoUrl: string | null;
  bio: string;
};

type SlotKey = `l${number}` | `r${number}`;

type LayoutState = {
  slots: Record<SlotKey, string | null>;
  extras: string[];
  leagueCompetitionName: string | null;
  cups: CupRow[];
};

function createEmptyLayout(): LayoutState {
  const slots: Record<string, string | null> = {};
  for (let i = 0; i < 9; i++) slots[`l${i}`] = null;
  for (let i = 0; i < 15; i++) slots[`r${i}`] = null;
  return {
    slots: slots as LayoutState["slots"],
    extras: [],
    leagueCompetitionName: null,
    cups: Array.from({ length: 2 }).map(() => ({ tournament: "", result: "" })),
  };
}

function toCompetitionSeasonLabel(season: string): string | null {
  const s = String(season || "").trim();
  const m = s.match(/^(\d{4})[-/](\d{2})$/);
  if (!m) return null;
  return `${m[1]}/${m[2]}`;
}

function last5Seasons(season: string): string[] {
  const label = toCompetitionSeasonLabel(season);
  if (!label) return [];
  const m = label.match(/^(\d{4})\/(\d{2})$/);
  if (!m) return [];
  const start = Number(m[1]);
  if (!Number.isFinite(start)) return [];
  const out: string[] = [];
  for (let i = 0; i < 5; i++) {
    const y = start - i;
    const end2 = String((y + 1) % 100).padStart(2, "0");
    out.push(`${y}/${end2}`);
  }
  return out;
}

function isLayoutEmpty(layout: LayoutState): boolean {
  const values = Object.values(layout.slots);
  const slotsEmpty = values.every((v) => !v);
  const extrasEmpty = !Array.isArray(layout.extras) || layout.extras.length === 0;
  const leagueEmpty = !(typeof layout.leagueCompetitionName === "string" && layout.leagueCompetitionName.trim().length > 0);
  const cupsEmpty =
    !Array.isArray(layout.cups) ||
    layout.cups.length === 0 ||
    layout.cups.every((c) => !String(c?.tournament || "").trim() && !String(c?.result || "").trim());
  return slotsEmpty && extrasEmpty && leagueEmpty && cupsEmpty;
}

function createDefaultLayout(playerIds: string[], seed?: Pick<LayoutState, "extras" | "leagueCompetitionName" | "cups">): LayoutState {
  const base = createEmptyLayout();
  for (let i = 0; i < 15; i++) base.slots[`r${i}` as SlotKey] = playerIds[i] ?? null;
  for (let i = 0; i < 9; i++) base.slots[`l${i}` as SlotKey] = playerIds[15 + i] ?? null;
  if (seed) {
    base.extras = Array.isArray(seed.extras) ? seed.extras.slice(0, 5) : [];
    base.leagueCompetitionName = seed.leagueCompetitionName || null;
    base.cups = Array.isArray(seed.cups) ? seed.cups.slice(0, base.cups.length) : base.cups;
  }
  return base;
}

export default function TeamBookletA3PrintPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const teamId = params.teamId as string;
  const season = (searchParams.get("season") || "").trim();

  const { user } = useAuth();
  const isPro = user?.plan === "pro";

  const [data, setData] = useState<BookletResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    const m = new Map<string, (typeof players)[number]>();
    for (const p of players) m.set(p.id, p);
    return m;
  }, [players]);

  const [layout, setLayout] = useState<LayoutState>(() => createEmptyLayout());
  const [layoutSource, setLayoutSource] = useState<"saved" | "default">("default");

  const layoutStorageKey = useMemo(() => {
    if (!teamId || !season) return "";
    return `booklet_a3_layout_${teamId}_${season}`;
  }, [teamId, season]);

  useEffect(() => {
    if (!layoutStorageKey) return;
    const saved = localStorage.getItem(layoutStorageKey);
    if (!saved) {
      setLayout(createEmptyLayout());
      setLayoutSource("default");
      return;
    }
    try {
      const parsed = JSON.parse(saved) as LayoutState;
      if (!parsed || typeof parsed !== "object" || !parsed.slots || typeof parsed.slots !== "object") {
        setLayout(createEmptyLayout());
        setLayoutSource("default");
        return;
      }
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
        cups: (() => {
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
        })(),
      });
      setLayoutSource("saved");
    } catch {
      setLayout(createEmptyLayout());
      setLayoutSource("default");
    }
  }, [layoutStorageKey]);

  const resolvedLayout = useMemo(() => {
    if (layoutSource === "saved" && !isLayoutEmpty(layout)) return layout;
    return createDefaultLayout(players.map((p) => p.id), {
      extras: layout.extras,
      leagueCompetitionName: layout.leagueCompetitionName,
      cups: layout.cups,
    });
  }, [layout, layoutSource, players]);

  const rightCards = useMemo(() => {
    return Array.from({ length: 15 }).map((_, i) => {
      const pid = resolvedLayout.slots[`r${i}` as SlotKey];
      if (!pid) return null;
      return playersById.get(pid) || null;
    });
  }, [playersById, resolvedLayout]);

  const leftCards = useMemo(() => {
    return Array.from({ length: 9 }).map((_, i) => {
      const pid = resolvedLayout.slots[`l${i}` as SlotKey];
      if (!pid) return null;
      return playersById.get(pid) || null;
    });
  }, [playersById, resolvedLayout]);

  const additionalPlayers = useMemo(() => {
    const ids = Array.isArray(resolvedLayout.extras) ? resolvedLayout.extras : [];
    return Array.from({ length: 5 }).map((_, i) => {
      const id = String(ids[i] || "").trim();
      if (!id) return null;
      return playersById.get(id) || null;
    });
  }, [playersById, resolvedLayout.extras]);

  const clubUid = (user as any)?.ownerUid || user?.uid || null;
  const [leagueStats, setLeagueStats] = useState<StatRow[]>([]);

  useEffect(() => {
    const run = async () => {
      const name = resolvedLayout.leagueCompetitionName;
      const seasons = last5Seasons(season);
      if (!clubUid || !teamId || !name || seasons.length === 0) {
        setLeagueStats([]);
        return;
      }
      try {
        const compsSnap = await getDocs(
          query(collection(db, `clubs/${clubUid}/competitions`), where("name", "==", name))
        );
        const bySeason = new Map<string, { id: string; name: string; season: string }>();
        for (const d of compsSnap.docs) {
          const data = d.data() as any;
          const s = typeof data?.season === "string" ? String(data.season).trim() : "";
          if (!s || !seasons.includes(s)) continue;
          bySeason.set(s, { id: d.id, name, season: s });
        }

        const rows: StatRow[] = [];
        for (const s of seasons) {
          const comp = bySeason.get(s);
          if (!comp) {
            rows.push({ season: s, league: name, rank: "-" });
            continue;
          }
          const standingRef = doc(db, `clubs/${clubUid}/competitions/${comp.id}/standings`, teamId);
          const standingSnap = await getDoc(standingRef);
          const st = standingSnap.exists() ? (standingSnap.data() as any) : null;
          const rank = typeof st?.rank === "number" ? String(st.rank) : "-";
          rows.push({ season: s, league: name, rank });
        }
        setLeagueStats(rows);
      } catch (e) {
        console.warn("[A3Print] failed to load league standings", e);
        setLeagueStats([]);
      }
    };
    void run();
  }, [clubUid, resolvedLayout.leagueCompetitionName, season, teamId]);

  const teamBio = "チームの特徴や今季の目標、監督コメントなどを掲載するスペースです。";

  const stats: StatRow[] = leagueStats.length > 0 ? leagueStats : last5Seasons(season).map((s) => ({ season: s, league: "-", rank: "-" }));

  const cups: CupRow[] = Array.isArray(resolvedLayout.cups) ? resolvedLayout.cups : createEmptyLayout().cups;

  const transfers: TransferRow[] = [
    { date: "-", playerName: "-", type: "加入", fromTo: "-" },
    { date: "-", playerName: "-", type: "退団", fromTo: "-" },
    { date: "-", playerName: "-", type: "レンタル", fromTo: "-" },
  ];

  const coach: CoachInfo = {
    name: "監督名",
    photoUrl: null,
    bio: "監督の紹介文（モックアップ）。後でFirestoreから流し込めるように差し替え予定。",
  };

  if (!isPro) {
    return <ProPlanNotice />;
  }

  return (
    <div className="text-gray-900">
      <BookletGlobalStyles paper="a3_landscape" />

      <div className="no-print mb-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold truncate">選手名鑑（A3）</h1>
          <p className="text-sm text-muted-foreground truncate">
            {data?.club?.clubName || ""} / {data?.teamName || ""} / {season}
          </p>
          <p className="text-xs text-muted-foreground truncate">
            配置: {layoutSource === "saved" && !isLayoutEmpty(layout) ? "保存済み" : "未保存（自動配置）"}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Link
            href={`/admin/teams/${encodeURIComponent(teamId)}/booklet/a3?season=${encodeURIComponent(season)}`}
            className="px-3 py-2 rounded-md bg-gray-700 text-white text-sm font-semibold"
          >
            配置編集へ戻る
          </Link>
          <Link
            href={`/admin/teams/${encodeURIComponent(teamId)}/booklet?season=${encodeURIComponent(season)}`}
            className="px-3 py-2 rounded-md bg-gray-700 text-white text-sm font-semibold"
          >
            名鑑へ戻る
          </Link>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-3 py-2 rounded-md bg-slate-700 text-white text-sm font-semibold"
          >
            最新を読み込み
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="px-3 py-2 rounded-md bg-emerald-600 text-white text-sm font-semibold"
            disabled={loading || !data}
          >
            印刷
          </button>
        </div>
      </div>

      {loading && <div className="no-print text-sm text-muted-foreground">読み込み中...</div>}
      {error && <div className="no-print text-sm text-red-600">{error}</div>}

      {data ? (
        <PrintPageLayout
          teamName={data.teamName}
          season={season}
          logoUrl={data.club.logoUrl}
          teamBio={teamBio}
          formationPlayers={[...rightCards, ...leftCards]
            .filter((p): p is BookletResponse["players"][number] => !!p)
            .map((p) => ({ name: p.name, photoUrl: p.photoUrl }))}
          leftCards={leftCards}
          rightCards={rightCards}
          additionalPlayers={additionalPlayers}
          stats={stats}
          cups={cups}
          transfers={transfers}
          coach={coach}
        />
      ) : null}
    </div>
  );
}
