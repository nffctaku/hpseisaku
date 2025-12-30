"use client";

import { useEffect, useState } from 'react';
import { notFound, useRouter } from 'next/navigation';
import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import { Hero } from "@/components/hero";
import { LeagueTable } from "@/components/league-table";
import { ClubTv } from "@/components/club-tv";
import { NewsSection } from "@/components/news-section";
import { ClubHeader } from "@/components/club-header";
import { ClubFooter } from "@/components/club-footer";

const MatchSection = dynamic(
  () => import("@/components/match-section").then((m) => m.MatchSection),
  { ssr: false }
);

export default function ClubPageContent({ clubId }: { clubId: string }) {
    const [clubInfo, setClubInfo] = useState<any>({
        news: [],
        latestResult: null,
        nextMatch: null,
        profile: { clubName: '' },
        videos: [],
        competitions: [],
    });
    const router = useRouter();

    useEffect(() => {
        if (clubId === 'admin') {
            notFound();
            return;
        }

        const fetchData = async () => {
            try {
                // 1. まず軽量なサマリーデータを取得して、素早く初期表示する
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
                setClubInfo(summaryData);

                // 2. バックグラウンドで重いフルデータを取得し、到着したら上書き
                try {
                    const fullRes = await fetch(`/api/club/${clubId}`);
                    if (fullRes.ok) {
                        const fullData = await fullRes.json();
                        setClubInfo(fullData);
                    } else {
                        console.error(`Full club data HTTP error: ${fullRes.status}`);
                    }
                } catch (fullErr) {
                    console.error("Failed to fetch full club data:", fullErr);
                }
            } catch (e) {
                console.error("Failed to fetch club summary:", e);
                // Continue with empty state even if fetch fails
            }
        };

        fetchData();
    }, [clubId]);

    const homeBgColor = clubInfo.profile?.homeBgColor as string | undefined;
    const heroNewsLimit =
        (clubInfo.data?.heroNewsLimit as number | undefined) ??
        (clubInfo.profile?.heroNewsLimit as number | undefined) ??
        3;

    const heroNews = (clubInfo as any).heroNews || clubInfo.news || [];
    const listNews = clubInfo.news || [];

    return (
        <main
          className="min-h-screen"
          style={homeBgColor ? { backgroundColor: homeBgColor } : undefined}
        >
            <ClubHeader 
                clubId={clubId} 
                clubName={clubInfo.profile?.clubName || ""} 
                logoUrl={clubInfo.profile?.logoUrl || null} 
                snsLinks={clubInfo.profile?.snsLinks || {}}
            />
            <Hero news={heroNews} maxSlides={heroNewsLimit} />
            <div className="container mx-auto px-4 pt-0 pb-8 md:pt-8">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
                    <div className="md:col-span-2 space-y-4 md:space-y-6">
                        <NewsSection news={listNews} clubId={clubId} />
                        <MatchSection 
                            latestResult={clubInfo.latestResult} 
                            nextMatch={clubInfo.nextMatch} 
                            clubName={clubInfo.profile?.clubName || ''} 
                        />
                        <ClubTv videos={clubInfo.videos || []} clubId={clubId} />
                    </div>
                    <div className="lg:col-span-1">
                        <LeagueTable competitions={clubInfo.competitions || []} />
                    </div>
                </div>
            </div>
            <ClubFooter 
              clubId={clubId}
              clubName={clubInfo.profile?.clubName || ""}
              sponsors={clubInfo.profile?.sponsors || []} 
              snsLinks={clubInfo.profile?.snsLinks || {}} 
              legalPages={clubInfo.profile?.legalPages || []}
            />
        </main>
    );
}
