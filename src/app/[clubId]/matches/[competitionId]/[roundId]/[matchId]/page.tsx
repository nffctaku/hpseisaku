import { db } from "@/lib/firebase/admin";
import { notFound } from "next/navigation";
import Image from "next/image";
import type { MatchDetails, TeamStat, PlayerStats, MatchEvent } from "@/types/match";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ClubHeader } from "@/components/club-header";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ClubFooter } from "@/components/club-footer";
import { PartnerStripClient } from "@/components/partner-strip-client";
import { formatMinute } from "@/lib/formatMinute";

const getFormationSlots = (formation: string) => {
  const lines = formation
    .split('-')
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v) && v > 0);
  const outfieldTotal = lines.reduce((sum, count) => sum + count, 0);
  const normalizedLines = outfieldTotal === 10 && lines.length > 0 ? lines : [4, 3, 3];
  const yByLineCount: Record<number, number[]> = {
    3: [68, 45, 20],
    4: [70, 53, 35, 17],
    5: [72, 58, 44, 30, 16],
  };
  const yList = yByLineCount[normalizedLines.length] || Array.from(
    { length: normalizedLines.length },
    (_, index) => 70 - index * (55 / Math.max(normalizedLines.length - 1, 1))
  );
  const slots = [{ label: 'GK', x: 50, y: 88 }];

  normalizedLines.forEach((count, lineIndex) => {
    const y = yList[lineIndex] ?? 50;
    const label = lineIndex === 0 ? 'DF' : lineIndex === normalizedLines.length - 1 ? 'FW' : 'MF';
    const xMinByCount: Record<number, number> = { 2: 34, 3: 24, 4: 15, 5: 10 };
    const xMaxByCount: Record<number, number> = { 2: 66, 3: 76, 4: 85, 5: 90 };
    const xMin = xMinByCount[count] ?? 12;
    const xMax = xMaxByCount[count] ?? 88;
    const xs = count === 1
      ? [50]
      : Array.from({ length: count }, (_, index) => xMin + index * ((xMax - xMin) / (count - 1)));

    xs.forEach((x) => {
      slots.push({ label, x, y });
    });
  });

  return slots.slice(0, 11);
};

interface PageProps {
  params: Promise<{ clubId: string; competitionId: string; roundId: string; matchId: string }>;
}

