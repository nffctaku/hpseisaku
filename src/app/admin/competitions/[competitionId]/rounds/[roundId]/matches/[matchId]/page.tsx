"use client";

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { doc, getDoc, collection, query, where, getDocs, onSnapshot } from 'firebase/firestore';
import { Loader2 } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { MatchDetails, Player } from '@/types/match';
import { toDashSeason } from '@/lib/season';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MatchTeamStatsForm } from '@/components/match-team-stats-form';
import { SquadRegistrationForm } from '@/components/squad-registration-form';
import { MatchEventsPreview } from '@/components/match-events-preview';

export default function MatchAdminPage() {
  const { user, ownerUid: ownerUidFromContext } = useAuth();
  const params = useParams();
  const { competitionId, roundId, matchId } = params;

  const ownerUid = ownerUidFromContext || user?.uid;

  const [match, setMatch] = useState<MatchDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [homePlayers, setHomePlayers] = useState<Player[]>([]);
  const [awayPlayers, setAwayPlayers] = useState<Player[]>([]);
  const [resolvedMatchDocPath, setResolvedMatchDocPath] = useState<string | null>(null);
  const [seasonId, setSeasonId] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !ownerUid || typeof competitionId !== 'string') return;
    let cancelled = false;
    const fetchSeason = async () => {
      try {
        const compSnap = await getDoc(doc(db, `clubs/${ownerUid}/competitions/${competitionId}`));
        if (cancelled) return;
        const s = compSnap.exists() ? (compSnap.data() as any)?.season : undefined;
        setSeasonId(typeof s === 'string' ? s : null);
      } catch {
        if (cancelled) return;
        setSeasonId(null);
      }
    };
    fetchSeason();
    return () => {
      cancelled = true;
    };
  }, [user, ownerUid, competitionId]);

  useEffect(() => {
    if (!user || !ownerUid || typeof matchId !== 'string' || typeof competitionId !== 'string' || typeof roundId !== 'string') {
      setLoading(false);
      return;
    }

    // competition season is needed to filter players by roster
    if (seasonId === null) {
      return;
    }

    let unsubscribe: null | (() => void) = null;
    let cancelled = false;

    setLoading(true);

    const start = async () => {
      try {
        const matchDocRef = doc(db, `clubs/${ownerUid}/competitions/${competitionId}/rounds/${roundId}/matches/${matchId}`);
        const primarySnap = await getDoc(matchDocRef);

        // Fallback: if not found under competitions/rounds, try legacy top-level matches collection
        const resolvedRef = primarySnap.exists() ? matchDocRef : doc(db, `clubs/${ownerUid}/matches`, matchId as string);
        const resolvedSnap = primarySnap.exists() ? primarySnap : await getDoc(resolvedRef);
        if (!resolvedSnap.exists()) {
          console.error("Match document not found in either competitions/rounds or legacy matches collection");
          setMatch(null);
          setResolvedMatchDocPath(null);
          setLoading(false);
          return;
        }

        setResolvedMatchDocPath(resolvedRef.path);

        // To ensure team names and logos are present, fetch them if not already on the match doc
        const fetchTeamData = async (teamId: string) => {
          if (!teamId) return null;
          const teamDocRef = doc(db, `clubs/${ownerUid}/teams`, teamId);
          const teamDoc = await getDoc(teamDocRef);
          return teamDoc.exists() ? { name: teamDoc.data().name, logoUrl: teamDoc.data().logoUrl } : null;
        };

        const fetchPlayers = async (teamId: string): Promise<Player[]> => {
          if (!teamId || !user || !ownerUid) return [];
          const primaryRef = collection(db, `clubs/${ownerUid}/teams/${teamId}/players`);
          const primarySnap = await getDocs(primaryRef);
          if (!primarySnap.empty) {
            return primarySnap.docs.map((d) => ({ id: d.id, ...d.data() } as Player));
          }

          const legacyUid = user.uid;
          if (!legacyUid || legacyUid === ownerUid) return [];
          const fallbackRef = collection(db, `clubs/${legacyUid}/teams/${teamId}/players`);
          const fallbackSnap = await getDocs(fallbackRef);
          return fallbackSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Player));
        };

        const fetchRosterPlayersForTeam = async (teamId: string, teamPlayers: Player[]): Promise<Player[] | null> => {
          if (!ownerUid) return null;
          const rawSeason = typeof seasonId === 'string' ? seasonId.trim() : '';
          if (!rawSeason) return null;
          const seasonDash = toDashSeason(rawSeason);
          if (!seasonDash) return null;
          try {
            const rosterSnap = await getDocs(collection(db, `clubs/${ownerUid}/seasons/${seasonDash}/roster`));
            const teamPlayerIdSet = new Set(teamPlayers.map((p) => p.id));
            const byId = new Map<string, Player>();

            // Start with the team players (may be empty depending on account/data)
            for (const p of teamPlayers) {
              if (!p || !p.id) continue;
              byId.set(p.id, { ...p, teamId: p.teamId ?? teamId } as Player);
            }

            // Add all roster players for this team (even if not in team players collection)
            rosterSnap.docs.forEach((d) => {
              const data = d.data() as any;
              const tid = typeof data?.teamId === 'string' ? data.teamId.trim() : '';

              const isForThisTeam = tid
                ? tid === teamId
                : teamPlayerIdSet.has(d.id); // legacy roster without teamId

              if (!isForThisTeam) return;

              const existing = byId.get(d.id);
              if (existing) {
                byId.set(d.id, { ...existing, teamId: existing.teamId ?? tid ?? teamId } as Player);
                return;
              }

              // Build minimal player info from roster doc
              const sd = (data?.seasonData && typeof data.seasonData === 'object' ? data.seasonData : {}) as any;
              const seasonEntry = (sd?.[seasonDash] && typeof sd[seasonDash] === 'object' ? sd[seasonDash] : {}) as any;
              const name = (typeof data?.name === 'string' ? data.name : '') || (typeof seasonEntry?.name === 'string' ? seasonEntry.name : '') || '';
              const numberRaw = seasonEntry?.number ?? data?.number;
              const number = typeof numberRaw === 'number' && Number.isFinite(numberRaw) ? numberRaw : (Number(numberRaw) || 0);
              const position = (seasonEntry?.position ?? data?.position) as any;
              const photoURL = (seasonEntry?.photoUrl ?? data?.photoUrl ?? data?.photoURL) as any;

              byId.set(d.id, {
                id: d.id,
                name: name || '-',
                number,
                position: typeof position === 'string' ? position : undefined,
                photoURL: typeof photoURL === 'string' ? photoURL : undefined,
                teamId: tid || teamId,
              });
            });

            const out = Array.from(byId.values());
            out.sort((a, b) => {
              const na = typeof a?.number === 'number' && Number.isFinite(a.number) ? a.number : 9999;
              const nb = typeof b?.number === 'number' && Number.isFinite(b.number) ? b.number : 9999;
              if (na !== nb) return na - nb;
              const an = typeof a?.name === 'string' ? a.name : '';
              const bn = typeof b?.name === 'string' ? b.name : '';
              return an.localeCompare(bn, 'ja');
            });
            return out;
          } catch {
            return null;
          }
        };

        unsubscribe = onSnapshot(
          resolvedRef,
          async (snap) => {
            if (cancelled) return;
            if (!snap.exists()) {
              setMatch(null);
              setLoading(false);
              return;
            }

            const raw = snap.data() as any;
            let matchData = { id: snap.id, ...raw } as MatchDetails;

            const [homeTeamData, awayTeamData] = await Promise.all([
              fetchTeamData(matchData.homeTeam),
              fetchTeamData(matchData.awayTeam)
            ]);

            matchData = {
              ...matchData,
              homeTeamName: homeTeamData?.name || matchData.homeTeamName || 'Home Team',
              homeTeamLogo: homeTeamData?.logoUrl || matchData.homeTeamLogo,
              awayTeamName: awayTeamData?.name || matchData.awayTeamName || 'Away Team',
              awayTeamLogo: awayTeamData?.logoUrl || matchData.awayTeamLogo,
            };

            setMatch(matchData);

            if (matchData.homeTeam && matchData.awayTeam) {
              const [home, away] = await Promise.all([
                fetchPlayers(matchData.homeTeam),
                fetchPlayers(matchData.awayTeam),
              ]);

              const [homeRosterPlayers, awayRosterPlayers] = await Promise.all([
                fetchRosterPlayersForTeam(matchData.homeTeam, home),
                fetchRosterPlayersForTeam(matchData.awayTeam, away),
              ]);

              setHomePlayers(homeRosterPlayers ?? home);
              setAwayPlayers(awayRosterPlayers ?? away);
            }

            setLoading(false);
          },
          (error) => {
            if (cancelled) return;
            console.error("Error fetching match data: ", error);
            setMatch(null);
            setResolvedMatchDocPath(null);
            setLoading(false);
          }
        );
      } catch (error) {
        if (cancelled) return;
        console.error("Error fetching match data: ", error);
        setMatch(null);
        setResolvedMatchDocPath(null);
        setLoading(false);
      }
    };

    start();

    return () => {
      cancelled = true;
      if (unsubscribe) unsubscribe();
    };
  }, [user, ownerUid, competitionId, roundId, matchId, seasonId]);

  if (loading) {
    return <div className="flex h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  if (!user) {
    return <div className="flex h-screen items-center justify-center">ログインしてください。</div>;
  }

  if (!match) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="bg-white text-gray-900 rounded-lg shadow p-8 text-center space-y-4">
          <p>試合データが見つかりませんでした。</p>
          <p className="text-sm text-gray-500">URLが古いか、試合が削除された可能性があります。</p>
          <Link href={`/admin/competitions/${competitionId}`}>
            <span className="inline-flex items-center px-4 py-2 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700">大会ページに戻る</span>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-4xl py-6 sm:py-10">
      <div className="mb-4">
        <Link
          href={(() => {
            const s = typeof seasonId === "string" ? seasonId.trim() : "";
            return s ? `/admin/matches?season=${encodeURIComponent(s)}` : "/admin/matches";
          })()}
          className="inline-flex items-center rounded-md border bg-white px-3 py-2 text-xs text-gray-900 shadow-sm hover:bg-gray-50"
        >
          ← 試合管理へ戻る
        </Link>
      </div>
      <div className="bg-card border rounded-lg p-6">
        <div className="flex flex-col sm:flex-row sm:justify-center sm:items-center gap-6 mb-6">
          <div className="flex items-center justify-between sm:justify-center sm:w-1/3">
            <div className="flex flex-col items-center gap-2">
              {match.homeTeamLogo && (
                <Image
                  src={match.homeTeamLogo}
                  alt={match.homeTeamName}
                  width={56}
                  height={56}
                  className="rounded-full object-contain"
                />
              )}
              <h2 className="text-base sm:text-2xl font-bold text-center leading-tight max-w-[10ch] break-words min-h-[2.5rem] sm:min-h-0">
                {match.homeTeamName}
              </h2>
            </div>

            <div className="flex flex-col items-center justify-center px-2 sm:hidden">
              <p className="text-xs text-muted-foreground">
                {new Date(match.matchDate).toLocaleDateString("ja-JP", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                  weekday: "long",
                })}
              </p>
              <div className="text-4xl font-bold">
                {typeof match.scoreHome === "number" ? match.scoreHome : "-"}
                <span className="mx-3">-</span>
                {typeof match.scoreAway === "number" ? match.scoreAway : "-"}
              </div>
            </div>

            <div className="flex flex-col items-center gap-2 sm:hidden">
              {match.awayTeamLogo && (
                <Image
                  src={match.awayTeamLogo}
                  alt={match.awayTeamName}
                  width={56}
                  height={56}
                  className="rounded-full object-contain"
                />
              )}
              <h2 className="text-base sm:text-2xl font-bold text-center leading-tight max-w-[10ch] break-words min-h-[2.5rem] sm:min-h-0">
                {match.awayTeamName}
              </h2>
            </div>
          </div>

          <div className="hidden sm:flex flex-col items-center justify-center px-4">
            <p className="text-sm text-muted-foreground">
              {new Date(match.matchDate).toLocaleDateString("ja-JP", {
                year: "numeric",
                month: "long",
                day: "numeric",
                weekday: "long",
              })}
            </p>
            <div className="text-5xl font-bold">
              {typeof match.scoreHome === "number" ? match.scoreHome : "-"}
              <span className="mx-4">-</span>
              {typeof match.scoreAway === "number" ? match.scoreAway : "-"}
            </div>
          </div>

          <div className="hidden sm:flex flex-col items-center gap-2 w-1/3">
            {match.awayTeamLogo && (
              <Image
                src={match.awayTeamLogo}
                alt={match.awayTeamName}
                width={72}
                height={72}
                className="rounded-full object-contain"
              />
            )}
            <h2 className="text-2xl font-bold text-center">{match.awayTeamName}</h2>
          </div>
        </div>
      </div>

      <Tabs defaultValue="match-stats" className="mt-8">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="match-stats" className="px-2 text-xs sm:px-3 sm:text-sm">試合スタッツ</TabsTrigger>
          <TabsTrigger value="player-stats" className="px-2 text-xs sm:px-3 sm:text-sm">選手スタッツ</TabsTrigger>
          <TabsTrigger value="match-events" className="px-2 text-xs sm:px-3 sm:text-sm">試合イベント</TabsTrigger>
        </TabsList>
        <TabsContent value="match-stats">
          <MatchTeamStatsForm 
            match={match} 
            userId={ownerUid as string}
            competitionId={competitionId as string}
            roundId={roundId as string}
            matchDocPath={resolvedMatchDocPath ?? undefined}
          />
        </TabsContent>
        <TabsContent value="player-stats">
          <SquadRegistrationForm 
            match={match} 
            homePlayers={homePlayers} 
            awayPlayers={awayPlayers} 
            roundId={roundId as string} 
            competitionId={competitionId as string} 
            matchDocPath={resolvedMatchDocPath ?? undefined}
            seasonId={seasonId ?? undefined}
            view="player"
          />
        </TabsContent>
        <TabsContent value="match-events">
          <SquadRegistrationForm 
            match={match} 
            homePlayers={homePlayers} 
            awayPlayers={awayPlayers} 
            roundId={roundId as string} 
            competitionId={competitionId as string} 
            matchDocPath={resolvedMatchDocPath ?? undefined}
            seasonId={seasonId ?? undefined}
            view="events"
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
