export const revalidate = 0; // Force dynamic rendering

import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ClubHeader } from "@/components/club-header";
import { ClubFooter } from "@/components/club-footer";
import { db } from "@/lib/firebase/admin";

type PartnerCategory = "top" | "official";

type PartnerCategoryDef = {
  id: string;
  name: string;
  sortOrder: number;
};

type Partner = {
  id: string;
  name: string;
  categoryId?: string;
  category?: PartnerCategory;
  logoUrl?: string;
  linkUrl?: string;
  sortOrder?: number;
  isPublished?: boolean;
};

function categoryLabel(category: PartnerCategory) {
  return category === "top" ? "トップパートナー" : "オフィシャルパートナー";
}

const DEFAULT_CATEGORIES: PartnerCategoryDef[] = [
  { id: "top", name: "トップパートナー", sortOrder: 0 },
  { id: "official", name: "オフィシャルパートナー", sortOrder: 1 },
];

async function getClubInfo(clubId: string) {
  const profilesQuery = db.collection("club_profiles").where("clubId", "==", clubId).limit(1);
  const profilesSnap = await profilesQuery.get();

  const clubProfileDoc = !profilesSnap.empty ? profilesSnap.docs[0] : null;
  const directSnap = clubProfileDoc ? null : await db.collection("club_profiles").doc(clubId).get();
  const ownerSnap = clubProfileDoc || directSnap?.exists
    ? null
    : await db.collection('club_profiles').where('ownerUid', '==', clubId).limit(1).get();

  if (!clubProfileDoc && !directSnap?.exists && ownerSnap?.empty) return null;

  const fallbackDoc = ownerSnap && !ownerSnap.empty ? ownerSnap.docs[0] : null;
  const profileData = (clubProfileDoc ? clubProfileDoc.data() : (directSnap?.exists ? (directSnap!.data() as any) : (fallbackDoc!.data() as any)))!;
  const ownerUid = (profileData as any).ownerUid || (clubProfileDoc ? clubProfileDoc.id : (directSnap?.exists ? directSnap!.id : fallbackDoc!.id));
  if (!ownerUid) return null;

  const mainTeamId = (profileData as any)?.mainTeamId;
  let mainTeamData: any = null;
  if (mainTeamId) {
    const mainTeamSnap = await db.collection(`clubs/${ownerUid}/teams`).doc(mainTeamId).get();
    if (mainTeamSnap.exists) {
      mainTeamData = mainTeamSnap.data();
    }
  }

  return {
    ...profileData,
    ownerUid,
    clubName: (mainTeamData as any)?.name || (profileData as any).clubName,
    logoUrl: (mainTeamData as any)?.logoUrl || (profileData as any).logoUrl,
  } as any;
}

async function getPartners(ownerUid: string): Promise<Partner[]> {
  const ref = db.collection(`clubs/${ownerUid}/partners`);
  const snap = await ref.get();

  const list = snap.docs.map((d) => {
    const data = d.data() as any;
    return {
      id: d.id,
      name: String(data?.name || ""),
      categoryId: typeof data?.categoryId === "string" ? data.categoryId : undefined,
      category: (data?.category === "official" ? "official" : data?.category === "top" ? "top" : undefined) as
        | PartnerCategory
        | undefined,
      logoUrl: typeof data?.logoUrl === "string" ? data.logoUrl : "",
      linkUrl: typeof data?.linkUrl === "string" ? data.linkUrl : "",
      sortOrder: typeof data?.sortOrder === "number" ? data.sortOrder : 0,
      isPublished: typeof data?.isPublished === "boolean" ? data.isPublished : false,
    } as Partner;
  });

  const published = list.filter((p) => p.isPublished);
  published.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  return published;
}

function LogoCard({ partner, largeOnDesktop }: { partner: Partner; largeOnDesktop?: boolean }) {
  const heightClass = largeOnDesktop ? "h-20 sm:h-40" : "h-20";
  const body = (
    <div>
      <div className="rounded-md bg-white p-2 sm:p-3">
        <div className={`flex items-center justify-center ${heightClass}`}>
          {partner.logoUrl ? (
            <div className="relative w-full h-full">
              <Image src={partner.logoUrl} alt={partner.name} fill className="object-contain" />
            </div>
          ) : (
            <div className="text-sm text-muted-foreground font-semibold">{partner.name}</div>
          )}
        </div>
      </div>
      <div className="mt-1 text-center text-[10px] sm:text-xs font-semibold text-white leading-snug line-clamp-2">
        {partner.name}
      </div>
    </div>
  );

  if (partner.linkUrl) {
    return (
      <Link href={partner.linkUrl} target="_blank" rel="noopener noreferrer" className="block">
        {body}
      </Link>
    );
  }

  return body;
}

const SECTION_GRID_CLASS_BY_COLS: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
  5: "grid-cols-5",
};