async function getMatchDetail(
  clubId: string,
  competitionId: string,
  roundId: string,
  matchId: string,
): Promise<{
  clubName: string;
  logoUrl: string | null;
  snsLinks: any;
  sponsors: any[];
  legalPages: any[];
  homeBgColor?: string;
  gameTeamUsage: boolean;
  match: MatchDetails | null;
} | null> {
  // resolve club profile to ownerUid
  let profileDoc: FirebaseFirestore.DocumentSnapshot | null = null;

  const profilesQuery = db.collection("club_profiles").where("clubId", "==", clubId).limit(1);
  const profilesSnap = await profilesQuery.get();
  if (!profilesSnap.empty) {
    profileDoc = profilesSnap.docs[0];
  } else {
    const directRef = db.collection("club_profiles").doc(clubId);
    const directSnap = await directRef.get();
    if (directSnap.exists) profileDoc = directSnap;
  }

  if (!profileDoc) return null;
  const profileData = profileDoc.data() as any;
  const ownerUid = (profileData as any).ownerUid || profileDoc.id;
  const clubName = (profileData as any).clubName || "";
  const logoUrl = (profileData as any).logoUrl || null;
  const snsLinks = (profileData as any).snsLinks || {};
  const sponsors = Array.isArray((profileData as any).sponsors) ? (profileData as any).sponsors : [];
  const legalPages = Array.isArray((profileData as any).legalPages) ? (profileData as any).legalPages : [];
  const homeBgColor = typeof (profileData as any).homeBgColor === "string" ? (profileData as any).homeBgColor : undefined;
  const gameTeamUsage = Boolean((profileData as any).gameTeamUsage);
  if (!ownerUid) return null;

  // Friendly/Practice single match
  if (competitionId === 'friendly' || competitionId === 'practice') {
    const friendlyRef = db.doc(`clubs/${ownerUid}/friendly_matches/${matchId}`);
    const friendlySnap = await friendlyRef.get();
    if (friendlySnap.exists) {
      const data = friendlySnap.data() as any;

      const compId = (data.competitionId as string) === 'practice' ? 'practice' : competitionId;
      const compName = data.competitionName || (compId === 'practice' ? '練習試合' : '親善試合');

      const fetchTeamData = async (teamId: string | undefined) => {
        if (!teamId) return null;
        const teamDoc = await db.doc(`clubs/${ownerUid}/teams/${teamId}`).get();
        return teamDoc.exists ? (teamDoc.data() as any) : null;
      };

      const [homeTeamData, awayTeamData] = await Promise.all([
        fetchTeamData(data.homeTeam),
        fetchTeamData(data.awayTeam),
      ]);

      const fetchTeamPlayers = async (teamId: string | undefined) => {
        if (!teamId) return [] as { id: string; number: number; position?: string; photoUrl?: string; name?: string }[];
        const snap = await db.collection(`clubs/${ownerUid}/teams/${teamId}/players`).get();
        return snap.docs.map((d) => {
          const pd = d.data() as any;
          return {
            id: d.id,
            number: Number(pd.number) || 0,
            position: pd.position,
            photoUrl: pd.photoUrl || pd.photoURL,
            name: pd.name,
          };
        });
      };

      const [homePlayersMeta, awayPlayersMeta] = await Promise.all([
        fetchTeamPlayers(data.homeTeam),
        fetchTeamPlayers(data.awayTeam),
      ]);

      const playerMetaMap: Record<string, { number: number; position?: string; photoUrl?: string; name?: string }> = {};
      [...homePlayersMeta, ...awayPlayersMeta].forEach((p) => {
        playerMetaMap[p.id] = { number: p.number, position: p.position, photoUrl: p.photoUrl, name: p.name };
      });

      const playerTeamMap: Record<string, string> = {};
      homePlayersMeta.forEach((p) => {
        if (p?.id && data.homeTeam) playerTeamMap[p.id] = data.homeTeam;
      });
      awayPlayersMeta.forEach((p) => {
        if (p?.id && data.awayTeam) playerTeamMap[p.id] = data.awayTeam;
      });

      const match: MatchDetails = {
        id: friendlySnap.id,
        competitionId: compId,
        roundId: 'single',
        homeTeam: data.homeTeam,
        awayTeam: data.awayTeam,
        homeTeamName: homeTeamData?.name || data.homeTeamName || "",
        awayTeamName: awayTeamData?.name || data.awayTeamName || "",
        competitionName: compName,
        roundName: data.roundName || '単発',
        homeTeamLogo: homeTeamData?.logoUrl || data.homeTeamLogo,
        awayTeamLogo: awayTeamData?.logoUrl || data.awayTeamLogo,
        matchDate: data.matchDate,
        matchTime: data.matchTime,
        scoreHome: data.scoreHome ?? null,
        scoreAway: data.scoreAway ?? null,
        userId: ownerUid,
        teamStats: (data.teamStats || []) as TeamStat[],
        playerStats: (data.playerStats || []) as PlayerStats[],
        homeSquad: data.homeSquad,
        awaySquad: data.awaySquad,
        homeFormation: data.homeFormation,
        awayFormation: data.awayFormation,
        ...(data.events ? { events: data.events } : {}),
      } as any;

      (match as any).playerMetaMap = playerMetaMap;
      (match as any).playerTeamMap = playerTeamMap;

      return { clubName, logoUrl, snsLinks, sponsors, legalPages, homeBgColor, gameTeamUsage, match };
    }
  }

  const matchRef = db.doc(
    `clubs/${ownerUid}/competitions/${competitionId}/rounds/${roundId}/matches/${matchId}`,
  );
  const matchSnap = await matchRef.get();
  if (matchSnap.exists) {
    const data = matchSnap.data() as any;

    // 補完用にチーム情報を取得（名前・ロゴ）
    const fetchTeamData = async (teamId: string | undefined) => {
      if (!teamId) return null;
      const teamDoc = await db.doc(`clubs/${ownerUid}/teams/${teamId}`).get();
      return teamDoc.exists ? teamDoc.data() as any : null;
    };

    const [homeTeamData, awayTeamData] = await Promise.all([
      fetchTeamData(data.homeTeam),
      fetchTeamData(data.awayTeam),
    ]);

    const fetchTeamPlayers = async (teamId: string | undefined) => {
      if (!teamId) return [] as { id: string; number: number; position?: string; photoUrl?: string; name?: string }[];
      const snap = await db.collection(`clubs/${ownerUid}/teams/${teamId}/players`).get();
      return snap.docs.map((d) => {
        const pd = d.data() as any;
        return {
          id: d.id,
          number: Number(pd.number) || 0,
          position: pd.position,
          photoUrl: pd.photoUrl || pd.photoURL,
          name: pd.name,
        };
      });
    };

    const [homePlayersMeta, awayPlayersMeta] = await Promise.all([
      fetchTeamPlayers(data.homeTeam),
      fetchTeamPlayers(data.awayTeam),
    ]);

    const playerMetaMap: Record<string, { number: number; position?: string; photoUrl?: string; name?: string }> = {};
    [...homePlayersMeta, ...awayPlayersMeta].forEach((p) => {
      playerMetaMap[p.id] = { number: p.number, position: p.position, photoUrl: p.photoUrl, name: p.name };
    });

    const playerTeamMap: Record<string, string> = {};
    homePlayersMeta.forEach((p) => {
      if (p?.id && data.homeTeam) playerTeamMap[p.id] = data.homeTeam;
    });
    awayPlayersMeta.forEach((p) => {
      if (p?.id && data.awayTeam) playerTeamMap[p.id] = data.awayTeam;
    });

    // 大会名・ラウンド名がマッチドキュメントに無ければ、元のコレクションから補完
    let competitionName = data.competitionName as string | undefined;
    let roundName = data.roundName as string | undefined;
    if (!competitionName || !roundName) {
      const [compDoc, roundDoc] = await Promise.all([
        !competitionName ? db.doc(`clubs/${ownerUid}/competitions/${competitionId}`).get() : Promise.resolve(null as any),
        !roundName ? db.doc(`clubs/${ownerUid}/competitions/${competitionId}/rounds/${roundId}`).get() : Promise.resolve(null as any),
      ]);
      if (!competitionName && compDoc && compDoc.exists) {
        competitionName = (compDoc.data() as any).name;
      }
      if (!roundName && roundDoc && roundDoc.exists) {
        roundName = (roundDoc.data() as any).name;
      }
    }

    const match: MatchDetails = {
      id: matchSnap.id,
      competitionId,
      roundId,
      homeTeam: data.homeTeam,
      awayTeam: data.awayTeam,
      homeTeamName: homeTeamData?.name || data.homeTeamName || "",
      awayTeamName: awayTeamData?.name || data.awayTeamName || "",
      competitionName: competitionName,
      roundName: roundName,
      homeTeamLogo: homeTeamData?.logoUrl || data.homeTeamLogo,
      awayTeamLogo: awayTeamData?.logoUrl || data.awayTeamLogo,
      matchDate: data.matchDate,
      matchTime: data.matchTime,
      scoreHome: data.scoreHome ?? null,
      scoreAway: data.scoreAway ?? null,
      userId: ownerUid,
      teamStats: (data.teamStats || []) as TeamStat[],
      playerStats: (data.playerStats || []) as PlayerStats[],
      homeSquad: data.homeSquad,
      awaySquad: data.awaySquad,
      homeFormation: data.homeFormation,
      awayFormation: data.awayFormation,
      // 追加でそのまま渡したいフィールド（events, venue など）は any 経由で扱う
      // 型定義には入っていなくても JSX 側では (match as any).events などで読める
      ...(data.events ? { events: data.events } : {}),
      ...(data.venue ? { venue: data.venue } : {}),
      ...(data.stadium ? { stadium: data.stadium } : {}),
    } as any;

    (match as any).playerMetaMap = playerMetaMap;
    (match as any).playerTeamMap = playerTeamMap;

    return { clubName, logoUrl, snsLinks, sponsors, legalPages, homeBgColor, gameTeamUsage, match };
  }

  // Fallback: legacy flat matches collection
  const flatMatchRef = db.doc(`clubs/${ownerUid}/matches/${matchId}`);
  const flatSnap = await flatMatchRef.get();
  if (!flatSnap.exists) {
    return { clubName, logoUrl, snsLinks, sponsors, legalPages, homeBgColor, gameTeamUsage, match: null };
  }

  const data = flatSnap.data() as any;

  const fetchTeamData = async (teamId: string | undefined) => {
    if (!teamId) return null;
    const teamDoc = await db.doc(`clubs/${ownerUid}/teams/${teamId}`).get();
    return teamDoc.exists ? teamDoc.data() as any : null;
  };

  const [homeTeamData, awayTeamData] = await Promise.all([
    fetchTeamData(data.homeTeam),
    fetchTeamData(data.awayTeam),
  ]);

  const fetchTeamPlayers = async (teamId: string | undefined) => {
    if (!teamId) return [] as { id: string; number: number; position?: string; photoUrl?: string; name?: string }[];
    const snap = await db.collection(`clubs/${ownerUid}/teams/${teamId}/players`).get();
    return snap.docs.map((d) => {
      const pd = d.data() as any;
      return {
        id: d.id,
        number: Number(pd.number) || 0,
        position: pd.position,
        photoUrl: pd.photoUrl || pd.photoURL,
        name: pd.name,
      };
    });
  };

  const [homePlayersMeta, awayPlayersMeta] = await Promise.all([
    fetchTeamPlayers(data.homeTeam),
    fetchTeamPlayers(data.awayTeam),
  ]);

  const playerMetaMap: Record<string, { number: number; position?: string; photoUrl?: string; name?: string }> = {};
  [...homePlayersMeta, ...awayPlayersMeta].forEach((p) => {
    playerMetaMap[p.id] = { number: p.number, position: p.position, photoUrl: p.photoUrl, name: p.name };
  });

  const playerTeamMap: Record<string, string> = {};
  homePlayersMeta.forEach((p) => {
    if (p?.id && data.homeTeam) playerTeamMap[p.id] = data.homeTeam;
  });
  awayPlayersMeta.forEach((p) => {
    if (p?.id && data.awayTeam) playerTeamMap[p.id] = data.awayTeam;
  });

  // 大会名・ラウンド名の補完
  let competitionName = data.competitionName as string | undefined;
  let roundName = data.roundName as string | undefined;
  if (!competitionName) {
    const compDoc = await db.doc(`clubs/${ownerUid}/competitions/${competitionId}`).get();
    if (compDoc.exists) {
      competitionName = (compDoc.data() as any).name;
    }
  }
  if (!roundName) {
    const roundDoc = await db.doc(`clubs/${ownerUid}/competitions/${competitionId}/rounds/${roundId}`).get();
    if (roundDoc.exists) {
      roundName = (roundDoc.data() as any).name;
    }
  }

  const match: MatchDetails = {
    id: flatSnap.id,
    competitionId: data.competitionId || competitionId,
    roundId: data.roundId || roundId,
    homeTeam: data.homeTeam,
    awayTeam: data.awayTeam,
    homeTeamName: homeTeamData?.name || data.homeTeamName || "",
    awayTeamName: awayTeamData?.name || data.awayTeamName || "",
    competitionName: competitionName,
    roundName: roundName,
    homeTeamLogo: homeTeamData?.logoUrl || data.homeTeamLogo,
    awayTeamLogo: awayTeamData?.logoUrl || data.awayTeamLogo,
    matchDate: data.matchDate,
    matchTime: data.matchTime,
    scoreHome: data.scoreHome ?? null,
    scoreAway: data.scoreAway ?? null,
    userId: ownerUid,
    teamStats: (data.teamStats || []) as TeamStat[],
    playerStats: (data.playerStats || []) as PlayerStats[],
    homeSquad: data.homeSquad,
    awaySquad: data.awaySquad,
    homeFormation: data.homeFormation,
    awayFormation: data.awayFormation,
    ...(data.events ? { events: data.events } : {}),
    ...(data.venue ? { venue: data.venue } : {}),
    ...(data.stadium ? { stadium: data.stadium } : {}),
  } as any;

  (match as any).playerMetaMap = playerMetaMap;
  (match as any).playerTeamMap = playerTeamMap;

  return { clubName, logoUrl, snsLinks, sponsors, legalPages, homeBgColor, gameTeamUsage, match };
}

