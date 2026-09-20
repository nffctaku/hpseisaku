import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase/admin";

export const runtime = "nodejs";
export const revalidate = 300;

type PartnerCategoryDef = {
  id: string;
  name: string;
  sortOrder: number;
};

type Partner = {
  id: string;
  name: string;
  categoryId?: string;
  category?: "top" | "official";
  logoUrl?: string;
  linkUrl?: string;
  sortOrder?: number;
};

const DEFAULT_CATEGORIES: PartnerCategoryDef[] = [
  { id: "top", name: "トップパートナー", sortOrder: 0 },
  { id: "official", name: "オフィシャルパートナー", sortOrder: 1 },
];

async function resolveClubProfile(clubId: string) {
  const profilesQuery = db.collection("club_profiles").where("clubId", "==", clubId).limit(1);
  const profilesSnap = await profilesQuery.get();

  const clubProfileDoc = !profilesSnap.empty ? profilesSnap.docs[0] : null;
  const directSnap = clubProfileDoc ? null : await db.collection("club_profiles").doc(clubId).get();
  const ownerSnap =
    clubProfileDoc || directSnap?.exists
      ? null
      : await db.collection("club_profiles").where("ownerUid", "==", clubId).limit(1).get();

  if (!clubProfileDoc && !directSnap?.exists && ownerSnap?.empty) return null;

  const fallbackDoc = ownerSnap && !ownerSnap.empty ? ownerSnap.docs[0] : null;
  const profileData = (
    clubProfileDoc
      ? clubProfileDoc.data()
      : directSnap?.exists
        ? (directSnap!.data() as any)
        : (fallbackDoc!.data() as any)
  ) as any;

  const ownerUid =
    (profileData as any)?.ownerUid ||
    (clubProfileDoc ? clubProfileDoc.id : directSnap?.exists ? directSnap!.id : fallbackDoc!.id);

  if (!ownerUid) return null;

  return { ownerUid: String(ownerUid), profile: profileData };
}

function normalizeCategories(raw: unknown): PartnerCategoryDef[] {
  const list: PartnerCategoryDef[] = Array.isArray(raw)
    ? (raw as any[])
        .map((x) => ({
          id: typeof x?.id === "string" ? x.id : "",
          name: typeof x?.name === "string" ? x.name : "",
          sortOrder: typeof x?.sortOrder === "number" ? x.sortOrder : 0,
        }))
        .filter((x) => x.id.trim() !== "" && x.name.trim() !== "")
    : [];

  const categories = list.length > 0 ? list : DEFAULT_CATEGORIES;
  categories.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  return categories;
}

async function getPublishedPartners(ownerUid: string): Promise<Partner[]> {
  const ref = db
    .collection(`clubs/${ownerUid}/partners`)
    .where("isPublished", "==", true);
  const snap = await ref.get();

  return snap.docs.map((d) => {
    const data = d.data() as any;
    return {
      id: d.id,
      name: String(data?.name || ""),
      categoryId: typeof data?.categoryId === "string" ? data.categoryId : undefined,
      category: (data?.category === "official" ? "official" : data?.category === "top" ? "top" : undefined) as
        | "top"
        | "official"
        | undefined,
      logoUrl: typeof data?.logoUrl === "string" ? data.logoUrl : "",
      linkUrl: typeof data?.linkUrl === "string" ? data.linkUrl : "",
      sortOrder: typeof data?.sortOrder === "number" ? data.sortOrder : 0,
    } as Partner;
  });
}

export async function GET(_request: NextRequest, context: { params: Promise<{ clubId: string }> }) {
  try {
    const { clubId } = await context.params;
    if (!clubId) {
      return NextResponse.json({ partners: [] }, { status: 400 });
    }

    const resolved = await resolveClubProfile(clubId);
    if (!resolved) {
      return NextResponse.json({ partners: [] }, { status: 404 });
    }

    const { ownerUid, profile } = resolved;

    const categories = normalizeCategories((profile as any)?.partnersCategories);
    const topCategoryIds = categories
      .slice(0, 2)
      .map((c) => c.id)
      .filter((id) => id && id.trim() !== "");

    if (topCategoryIds.length === 0) {
      return NextResponse.json({ partners: [] }, { status: 200 });
    }

    const categoryOrder = new Map<string, number>();
    for (const c of categories) categoryOrder.set(c.id, c.sortOrder ?? 9999);

    const published = await getPublishedPartners(ownerUid);

    const filtered = published
      .map((p) => {
        const legacy = p.category;
        const fromCategoryId = typeof p.categoryId === "string" ? p.categoryId.trim() : "";
        const normalizedCategoryId = fromCategoryId || (legacy ? legacy : "");
        return { ...p, categoryId: normalizedCategoryId };
      })
      .filter((p) => typeof p.categoryId === "string" && topCategoryIds.includes(String(p.categoryId)))
      .sort((a, b) => {
        const ca = categoryOrder.get(String(a.categoryId)) ?? 9999;
        const cb = categoryOrder.get(String(b.categoryId)) ?? 9999;
        if (ca !== cb) return ca - cb;
        return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
      });

    return NextResponse.json(
      {
        partners: filtered.map((p) => ({
          id: p.id,
          name: p.name,
          logoUrl: p.logoUrl || "",
          linkUrl: p.linkUrl || "",
          categoryId: p.categoryId || "",
        })),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("[partners-strip] API error", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
