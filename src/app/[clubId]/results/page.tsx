import { db } from "@/lib/firebase/admin";
import { notFound } from 'next/navigation';
import { MatchList } from '@/components/match-list';
import { ClubHeader } from '@/components/club-header';
import { ClubFooter } from '@/components/club-footer';

// This interface should be defined or imported if it's not already global.
// For now, we'll define a basic structure.
interface Match {
  id: string;
  competitionId: string;
  competitionName: string;
  competitionLogoUrl?: string;
  season?: string;
  roundId: string;
  roundName: string;
  matchDate: string;
  matchTime?: string;
  homeTeamId: string;
  awayTeamId: string;
  homeTeamName: string;
  awayTeamName: string;
  homeTeamLogo?: string;
  awayTeamLogo?: string;
  scoreHome?: number | null;
  scoreAway?: number | null;
}

function getSeasonFromMatchDate(matchDate: string): string | null {
  if (typeof matchDate !== 'string') return null;
  const raw = matchDate.trim();
  if (!raw) return null;
  const normalized = raw
    .replace(/\//g, '-')
    .replace(/^([0-9]{4})-([0-9]{1,2})-([0-9]{1,2})$/, (_m, y, mo, d) => `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  const dt = new Date(normalized);
  if (Number.isNaN(dt.getTime())) return null;
  const year = dt.getFullYear();
  const month = dt.getMonth();
  return month >= 7 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
}

async function getMatchesForClub(clubId: string) {
    // 1. Find ownerUid from clubId
    const profilesQuery = db.collection('club_profiles').where('clubId', '==', clubId).limit(1);
    const profilesSnap = await profilesQuery.get();
    let profileDoc: FirebaseFirestore.DocumentSnapshot | null = null;
    if (!profilesSnap.empty) {
        profileDoc = profilesSnap.docs[0];
    } else {
        // fallback: allow accessing by direct doc id (ownerUid) or by ownerUid field
        const direct = await db.collection('club_profiles').doc(clubId).get();
        if (direct.exists) {
            profileDoc = direct;
        } else {
            const ownerSnap = await db.collection('club_profiles').where('ownerUid', '==', clubId).limit(1).get();
            if (!ownerSnap.empty) profileDoc = ownerSnap.docs[0];
        }
    }
    if (!profileDoc) {
        return null;
    }
    const profileData = profileDoc.data() as any;
    const ownerUid = (profileData?.ownerUid as string | undefined) || profileDoc.id;
    const clubName = profileData.clubName || 'Unknown Club';
    const logoUrl = profileData.logoUrl || null;
    const snsLinks = (profileData as any).snsLinks ?? {};
    const sponsors = (Array.isArray((profileData as any).sponsors) ? ((profileData as any).sponsors as any[]) : []) as any;
    const legalPages = (Array.isArray((profileData as any).legalPages) ? ((profileData as any).legalPages as any[]) : []) as any;
    const homeBgColor = (profileData as any).homeBgColor as string | undefined;
    const gameTeamUsage = Boolean((profileData as any).gameTeamUsage);
    const mainTeamId = profileData.mainTeamId as string | undefined;
    if (!ownerUid) {
        return null;
    }

    // 2. Fetch all teams into a map
    const teamsMap = new Map<string, { id: string; name: string; logoUrl?: string; }>();
    const teamsQuery = db.collection(`clubs/${ownerUid}/teams`);
    const teamsSnap = await teamsQuery.get();
    teamsSnap.forEach(doc => teamsMap.set(doc.id, { id: doc.id, ...doc.data() } as { id: string; name: string; logoUrl?: string; }));

    // Resolve mainTeamId to actual team document id (doc.id)
    let resolvedMainTeamId: string | undefined = undefined;
    if (mainTeamId) {
      const direct = teamsMap.get(mainTeamId);
      if (direct) {
        resolvedMainTeamId = direct.id;
      } else {
        teamsSnap.forEach((d) => {
          if (resolvedMainTeamId) return;
          const data = d.data() as any;
          const fieldMatch =
            data?.teamId === mainTeamId ||
            data?.teamUid === mainTeamId ||
            data?.uid === mainTeamId ||
            data?.ownerUid === mainTeamId;
          if (fieldMatch) resolvedMainTeamId = d.id;
        });
      }
    }

    // 3. Fetch all competitions, rounds, and matches
    const enrichedMatches: Match[] = [];
    const competitionsQuery = db.collection(`clubs/${ownerUid}/competitions`);
    const competitionsSnap = await competitionsQuery.get();

    const seasonsInCompetitions = competitionsSnap.docs
      .map((d) => {
        const s = (d.data() as any)?.season;
        return typeof s === 'string' && s.trim().length > 0 ? s.trim() : null;
      })
      .filter((s): s is string => Boolean(s));

    const latestSeason = seasonsInCompetitions.length > 0 ? [...seasonsInCompetitions].sort().reverse()[0] : null;

    const nestedMatches = await Promise.all(
        competitionsSnap.docs.map(async (compDoc) => {
            const competitionData = compDoc.data() as any;
            if (latestSeason && String(competitionData?.season || '').trim() !== latestSeason) {
              return [] as Match[];
            }
            const roundsQuery = db.collection(`clubs/${ownerUid}/competitions/${compDoc.id}/rounds`);
            const roundsSnap = await roundsQuery.get();

            const matchesByRound = await Promise.all(
                roundsSnap.docs.map(async (roundDoc) => {
                    const roundData = roundDoc.data() as any;
                    const matchesQuery = db.collection(
                        `clubs/${ownerUid}/competitions/${compDoc.id}/rounds/${roundDoc.id}/matches`
                    );
                    const matchesSnap = await matchesQuery.get();

                    return matchesSnap.docs.map((matchDoc) => {
                        const matchData = matchDoc.data() as any;
                        const homeTeam = teamsMap.get(matchData.homeTeam);
                        const awayTeam = teamsMap.get(matchData.awayTeam);

                        return {
                            id: matchDoc.id,
                            competitionId: compDoc.id,
                            competitionName: competitionData.name,
                            competitionLogoUrl: competitionData.logoUrl,
                            season: competitionData.season,
                            roundId: roundDoc.id,
                            roundName: roundData.name,
                            matchDate: matchData.matchDate,
                            matchTime: matchData.matchTime,
                            homeTeamId: matchData.homeTeam,
                            awayTeamId: matchData.awayTeam,
                            homeTeamName: homeTeam?.name || '不明なチーム',
                            awayTeamName: awayTeam?.name || '不明なチーム',
                            homeTeamLogo: homeTeam?.logoUrl,
                            awayTeamLogo: awayTeam?.logoUrl,
                            scoreHome: matchData.scoreHome,
                            scoreAway: matchData.scoreAway,
                        } as Match;
                    });
                })
            );

            return matchesByRound.flat();
        })
    );

    enrichedMatches.push(...nestedMatches.flat());

    const friendlySnap = await db.collection(`clubs/${ownerUid}/friendly_matches`).get();
    friendlySnap.forEach((matchDoc) => {
        const matchData = matchDoc.data() as any;
        if (latestSeason) {
          const s = getSeasonFromMatchDate(String(matchData.matchDate || ''));
          if (s && s !== latestSeason) return;
        }
        const compId = (matchData.competitionId as string) === 'practice' ? 'practice' : 'friendly';
        const compName = matchData.competitionName || (compId === 'practice' ? '練習試合' : '親善試合');
        const homeTeam = teamsMap.get(matchData.homeTeam);
        const awayTeam = teamsMap.get(matchData.awayTeam);

        enrichedMatches.push({
            id: matchDoc.id,
            competitionId: compId,
            competitionName: compName,
            competitionLogoUrl: matchData.competitionLogoUrl,
            roundId: 'single',
            roundName: typeof matchData.roundName === 'string' ? matchData.roundName : '',
            matchDate: matchData.matchDate,
            matchTime: matchData.matchTime,
            homeTeamId: matchData.homeTeam,
            awayTeamId: matchData.awayTeam,
            homeTeamName: matchData.homeTeamName || homeTeam?.name || '不明なチーム',
            awayTeamName: matchData.awayTeamName || awayTeam?.name || '不明なチーム',
            homeTeamLogo: matchData.homeTeamLogo || homeTeam?.logoUrl,
            awayTeamLogo: matchData.awayTeamLogo || awayTeam?.logoUrl,
            scoreHome: matchData.scoreHome,
            scoreAway: matchData.scoreAway,
        });
    });

    // 4. Sort all matches by date
    enrichedMatches.sort((a, b) => new Date(a.matchDate).getTime() - new Date(b.matchDate).getTime());

    return { matches: enrichedMatches, clubName, ownerUid, logoUrl, mainTeamId, resolvedMainTeamId, snsLinks, sponsors, legalPages, homeBgColor, gameTeamUsage, latestSeason };
}

export default async function ResultsPage({
  params,
}: {
  params: { clubId: string };
}) {
    const { clubId } = params; // public slug

    if (clubId === 'admin') {
        notFound();
    }

    const data = await getMatchesForClub(clubId);

    if (!data) {
        notFound();
    }

    const { matches, clubName, ownerUid, logoUrl, mainTeamId, resolvedMainTeamId, snsLinks, sponsors, legalPages, homeBgColor, gameTeamUsage, latestSeason } = data as any;

    return (
        <main className="min-h-screen flex flex-col" style={homeBgColor ? { backgroundColor: homeBgColor } : undefined}>
          <ClubHeader clubId={clubId} clubName={clubName} logoUrl={logoUrl} snsLinks={snsLinks} />
          <div className="flex-1">
            <MatchList 
              allMatches={matches} 
              clubId={resolvedMainTeamId || mainTeamId || ownerUid} // 自チーム判定にはメインチームIDを優先（docIdへ解決）
              clubSlug={clubId} // public clubId slug for URLs
              clubName={clubName} 
              initialSelectedSeason={latestSeason || undefined}
            />
          </div>
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