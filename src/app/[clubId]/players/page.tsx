import { db } from "@/lib/firebase/admin";
import { notFound } from "next/navigation";
import { PlayerList } from "./player-list";
import { ClubHeader } from "@/components/club-header";
import { ClubFooter } from "@/components/club-footer";
import { toDashSeason, toSlashSeason } from "@/lib/season";

export const revalidate = 300;

interface Player {
  id: string;
  name: string;
  number: number;
  position: string;
  photoUrl: string;
  seasons?: string[];
  isPublished?: boolean;
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

  // シーズン一覧はまず clubs/{ownerUid}/seasons を見て、なければ clubs/{clubId}/seasons を見る
  let seasonsSnap = await db.collection(`clubs/${baseClubDocId}/seasons`).get();
  if (seasonsSnap.empty && baseClubDocId !== clubId) {
    seasonsSnap = await db.collection(`clubs/${clubId}/seasons`).get();
  }
  const allSeasons = seasonsSnap
    .docs
    .filter((doc) => {
      const data = doc.data() as any;
      return data?.isPublic !== false;
    })
    .map((doc) => toSlashSeason(doc.id))
    .sort((a, b) => b.localeCompare(a));

  const seasonNormalized = typeof season === "string" ? toSlashSeason(season) : undefined;

  const activeSeason = allSeasons.length
    ? seasonNormalized && allSeasons.includes(seasonNormalized)
      ? seasonNormalized
      : allSeasons[0]
    : "";

  // 選手データもまず clubs/{ownerUid}/teams/*/players を見て、なければ clubs/{clubId}/teams を見る
  let teamsSnap = await db.collection(`clubs/${baseClubDocId}/teams`).get();
  if (teamsSnap.empty && baseClubDocId !== clubId) {
    teamsSnap = await db.collection(`clubs/${clubId}/teams`).get();
  }
  const players: Player[] = [];

  const playersByTeam = await Promise.all(
    teamsSnap.docs.map(async (teamDoc) => {
      const teamPlayersRef = teamDoc.ref.collection("players").orderBy("number", "asc");
      const teamPlayersSnap = await teamPlayersRef.get();
      return teamPlayersSnap.docs.map((pDoc) => ({
        id: pDoc.id,
        ...(pDoc.data() as any),
      })) as Player[];
    })
  );

  players.push(...playersByTeam.flat());

  // シーズンでフィルタ（seasons 未設定 or 空配列は全シーズン所属として扱う）
  // seasons/seasonData のキー表記は slash/dash が混在するので両方許容する
  const activeSeasonDash = activeSeason ? toDashSeason(activeSeason) : "";
  const activeSeasonSlash = activeSeason ? toSlashSeason(activeSeason) : "";
  let filteredPlayers = activeSeason
    ? players.filter((p: any) => {
        const seasons = Array.isArray(p?.seasons) ? (p.seasons as string[]) : [];
        const seasonData = p?.seasonData && typeof p.seasonData === "object" ? (p.seasonData as any) : null;
        if (seasons.length === 0 && !seasonData) return true;

        if (seasons.length === 0 && seasonData) {
          return Boolean(seasonData[activeSeasonDash] || seasonData[activeSeasonSlash]);
        }

        return seasons.includes(activeSeason) || seasons.includes(activeSeasonSlash) || seasons.includes(activeSeasonDash);
      })
    : players;

  // HP非表示フラグ（isPublished === false）は一覧から除外
  filteredPlayers = filteredPlayers.filter((p) => p.isPublished !== false);

  // 背番号でソート（重複しても一旦そのまま）
  filteredPlayers.sort((a, b) => (a.number || 0) - (b.number || 0));

  return { clubName, logoUrl, homeBgColor, sponsors, snsLinks, legalPages, gameTeamUsage, players: filteredPlayers, allSeasons, activeSeason };
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

  const { clubName, logoUrl, homeBgColor, sponsors, snsLinks, legalPages, gameTeamUsage, players, allSeasons, activeSeason } = data;

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
