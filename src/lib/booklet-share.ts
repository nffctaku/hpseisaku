import { db } from "@/lib/firebase/admin";

export type BookletShareDoc = {
  publicId: string;
  ownerUid: string;
  careerId: string;
  clubUid: string;
  teamId: string;
  season: string;
  isPublished: boolean;
  showFormation: boolean;
  showIntroduction: boolean;
  cardPlayerIds: string[];
  additionalPlayerIds: string[];
  showParameterGraph: boolean;
  positionColors: { GK: string; DF: string; MF: string; FW: string } | null;
  formationName: string | null;
  starters: Record<string, string | null>;
  bioTitle: string;
  bioBody: string;
  createdAt: FirebaseFirestore.Timestamp | null;
  updatedAt: FirebaseFirestore.Timestamp | null;
};

const COLLECTION = "booklet_shares";

function toStringArray(v: unknown, max = 60): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string" && x.trim().length > 0).slice(0, max);
}

export function normalizeShareDoc(id: string, data: FirebaseFirestore.DocumentData | undefined): BookletShareDoc {
  const d = data || {};
  const pc = d.positionColors;
  return {
    publicId: id,
    ownerUid: typeof d.ownerUid === "string" ? d.ownerUid : "",
    careerId: typeof d.careerId === "string" ? d.careerId : "",
    clubUid: typeof d.clubUid === "string" ? d.clubUid : "",
    teamId: typeof d.teamId === "string" ? d.teamId : "",
    season: typeof d.season === "string" ? d.season : "",
    isPublished: d.isPublished === true,
    showFormation: d.showFormation === true,
    showIntroduction: d.showIntroduction === true,
    cardPlayerIds: toStringArray(d.cardPlayerIds),
    additionalPlayerIds: toStringArray(d.additionalPlayerIds),
    showParameterGraph: d.showParameterGraph !== false,
    positionColors:
      pc && typeof pc === "object"
        ? {
            GK: typeof pc.GK === "string" ? pc.GK : "bg-rose-300",
            DF: typeof pc.DF === "string" ? pc.DF : "bg-blue-300",
            MF: typeof pc.MF === "string" ? pc.MF : "bg-green-300",
            FW: typeof pc.FW === "string" ? pc.FW : "bg-orange-300",
          }
        : null,
    formationName: typeof d.formationName === "string" && d.formationName.trim() ? d.formationName.trim() : null,
    starters:
      d.starters && typeof d.starters === "object"
        ? Object.fromEntries(
            Object.entries(d.starters as Record<string, unknown>)
              .filter(([, v]) => v === null || typeof v === "string")
              .slice(0, 24)
              .map(([k, v]) => [k, v === null ? null : String(v)])
          )
        : {},
    bioTitle: typeof d.bioTitle === "string" ? d.bioTitle : "",
    bioBody: typeof d.bioBody === "string" ? d.bioBody : "",
    createdAt: (d.createdAt as FirebaseFirestore.Timestamp) || null,
    updatedAt: (d.updatedAt as FirebaseFirestore.Timestamp) || null,
  };
}

export async function getBookletShare(publicId: string): Promise<BookletShareDoc | null> {
  const id = String(publicId || "").trim();
  if (!/^[A-Za-z0-9_-]{8,40}$/.test(id)) return null;
  const snap = await db.collection(COLLECTION).doc(id).get();
  if (!snap.exists) return null;
  return normalizeShareDoc(snap.id, snap.data());
}

export async function findBookletShare(opts: {
  ownerUid: string;
  careerId: string;
  teamId: string;
  season: string;
}): Promise<BookletShareDoc | null> {
  const snap = await db
    .collection(COLLECTION)
    .where("ownerUid", "==", opts.ownerUid)
    .where("careerId", "==", opts.careerId)
    .where("teamId", "==", opts.teamId)
    .where("season", "==", opts.season)
    .limit(1)
    .get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return normalizeShareDoc(doc.id, doc.data());
}

export function bookletShareCollection() {
  return db.collection(COLLECTION);
}
