import type { Metadata } from "next";
import ClubPageContent from "./ClubPageContent";
import { headers } from "next/headers";
import { db } from "@/lib/firebase/admin";
import { getMatchDataForClub } from "@/lib/matches";
import { resolvePublicClubProfile } from "@/lib/public-club-profile";
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
  params: Promise<{ clubId: string }>;
}): Promise<Metadata> {
  const { clubId } = await params;

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
      const resolved = await resolvePublicClubProfile(clubId);
      if (!resolved) return null;

      // 共通ヘルパーがエイリアス→正規clubUid解決・メインチームの名称/ロゴ・clubs/配色補完済み
      const profileData = resolved.profileData as any;
      const clubUid = resolved.clubUid;

      const clubDataSnap = await db.collection("clubs").doc(clubUid).get();
      const clubData = clubDataSnap.exists ? (clubDataSnap.data() as any) : { headerImageUrl: null };

      const resolvedProfile = profileData;

      const heroLimitRaw = (clubData as any)?.heroNewsLimit;
      const heroLimit = typeof heroLimitRaw === "number" && heroLimitRaw >= 1 && heroLimitRaw <= 5 ? heroLimitRaw : 3;
      const baseLimit = Math.max(heroLimit * 3, 6);

      const newsQuery = db.collection(`clubs/${clubUid}/news`).orderBy("publishedAt", "desc").limit(baseLimit * 2);
      const videosQuery = db.collection(`clubs/${clubUid}/videos`).orderBy("publishedAt", "desc").limit(4);
      const competitionsQuery = db.collection(`clubs/${clubUid}/competitions`);
      const playersQuery = (profileData as any)?.mainTeamId
        ? db.collection(`clubs/${clubUid}/teams/${(profileData as any).mainTeamId}/players`).orderBy("number", "asc").limit(8)
        : null;

      const [{ latestResult, nextMatch, recentMatches, upcomingMatches, allRecentMatches }, newsSnap, videosSnap, competitionsSnap, playersSnap] = await Promise.all([
        getMatchDataForClub(clubUid),
        newsQuery.get(),
        videosQuery.get(),
        competitionsQuery.get(),
        playersQuery ? playersQuery.get() : Promise.resolve(null),
      ]);

      const allNews = newsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() } as any));

  // ヒーローセクション: statusフィルタリングなし、すべての記事を対象
  const heroNewsAll = allNews.filter((article) => {
    if (!article || typeof article !== 'object') return false;
    return true;
  });

  // NEWSセクション: 公開済みまたはステータス未設定の記事のみフィルタリング
  const publishedNews = allNews.filter((article) => {
    if (!article || typeof article !== 'object') return false;
    const status = (article as any).status;
    return status === 'published' || status === undefined || status === null;
  });

  // ヒーローセクション: statusフィルタリングなし、featuredInHero=true の記事のみ対象
  const featuredOnly = heroNewsAll.filter((article) => (article as any).featuredInHero === true);
  console.log('[Server] heroNewsAll count:', heroNewsAll.length);
  console.log('[Server] featuredOnly count:', featuredOnly.length);
  console.log('[Server] heroNewsAll sample:', heroNewsAll.slice(0, 2).map(a => ({ id: a.id, featuredInHero: a.featuredInHero, status: a.status })));
  const heroSorted = featuredOnly.slice().sort((a, b) => {
    // 日付でソート（最新優先）
    const ad = (a as any).publishedAt?.toDate ? (a as any).publishedAt.toDate() : (a as any).publishedAt;
    const bd = (b as any).publishedAt?.toDate ? (b as any).publishedAt.toDate() : (b as any).publishedAt;
    const at = ad instanceof Date ? ad.getTime() : 0;
    const bt = bd instanceof Date ? bd.getTime() : 0;
    return bt - ad;
  });
  const heroNews = heroSorted.slice(0, heroLimit) as NewsArticle[];
  console.log('[Server] heroNews count:', heroNews.length);
  // heroNews をディープコピーしてシリアライズ問題を回避
  const heroNewsCopy = heroNews.map(article => ({ ...article }));

  // NEWSセクション: 常に最新順の上位 6 件を使用
  const sortedByLatest = publishedNews.slice().sort((a, b) => {
    const ad = (a as any).publishedAt?.toDate ? (a as any).publishedAt.toDate() : (a as any).publishedAt;
    const bd = (b as any).publishedAt?.toDate ? (b as any).publishedAt.toDate() : (b as any).publishedAt;
    const at = ad instanceof Date ? ad.getTime() : 0;
    const bt = bd instanceof Date ? bd.getTime() : 0;
    return bt - at;
  });
  const latestNews = sortedByLatest.slice(0, 6) as NewsArticle[];

      const competitions = competitionsSnap.docs.map((doc) => {
        const data = doc.data() as any;
        return { id: doc.id, clubUid, name: data.name || "Unnamed Competition", ...data };
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

      const players = playersSnap
        ? playersSnap.docs
            .map((doc) => ({ id: doc.id, __teamId: (profileData as any)?.mainTeamId, ...(doc.data() as any) }))
            .filter((player: any) => player?.isPublished !== false)
            .slice(0, 2)
        : [];

      return {
        profile: resolvedProfile,
        data: clubData,
        latestResult,
        nextMatch,
        recentMatches,
        upcomingMatches,
        allRecentMatches,
        news: latestNews,
        heroNews: heroNewsCopy,
        videos,
        players,
        competitions: Array.isArray(competitions) ? competitions : [competitions].filter(Boolean),
      };
    } catch {
      return null;
    }
  })();

  const serializedInitialClubInfo = initialClubInfo ? serializeForClient(initialClubInfo) : null;
  console.log('[Server] serializedInitialClubInfo.heroNews:', serializedInitialClubInfo?.heroNews);
  console.log('[Server] serializedInitialClubInfo.news:', serializedInitialClubInfo?.news);

  return <ClubPageContent clubId={clubId} initialClubInfo={serializedInitialClubInfo} />;
}
