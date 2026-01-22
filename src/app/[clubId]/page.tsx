import type { Metadata } from "next";
import ClubPageContent from "./ClubPageContent";
import { db } from "@/lib/firebase/admin";

interface ClubPageProps {
  params: Promise<{ clubId: string }>;
}

async function getClubOgMeta(clubId: string): Promise<{ clubName: string; logoUrl: string | null } | null> {
  try {
    const profilesQuery = db.collection("club_profiles").where("clubId", "==", clubId).limit(1);
    const profileSnap = await profilesQuery.get();
    if (profileSnap.empty) return null;

    const data = profileSnap.docs[0].data() as any;
    const clubName = typeof data?.clubName === "string" && data.clubName.trim() ? data.clubName.trim() : clubId;
    const logoUrl = typeof data?.logoUrl === "string" && data.logoUrl.trim() ? data.logoUrl.trim() : null;
    return { clubName, logoUrl };
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: { clubId: string };
}): Promise<Metadata> {
  const clubId = params.clubId;
  const meta = await getClubOgMeta(clubId);

  const title = meta?.clubName ? `${meta.clubName} | Footballtop` : `${clubId} | Footballtop`;
  const description = meta?.clubName ? `${meta.clubName} の公式サイト` : "クラブの公式サイト";
  const imageUrl = `/${encodeURIComponent(clubId)}/opengraph-image`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `/${encodeURIComponent(clubId)}`,
      siteName: "Footballtop",
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
