"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { auth } from "@/lib/firebase";
import { Loader2, X, Info } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { ADMIN_UID } from "@/lib/admin-config";

const PAGE_SIZE = 30;

interface ClubItem {
  id: string;
  clubName: string;
  nameSet: boolean;
  logoUrl: string | null;
  publicUrl: string;
  publicSlug: string;
  ownerUid: string;
  email: string | null;
  clubCreatedAt: string | null;
  lastActivityAt: string | null;
  playerCount: number | null;
  playerImageCount: number | null;
  playerImageRate: number | null;
  mainTeamName: string | null;
  teamCount: number | null;
  teamImageCount: number | null;
  teamImageRate: number | null;
  competitionCount: number | null;
  matchCount: number | null;
  newsCount: number | null;
  isPaidPro: boolean;
  isGrantedPro: boolean;
  isFree: boolean;
  plan: string;
  analyticsCohort: string;
  isPublic: boolean;
  aggregateAvailable: boolean;
  aggregateUnavailableReason: string | null;
  usageLevel: number | null;
  active7: boolean;
  active30: boolean;
  engaged7: boolean;
  engaged30: boolean;
  matchActive7: boolean;
  matchActive30: boolean;
  duplicateProfileCount: number;
  authExists: boolean;
  allProfilePlans: string[];
  allStripeCustomerIds: string[];
  anyProPlan: boolean;
  anyStripeCustomer: boolean;
  lastActivityAtMillis: number;
  activeDetail: {
    eventAt: number;
    userAt: number;
    profileAt: number;
    adoptedAt: number;
  };
}

interface Summary {
  total: number;
  aggregatable: number;
  nameSet: number;
  nameUnset: number;
  nameUnsetRate: number;
  public: number;
  paidPro: number;
  grantedPro: number;
  totalPro: number;
  free: number;
  active7: number;
  active30: number;
  withMatches: number;
  matches10: number;
  matches50: number;
  matches100: number;
  withMatchesRate: number;
  matches10Rate: number;
  matches50Rate: number;
  matches100Rate: number;
  withPlayerImages10: number;
  withPlayerImages20: number;
  withTeamImages: number;
  withTeamImages5: number;
  withPlayerImages10Rate: number;
  withPlayerImages20Rate: number;
  withTeamImagesRate: number;
  withTeamImages5Rate: number;
  unavailableByReason: Record<string, number>;
  multiClubOwners: number;
  multiClubProfiles: number;
  avgClubsPerMultiOwner: number;
  maxClubsPerOwner: number;
  engaged7: number;
  engaged30: number;
  matchActive7: number;
  matchActive30: number;
  clubProfilesTotal: number;
  reducedDisplayRows: number;
}

interface FunnelSummary {
  total: number;
  hasProfile: number;
  isPaidPro: number;
  isGrantedPro: number;
  isFree: number;
  hasMatch: number;
  has10Matches: number;
  has50Matches: number;
  has100Matches: number;
  active7: number;
  active30: number;
  hasPlayerImage20: number;
  hasTeamImage: number;
}

interface FunnelRow {
  uid: string;
  email: string | null;
  hasProfile: boolean;
  hasMatch: boolean;
  has10Matches: boolean;
  has50Matches: boolean;
  has100Matches: boolean;
  hasPlayerImage20: boolean;
  hasTeamImage: boolean;
  active7: boolean;
  active30: boolean;
  isPaidPro: boolean;
  isGrantedPro: boolean;
  isFree: boolean;
  matchCount: number;
  subscriptionStatus: string | null;
  lastActivityAt: number;
  activeDetail: {
    eventAt: number;
    userAt: number;
    profileAt: number;
    adoptedAt: number;
  };
}

type SortKey =
  | "active"
  | "new"
  | "old"
  | "matches"
  | "players"
  | "competitions"
  | "usageHigh"
  | "usageLow";
type PlanFilter = "all" | "pro" | "free";
type PublicFilter = "all" | "public" | "private";
type CohortFilter = "all" | "tracked" | "pre_tracking";
type NameFilter = "all" | "unset";
type LevelFilter = "all" | "0" | "1" | "2" | "3" | "4" | "5" | "6";
type AggregateFilter =
  | "all"
  | "available"
  | "unavailable"
  | "multipleProfiles"
  | "noOwnerUid"
  | "profileMappingFailed"
  | "dataStructureUnsupported"
  | "unknown";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("ja-JP");
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("ja-JP");
}

function countLabel(value: number | null): string {
  return value === null ? "—" : String(value);
}

function levelLabel(level: number | null): string {
  return level === null ? "—" : `Lv.${level}`;
}

function levelBadgeClasses(level: number | null): string {
  if (level === null) return "bg-slate-700 text-slate-400";
  switch (level) {
    case 0:
      return "bg-slate-700 text-slate-300";
    case 1:
      return "bg-slate-600/40 text-slate-300";
    case 2:
      return "bg-indigo-500/20 text-indigo-400";
    case 3:
      return "bg-violet-500/20 text-violet-400";
    case 4:
      return "bg-fuchsia-500/20 text-fuchsia-400";
    case 5:
      return "bg-amber-500/20 text-amber-400";
    case 6:
      return "bg-emerald-500/20 text-emerald-400";
    default:
      return "bg-slate-700 text-slate-400";
  }
}

function levelSortValue(c: ClubItem): number {
  return c.usageLevel ?? -1;
}

function matchSortValue(c: ClubItem): number {
  return c.matchCount ?? -1;
}

function LogoImage({
  src,
  alt,
  className = "",
}: {
  src: string | null;
  alt: string;
  className?: string;
}) {
  const [hasError, setHasError] = useState(false);
  if (!src || hasError) {
    return (
      <div
        className={`flex items-center justify-center overflow-hidden rounded-lg bg-white/5 text-[10px] text-slate-500 ${className}`}
      >
        無
      </div>
    );
  }
  return (
    <div className={`relative overflow-hidden rounded-lg bg-white/5 ${className}`}>
      <Image
        src={src}
        alt={alt}
        fill
        className="object-cover"
        unoptimized
        onError={() => setHasError(true)}
      />
    </div>
  );
}

