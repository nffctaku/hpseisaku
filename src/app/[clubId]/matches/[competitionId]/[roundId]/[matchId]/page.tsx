import { db } from "@/lib/firebase/admin";
import { notFound } from "next/navigation";
import Image from "next/image";
import type { MatchDetails, TeamStat, PlayerStats, MatchEvent } from "@/types/match";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ClubHeader } from "@/components/club-header";

interface PageProps {
  params: Promise<{ clubId: string; competitionId: string; roundId: string; matchId: string }>;
}

async function getMatchDetail(
  clubId: string,
  competitionId: string,
  roundId: string,
  matchId: string,
): Promise<{ clubName: string; logoUrl: string | null; match: MatchDetails | null } | null> {
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
  if (!ownerUid) return null;

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

    // 大会名・ラウンド名がマッチドキュメントに無ければ、元のコレクションから補完
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
      // 追加でそのまま渡したいフィールド（events, venue など）は any 経由で扱う
      // 型定義には入っていなくても JSX 側では (match as any).events などで読める
      ...(data.events ? { events: data.events } : {}),
      ...(data.venue ? { venue: data.venue } : {}),
      ...(data.stadium ? { stadium: data.stadium } : {}),
    } as any;

    return { clubName, logoUrl, match };
  }

  // Fallback: legacy flat matches collection
  const flatMatchRef = db.doc(`clubs/${ownerUid}/matches/${matchId}`);
  const flatSnap = await flatMatchRef.get();
  if (!flatSnap.exists) {
    return { clubName, logoUrl, match: null };
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
    ...(data.events ? { events: data.events } : {}),
    ...(data.venue ? { venue: data.venue } : {}),
    ...(data.stadium ? { stadium: data.stadium } : {}),
  } as any;

  return { clubName, match };
}

