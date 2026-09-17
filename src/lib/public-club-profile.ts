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
  ownerUid: string; // data path = clubUid for backwards compat
  clubUid: string;
  userUid?: string;
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

    const rawProfileData = snap.data() as Record<string, unknown>;
    const userUid = typeof rawProfileData?.ownerUid === 'string' ? rawProfileData.ownerUid : undefined;
    // Canonical data root: the stored clubUid field (alias docs point here). Fallback to doc id.
    const clubUid = typeof rawProfileData?.clubUid === 'string' ? rawProfileData.clubUid : snap.id;
    if (!clubUid) return null;

    // Alias docs (clubId/slug) may only contain a pointer; load the canonical profile for full data.
    let profileData = rawProfileData;
    if (snap.id !== clubUid) {
      const canonicalSnap = await db.collection("club_profiles").doc(clubUid).get();
      if (canonicalSnap.exists) {
        profileData = canonicalSnap.data() as Record<string, unknown>;
      }
    }

    // 削除済みの Career は非公開にする
    const careerSnaps = await db.collection("careers").where("clubUid", "==", clubUid).limit(10).get();
    const activeCareer = careerSnaps.docs.find((c) => (c.data() as Record<string, unknown>).status !== "deleted");
    if (careerSnaps.docs.length > 0 && !activeCareer) {
      return null;
    }

    // メインチームデータを取得してチーム名とロゴを最新に
    const mainTeamId = typeof profileData?.mainTeamId === 'string' ? profileData.mainTeamId : undefined;
    let resolvedProfileData: Record<string, unknown> = { ...profileData };
    if (mainTeamId) {
      try {
        const mainTeamSnap = await db.collection(`clubs/${clubUid}/teams`).doc(mainTeamId).get();
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

    // 公開プロフィールのデータルートを統一：ownerUid は clubUid と同じデータパスを指す。
    // これによりクライアント側が Firebase ユーザ uid（元Careerと共有する可能性）を誤参照するのを防ぐ。
    resolvedProfileData.clubUid = clubUid;
    resolvedProfileData.ownerUid = clubUid;

    // club_profiles に homeBgColor 等が無い場合、clubs/{clubUid} から補完
    try {
      const clubDataSnap = await db.collection('clubs').doc(clubUid).get();
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
      ownerUid: clubUid,
      clubUid,
      userUid,
      clubId: id,
      profileDocId: snap.id,
      profileData: resolvedProfileData,
      displaySettings,
    };
  } catch {
    return null;
  }
}