export default async function PartnerPage({ params }: { params: { clubId: string } }) {
  const clubId = params.clubId;

  if (clubId === "admin") {
    notFound();
  }

  const clubInfo = await getClubInfo(clubId);
  if (!clubInfo || !clubInfo.ownerUid) {
    notFound();
  }

  const partners = await getPartners(String(clubInfo.ownerUid));

  const clubName = (clubInfo.clubName as string | undefined) ?? "";
  const logoUrl = (clubInfo.logoUrl as string | undefined) ?? undefined;
  const snsLinks = ((clubInfo as any).snsLinks as any) ?? {};
  const partnerTitleBg = "#000000" as const;
  const partnerTitleText = "#ffffff" as const;
  const sponsors = (Array.isArray((clubInfo as any).sponsors) ? ((clubInfo as any).sponsors as any[]) : []) as any;
  const legalPages = (Array.isArray((clubInfo as any).legalPages) ? ((clubInfo as any).legalPages as any[]) : []) as any;
  const gameTeamUsage = Boolean((clubInfo as any).gameTeamUsage);
  const partnersPageTitle = "PARTNER";

  const categoriesFromProfile: PartnerCategoryDef[] = Array.isArray((clubInfo as any).partnersCategories)
    ? (((clubInfo as any).partnersCategories as any[])
        .map((x) => ({
          id: typeof x?.id === "string" ? x.id : "",
          name: typeof x?.name === "string" ? x.name : "",
          sortOrder: typeof x?.sortOrder === "number" ? x.sortOrder : 0,
        }))
        .filter((x) => x.id.trim() !== "" && x.name.trim() !== "") as PartnerCategoryDef[])
    : [];

  const categories: PartnerCategoryDef[] = categoriesFromProfile.length > 0 ? categoriesFromProfile : DEFAULT_CATEGORIES;
  categories.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  const categoryMap = new Map<string, PartnerCategoryDef>();
  for (const c of categories) categoryMap.set(c.id, c);

  const normalized = partners.map((p) => {
    const legacy = p.category;
    const fromCategoryId = typeof p.categoryId === "string" ? p.categoryId.trim() : "";
    const categoryId = fromCategoryId || (legacy ? legacy : "uncategorized");
    return { ...p, categoryId };
  });

  const grouped = new Map<string, Partner[]>();
  for (const p of normalized) {
    const key = p.categoryId || "uncategorized";
    const arr = grouped.get(key) ?? [];
    arr.push(p);
    grouped.set(key, arr);
  }

  for (const [, list] of grouped) {
    list.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  }

  const sections: Array<{ id: string; title: string; partners: Partner[] }> = [];
  for (const c of categories) {
    const list = grouped.get(c.id) ?? [];
    if (list.length > 0) {
      sections.push({ id: c.id, title: c.name, partners: list });
    }
  }

  const uncategorized = grouped.get("uncategorized") ?? [];
  const unknown = Array.from(grouped.entries())
    .filter(([id]) => id !== "uncategorized" && !categoryMap.has(id))
    .flatMap(([, list]) => list);

  if (unknown.length > 0) {
    unknown.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    sections.push({ id: "unknown", title: "（未設定カテゴリ）", partners: unknown });
  }
  if (uncategorized.length > 0) {
    sections.push({ id: "uncategorized", title: "（未分類）", partners: uncategorized });
  }

  return (
    <main className="min-h-screen flex flex-col bg-black">
      <ClubHeader clubId={clubId} clubName={clubName} logoUrl={logoUrl} snsLinks={snsLinks} />
      <div className="flex-1">
        <div className="container mx-auto px-4 py-6 sm:py-10">
          <div className="p-0">
            <div className="flex items-end justify-between gap-3">
              <div
                className="w-screen text-center py-6 relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw]"
                style={{ backgroundColor: partnerTitleBg, color: partnerTitleText }}
              >
                <h1 className="text-2xl sm:text-3xl font-black">{partnersPageTitle}</h1>
                <div className="mt-2 h-1 w-24 mx-auto" style={{ backgroundColor: partnerTitleText }} />
              </div>
            </div>

            {sections.length > 0 ? (
              <div className="mt-8 space-y-10">
                {sections.map((sec, index) => (
                  <section key={sec.id}>
                    <div className="bg-[#06162F] text-white font-black px-4 py-3 w-screen relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw]">
                      {sec.title}
                    </div>
                    <div
                      className={`mt-6 grid ${
                        SECTION_GRID_CLASS_BY_COLS[(Math.min(index + 1, 3) as 1 | 2 | 3)]
                      } gap-4`}
                    >
                      {sec.partners.map((p) => (
                        <LogoCard key={p.id} partner={p} largeOnDesktop />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            ) : (
              <div className="mt-10 text-center text-sm text-muted-foreground">
                現在表示できるパートナーはありません。
              </div>
            )}
          </div>
        </div>
      </div>

      <ClubFooter
        clubId={clubId}
        clubName={clubName}
        sponsors={sponsors}
        snsLinks={snsLinks}
        legalPages={legalPages}
        gameTeamUsage={Boolean(gameTeamUsage)}
      />
    </main>
  );
}
