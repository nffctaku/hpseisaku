import { db } from "@/lib/firebase/admin";
import { notFound } from "next/navigation";
import { ClubHeader } from "@/components/club-header";
import { ClubFooter } from "@/components/club-footer";
import Link from "next/link";

interface PageProps {
  params: Promise<{ clubId: string; slug: string }>;
}

async function getLegalPage(clubId: string, rawSlug: string) {
  const slug = decodeURIComponent(rawSlug);
  let profileDoc: FirebaseFirestore.DocumentSnapshot | null = null;

  const profilesQuery = db.collection("club_profiles").where("clubId", "==", clubId).limit(1);
  const profilesSnap = await profilesQuery.get();

  if (!profilesSnap.empty) {
    profileDoc = profilesSnap.docs[0];
  } else {
    const directRef = db.collection("club_profiles").doc(clubId);
    const directSnap = await directRef.get();
    if (directSnap.exists) {
      profileDoc = directSnap;
    }
  }

  if (!profileDoc) {
    return null;
  }

  const profileData = profileDoc.data() as any;
  const legalPages: any[] = Array.isArray(profileData.legalPages) ? profileData.legalPages : [];
  const page = legalPages.find((p) => p.slug === slug || p.title === slug);

  if (!page) return null;

  return {
    clubName: profileData.clubName || "",
    logoUrl: typeof profileData.logoUrl === "string" ? profileData.logoUrl : null,
    snsLinks: (profileData.snsLinks && typeof profileData.snsLinks === "object") ? profileData.snsLinks : {},
    sponsors: Array.isArray(profileData.sponsors) ? profileData.sponsors : [],
    legalPages,
    homeBgColor: typeof profileData.homeBgColor === "string" ? profileData.homeBgColor : undefined,
    title: typeof page.title === "string" ? page.title : "",
    content: typeof page.content === "string" ? page.content : "",
  };
}

export default async function LegalTextPage({ params }: PageProps) {
  const { clubId, slug } = await params;

  if (clubId === "admin") {
    notFound();
  }

  const data = await getLegalPage(clubId, slug);

  if (!data) {
    notFound();
  }

  const { clubName, title, content } = data;
  const { logoUrl, snsLinks, sponsors, legalPages } = data as any;

  const paragraphs = content
    .split(/\n{2,}/)
    .map((p: string) => p.trim())
    .filter((p: string) => Boolean(p));

  return (
    <main className="min-h-screen flex flex-col">
      <ClubHeader
        clubId={clubId}
        clubName={clubName || ""}
        logoUrl={logoUrl}
        snsLinks={snsLinks || {}}
      />
      <div className="flex-1">
        <div className="container mx-auto px-4 py-8 max-w-3xl">
          <div className="mb-4">
            <Link
              href={`/${clubId}`}
              className="text-sm text-muted-foreground hover:underline"
            >
              ← 戻る
            </Link>
          </div>
          <div className="mb-6">
            <p className="text-xs text-muted-foreground mb-1">{clubName}</p>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{title || decodeURIComponent(slug)}</h1>
          </div>
          <div className="space-y-4 text-sm leading-relaxed whitespace-pre-wrap">
            {paragraphs.length > 0 ? (
              paragraphs.map((p: string, idx: number) => <p key={idx}>{p}</p>)
            ) : (
              <p className="text-muted-foreground">内容がまだ設定されていません。</p>
            )}
          </div>
        </div>
      </div>
      <ClubFooter
        clubId={clubId}
        clubName={clubName || ""}
        sponsors={sponsors || []}
        snsLinks={snsLinks || {}}
        legalPages={legalPages || []}
      />
    </main>
  );
}
