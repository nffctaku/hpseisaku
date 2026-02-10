import { db } from "@/lib/firebase/admin";
import { notFound } from "next/navigation";
import { PlayerList } from "./player-list";
import { ClubHeader } from "@/components/club-header";
import { ClubFooter } from "@/components/club-footer";
import { toDashSeason, toSlashSeason } from "@/lib/season";

export const revalidate = 60;
export const dynamic = "force-dynamic";

interface Player {
  id: string;
  name: string;
  number: number;
  position: string;
  photoUrl: string;
  seasons?: string[];
  isPublished?: boolean;
  __teamId?: string;
}

interface Staff {
  id: string;
  name: string;
  position?: string;
  nationality?: string;
  age?: number;
  profile?: string;
  photoUrl?: string;
  seasons?: string[];
  isPublished?: boolean;
  __teamId?: string;
}

async function getPlayersData(
  clubId: string,
  season?: string
): Promise<{
  clubName: string;
  logoUrl: string | null;
  homeBgColor?: string | null;
  sponsors?: any[];
  snsLinks?: any;
  legalPages?: any[];
  gameTeamUsage?: boolean;
  players: Player[];
  staff: Staff[];
  allSeasons: string[];
  activeSeason: string;
} | null> {
  // club_profiles から clubId に対応するオーナーUIDとクラブ名・ロゴを取得
  let clubName = clubId;
  let logoUrl: string | null = null;
  let ownerUid: string | null = null;
  let homeBgColor: string | null = null;
  let sponsors: any[] = [];
  let snsLinks: any = {};
  let legalPages: any[] = [];
  let gameTeamUsage: boolean = false;

  try {
    const profilesQuery = db
      .collection("club_profiles")
      .where("clubId", "==", clubId);
    const profileSnap = await profilesQuery.get();

    if (!profileSnap.empty) {
      const doc = profileSnap.docs[0];
      const data = doc.data() as any;
      ownerUid = (data.ownerUid as string) || doc.id;
      clubName = data.clubName || clubName;
      logoUrl = data.logoUrl || null;
      homeBgColor = typeof data.homeBgColor === 'string' ? data.homeBgColor : null;
      sponsors = Array.isArray(data.sponsors) ? data.sponsors : [];
      snsLinks = (data as any).snsLinks || {};
      legalPages = Array.isArray(data.legalPages) ? data.legalPages : [];
      gameTeamUsage = Boolean((data as any).gameTeamUsage);
    } else {
      const directSnap = await db.collection("club_profiles").doc(clubId).get();
      if (directSnap.exists) {
        const data = directSnap.data() as any;
        ownerUid = (data.ownerUid as string) || directSnap.id;
        clubName = data.clubName || clubName;
        logoUrl = data.logoUrl || null;
        homeBgColor = typeof data.homeBgColor === 'string' ? data.homeBgColor : null;
        sponsors = Array.isArray(data.sponsors) ? data.sponsors : [];
        snsLinks = (data as any).snsLinks || {};
        legalPages = Array.isArray(data.legalPages) ? data.legalPages : [];
        gameTeamUsage = Boolean((data as any).gameTeamUsage);
      } else {
        const ownerSnap = await db.collection("club_profiles").where('ownerUid', '==', clubId).limit(1).get();
        if (!ownerSnap.empty) {
          const doc = ownerSnap.docs[0];
          const data = doc.data() as any;
          ownerUid = (data.ownerUid as string) || doc.id;
          clubName = data.clubName || clubName;
          logoUrl = data.logoUrl || null;
          homeBgColor = typeof data.homeBgColor === 'string' ? data.homeBgColor : null;
          sponsors = Array.isArray(data.sponsors) ? data.sponsors : [];
          snsLinks = (data as any).snsLinks || {};
          legalPages = Array.isArray(data.legalPages) ? data.legalPages : [];
          gameTeamUsage = Boolean((data as any).gameTeamUsage);
        }
      }
    }
  } catch (e) {
    console.error("Failed to load club profile for players page", e);
  }

  const baseClubDocId = ownerUid || clubId;

  // シーズン一覧は clubs/{ownerUid}/seasons と clubs/{clubId}/seasons の両方を見てマージする
  // (ownerUid 側に1件でも存在すると fallback しない仕様だと、シーズンが分散している場合に1つしか表示されない)
  const seasonIdSet = new Set<string>();
  const loadSeasonsFrom = async (clubDocId: string) => {
    const snap = await db.collection(`clubs/${clubDocId}/seasons`).get();
    snap.docs.forEach((doc) => {
      const data = doc.data() as any;
      if (data?.isPublic === false) return;
      const normalized = toSlashSeason(doc.id);
      if (normalized) seasonIdSet.add(normalized);
    });
  };

  await loadSeasonsFrom(baseClubDocId);
  if (baseClubDocId !== clubId) {
    await loadSeasonsFrom(clubId);
  }

  const allSeasons = Array.from(seasonIdSet).sort((a, b) => b.localeCompare(a));

  const requestedSeason = typeof season === "string" ? season.trim() : "";
  const activeSeason =
    requestedSeason && allSeasons.includes(requestedSeason)
      ? requestedSeason
      : allSeasons.length
        ? allSeasons[0]
        : "";
  const displaySeasons = allSeasons;

  // If roster exists for the active season, use it as the source of truth for public player visibility.
  // This prevents deleted players from lingering due to stale seasonData/seasons or duplicates across teams.
  const activeSeasonDashForRoster = activeSeason ? toDashSeason(activeSeason) : "";
  let rosterPlayerIdSet: Set<string> | null = null;
  let rosterTeamIdByPlayerId: Map<string, string> | null = null;
  if (activeSeasonDashForRoster) {
    try {
      const rosterSnap = await db.collection(`clubs/${baseClubDocId}/seasons/${activeSeasonDashForRoster}/roster`).get();
      if (!rosterSnap.empty) {
        rosterPlayerIdSet = new Set(rosterSnap.docs.map((d) => d.id));
        rosterTeamIdByPlayerId = new Map(
          rosterSnap.docs
            .map((d) => {
              const data = d.data() as any;
              const teamId = typeof data?.teamId === "string" ? data.teamId.trim() : "";
              return teamId ? ([d.id, teamId] as const) : null;
            })
            .filter((x): x is readonly [string, string] => Boolean(x))
        );
      }
    } catch (e) {
      console.warn("Failed to load roster for players page", e);
    }
  }

  // 選手データもまず clubs/{ownerUid}/teams/*/players を見て、なければ clubs/{clubId}/teams を見る
  let teamsSnap = await db.collection(`clubs/${baseClubDocId}/teams`).get();
  if (teamsSnap.empty && baseClubDocId !== clubId) {
    teamsSnap = await db.collection(`clubs/${clubId}/teams`).get();
  }
  const players: Player[] = [];
  const staff: Staff[] = [];

  const perTeamData = await Promise.all(
    teamsSnap.docs.map(async (teamDoc) => {
      const teamPlayersRef = teamDoc.ref.collection("players").orderBy("number", "asc");
      const teamPlayersSnap = await teamPlayersRef.get();
      const teamStaffRef = teamDoc.ref.collection("staff");
      const teamStaffSnap = await teamStaffRef.get();

      const players = teamPlayersSnap.docs.map((pDoc) => ({
        id: pDoc.id,
        __teamId: teamDoc.id,
        ...(pDoc.data() as any),
      })) as Player[];

      const staff = teamStaffSnap.docs.map((sDoc) => ({
        id: sDoc.id,
        __teamId: teamDoc.id,
        ...(sDoc.data() as any),
      })) as Staff[];

      return { players, staff };
    })
  );

  perTeamData.forEach(({ players: p, staff: s }) => {
    players.push(...p);
    staff.push(...s);
  });

  // If no season is public, do not show any players on the public page.
  if (!activeSeason) {
    return {
      clubName,
      logoUrl,
      homeBgColor,
      sponsors,
      snsLinks,
      legalPages,
      gameTeamUsage,
      players: [],
      staff: [],
      allSeasons: displaySeasons,
      activeSeason: "",
    };
  }

  // シーズンでフィルタ（seasons 未設定 or 空配列は全シーズン所属として扱う）
  // seasons/seasonData のキー表記は slash/dash が混在するので両方許容する
  const activeSeasonDash = activeSeason ? toDashSeason(activeSeason) : "";
  const activeSeasonSlash = activeSeason ? toSlashSeason(activeSeason) : "";
  const filterBySeasonMembership = (p: any) => {
    const seasons = Array.isArray(p?.seasons) ? (p.seasons as string[]) : [];
    const seasonData = p?.seasonData && typeof p.seasonData === "object" ? (p.seasonData as any) : null;
    if (seasons.length === 0 && !seasonData) return true;

    if (seasons.length === 0 && seasonData) {
      return Boolean(seasonData[activeSeasonDash] || seasonData[activeSeasonSlash]);
    }

    return seasons.includes(activeSeason) || seasons.includes(activeSeasonSlash) || seasons.includes(activeSeasonDash);
  };

  const filterByRoster = (p: any) => {
    if (!rosterPlayerIdSet) return true;
    const pid = String(p?.id || "");
    if (!rosterPlayerIdSet.has(pid)) return false;
    const rosterTeamId = rosterTeamIdByPlayerId?.get(pid);
    if (rosterTeamId) {
      const teamId = typeof p?.teamId === "string" ? p.teamId : p?.__teamId;
      return String(teamId || "") === rosterTeamId;
    }
    return true;
  };

  let filteredPlayers = activeSeason
    ? players.filter((p: any) => {
        if (rosterPlayerIdSet) return filterByRoster(p);
        return filterBySeasonMembership(p);
      })
    : players;

  // If roster exists but results in zero players, fall back to season membership filtering.
  if (activeSeason && rosterPlayerIdSet && filteredPlayers.length === 0) {
    filteredPlayers = players.filter((p: any) => filterBySeasonMembership(p));
  }

  // HP非表示フラグ（isPublished === false）は一覧から除外
  filteredPlayers = filteredPlayers.filter((p) => p.isPublished !== false);

  // 背番号でソート（重複しても一旦そのまま）
  filteredPlayers.sort((a, b) => (a.number || 0) - (b.number || 0));

  const filterStaffBySeasonMembership = (s: any) => {
    const seasons = Array.isArray(s?.seasons) ? (s.seasons as string[]) : [];
    if (seasons.length === 0) return true;
    return seasons.includes(activeSeason) || seasons.includes(activeSeasonSlash) || seasons.includes(activeSeasonDash);
  };

  let filteredStaff = activeSeason ? staff.filter((s: any) => filterStaffBySeasonMembership(s)) : staff;
  filteredStaff = filteredStaff.filter((s) => (s as any)?.isPublished !== false);
  filteredStaff.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ja'));

  return {
    clubName,
    logoUrl,
    homeBgColor,
    sponsors,
    snsLinks,
    legalPages,
    gameTeamUsage,
    players: filteredPlayers,
    staff: filteredStaff,
    allSeasons: displaySeasons,
    activeSeason,
  };
}

