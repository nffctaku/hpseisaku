import type { Metadata } from "next";
import ClubPageContent from "./ClubPageContent";

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
  const imageUrl = "/OGP.png";

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
