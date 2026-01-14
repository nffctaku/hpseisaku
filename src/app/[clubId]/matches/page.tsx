import { db } from '@/lib/firebase/admin';
import { MatchDetails } from '@/types/match';
import { format, isValid, parseISO } from 'date-fns';
import Link from 'next/link';

function getMatchSortMs(m: { matchDate?: string; matchTime?: string } | null | undefined): number {
  const md: any = (m as any)?.matchDate;
  let base: Date | null = null;

  if (md?.toDate && typeof md.toDate === 'function') {
    base = md.toDate();
  } else if (md instanceof Date) {
    base = md;
  } else if (typeof md === 'string') {
    const raw = md.trim();
    if (!raw) return Number.POSITIVE_INFINITY;
    const normalized = raw
      .replace(/\//g, '-')
      .replace(/^(\d{4})-(\d{1,2})-(\d{1,2})$/, (_m, y, mo, da) => `${y}-${String(mo).padStart(2, '0')}-${String(da).padStart(2, '0')}`);
    const iso = parseISO(normalized);
    base = isValid(iso) ? iso : new Date(normalized);
  }

  const baseMs = base instanceof Date && !Number.isNaN(base.getTime()) ? base.getTime() : Number.POSITIVE_INFINITY;

  const rawTime = typeof m?.matchTime === 'string' ? m.matchTime.trim() : '';
  const tm = rawTime.match(/^\s*(\d{1,2}):(\d{2})\s*$/);
  if (!tm) return baseMs;
  const hh = Math.min(23, Math.max(0, Number(tm[1])));
  const mm = Math.min(59, Math.max(0, Number(tm[2])));
  return baseMs + (hh * 60 + mm) * 60 * 1000;
}

interface PageProps {
  params: { clubId: string };
}

type MatchIndexRow = {
  matchId: string;
  competitionId: string;
  roundId: string;
  matchDate: string;
  matchTime?: string;
  competitionName?: string;
  roundName?: string;
  homeTeam?: string;
  awayTeam?: string;
  homeTeamName?: string;
  awayTeamName?: string;
  homeTeamLogo?: string;
  awayTeamLogo?: string;
  scoreHome?: number | null;
  scoreAway?: number | null;
};

async function backfillPublicMatchIndex(ownerUid: string) {
  const indexRef = db.collection(`clubs/${ownerUid}/public_match_index`);

  const teamsSnap = await db.collection(`clubs/${ownerUid}/teams`).get();
  const teamsMap = new Map<string, { name: string; logoUrl?: string }>();
  teamsSnap.forEach((d) => teamsMap.set(d.id, { name: (d.data() as any).name, logoUrl: (d.data() as any).logoUrl }));

  const competitionsSnap = await db.collection(`clubs/${ownerUid}/competitions`).get();

  const nestedMatches = await Promise.all(
    competitionsSnap.docs.map(async (compDoc) => {
      const compData = compDoc.data() as any;
      const roundsSnap = await db.collection(`clubs/${ownerUid}/competitions/${compDoc.id}/rounds`).get();

      const byRound = await Promise.all(
        roundsSnap.docs.map(async (roundDoc) => {
          const roundData = roundDoc.data() as any;
          const matchesSnap = await db
            .collection(`clubs/${ownerUid}/competitions/${compDoc.id}/rounds/${roundDoc.id}/matches`)
            .get();

          return matchesSnap.docs.map((matchDoc) => {
            const m = matchDoc.data() as any;
            const homeTeam = teamsMap.get(m.homeTeam);
            const awayTeam = teamsMap.get(m.awayTeam);
            const matchDate = typeof m.matchDate === 'string' ? m.matchDate : '';
            const matchTime = typeof m.matchTime === 'string' ? m.matchTime : undefined;

            const row: MatchIndexRow = {
              matchId: matchDoc.id,
              competitionId: compDoc.id,
              roundId: roundDoc.id,
              matchDate,
              matchTime,
              competitionName: compData?.name,
              roundName: roundData?.name,
              homeTeam: m.homeTeam,
              awayTeam: m.awayTeam,
              homeTeamName: homeTeam?.name || m.homeTeamName,
              awayTeamName: awayTeam?.name || m.awayTeamName,
              homeTeamLogo: homeTeam?.logoUrl || m.homeTeamLogo,
              awayTeamLogo: awayTeam?.logoUrl || m.awayTeamLogo,
              scoreHome: typeof m.scoreHome === 'number' ? m.scoreHome : (m.scoreHome ?? null),
              scoreAway: typeof m.scoreAway === 'number' ? m.scoreAway : (m.scoreAway ?? null),
            };
            return row;
          });
        })
      );

      return byRound.flat();
    })
  );

  const friendlySnap = await db.collection(`clubs/${ownerUid}/friendly_matches`).get();
  const friendlyRows: MatchIndexRow[] = friendlySnap.docs.map((d) => {
    const m = d.data() as any;
    const compId = (m.competitionId as string) === 'practice' ? 'practice' : 'friendly';
    const compName = m.competitionName || (compId === 'practice' ? '練習試合' : '親善試合');
    const homeTeam = teamsMap.get(m.homeTeam);
    const awayTeam = teamsMap.get(m.awayTeam);
    return {
      matchId: d.id,
      competitionId: compId,
      roundId: 'single',
      matchDate: typeof m.matchDate === 'string' ? m.matchDate : '',
      matchTime: typeof m.matchTime === 'string' ? m.matchTime : undefined,
      competitionName: compName,
      roundName: m.roundName || '単発',
      homeTeam: m.homeTeam,
      awayTeam: m.awayTeam,
      homeTeamName: m.homeTeamName || homeTeam?.name,
      awayTeamName: m.awayTeamName || awayTeam?.name,
      homeTeamLogo: m.homeTeamLogo || homeTeam?.logoUrl,
      awayTeamLogo: m.awayTeamLogo || awayTeam?.logoUrl,
      scoreHome: typeof m.scoreHome === 'number' ? m.scoreHome : (m.scoreHome ?? null),
      scoreAway: typeof m.scoreAway === 'number' ? m.scoreAway : (m.scoreAway ?? null),
    };
  });

  const allRows = [...nestedMatches.flat(), ...friendlyRows].filter((r) => typeof r.matchDate === 'string' && r.matchDate);

  const commitBatch = async (rows: MatchIndexRow[]) => {
    const batch = db.batch();
    for (const row of rows) {
      const docId = `${row.competitionId}__${row.roundId}__${row.matchId}`;
      batch.set(indexRef.doc(docId), row, { merge: true });
    }
    await batch.commit();
  };

  // Firestore batch is limited to 500 ops. Keep margin.
  const chunkSize = 450;
  for (let i = 0; i < allRows.length; i += chunkSize) {
    await commitBatch(allRows.slice(i, i + chunkSize));
  }

  await indexRef.doc('_meta').set({ updatedAt: new Date().toISOString(), count: allRows.length }, { merge: true });
}

async function hasPublicMatchIndexData(ownerUid: string): Promise<boolean> {
  const ref = db.collection(`clubs/${ownerUid}/public_match_index`).limit(2);
  const snap = await ref.get();
  if (snap.empty) return false;
  if (snap.size === 1 && snap.docs[0].id === '_meta') return false;
  return true;
}

async function getClubMatches(clubId: string): Promise<{ clubName: string; groupedMatches: Record<string, MatchDetails[]> }> {
  let profileDoc: FirebaseFirestore.DocumentSnapshot | null = null;

  const profilesQuery = db.collection('club_profiles').where('clubId', '==', clubId).limit(1);
  const profilesSnap = await profilesQuery.get();
  if (!profilesSnap.empty) {
    profileDoc = profilesSnap.docs[0];
  } else {
    const directSnap = await db.collection('club_profiles').doc(clubId).get();
    if (directSnap.exists) profileDoc = directSnap;
  }

  if (!profileDoc) {
    return { clubName: 'クラブ', groupedMatches: {} };
  }

  const profileData = profileDoc.data() as any;
  const ownerUid = (profileData as any).ownerUid || profileDoc.id;
  const clubName = (profileData as any).clubName || 'クラブ';
  if (!ownerUid) {
    return { clubName, groupedMatches: {} };
  }

  // Fast-path: use public_match_index if present
  const indexRef = db.collection(`clubs/${ownerUid}/public_match_index`);
  if (await hasPublicMatchIndexData(ownerUid)) {
    const indexSnap = await indexRef.get();
    const rows = indexSnap.docs
      .filter((d) => d.id !== '_meta')
      .map((d) => d.data() as MatchIndexRow)
      .filter((r) => typeof r.matchDate === 'string' && r.matchDate);

    const matches: MatchDetails[] = rows
      .map((r) => ({
        id: r.matchId,
        competitionId: r.competitionId,
        roundId: r.roundId,
        homeTeam: r.homeTeam || '',
        awayTeam: r.awayTeam || '',
        homeTeamName: r.homeTeamName || '',
        awayTeamName: r.awayTeamName || '',
        competitionName: r.competitionName,
        roundName: r.roundName,
        homeTeamLogo: r.homeTeamLogo,
        awayTeamLogo: r.awayTeamLogo,
        matchDate: r.matchDate,
        matchTime: r.matchTime,
        scoreHome: r.scoreHome ?? null,
        scoreAway: r.scoreAway ?? null,
      }))
      .sort((a, b) => getMatchSortMs(a) - getMatchSortMs(b));

    const groupedMatches = matches.reduce((acc, match) => {
      const competitionName = match.competitionName || 'Uncategorized';
      if (!acc[competitionName]) {
        acc[competitionName] = [];
      }
      acc[competitionName].push(match);
      return acc;
    }, {} as Record<string, MatchDetails[]>);

    return { clubName, groupedMatches };
  }

  // If index is empty, backfill once and then read from index
  try {
    await backfillPublicMatchIndex(ownerUid);
    const refetched = await indexRef.get();
    const rows = refetched.docs
      .filter((d) => d.id !== '_meta')
      .map((d) => d.data() as MatchIndexRow)
      .filter((r) => typeof r.matchDate === 'string' && r.matchDate);

    const matches: MatchDetails[] = rows
      .map((r) => ({
        id: r.matchId,
        competitionId: r.competitionId,
        roundId: r.roundId,
        homeTeam: r.homeTeam || '',
        awayTeam: r.awayTeam || '',
        homeTeamName: r.homeTeamName || '',
        awayTeamName: r.awayTeamName || '',
        competitionName: r.competitionName,
        roundName: r.roundName,
        homeTeamLogo: r.homeTeamLogo,
        awayTeamLogo: r.awayTeamLogo,
        matchDate: r.matchDate,
        matchTime: r.matchTime,
        scoreHome: r.scoreHome ?? null,
        scoreAway: r.scoreAway ?? null,
      }))
      .sort((a, b) => getMatchSortMs(a) - getMatchSortMs(b));

    const groupedMatches = matches.reduce((acc, match) => {
      const competitionName = match.competitionName || 'Uncategorized';
      if (!acc[competitionName]) {
        acc[competitionName] = [];
      }
      acc[competitionName].push(match);
      return acc;
    }, {} as Record<string, MatchDetails[]>);

    return { clubName, groupedMatches };
  } catch (e) {
    // fall back to legacy path
  }

  const matchesRef = db.collection(`clubs/${ownerUid}/matches`);

  const homeQuery = matchesRef.where('homeTeam', '==', clubName);
  const awayQuery = matchesRef.where('awayTeam', '==', clubName);

  const [homeSnapshot, awaySnapshot, friendlySnap] = await Promise.all([
    homeQuery.get(),
    awayQuery.get(),
    db.collection(`clubs/${ownerUid}/friendly_matches`).get(),
  ]);

  const matches: MatchDetails[] = [];
  const matchIds = new Set<string>();

  homeSnapshot.forEach(doc => {
    if (!matchIds.has(doc.id)) {
      matches.push({ id: doc.id, ...doc.data() } as MatchDetails);
      matchIds.add(doc.id);
    }
  });

  awaySnapshot.forEach(doc => {
    if (!matchIds.has(doc.id)) {
      matches.push({ id: doc.id, ...doc.data() } as MatchDetails);
      matchIds.add(doc.id);
    }
  });

  // friendly/single matches
  friendlySnap.forEach((doc) => {
    if (matchIds.has(doc.id)) return;
    const data = doc.data() as any;
    const compId = (data.competitionId as string) === 'practice' ? 'practice' : 'friendly';
    const compName = data.competitionName || (compId === 'practice' ? '練習試合' : '親善試合');
    matches.push({
      id: doc.id,
      ...(data as any),
      competitionId: compId,
      roundId: 'single',
      competitionName: compName,
      roundName: typeof data.roundName === 'string' ? data.roundName : '',
    } as MatchDetails);
    matchIds.add(doc.id);
  });

  // Sort matches by date in the application
  matches.sort((a, b) => getMatchSortMs(a) - getMatchSortMs(b));

  const groupedMatches = matches.reduce((acc, match) => {
    const competitionName = match.competitionName || 'Uncategorized';
    if (!acc[competitionName]) {
      acc[competitionName] = [];
    }
    acc[competitionName].push(match);
    return acc;
  }, {} as Record<string, MatchDetails[]>);

  return { clubName, groupedMatches };
}

const MatchItem = ({ clubId, match }: { clubId: string; match: MatchDetails }) => (
    <Link
      href={`/${clubId}/matches/${match.competitionId}/${match.roundId}/${match.id}`}
      className="block"
    >
      <div className="grid grid-cols-3 items-center gap-4 py-3 border-b last:border-b-0">
          <div className="flex items-center gap-2 justify-end">
              <span className="text-sm md:text-base font-medium text-right">{match.homeTeamName}</span>
              {match.homeTeamLogo && <img src={match.homeTeamLogo} alt={match.homeTeamName} className="w-6 h-6 object-contain" />}
          </div>
          <div className="text-center">
              {match.scoreHome !== null && match.scoreAway !== null ? (
                  <span className="text-lg md:text-xl font-bold">{match.scoreHome} - {match.scoreAway}</span>
              ) : (
                  <span className="text-xs text-gray-500">{format(new Date(match.matchDate), 'HH:mm')}</span>
              )}
          </div>
          <div className="flex items-center gap-2 justify-start">
              {match.awayTeamLogo && <img src={match.awayTeamLogo} alt={match.awayTeamName} className="w-6 h-6 object-contain" />}
              <span className="text-sm md:text-base font-medium text-left">{match.awayTeamName}</span>
          </div>
      </div>
    </Link>
);


export default async function ClubMatchesPage({ params }: PageProps) {
  const { clubId } = params;
  const { clubName, groupedMatches } = await getClubMatches(clubId);
  const competitionNames = Object.keys(groupedMatches);

  return (
    <div className="container mx-auto px-4 py-8">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold tracking-tight">{clubName} - 試合日程</h1>
        </div>

        {competitionNames.length > 0 ? (
             <div className="space-y-8">
             {competitionNames.map((competitionName) => (
               <div key={competitionName}>
                 <h2 className="text-xl font-bold mb-4 border-l-4 border-blue-500 pl-3">{competitionName}</h2>
                 <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4">
                  {groupedMatches[competitionName].map((match) => (
                     <MatchItem key={match.id} clubId={clubId} match={match} />
                  ))}
                </div>
              </div>
            ))}
           </div>
        ) : (
            <p>{clubName}の試合予定はありません。</p>
        )}
    </div>
  );
}
