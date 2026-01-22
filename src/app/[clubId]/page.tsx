import type { Metadata } from "next";
import ClubPageContent from "./ClubPageContent";
import { headers } from "next/headers";

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
  const fallbackSiteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  const baseUrl = host ? `${proto}://${host}` : fallbackSiteUrl;
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
  return <ClubPageContent clubId={clubId} />;
}
