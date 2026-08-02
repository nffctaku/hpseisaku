"use client";

import { useEffect, useRef, useState } from 'react';
import { notFound, useRouter } from 'next/navigation';
import Link from "next/link";
import Image from "next/image";
import { format } from "date-fns";
import { db } from '@/lib/firebase';
import { collection, getDocs } from 'firebase/firestore';
import { Hero } from "@/components/hero";
import { LeagueTable } from "@/components/league-table";
import { ClubTv } from "@/components/club-tv";
import { NewsSection } from "@/components/news-section";
import { ClubHeader } from "@/components/club-header";
import { ClubFooter } from "@/components/club-footer";
import { PartnerStripClient } from "@/components/partner-strip-client";
import type { NewsArticle } from "@/types/news";
import { MatchResultsList, MatchSection } from "@/components/match-section";
import type { MatchDetails } from "@/types/match";

function toCloudinaryPadded16x9(url: string, width: number) {
  if (!url) return url;
  if (!url.includes('/image/upload/')) return url;
  return url.replace(
    '/image/upload/',
    `/image/upload/c_pad,ar_16:9,w_${width},b_auto,f_auto,q_auto/`
  );
}

function resolvePublishedDate(value: any): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'string') return new Date(value);
  if (typeof value.toDate === 'function') return value.toDate();
  if (typeof value._seconds === 'number') return new Date(value._seconds * 1000);
  if (typeof value.seconds === 'number') return new Date(value.seconds * 1000);
  return null;
}

function resolveNewsHref(item: NewsArticle | null | undefined, clubId: string) {
  if (!item) return `/${clubId}/news`;
  const noteUrl = (item as any)?.noteUrl;
  if (typeof noteUrl === "string" && noteUrl.trim() !== "") return noteUrl;
  return `/${clubId}/news/${(item as any)?.id || ""}`;
}

function isExternalNewsLink(item: NewsArticle | null | undefined): boolean {
  const noteUrl = (item as any)?.noteUrl;
  return typeof noteUrl === "string" && noteUrl.trim() !== "";
}

