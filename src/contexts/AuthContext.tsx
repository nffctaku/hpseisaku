"use client";

import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { User, onAuthStateChanged, getRedirectResult, getAdditionalUserInfo } from 'firebase/auth';
import { auth, db, useSelfAuthDomainForRedirect } from '@/lib/firebase';
import { doc, getDoc, getDocFromServer, collection, query, where, getDocs, updateDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { saveUserAcquisition, trackEvent, getAcquisitionSnapshot } from '@/lib/analytics';
import { ADMIN_UID } from "@/lib/admin-config";

// Define a more detailed user profile type
export interface UserProfile extends User {
  clubId?: string;
  clubProfileId?: string;
  clubName?: string;
  logoUrl?: string;
  layoutType?: string;
  plan?: string;
  ownerUid?: string;
  clubUid: string;
  activeCareerId?: string;
  mainTeamId?: string;
  directoryListed?: boolean;
  displaySettings?: {
    playerProfileLatest?: boolean;
    resultsPageV2?: boolean;
    topPageV2?: boolean;
    newsPageV2?: boolean;
    tvPageV2?: boolean;
    clubPageV2?: boolean;
    transfersPageV2?: boolean;
    matchesPageV2?: boolean;
    tablePageV2?: boolean;
    statsPageV2?: boolean;
    squadPageV2?: boolean;
    partnerPageV2?: boolean;

    resultsPageVariant?: string;
    topPageVariant?: string;
    newsPageVariant?: string;
    tvPageVariant?: string;
    clubPageVariant?: string;
    transfersPageVariant?: string;
    matchesPageVariant?: string;
    tablePageVariant?: string;
    statsPageVariant?: string;
    squadPageVariant?: string;
    partnerPageVariant?: string;

    menuShowNews?: boolean;
    menuShowTv?: boolean;
    menuShowClub?: boolean;
    menuShowTransfers?: boolean;
    menuShowMatches?: boolean;
    menuShowTable?: boolean;
    menuShowStats?: boolean;
    menuShowSquad?: boolean;
    menuShowPartner?: boolean;
  };
}

interface AuthContextType {
  user: UserProfile | null;
  loading: boolean;
  clubProfileExists: boolean;
  ownerUid?: string;
  clubProfileId?: string;
  clubUid?: string;
  activeCareerId?: string;
  refreshUserProfile?: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({ 
  user: null, 
  loading: true,
  clubProfileExists: false,
  refreshUserProfile: async () => {},
});

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [clubProfileExists, setClubProfileExists] = useState(false);
  const [ownerUid, setOwnerUid] = useState<string | undefined>(undefined);
  const [clubProfileId, setClubProfileId] = useState<string | undefined>(undefined);
  const [clubUid, setClubUid] = useState<string | undefined>(undefined);
  const [activeCareerId, setActiveCareerId] = useState<string | undefined>(undefined);
  const lastProcessedUidRef = useRef<string | null>(null);
  const lastUserProfileRef = useRef<UserProfile | null>(null);
  const userRef = useRef<UserProfile | null>(null);
  const loadingRef = useRef<boolean>(true);
  const clubProfileExistsRef = useRef<boolean>(false);
  const ownerUidRef = useRef<string | undefined>(undefined);
  const clubProfileIdRef = useRef<string | undefined>(undefined);
  const clubUidRef = useRef<string | undefined>(undefined);
  const activeCareerIdRef = useRef<string | undefined>(undefined);

  const applyUserOverrides = (uid: string, profile: Partial<UserProfile>) => {
    const base = {
      ...profile,
      ownerUid: profile.ownerUid ?? uid,
      clubUid: profile.clubUid ?? uid,
    } as UserProfile;
    if (uid === ADMIN_UID) {
      return {
        ...base,
        ownerUid: ADMIN_UID,
        clubUid: base.clubUid ?? ADMIN_UID,
        mainTeamId: "RlHXQOanXvp5ZMjNztWk",
        plan: "pro",
      };
    }
    return base;
  };

  const fetchUserProfile = async (authUser: User) => {
    console.log('[AuthContext] fetchUserProfile start', { uid: authUser.uid });
    
    // Add timeout to prevent hanging
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Auth fetch timeout')), 10000);
    });

    // 1. Prefer document whose ID is the uid (newer schema / webhook update target)
    try {
      const profileDocRef = doc(db, 'club_profiles', authUser.uid);
      const profileDocSnap = await Promise.race([
        getDoc(profileDocRef),
        timeoutPromise
      ]) as any;

      if (profileDocSnap.exists()) {
        const profileData = profileDocSnap.data();
        const hasClubLink = Boolean(
          (profileData as any)?.clubId ||
            (profileData as any)?.ownerUid ||
            (profileData as any)?.clubName ||
            (profileData as any)?.mainTeamId ||
            (profileData as any)?.admins
        );

        // If this doc doesn't look like a club profile (e.g. admin user doc stub), fall through to other lookups.
        if (!hasClubLink) {
          console.warn('[AuthContext] club_profiles/{uid} exists but lacks club linkage; falling back', {
            uid: authUser.uid,
            keys: Object.keys(profileData || {}),
          });
        } else {
          const resolvedOwnerUid = (profileData as any)?.ownerUid || authUser.uid;
          const resolvedClubProfileId = profileDocSnap.id;
          const userProfile = applyUserOverrides(authUser.uid, {
            ...authUser,
            ...profileData,
            ownerUid: resolvedOwnerUid,
            clubProfileId: resolvedClubProfileId,
            clubUid: resolvedClubProfileId,
          }) as UserProfile;
          if (userRef.current !== userProfile) {
            userRef.current = userProfile;
            setUser(userProfile);
          }
          if (clubProfileExistsRef.current !== true) {
            clubProfileExistsRef.current = true;
            setClubProfileExists(true);
          }
          if (ownerUidRef.current !== resolvedOwnerUid) {
            ownerUidRef.current = resolvedOwnerUid;
            setOwnerUid(resolvedOwnerUid);
          }
          if (clubProfileIdRef.current !== resolvedClubProfileId) {
            clubProfileIdRef.current = resolvedClubProfileId;
            setClubProfileId(resolvedClubProfileId);
          }
          if (clubUidRef.current !== resolvedClubProfileId) {
            clubUidRef.current = resolvedClubProfileId;
            setClubUid(resolvedClubProfileId);
          }
          try {
            await updateDoc(profileDocRef, { lastLoginAt: serverTimestamp() } as any);
          } catch (e) {
            console.warn('[AuthContext] failed to update lastLoginAt (doc id)', e);
          }
          console.log('[AuthContext] profile found by doc id, user set', { uid: authUser.uid, profileData });
          return;
        }
      }
    } catch (error) {
      console.error('[AuthContext] Error in first profile fetch:', error);
      // Continue to fallback queries
    }

    // 2. Fallback: club_profiles document where ownerUid == uid (older schema)
    try {
      const q = query(collection(db, 'club_profiles'), where('ownerUid', '==', authUser.uid));
      const querySnapshot = await Promise.race([
        getDocs(q),
        timeoutPromise
      ]) as any;
      
      if (!querySnapshot.empty) {
        const docSnap = querySnapshot.docs[0];
        const profileData = docSnap.data();
        const nextClubProfileId = docSnap.id;
        const userProfile = applyUserOverrides(authUser.uid, { ...authUser, ...profileData, clubProfileId: nextClubProfileId, clubUid: nextClubProfileId }) as UserProfile;
        if (userRef.current !== userProfile) {
          userRef.current = userProfile;
          setUser(userProfile);
        }
        if (clubProfileExistsRef.current !== true) {
          clubProfileExistsRef.current = true;
          setClubProfileExists(true);
        }
        const nextOwnerUid = profileData.ownerUid || docSnap.id;
        if (ownerUidRef.current !== nextOwnerUid) {
          ownerUidRef.current = nextOwnerUid;
          setOwnerUid(nextOwnerUid);
        }
        if (clubProfileIdRef.current !== nextClubProfileId) {
          clubProfileIdRef.current = nextClubProfileId;
          setClubProfileId(nextClubProfileId);
        }
        if (clubUidRef.current !== nextClubProfileId) {
          clubUidRef.current = nextClubProfileId;
          setClubUid(nextClubProfileId);
        }
        try {
          await updateDoc(docSnap.ref, { lastLoginAt: serverTimestamp() } as any);
        } catch (e) {
          console.warn('[AuthContext] failed to update lastLoginAt (ownerUid query)', e);
        }
        console.log('[AuthContext] profile found by ownerUid, user set', { uid: authUser.uid, profileData });
        return;
      }
    } catch (error) {
      console.error('[AuthContext] Error in second profile fetch:', error);
      // Continue to fallback queries
    }

    // 2.5 Admin user: find club_profiles where this uid is listed as an admin
    try {
      const adminQ = query(collection(db, 'club_profiles'), where('admins', 'array-contains', authUser.uid));
      const adminSnap = await Promise.race([
        getDocs(adminQ),
        timeoutPromise
      ]) as any;
      
      if (!adminSnap.empty) {
        const adminDoc = adminSnap.docs[0];
        const profileData = adminDoc.data() as any;
        const foundOwnerUid = (profileData?.ownerUid as string) || adminDoc.id;
        const foundClubProfileId = adminDoc.id;
        const userProfile = applyUserOverrides(authUser.uid, { ...authUser, ...profileData, ownerUid: foundOwnerUid, clubProfileId: foundClubProfileId, clubUid: foundClubProfileId }) as UserProfile;
        if (userRef.current !== userProfile) {
          userRef.current = userProfile;
          setUser(userProfile);
        }
        if (clubProfileExistsRef.current !== true) {
          clubProfileExistsRef.current = true;
          setClubProfileExists(true);
        }
        if (ownerUidRef.current !== foundOwnerUid) {
          ownerUidRef.current = foundOwnerUid;
          setOwnerUid(foundOwnerUid);
        }
        if (clubProfileIdRef.current !== foundClubProfileId) {
          clubProfileIdRef.current = foundClubProfileId;
          setClubProfileId(foundClubProfileId);
        }
        if (clubUidRef.current !== foundClubProfileId) {
          clubUidRef.current = foundClubProfileId;
          setClubUid(foundClubProfileId);
        }
        try {
          await updateDoc(adminDoc.ref, { lastLoginAt: serverTimestamp() } as any);
        } catch (e) {
          console.warn('[AuthContext] failed to update lastLoginAt (admins query)', e);
        }
        console.log('[AuthContext] profile found by admins, user set', { uid: authUser.uid, foundOwnerUid, profileData });
        return;
      }
    } catch (error) {
      console.error('[AuthContext] Error in third profile fetch:', error);
      // Continue to fallback
    }

    // Fallback: use authUser only
    const userProfile = applyUserOverrides(authUser.uid, authUser as UserProfile) as UserProfile;
    if (userRef.current !== userProfile) {
      userRef.current = userProfile;
      setUser(userProfile);
    }
    if (clubProfileExistsRef.current !== false) {
      clubProfileExistsRef.current = false;
      setClubProfileExists(false);
    }
    if (ownerUidRef.current !== undefined) {
      ownerUidRef.current = undefined;
      setOwnerUid(undefined);
    }
    if (clubProfileIdRef.current !== undefined) {
      clubProfileIdRef.current = undefined;
      setClubProfileId(undefined);
    }
    if (clubUidRef.current !== undefined) {
      clubUidRef.current = undefined;
      setClubUid(undefined);
    }
    if (activeCareerIdRef.current !== undefined) {
      activeCareerIdRef.current = undefined;
      setActiveCareerId(undefined);
    }
    console.log('[AuthContext] no profile, using authUser only', { uid: authUser.uid });
  };

  useEffect(() => {
    console.log('[AuthContext] useEffect starting');
    let authUnsubscribe: (() => void) | null = null;
    
    // Global timeout to ensure loading state is always cleared
    const globalTimeout = setTimeout(() => {
      console.warn('[AuthContext] Global timeout reached, forcing loading to false');
      if (loadingRef.current) {
        loadingRef.current = false;
        setLoading(false);
      }
    }, 30000); // 30 second global timeout

    // Handle redirect result from Google sign-in.
    // NOTE: 現在のFirebase SDKでは復帰URLにauthパラメータは付かず、
    // 認証イベントはauthDomain側ストレージ経由で取得される。
    // URLパラメータで判定するとredirectログインが永遠にスキップされるため
    // getRedirectResultは常に呼ぶ（未ログイン時は即座にnullが返る）。
    const handleRedirectResult = async () => {
      try {
        // redirectログイン経由で戻った場合のみ authDomain を自ドメインに切替。
        // pendingイベントは sessionStorage の firebase:pendingRedirect* キーで検出する
        // （現行SDKでは復帰URLにauthパラメータは付かない）。
        // PCのpopupはweb.app直行の方が速いため、通常時は切替しない。
        const hasPendingRedirect = (() => {
          try {
            return Object.keys(window.sessionStorage).some((k) => k.startsWith('firebase:pendingRedirect'));
          } catch {
            return false;
          }
        })();
        if (hasPendingRedirect) {
          useSelfAuthDomainForRedirect();
        }
        console.log('[AuthContext] Checking redirect result', { hasPendingRedirect });
        const result = await getRedirectResult(auth);
        console.log('[AuthContext] Redirect result received', { hasUser: !!result?.user });
        const authDomain = (auth.app.options as any).authDomain;
        const currentDomain = typeof window !== 'undefined' ? window.location.hostname : '';
        console.log('[AuthContext] Redirect auth details', { authDomain, currentDomain, match: authDomain === currentDomain });
        if (result?.user) {
          console.log('[AuthContext] Redirect auth OK', result.user.uid);
          const info = getAdditionalUserInfo(result);
          if (info?.isNewUser) {
            const snap = getAcquisitionSnapshot();
            void saveUserAcquisition(result.user.uid);
            void trackEvent('signup_complete', result.user.uid, {
              firstSource: snap.firstSource,
              firstMedium: snap.firstMedium,
              firstCampaign: snap.firstCampaign,
              firstReferrer: snap.firstReferrer,
              sampleViewed: snap.sampleViewed,
              signupSource: snap.signupSource,
            });
          }
        } else {
          console.log('[AuthContext] No user in redirect result');
        }
      } catch (error: any) {
        console.error('[AuthContext] Error handling redirect result:', error);
      }
    };

    handleRedirectResult();

    try {
      authUnsubscribe = onAuthStateChanged(auth, async (authUser) => {
        console.log('[AuthContext] onAuthStateChanged triggered', { authUser, uid: authUser?.uid });
        if (authUser) {
          const isSameUid = lastProcessedUidRef.current === authUser.uid;
          console.log('[AuthContext] Checking same uid', { isSameUid, currentUid: lastProcessedUidRef.current, newUid: authUser.uid });
          if (isSameUid) {
            // 同じ uid の再通知： サインアウトされていたらキャッシュで復元
            if (userRef.current === null && lastUserProfileRef.current) {
              console.log('[AuthContext] same uid, restoring from cache', { uid: authUser.uid });
              userRef.current = lastUserProfileRef.current;
              setUser(lastUserProfileRef.current);
              if (clubProfileExistsRef.current !== true) {
                clubProfileExistsRef.current = true;
                setClubProfileExists(true);
              }
                  const restoredOwnerUid = lastUserProfileRef.current.ownerUid;
              if (ownerUidRef.current !== restoredOwnerUid) {
                ownerUidRef.current = restoredOwnerUid;
                setOwnerUid(restoredOwnerUid);
              }
              const restoredClubProfileId = lastUserProfileRef.current?.clubProfileId;
              if (restoredClubProfileId && clubProfileIdRef.current !== restoredClubProfileId) {
                clubProfileIdRef.current = restoredClubProfileId;
                setClubProfileId(restoredClubProfileId);
              }
              const restoredClubUid = lastUserProfileRef.current?.clubUid;
              if (restoredClubUid && clubUidRef.current !== restoredClubUid) {
                clubUidRef.current = restoredClubUid;
                setClubUid(restoredClubUid);
              }
              const restoredActiveCareerId = lastUserProfileRef.current?.activeCareerId;
              if (restoredActiveCareerId && activeCareerIdRef.current !== restoredActiveCareerId) {
                activeCareerIdRef.current = restoredActiveCareerId;
                setActiveCareerId(restoredActiveCareerId);
              }
              if (loadingRef.current) {
                loadingRef.current = false;
                setLoading(false);
              }
            } else {
              console.log('[AuthContext] same uid, already resolved', { uid: authUser.uid });
            }
            return;
          }
          lastProcessedUidRef.current = authUser.uid;
          if (!loadingRef.current) {
            loadingRef.current = true;
            setLoading(true);
          }
          console.log('[AuthContext] Starting fetchUserProfile');
          await fetchUserProfile(authUser);
          lastUserProfileRef.current = userRef.current;
          if (loadingRef.current) {
            loadingRef.current = false;
            setLoading(false);
          }
          console.log('[AuthContext] fetchUserProfile completed, loading set to false');
        } else {
          // すでに null ならスキップするが、loading は確実に解除
          if (userRef.current === null) {
            console.log('[AuthContext] no authUser, already signed out');
            if (loadingRef.current) {
              loadingRef.current = false;
              setLoading(false);
            }
            return;
          }
          console.log('[AuthContext] no authUser, signed out');
          userRef.current = null;
          setUser(null);
          if (clubProfileExistsRef.current) {
            clubProfileExistsRef.current = false;
            setClubProfileExists(false);
          }
          if (ownerUidRef.current !== undefined) {
            ownerUidRef.current = undefined;
            setOwnerUid(undefined);
          }
          if (loadingRef.current) {
            loadingRef.current = false;
            setLoading(false);
          }
        }
      });
    } catch (error) {
      console.error('[AuthContext] Error setting up auth listener:', error);
      if (loadingRef.current) {
        loadingRef.current = false;
        setLoading(false);
      }
    }

    return () => {
      console.log('[AuthContext] cleanup, clearing timeout');
      clearTimeout(globalTimeout);
      if (authUnsubscribe) {
        authUnsubscribe();
      }
    };
  }, []);

  // Keep clubUid / activeCareerId in sync with the active Career
  useEffect(() => {
    if (!user?.uid) return;
    const uid = user.uid;

    const resolveFromServer = async () => {
      try {
        const userSnap = await getDocFromServer(doc(db, 'users', uid));
        const data = userSnap.data() as Record<string, unknown> | undefined;
        const nextActiveCareerId = typeof data?.activeCareerId === 'string' ? data.activeCareerId : null;
        let nextClubUid = uid;
        if (nextActiveCareerId) {
          const careerSnap = await getDocFromServer(doc(db, 'careers', nextActiveCareerId));
          const careerData = careerSnap.data() as Record<string, unknown> | undefined;
          if (typeof careerData?.clubUid === 'string') {
            nextClubUid = careerData.clubUid;
          }
        }
        console.log('[AuthContext] users/career resolved from server', { uid, activeCareerId: nextActiveCareerId, nextClubUid });
        if (activeCareerIdRef.current !== nextActiveCareerId) {
          activeCareerIdRef.current = nextActiveCareerId ?? undefined;
          setActiveCareerId(nextActiveCareerId ?? undefined);
        }
        if (clubUidRef.current !== nextClubUid) {
          clubUidRef.current = nextClubUid;
          setClubUid(nextClubUid);
        }
        if (userRef.current && (userRef.current.activeCareerId !== (nextActiveCareerId ?? undefined) || userRef.current.clubUid !== nextClubUid)) {
          const updated = { ...userRef.current, activeCareerId: nextActiveCareerId ?? undefined, clubUid: nextClubUid };
          userRef.current = updated;
          setUser(updated);
        }
      } catch (e) {
        console.warn('[AuthContext] resolve users/career from server failed', e);
      }
    };

    void resolveFromServer();

    const unsub = onSnapshot(doc(db, 'users', uid), async (snap) => {
      if (snap.metadata.fromCache) return;
      const data = snap.data() as Record<string, unknown> | undefined;
      const nextActiveCareerId = typeof data?.activeCareerId === 'string' ? data.activeCareerId : null;
      let nextClubUid = uid;
      if (nextActiveCareerId) {
        const careerSnap = await getDocFromServer(doc(db, 'careers', nextActiveCareerId));
        const careerData = careerSnap.data() as Record<string, unknown> | undefined;
        if (typeof careerData?.clubUid === 'string') {
          nextClubUid = careerData.clubUid;
        }
      }
      console.log('[AuthContext] users snapshot (server)', { uid, activeCareerId: nextActiveCareerId, nextClubUid, hasUser: !!userRef.current });
      if (activeCareerIdRef.current !== nextActiveCareerId) {
        activeCareerIdRef.current = nextActiveCareerId ?? undefined;
        setActiveCareerId(nextActiveCareerId ?? undefined);
      }
      if (clubUidRef.current !== nextClubUid) {
        clubUidRef.current = nextClubUid;
        setClubUid(nextClubUid);
      }
      if (
        userRef.current &&
        (userRef.current.activeCareerId !== (nextActiveCareerId ?? undefined) ||
          userRef.current.clubUid !== nextClubUid)
      ) {
        const updated = { ...userRef.current, activeCareerId: nextActiveCareerId ?? undefined, clubUid: nextClubUid };
        userRef.current = updated;
        setUser(updated);
      }
    });
    return () => unsub();
  }, [user?.uid]);

  const refreshUserProfile = async () => {
    const currentUser = auth.currentUser;
    if (currentUser) {
      if (!loadingRef.current) {
        loadingRef.current = true;
        setLoading(true);
      }
      await fetchUserProfile(currentUser);
      if (loadingRef.current) {
        loadingRef.current = false;
        setLoading(false);
      }
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, clubProfileExists, ownerUid, clubProfileId, clubUid, activeCareerId, refreshUserProfile }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