export const dynamic = 'force-dynamic';

export default async function MatchDetailPage({ params }: PageProps) {
  const { clubId, competitionId, roundId, matchId } = await params;

  if (clubId === "admin") notFound();

  const data = await getMatchDetail(clubId, competitionId, roundId, matchId);
  if (!data || !data.match) notFound();

  const { clubName, logoUrl, match } = data;

  const matchDate = new Date(match.matchDate);
  const events: MatchEvent[] = ((match as any).events || []) as MatchEvent[];
  const playerMetaMap = ((match as any).playerMetaMap || {}) as Record<
    string,
    { number: number; position?: string; photoUrl?: string; name?: string }
  >;
  const playerTeamMap = ((match as any).playerTeamMap || {}) as Record<string, string>;

  const venue: string | undefined = (match as any).venue || (match as any).stadium;

  const subOutMinuteByPlayerId = new Map<string, number>();
  const subInMinuteByPlayerId = new Map<string, number>();
  events.forEach((ev: any) => {
    if (ev.type === "sub_out" && ev.playerId) {
      subOutMinuteByPlayerId.set(ev.playerId, ev.minute);
    }
    if (ev.type === "sub_in" && ev.playerId) {
      subInMinuteByPlayerId.set(ev.playerId, ev.minute);
    }
  });

  const homeGoals = events
    .filter((e: any) =>
      (e.type === "goal" && e.teamId === match.homeTeam) || (e.type === "og" && e.teamId === match.awayTeam)
    )
    .sort((a: any, b: any) => (a.minute ?? 0) - (b.minute ?? 0));
  const awayGoals = events
    .filter((e: any) =>
      (e.type === "goal" && e.teamId === match.awayTeam) || (e.type === "og" && e.teamId === match.homeTeam)
    )
    .sort((a: any, b: any) => (a.minute ?? 0) - (b.minute ?? 0));

  const teamStats = match.teamStats || [];

  // Derive lineups from playerStats (where role and teamId are stored)
  const playerStats = (match.playerStats || []) as any[];

  // playerId -> playerName map for displaying scorers
  const playerNameMap = new Map<string, string>();
  playerStats.forEach((ps) => {
    if (ps.playerId && ps.playerName) {
      playerNameMap.set(ps.playerId as string, ps.playerName as string);
    }
  });

  const resolveTeamId = (ps: any): string | null => {
    const raw = typeof ps?.teamId === 'string' ? ps.teamId : '';
    if (raw) return raw;
    const pid = typeof ps?.playerId === 'string' ? ps.playerId : '';
    if (!pid) return null;
    const inferred = playerTeamMap[pid];
    if (typeof inferred === 'string' && inferred.length > 0) return inferred;
    return null;
  };

  const isStarter = (ps: any) => ps.role === "starter" || !ps.role;
  const isSub = (ps: any) => ps.role && ps.role !== "starter";

  const homeStarters = playerStats.filter((ps) => resolveTeamId(ps) === match.homeTeam && isStarter(ps));
  const homeSubs = playerStats.filter((ps) => resolveTeamId(ps) === match.homeTeam && isSub(ps));
  const awayStarters = playerStats.filter((ps) => resolveTeamId(ps) === match.awayTeam && isStarter(ps));
  const awaySubs = playerStats.filter((ps) => resolveTeamId(ps) === match.awayTeam && isSub(ps));

  const positionOrder: Record<string, number> = { GK: 0, DF: 1, MF: 2, FW: 3 };
  const getPositionKey = (ps: any) => {
    const meta = ps.playerId ? playerMetaMap[ps.playerId] : undefined;
    const pos = (meta?.position || ps.position || '').toString().toUpperCase();
    return positionOrder[pos] ?? 99;
  };
  const getNumberKey = (ps: any) => {
    const meta = ps.playerId ? playerMetaMap[ps.playerId] : undefined;
    const n = meta?.number;
    return typeof n === 'number' && Number.isFinite(n) ? n : 999;
  };
  const sortLineup = (arr: any[]) =>
    arr
      .slice()
      .sort((a, b) => getPositionKey(a) - getPositionKey(b) || getNumberKey(a) - getNumberKey(b));

  const homeStartersSorted = sortLineup(homeStarters);
  const homeSubsSorted = sortLineup(homeSubs);
  const awayStartersSorted = sortLineup(awayStarters);
  const awaySubsSorted = sortLineup(awaySubs);

  const homeFormation = (match as any).homeFormation || '4-3-3';
  const awayFormation = (match as any).awayFormation || '4-3-3';
  const homePitchSlots = getFormationSlots(homeFormation);
  const awayPitchSlots = getFormationSlots(awayFormation);

  // Render pitch for a team
  const renderPitch = (starters: any[], pitchSlots: any[], formation: string) => {
    return (
      <div className="relative mx-auto aspect-[7/10] w-full overflow-hidden bg-[#0f1722] sm:aspect-[5/6] sm:max-w-[520px] rounded-lg">
        <div className="absolute right-3 top-3 z-20 rounded-full border border-slate-600 bg-slate-950/70 px-2 py-1 text-[10px] font-black tracking-wide text-white shadow-sm">
          {formation}
        </div>
        <div className="absolute inset-x-[6%] inset-y-[4%] border-2 border-slate-400/14" />
        <div className="absolute inset-x-[28%] top-[4%] h-[13%] border-x-2 border-b-2 border-slate-400/14" />
        <div className="absolute inset-x-[38%] top-[4%] h-[6%] border-x-2 border-b-2 border-slate-400/14" />
        <div className="absolute inset-x-[28%] bottom-[4%] h-[13%] border-x-2 border-t-2 border-slate-400/14" />
        <div className="absolute inset-x-[38%] bottom-[4%] h-[6%] border-x-2 border-t-2 border-slate-400/14" />
        <div className="absolute inset-x-[6%] top-1/2 h-px bg-slate-400/14" />
        <div className="absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-slate-400/14" />
        <div className="absolute inset-0 bg-[repeating-linear-gradient(0deg,rgba(255,255,255,0.025)_0px,rgba(255,255,255,0.025)_52px,transparent_52px,transparent_104px)]" />
        {pitchSlots.map((_, slot) => {
          const player = starters.find((p) => Number(p?.starterSlot) === slot);
          if (!player) return null;
          
          const meta = player?.playerId ? playerMetaMap[player.playerId] : undefined;
          const photoUrl = meta?.photoUrl || '';
          const playerName = meta?.name || player?.playerName || '';
          
          const goalsValue = Number(player?.goals) || 0;
          const assistsValue = Number(player?.assists) || 0;
          const yellowValue = Number(player?.yellowCards) || 0;
          const redValue = Number(player?.redCards) || 0;
          const showRedCard = redValue > 0 || yellowValue >= 2;
          const wasSubstituted = player?.playerId && events.some(
            (e: any) => e?.type === 'substitution' && (e?.outPlayerId === player?.playerId || e?.inPlayerId === player?.playerId)
          );
          const minutesValue = Number(player?.minutesPlayed) || 0;
          const ratingNumber = Number(player?.rating) || 0;
          const hasRating = Number.isFinite(ratingNumber) && ratingNumber > 0;
          const ratingValue = hasRating ? ratingNumber.toFixed(1) : '-';
          const ratingClassName = !hasRating
            ? 'bg-slate-700/80'
            : ratingNumber >= 7
              ? 'bg-emerald-500/90'
              : 'bg-orange-500/90';
          const pos = pitchSlots[slot];

          return (
            <div
              key={`pitch-slot-${slot}`}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
            >
              <div className="flex w-[62px] flex-col items-center gap-0.5 overflow-visible sm:w-[82px]">
                <div className="relative flex h-9 w-9 items-center justify-center rounded-full border border-slate-300/45 bg-slate-500/30 shadow-[0_0_0_3px_rgba(255,255,255,0.06)] sm:h-11 sm:w-11">
                  {photoUrl ? (
                    <div
                      className="h-full w-full rounded-full bg-slate-600/70 bg-cover bg-center"
                      style={{ backgroundImage: `url(${photoUrl})` }}
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-slate-200/90">
                      <div className="relative h-4 w-4 rounded-full border border-current before:absolute before:left-1/2 before:top-[62%] before:h-2 before:w-4 before:-translate-x-1/2 before:rounded-t-full before:border before:border-b-0 before:border-current sm:h-5 sm:w-5 sm:before:h-2.5 sm:before:w-4" />
                    </div>
                  )}
                  {goalsValue > 0 ? (
                    <span className="absolute -left-2 -top-2 inline-flex h-[10px] items-center gap-0 rounded-full bg-amber-500 px-1 py-0 text-[8px] font-bold leading-none text-white shadow-sm">
                      <svg viewBox="0 0 8 8" className="shrink-0 fill-none stroke-current" style={{ width: 10.5, height: 10.5 }} aria-hidden="true">
                        <circle cx="4" cy="4" r="2.85" strokeWidth="0.65" />
                        <path d="M4 2.1 5.25 3 4.8 4.55H3.2L2.75 3 4 2.1Z" strokeWidth="0.45" strokeLinejoin="round" />
                        <path d="M2.75 3 1.75 2.7M5.25 3l1-.3M3.2 4.55l-.7 1M4.8 4.55l.7 1" strokeWidth="0.4" strokeLinecap="round" />
                      </svg>
                      {goalsValue}
                    </span>
                  ) : null}
                  {assistsValue > 0 ? (
                    <span className="absolute -right-2 -top-2 inline-flex h-[10px] items-center gap-0 rounded-full bg-sky-500 px-1 py-0 text-[8px] font-bold leading-none text-white shadow-sm">
                      <svg viewBox="0 0 8 8" className="shrink-0 fill-none stroke-current" style={{ width: 10.5, height: 10.5 }} aria-hidden="true">
                        <path d="M1.2 5.1c1.5.1 2.7-.4 3.6-1.7l1 1 1.1.4c.4.1.7.5.7.9H1.7c-.3 0-.5-.2-.5-.5v-.1Z" strokeWidth="0.65" strokeLinejoin="round" />
                        <path d="M3.9 4.3 4.6 5M4.8 3.5l.7.7" strokeWidth="0.5" strokeLinecap="round" />
                      </svg>
                      {assistsValue}
                    </span>
                  ) : null}
                  {showRedCard ? (
                    <span className="absolute -left-1.5 top-1/2 h-4 w-2.5 -translate-y-1/2 rounded-[2px] bg-red-500 shadow-sm" />
                  ) : null}
                  {yellowValue > 0 ? (
                    <span className="absolute -right-1.5 top-1/2 h-4 w-2.5 -translate-y-1/2 rounded-[2px] bg-yellow-400 shadow-sm" />
                  ) : null}
                </div>
                <div className="w-[62px] truncate text-center text-[8px] font-semibold uppercase leading-tight tracking-wide text-slate-300 sm:w-[82px] sm:text-[9px]">
                  {playerName}
                </div>
                <div className="mt-0.5 flex w-[62px] flex-col items-center justify-center gap-0.5 text-[7px] font-bold leading-none text-white sm:w-[82px] sm:text-[8px]">
                  <div className="inline-flex h-[11px] items-center gap-0.5 text-[7px] font-bold leading-none text-white sm:text-[8px]">
                    {wasSubstituted && <span className="text-red-400 text-[8px]">⇔</span>}
                    <span className="inline-flex h-[11px] items-center rounded-full bg-slate-700/80 px-1 py-0 leading-[11px]">{minutesValue}'</span>
                    {hasRating && (
                      <span className={`inline-flex h-[11px] items-center rounded-full px-1 text-[7px] font-bold leading-[11px] text-white sm:text-[8px] ${ratingClassName}`}>
                        ★{ratingValue}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const hasLineups =
    homeStarters.length > 0 || homeSubs.length > 0 || awayStarters.length > 0 || awaySubs.length > 0;
  const hasTeamStats = teamStats.length > 0;
  const hasEvents = Array.isArray(events) && events.length > 0;

  const LineupPlayerCard = ({ ps }: { ps: any }) => {
    const minutes = Number(ps.minutesPlayed) || 0;
    const rating = Number(ps.rating) || 0;
    const goals = Number(ps.goals) || 0;
    const assists = Number(ps.assists) || 0;
    const yellowCards = Number(ps.yellowCards) || 0;
    const hasRating = rating > 0;
    const hasMinutes = minutes > 0;
    const meta = ps.playerId ? playerMetaMap[ps.playerId] : undefined;
    const numberLabel = meta?.number ? `${meta.number}` : "";
    const positionLabel = meta?.position || ps.position || "";
    const playerName = meta?.name || ps.playerName || "";

    const subOutMinute = ps.playerId ? subOutMinuteByPlayerId.get(ps.playerId) : undefined;
    const subInMinute = ps.playerId ? subInMinuteByPlayerId.get(ps.playerId) : undefined;
    const pillText =
      typeof subOutMinute === "number"
        ? `${formatMinute(subOutMinute)}'`
        : typeof subInMinute === "number"
          ? `${formatMinute(subInMinute)}'`
          : "";

    const ratingColor = rating >= 7.0 ? "text-emerald-500" : "text-orange-500";

    return (
      <div className="rounded-md border border-slate-700 bg-transparent px-3 py-2 text-sm flex items-center gap-3">
        <div className="relative shrink-0">
          <Avatar className="size-9">
            {meta?.photoUrl && <AvatarImage src={meta.photoUrl} alt={playerName} />}
            <AvatarFallback className="text-[11px] font-semibold">{playerName.slice(0, 1)}</AvatarFallback>
          </Avatar>
          {yellowCards > 0 && (
            <span className="absolute -right-1 -top-1 h-4 w-2.5 rounded-[2px] bg-yellow-400 shadow-sm" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold truncate">{playerName}</div>
          <div className="text-[11px] text-muted-foreground truncate">
            {numberLabel && `${numberLabel} `}
            {positionLabel}
          </div>
        </div>
        {pillText && (
          <span className="shrink-0 inline-flex h-[18px] items-center rounded-full bg-slate-700/80 px-2 py-0 text-[10px] font-bold leading-none text-white tabular-nums">
            {pillText}
          </span>
        )}
        {(hasMinutes || goals > 0 || assists > 0) && (
          <span className="shrink-0 inline-flex items-center gap-2">
            {goals > 0 && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground tabular-nums">
                <span className="text-[12px] leading-none rounded-full bg-amber-500 p-0.5">⚽</span>
                <span>{goals}</span>
              </span>
            )}
            {assists > 0 && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground tabular-nums">
                <span className="inline-flex h-[18px] w-[18px] items-center justify-center rounded-full bg-sky-500 text-white">
                  <svg viewBox="0 0 8 8" className="h-4 w-4 shrink-0 -rotate-45 fill-none stroke-current" aria-hidden="true">
                    <g transform="translate(0.2 -0.55)">
                      <path d="M1.2 5.1c1.5.1 2.7-.4 3.6-1.7l1 1 1.1.4c.4.1.7.5.7.9H1.7c-.3 0-.5-.2-.5-.5v-.1Z" strokeWidth="0.65" strokeLinejoin="round" />
                      <path d="M3.9 4.3 4.6 5M4.8 3.5l.7.7" strokeWidth="0.5" strokeLinecap="round" />
                    </g>
                  </svg>
                </span>
                <span>{assists}</span>
              </span>
            )}
            {hasMinutes && (
              <span className="inline-flex h-[18px] min-w-7 items-center justify-center rounded-full bg-slate-700/80 px-2 text-[10px] font-bold leading-none text-white tabular-nums">
                {minutes}'
              </span>
            )}
          </span>
        )}
        {hasRating && <span className={`text-xs font-semibold ${ratingColor} shrink-0`}>{rating.toFixed(1)}</span>}
      </div>
    );
  };

  const HomeLineups = (
    <div>
      <h3 className="text-center text-xs font-semibold text-muted-foreground mb-2">
        {match.homeTeamName} Starting Lineup
      </h3>
      <div className="space-y-2 mb-4">
        {homeStarters.length ? (
          homeStartersSorted.map((ps: any, idx: number) => {
            return (
              <div key={idx}>
                <LineupPlayerCard ps={ps} />
              </div>
            );
          })
        ) : (
          <p className="text-center text-xs text-muted-foreground py-2">スタメン情報がありません。</p>
        )}
      </div>
      <h4 className="text-center text-xs font-semibold text-muted-foreground mb-2">Substitutes</h4>
      <div className="space-y-2">
        {homeSubs.length ? (
          homeSubsSorted.map((ps: any, idx: number) => {
            return (
              <div key={idx}>
                <LineupPlayerCard ps={ps} />
              </div>
            );
          })
        ) : (
          <p className="text-center text-xs text-muted-foreground py-2">サブ情報がありません。</p>
        )}
      </div>
    </div>
  );

  const AwayLineups = (
    <div>
      <h3 className="text-center text-xs font-semibold text-muted-foreground mb-2">
        {match.awayTeamName} Starting Lineup
      </h3>
      <div className="space-y-2 mb-4">
        {awayStarters.length ? (
          awayStartersSorted.map((ps: any, idx: number) => {
            return (
              <div key={idx}>
                <LineupPlayerCard ps={ps} />
              </div>
            );
          })
        ) : (
          <p className="text-center text-xs text-muted-foreground py-2">スタメン情報がありません。</p>
        )}
      </div>
      <h4 className="text-center text-xs font-semibold text-muted-foreground mb-2">Substitutes</h4>
      <div className="space-y-2">
        {awaySubs.length ? (
          awaySubsSorted.map((ps: any, idx: number) => {
            return (
              <div key={idx}>
                <LineupPlayerCard ps={ps} />
              </div>
            );
          })
        ) : (
          <p className="text-center text-xs text-muted-foreground py-2">サブ情報がありません。</p>
        )}
      </div>
    </div>
  );

  const sponsors = (data as any).sponsors as any[] | undefined;
  const legalPages = (data as any).legalPages as any[] | undefined;
  const snsLinks = (data as any).snsLinks as any;
  const homeBgColor = (data as any).homeBgColor as string | undefined;
  const gameTeamUsage = Boolean((data as any).gameTeamUsage);

  return (
    <main className="min-h-screen bg-[#070c14] text-slate-100">
      <ClubHeader clubId={clubId} clubName={clubName} logoUrl={logoUrl} headerBackgroundColor={homeBgColor} snsLinks={snsLinks} />
      <div className="container mx-auto px-4 py-8 max-w-5xl space-y-8">
        {/* Header with league, date, venue, emblems & score */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-800/80 bg-[#070c14] px-4 py-8 shadow-2xl shadow-black/30 md:px-10 md:py-10">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-red-500/80" />
          {/* Top info: league, round, date, venue */}
          <div className="text-center space-y-1">
            <p className="text-[11px] font-black uppercase tracking-[0.28em] text-white">
              {match.competitionName}
              {match.roundId !== 'single' && match.roundName && ` ・ ${match.roundName}`}
            </p>
            <p className="text-xs font-semibold text-white">
              {matchDate.toLocaleDateString("ja-JP", {
                year: "numeric",
                month: "numeric",
                day: "numeric",
                weekday: "short",
              })}
              {match.matchTime && ` ・ ${match.matchTime}`}
              {(typeof match.scoreHome === "number" || typeof match.scoreAway === "number") && " ・ 試合終了"}
              {venue && ` ・ ${venue}`}
            </p>
          </div>

          {/* Teams row: name + emblem + score */}
          <div className="relative mt-10 flex min-h-[116px] items-center justify-between gap-3 md:min-h-[140px]">
            {/* Home side */}
            <div className="flex w-[34%] flex-col items-center gap-3">
              <div className="flex h-16 w-16 items-center justify-center md:h-20 md:w-20">
                {match.homeTeamLogo ? (
                  <Image
                    src={match.homeTeamLogo}
                    alt={match.homeTeamName}
                    width={52}
                    height={52}
                    className="object-contain md:h-16 md:w-16"
                  />
                ) : (
                  <div className="h-10 w-10 rounded-full bg-slate-700" />
                )}
              </div>
              <div className="max-w-[110px] truncate text-center text-sm font-black text-slate-100 md:max-w-[180px] md:text-base">{match.homeTeamName}</div>
            </div>

            {/* Score & status */}
            <div className="absolute left-1/2 top-1/2 z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center gap-4">
              <div className="flex items-center justify-center gap-2 text-6xl font-black leading-none tracking-tight text-slate-100 md:text-7xl">
                <span>{typeof match.scoreHome === "number" ? match.scoreHome : "-"}</span>
                <span className="text-4xl font-black text-white md:text-5xl">-</span>
                <span className="text-white">{typeof match.scoreAway === "number" ? match.scoreAway : "-"}</span>
              </div>
            </div>

            {/* Away side */}
            <div className="flex w-[34%] flex-col items-center gap-3">
              <div className="flex h-16 w-16 items-center justify-center md:h-20 md:w-20">
                {match.awayTeamLogo ? (
                  <Image
                    src={match.awayTeamLogo}
                    alt={match.awayTeamName}
                    width={52}
                    height={52}
                    className="object-contain md:h-16 md:w-16"
                  />
                ) : (
                  <div className="h-10 w-10 rounded-full bg-slate-700" />
                )}
              </div>
              <div className="max-w-[110px] truncate text-center text-sm font-black text-white md:max-w-[180px] md:text-base">{match.awayTeamName}</div>
            </div>
          </div>

          {/* Scorers row */}
          <div className="mx-auto mt-4 grid w-[320px] max-w-full grid-cols-2 gap-6 text-[11px] font-bold leading-relaxed text-white md:w-[420px] md:text-xs">
            <div className="space-y-0.5 text-right">
              {homeGoals.map((g) => {
                const ev: any = g;
                const nameFromEvent = ev.playerName as string | undefined;
                const nameFromMeta = g.playerId ? playerMetaMap[g.playerId]?.name : undefined;
                const nameFromStats = g.playerId ? playerNameMap.get(g.playerId) : undefined;
                const label = nameFromMeta || nameFromEvent || nameFromStats || "G";
                return (
                  <div key={g.id}>
                    {`${label} ${formatMinute(g.minute)}'`}
                  </div>
                );
              })}
            </div>
            <div className="space-y-0.5 text-left">
              {awayGoals.map((g) => {
                const ev: any = g;
                const nameFromEvent = ev.playerName as string | undefined;
                const nameFromMeta = g.playerId ? playerMetaMap[g.playerId]?.name : undefined;
                const nameFromStats = g.playerId ? playerNameMap.get(g.playerId) : undefined;
                const label = nameFromMeta || nameFromEvent || nameFromStats || "G";
                return (
                  <div key={g.id}>
                    {`${formatMinute(g.minute)}' ${label}`}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Tabs: Lineups / Stats / Events */}
        <Tabs
          defaultValue={hasLineups || (!hasTeamStats && !hasEvents) ? "lineups" : hasTeamStats ? "stats" : "events"}
          className="w-full"
        >
          <TabsList className="mx-auto mb-6 grid w-[640px] max-w-full grid-cols-3 rounded-none border-0 border-b border-slate-800 bg-transparent p-0">
            <TabsTrigger value="lineups" className="rounded-none border-0 border-b-2 border-transparent bg-transparent pb-3 text-[10px] font-black uppercase tracking-widest text-white data-[state=active]:border-0 data-[state=active]:border-b-2 data-[state=active]:border-b-red-500 data-[state=active]:bg-transparent data-[state=active]:text-white data-[state=active]:shadow-none">
              LINEUPS
            </TabsTrigger>
            <TabsTrigger value="stats" disabled={!hasTeamStats} className="rounded-none border-0 border-b-2 border-transparent bg-transparent pb-3 text-[10px] font-black uppercase tracking-widest text-white data-[state=active]:border-0 data-[state=active]:border-b-2 data-[state=active]:border-b-red-500 data-[state=active]:bg-transparent data-[state=active]:text-white data-[state=active]:shadow-none">
              STATS
            </TabsTrigger>
            <TabsTrigger value="events" disabled={!hasEvents} className="rounded-none border-0 border-b-2 border-transparent bg-transparent pb-3 text-[10px] font-black uppercase tracking-widest text-white data-[state=active]:border-0 data-[state=active]:border-b-2 data-[state=active]:border-b-red-500 data-[state=active]:bg-transparent data-[state=active]:text-white data-[state=active]:shadow-none">
              EVENTS
            </TabsTrigger>
          </TabsList>

          {/* LINEUPS */}
          <TabsContent value="lineups" className="mt-4">
            {hasLineups ? (
              <section className="rounded-lg border border-slate-800 bg-[#0b111d] p-4 md:p-6">
                <div className="md:hidden">
                  <Tabs defaultValue="home" className="w-full">
                    <TabsList className="mx-auto mb-4 grid h-10 w-80 max-w-full grid-cols-2 rounded-full border border-slate-700 bg-slate-900/80 p-1">
                      <TabsTrigger value="home" className="rounded-full text-xs font-bold text-slate-300 data-[state=active]:bg-slate-700 data-[state=active]:text-white data-[state=active]:shadow-none">
                        {match.homeTeamName}
                      </TabsTrigger>
                      <TabsTrigger value="away" className="rounded-full text-xs font-bold text-slate-300 data-[state=active]:bg-slate-700 data-[state=active]:text-white data-[state=active]:shadow-none">
                        {match.awayTeamName}
                      </TabsTrigger>
                    </TabsList>
                    <TabsContent value="home" className="mt-0">
                      <div className="space-y-4">
                        <h3 className="text-center text-sm font-semibold text-muted-foreground">
                          {match.homeTeamName} Starting Lineup
                        </h3>
                        {renderPitch(homeStarters, homePitchSlots, homeFormation)}
                        <h4 className="text-center text-xs font-semibold text-muted-foreground mt-4">Substitutes</h4>
                        <div className="space-y-2">
                          {homeSubsSorted.map((ps: any, idx: number) => {
                            return (
                              <div key={idx}>
                                <LineupPlayerCard ps={ps} />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </TabsContent>
                    <TabsContent value="away" className="mt-0">
                      <div className="space-y-4">
                        <h3 className="text-center text-sm font-semibold text-muted-foreground">
                          {match.awayTeamName} Starting Lineup
                        </h3>
                        {renderPitch(awayStarters, awayPitchSlots, awayFormation)}
                        <h4 className="text-center text-xs font-semibold text-muted-foreground mt-4">Substitutes</h4>
                        <div className="space-y-2">
                          {awaySubsSorted.map((ps: any, idx: number) => {
                            return (
                              <div key={idx}>
                                <LineupPlayerCard ps={ps} />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </TabsContent>
                  </Tabs>
                </div>
                <div className="hidden md:grid md:grid-cols-2 gap-6 text-sm">
                  <div className="space-y-4">
                    <h3 className="text-center text-sm font-semibold text-muted-foreground">
                      {match.homeTeamName} Starting Lineup
                    </h3>
                    {renderPitch(homeStarters, homePitchSlots, homeFormation)}
                    <h4 className="text-center text-xs font-semibold text-muted-foreground mt-4">Substitutes</h4>
                    <div className="space-y-2">
                      {homeSubsSorted.map((ps: any, idx: number) => {
                        return (
                          <div key={idx}>
                            <LineupPlayerCard ps={ps} />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className="space-y-4">
                    <h3 className="text-center text-sm font-semibold text-muted-foreground">
                      {match.awayTeamName} Starting Lineup
                    </h3>
                    {renderPitch(awayStarters, awayPitchSlots, awayFormation)}
                    <h4 className="text-center text-xs font-semibold text-muted-foreground mt-4">Substitutes</h4>
                    <div className="space-y-2">
                      {awaySubsSorted.map((ps: any, idx: number) => {
                        return (
                          <div key={idx}>
                            <LineupPlayerCard ps={ps} />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </section>
            ) : (
              <div className="rounded-lg border border-slate-800 bg-[#0b111d] p-6 text-center text-sm text-white">
                メンバー情報が登録されていません。
              </div>
            )}
          </TabsContent>

          {/* STATS */}
          <TabsContent value="stats" className="mt-4">
            {hasTeamStats ? (
              <section className="p-4 md:p-6">
                <h2 className="text-lg font-semibold mb-4 text-center">チームスタッツ</h2>
                <div className="overflow-hidden">
                  {teamStats.map((stat) => {
                    const homeVal = Number(stat.homeValue) || 0;
                    const awayVal = Number(stat.awayValue) || 0;
                    const total = homeVal + awayVal || 1;
                    const homePct = (homeVal / total) * 100;
                    const awayPct = (awayVal / total) * 100;

                    return (
                      <div key={stat.id} className="px-3 py-2 space-y-2 text-xs md:text-sm">
                        <div className="grid grid-cols-3 items-baseline">
                          <div className="text-left font-semibold">{homeVal}</div>
                          <div className="text-center text-muted-foreground text-[11px] md:text-xs">
                            {stat.name}
                          </div>
                          <div className="text-right font-semibold">{awayVal}</div>
                        </div>
                        <div className="h-2 rounded-full bg-muted overflow-hidden flex">
                          <div className="h-full bg-primary" style={{ width: `${homePct}%` }} />
                          <div className="h-full bg-destructive/80" style={{ width: `${awayPct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ) : (
              <div className="rounded-lg border border-slate-800 bg-[#0b111d] p-6 text-center text-sm text-white">
                チームスタッツが登録されていません。
              </div>
            )}
          </TabsContent>

          {/* EVENTS */}
          <TabsContent value="events" className="mt-4">
            {hasEvents ? (
              <section className="p-4 md:p-6">
                <h2 className="text-lg font-semibold mb-4 text-center">試合イベント</h2>
                {(() => {
                  const sorted = events
                    .slice()
                    .sort((a, b) => (a.minute ?? 0) - (b.minute ?? 0));

                  const renderTypeBadge = (ev: any) => {
                    if (ev.type === "goal") return "⚽";
                    if (ev.type === "og") return "OG";
                    if (ev.type === "yellow") return "Y";
                    if (ev.type === "red") return "R";
                    if (ev.type === "sub_in" || ev.type === "sub_out") return "⇄";
                    if (ev.type === "card") return ev.cardColor === "red" ? "R" : "Y";
                    if (ev.type === "substitution") return "⇄";
                    if (ev.type === "note") return "✎";
                    return "";
                  };

                  type Row =
                    | { kind: "event"; ev: any; homeScore: number; awayScore: number }
                    | { kind: "ht"; homeScore: number; awayScore: number; id: string }
                    | { kind: "ft"; homeScore: number; awayScore: number; id: string };

                  const rows: Row[] = [];
                  let hScore = 0;
                  let aScore = 0;

                  sorted.forEach((ev) => {
                    if (ev.type === "goal") {
                      if (ev.teamId === match.homeTeam) hScore += 1;
                      else if (ev.teamId === match.awayTeam) aScore += 1;
                    }
                    if (ev.type === "og") {
                      if (ev.teamId === match.homeTeam) aScore += 1;
                      else if (ev.teamId === match.awayTeam) hScore += 1;
                    }
                    rows.push({ kind: "event", ev, homeScore: hScore, awayScore: aScore });
                  });

                  const lastFirstHalfIndex = rows
                    .map((r, idx) => ({ r, idx }))
                    .filter(({ r }) => r.kind === "event" && ((r as any).ev.minute ?? 0) <= 45)
                    .map(({ idx }) => idx)
                    .pop();

                  if (lastFirstHalfIndex !== undefined) {
                    const ref = rows[lastFirstHalfIndex] as Extract<Row, { kind: "event" }>;
                    rows.splice(lastFirstHalfIndex + 1, 0, {
                      kind: "ht",
                      homeScore: ref.homeScore,
                      awayScore: ref.awayScore,
                      id: "ht-line",
                    });
                  }

                  const finalScoreRow = rows
                    .slice()
                    .reverse()
                    .find((r) => r.kind === "event") as Extract<Row, { kind: "event" }> | undefined;

                  if (finalScoreRow) {
                    rows.push({
                      kind: "ft",
                      homeScore: finalScoreRow.homeScore,
                      awayScore: finalScoreRow.awayScore,
                      id: "ft-line",
                    });
                  }

                  return (
                    <div className="space-y-2 text-xs md:text-sm px-2 py-2">
                      {rows.map((row, index) => {
                        if (row.kind === "ht" || row.kind === "ft") {
                          const label = `${row.kind.toUpperCase()} ${row.homeScore}-${row.awayScore}`;
                          return (
                            <div
                              key={row.id}
                              className="flex items-center justify-center py-1 text-[11px] text-muted-foreground"
                            >
                              <span className="px-3 py-0.5 rounded-full border border-border bg-muted/40">
                                {label}
                              </span>
                            </div>
                          );
                        }

                        const { ev, homeScore, awayScore } = row;
                        const isHome = ev.teamId === match.homeTeam;
                        const nameFromEvent = (ev as any).playerName as string | undefined;
                        const nameFromStats = ev.playerId ? playerNameMap.get(ev.playerId) : undefined;
                        const nameLabel = nameFromEvent || nameFromStats || "";
                        const assist = (ev as any).assistPlayerName as string | undefined;
                        const assistId = (ev as any).assistPlayerId as string | undefined;

                        const outPlayerId = (ev as any).outPlayerId as string | undefined;
                        const inPlayerId = (ev as any).inPlayerId as string | undefined;
                        const outName = outPlayerId ? playerNameMap.get(outPlayerId) : undefined;
                        const inName = inPlayerId ? playerNameMap.get(inPlayerId) : undefined;

                        let label = "";
                        let detailLabel = "";
                        let goalScoreLabel: string | null = null;
                        if (ev.type === "goal") {
                          const isPk = assistId === 'pk' || assist === 'PK';
                          label = nameLabel || "";
                          if (isPk) detailLabel = "PK";
                          if (!isPk && assist) detailLabel = `A: ${assist}`;
                          goalScoreLabel = `${homeScore}-${awayScore}`;
                        } else if (ev.type === "og") {
                          label = nameLabel || "OG";
                          goalScoreLabel = `${homeScore}-${awayScore}`;
                        } else if (ev.type === "yellow") {
                          label = nameLabel || "";
                        } else if (ev.type === "red") {
                          label = nameLabel || "";
                        } else if (ev.type === "sub_in" || ev.type === "sub_out") {
                          label = nameLabel || "";
                        } else if (ev.type === "card") {
                          label = nameLabel || "";
                        } else if (ev.type === "substitution") {
                          label = outName ?? "OUT";
                          detailLabel = inName ?? "IN";
                        } else if (ev.type === "note") {
                          label = (ev as any).text || "メモ";
                        }

                        if ((ev.type === "goal" || ev.type === "og") && goalScoreLabel) {
                          label = `${label} (${goalScoreLabel})`;
                        }

                        const eventContent = (
                          <div className="flex items-start gap-1 min-w-0 max-w-full">
                            <span className="text-[10px] text-muted-foreground shrink-0 mt-[1px]">{renderTypeBadge(ev)}</span>
                            <span className="min-w-0">
                              <span className="block whitespace-nowrap">{label}</span>
                              {detailLabel && <span className="block whitespace-nowrap text-[10px] text-white/70">{detailLabel}</span>}
                            </span>
                          </div>
                        );

                        return (
                          <div
                            key={ev.id ?? index}
                            className="grid w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 px-2 py-1"
                          >
                            <div className="flex justify-end pr-2 min-w-0">
                              {isHome && label && (
                                <div className="text-right text-[11px] font-medium text-emerald-500">
                                  {eventContent}
                                </div>
                              )}
                            </div>

                            <div className="justify-self-center">
                              <span className="inline-flex h-7 min-w-10 items-center justify-center rounded-full bg-muted px-2 text-[11px] font-semibold text-muted-foreground shadow-sm tabular-nums shrink-0">
                                {formatMinute(ev.minute)}'
                              </span>
                            </div>

                            <div className="flex justify-start pl-2 min-w-0">
                              {!isHome && label && (
                                <div className="text-left text-[11px] font-medium text-sky-500">
                                  {eventContent}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </section>
            ) : (
              <div className="rounded-lg border border-slate-800 bg-[#0b111d] p-6 text-center text-sm text-white">
                試合イベントが登録されていません。
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
      <PartnerStripClient clubId={clubId} />
      <ClubFooter
        clubId={clubId}
        clubName={clubName}
        sponsors={sponsors || []}
        snsLinks={snsLinks || {}}
        legalPages={legalPages || []}
        gameTeamUsage={Boolean(gameTeamUsage)}
      />
    </main>
  );
}
