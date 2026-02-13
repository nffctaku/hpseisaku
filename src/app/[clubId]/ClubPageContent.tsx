"use client";

import { useEffect, useState } from 'react';
import { notFound, useRouter } from 'next/navigation';
import Link from "next/link";
import Image from "next/image";
import { Loader2 } from "lucide-react";
import { format } from "date-fns";
import { Hero } from "@/components/hero";
import { LeagueTable } from "@/components/league-table";
import { ClubTv } from "@/components/club-tv";
import { NewsSection } from "@/components/news-section";
import { ClubHeader } from "@/components/club-header";
import { ClubFooter } from "@/components/club-footer";
import { PartnerStripClient } from "@/components/partner-strip-client";
import type { NewsArticle } from "@/types/news";
import { MatchSection } from "@/components/match-section";

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
    const router = useRouter();

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
                    return;
                }
                const fullData = await fullRes.json();
                if (cancelled) return;
                setClubInfo(fullData);
            } catch (fullErr) {
                console.error("Failed to fetch full club data:", fullErr);
            }
        };

        const fetchSummaryThenFull = async () => {
            try {
                setIsLoading(true);
                const summaryRes = await fetch(`/api/club-summary/${clubId}`);
                if (!summaryRes.ok) {
                    if (summaryRes.status === 404) {
                        console.error("Club summary not found, clearing stored ID and redirecting.");
                        localStorage.removeItem('selectedClubId');
                        router.push('/');
                    } else {
                        throw new Error(`Summary HTTP error! status: ${summaryRes.status}`);
                    }
                    return;
                }
                const summaryData = await summaryRes.json();
                if (cancelled) return;
                setClubInfo(summaryData);
                setIsLoading(false);

                const ric = (globalThis as any).requestIdleCallback as
                    | ((cb: () => void) => number)
                    | undefined;
                if (ric) {
                    idleHandle = ric(() => {
                        runFullFetch();
                    });
                } else {
                    timeoutHandle = setTimeout(() => {
                        runFullFetch();
                    }, 0);
                }
            } catch (e) {
                console.error("Failed to fetch club summary:", e);
                setIsLoading(false);
            }
        };

        if (!initialClubInfo) {
            fetchSummaryThenFull();
        } else {
            const ric = (globalThis as any).requestIdleCallback as
                | ((cb: () => void) => number)
                | undefined;
            if (ric) {
                idleHandle = ric(() => {
                    runFullFetch();
                });
            } else {
                timeoutHandle = setTimeout(() => {
                    runFullFetch();
                }, 0);
            }
        }

        return () => {
            cancelled = true;
            const cic = (globalThis as any).cancelIdleCallback as ((id: number) => void) | undefined;
            if (idleHandle != null && cic) cic(idleHandle);
            if (timeoutHandle) clearTimeout(timeoutHandle);
        };
    }, [clubId, initialClubInfo, router]);

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
              <div className="container mx-auto px-4 pt-6">
                <div className="relative w-full aspect-[8/3]">
                  <div className="absolute inset-0 grid grid-cols-3 gap-6">
                    <div className="col-span-2">
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

                    <div className="col-span-1">
                      <div className="h-full flex flex-col gap-3">
                        {sideHeroItems.map((item) => (
                          <Link
                            key={item.id}
                            href={resolveNewsHref(item, clubId)}
                            target={isExternalNewsLink(item) ? "_blank" : undefined}
                            rel={isExternalNewsLink(item) ? "noopener noreferrer" : undefined}
                            className="flex-1 min-h-0 rounded-lg overflow-hidden bg-white shadow-sm hover:shadow-md transition-shadow border border-black/5"
                          >
                            <div className="h-full flex flex-col overflow-hidden">
                              <div className="relative w-full flex-[0_0_72%] bg-muted">
                                <Image
                                  src={toCloudinaryPadded16x9((item as any).imageUrl || "/no-image.png", 640)}
                                  alt={(item as any).imageUrl ? item.title : "No image available"}
                                  fill
                                  className="object-cover"
                                  sizes="(min-width: 768px) 320px, 100vw"
                                />
                              </div>
                              <div className="flex-1 min-h-0 px-3 py-2 overflow-hidden">
                                <div className="text-[11px] text-muted-foreground">
                                  {(() => {
                                    const d = resolvePublishedDate((item as any).publishedAt);
                                    return d ? format(d, "yyyy/MM/dd") : "";
                                  })()}
                                </div>
                                <div className="mt-0.5 text-sm font-semibold leading-snug line-clamp-2 text-gray-900">
                                  {item.title}
                                </div>
                              </div>
                            </div>
                          </Link>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="container mx-auto px-4 pt-0 pb-8 md:pt-8">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
                    <div className="md:col-span-2 space-y-4 md:space-y-6">
                        <div className="md:hidden">
                          <NewsSection news={listNews} clubId={clubId} />
                        </div>
                        <MatchSection 
                            nextMatch={clubInfo.nextMatch} 
                            recentMatches={(clubInfo as any).recentMatches || []}
                            mainTeamId={(clubInfo as any).profile?.mainTeamId || null}
                            clubSlug={clubId}
                        />
                        <div className="lg:hidden">
                          <LeagueTable clubId={clubId} competitions={clubInfo.competitions || []} minCardOnMobile />
                        </div>
                        {videos.length > 0 && <ClubTv videos={videos} clubId={clubId} />}
                    </div>
                    <div className="hidden lg:block lg:col-span-1">
                        <LeagueTable clubId={clubId} competitions={clubInfo.competitions || []} />
                    </div>
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
