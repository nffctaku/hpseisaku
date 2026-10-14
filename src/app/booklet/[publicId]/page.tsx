import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Suspense, cache } from "react";

import { db } from "@/lib/firebase/admin";
import { getBookletShare, type BookletShareDoc } from "@/lib/booklet-share";
import { getBookletTeamData } from "@/lib/booklet-data-server";
import { getEffectivePlanForUid } from "@/lib/server-plan";
import { getCareer } from "@/lib/career-server";
import { safeString } from "@/app/api/admin/booklet/lib";

import { isParodyClub } from "@/lib/parody";
import { capPublicCardIds } from "@/lib/booklet-limits";

import { PublicBooklet, type PublicBookletView } from "./PublicBooklet";

// 公開・非公開・プラン変更を即時反映するためキャッシュしない
export const dynamic = "force-dynamic";
export const revalidate = 0;

// generateMetadataとページ本体で重複実行されないようリクエスト内でメモ化
const loadShare = cache(async function loadShare(publicId: string) {
  const share = await getBookletShare(publicId);
  if (!share || !share.isPublished) return null;

  // 所有者・Careerの実在確認（削除済みCareerの名鑑は公開しない）
  const career = await getCareer(share.careerId);
  if (!career || career.ownerId !== share.ownerUid || career.clubUid !== share.clubUid) return null;

  return share;
});

async function loadClubProfile(clubUid: string) {
  try {
    const snap = await db.collection("club_profiles").doc(clubUid).get();
    const d = snap.exists ? (snap.data() as any) : null;
    return {
      clubName: safeString(d?.clubName),
      logoUrl: typeof d?.logoUrl === "string" && d.logoUrl.trim() ? d.logoUrl.trim() : null,
      homeBgColor:
        typeof d?.homeBgColor === "string" && d.homeBgColor.trim() ? d.homeBgColor.trim() : null,
      realTeamUsage: typeof d?.realTeamUsage === "boolean" ? d.realTeamUsage : undefined,
      gameTeamUsage: typeof d?.gameTeamUsage === "boolean" ? d.gameTeamUsage : undefined,
    };
  } catch {
    return {
      clubName: "",
      logoUrl: null,
      homeBgColor: null,
      realTeamUsage: undefined,
      gameTeamUsage: undefined,
    };
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ publicId: string }>;
}): Promise<Metadata> {
  const { publicId } = await params;
  const share = await loadShare(publicId).catch(() => null);
  if (!share) {
    return {
      title: "選手名鑑 | FootChron",
      robots: { index: false, follow: false },
    };
  }

  const profile = await loadClubProfile(share.clubUid);
  const title = `${profile.clubName || "チーム"}｜${share.season} 選手名鑑`;
  const description =
    "自分だけの選手名鑑を作ろう。選手の写真やプロフィール、能力値を自由に登録・公開できます。";

  // クラブページと同じ方式: リクエストホストから絶対URLを解決し、画像URLにも?v=でバージョン管理
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  const envSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  const fallbackSiteUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000";
  const baseUrl = envSiteUrl || (host ? `${proto}://${host}` : fallbackSiteUrl);
  const imageUrl = new URL("/booklet-ogp.jpg?v=2", baseUrl).toString();

  return {
    title,
    description,
    // 公開URLを知っていても検索エンジンには掲載しない
    robots: { index: false, follow: false },
    openGraph: {
      title,
      description,
      url: `/booklet/${encodeURIComponent(publicId)}`,
      siteName: "FootChron",
      type: "website",
      images: [{ url: imageUrl, width: 1672, height: 941 }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [imageUrl],
    },
  };
}

export default async function PublicBookletPage({
  params,
}: {
  params: Promise<{ publicId: string }>;
}) {
  const { publicId } = await params;
  // 公開検証だけ先に確定し、選手データ取得はSuspense内に逃がす。
  // head(OGPメタ)とシェルを先行送信しないとSNSクローラーがタイムアウトする
  const share = await loadShare(publicId);
  if (!share) notFound();

  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-slate-900">
          <p className="animate-pulse text-sm font-semibold text-white/70">読み込み中…</p>
        </main>
      }
    >
      <BookletContent share={share} />
    </Suspense>
  );
}

async function BookletContent({ share }: { share: BookletShareDoc }) {
  // ストリーミング開始後は404にできないため、取得失敗はページ内メッセージに変換する
  let view: PublicBookletView;
  try {
    const [plan, profile] = await Promise.all([
      getEffectivePlanForUid(share.ownerUid),
      loadClubProfile(share.clubUid),
    ]);
    const isPro = plan.tier !== "free";

    // プラン別の公開上限を適用（保存済み選択順の先頭のみ公開。超過分は保持される）
    const publicIds = capPublicCardIds(share.cardPlayerIds, plan.tier);

    // 公開に必要な選手だけ集計（カード掲載選手 + フォーメーションスタメン）
    const neededIds = new Set<string>(publicIds);
    if (isPro && share.showFormation) {
      for (const pid of Object.values(share.starters)) {
        if (typeof pid === "string" && pid) neededIds.add(pid);
      }
    }

    const data = await getBookletTeamData({
      ownerUid: share.clubUid,
      teamId: share.teamId,
      seasonId: share.season,
      clubProfile: profile,
      playerIds: neededIds,
    });

  const byId = new Map(data.players.map((p) => [String(p.id), p]));
  const cardPlayers = publicIds
    .map((id) => byId.get(id))
    .filter((p): p is NonNullable<typeof p> => !!p);

  // Pro限定セクション（Free レスポンスには含めない）
  let pro: PublicBookletView["pro"] = null;
  if (isPro) {
    const startersByPosition: Record<
      string,
      { id: string; number: string; name: string; photoUrl?: string } | null
    > = {};
    for (const [posId, pid] of Object.entries(share.starters)) {
      const p = typeof pid === "string" ? byId.get(pid) : undefined;
      startersByPosition[posId] = p
        ? {
            id: p.id,
            number: p.number != null ? String(p.number) : "-",
            name: safeString(p.name) || "-",
            ...(p.photoUrl ? { photoUrl: p.photoUrl } : {}),
          }
        : null;
    }
    const fallbackPlayers = data.players.map((p) => ({
      id: p.id,
      number: p.number != null ? String(p.number) : "-",
      name: safeString(p.name) || "-",
      ...(p.photoUrl ? { photoUrl: p.photoUrl } : {}),
    }));

    pro = {
      bioTitle: share.showIntroduction ? share.bioTitle : "",
      bioBody: share.showIntroduction ? share.bioBody : "",
      formationName: share.showFormation ? share.formationName : null,
      startersByPosition: share.showFormation ? startersByPosition : {},
      fallbackPlayers: share.showFormation ? fallbackPlayers : [],
    };
  }

    view = {
      isPro,
      isParody: isParodyClub(profile),
      clubName: profile.clubName || data.club.clubName,
      logoUrl: profile.logoUrl,
      teamName: data.teamName,
      season: share.season,
      accentColor: profile.homeBgColor || "#C8102E",
      showParameterGraph: share.showParameterGraph,
      positionColors: share.positionColors,
      players: cardPlayers,
      pro,
    };
  } catch (error) {
    console.error(
      `PublicBooklet load failed (publicId=${share.publicId} club=${share.clubUid} team=${share.teamId} season=${share.season}):`,
      error
    );
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-900 px-6">
        <p className="text-center text-sm font-semibold text-white/80">
          選手名鑑の読み込みに失敗しました。時間をおいて再度お試しください。
        </p>
      </main>
    );
  }

  return <PublicBooklet view={view} />;
}
