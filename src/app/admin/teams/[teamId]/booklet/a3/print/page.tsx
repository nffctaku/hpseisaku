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
import { PrintPageLayout, type TransferRow } from "./components/PrintPageLayout";
import { formations } from "@/lib/formations";

type StatRow = {
  season: string;
  league: string;
  rank: string;
};

type TransferDoc = {
  id: string;
  season?: string;
  direction?: "in" | "out";
  kind?: string;
  position?: string;
  playerName?: string;
  counterparty?: string;
  createdAt?: any;
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

type StaffDoc = {
  id: string;
  name?: string;
  profile?: string;
  photoUrl?: string;
  position?: string;
  seasons?: string[];
  isPublished?: boolean;
};

type SlotKey = `l${number}` | `r${number}`;

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

function createEmptyLayout(): LayoutState {
  const slots: Record<string, string | null> = {};
  for (let i = 0; i < 12; i++) slots[`l${i}`] = null;
  for (let i = 0; i < 12; i++) slots[`r${i}`] = null;
  return {
    slots: slots as LayoutState["slots"],
    extras: [],
    leagueCompetitionName: null,
    bioTitle: "",
    bioBody: "",
    cups: Array.from({ length: 8 }).map(() => ({ tournament: "", result: "" })),
    formationName: "4-4-2",
    starters: {},
    positionColors: {
      GK: "bg-rose-300",
      DF: "bg-blue-300",
      MF: "bg-green-300",
      FW: "bg-orange-300",
    },
    coachStaffId: null,
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
  const startersEmpty =
    !layout.starters ||
    typeof layout.starters !== "object" ||
    Object.values(layout.starters).every((v) => !String(v || "").trim());
  const defaultFormation = createEmptyLayout().formationName;
  const formationEmpty = !String(layout.formationName || "").trim() || String(layout.formationName || "").trim() === defaultFormation;
  return slotsEmpty && extrasEmpty && leagueEmpty && cupsEmpty && startersEmpty && formationEmpty;
}

function createDefaultLayout(
  playerIds: string[],
  seed?: Pick<LayoutState, "extras" | "leagueCompetitionName" | "bioTitle" | "bioBody" | "cups" | "positionColors">
): LayoutState {
  const base = createEmptyLayout();
  for (let i = 0; i < 12; i++) base.slots[`r${i}` as SlotKey] = playerIds[i] ?? null;
  for (let i = 0; i < 12; i++) base.slots[`l${i}` as SlotKey] = playerIds[12 + i] ?? null;
  if (seed) {
    base.extras = Array.isArray(seed.extras) ? seed.extras.slice(0, 5) : [];
    base.leagueCompetitionName = seed.leagueCompetitionName || null;
    base.bioTitle = typeof seed.bioTitle === "string" ? seed.bioTitle : "";
    base.bioBody = typeof seed.bioBody === "string" ? seed.bioBody : "";
    base.cups = Array.isArray(seed.cups) ? seed.cups.slice(0, base.cups.length) : base.cups;
    base.positionColors = seed.positionColors || base.positionColors;
  }
  return base;
}

export default function TeamBookletA3PrintPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const teamId = params.teamId as string;
  const season = (searchParams.get("season") || "").trim();
  const embed = (searchParams.get("embed") || "").trim() === "1";

  const { user, ownerUid } = useAuth();
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
        bioTitle: typeof (parsed as any).bioTitle === "string" ? String((parsed as any).bioTitle) : "",
        bioBody: typeof (parsed as any).bioBody === "string" ? String((parsed as any).bioBody) : "",
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
      bioTitle: layout.bioTitle,
      bioBody: layout.bioBody,
      cups: layout.cups,
      positionColors: layout.positionColors,
    });
  }, [layout, layoutSource, players]);

  const getPositionColor = (position: string) => {
    const pos = (position || "").toUpperCase();
    const pc = (resolvedLayout as any).positionColors || (createEmptyLayout() as any).positionColors;
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

  const formation = useMemo(() => {
    const name = String(resolvedLayout.formationName || "").trim();
    return formations.find((f) => f.name === name) || formations[0];
  }, [resolvedLayout.formationName]);

  const formationStartersByPosition = useMemo(() => {
    const out: Record<string, { id: string; number: string; name: string; photoUrl?: string } | null> = {};
    for (const pos of formation.positions) {
      const pid = (resolvedLayout.starters || {})[pos.id] || null;
      if (!pid) {
        out[pos.id] = null;
        continue;
      }
      const p = playersById.get(pid) || null;
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
  }, [formation.positions, playersById, resolvedLayout.starters]);

  const rightCards = useMemo(() => {
    return Array.from({ length: 12 }).map((_, i) => {
      const pid = resolvedLayout.slots[`r${i}` as SlotKey];
      if (!pid) return null;
      return playersById.get(pid) || null;
    });
  }, [playersById, resolvedLayout]);

  const leftCards = useMemo(() => {
    return Array.from({ length: 12 }).map((_, i) => {
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

  const clubUid = ownerUid || user?.uid || null;
  const [coachFromStaff, setCoachFromStaff] = useState<CoachInfo | null>(null);
  const [transfersInFromDb, setTransfersInFromDb] = useState<TransferRow[]>([]);
  const [transfersOutFromDb, setTransfersOutFromDb] = useState<TransferRow[]>([]);
  const [previewScale, setPreviewScale] = useState(0.7);
  const [leagueStats, setLeagueStats] = useState<StatRow[]>([]);

  useEffect(() => {
    const run = async () => {
      if (!clubUid || !teamId) {
        setCoachFromStaff(null);
        return;
      }
      try {
        const snap = await getDocs(collection(db, `clubs/${clubUid}/teams/${teamId}/staff`));
        const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as StaffDoc));

        const seasonRaw = String(season || "").trim();
        const seasonLabel = toCompetitionSeasonLabel(seasonRaw) || seasonRaw;
        const inSeason = (s: StaffDoc) => {
          const arr = Array.isArray(s.seasons) ? s.seasons : [];
          return !seasonLabel ? true : arr.includes(seasonLabel) || arr.includes(seasonRaw);
        };
        const published = (s: StaffDoc) => s.isPublished !== false;
        const pos = (s: StaffDoc) => String(s.position || "").trim();

        const byId = (id: string) => list.find((s) => s.id === id) || null;

        const pick =
          (resolvedLayout.coachStaffId ? byId(resolvedLayout.coachStaffId) : null) ||
          list.find((s) => published(s) && inSeason(s) && pos(s) === "監督") ||
          list.find((s) => published(s) && pos(s) === "監督") ||
          list.find((s) => inSeason(s) && pos(s) === "監督") ||
          list.find((s) => pos(s) === "監督") ||
          null;

        if (!pick) {
          setCoachFromStaff(null);
          return;
        }

        setCoachFromStaff({
          name: String(pick.name || "").trim() || "監督",
          photoUrl: typeof pick.photoUrl === "string" && pick.photoUrl.trim() ? pick.photoUrl.trim() : null,
          bio: String(pick.profile || "").trim() || "監督の紹介文",
        });
      } catch (e) {
        console.warn("[A3Print] failed to load staff coach", e);
        setCoachFromStaff(null);
      }
    };
    void run();
  }, [clubUid, season, teamId]);

  useEffect(() => {
    const listIn = (data as any)?.transfersIn;
    const listOut = (data as any)?.transfersOut;

    const safeIn = Array.isArray(listIn) ? (listIn as any[]) : [];
    const safeOut = Array.isArray(listOut) ? (listOut as any[]) : [];

    const toRow = (t: any): TransferRow => ({
      position: String(t?.position || "").trim() || "-",
      playerName: String(t?.playerName || "").trim() || "-",
      type: String(t?.type || "").trim() || "完全",
      fromTo: String(t?.fromTo || "").trim() || "-",
    });

    setTransfersInFromDb(safeIn.map(toRow));
    setTransfersOutFromDb(safeOut.map(toRow));
  }, [data]);

  const previewScaleStorageKey = useMemo(() => {
    if (!clubUid || !teamId) return "";
    return `a3_print_preview_scale_${clubUid}_${teamId}`;
  }, [clubUid, teamId]);

  useEffect(() => {
    if (!previewScaleStorageKey) return;
    const raw = localStorage.getItem(previewScaleStorageKey);
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0.3 && n <= 1) {
      setPreviewScale(n);
    }
  }, [previewScaleStorageKey]);

  useEffect(() => {
    if (!previewScaleStorageKey) return;
    localStorage.setItem(previewScaleStorageKey, String(previewScale));
  }, [previewScale, previewScaleStorageKey]);

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
  const stats: StatRow[] = leagueStats.length > 0 ? leagueStats : last5Seasons(season).map((s) => ({ season: s, league: "-", rank: "-" }));

  const cups: CupRow[] = Array.isArray(resolvedLayout.cups) ? resolvedLayout.cups : createEmptyLayout().cups;

  const cups8 = useMemo(() => {
    const slice = cups.slice(0, 8);
    const padded = slice.concat(Array.from({ length: Math.max(0, 8 - slice.length) }).map(() => ({ tournament: "", result: "" })));
    return padded;
  }, [cups]);

  const transfersIn12 = useMemo(() => {
    const slice = transfersInFromDb.slice(0, 12);
    const padded = slice.concat(
      Array.from({ length: Math.max(0, 12 - slice.length) }).map(() => ({ position: "", playerName: "", type: "", fromTo: "" }))
    );
    return padded;
  }, [transfersInFromDb]);

  const transfersOut12 = useMemo(() => {
    const slice = transfersOutFromDb.slice(0, 12);
    const padded = slice.concat(
      Array.from({ length: Math.max(0, 12 - slice.length) }).map(() => ({ position: "", playerName: "", type: "", fromTo: "" }))
    );
    return padded;
  }, [transfersOutFromDb]);

  const coach: CoachInfo =
    coachFromStaff ||
    ({
      name: "監督名",
      photoUrl: null,
      bio: "監督の紹介文",
    } satisfies CoachInfo);

  if (!isPro) {
    return <ProPlanNotice />;
  }

  return (
    <div className="text-gray-900">
      <BookletGlobalStyles paper="a3_landscape" />

      {!embed ? (
        <>
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

          <div className="no-print mb-4 rounded-md border bg-white p-3 text-sm text-gray-900">
            <div className="grid grid-cols-1 gap-3">
              <label className="flex items-center gap-2">
                <input
                  type="range"
                  min={30}
                  max={100}
                  step={5}
                  value={Math.round(previewScale * 100)}
                  onChange={(e) => setPreviewScale(Math.max(0.3, Math.min(1, Number(e.target.value) / 100)))}
                  className="flex-1"
                />
                <span className="w-12 text-right text-xs tabular-nums text-gray-700">{Math.round(previewScale * 100)}%</span>
              </label>
            </div>
          </div>
        </>
      ) : null}

      {loading && <div className="no-print text-sm text-muted-foreground">読み込み中...</div>}
      {error && <div className="no-print text-sm text-red-600">{error}</div>}

      {data ? (
        <div className={embed ? "" : "overflow-x-auto"}>
          <div
            className={embed ? "inline-block" : "a3-preview-scale inline-block"}
            style={{
              transform: `scale(${previewScale})`,
              transformOrigin: "top left",
            }}
          >
            <PrintPageLayout
              teamName={data.teamName}
              season={season}
              logoUrl={data.club.logoUrl}
              bioTitle={String((resolvedLayout as any).bioTitle || "")}
              bioBody={String((resolvedLayout as any).bioBody || "")}
              formationPlayers={[...rightCards, ...leftCards]
                .filter((p): p is NonNullable<typeof p> => !!p)
                .map((p) => ({
                  id: p.id,
                  number: String((p as any).number ?? "-") || "-",
                  name: p.name || "-",
                  ...(p.photoUrl ? { photoUrl: p.photoUrl } : {}),
                }))}
              formationName={formation.name}
              formationStartersByPosition={formationStartersByPosition}
              leftCards={leftCards}
              rightCards={rightCards}
              additionalPlayers={additionalPlayers}
              getPositionColor={getPositionColor}
              stats={stats}
              cups={cups8}
              transfersIn={transfersIn12}
              transfersOut={transfersOut12}
              coach={coach}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