export default function InternalClubsPage() {
  const { user, loading } = useAuth();
  const [items, setItems] = useState<ClubItem[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [matchDiagnostics, setMatchDiagnostics] = useState<Record<string, { total: number; valid: number; friendly: number; invalid: number }> | null>(null);
  const [authlessUids, setAuthlessUids] = useState<string[]>([]);
  const [funnelSummary, setFunnelSummary] = useState<FunnelSummary | null>(null);
  const [funnelRows, setFunnelRows] = useState<FunnelRow[]>([]);
  const [monetizationFunnel, setMonetizationFunnel] = useState<Record<string, unknown> | null>(null);
  const [potentialProUsers, setPotentialProUsers] = useState<Record<string, number> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);

  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("active");
  const [planFilter, setPlanFilter] = useState<PlanFilter>("all");
  const [publicFilter, setPublicFilter] = useState<PublicFilter>("all");
  const [cohortFilter, setCohortFilter] = useState<CohortFilter>("all");
  const [nameFilter, setNameFilter] = useState<NameFilter>("all");
  const [aggregateFilter, setAggregateFilter] = useState<AggregateFilter>("all");
  const [levelFilter, setLevelFilter] = useState<LevelFilter>("all");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<ClubItem | null>(null);

  useEffect(() => {
    if (loading || !user) return;
    if (user.uid !== ADMIN_UID) return;

    const run = async () => {
      setFetching(true);
      try {
        const currentUser = auth.currentUser;
        if (!currentUser) throw new Error("ログインが必要です");
        const token = await currentUser.getIdToken();
        const [clubsRes, funnelRes] = await Promise.all([
          fetch("/api/admin/clubs", { headers: { Authorization: `Bearer ${token}` } }),
          fetch("/api/admin/activation-funnel?cohort=all&full=1", { headers: { Authorization: `Bearer ${token}` } }),
        ]);
        if (!clubsRes.ok) throw new Error(`HTTP ${clubsRes.status}`);
        const clubsJson = (await clubsRes.json()) as {
          summary: Summary;
          clubs: ClubItem[];
          authlessUids: string[];
          matchDiagnostics: Record<string, { total: number; valid: number; friendly: number; invalid: number }>;
        };
        setItems(clubsJson.clubs);
        setSummary(clubsJson.summary);
        setAuthlessUids(clubsJson.authlessUids);
        setMatchDiagnostics(clubsJson.matchDiagnostics);

        if (funnelRes.ok) {
          const funnelJson = (await funnelRes.json()) as {
            summaryByProfile: FunnelSummary;
            users: FunnelRow[];
            monetizationFunnel?: Record<string, unknown>;
            potentialProUsers?: Record<string, number>;
          };
          setFunnelSummary(funnelJson.summaryByProfile);
          setFunnelRows(funnelJson.users || []);
          setMonetizationFunnel(funnelJson.monetizationFunnel || null);
          setPotentialProUsers(funnelJson.potentialProUsers || null);
        }
      } catch (e) {
        console.error("[InternalClubs] fetch failed", e);
        setError("データの取得に失敗しました");
      } finally {
        setFetching(false);
      }
    };

    void run();
  }, [user, loading]);

  const filtered = useMemo(() => {
    let out = items.filter((c) => {
      const q = search.trim().toLowerCase();
      if (!q) return true;
      return (
        c.clubName.toLowerCase().includes(q) ||
        (c.email && c.email.toLowerCase().includes(q)) ||
        c.ownerUid.toLowerCase().includes(q) ||
        c.publicSlug.toLowerCase().includes(q)
      );
    });

    if (planFilter !== "all") {
      out = out.filter(
        (c) => c.plan === planFilter || (planFilter === "pro" && c.plan === "officia")
      );
    }
    if (publicFilter === "public") out = out.filter((c) => c.isPublic);
    if (publicFilter === "private") out = out.filter((c) => !c.isPublic);
    if (cohortFilter !== "all") out = out.filter((c) => c.analyticsCohort === cohortFilter);
    if (nameFilter === "unset") out = out.filter((c) => !c.nameSet);
    if (aggregateFilter === "available") out = out.filter((c) => c.aggregateAvailable);
    if (aggregateFilter === "unavailable") out = out.filter((c) => !c.aggregateAvailable);
    if (aggregateFilter === "multipleProfiles")
      out = out.filter((c) => c.aggregateUnavailableReason === "MULTIPLE_PROFILES");
    if (aggregateFilter === "noOwnerUid")
      out = out.filter((c) => c.aggregateUnavailableReason === "NO_OWNER_UID");
    if (aggregateFilter === "profileMappingFailed")
      out = out.filter((c) => c.aggregateUnavailableReason === "PROFILE_MAPPING_FAILED");
    if (aggregateFilter === "dataStructureUnsupported")
      out = out.filter((c) => c.aggregateUnavailableReason === "DATA_STRUCTURE_UNSUPPORTED");
    if (aggregateFilter === "unknown")
      out = out.filter((c) => c.aggregateUnavailableReason === "UNKNOWN");
    if (levelFilter !== "all") {
      out = out.filter((c) => c.usageLevel !== null && c.usageLevel === Number(levelFilter));
    }

    switch (sort) {
      case "new":
        out = out.sort((a, b) => {
          const ad = a.clubCreatedAt ? new Date(a.clubCreatedAt).getTime() : 0;
          const bd = b.clubCreatedAt ? new Date(b.clubCreatedAt).getTime() : 0;
          return bd - ad;
        });
        break;
      case "old":
        out = out.sort((a, b) => {
          const ad = a.clubCreatedAt ? new Date(a.clubCreatedAt).getTime() : 0;
          const bd = b.clubCreatedAt ? new Date(b.clubCreatedAt).getTime() : 0;
          return ad - bd;
        });
        break;
      case "active":
        out = out.sort((a, b) => {
          const ad = a.lastActivityAt ? new Date(a.lastActivityAt).getTime() : 0;
          const bd = b.lastActivityAt ? new Date(b.lastActivityAt).getTime() : 0;
          return bd - ad;
        });
        break;
      case "matches":
        out = out.sort((a, b) => (b.matchCount ?? -1) - (a.matchCount ?? -1));
        break;
      case "players":
        out = out.sort((a, b) => (b.playerCount ?? -1) - (a.playerCount ?? -1));
        break;
      case "competitions":
        out = out.sort((a, b) => (b.competitionCount ?? -1) - (a.competitionCount ?? -1));
        break;
      case "usageHigh":
        out = out.sort((a, b) => {
          const diff = levelSortValue(b) - levelSortValue(a);
          if (diff !== 0) return diff;
          const md = matchSortValue(b) - matchSortValue(a);
          if (md !== 0) return md;
          const ad = (a.lastActivityAt ? new Date(a.lastActivityAt).getTime() : 0);
          const bd = (b.lastActivityAt ? new Date(b.lastActivityAt).getTime() : 0);
          return bd - ad;
        });
        break;
      case "usageLow":
        out = out.sort((a, b) => {
          const diff = levelSortValue(a) - levelSortValue(b);
          if (diff !== 0) return diff;
          const md = matchSortValue(b) - matchSortValue(a);
          if (md !== 0) return md;
          const ad = (a.lastActivityAt ? new Date(a.lastActivityAt).getTime() : 0);
          const bd = (b.lastActivityAt ? new Date(b.lastActivityAt).getTime() : 0);
          return bd - ad;
        });
        break;
    }
    return out;
  }, [items, search, sort, planFilter, publicFilter, cohortFilter, nameFilter, aggregateFilter, levelFilter]);

  const totalFiltered = filtered.length;
  const pageCount = Math.max(1, Math.ceil(totalFiltered / PAGE_SIZE));
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const consistency = useMemo(() => {
    if (!summary || !funnelSummary) return null;
    const items = [
      { key: "totalUsers", label: "総ユーザー", left: summary.total, right: funnelSummary.total },
      { key: "paidPro", label: "Paid Pro", left: summary.paidPro, right: funnelSummary.isPaidPro },
      { key: "grantedPro", label: "Granted Pro", left: summary.grantedPro, right: funnelSummary.isGrantedPro },
      { key: "free", label: "Free", left: summary.free, right: funnelSummary.isFree },
      { key: "hasMatch", label: "試合登録あり", left: summary.withMatches, right: funnelSummary.hasMatch },
      { key: "match10", label: "10試合以上", left: summary.matches10, right: funnelSummary.has10Matches },
      { key: "match50", label: "50試合以上", left: summary.matches50, right: funnelSummary.has50Matches },
      { key: "match100", label: "100試合以上", left: summary.matches100, right: funnelSummary.has100Matches },
      { key: "teamImage", label: "チーム画像あり", left: summary.withTeamImages, right: funnelSummary.hasTeamImage },
      { key: "playerImage20", label: "選手画像20人以上", left: summary.withPlayerImages20, right: funnelSummary.hasPlayerImage20 },
      { key: "active7", label: "7日Active", left: summary.active7, right: funnelSummary.active7 },
      { key: "active30", label: "30日Active", left: summary.active30, right: funnelSummary.active30 },
    ];
    return items.map((i) => ({
      ...i,
      ok: i.left === i.right,
      diff: typeof i.right === 'number' && !Number.isNaN(i.right) ? i.right - i.left : 0,
    }));
  }, [summary, funnelSummary]);

  const authItems = useMemo(() => items.filter((c) => c.authExists), [items]);

  const proDiffUsers = useMemo(() => {
    if (funnelRows.length === 0) return [];
    const profileRows = funnelRows.filter((r) => r.hasProfile);
    const rowByUid = new Map(profileRows.map((r) => [r.uid, r]));
    const diff: { uid: string; ic: ClubItem; f: FunnelRow }[] = [];
    for (const ic of authItems) {
      const f = rowByUid.get(ic.ownerUid);
      if (!f) continue;
      if (ic.isPaidPro !== f.isPaidPro || ic.isGrantedPro !== f.isGrantedPro || ic.isFree !== f.isFree) {
        diff.push({ uid: ic.ownerUid, ic, f });
      }
    }
    return diff;
  }, [authItems, funnelRows]);

  const matchDiffUsers = useMemo(() => {
    if (funnelRows.length === 0) return [];
    const profileRows = funnelRows.filter((r) => r.hasProfile);
    const rowByUid = new Map(profileRows.map((r) => [r.uid, r]));
    const diff: { uid: string; ic: ClubItem; f: FunnelRow }[] = [];
    for (const ic of authItems) {
      const f = rowByUid.get(ic.ownerUid);
      if (!f) continue;
      if ((ic.matchCount ?? 0) !== f.matchCount) {
        diff.push({ uid: ic.ownerUid, ic, f });
      }
    }
    return diff;
  }, [authItems, funnelRows]);

  const activeDiffUsers = useMemo(() => {
    if (funnelRows.length === 0) return [];
    const profileRows = funnelRows.filter((r) => r.hasProfile);
    const rowByUid = new Map(profileRows.map((r) => [r.uid, r]));
    const diff: { uid: string; ic: ClubItem; f: FunnelRow }[] = [];
    for (const ic of authItems) {
      const f = rowByUid.get(ic.ownerUid);
      if (!f) continue;
      if (ic.active7 !== f.active7 || ic.active30 !== f.active30) {
        diff.push({ uid: ic.ownerUid, ic, f });
      }
    }
    return diff;
  }, [authItems, funnelRows]);

  const orphanMatchDiffUsers = useMemo(() => {
    if (!matchDiagnostics) return [];
    const allUids = new Set(authItems.map((c) => c.ownerUid));
    return Object.entries(matchDiagnostics)
      .filter(([uid, d]) => !allUids.has(uid) && d.total !== d.valid)
      .map(([uid, d]) => ({ uid, ...d }))
      .sort((a, b) => b.total - a.total);
  }, [matchDiagnostics, authItems]);

  useEffect(() => {
    setPage(0);
  }, [search, sort, planFilter, publicFilter, cohortFilter, nameFilter, aggregateFilter, levelFilter]);

  if (loading || fetching) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0b1220]">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
      </div>
    );
  }

  if (!user || user.uid !== ADMIN_UID) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0b1220] px-4 text-center text-white">
        <p>アクセス権限がありません</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0b1220] px-4 text-center text-white">
        <p>{error}</p>
      </div>
    );
  }

  const SummaryCard = ({
    label,
    value,
    sub,
    color = "text-white",
  }: {
    label: string;
    value: number | string;
    sub?: string;
    color?: string;
  }) => (
    <div className="rounded-2xl border border-white/10 bg-[#111827] p-3 text-center">
      <p className="text-[10px] text-slate-400">{label}</p>
      <p className={`text-lg font-black tabular-nums ${color}`}>{value}</p>
      {sub && <p className="text-[10px] text-slate-500">{sub}</p>}
    </div>
  );

  return (
    <main className="min-h-screen bg-[#0b1220] px-4 py-6 text-white sm:px-6 sm:py-8">
      <div className="mx-auto max-w-6xl space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-xl font-black tracking-tight sm:text-2xl">ユーザーHP 一覧</h1>
          <Link
            href="/admin/internal-analytics"
            className="text-sm font-bold text-emerald-400 hover:text-emerald-300"
          >
            ← 内部 Analytics に戻る
          </Link>
        </div>

        {summary && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <SummaryCard label="総ユーザー" value={summary.total} color="text-white" />
              <SummaryCard
                label="クラブ名未設定"
                value={summary.nameUnset}
                sub={`${summary.nameUnsetRate}%`}
                color="text-red-400"
              />
              <SummaryCard label="公開中" value={summary.public} color="text-emerald-400" />
              <SummaryCard label="Total Pro" value={summary.totalPro} color="text-amber-400" />
              <SummaryCard label="Paid Pro" value={summary.paidPro} color="text-amber-400" />
              <SummaryCard label="Granted Pro" value={summary.grantedPro} color="text-indigo-400" />
              <SummaryCard label="7日アクティブ" value={summary.active7} color="text-emerald-400" />
              <SummaryCard label="30日アクティブ" value={summary.active30} color="text-emerald-400" />
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#111827] p-4">
              <p className="mb-3 text-xs font-bold text-slate-300">
                利用状況（分母: 集計可能 {summary.aggregatable} クラブ / 全 {summary.total} クラブ）
              </p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                <SummaryCard label="7日Active" value={summary.active7} color="text-emerald-400" />
                <SummaryCard label="30日Active" value={summary.active30} color="text-emerald-400" />
                <SummaryCard label="30日Engaged" value={summary.engaged30} color="text-amber-400" />
                <SummaryCard label="7日Match Active" value={summary.matchActive7} color="text-fuchsia-400" />
                <SummaryCard label="30日Match Active" value={summary.matchActive30} color="text-fuchsia-400" />
                <SummaryCard label="Free" value={summary.free} color="text-slate-300" />
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                <SummaryCard
                  label="試合登録あり"
                  value={summary.withMatches}
                  sub={`${summary.withMatchesRate}%（全 ${summary.total} ユーザー中）`}
                  color="text-emerald-400"
                />
                <SummaryCard
                  label="10試合以上"
                  value={summary.matches10}
                  sub={`${summary.matches10Rate}%（全 ${summary.total} ユーザー中）`}
                  color="text-emerald-400"
                />
                <SummaryCard
                  label="50試合以上"
                  value={summary.matches50}
                  sub={`${summary.matches50Rate}%（全 ${summary.total} ユーザー中）`}
                  color="text-amber-400"
                />
                <SummaryCard
                  label="100試合以上"
                  value={summary.matches100}
                  sub={`${summary.matches100Rate}%（全 ${summary.total} ユーザー中）`}
                  color="text-fuchsia-400"
                />
                <SummaryCard
                  label="選手画像20人以上"
                  value={summary.withPlayerImages20}
                  sub={`${summary.withPlayerImages20Rate}%（全 ${summary.total} ユーザー中）`}
                  color="text-emerald-400"
                />
                <SummaryCard
                  label="チーム画像あり"
                  value={summary.withTeamImages}
                  sub={`${summary.withTeamImagesRate}%（全 ${summary.total} ユーザー中）`}
                  color="text-emerald-400"
                />
              </div>

              <div className="mt-3 rounded-2xl border border-white/10 bg-[#0b1220] p-4">
                <p className="mb-3 text-xs font-bold text-slate-300">ユーザー / 重複診断</p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                  <SummaryCard label="club_profiles総件数" value={summary.clubProfilesTotal} color="text-slate-300" />
                  <SummaryCard label="重複profile保有UID数" value={summary.multiClubOwners} color="text-amber-400" />
                  <SummaryCard
                    label="重複によって削減された表示行数"
                    value={summary.reducedDisplayRows}
                    color="text-amber-400"
                  />
                  <SummaryCard
                    label="平均重複profile数"
                    value={summary.avgClubsPerMultiOwner}
                    color="text-slate-300"
                  />
                  <SummaryCard label="最大重複profile数" value={summary.maxClubsPerOwner} color="text-slate-300" />
                  <SummaryCard label="Granted Pro" value={summary.grantedPro} color="text-indigo-400" />
                </div>
              </div>
            </div>
          </div>
        )}

        {(monetizationFunnel || potentialProUsers) && (
          <div className="space-y-3">
            {monetizationFunnel && (
              <div className="rounded-2xl border border-white/10 bg-[#111827] p-4">
                <p className="mb-3 text-xs font-bold text-slate-300">Monetization Funnel（Free → Pro）</p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                  {(() => {
                    const mf = monetizationFunnel as {
                      last7?: Record<string, number>;
                      last30?: Record<string, number>;
                    };
                    const last7 = mf.last7 || {};
                    const last30 = mf.last30 || {};
                    return (
                      <>
                        <SummaryCard label="plan_limit_reached 7日" value={last7.plan_limit_reached ?? 0} color="text-amber-400" />
                        <SummaryCard label="pro_paywall_view 7日" value={last7.pro_paywall_view ?? 0} color="text-amber-400" />
                        <SummaryCard label="pro_cta_click 7日" value={last7.pro_cta_click ?? 0} color="text-emerald-400" />
                        <SummaryCard label="checkout_start 7日" value={last7.checkout_start ?? 0} color="text-emerald-400" />
                        <SummaryCard label="subscription_start 7日" value={last7.subscription_start ?? 0} color="text-fuchsia-400" />
                        <SummaryCard label="plan_limit_reached 30日" value={last30.plan_limit_reached ?? 0} color="text-amber-400" />
                        <SummaryCard label="pro_paywall_view 30日" value={last30.pro_paywall_view ?? 0} color="text-amber-400" />
                        <SummaryCard label="pro_cta_click 30日" value={last30.pro_cta_click ?? 0} color="text-emerald-400" />
                        <SummaryCard label="checkout_start 30日" value={last30.checkout_start ?? 0} color="text-emerald-400" />
                        <SummaryCard label="subscription_start 30日" value={last30.subscription_start ?? 0} color="text-fuchsia-400" />
                      </>
                    );
                  })()}
                </div>
              </div>
            )}
            {potentialProUsers && (
              <div className="rounded-2xl border border-white/10 bg-[#0b1220] p-4">
                <p className="mb-3 text-xs font-bold text-slate-300">潜在課金Freeユーザー</p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                  <SummaryCard label="選手画像20人以上" value={potentialProUsers.playerImage20plus ?? 0} color="text-emerald-400" />
                  <SummaryCard label="大会3つ以上" value={potentialProUsers.competition3plus ?? 0} color="text-emerald-400" />
                  <SummaryCard label="選手30人以上" value={potentialProUsers.player30plus ?? 0} color="text-amber-400" />
                  <SummaryCard label="50試合以上" value={potentialProUsers.match50plus ?? 0} color="text-slate-300" />
                  <SummaryCard label="100試合以上" value={potentialProUsers.match100plus ?? 0} color="text-slate-300" />
                </div>
              </div>
            )}
          </div>
        )}

        <div className="rounded-2xl border border-white/10 bg-[#111827] p-4">
          <div className="flex items-start gap-2 text-xs leading-relaxed text-slate-400">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
            <p>
              1 Auth UID = 1 行で表示しています。同一ユーザーが複数の club_profiles を保有する
              legacy データも、代表 profile を選定し UID 単位で集約しています。既存データは
              削除・統合していません。重複 profile 数はメタ情報として表示しています。
            </p>
          </div>
        </div>

        {consistency && (
          <div className="rounded-2xl border border-white/10 bg-[#111827] p-4">
            <p className="mb-3 text-xs font-bold text-slate-300">profile保有Auth UID 整合性チェック</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {consistency.map((c) => {
                const right = typeof c.right === 'number' && !Number.isNaN(c.right) ? c.right : '—';
                return (
                  <div
                    key={c.key}
                    className={`rounded-xl border p-2 text-center ${
                      c.ok ? "border-emerald-500/30 bg-emerald-500/10" : "border-rose-500/30 bg-rose-500/10"
                    }`}
                  >
                    <p className="text-[10px] text-slate-400">{c.label}</p>
                    <p className={`text-sm font-black ${c.ok ? "text-emerald-400" : "text-rose-400"}`}>
                      {c.ok ? "OK" : `${c.diff > 0 ? `+${c.diff}` : c.diff}`}
                    </p>
                    <p className="text-[10px] text-slate-500">
                      IC {c.left} / F {right}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {authlessUids.length > 0 && (
          <div className="rounded-2xl border border-white/10 bg-[#111827] p-4">
            <p className="mb-3 text-xs font-bold text-slate-300">Authに存在しない ownerUid 一覧（{authlessUids.length} 件）</p>
            <p className="text-[10px] text-slate-500 mb-2">整合性チェックはこれらを除外しています。データは削除していません。</p>
            <div className="max-h-32 overflow-auto rounded-xl border border-white/10 p-2 font-mono text-[10px] text-slate-400">
              {authlessUids.join(", ")}
            </div>
          </div>
        )}

        {proDiffUsers.length > 0 && (
          <div className="rounded-2xl border border-white/10 bg-[#111827] p-4">
            <p className="mb-3 text-xs font-bold text-slate-300">Paid/Granted/Free 差分 UID（{proDiffUsers.length} 件）</p>
            <div className="max-h-48 overflow-auto rounded-xl border border-white/10">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="sticky top-0 bg-[#0b1220] text-slate-400">
                  <tr>
                    <th className="px-3 py-2">UID</th>
                    <th className="px-3 py-2">subscription</th>
                    <th className="px-3 py-2">plans</th>
                    <th className="px-3 py-2">stripeIds</th>
                    <th className="px-3 py-2 text-right">IC判定</th>
                    <th className="px-3 py-2 text-right">F判定</th>
                  </tr>
                </thead>
                <tbody>
                  {proDiffUsers.map((u) => (
                    <tr key={u.uid} className="border-t border-white/5">
                      <td className="px-3 py-2 font-mono text-slate-400">{u.uid}</td>
                      <td className="px-3 py-2">{u.f.subscriptionStatus || '—'}</td>
                      <td className="px-3 py-2">{u.ic.allProfilePlans.join(', ') || '—'}</td>
                      <td className="px-3 py-2">{u.ic.allStripeCustomerIds.join(', ') || '—'}</td>
                      <td className="px-3 py-2 text-right">{u.ic.isPaidPro ? 'Paid' : u.ic.isGrantedPro ? 'Granted' : 'Free'}</td>
                      <td className="px-3 py-2 text-right">{u.f.isPaidPro ? 'Paid' : u.f.isGrantedPro ? 'Granted' : 'Free'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {matchDiffUsers.length > 0 && (
          <div className="rounded-2xl border border-white/10 bg-[#111827] p-4">
            <p className="mb-3 text-xs font-bold text-slate-300">試合数差分 UID（IC ≠ Funnel）</p>
            <div className="max-h-48 overflow-auto rounded-xl border border-white/10">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="sticky top-0 bg-[#0b1220] text-slate-400">
                  <tr>
                    <th className="px-3 py-2">UID</th>
                    <th className="px-3 py-2 text-right">IC</th>
                    <th className="px-3 py-2 text-right">Funnel</th>
                  </tr>
                </thead>
                <tbody>
                  {matchDiffUsers.map((u) => (
                    <tr key={u.uid} className="border-t border-white/5">
                      <td className="px-3 py-2 font-mono text-slate-400">{u.uid}</td>
                      <td className="px-3 py-2 text-right">{u.ic.matchCount ?? 0}</td>
                      <td className="px-3 py-2 text-right">{u.f.matchCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeDiffUsers.length > 0 && (
          <div className="rounded-2xl border border-white/10 bg-[#111827] p-4">
            <p className="mb-3 text-xs font-bold text-slate-300">Active差分 UID（IC ≠ Funnel）</p>
            <div className="max-h-64 overflow-auto rounded-xl border border-white/10">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="sticky top-0 bg-[#0b1220] text-slate-400">
                  <tr>
                    <th className="px-3 py-2">UID</th>
                    <th className="px-3 py-2 text-center">IC 7/30</th>
                    <th className="px-3 py-2 text-center">Funnel 7/30</th>
                    <th className="px-3 py-2 text-right">event latest</th>
                    <th className="px-3 py-2 text-right">users.lastLoginAt</th>
                    <th className="px-3 py-2 text-right">profile lastLoginAt</th>
                    <th className="px-3 py-2 text-right">adopted</th>
                  </tr>
                </thead>
                <tbody>
                  {activeDiffUsers.map((u) => (
                    <tr key={u.uid} className="border-t border-white/5">
                      <td className="px-3 py-2 font-mono text-slate-400">{u.uid}</td>
                      <td className="px-3 py-2 text-center">{u.ic.active7 ? '1' : '0'}/{u.ic.active30 ? '1' : '0'}</td>
                      <td className="px-3 py-2 text-center">{u.f.active7 ? '1' : '0'}/{u.f.active30 ? '1' : '0'}</td>
                      <td className="px-3 py-2 text-right">{u.f.activeDetail.eventAt ? new Date(u.f.activeDetail.eventAt).toLocaleString('ja-JP', { hour12: false }) : '—'}</td>
                      <td className="px-3 py-2 text-right">{u.f.activeDetail.userAt ? new Date(u.f.activeDetail.userAt).toLocaleString('ja-JP', { hour12: false }) : '—'}</td>
                      <td className="px-3 py-2 text-right">{u.ic.activeDetail.profileAt ? new Date(u.ic.activeDetail.profileAt).toLocaleString('ja-JP', { hour12: false }) : '—'}</td>
                      <td className="px-3 py-2 text-right">{u.f.activeDetail.adoptedAt ? new Date(u.f.activeDetail.adoptedAt).toLocaleString('ja-JP', { hour12: false }) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {orphanMatchDiffUsers.length > 0 && (
          <div className="rounded-2xl border border-white/10 bg-[#111827] p-4">
            <p className="mb-3 text-xs font-bold text-slate-300">Auth不在・legacy 試合差分 UID（total ≠ valid）</p>
            <div className="max-h-48 overflow-auto rounded-xl border border-white/10">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="sticky top-0 bg-[#0b1220] text-slate-400">
                  <tr>
                    <th className="px-3 py-2">UID</th>
                    <th className="px-3 py-2 text-right">total</th>
                    <th className="px-3 py-2 text-right">valid</th>
                    <th className="px-3 py-2 text-right">friendly</th>
                    <th className="px-3 py-2 text-right">invalid</th>
                  </tr>
                </thead>
                <tbody>
                  {orphanMatchDiffUsers.map((u) => (
                    <tr key={u.uid} className="border-t border-white/5">
                      <td className="px-3 py-2 font-mono text-slate-400">{u.uid}</td>
                      <td className="px-3 py-2 text-right">{u.total}</td>
                      <td className="px-3 py-2 text-right">{u.valid}</td>
                      <td className="px-3 py-2 text-right">{u.friendly}</td>
                      <td className="px-3 py-2 text-right">{u.invalid}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-[#111827] p-4 sm:flex-row sm:flex-wrap sm:items-center">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="クラブ名 / メール / UID / slug"
            className="w-full rounded-lg border border-white/10 bg-[#0b1220] px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-400 sm:w-72"
          />
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="rounded-lg border border-white/10 bg-[#0b1220] px-3 py-2 text-sm text-white"
            >
              <option value="active">最終活動が新しい順</option>
              <option value="new">新着順</option>
              <option value="old">古い順</option>
              <option value="matches">試合数順</option>
              <option value="players">選手数順</option>
              <option value="competitions">大会数順</option>
              <option value="usageHigh">利用深度が高い順</option>
              <option value="usageLow">利用深度が低い順</option>
            </select>
            <select
              value={planFilter}
              onChange={(e) => setPlanFilter(e.target.value as PlanFilter)}
              className="rounded-lg border border-white/10 bg-[#0b1220] px-3 py-2 text-sm text-white"
            >
              <option value="all">全プラン</option>
              <option value="pro">Proのみ</option>
              <option value="free">Freeのみ</option>
            </select>
            <select
              value={publicFilter}
              onChange={(e) => setPublicFilter(e.target.value as PublicFilter)}
              className="rounded-lg border border-white/10 bg-[#0b1220] px-3 py-2 text-sm text-white"
            >
              <option value="all">公開・非公開</option>
              <option value="public">公開中のみ</option>
              <option value="private">非公開のみ</option>
            </select>
            <select
              value={cohortFilter}
              onChange={(e) => setCohortFilter(e.target.value as CohortFilter)}
              className="rounded-lg border border-white/10 bg-[#0b1220] px-3 py-2 text-sm text-white"
            >
              <option value="all">全コホート</option>
              <option value="tracked">tracked</option>
              <option value="pre_tracking">pre_tracking</option>
            </select>
            <select
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value as LevelFilter)}
            className="rounded-full border border-white/20 bg-[#0b1220] px-3 py-2 text-xs text-slate-300"
          >
            <option value="all">利用深度</option>
            <option value="0">Lv.0</option>
            <option value="1">Lv.1</option>
            <option value="2">Lv.2</option>
            <option value="3">Lv.3</option>
            <option value="4">Lv.4</option>
            <option value="5">Lv.5</option>
            <option value="6">Lv.6</option>
          </select>
          <select
            value={aggregateFilter}
            onChange={(e) => setAggregateFilter(e.target.value as AggregateFilter)}
            className="rounded-full border border-white/20 bg-[#0b1220] px-3 py-2 text-xs text-slate-300"
          >
            <option value="all">集計: すべて</option>
            <option value="available">集計可能のみ</option>
            <option value="unavailable">集計不可のみ</option>
            <option value="multipleProfiles">複数クラブ所有</option>
            <option value="noOwnerUid">ownerUidなし</option>
            <option value="profileMappingFailed">紐付け不可</option>
            <option value="dataStructureUnsupported">旧形式</option>
            <option value="unknown">その他</option>
          </select>
          <button
            onClick={() => setNameFilter((v) => (v === "unset" ? "all" : "unset"))}
            className={`rounded-full px-3 py-2 text-xs font-bold transition ${
                nameFilter === "unset"
                  ? "bg-red-500/20 text-red-400 border border-red-500/40"
                  : "border border-white/20 text-slate-300 hover:bg-white/5"
              }`}
            >
              未設定のみ
            </button>
          </div>
        </div>

        <p className="text-xs text-slate-500">
          全 {items.length} 件（Auth {authItems.length} / Legacy {items.length - authItems.length}）中 {totalFiltered} 件表示（{page + 1}/{pageCount} ページ）
        </p>

        <div className="space-y-3">
          {paginated.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelected(c)}
              className="w-full rounded-2xl border border-white/10 bg-[#111827] p-4 text-left transition hover:border-white/20 sm:flex sm:items-start sm:gap-4"
            >
              <div className="flex items-start gap-3 sm:flex-1">
                <LogoImage
                  src={c.logoUrl}
                  alt={c.clubName}
                  className="h-12 w-12 shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-black text-emerald-400" title={c.clubName}>
                      {c.clubName}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${levelBadgeClasses(c.usageLevel)}`}>
                      {levelLabel(c.usageLevel)}
                    </span>
                    {c.plan === "pro" || c.plan === "officia" ? (
                      <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-400">
                        Pro
                      </span>
                    ) : (
                      <span className="rounded-full bg-slate-600/20 px-2 py-0.5 text-[10px] font-bold text-slate-400">
                        Free
                      </span>
                    )}
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        c.isPublic
                          ? "bg-emerald-500/20 text-emerald-400"
                          : "bg-red-500/20 text-red-400"
                      }`}
                    >
                      {c.isPublic ? "公開" : "非公開"}
                    </span>
                    {!c.nameSet && (
                      <span className="rounded-full border border-red-500/40 bg-red-500/10 px-2 py-0.5 text-[10px] font-bold text-red-400">
                        設定未完了
                      </span>
                    )}
                    {c.duplicateProfileCount > 1 && (
                      <span className="rounded-full bg-rose-500/20 px-2 py-0.5 text-[10px] font-bold text-rose-400">
                        重複 {c.duplicateProfileCount}
                      </span>
                    )}
                    {!c.aggregateAvailable && (
                      <span
                        className="rounded-full border border-slate-600 px-2 py-0.5 text-[10px] font-bold text-slate-400"
                        title={c.aggregateUnavailableReason || "集計を1クラブに特定できません"}
                      >
                        {c.aggregateUnavailableReason || "集計不可"}
                      </span>
                    )}
                  </div>

                  <div className="mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">
                    <div>
                      <p className="text-[10px] text-slate-500">選手</p>
                      <p className="font-black text-slate-300">
                        {countLabel(c.playerCount)} <span className="text-[10px] font-normal text-slate-500">/ 画像{countLabel(c.playerImageCount)}</span>
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-500">チーム</p>
                      <p className="font-black text-slate-300">
                        {countLabel(c.teamCount)} <span className="text-[10px] font-normal text-slate-500">/ 画像{countLabel(c.teamImageCount)}</span>
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-500">試合</p>
                      <p className="font-black text-white">{countLabel(c.matchCount)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-500">大会</p>
                      <p className="font-black text-slate-300">{countLabel(c.competitionCount)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-500">最終活動</p>
                      <p className="font-black text-slate-300">{formatDate(c.lastActivityAt)}</p>
                    </div>
                  </div>

                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-600">
                    {c.email && <span className="truncate max-w-[200px]">{c.email}</span>}
                    <span>UID: {c.ownerUid}</span>
                    <span>slug: {c.publicSlug}</span>
                    <span>作成: {formatDate(c.clubCreatedAt)}</span>
                    <span>重複profile: {c.duplicateProfileCount > 1 ? c.duplicateProfileCount : "—"}</span>
                  </div>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2 sm:mt-0 sm:shrink-0">
                <a
                  href={c.publicUrl}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="rounded-lg bg-emerald-400 px-3 py-2 text-xs font-black text-[#06111f] hover:bg-emerald-300"
                >
                  HP を開く
                </a>
              </div>
            </button>
          ))}
        </div>

        {totalFiltered === 0 && (
          <div className="rounded-2xl border border-white/10 bg-[#111827] p-8 text-center text-sm text-slate-400">
            該当するクラブがありません
          </div>
        )}

        {pageCount > 1 && (
          <div className="flex items-center justify-center gap-2 pt-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="rounded-lg border border-white/10 bg-[#111827] px-3 py-2 text-sm font-bold text-white disabled:opacity-40"
            >
              前へ
            </button>
            <span className="text-sm text-slate-400">
              {page + 1} / {pageCount}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              disabled={page === pageCount - 1}
              className="rounded-lg border border-white/10 bg-[#111827] px-3 py-2 text-sm font-bold text-white disabled:opacity-40"
            >
              次へ
            </button>
          </div>
        )}
      </div>

      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setSelected(null)}
        >
          <div
            className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/10 bg-[#111827] p-5 text-white"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-black">クラブ詳細</h2>
              <button
                onClick={() => setSelected(null)}
                className="rounded-full p-1 text-slate-400 hover:bg-white/10"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mb-4 flex items-center gap-3">
              <LogoImage
                src={selected.logoUrl}
                alt={selected.clubName}
                className="h-16 w-16"
              />
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-lg font-black text-emerald-400">{selected.clubName}</p>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${levelBadgeClasses(selected.usageLevel)}`}>
                    {levelLabel(selected.usageLevel)}
                  </span>
                  {!selected.nameSet && (
                    <span className="rounded-full border border-red-500/40 bg-red-500/10 px-2 py-0.5 text-[10px] font-bold text-red-400">
                      設定未完了
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400">slug: {selected.publicSlug}</p>
              </div>
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between border-b border-white/5 py-2">
                <span className="text-slate-400">所有者</span>
                <span className="font-mono text-right text-slate-300">{selected.ownerUid}</span>
              </div>
              <div className="flex justify-between border-b border-white/5 py-2">
                <span className="text-slate-400">メール</span>
                <span className="text-right text-slate-300">{selected.email || "—"}</span>
              </div>
              <div className="flex justify-between border-b border-white/5 py-2">
                <span className="text-slate-400">クラブID</span>
                <span className="text-slate-300">{selected.id}</span>
              </div>
              <div className="flex justify-between border-b border-white/5 py-2">
                <span className="text-slate-400">チーム名</span>
                <span className="text-slate-300">{selected.mainTeamName ?? "未設定"}</span>
              </div>
              <div className="flex justify-between border-b border-white/5 py-2">
                <span className="text-slate-400">プラン</span>
                <span className="font-bold">{selected.plan}</span>
              </div>
              <div className="flex justify-between border-b border-white/5 py-2">
                <span className="text-slate-400">公開状態</span>
                <span className={selected.isPublic ? "text-emerald-400" : "text-red-400"}>
                  {selected.isPublic ? "公開" : "非公開"}
                </span>
              </div>
              <div className="flex justify-between border-b border-white/5 py-2">
                <span className="text-slate-400">コホート</span>
                <span className="font-bold">{selected.analyticsCohort}</span>
              </div>
              <div className="flex justify-between border-b border-white/5 py-2">
                <span className="text-slate-400">作成日</span>
                <span className="text-slate-300">{formatDate(selected.clubCreatedAt)}</span>
              </div>
              <div className="flex justify-between border-b border-white/5 py-2">
                <span className="text-slate-400">最終活動</span>
                <span className="text-slate-300">{formatDateTime(selected.lastActivityAt)}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 py-2 text-center sm:grid-cols-8">
                <div>
                  <p className="text-xs text-slate-400">選手</p>
                  <p className="font-black">{countLabel(selected.playerCount)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">選手画像</p>
                  <p className="font-black">{countLabel(selected.playerImageCount)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">チーム</p>
                  <p className="font-black">{countLabel(selected.teamCount)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">チーム画像</p>
                  <p className="font-black">{countLabel(selected.teamImageCount)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">大会</p>
                  <p className="font-black">{countLabel(selected.competitionCount)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">試合</p>
                  <p className="font-black">{countLabel(selected.matchCount)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">30日Engaged</p>
                  <p className="font-black">{selected.engaged30 ? "Yes" : "No"}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">30日Match</p>
                  <p className="font-black">{selected.matchActive30 ? "Yes" : "No"}</p>
                </div>
              </div>
            </div>

            <div className="mt-5 flex gap-2">
              <a
                href={selected.publicUrl}
                target="_blank"
                rel="noreferrer"
                className="flex-1 rounded-lg bg-emerald-400 py-2.5 text-center text-sm font-black text-[#06111f] hover:bg-emerald-300"
              >
                公開HPを開く
              </a>
              <button
                onClick={() => setSelected(null)}
                className="rounded-lg border border-white/10 bg-[#0b1220] px-4 py-2.5 text-sm font-bold text-slate-300 hover:bg-white/5"
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
