"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { auth } from "@/lib/firebase";
import { Loader2, Info, ChevronDown, ChevronRight } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { ADMIN_UID } from "@/lib/admin-config";

const PAGE_SIZE = 30;

// ---------- API レスポンス型 ----------

interface CareerItem {
  careerId: string;
  name: string;
  clubUid: string;
  status: string;
  isDefault: boolean;
  isActive: boolean;
  isCreating: boolean;
  sharedDataRoot: boolean;
  clubName: string;
  nameSet: boolean;
  publicSlug: string;
  publicUrl: string;
  isPublic: boolean;
  playerCount: number;
  playerImageCount: number;
  teamCount: number;
  teamImageCount: number;
  competitionCount: number;
  matchCount: number;
  newsCount: number;
  lastActivityAt: string | null;
}

interface ClubItem {
  id: string;
  clubName: string;
  nameSet: boolean;
  allCareersNameUnset: boolean;
  anyCareerNameUnset: boolean;
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
  careerCount: number;
  creatingCareerCount: number;
  dataRootCount: number;
  sharedDataRoots: number;
  profileCount: number;
  unmatchedProfileCount: number;
  careers: CareerItem[];
  activeDetail: {
    eventAt: number;
    userAt: number;
    profileAt: number;
    adoptedAt: number;
  };
}

interface ProfileDiagnostics {
  clubProfilesTotal: number;
  careerMatchedProfiles: number;
  ownerDocProfiles: number;
  unmatchedProfiles: number;
  unmatchedProfileIds: string[];
  authlessProfiles: number;
  authlessOwnerUids: string[];
  unmatchedOwnerUids: number;
  unmatchedInclusion: {
    publicUsers: number;
    nameUnsetUsers: number;
    active7Users: number;
    active30Users: number;
    usageUsers: number;
  };
}

interface Summary {
  total: number;
  // Firebase Auth の実UID数（Source of Truth）。total は Analytics対象UID数。
  authTotal: number;
  aggregatable: number;
  totalCareers: number;
  creatingCareers: number;
  multiCareerUsers: number;
  nameSet: number;
  nameUnset: number;
  nameUnsetRate: number;
  public: number;
  publicCareers: number;
  nameUnsetCareers: number;
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
  matchRegisteredUsers: number;
  matchRegisteredRate: number;
  match10Users: number;
  match10Rate: number;
  match10FromStartedRate: number;
  match50Users: number;
  match50Rate: number;
  match50FromStartedRate: number;
  match100Users: number;
  match100Rate: number;
  match100FromStartedRate: number;
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
  foldedCareers: number;
  usersWithCareers: number;
  legacyUsers: number;
  publicCareerUsers: number;
  publicLegacyUsers: number;
  allNameUnsetCareerUsers: number;
  legacyNameUnsetUsers: number;
}

interface AuthDiagnostics {
  totalAuthUsers: number;
  analyticsUids: number;
  unmatchedAuthUids: number;
  coverageRate: number;
  unmatchedBreakdown: {
    withUsersDoc: number;
    withActivityEvent: number;
    googleProvider: number;
    passwordProvider: number;
    otherProvider: number;
    noProvider: number;
    neverSignedIn: number;
    createdWithin7d: number;
    createdWithin30d: number;
    disabled: number;
  };
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

interface MonetizationFunnel {
  last7?: Record<string, number>;
  last30?: Record<string, number>;
  uniqueUidCounts?: boolean;
  remappedClubUidEvents?: number;
  unmappedUserIds?: string[];
  notes?: string[];
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
type PublicFilter = "all" | "anyPublic" | "allPrivate";
type CohortFilter = "all" | "tracked" | "pre_tracking";
type NameFilter = "all" | "anyUnset" | "allUnset";
type LevelFilter = "all" | "0" | "1" | "2" | "3" | "4" | "5" | "6";
type CareerFilter = "all" | "multiCareer" | "hasCreating" | "sharedRoot" | "noCareer";
type DiagFilter = "all" | "unmatchedProfile" | "authlessOwner";

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

// ユーザーのいずれかのCareerが公開か（creating除外）。Career無しは代表値を使う
function anyCareerPublic(c: ClubItem): boolean {
  const usable = c.careers.filter((x) => !x.isCreating);
  if (usable.length === 0) return c.isPublic;
  return usable.some((x) => x.isPublic);
}

export default function InternalClubsPage() {
  const { user, loading } = useAuth();
  const [items, setItems] = useState<ClubItem[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [matchDiagnostics, setMatchDiagnostics] = useState<Record<string, { total: number; valid: number; friendly: number; invalid: number }> | null>(null);
  const [profileDiagnostics, setProfileDiagnostics] = useState<ProfileDiagnostics | null>(null);
  const [authDiagnostics, setAuthDiagnostics] = useState<AuthDiagnostics | null>(null);
  const [authlessUids, setAuthlessUids] = useState<string[]>([]);
  const [funnelSummary, setFunnelSummary] = useState<FunnelSummary | null>(null);
  const [funnelRows, setFunnelRows] = useState<FunnelRow[]>([]);
  const [monetizationFunnel, setMonetizationFunnel] = useState<MonetizationFunnel | null>(null);
  const [potentialProUsers, setPotentialProUsers] = useState<Record<string, number> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);

  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("active");
  const [planFilter, setPlanFilter] = useState<PlanFilter>("all");
  const [publicFilter, setPublicFilter] = useState<PublicFilter>("all");
  const [cohortFilter, setCohortFilter] = useState<CohortFilter>("all");
  const [nameFilter, setNameFilter] = useState<NameFilter>("all");
  const [careerFilter, setCareerFilter] = useState<CareerFilter>("all");
  const [diagFilter, setDiagFilter] = useState<DiagFilter>("all");
  const [levelFilter, setLevelFilter] = useState<LevelFilter>("all");
  const [page, setPage] = useState(0);
  const [expandedUids, setExpandedUids] = useState<Set<string>>(new Set());

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
          profileDiagnostics?: ProfileDiagnostics;
          authDiagnostics?: AuthDiagnostics;
        };
        setItems(clubsJson.clubs);
        setSummary(clubsJson.summary);
        setAuthlessUids(clubsJson.authlessUids);
        setMatchDiagnostics(clubsJson.matchDiagnostics);
        setProfileDiagnostics(clubsJson.profileDiagnostics || null);
        setAuthDiagnostics(clubsJson.authDiagnostics || null);

