import Image from "next/image";
import Link from "next/link";

import { db } from "@/lib/firebase/admin";

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
  isPublished?: boolean;
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

async function getPublishedPartners(ownerUid: string): Promise<Partner[]> {
  const ref = db.collection(`clubs/${ownerUid}/partners`).where("isPublished", "==", true);
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
      isPublished: typeof data?.isPublished === "boolean" ? data.isPublished : false,
    } as Partner;
  });
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

export async function PartnerStrip(props: { clubId: string; maxCategories?: number; maxPartners?: number }) {
  const { clubId, maxCategories = 2, maxPartners = 12 } = props;

  const resolved = await resolveClubProfile(clubId);
  if (!resolved) return null;

  const { ownerUid, profile } = resolved;

  const categories = normalizeCategories((profile as any)?.partnersCategories);
  const topCategoryIds = categories
    .slice(0, Math.max(0, maxCategories))
    .map((c) => c.id)
    .filter((id) => id.trim() !== "");

  if (topCategoryIds.length === 0) return null;

  const published = await getPublishedPartners(ownerUid);
  if (!published || published.length === 0) return null;

  const categoryOrder = new Map<string, number>();
  for (const c of categories) categoryOrder.set(c.id, c.sortOrder ?? 9999);

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
    })
    .slice(0, Math.max(0, maxPartners));

  if (filtered.length === 0) return null;

  return (
    <div className="w-full bg-black">
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between gap-3">
          <div className="text-white font-black tracking-wide">PARTNER</div>
          <Link href={`/${encodeURIComponent(clubId)}/partner`} className="text-xs text-white/80 hover:text-white">
            一覧
          </Link>
        </div>

        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
          {filtered.map((p) => {
            const card = (
              <div className="rounded-md bg-white p-2 h-16 flex items-center justify-center">
                {p.logoUrl ? (
                  <div className="relative w-full h-full">
                    <Image src={p.logoUrl} alt={p.name} fill className="object-contain" />
                  </div>
                ) : (
                  <div className="text-[11px] font-semibold text-gray-900 text-center line-clamp-2">{p.name}</div>
                )}
              </div>
            );

            if (p.linkUrl) {
              return (
                <Link
                  key={p.id}
                  href={p.linkUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block"
                >
                  {card}
                </Link>
              );
            }

            return <div key={p.id}>{card}</div>;
          })}
        </div>
      </div>
    </div>
  );
}
