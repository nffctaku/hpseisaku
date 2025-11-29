"use client";

import { useEffect, useState } from 'react';
import { notFound, useRouter } from 'next/navigation';
import { Loader2 } from "lucide-react";
import { Hero } from "@/components/hero";
import { MatchSection } from "@/components/match-section";
import { LeagueTable } from "@/components/league-table";
import { ClubTv } from "@/components/club-tv";
import { NewsSection } from "@/components/news-section";
import { ClubHeader } from "@/components/club-header";
import { ClubFooter } from "@/components/club-footer";

export default function ClubPageContent({ clubId }: { clubId: string }) {
    const [clubInfo, setClubInfo] = useState<any>({
        news: [],
        latestResult: null,
        nextMatch: null,
        profile: { clubName: '' },
        videos: [],
        competitions: [],
    });
    const [loading, setLoading] = useState(true);
    const router = useRouter();

    useEffect(() => {
        if (clubId === 'admin') {
            notFound();
            return;
        }

        const fetchData = async () => {
            try {
                const response = await fetch(`/api/club/${clubId}`);
                if (!response.ok) {
                    if (response.status === 404) {
                        console.error("Club not found, clearing stored ID and redirecting.");
                        localStorage.removeItem('selectedClubId');
                        router.push('/');
                    } else {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }
                    return;
                }
                const data = await response.json();
                setClubInfo(data);
            } catch (e) {
                console.error("Failed to fetch club data:", e);
                // Continue with empty state even if fetch fails
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [clubId]);

    if (loading) {
        return (
            <main className="min-h-screen flex flex-col bg-background">
                <ClubHeader 
                    clubId={clubId} 
                    clubName={clubInfo.profile?.clubName || ""} 
                    logoUrl={clubInfo.profile?.logoUrl || null} 
                />
                <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-3">
                    <Loader2 className="h-7 w-7 animate-spin" />
                    <p className="text-sm">クラブページを読み込み中です…</p>
                </div>
            </main>
        );
    }

    return (
        <main>
            <ClubHeader 
                clubId={clubId} 
                clubName={clubInfo.profile?.clubName || ""} 
                logoUrl={clubInfo.profile?.logoUrl || null} 
            />
            <Hero news={clubInfo.news || []} />
            <div className="container mx-auto px-4 py-8">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    <div className="md:col-span-2 space-y-8">
                        <MatchSection 
                            latestResult={clubInfo.latestResult} 
                            nextMatch={clubInfo.nextMatch} 
                            clubName={clubInfo.profile?.clubName || ''} 
                        />
                        <ClubTv videos={clubInfo.videos || []} clubId={clubId} />
                        <NewsSection news={clubInfo.news || []} clubId={clubId} />
                    </div>
                    <div className="lg:col-span-1">
                        <LeagueTable competitions={clubInfo.competitions || []} />
                    </div>
                </div>
            </div>
            <ClubFooter 
              clubId={clubId}
              sponsors={clubInfo.profile?.sponsors || []} 
              snsLinks={clubInfo.profile?.snsLinks || {}} 
              legalPages={clubInfo.profile?.legalPages || []}
            />
        </main>
    );
}