        if (funnelRes.ok) {
          const funnelJson = (await funnelRes.json()) as {
            summaryByProfile: FunnelSummary;
            users: FunnelRow[];
            monetizationFunnel?: MonetizationFunnel;
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

  // 検索クエリに一致したCareerのID（ユーザー行内でハイライト・自動展開用）
  const matchedCareerIds = useMemo(() => {
    const map = new Map<string, Set<string>>();
    const q = search.trim().toLowerCase();
    if (!q) return map;
    for (const c of items) {
      for (const career of c.careers) {
        const hit =
          career.name.toLowerCase().includes(q) ||
          career.careerId.toLowerCase().includes(q) ||
          career.clubUid.toLowerCase().includes(q) ||
          career.clubName.toLowerCase().includes(q) ||
          career.publicSlug.toLowerCase().includes(q);
        if (hit) {
          if (!map.has(c.ownerUid)) map.set(c.ownerUid, new Set());
          map.get(c.ownerUid)!.add(career.careerId);
        }
      }
    }
    return map;
  }, [items, search]);

  const filtered = useMemo(() => {
    let out = items.filter((c) => {
      const q = search.trim().toLowerCase();
      if (!q) return true;
      // ユーザー行（email/uid/代表クラブ名/slug）またはいずれかのCareerに一致
      return (
        c.clubName.toLowerCase().includes(q) ||
        (c.email && c.email.toLowerCase().includes(q)) ||
        c.ownerUid.toLowerCase().includes(q) ||
        c.publicSlug.toLowerCase().includes(q) ||
        (matchedCareerIds.get(c.ownerUid)?.size ?? 0) > 0
      );
    });

    if (planFilter !== "all") {
      // UID単位の実効プランで判定
      out = out.filter(
        (c) => c.plan === planFilter || (planFilter === "pro" && c.plan === "officia")
      );
    }
    if (publicFilter === "anyPublic") out = out.filter((c) => anyCareerPublic(c));
    if (publicFilter === "allPrivate") out = out.filter((c) => !anyCareerPublic(c));
    if (cohortFilter !== "all") out = out.filter((c) => c.analyticsCohort === cohortFilter);
    if (nameFilter === "anyUnset") out = out.filter((c) => c.anyCareerNameUnset);
    if (nameFilter === "allUnset") out = out.filter((c) => c.allCareersNameUnset);
    if (careerFilter === "multiCareer") out = out.filter((c) => c.careerCount > 1);
    if (careerFilter === "hasCreating") out = out.filter((c) => c.creatingCareerCount > 0);
    if (careerFilter === "sharedRoot") out = out.filter((c) => c.sharedDataRoots > 0);
    if (careerFilter === "noCareer") out = out.filter((c) => c.careerCount === 0 && c.creatingCareerCount === 0);
    if (diagFilter === "unmatchedProfile") out = out.filter((c) => c.unmatchedProfileCount > 0);
    if (diagFilter === "authlessOwner") out = out.filter((c) => !c.authExists);
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
  }, [items, search, sort, planFilter, publicFilter, cohortFilter, nameFilter, careerFilter, diagFilter, levelFilter, matchedCareerIds]);

  const totalFiltered = filtered.length;
  const pageCount = Math.max(1, Math.ceil(totalFiltered / PAGE_SIZE));
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // 検索でCareerにヒットしたユーザーは自動展開
  const effectiveExpanded = useMemo(() => {
    const s = new Set(expandedUids);
    for (const uid of matchedCareerIds.keys()) s.add(uid);
    return s;
  }, [expandedUids, matchedCareerIds]);

  const toggleExpanded = (uid: string) => {
    setExpandedUids((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  };

  const consistency = useMemo(() => {
    if (!summary || !funnelSummary) return null;
    const rows = [
      { key: "totalUsers", label: "Analytics対象UID", left: summary.total, right: funnelSummary.total },
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
    return rows.map((i) => ({
      ...i,
      ok: i.left === i.right,
      diff: typeof i.right === "number" && !Number.isNaN(i.right) ? i.right - i.left : 0,
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
  }, [search, sort, planFilter, publicFilter, cohortFilter, nameFilter, careerFilter, diagFilter, levelFilter]);

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

  const careerStatusBadges = (career: CareerItem) => (
    <>
      {career.isDefault && (
        <span className="rounded-full bg-sky-500/20 px-2 py-0.5 text-[10px] font-bold text-sky-400">デフォルト</span>
      )}
      {career.isActive && (
        <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-400">アクティブ</span>
      )}
      {career.isCreating && (
        <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-400">作成中（集計除外）</span>
      )}
      {career.sharedDataRoot && (
        <span
          className="rounded-full bg-violet-500/20 px-2 py-0.5 text-[10px] font-bold text-violet-400"
          title="同じ clubUid を共有する旧Careerがあります。ユーザー合計では1回だけ計上されます"
        >
          共有データルート
        </span>
      )}
      <span
        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
          career.isPublic ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"
        }`}
      >
        {career.isPublic ? "一覧掲載" : "未掲載"}
      </span>
      {!career.nameSet && !career.isCreating && (
        <span className="rounded-full border border-red-500/40 bg-red-500/10 px-2 py-0.5 text-[10px] font-bold text-red-400">
          名称未設定
        </span>
      )}
    </>
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
              <SummaryCard
                label="Firebase Auth 総ユーザー"
                value={summary.authTotal ?? summary.total}
                sub={`Analytics対象 ${summary.total} / 未捕捉 ${Math.max((summary.authTotal ?? summary.total) - summary.total, 0)}`}
                color="text-white"
              />
              <SummaryCard
                label="Analytics対象UID"
                value={summary.total}
                sub={`Career保有 ${summary.usersWithCareers} / 旧形式Career無し ${summary.legacyUsers}`}
                color="text-sky-300"
              />
              <SummaryCard
                label="有効Career数"
                value={summary.totalCareers}
                sub={`creating除外 / 作成中 ${summary.creatingCareers}`}
                color="text-sky-400"
              />
              <SummaryCard
                label="club_profiles（profile数）"
                value={summary.clubProfilesTotal}
                color="text-slate-300"
              />
              <SummaryCard
                label="複数Careerユーザー"
                value={summary.multiCareerUsers}
                sub={`一覧で折りたたまれたCareer: ${summary.foldedCareers}（Σ max(Career数-1,0)）`}
                color="text-violet-400"
              />
              <SummaryCard label="Total Pro（UID）" value={summary.totalPro} color="text-amber-400" />
              <SummaryCard label="Free（UID）" value={summary.free} color="text-slate-300" />
              <SummaryCard
                label="クラブ名未設定（Career）"
                value={summary.nameUnsetCareers}
                sub={`全Career未設定(Career保有) ${summary.allNameUnsetCareerUsers} / 旧形式未設定 ${summary.legacyNameUnsetUsers}`}
                color="text-red-400"
              />
              <SummaryCard
                label="クラブ一覧掲載中（Career）"
                value={summary.publicCareers}
                sub={`一覧掲載ユーザー: Career保有 ${summary.publicCareerUsers} + 旧形式 ${summary.publicLegacyUsers}`}
                color="text-emerald-400"
              />
              <SummaryCard label="Paid Pro（UID）" value={summary.paidPro} color="text-amber-400" />
              <SummaryCard label="Granted Pro（UID）" value={summary.grantedPro} color="text-indigo-400" />
              <SummaryCard label="7日アクティブ（UID）" value={summary.active7} color="text-emerald-400" />
              <SummaryCard label="30日アクティブ（UID）" value={summary.active30} color="text-emerald-400" />
            </div>

            {authDiagnostics && (
              <div className="rounded-2xl border border-white/10 bg-[#111827] p-4">
                <p className="mb-3 text-xs font-bold text-slate-300">Auth / Analytics 整合性</p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                  <SummaryCard label="Firebase Auth" value={authDiagnostics.totalAuthUsers} color="text-white" />
                  <SummaryCard label="Analytics対象" value={authDiagnostics.analyticsUids} color="text-sky-300" />
                  <SummaryCard label="Analytics未捕捉" value={authDiagnostics.unmatchedAuthUids} color="text-amber-400" />
                  <SummaryCard label="捕捉率" value={`${authDiagnostics.coverageRate}%`} color="text-emerald-400" />
                </div>
                <div className="mt-3 rounded-xl border border-white/10 p-3 text-[10px] text-slate-400">
                  <p className="mb-1 font-bold text-slate-300">
                    未捕捉 {authDiagnostics.unmatchedAuthUids} UID の内訳（Auth存在・club_profiles/careersドキュメントなし）
                  </p>
                  <p>
                    Google {authDiagnostics.unmatchedBreakdown.googleProvider} /
                    メール {authDiagnostics.unmatchedBreakdown.passwordProvider} /
                    その他provider {authDiagnostics.unmatchedBreakdown.otherProvider} /
                    provider不明 {authDiagnostics.unmatchedBreakdown.noProvider}
                  </p>
                  <p className="mt-1">
                    usersドキュメントあり {authDiagnostics.unmatchedBreakdown.withUsersDoc} /
                    活動イベントあり {authDiagnostics.unmatchedBreakdown.withActivityEvent} /
                    最終ログインなし {authDiagnostics.unmatchedBreakdown.neverSignedIn} /
                    7日以内作成 {authDiagnostics.unmatchedBreakdown.createdWithin7d} /
                    30日以内作成 {authDiagnostics.unmatchedBreakdown.createdWithin30d} /
                    disabled {authDiagnostics.unmatchedBreakdown.disabled}
                  </p>
                </div>
              </div>
            )}

            <div className="rounded-2xl border border-white/10 bg-[#111827] p-4">
              <p className="mb-3 text-xs font-bold text-slate-300">
                利用状況（分母: Firebase Auth {summary.authTotal ?? summary.total} 人。いずれかのCareerが条件を満たすUIDを1件計上・共有データルートは1回のみ）
              </p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                <SummaryCard label="7日Active（UID）" value={summary.active7} color="text-emerald-400" />
                <SummaryCard label="30日Active（UID）" value={summary.active30} color="text-emerald-400" />
                <SummaryCard label="30日Engaged（UID）" value={summary.engaged30} color="text-amber-400" />
                <SummaryCard label="7日Match Active（UID）" value={summary.matchActive7} color="text-fuchsia-400" />
                <SummaryCard label="30日Match Active（UID）" value={summary.matchActive30} color="text-fuchsia-400" />
                <SummaryCard label="Free（UID）" value={summary.free} color="text-slate-300" />
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                <SummaryCard
                  label="試合登録あり（UID・全Career合算）"
                  value={summary.matchRegisteredUsers}
                  sub={`全登録者比 ${summary.matchRegisteredRate}%（Firebase Auth ${summary.authTotal ?? summary.total} 人中）`}
                  color="text-emerald-400"
                />
                <SummaryCard
                  label="10試合以上（UID・全Career合算）"
                  value={summary.match10Users}
                  sub={`全登録者比 ${summary.match10Rate}% / 記録開始者比 ${summary.match10FromStartedRate}%`}
                  color="text-emerald-400"
                />
                <SummaryCard
                  label="50試合以上（UID・全Career合算）"
                  value={summary.match50Users}
                  sub={`全登録者比 ${summary.match50Rate}% / 記録開始者比 ${summary.match50FromStartedRate}%`}
                  color="text-amber-400"
                />
                <SummaryCard
                  label="100試合以上（UID・全Career合算）"
                  value={summary.match100Users}
                  sub={`全登録者比 ${summary.match100Rate}% / 記録開始者比 ${summary.match100FromStartedRate}%`}
                  color="text-fuchsia-400"
                />
                <SummaryCard
                  label="選手画像20人以上（UID）"
                  value={summary.withPlayerImages20}
                  sub={`${summary.withPlayerImages20Rate}%（Firebase Auth ${summary.authTotal ?? summary.total} 人中）`}
                  color="text-emerald-400"
                />
                <SummaryCard
                  label="チーム画像あり（UID）"
                  value={summary.withTeamImages}
                  sub={`${summary.withTeamImagesRate}%（Firebase Auth ${summary.authTotal ?? summary.total} 人中）`}
                  color="text-emerald-400"
                />
              </div>

              <div className="mt-3 rounded-xl border border-white/10 p-3">
                <p className="mb-2 text-[11px] font-bold text-slate-300">
                  試合記録ファネル（Activation = Firebase Auth比 / Depth = 記録開始者比）
                </p>
                <div className="space-y-1 text-[11px] text-slate-300">
                  {[
                    { label: "Firebase Auth", users: summary.authTotal ?? summary.total, all: "100%", started: null as string | null },
                    { label: "試合登録あり", users: summary.matchRegisteredUsers, all: `${summary.matchRegisteredRate}%`, started: null },
                    { label: "10試合以上", users: summary.match10Users, all: `${summary.match10Rate}%`, started: `${summary.match10FromStartedRate}%` },
                    { label: "50試合以上", users: summary.match50Users, all: `${summary.match50Rate}%`, started: `${summary.match50FromStartedRate}%` },
                    { label: "100試合以上", users: summary.match100Users, all: `${summary.match100Rate}%`, started: `${summary.match100FromStartedRate}%` },
                  ].map((row, i) => (
                    <div key={row.label}>
                      {i > 0 && <div className="pl-2 text-slate-600">↓</div>}
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-semibold">{row.label}</span>
                        <span className="font-mono">
                          {row.users.toLocaleString()}人　全体 {row.all}
                          {row.started !== null && `　開始者 ${row.started}`}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-3 rounded-2xl border border-white/10 bg-[#0b1220] p-4">
                <p className="mb-3 text-xs font-bold text-slate-300">profile診断（club_profiles ドキュメント単位）</p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                  <SummaryCard
                    label="Career紐付けprofile（正常）"
                    value={profileDiagnostics?.careerMatchedProfiles ?? "—"}
                    sub="複数Career由来は正常・異常に含めない"
                    color="text-emerald-400"
                  />
                  <SummaryCard
                    label="owner直下profile"
                    value={profileDiagnostics?.ownerDocProfiles ?? "—"}
                    sub="doc id = uid の旧形式"
                    color="text-slate-300"
                  />
                  <SummaryCard
                    label="要確認profile（Career対応不明）"
                    value={profileDiagnostics?.unmatchedProfiles ?? "—"}
                    sub="旧データ・推測修正なし"
                    color="text-amber-400"
                  />
                  <SummaryCard
                    label="Auth不在ownerのprofile"
                    value={profileDiagnostics?.authlessProfiles ?? "—"}
                    sub="削除せず診断のみ"
                    color="text-rose-400"
                  />
                  <SummaryCard
                    label="同一Career余分profile保有UID"
                    value={summary.multiClubOwners}
                    sub="profile>1のUID（複数Career由来を含む）"
                    color="text-slate-300"
                  />
                  <SummaryCard
                    label="削減された表示行数"
                    value={summary.reducedDisplayRows}
                    sub="profile数 − ユーザー数"
                    color="text-slate-300"
                  />
                </div>
                {profileDiagnostics?.unmatchedInclusion && (
                  <div className="mt-3 rounded-xl border border-white/10 p-3 text-[10px] text-slate-400">
                    <p className="mb-1 font-bold text-slate-300">
                      要確認profile {profileDiagnostics.unmatchedProfiles}件（owner {profileDiagnostics.unmatchedOwnerUids}人）の各指標への包含
                    </p>
                    <p>
                      一覧掲載ユーザー {profileDiagnostics.unmatchedInclusion.publicUsers} /
                      未設定ユーザー {profileDiagnostics.unmatchedInclusion.nameUnsetUsers} /
                      7日Active {profileDiagnostics.unmatchedInclusion.active7Users} /
                      30日Active {profileDiagnostics.unmatchedInclusion.active30Users} /
                      利用条件を満たしたowner {profileDiagnostics.unmatchedInclusion.usageUsers}
                    </p>
                    <p className="mt-1 text-slate-500">
                      ※「利用条件を満たしたowner」は該当profileのownerが選手・試合等の利用条件を満たした人数であり、要確認profile自体を集計した数ではありません。profile自体はusage集計のデータルートにならず、ownerのCareer/代表profile経由でのみ影響します
                    </p>
                  </div>
                )}
                {(profileDiagnostics?.unmatchedProfileIds?.length ?? 0) > 0 && (
                  <div className="mt-3 max-h-24 overflow-auto rounded-xl border border-white/10 p-2 font-mono text-[10px] text-slate-500">
                    要確認profile: {profileDiagnostics!.unmatchedProfileIds.join(", ")}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {(monetizationFunnel || potentialProUsers) && (
          <div className="space-y-3">
            {monetizationFunnel && (
              <div className="rounded-2xl border border-white/10 bg-[#111827] p-4">
                <p className="mb-1 text-xs font-bold text-slate-300">
                  Monetizationイベント実測（イベントごとの重複なしUID数）
                </p>
                <p className="mb-3 text-[10px] text-slate-500">
                  順序付き行動を表さないため転換率は表示しません。
                  {typeof monetizationFunnel.remappedClubUidEvents === "number" &&
                    ` userId=clubUid の過去イベント ${monetizationFunnel.remappedClubUidEvents} 件をCareerマッピングでuidへ解決。`}
                  {(monetizationFunnel.unmappedUserIds?.length ?? 0) > 0 &&
                    ` uid/clubUidいずれにも解決できないID ${monetizationFunnel.unmappedUserIds!.length} 件は集計対象外。`}
                </p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                  <SummaryCard label="plan_limit_reached 7日" value={monetizationFunnel.last7?.plan_limit_reached ?? 0} color="text-amber-400" />
                  <SummaryCard label="pro_paywall_view 7日" value={monetizationFunnel.last7?.pro_paywall_view ?? 0} color="text-amber-400" />
                  <SummaryCard label="pro_cta_click 7日" value={monetizationFunnel.last7?.pro_cta_click ?? 0} color="text-emerald-400" />
                  <SummaryCard label="checkout_start 7日" value={monetizationFunnel.last7?.checkout_start ?? 0} color="text-emerald-400" />
                  <SummaryCard label="subscription_start 7日" value={monetizationFunnel.last7?.subscription_start ?? 0} color="text-fuchsia-400" />
                  <SummaryCard label="plan_limit_reached 30日" value={monetizationFunnel.last30?.plan_limit_reached ?? 0} color="text-amber-400" />
                  <SummaryCard label="pro_paywall_view 30日" value={monetizationFunnel.last30?.pro_paywall_view ?? 0} color="text-amber-400" />
                  <SummaryCard label="pro_cta_click 30日" value={monetizationFunnel.last30?.pro_cta_click ?? 0} color="text-emerald-400" />
                  <SummaryCard label="checkout_start 30日" value={monetizationFunnel.last30?.checkout_start ?? 0} color="text-emerald-400" />
                  <SummaryCard label="subscription_start 30日" value={monetizationFunnel.last30?.subscription_start ?? 0} color="text-fuchsia-400" />
                </div>
                {(monetizationFunnel.unmappedUserIds?.length ?? 0) > 0 && (
                  <div className="mt-3 max-h-24 overflow-auto rounded-xl border border-white/10 p-2 font-mono text-[10px] text-slate-500">
                    未解決ID: {monetizationFunnel.unmappedUserIds!.join(", ")}
                  </div>
                )}
              </div>
            )}
            {potentialProUsers && (
              <div className="rounded-2xl border border-white/10 bg-[#0b1220] p-4">
                <p className="mb-3 text-xs font-bold text-slate-300">潜在課金Freeユーザー（UID単位）</p>
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
              1 Auth UID = 1 行です。行を展開するとそのユーザーの全Career（careerId・clubUid・状態・利用数）を確認できます。
              複数Careerによる profile は正常とみなし「重複異常」には数えません。Careerと対応付けられない旧profileは
              「要確認」として件数のみ表示し、データの削除・統合・推測修正は行っていません。
            </p>
          </div>
        </div>

        {consistency && (
          <div className="rounded-2xl border border-white/10 bg-[#111827] p-4">
            <p className="mb-1 text-xs font-bold text-slate-300">集計母集団比較（IC一覧 vs Funnel）</p>
            <p className="mb-3 text-[10px] text-slate-500">
              両側とも UID単位・clubUid解決済み。母集団の違い（ICはprofile保有∪Career保有、Funnelはprofile保有のみ）は不整合ではなく定義差です。
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {consistency.map((c) => {
                const right = typeof c.right === "number" && !Number.isNaN(c.right) ? c.right : "—";
                const diffText =
                  c.diff > 0
                    ? `Fにのみ含まれる${c.diff} UID`
                    : c.diff < 0
                      ? `ICにのみ含まれる${-c.diff} UID`
                      : "";
                return (
                  <div
                    key={c.key}
                    className={`rounded-xl border p-2 text-center ${
                      c.ok ? "border-emerald-500/30 bg-emerald-500/10" : "border-amber-500/30 bg-amber-500/10"
                    }`}
                  >
                    <p className="text-[10px] text-slate-400">{c.label}</p>
                    <p className={`text-sm font-black ${c.ok ? "text-emerald-400" : "text-amber-400"}`}>
                      {c.ok ? "一致" : diffText}
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
            <p className="text-[10px] text-slate-500 mb-2">集計母集団比較はこれらを除外しています。データは削除していません。</p>
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
                      <td className="px-3 py-2">{u.f.subscriptionStatus || "—"}</td>
                      <td className="px-3 py-2">{u.ic.allProfilePlans.join(", ") || "—"}</td>
                      <td className="px-3 py-2">{u.ic.allStripeCustomerIds.join(", ") || "—"}</td>
                      <td className="px-3 py-2 text-right">{u.ic.isPaidPro ? "Paid" : u.ic.isGrantedPro ? "Granted" : "Free"}</td>
                      <td className="px-3 py-2 text-right">{u.f.isPaidPro ? "Paid" : u.f.isGrantedPro ? "Granted" : "Free"}</td>
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
                      <td className="px-3 py-2 text-center">{u.ic.active7 ? "1" : "0"}/{u.ic.active30 ? "1" : "0"}</td>
                      <td className="px-3 py-2 text-center">{u.f.active7 ? "1" : "0"}/{u.f.active30 ? "1" : "0"}</td>
                      <td className="px-3 py-2 text-right">{u.f.activeDetail.eventAt ? new Date(u.f.activeDetail.eventAt).toLocaleString("ja-JP", { hour12: false }) : "—"}</td>
                      <td className="px-3 py-2 text-right">{u.f.activeDetail.userAt ? new Date(u.f.activeDetail.userAt).toLocaleString("ja-JP", { hour12: false }) : "—"}</td>
                      <td className="px-3 py-2 text-right">{u.ic.activeDetail.profileAt ? new Date(u.ic.activeDetail.profileAt).toLocaleString("ja-JP", { hour12: false }) : "—"}</td>
                      <td className="px-3 py-2 text-right">{u.f.activeDetail.adoptedAt ? new Date(u.f.activeDetail.adoptedAt).toLocaleString("ja-JP", { hour12: false }) : "—"}</td>
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
            placeholder="メール / UID / クラブ名 / slug / Career名 / clubUid"
            className="w-full rounded-lg border border-white/10 bg-[#0b1220] px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-400 sm:w-80"
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
              title="UID単位の実効プランで判定"
            >
              <option value="all">全プラン（UID実効）</option>
              <option value="pro">Proのみ（UID実効）</option>
              <option value="free">Freeのみ（UID実効）</option>
            </select>
            <select
              value={publicFilter}
              onChange={(e) => setPublicFilter(e.target.value as PublicFilter)}
              className="rounded-lg border border-white/10 bg-[#0b1220] px-3 py-2 text-sm text-white"
              title="Career単位のクラブ一覧掲載状態で判定"
            >
              <option value="all">クラブ一覧への掲載状態: すべて</option>
              <option value="anyPublic">掲載中（いずれかのCareer/旧形式）</option>
              <option value="allPrivate">未掲載（全Career/旧形式）</option>
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
              value={careerFilter}
              onChange={(e) => setCareerFilter(e.target.value as CareerFilter)}
              className="rounded-full border border-white/20 bg-[#0b1220] px-3 py-2 text-xs text-slate-300"
              title="Careerの構成でユーザー行を絞り込み"
            >
              <option value="all">Career状態: すべて</option>
              <option value="multiCareer">複数Career</option>
              <option value="hasCreating">作成中Careerあり</option>
              <option value="sharedRoot">共有データルートあり</option>
              <option value="noCareer">Career無し（旧形式）</option>
            </select>
            <select
              value={levelFilter}
              onChange={(e) => setLevelFilter(e.target.value as LevelFilter)}
              className="rounded-full border border-white/20 bg-[#0b1220] px-3 py-2 text-xs text-slate-300"
              title="ユーザー合算の利用深度（共有ルート重複なし）"
            >
              <option value="all">利用深度（ユーザー合算）</option>
              <option value="0">Lv.0</option>
              <option value="1">Lv.1</option>
              <option value="2">Lv.2</option>
              <option value="3">Lv.3</option>
              <option value="4">Lv.4</option>
              <option value="5">Lv.5</option>
              <option value="6">Lv.6</option>
            </select>
            <select
              value={nameFilter}
              onChange={(e) => setNameFilter(e.target.value as NameFilter)}
              className="rounded-full border border-white/20 bg-[#0b1220] px-3 py-2 text-xs text-slate-300"
              title="Careerのクラブ名設定状態"
            >
              <option value="all">名称設定: すべて</option>
              <option value="anyUnset">未設定あり（Career/旧形式）</option>
              <option value="allUnset">全未設定（全Career/旧形式）</option>
            </select>
            <select
              value={diagFilter}
              onChange={(e) => setDiagFilter(e.target.value as DiagFilter)}
              className="rounded-full border border-white/20 bg-[#0b1220] px-3 py-2 text-xs text-slate-300"
              title="profile/Authの診断で絞り込み"
            >
              <option value="all">診断: すべて</option>
              <option value="unmatchedProfile">要確認profileあり</option>
              <option value="authlessOwner">Auth不在owner</option>
            </select>
          </div>
        </div>

        <p className="text-xs text-slate-500">
          ユーザー件数: 全 {items.length} 件（Auth {authItems.length} / Auth不在 {items.length - authItems.length}）中 {totalFiltered} ユーザー表示（{page + 1}/{pageCount} ページ）
        </p>

        <div className="space-y-3">
          {paginated.map((c) => {
            const expanded = effectiveExpanded.has(c.ownerUid);
            const matched = matchedCareerIds.get(c.ownerUid);
            return (
              <div
                key={c.id}
                className="w-full rounded-2xl border border-white/10 bg-[#111827] p-4"
              >
                <button
                  onClick={() => toggleExpanded(c.ownerUid)}
                  className="w-full text-left sm:flex sm:items-start sm:gap-4"
                >
                  <div className="flex items-start gap-3 sm:flex-1">
                    <span className="mt-3 text-slate-500">
                      {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </span>
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
                        <span className="rounded-full bg-sky-500/20 px-2 py-0.5 text-[10px] font-bold text-sky-400">
                          Career {c.careerCount}
                          {c.creatingCareerCount > 0 ? `（作成中${c.creatingCareerCount}）` : ""}
                        </span>
                        {c.isPaidPro ? (
                          <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-400">
                            Paid Pro
                          </span>
                        ) : c.isGrantedPro ? (
                          <span className="rounded-full bg-indigo-500/20 px-2 py-0.5 text-[10px] font-bold text-indigo-400">
                            Granted Pro
                          </span>
                        ) : (
                          <span className="rounded-full bg-slate-600/20 px-2 py-0.5 text-[10px] font-bold text-slate-400">
                            Free
                          </span>
                        )}
                        {c.careerCount === 0 && (
                          <span className="rounded-full bg-slate-500/20 px-2 py-0.5 text-[10px] font-bold text-slate-300">
                            旧形式(Career無し)
                          </span>
                        )}
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            anyCareerPublic(c)
                              ? "bg-emerald-500/20 text-emerald-400"
                              : "bg-red-500/20 text-red-400"
                          }`}
                        >
                          {anyCareerPublic(c)
                            ? c.careerCount > 0 ? "いずれか掲載" : "一覧掲載(旧形式)"
                            : c.careerCount > 0 ? "全未掲載" : "未掲載(旧形式)"}
                        </span>
                        {c.anyCareerNameUnset && (
                          <span className="rounded-full border border-red-500/40 bg-red-500/10 px-2 py-0.5 text-[10px] font-bold text-red-400">
                            {c.careerCount === 0
                              ? "名称未設定"
                              : c.allCareersNameUnset ? "全Career未設定" : "一部Career未設定"}
                          </span>
                        )}
                        {c.unmatchedProfileCount > 0 && (
                          <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-400">
                            要確認profile {c.unmatchedProfileCount}
                          </span>
                        )}
                        {c.profileCount > c.careerCount + 1 && c.careerCount >= 0 && (
                          <span className="rounded-full bg-rose-500/20 px-2 py-0.5 text-[10px] font-bold text-rose-400">
                            profile {c.profileCount}
                          </span>
                        )}
                        {!c.authExists && (
                          <span className="rounded-full bg-rose-500/20 px-2 py-0.5 text-[10px] font-bold text-rose-400">
                            Auth不在
                          </span>
                        )}
                      </div>

                      <div className="mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">
                        <div>
                          <p className="text-[10px] text-slate-500">選手（全Career合算）</p>
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
                          <p className="text-[10px] text-slate-500">試合（全Career合算）</p>
                          <p className="font-black text-white">{countLabel(c.matchCount)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-500">大会</p>
                          <p className="font-black text-slate-300">{countLabel(c.competitionCount)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-500">最終活動（全Career）</p>
                          <p className="font-black text-slate-300">{formatDate(c.lastActivityAt)}</p>
                        </div>
                      </div>

                      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-600">
                        {c.email && <span className="truncate max-w-[200px]">{c.email}</span>}
                        <span>UID: {c.ownerUid}</span>
                        <span>profile: {c.profileCount}</span>
                        <span>データルート: {c.dataRootCount}</span>
                        {c.sharedDataRoots > 0 && <span className="text-violet-400">共有ルートCareer {c.sharedDataRoots}</span>}
                        <span>作成: {formatDate(c.clubCreatedAt)}</span>
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
                      代表HP
                    </a>
                  </div>
                </button>

                {expanded && (
                  <div className="mt-4 space-y-2 border-t border-white/10 pt-3">
                    <p className="text-[10px] font-bold text-slate-400">
                      Careers（{c.careers.length} 件 / profile {c.profileCount} 件）
                    </p>
                    {c.careers.length === 0 && (
                      <p className="rounded-xl border border-white/10 bg-[#0b1220] p-3 text-xs text-slate-500">
                        Careerドキュメントがありません（旧形式: profile = uid直下のみ）。利用数は uid 直下のデータルートから集計しています。
                      </p>
                    )}
                    {c.careers.map((career) => {
                      const isMatch = matched?.has(career.careerId);
                      return (
                        <div
                          key={career.careerId}
                          className={`rounded-xl border p-3 ${
                            isMatch
                              ? "border-emerald-500/50 bg-emerald-500/5"
                              : "border-white/10 bg-[#0b1220]"
                          }`}
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-bold text-slate-200">{career.name || career.clubName}</span>
                            {isMatch && (
                              <span className="rounded-full bg-emerald-500/30 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                                検索一致
                              </span>
                            )}
                            {careerStatusBadges(career)}
                          </div>
                          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[10px] text-slate-500">
                            <span>careerId: {career.careerId}</span>
                            <span>clubUid: {career.clubUid}</span>
                            <span>slug: {career.publicSlug}</span>
                            <span>status: {career.status}</span>
                          </div>
                          <div className="mt-2 grid grid-cols-3 gap-2 text-xs sm:grid-cols-7">
                            <div>
                              <p className="text-[10px] text-slate-500">選手</p>
                              <p className="font-black text-slate-300">
                                {career.isCreating ? "—" : career.playerCount}
                                {!career.isCreating && (
                                  <span className="text-[10px] font-normal text-slate-500"> / 画像{career.playerImageCount}</span>
                                )}
                              </p>
                            </div>
                            <div>
                              <p className="text-[10px] text-slate-500">チーム</p>
                              <p className="font-black text-slate-300">
                                {career.isCreating ? "—" : career.teamCount}
                                {!career.isCreating && (
                                  <span className="text-[10px] font-normal text-slate-500"> / 画像{career.teamImageCount}</span>
                                )}
                              </p>
                            </div>
                            <div>
                              <p className="text-[10px] text-slate-500">大会</p>
                              <p className="font-black text-slate-300">{career.isCreating ? "—" : career.competitionCount}</p>
                            </div>
                            <div>
                              <p className="text-[10px] text-slate-500">試合</p>
                              <p className="font-black text-white">{career.isCreating ? "—" : career.matchCount}</p>
                            </div>
                            <div>
                              <p className="text-[10px] text-slate-500">ニュース</p>
                              <p className="font-black text-slate-300">{career.isCreating ? "—" : career.newsCount}</p>
                            </div>
                            <div>
                              <p className="text-[10px] text-slate-500">最終活動</p>
                              <p className="font-black text-slate-300">{formatDate(career.lastActivityAt)}</p>
                            </div>
                            <div>
                              <a
                                href={career.publicUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-[10px] font-bold text-emerald-400 hover:text-emerald-300"
                              >
                                公開HP →
                              </a>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {totalFiltered === 0 && (
          <div className="rounded-2xl border border-white/10 bg-[#111827] p-8 text-center text-sm text-slate-400">
            該当するユーザーがありません
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
    </main>
  );
}
