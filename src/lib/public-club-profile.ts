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
  profileData: Record<string, unknown>;
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

    const profileData = snap.data() as Record<string, unknown>;
    const ownerUid = typeof profileData?.ownerUid === 'string' ? profileData.ownerUid : snap.id;
    if (!ownerUid) return null;

    // メインチームデータを取得してチーム名とロゴを最新に
    const mainTeamId = typeof profileData?.mainTeamId === 'string' ? profileData.mainTeamId : undefined;
    let resolvedProfileData: Record<string, unknown> = { ...profileData };
    if (mainTeamId) {
      try {
        const mainTeamSnap = await db.collection(`clubs/${ownerUid}/teams`).doc(mainTeamId).get();
        if (mainTeamSnap.exists) {
          const mainTeamData = mainTeamSnap.data() as Record<string, unknown> | undefined;
          resolvedProfileData = {
            ...resolvedProfileData,
            clubName: mainTeamData?.name || profileData.clubName,
            logoUrl: mainTeamData?.logoUrl || profileData.logoUrl,
          };
        }
      } catch {
        // チームデータ取得失敗時は元のデータを使用
      }
    }

    // club_profiles に homeBgColor 等が無い場合、clubs/{ownerUid} から補完
    try {
      const clubDataSnap = await db.collection('clubs').doc(ownerUid).get();
      if (clubDataSnap.exists) {
        const clubData = clubDataSnap.data() as Record<string, unknown>;
        if (!resolvedProfileData.homeBgColor && typeof clubData?.homeBgColor === 'string') {
          resolvedProfileData.homeBgColor = clubData.homeBgColor;
        }
        if (!resolvedProfileData.homeColorTheme && (clubData?.homeColorTheme === 'dark' || clubData?.homeColorTheme === 'light')) {
          resolvedProfileData.homeColorTheme = clubData.homeColorTheme;
        }
      }
    } catch {
      // clubs ドキュメント取得失敗時は無視
    }

    // 統一して clubColor としても参照可能に
    if (typeof resolvedProfileData.homeBgColor === 'string') {
      resolvedProfileData.clubColor = resolvedProfileData.homeBgColor;
    }

    const displaySettingsRaw = resolvedProfileData.displaySettings as Record<string, unknown> | undefined;
    const s = displaySettingsRaw || {};
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
      profileData: resolvedProfileData,
      displaySettings,
    };
  } catch {
    return null;
  }
}