export default async function MatchDetailPage({ params }: PageProps) {
  const { clubId, competitionId, roundId, matchId } = await params;

  if (clubId === "admin") notFound();

  const data = await getMatchDetail(clubId, competitionId, roundId, matchId);
  if (!data || !data.match) notFound();

  const { clubName, logoUrl, match } = data;

  const matchDate = new Date(match.matchDate);
  const events: MatchEvent[] = ((match as any).events || []) as MatchEvent[];

  const venue: string | undefined = (match as any).venue || (match as any).stadium;

  const homeGoals = events
    .filter((e) => e.type === "goal" && e.teamId === match.homeTeam)
    .sort((a, b) => a.minute - b.minute);
  const awayGoals = events
    .filter((e) => e.type === "goal" && e.teamId === match.awayTeam)
    .sort((a, b) => a.minute - b.minute);

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

  // NOTE:
  // - 新しいデータ: PlayerStats に teamId が入っているので、teamId でホーム/アウェイを判別
  // - 既存データ: teamId が無いので、とりあえずホーム側として表示する（非表示にならないようにする）
  const homeStarters = playerStats.filter(
    (ps) => (ps.teamId ? ps.teamId === match.homeTeam : true) && (ps.role === "starter" || !ps.role),
  );
  const homeSubs = playerStats.filter(
    (ps) => (ps.teamId ? ps.teamId === match.homeTeam : true) && ps.role && ps.role !== "starter",
  );
  const awayStarters = playerStats.filter(
    (ps) => ps.teamId && ps.teamId === match.awayTeam && (ps.role === "starter" || !ps.role),
  );
  const awaySubs = playerStats.filter(
    (ps) => ps.teamId && ps.teamId === match.awayTeam && ps.role && ps.role !== "starter",
  );

  const hasLineups =
    homeStarters.length > 0 || homeSubs.length > 0 || awayStarters.length > 0 || awaySubs.length > 0;
  const hasTeamStats = teamStats.length > 0;

  return (
    <div className="min-h-screen">
      <ClubHeader clubId={clubId} clubName={clubName} logoUrl={logoUrl} />
      <div className="container mx-auto px-4 py-8 max-w-5xl space-y-8">
        {/* Header with league, date, venue, emblems & score */}
        <div className="space-y-6">
          {/* Top info: league, round, date, venue */}
          <div className="text-center space-y-1">
            <p className="text-xs font-medium">
              {match.competitionName}
              {match.roundName && ` ${match.roundName}`}
            </p>
            <p className="text-xs text-muted-foreground">
              {matchDate.toLocaleDateString("ja-JP", {
                year: "numeric",
                month: "numeric",
                day: "numeric",
              })}
              {match.matchTime && ` ${match.matchTime}`}
              {venue && ` / ${venue}`}
            </p>
          </div>

          {/* Teams row: name + emblem + score */}
          <div className="flex items-center justify-between gap-8">
            {/* Home side */}
            <div className="flex-1 flex flex-col items-center gap-2">
              <div className="text-sm md:text-base font-medium">{match.homeTeamName}</div>
              {match.homeTeamLogo ? (
                <Image
                  src={match.homeTeamLogo}
                  alt={match.homeTeamName}
                  width={60}
                  height={60}
                  className="object-contain"
                />
              ) : (
                <div className="w-14 h-14 rounded-full bg-muted" />
              )}
            </div>

            {/* Score & status */}
            <div className="flex flex-col items-center justify-center gap-1">
              <div className="flex items-center gap-6 text-4xl md:text-6xl font-bold tracking-tight">
                <span>{typeof match.scoreHome === "number" ? match.scoreHome : "-"}</span>
                <span className="text-base md:text-lg font-normal">-</span>
                <span>{typeof match.scoreAway === "number" ? match.scoreAway : "-"}</span>
              </div>
              {(typeof match.scoreHome === "number" || typeof match.scoreAway === "number") && (
                <span className="text-[11px] text-muted-foreground">試合終了</span>
              )}
            </div>

            {/* Away side */}
            <div className="flex-1 flex flex-col items-center gap-2">
              <div className="text-sm md:text-base font-medium">{match.awayTeamName}</div>
              {match.awayTeamLogo ? (
                <Image
                  src={match.awayTeamLogo}
                  alt={match.awayTeamName}
                  width={60}
                  height={60}
                  className="object-contain"
                />
              ) : (
                <div className="w-14 h-14 rounded-full bg-muted" />
              )}
            </div>
          </div>

          {/* Scorers row */}
          <div className="grid grid-cols-2 gap-6 text-xs md:text-sm max-w-md mx-auto">
            <div className="text-left space-y-1">
              {homeGoals.map((g) => {
                const ev: any = g;
                const nameFromEvent = ev.playerName as string | undefined;
                const nameFromStats = g.playerId ? playerNameMap.get(g.playerId) : undefined;
                const label = nameFromEvent || nameFromStats || "G";
                return (
                  <div key={g.id} className="text-muted-foreground">
                    {`${label} (${g.minute}')`}
                  </div>
                );
              })}
            </div>
            <div className="text-right space-y-1">
              {awayGoals.map((g) => {
                const ev: any = g;
                const nameFromEvent = ev.playerName as string | undefined;
                const nameFromStats = g.playerId ? playerNameMap.get(g.playerId) : undefined;
                const label = nameFromEvent || nameFromStats || "G";
                return (
                  <div key={g.id} className="text-muted-foreground">
                    {`${label} (${g.minute}')`}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Tabs: Lineups / Stats */}
        <Tabs defaultValue={hasLineups || !hasTeamStats ? "lineups" : "stats"} className="w-full">
          <TabsList className="grid grid-cols-2 md:w-80 md:mx-auto mb-4">
            <TabsTrigger value="lineups">
              LINEUPS
            </TabsTrigger>
            <TabsTrigger value="stats" disabled={!hasTeamStats}>
              STATS
            </TabsTrigger>
          </TabsList>

          {/* LINEUPS */}
          <TabsContent value="lineups" className="mt-4">
            {hasLineups ? (
              <section className="bg-card rounded-lg p-4 md:p-6">
                <h2 className="text-lg font-semibold mb-4 text-center">メンバー</h2>
                <div className="flex items-center justify-center gap-4 mb-4 text-sm">
                  <span className="font-semibold">{match.homeTeamName}</span>
                  <span className="text-muted-foreground">vs</span>
                  <span className="font-semibold">{match.awayTeamName}</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
                  {/* Home */}
                  <div>
                    <h3 className="text-center text-xs font-semibold text-muted-foreground mb-2">
                      {match.homeTeamName} Starting Lineup
                    </h3>
                    <div className="space-y-1 mb-4">
                      {homeStarters.length ? (
                        homeStarters.map((ps: any, idx: number) => {
                          const minutes = Number(ps.minutesPlayed) || 0;
                          const rating = Number(ps.rating) || 0;
                          const hasRating = rating > 0;
                          const hasMinutes = minutes > 0;

                          const ratingColor = rating >= 7.0 ? "text-emerald-500" : "text-orange-500";

                          return (
                            <div key={idx} className="py-1 px-2 border-b border-muted text-sm flex items-center gap-1">
                              {hasRating && (
                                <span className={`text-xs font-semibold ${ratingColor}`}>
                                  {rating.toFixed(1)}
                                </span>
                              )}
                              <span>{ps.playerName}</span>
                              {hasMinutes && <span className="text-[11px] text-muted-foreground">({minutes}分)</span>}
                            </div>
                          );
                        })
                      ) : (
                        <p className="text-center text-xs text-muted-foreground py-2">スタメン情報がありません。</p>
                      )}
                    </div>
                    <h4 className="text-center text-xs font-semibold text-muted-foreground mb-2">Substitutes</h4>
                    <div className="space-y-1">
                      {homeSubs.length ? (
                        homeSubs.map((ps: any, idx: number) => {
                          const minutes = Number(ps.minutesPlayed) || 0;
                          const rating = Number(ps.rating) || 0;
                          const hasRating = rating > 0;
                          const hasMinutes = minutes > 0;

                          const ratingColor = rating >= 7.0 ? "text-emerald-500" : "text-orange-500";

                          return (
                            <div key={idx} className="py-1 px-2 border-b border-muted text-sm flex items-center gap-1">
                              {hasRating && (
                                <span className={`text-xs font-semibold ${ratingColor}`}>
                                  {rating.toFixed(1)}
                                </span>
                              )}
                              <span>{ps.playerName}</span>
                              {hasMinutes && <span className="text-[11px] text-muted-foreground">({minutes}分)</span>}
                            </div>
                          );
                        })
                      ) : (
                        <p className="text-center text-xs text-muted-foreground py-2">サブ情報がありません。</p>
                      )}
                    </div>
                  </div>

                  {/* Away */}
                  <div>
                    <h3 className="text-center text-xs font-semibold text-muted-foreground mb-2">
                      {match.awayTeamName} Starting Lineup
                    </h3>
                    <div className="space-y-1 mb-4">
                      {awayStarters.length ? (
                        awayStarters.map((ps: any, idx: number) => {
                          const minutes = Number(ps.minutesPlayed) || 0;
                          const rating = Number(ps.rating) || 0;
                          const hasRating = rating > 0;
                          const hasMinutes = minutes > 0;

                          const ratingColor = rating >= 7.0 ? "text-emerald-500" : "text-orange-500";

                          return (
                            <div key={idx} className="py-1 px-2 border-b border-muted text-sm flex items-center gap-1">
                              {hasRating && (
                                <span className={`text-xs font-semibold ${ratingColor}`}>
                                  {rating.toFixed(1)}
                                </span>
                              )}
                              <span>{ps.playerName}</span>
                              {hasMinutes && <span className="text-[11px] text-muted-foreground">({minutes}分)</span>}
                            </div>
                          );
                        })
                      ) : (
                        <p className="text-center text-xs text-muted-foreground py-2">スタメン情報がありません。</p>
                      )}
                    </div>
                    <h4 className="text-center text-xs font-semibold text-muted-foreground mb-2">Substitutes</h4>
                    <div className="space-y-1">
                      {awaySubs.length ? (
                        awaySubs.map((ps: any, idx: number) => {
                          const minutes = Number(ps.minutesPlayed) || 0;
                          const rating = Number(ps.rating) || 0;
                          const hasRating = rating > 0;
                          const hasMinutes = minutes > 0;

                          const ratingColor = rating >= 7.0 ? "text-emerald-500" : "text-orange-500";

                          return (
                            <div key={idx} className="py-1 px-2 border-b border-muted text-sm flex items-center gap-1">
                              {hasRating && (
                                <span className={`text-xs font-semibold ${ratingColor}`}>
                                  {rating.toFixed(1)}
                                </span>
                              )}
                              <span>{ps.playerName}</span>
                              {hasMinutes && <span className="text-[11px] text-muted-foreground">({minutes}分)</span>}
                            </div>
                          );
                        })
                      ) : (
                        <p className="text-center text-xs text-muted-foreground py-2">サブ情報がありません。</p>
                      )}
                    </div>
                  </div>
                </div>
              </section>
            ) : (
              <div className="bg-card rounded-lg p-6 text-center text-sm text-muted-foreground">
                メンバー情報が登録されていません。
              </div>
            )}
          </TabsContent>

          {/* STATS */}
          <TabsContent value="stats" className="mt-4">
            {hasTeamStats ? (
              <section className="bg-card rounded-lg p-4 md:p-6">
                <h2 className="text-lg font-semibold mb-4 text-center">チームスタッツ</h2>
                <div className="flex items-center justify-center gap-4 mb-4 text-sm">
                  <span className="font-semibold">{match.homeTeamName}</span>
                  <span className="text-muted-foreground">vs</span>
                  <span className="font-semibold">{match.awayTeamName}</span>
                </div>

                <div className="space-y-4 text-xs md:text-sm">
                  {teamStats.map((stat) => {
                    const homeVal = Number(stat.homeValue) || 0;
                    const awayVal = Number(stat.awayValue) || 0;
                    const total = homeVal + awayVal || 1;
                    const homePct = (homeVal / total) * 100;
                    const awayPct = (awayVal / total) * 100;

                    return (
                      <div key={stat.id} className="space-y-1">
                        <div className="grid grid-cols-3 items-baseline">
                          <div className="text-left font-semibold">{homeVal}</div>
                          <div className="text-center text-muted-foreground text-[11px] md:text-xs">
                            {stat.name}
                          </div>
                          <div className="text-right font-semibold">{awayVal}</div>
                        </div>
                        <div className="h-2 rounded-full bg-muted overflow-hidden flex">
                          <div
                            className="h-full bg-primary"
                            style={{ width: `${homePct}%` }}
                          />
                          <div
                            className="h-full bg-destructive/80"
                            style={{ width: `${awayPct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ) : (
              <div className="bg-card rounded-lg p-6 text-center text-sm text-muted-foreground">
                チームスタッツが登録されていません。
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Events timeline (same concept as admin preview) */}
        {events && events.length > 0 && (
          <section className="bg-card rounded-lg p-4 md:p-6">
            <h2 className="text-lg font-semibold mb-4 text-center">試合イベント</h2>
            {(() => {
              const sorted = events
                .slice()
                .sort((a, b) => (a.minute ?? 0) - (b.minute ?? 0));

              const renderTypeBadge = (ev: MatchEvent) => {
                if (ev.type === "goal") return "⚽";
                if (ev.type === "yellow") return "Y";
                if (ev.type === "red") return "R";
                if (ev.type === "sub_in" || ev.type === "sub_out") return "⇄";
                return "";
              };

              type Row =
                | { kind: "event"; ev: MatchEvent; homeScore: number; awayScore: number }
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
                rows.push({ kind: "event", ev, homeScore: hScore, awayScore: aScore });
              });

              // HT row (after last event <= 45')
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

              // FT row (final score)
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
                <div className="space-y-1 text-xs md:text-sm">
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

                    let label = "";
                    if (ev.type === "goal") {
                      label = nameLabel || "ゴール";
                      if (assist) label += `（A: ${assist}` + ")";
                      label += ` (${homeScore}-${awayScore})`;
                    } else if (ev.type === "yellow") {
                      label = nameLabel ? `${nameLabel} イエロー` : "イエローカード";
                    } else if (ev.type === "red") {
                      label = nameLabel ? `${nameLabel} レッド` : "レッドカード";
                    } else if (ev.type === "sub_in" || ev.type === "sub_out") {
                      label = nameLabel || "交代";
                    }

                    return (
                      <div
                        key={ev.id ?? index}
                        className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 py-1"
                      >
                        {/* Home side */}
                        <div className="flex justify-end pr-2">
                          {isHome && label && (
                            <div className="text-right max-w-[180px]">
                              <div className="text-[11px] font-medium text-emerald-500 truncate">
                                {label}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Center minute + type */}
                        <div className="flex flex-col items-center justify-center min-w-[40px]">
                          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[11px] font-semibold mb-0.5">
                            {ev.minute}'
                          </span>
                          <span className="text-[10px] text-muted-foreground">{renderTypeBadge(ev)}</span>
                        </div>

                        {/* Away side */}
                        <div className="flex justify-start pl-2">
                          {!isHome && label && (
                            <div className="text-left max-w-[180px]">
                              <div className="text-[11px] font-medium text-sky-500 truncate">
                                {label}
                              </div>
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
        )}
      </div>
    </div>
  );
}
