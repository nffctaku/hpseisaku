import { db } from "@/lib/firebase/admin";
import { notFound } from "next/navigation";

interface PageProps {
  params: Promise<{ clubId: string; slug: string }>;
}

async function getLegalPage(clubId: string, rawSlug: string) {
  const slug = decodeURIComponent(rawSlug);
  let profileDoc: FirebaseFirestore.DocumentSnapshot | null = null;

  // 1. Try to find by clubId field
  const profilesQuery = db.collection("club_profiles").where("clubId", "==", clubId).limit(1);
  const profilesSnap = await profilesQuery.get();

  if (!profilesSnap.empty) {
    profileDoc = profilesSnap.docs[0];
  } else {
    // 2. Fallback: use clubId as document ID
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

  const paragraphs = content
    .split(/\n{2,}/)
    .map((p: string) => p.trim())
    .filter((p: string) => Boolean(p));

  return (
    <div className="min-h-screen">
      <div className="container mx-auto px-4 py-8 max-w-3xl">
        <div className="mb-6">
          <p className="text-xs text-muted-foreground mb-1">{clubName}</p>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{title || slug}</h1>
        </div>
        <div className="space-y-4 text-sm leading-relaxed whitespace-pre-wrap">
          {paragraphs.length > 0
            ? paragraphs.map((p: string, idx: number) => <p key={idx}>{p}</p>)
            : <p className="text-muted-foreground">内容がまだ設定されていません。</p>}
        </div>
      </div>
    </div>
  );
}
