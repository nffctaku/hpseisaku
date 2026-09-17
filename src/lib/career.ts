import { db, auth } from "@/lib/firebase";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  limit,
  setDoc,
  deleteDoc,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";

export { MAX_CAREERS } from "./career-constants";

export type GameTitle = "FC26" | "FC27" | "FC28" | "FC29" | string;

export interface Career {
  id: string;
  ownerId: string;
  clubUid: string;
  name: string;
  gameTitle: GameTitle;
  clubName: string;
  clubId?: string | null;
  clubLogo?: string | null;
  startSeason?: string | null;
  latestSeason?: string | null;
  seasonCount: number;
  isPublic: boolean;
  status?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface CareerInput {
  name: string;
  gameTitle?: GameTitle;
  clubName: string;
  clubLogo?: string | null;
  isPublic?: boolean;
  startSeason?: string | null;
  status?: "creating" | "active" | string;
}

export interface CareerUpdateInput {
  name?: string;
  clubName?: string;
  clubLogo?: string | null;
  startSeason?: string | null;
  latestSeason?: string | null;
  seasonCount?: number;
  isPublic?: boolean;
}

function gameTitleFromUnknown(v: unknown): GameTitle {
  if (typeof v === "string" && v.trim()) return v.trim();
  return "FC26";
}

function seasonFromDoc(d: unknown): string | null {
  if (typeof d === "string" && d.trim()) return d.trim();
  if (typeof d === "object" && d !== null && "id" in d) {
    const id = (d as { id?: unknown }).id;
    if (typeof id === "string" && id.trim()) return id.trim();
  }
  return null;
}

function timestampFromUnknown(v: unknown): Timestamp | undefined {
  if (v instanceof Timestamp) return v;
  if (v instanceof Date) return Timestamp.fromDate(v);
  if (typeof v === "string") {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return Timestamp.fromDate(d);
  }
  if (typeof v === "number" && !Number.isNaN(v)) return Timestamp.fromMillis(v);
  return undefined;
}

export function toCareer(id: string, data: Record<string, unknown>): Career {
  return {
    id,
    ownerId: typeof data.ownerId === "string" ? data.ownerId : "",
    clubUid: typeof data.clubUid === "string" ? data.clubUid : id,
    name: typeof data.name === "string" ? data.name : typeof data.clubName === "string" ? data.clubName : id,
    gameTitle: gameTitleFromUnknown(data.gameTitle),
    clubName: typeof data.clubName === "string" ? data.clubName : "",
    clubId: typeof data.clubId === "string" ? data.clubId : null,
    clubLogo: typeof data.clubLogo === "string" ? data.clubLogo : null,
    startSeason: typeof data.startSeason === "string" ? data.startSeason : null,
    latestSeason: typeof data.latestSeason === "string" ? data.latestSeason : null,
    seasonCount: typeof data.seasonCount === "number" ? data.seasonCount : 0,
    isPublic: data.isPublic === true,
    status: typeof data.status === "string" ? data.status : undefined,
    createdAt: timestampFromUnknown(data.createdAt),
    updatedAt: timestampFromUnknown(data.updatedAt),
  };
}

export interface CareerContextData {
  careers: Career[];
  activeCareerId: string | null;
}

export async function getCareerContextData(): Promise<CareerContextData> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error("認証されていません");
  const res = await fetch("/api/careers", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = (await res.json()) as { ok?: boolean; careers?: Record<string, unknown>[]; activeCareerId?: string | null; message?: string };
  if (!res.ok || !json.ok) {
    throw new Error(json.message || "Career一覧の取得に失敗しました");
  }
  const careers = (json.careers ?? []).map((c) => toCareer(typeof c.id === "string" ? c.id : "", c));
  return { careers, activeCareerId: typeof json.activeCareerId === "string" ? json.activeCareerId : null };
}

export async function getCareersByOwner(): Promise<Career[]> {
  const { careers } = await getCareerContextData();
  return careers;
}

export async function getCareer(careerId: string): Promise<Career | null> {
  const snap = await getDoc(doc(db, "careers", careerId));
  if (!snap.exists()) return null;
  return toCareer(snap.id, snap.data() as Record<string, unknown>);
}

export async function getActiveCareerId(ownerId: string): Promise<string | null> {
  const snap = await getDoc(doc(db, "users", ownerId));
  if (!snap.exists()) return null;
  const data = snap.data() as Record<string, unknown>;
  const active = data?.activeCareerId;
  return typeof active === "string" ? active : null;
}

export async function setActiveCareerId(ownerId: string, careerId: string): Promise<void> {
  await setDoc(
    doc(db, "users", ownerId),
    { activeCareerId: careerId, updatedAt: serverTimestamp() },
    { merge: true }
  );
}

export async function updateCareer(careerId: string, input: CareerUpdateInput): Promise<void> {
  await setDoc(
    doc(db, "careers", careerId),
    { ...input, updatedAt: serverTimestamp() },
    { merge: true }
  );
}

export async function createCareer(ownerId: string, input: CareerInput): Promise<Career> {
  const careerRef = doc(collection(db, "careers"));
  const careerId = careerRef.id;
  // clubUid is the actual data namespace for this career's club.
  // For a new career it is a fresh id, completely isolated from other careers.
  const clubProfileRef = doc(collection(db, "club_profiles"));
  const clubUid = clubProfileRef.id;

  const now = serverTimestamp();
  const career: Omit<Career, "id" | "createdAt" | "updatedAt"> & {
    createdAt: ReturnType<typeof serverTimestamp>;
    updatedAt: ReturnType<typeof serverTimestamp>;
  } = {
    ownerId,
    clubUid,
    name: input.name,
    gameTitle: input.gameTitle ?? "FC26",
    clubName: input.clubName,
    clubLogo: input.clubLogo ?? null,
    startSeason: input.startSeason ?? null,
    latestSeason: input.startSeason ?? null,
    seasonCount: input.startSeason ? 1 : 0,
    isPublic: input.isPublic ?? false,
    status: input.status ?? "active",
    createdAt: now,
    updatedAt: now,
  };

  await setDoc(careerRef, career);

  // Create a minimal club_profile for the new career so ClubContext can resolve it
  await setDoc(
    clubProfileRef,
    {
      ownerUid: ownerId,
      clubName: input.clubName,
      logoUrl: input.clubLogo ?? null,
      gameTitle: input.gameTitle,
      plan: "free",
      transfersPublic: false,
      publicPlayerParamsEnabled: false,
      realTeamUsage: false,
      gameTeamUsage: true,
      createdAt: now,
      updatedAt: now,
    },
    { merge: true }
  );

  // Switch to the new career only if not in creating state
  if ((input.status ?? "active") !== "creating") {
    await setActiveCareerId(ownerId, careerId);
  }

  const createdSnap = await getDoc(careerRef);
  return toCareer(careerId, createdSnap.data() as Record<string, unknown>);
}

async function migrateLegacyCareerDoc(ownerId: string): Promise<Career | null> {
  const legacyRef = doc(db, "careers", ownerId);
  const legacySnap = await getDoc(legacyRef);
  if (!legacySnap.exists()) return null;
  const legacyData = legacySnap.data() as Record<string, unknown>;
  if (legacyData.ownerId !== ownerId) return null;

  // Create a new career doc with a unique careerId while keeping clubUid = ownerId
  // so existing data under clubs/{ownerId} and club_profiles/{ownerId} remains valid.
  const newCareerRef = doc(collection(db, "careers"));
  const newCareerId = newCareerRef.id;
  const clubUid = ownerId;
  const migrated: Omit<Career, "id" | "createdAt" | "updatedAt"> & {
    createdAt: ReturnType<typeof serverTimestamp>;
    updatedAt: ReturnType<typeof serverTimestamp>;
  } = {
    ownerId,
    clubUid,
    name: typeof legacyData.name === "string" ? legacyData.name : typeof legacyData.clubName === "string" ? legacyData.clubName : newCareerId,
    gameTitle: gameTitleFromUnknown(legacyData.gameTitle),
    clubName: typeof legacyData.clubName === "string" ? legacyData.clubName : "",
    clubLogo: typeof legacyData.clubLogo === "string" ? legacyData.clubLogo : null,
    startSeason: typeof legacyData.startSeason === "string" ? legacyData.startSeason : null,
    latestSeason: typeof legacyData.latestSeason === "string" ? legacyData.latestSeason : null,
    seasonCount: typeof legacyData.seasonCount === "number" ? legacyData.seasonCount : 0,
    isPublic: legacyData.isPublic === true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  await setDoc(newCareerRef, migrated);
  await setActiveCareerId(ownerId, newCareerId);
  await deleteDoc(legacyRef);

  const createdSnap = await getDoc(newCareerRef);
  return toCareer(newCareerId, createdSnap.data() as Record<string, unknown>);
}

export async function ensureDefaultCareer(ownerId: string): Promise<Career> {
  // 1. If a legacy careers/{ownerId} doc exists from Phase 1, migrate it to a unique careerId.
  const migrated = await migrateLegacyCareerDoc(ownerId);
  if (migrated) return migrated;

  const existing = await getCareersByOwner();
  if (existing.length > 0) {
    // If activeCareerId is not set or invalid, fall back to the first career
    const userSnap = await getDoc(doc(db, "users", ownerId));
    const activeId = (userSnap.data() as Record<string, unknown> | undefined)?.activeCareerId;
    const resolved = existing.find((c) => c.id === activeId) || existing[0];
    if (typeof activeId !== "string" || !existing.some((c) => c.id === activeId)) {
      await setActiveCareerId(ownerId, resolved.id);
    }
    return resolved;
  }

  // No career yet: build one from existing data.
  // clubUid stays as the existing uid, so all current data paths remain valid.
  // careerId is a newly generated id, not the uid, for future multi-career flexibility.
  const [profileByUidSnap, profileByOwnerSnap, clubSnap, seasonSnap] = await Promise.all([
    getDoc(doc(db, "club_profiles", ownerId)),
    getDocs(query(collection(db, "club_profiles"), where("ownerUid", "==", ownerId), limit(1))),
    getDoc(doc(db, "clubs", ownerId)),
    getDocs(collection(db, `clubs/${ownerId}/seasons`)),
  ]);

  const profileData = profileByUidSnap.exists()
    ? (profileByUidSnap.data() as Record<string, unknown>)
    : !profileByOwnerSnap.empty
    ? (profileByOwnerSnap.docs[0].data() as Record<string, unknown>)
    : {};

  const clubData = clubSnap.exists() ? (clubSnap.data() as Record<string, unknown>) : {};

  const seasons = seasonSnap.docs
    .map((d) => (d.id ? d.id : seasonFromDoc(d.data() as Record<string, unknown>)))
    .filter((s): s is string => !!s);

  const newCareerRef = doc(collection(db, "careers"));
  const careerId = newCareerRef.id;
  const clubUid = ownerId;
  const gameTitle = gameTitleFromUnknown(profileData.gameTitle ?? clubData.gameTitle);
  const clubName =
    typeof profileData.clubName === "string"
      ? profileData.clubName
      : typeof clubData.clubName === "string"
      ? clubData.clubName
      : "";
  const clubLogo =
    typeof profileData.logoUrl === "string"
      ? profileData.logoUrl
      : typeof clubData.logoUrl === "string"
      ? clubData.logoUrl
      : null;

  const career: Omit<Career, "id" | "createdAt" | "updatedAt"> & {
    createdAt: ReturnType<typeof serverTimestamp>;
    updatedAt: ReturnType<typeof serverTimestamp>;
  } = {
    ownerId,
    clubUid,
    name: clubName,
    gameTitle,
    clubName,
    clubLogo,
    startSeason: seasons[0] ?? null,
    latestSeason: seasons[seasons.length - 1] ?? null,
    seasonCount: seasons.length,
    isPublic: profileData.directoryListed === true || clubData.directoryListed === true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  await setDoc(newCareerRef, career);
  await setActiveCareerId(ownerId, careerId);

  const createdSnap = await getDoc(newCareerRef);
  return toCareer(careerId, createdSnap.data() as Record<string, unknown>);
}
