import { db } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";

export interface ServerCareer {
  id: string;
  ownerId: string;
  clubUid: string;
  name: string;
  gameTitle: string;
  clubName: string;
  clubLogo?: string | null;
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
}

function toServerCareer(id: string, data: FirebaseFirestore.DocumentData | undefined): ServerCareer {
  return {
    id,
    ownerId: typeof data?.ownerId === "string" ? data.ownerId : "",
    clubUid: typeof data?.clubUid === "string" ? data.clubUid : id,
    name: typeof data?.name === "string" ? data.name : typeof data?.clubName === "string" ? data.clubName : id,
    gameTitle: typeof data?.gameTitle === "string" ? data.gameTitle : "FC26",
    clubName: typeof data?.clubName === "string" ? data.clubName : "",
    clubLogo: typeof data?.clubLogo === "string" ? data.clubLogo : null,
    isPublic: data?.isPublic === true,
    createdAt: data?.createdAt?.toDate?.() || new Date(),
    updatedAt: data?.updatedAt?.toDate?.() || new Date(),
  };
}

export async function getActiveCareerId(ownerId: string): Promise<string | null> {
  const userDoc = await db.collection("users").doc(ownerId).get();
  if (!userDoc.exists) return null;
  const active = userDoc.data()?.activeCareerId;
  return typeof active === "string" ? active : null;
}

export async function getCareer(careerId: string): Promise<ServerCareer | null> {
  const snap = await db.collection("careers").doc(careerId).get();
  if (!snap.exists) return null;
  return toServerCareer(snap.id, snap.data());
}

export async function getActiveCareer(ownerId: string): Promise<ServerCareer | null> {
  const activeId = await getActiveCareerId(ownerId);
  if (!activeId) return null;
  return getCareer(activeId);
}

export async function getActiveClubUid(ownerId: string): Promise<string> {
  const active = await getActiveCareer(ownerId);
  return active?.clubUid || ownerId;
}

export async function ensureDefaultCareerForUid(ownerId: string): Promise<ServerCareer> {
  const careersSnap = await db.collection("careers").where("ownerId", "==", ownerId).limit(1).get();
  if (!careersSnap.empty) {
    const first = careersSnap.docs[0];
    return toServerCareer(first.id, first.data());
  }

  // No career yet: create one with a unique careerId but keep clubUid = ownerId
  // so existing data under clubs/{ownerId} and club_profiles/{ownerId} remains valid.
  const careerRef = db.collection("careers").doc();
  const careerId = careerRef.id;
  const clubUid = ownerId;

  const [profileSnap, clubSnap] = await Promise.all([
    db.collection("club_profiles").doc(ownerId).get(),
    db.collection("clubs").doc(ownerId).get(),
  ]);

  const profileData = profileSnap.exists ? profileSnap.data() || {} : {};
  const clubData = clubSnap.exists ? clubSnap.data() || {} : {};
  const gameTitle = typeof (profileData.gameTitle ?? clubData.gameTitle) === "string"
    ? (profileData.gameTitle ?? clubData.gameTitle)
    : "FC26";
  const clubName =
    typeof profileData.clubName === "string"
      ? profileData.clubName
      : typeof clubData.clubName === "string"
      ? clubData.clubName
      : "";

  const now = FieldValue.serverTimestamp();
  await careerRef.set({
    ownerId,
    clubUid,
    name: clubName,
    gameTitle,
    clubName,
    clubLogo: typeof profileData.logoUrl === "string" ? profileData.logoUrl : null,
    startSeason: null,
    latestSeason: null,
    seasonCount: 0,
    isPublic: profileData.directoryListed === true || clubData.directoryListed === true,
    createdAt: now,
    updatedAt: now,
  });

  await db.collection("users").doc(ownerId).set({ activeCareerId: careerId, updatedAt: now }, { merge: true });

  const created = await careerRef.get();
  return toServerCareer(careerRef.id, created.data());
}
