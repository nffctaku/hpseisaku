import { db } from "@/lib/firebase/admin";

export type PublicDisplaySettings = {
  menuShowNews: boolean;
  menuShowTv: boolean;
  menuShowClub: boolean;
  menuShowTransfers: boolean;
  menuShowMatches: boolean;
  menuShowTable: boolean;
  menuShowStats: boolean;
  menuShowSquad: boolean;
  menuShowPartner: boolean;
};

export type ResolvedPublicClubProfile = {
  ownerUid: string;
  clubId: string;
  profileDocId: string;
  profileData: any;
  displaySettings: PublicDisplaySettings;
};

export async function resolvePublicClubProfile(clubId: string): Promise<ResolvedPublicClubProfile | null> {
  const id = typeof clubId === "string" ? clubId.trim() : "";
  if (!id) return null;

  const resolveSnap = async () => {
    const directSnap = await db.collection("club_profiles").doc(id).get();
    if (directSnap.exists) return directSnap;

    const profilesQuery = db.collection("club_profiles").where("clubId", "==", id).limit(1);
    const profileSnap = await profilesQuery.get();
    if (!profileSnap.empty) return profileSnap.docs[0];

    const ownerSnap = await db.collection("club_profiles").where("ownerUid", "==", id).limit(1).get();
    if (!ownerSnap.empty) return ownerSnap.docs[0];

    return null;
  };

  try {
    const snap = await resolveSnap();
    if (!snap || !snap.exists) return null;

    const profileData = snap.data() as any;
    const ownerUid = (profileData?.ownerUid as string) || snap.id;
    if (!ownerUid) return null;

    const s = (profileData?.displaySettings || {}) as any;
    const displaySettings: PublicDisplaySettings = {
      menuShowNews: s.menuShowNews !== false,
      menuShowTv: s.menuShowTv !== false,
      menuShowClub: s.menuShowClub !== false,
      menuShowTransfers: s.menuShowTransfers !== false,
      menuShowMatches: s.menuShowMatches !== false,
      menuShowTable: s.menuShowTable !== false,
      menuShowStats: s.menuShowStats !== false,
      menuShowSquad: s.menuShowSquad !== false,
      menuShowPartner: s.menuShowPartner !== false,
    };

    return {
      ownerUid,
      clubId: id,
      profileDocId: snap.id,
      profileData,
      displaySettings,
    };
  } catch {
    return null;
  }
}