export default function ClubPageContent({
  clubId,
  initialClubInfo,
}: {
  clubId: string;
  initialClubInfo?: any | null;
}) {
    const [clubInfo, setClubInfo] = useState<any>(
      initialClubInfo ?? {
        news: [],
        latestResult: null,
        nextMatch: null,
        profile: { clubName: '' },
        videos: [],
        competitions: [],
      }
    );
    const [isLoading, setIsLoading] = useState(!initialClubInfo);
    const [error, setError] = useState<string | null>(null);
    const [homePanel, setHomePanel] = useState<'standings' | 'results'>('standings');
    const [selectedRoundIndex, setSelectedRoundIndex] = useState(0);
    const [rounds, setRounds] = useState<{ roundId: string; roundName: string }[]>([]);
    const router = useRouter();
    const routerRef = useRef(router);

    useEffect(() => {
        routerRef.current = router;
    }, [router]);

    useEffect(() => {
        if (clubId === 'admin') {
            notFound();
            return;
        }

        let cancelled = false;
        let idleHandle: number | null = null;
        let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

        const runFullFetch = async () => {
            try {
                const fullRes = await fetch(`/api/club/${clubId}`);
                if (!fullRes.ok) {
                    console.error(`Full club data HTTP error: ${fullRes.status}`);
                    setError("データの読み込みに失敗しました");
                    return;
                }
                const fullData = await fullRes.json();
                if (cancelled) return;
                setClubInfo(fullData);
                setError(null);
            } catch (fullErr) {
                console.error("Failed to fetch full club data:", fullErr);
                setError("データの読み込みに失敗しました");
            }
        };

        // Since SSR now includes all data including videos, client-side fetch is no longer needed
        // Remove the redundant fetch to save bandwidth and Firestore read operations

        return () => {
            cancelled = true;
            const cic = (globalThis as any).cancelIdleCallback as ((id: number) => void) | undefined;
            if (idleHandle != null && cic) cic(idleHandle);
            if (timeoutHandle) clearTimeout(timeoutHandle);
        };
    }, [clubId, initialClubInfo]);

    const homeBgColor = clubInfo.profile?.homeBgColor as string | undefined;
    const heroNewsLimit =
        (clubInfo.data?.heroNewsLimit as number | undefined) ??
        (clubInfo.profile?.heroNewsLimit as number | undefined) ??
        3;

    const heroNewsRaw = (clubInfo as any).heroNews || clubInfo.news || [];
    const listNewsRaw = clubInfo.news || [];

    const heroNews = (Array.isArray(heroNewsRaw) ? heroNewsRaw : []).filter((x) => x && typeof x === "object");
    const listNews = (Array.isArray(listNewsRaw) ? listNewsRaw : []).filter((x) => x && typeof x === "object");
    const videos = clubInfo.videos || [];

    const heroItems = (heroNews as NewsArticle[]).slice(0, heroNewsLimit);
    const mainHeroItem = heroItems[0] as NewsArticle | undefined;
    const sideHeroItems = heroItems.slice(1, 4) as NewsArticle[];
    const mainTeamId = clubInfo.profile?.mainTeamId || null;
    const recentMatches = (clubInfo.recentMatches || []) as MatchDetails[];
    
    // Client-side fetch of all match data to avoid serialization issues
    const [clientAllRecentMatches, setClientAllRecentMatches] = useState<MatchDetails[]>([]);

    useEffect(() => {
      const fetchAllMatches = async () => {
        try {
          if (!clubId) return;
          
          // Get the season from the competition shown on home page
          const competitions = clubInfo.competitions || [];
          const homeCompetition = competitions.find((c: any) => c.showOnHome) || competitions[0];
          const targetSeason = homeCompetition?.season ? String(homeCompetition.season).trim() : null;
          
          const [competitionsSnap, teamsSnap] = await Promise.all([
            getDocs(collection(db, `clubs/${clubId}/competitions`)),
            getDocs(collection(db, `clubs/${clubId}/teams`)),
          ]);
          const teamsMap = new Map<string, { name: string; logoUrl?: string }>();
          teamsSnap.forEach((teamDoc) => {
            const teamData = teamDoc.data();
            teamsMap.set(teamDoc.id, { name: teamData.name || '', logoUrl: teamData.logoUrl });
          });
          
          const allMatches: MatchDetails[] = [];
          
          for (const compDoc of competitionsSnap.docs) {
            const competitionId = compDoc.id;
            const competitionData = compDoc.data();
            const compSeason = competitionData.season ? String(competitionData.season).trim() : '';
            
            // Filter matches by season if targetSeason is specified
            if (targetSeason && compSeason && compSeason !== targetSeason) {
              continue;
            }
            
            // Fetch all rounds for this competition
            const roundsSnap = await getDocs(collection(db, `clubs/${clubId}/competitions/${competitionId}/rounds`));
            
            for (const roundDoc of roundsSnap.docs) {
              const roundId = roundDoc.id;
              const roundData = roundDoc.data();
              
              // Fetch all matches for this round
              const matchesSnap = await getDocs(collection(db, `clubs/${clubId}/competitions/${competitionId}/rounds/${roundId}/matches`));
              
              matchesSnap.forEach((matchDoc) => {
                const matchData = matchDoc.data();
                const homeTeam = teamsMap.get(matchData.homeTeam);
                const awayTeam = teamsMap.get(matchData.awayTeam);
                if (matchData.scoreHome !== null && matchData.scoreAway !== null) {
                  allMatches.push({
                    id: matchDoc.id,
                    competitionId,
                    roundId,
                    homeTeam: matchData.homeTeam,
                    awayTeam: matchData.awayTeam,
                    homeTeamName: matchData.homeTeamName || homeTeam?.name || '不明',
                    awayTeamName: matchData.awayTeamName || awayTeam?.name || '不明',
                    competitionName: competitionData.name,
                    competitionLogoUrl: competitionData.logoUrl,
                    roundName: roundData.name,
                    homeTeamLogo: matchData.homeTeamLogo || homeTeam?.logoUrl,
                    awayTeamLogo: matchData.awayTeamLogo || awayTeam?.logoUrl,
                    matchDate: matchData.matchDate,
                    matchTime: matchData.matchTime,
                    scoreHome: matchData.scoreHome,
                    scoreAway: matchData.scoreAway,
                    pkScoreHome: matchData.pkScoreHome,
                    pkScoreAway: matchData.pkScoreAway,
                  } as MatchDetails);
                }
              });
            }
          }
          
          allMatches.sort((a, b) => new Date(b.matchDate).getTime() - new Date(a.matchDate).getTime());
          
          setClientAllRecentMatches(allMatches);
        } catch (error) {
          console.error('Error fetching matches:', error);
        }
      };

      fetchAllMatches();
    }, [clubId]);

    const allRecentMatches = clientAllRecentMatches.length > 0 ? clientAllRecentMatches : (clubInfo.allRecentMatches || recentMatches) as MatchDetails[];

    useEffect(() => {
      if (allRecentMatches && allRecentMatches.length > 0) {
        const matches = allRecentMatches as MatchDetails[];
        const roundsMap = matches.reduce((map, match) => {
            if (!match) return map;
            // Group by roundName only to include matches from all competitions
            const key = match.roundName || '';
            if (!map.has(key)) {
              map.set(key, { roundId: match.roundId || '', roundName: match.roundName || '', latestDate: match.matchDate });
            } else {
              const current = map.get(key)!;
              const matchDate = new Date(match.matchDate).getTime();
              const currentLatestDate = new Date(current.latestDate).getTime();
              if (matchDate > currentLatestDate) {
                current.latestDate = match.matchDate;
                current.roundId = match.roundId || ''; // Use the latest match's roundId
              }
            }
            return map;
          }, new Map<string, { roundId: string; roundName: string; latestDate: string }>());
        const roundsList = Array.from(roundsMap.values())
          .sort((a, b) => new Date(a.latestDate).getTime() - new Date(b.latestDate).getTime())
          .map(({ roundId, roundName }) => ({ roundId, roundName }));
        setRounds(roundsList);

        const latestMatch = matches
          .filter((m) => m && m.scoreHome !== null && m.scoreAway !== null)
          .sort((a, b) => {
            const msA = new Date(a.matchDate).getTime();
            const msB = new Date(b.matchDate).getTime();
            return msB - msA;
          })[0];
        if (latestMatch) {
          const latestIndex = roundsList.findIndex(
            (r) => r.roundId === latestMatch.roundId && r.roundName === latestMatch.roundName
          );
          if (latestIndex !== -1) {
            setSelectedRoundIndex(latestIndex);
          }
        }
      } else {
        setRounds([]);
      }
    }, [allRecentMatches]);

    const renderHomePanelContent = () => (
      <div className="space-y-3">
        <div className="grid grid-cols-2 rounded-full bg-gray-100 p-1 text-sm font-bold text-gray-500">
          <button
            type="button"
            onClick={() => setHomePanel('standings')}
            className={homePanel === 'standings' ? 'rounded-full bg-white px-3 py-2 text-gray-950 shadow-sm' : 'rounded-full px-3 py-2 hover:text-gray-900'}
          >
            順位表
          </button>
          <button
            type="button"
            onClick={() => setHomePanel('results')}
            className={homePanel === 'results' ? 'rounded-full bg-white px-3 py-2 text-gray-950 shadow-sm' : 'rounded-full px-3 py-2 hover:text-gray-900'}
          >
            試合結果
          </button>
        </div>
        {homePanel === 'standings' ? (
          <LeagueTable clubId={clubId} competitions={clubInfo.competitions || []} minCardOnMobile />
        ) : (
          <MatchResultsList
            matches={allRecentMatches}
            clubSlug={clubId}
            rounds={rounds}
            selectedRoundIndex={selectedRoundIndex}
            onRoundChange={setSelectedRoundIndex}
          />
        )}
      </div>
    );

    if (isLoading) {
      return (
        <main className="min-h-screen flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <Image
              src="/favicon.png"
              alt="Loading"
              width={64}
              height={64}
              className="opacity-90 animate-pulse"
              priority
            />
            <p className="text-sm text-muted-foreground">読み込み中</p>
          </div>
        </main>
      );
    }

    if (error) {
      return (
        <main className="min-h-screen flex items-center justify-center">
          <div className="flex flex-col items-center gap-4 text-center px-4">
            <div className="text-red-500">
              <Loader2 className="w-12 h-12" />
            </div>
            <p className="text-lg font-semibold">エラーが発生しました</p>
            <p className="text-sm text-muted-foreground">{error}</p>
            <button
              onClick={() => {
                setError(null);
                setIsLoading(true);
                window.location.reload();
              }}
              className="mt-4 px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              再読み込み
            </button>
          </div>
        </main>
      );
    }

    return (
        <main
          className="min-h-screen"
          style={homeBgColor ? { backgroundColor: homeBgColor } : undefined}
        >
            <ClubHeader 
                clubId={clubId} 
                clubName={clubInfo.profile?.clubName || ""} 
                logoUrl={clubInfo.profile?.logoUrl || null} 
                headerBackgroundColor={homeBgColor}
                snsLinks={clubInfo.profile?.snsLinks || {}}
            />
            <div className="md:hidden">
              <Hero news={heroNews} maxSlides={heroNewsLimit} isLoading={isLoading} />
            </div>

            <div className="hidden md:block">
              <div className="container mx-auto px-4 pt-4 pb-8">
                <div className="grid grid-cols-3 gap-4">
                  <div className="col-span-2 space-y-4">
                    <div className="relative w-full aspect-[16/9]">
                      {mainHeroItem ? (
                        <Link
                          href={resolveNewsHref(mainHeroItem, clubId)}
                          target={isExternalNewsLink(mainHeroItem) ? "_blank" : undefined}
                          rel={isExternalNewsLink(mainHeroItem) ? "noopener noreferrer" : undefined}
                          className="block h-full rounded-lg overflow-hidden bg-black"
                        >
                          <div className="relative w-full h-full bg-muted">
                            <Image
                              src={toCloudinaryPadded16x9((mainHeroItem as any).imageUrl || "/no-image.png", 1600)}
                              alt={(mainHeroItem as any).imageUrl ? mainHeroItem.title : "No image available"}
                              fill
                              className="object-cover"
                              sizes="(min-width: 768px) 66vw, 100vw"
                              priority
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/15 to-transparent" />
                            <div className="absolute left-0 right-0 bottom-0 p-5">
                              <div className="text-white">
                                <div className="text-[11px] text-white/80">
                                  {(() => {
                                    const d = resolvePublishedDate((mainHeroItem as any).publishedAt);
                                    return d ? format(d, "yyyy/MM/dd") : "";
                                  })()}
                                </div>
                                <div className="mt-2 text-2xl font-black leading-tight line-clamp-2">
                                  {mainHeroItem.title}
                                </div>
                              </div>
                            </div>
                          </div>
                        </Link>
                      ) : (
                        <Hero news={heroNews} maxSlides={heroNewsLimit} isLoading={isLoading} />
                      )}
                    </div>
                    <MatchSection 
                      nextMatch={clubInfo.nextMatch} 
                      upcomingMatches={(clubInfo as any).upcomingMatches || []}
                      recentMatches={recentMatches}
                      mainTeamId={mainTeamId}
                      backgroundColor={homeBgColor || null}
                      clubSlug={clubId}
                    />
                    {videos.length > 0 && <ClubTv videos={videos} clubId={clubId} />}
                  </div>
                  <div className="col-span-1 space-y-4">
                    {sideHeroItems.length > 0 && (
                      <div className="space-y-4">
                        {sideHeroItems.map((item) => (
                          <Link
                            key={item.id}
                            href={resolveNewsHref(item, clubId)}
                            target={isExternalNewsLink(item) ? "_blank" : undefined}
                            rel={isExternalNewsLink(item) ? "noopener noreferrer" : undefined}
                            className="block group"
                          >
                            <div className="relative w-full aspect-[16/9] rounded-lg overflow-hidden bg-muted">
                              <Image
                                src={toCloudinaryPadded16x9((item as any).imageUrl || "/no-image.png", 800)}
                                alt={(item as any).imageUrl ? item.title : "No image available"}
                                fill
                                className="object-cover group-hover:scale-105 transition-transform duration-300"
                                sizes="(min-width: 768px) 33vw, 100vw"
                              />
                              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/15 to-transparent" />
                              <div className="absolute left-0 right-0 bottom-0 p-4">
                                <div className="text-white">
                                  <div className="text-[10px] text-white/80">
                                    {(() => {
                                      const d = resolvePublishedDate((item as any).publishedAt);
                                      return d ? format(d, "yyyy/MM/dd") : "";
                                    })()}
                                  </div>
                                  <div className="mt-1 text-sm font-bold leading-tight line-clamp-2">
                                    {item.title}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </Link>
                        ))}
                      </div>
                    )}
                    <LeagueTable clubId={clubId} competitions={clubInfo.competitions || []} minCardOnMobile />
                    <MatchResultsList
                      matches={allRecentMatches}
                      clubSlug={clubId}
                      rounds={rounds}
                      selectedRoundIndex={selectedRoundIndex}
                      onRoundChange={setSelectedRoundIndex}
                    />
                  </div>
                </div>
              </div>
            </div>
            <div className="container mx-auto px-4 pt-0 pb-8 md:hidden">
                <div className="space-y-3">
                    <NewsSection news={listNews} clubId={clubId} />
                    <MatchSection 
                        nextMatch={clubInfo.nextMatch} 
                        upcomingMatches={(clubInfo as any).upcomingMatches || []}
                        recentMatches={recentMatches}
                        mainTeamId={mainTeamId}
                        backgroundColor={homeBgColor || null}
                        clubSlug={clubId}
                    />
                    {renderHomePanelContent()}
                    {videos.length > 0 && <ClubTv videos={videos} clubId={clubId} />}
                </div>
            </div>
            <PartnerStripClient clubId={clubId} />
            <ClubFooter 
              clubId={clubId}
              clubName={clubInfo.profile?.clubName || ""}
              gameTeamUsage={Boolean((clubInfo as any).profile?.gameTeamUsage)}
              sponsors={clubInfo.profile?.sponsors || []} 
              snsLinks={clubInfo.profile?.snsLinks || {}} 
              legalPages={clubInfo.profile?.legalPages || []}
            />
        </main>
    );
}