export default async function PlayersPage({
  params,
  searchParams,
}: {
  params: Promise<{ clubId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { clubId } = await params;
  const resolvedSearchParams = await searchParams;
  const season =
    typeof resolvedSearchParams.season === "string"
      ? resolvedSearchParams.season
      : undefined;

  if (clubId === "admin") {
    notFound();
  }

  const data = await getPlayersData(clubId, season);

  if (!data) {
    notFound();
  }

  const { clubName, logoUrl, homeBgColor, sponsors, snsLinks, legalPages, gameTeamUsage, players, staff, allSeasons, activeSeason } = data;

  return (
    <main
      className="min-h-screen"
      style={homeBgColor ? { backgroundColor: homeBgColor } : undefined}
    >
      <ClubHeader clubId={clubId} clubName={clubName} logoUrl={logoUrl} />
      <PlayerList
        clubId={clubId}
        clubName={clubName}
        players={players}
        staff={staff}
        allSeasons={allSeasons}
        activeSeason={activeSeason}
        accentColor={homeBgColor}
      />
      <ClubFooter
        clubId={clubId}
        clubName={clubName}
        sponsors={sponsors}
        snsLinks={snsLinks}
        legalPages={legalPages}
        gameTeamUsage={Boolean(gameTeamUsage)}
      />
    </main>
  );
}
