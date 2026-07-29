import type { Metadata } from "next";
import ClubPageContent from "./ClubPageContent";
import { headers } from "next/headers";
import { db } from "@/lib/firebase/admin";
import { getMatchDataForClub } from "@/lib/matches";
import type { NewsArticle } from "@/types/news";

export const revalidate = 60;

function serializeForClient<T>(value: T): T {
  const seen = new WeakSet<object>();

  const visit = (v: any): any => {
    if (v == null) return v;
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;

    if (v instanceof Date) return v.toISOString();
    if (typeof v?.toDate === "function") {
      try {
        const d = v.toDate();
        if (d instanceof Date) return d.toISOString();
      } catch {
        // fallthrough
      }
    }

    if (Array.isArray(v)) return v.map(visit);

    if (typeof v === "object") {
      if (seen.has(v)) return null;
      seen.add(v);

      const proto = Object.getPrototypeOf(v);
      const isPlain = proto === Object.prototype || proto === null;
      if (!isPlain) {
        // e.g. Timestamp/DocumentReference/etc.
        try {
          return JSON.parse(JSON.stringify(v));
        } catch {
          return String(v);
        }
      }

      const out: Record<string, any> = {};
      for (const [k, vv] of Object.entries(v)) {
        if (vv === undefined) continue;
        out[k] = visit(vv);
      }
      return out;
    }

    return null;
  };

  return visit(value);
}

interface ClubPageProps {
  params: Promise<{ clubId: string }>;
}

export async function generateMetadata({
  params,
}: {
  params: { clubId: string };
}): Promise<Metadata> {
  const clubId = params.clubId;

  const title = "FootChronでチームHPを公開しました";
  const description = "FootChronでチームHPを公開しました";
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  const envSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  const fallbackSiteUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000";

  // Prefer a canonical, stable domain if provided (prevents Vercel preview domains from leaking into og:image).
  const baseUrl = envSiteUrl || (host ? `${proto}://${host}` : fallbackSiteUrl);
  const imageUrl = new URL("/OGP.png?v=20260122", baseUrl).toString();

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `/${encodeURIComponent(clubId)}`,
      siteName: "FootChron",
      images: [{ url: imageUrl, width: 1200, height: 630 }],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [imageUrl],
    },
  };
}

export default async function ClubPage({ params }: ClubPageProps) {
  const { clubId } = await params;

  const initialClubInfo = await (async () => {
    try {
      const profilesQuery = db.collection("club_profiles").where("clubId", "==", clubId).limit(1);
      const profilesSnap = await profilesQuery.get();

      const clubProfileDoc = !profilesSnap.empty ? profilesSnap.docs[0] : null;
      const directSnap = clubProfileDoc ? null : await db.collection("club_profiles").doc(clubId).get();

      if (!clubProfileDoc && !directSnap?.exists) return null;

      const profileData = (clubProfileDoc ? clubProfileDoc.data() : (directSnap!.data() as any))!;
      const ownerUid = (profileData as any).ownerUid || (clubProfileDoc ? clubProfileDoc.id : directSnap!.id);
      if (!ownerUid) return null;

      // Parallelize club data and main team fetch
      const [clubDataSnap, mainTeamSnap] = await Promise.all([
        db.collection("clubs").doc(ownerUid).get(),
        (profileData as any)?.mainTeamId
          ? db.collection(`clubs/${ownerUid}/teams`).doc((profileData as any).mainTeamId).get()
          : Promise.resolve({ exists: false }),
      ]);

      const clubData = clubDataSnap.exists ? (clubDataSnap.data() as any) : { headerImageUrl: null };
      const mainTeamData = mainTeamSnap.exists ? mainTeamSnap.data() : null;

      const resolvedProfile = {
        ...profileData,
        clubName: (mainTeamData as any)?.name || (profileData as any).clubName,
        logoUrl: (mainTeamData as any)?.logoUrl || (profileData as any).logoUrl,
      } as any;

      const heroLimitRaw = (clubData as any)?.heroNewsLimit;
      const heroLimit = typeof heroLimitRaw === "number" && heroLimitRaw >= 1 && heroLimitRaw <= 5 ? heroLimitRaw : 3;
      const baseLimit = Math.max(heroLimit * 3, 5);

      const newsQuery = db.collection(`clubs/${ownerUid}/news`).orderBy("publishedAt", "desc").limit(baseLimit);
      const videosQuery = db.collection(`clubs/${ownerUid}/videos`).orderBy("publishedAt", "desc").limit(4);
      const competitionsQuery = db.collection(`clubs/${ownerUid}/competitions`);

      const [{ latestResult, nextMatch, recentMatches, upcomingMatches, allRecentMatches }, newsSnap, videosSnap, competitionsSnap] = await Promise.all([
        getMatchDataForClub(ownerUid),
        newsQuery.get(),
        videosQuery.get(),
        competitionsQuery.get(),
      ]);

      const allNews = newsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() } as any));
      const sortedByLatest = allNews.slice().sort((a, b) => {
        const ad = (a as any).publishedAt?.toDate ? (a as any).publishedAt.toDate() : (a as any).publishedAt;
        const bd = (b as any).publishedAt?.toDate ? (b as any).publishedAt.toDate() : (b as any).publishedAt;
        const at = ad instanceof Date ? ad.getTime() : 0;
        const bt = bd instanceof Date ? bd.getTime() : 0;
        return bt - at;
      });
      const heroNews = sortedByLatest.slice(0, heroLimit) as NewsArticle[];

      const heroNewsIds = new Set(heroNews.map(item => item.id));
      const latestNews = sortedByLatest
        .filter(item => !heroNewsIds.has(item.id))
        .slice(0, 5) as NewsArticle[];

      const competitions = competitionsSnap.docs.map((doc) => {
        const data = doc.data() as any;
        return { id: doc.id, ownerUid, name: data.name || "Unnamed Competition", ...data };
      });

      const videos = videosSnap.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          title: data.title,
          youtubeVideoId: data.youtubeVideoId,
          publishedAt: data.publishedAt?.toDate?.() ? data.publishedAt.toDate().toISOString() : data.publishedAt,
        };
      });

      return {
        profile: resolvedProfile,
        data: clubData,
        latestResult,
        nextMatch,
        recentMatches,
        upcomingMatches,
        allRecentMatches,
        news: latestNews,
        heroNews,
        videos,
        competitions: Array.isArray(competitions) ? competitions : [competitions].filter(Boolean),
      };
    } catch {
      return null;
    }
  })();

  const serializedInitialClubInfo = initialClubInfo ? serializeForClient(initialClubInfo) : null;

  return <ClubPageContent clubId={clubId} initialClubInfo={serializedInitialClubInfo} />;
}
