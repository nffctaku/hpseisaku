"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, onAuthStateChanged, setPersistence, browserLocalPersistence, getRedirectResult } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { doc, getDoc, collection, query, where, getDocs, updateDoc, serverTimestamp } from 'firebase/firestore';
import { useRouter, usePathname } from 'next/navigation';

// Define a more detailed user profile type
export interface UserProfile extends User {
  clubId?: string;
  clubName?: string;
  logoUrl?: string;
  layoutType?: string;
  plan?: string;
  ownerUid?: string;
  mainTeamId?: string;
  directoryListed?: boolean;
  displaySettings?: {
    playerProfileLatest?: boolean;
  };
}

interface AuthContextType {
  user: UserProfile | null;
  loading: boolean;
  clubProfileExists: boolean;
  ownerUid?: string;
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
  const router = useRouter();
  const pathname = usePathname();

  const applyUserOverrides = (uid: string, profile: Partial<UserProfile>) => {
    if (uid === "m7OPZIn0vyX9yKaFWFjqoanB4Bh1") {
      return {
        ...profile,
        ownerUid: "m7OPZIn0vyX9yKaFWFjqoanB4Bh1",
        mainTeamId: "RlHXQOanXvp5ZMjNztWk",
        plan: "pro",
      };
    }
    return profile;
  };

  const fetchUserProfile = async (authUser: User) => {
    console.log('[AuthContext] fetchUserProfile start', { uid: authUser.uid });
    // 1. Prefer document whose ID is the uid (newer schema / webhook update target)
    const profileDocRef = doc(db, 'club_profiles', authUser.uid);
    const profileDocSnap = await getDoc(profileDocRef);

    if (profileDocSnap.exists()) {
      const profileData = profileDocSnap.data();
      setUser(applyUserOverrides(authUser.uid, { ...authUser, ...profileData }) as UserProfile);
      setClubProfileExists(true);
      setOwnerUid(authUser.uid);
      try {
        await updateDoc(profileDocRef, { lastLoginAt: serverTimestamp() } as any);
      } catch (e) {
        console.warn('[AuthContext] failed to update lastLoginAt (doc id)', e);
      }
      console.log('[AuthContext] profile found by doc id, user set', { uid: authUser.uid, profileData });
      return;
    }

    // 2. Fallback: club_profiles document where ownerUid == uid (older schema)
    const q = query(collection(db, 'club_profiles'), where('ownerUid', '==', authUser.uid));
    const querySnapshot = await getDocs(q);
    if (!querySnapshot.empty) {
      const docSnap = querySnapshot.docs[0];
      const profileData = docSnap.data();
      setUser(applyUserOverrides(authUser.uid, { ...authUser, ...profileData }) as UserProfile);
      setClubProfileExists(true);
      setOwnerUid(profileData.ownerUid || docSnap.id);
      try {
        await updateDoc(docSnap.ref, { lastLoginAt: serverTimestamp() } as any);
      } catch (e) {
        console.warn('[AuthContext] failed to update lastLoginAt (ownerUid query)', e);
      }
      console.log('[AuthContext] profile found by ownerUid, user set', { uid: authUser.uid, profileData });
      return;
    }

    // 2.5 Admin user: find club_profiles where this uid is listed as an admin
    const adminQ = query(collection(db, 'club_profiles'), where('admins', 'array-contains', authUser.uid));
    const adminSnap = await getDocs(adminQ);
    if (!adminSnap.empty) {
      const adminDoc = adminSnap.docs[0];
      const profileData = adminDoc.data() as any;
      const foundOwnerUid = (profileData?.ownerUid as string) || adminDoc.id;
      setUser(applyUserOverrides(authUser.uid, { ...authUser, ...profileData, ownerUid: foundOwnerUid }) as UserProfile);
      setClubProfileExists(true);
      setOwnerUid(foundOwnerUid);
      try {
        await updateDoc(adminDoc.ref, { lastLoginAt: serverTimestamp() } as any);
      } catch (e) {
        console.warn('[AuthContext] failed to update lastLoginAt (admins query)', e);
      }
      console.log('[AuthContext] profile found by admins, user set', { uid: authUser.uid, foundOwnerUid, profileData });
      return;
    }

    setUser(applyUserOverrides(authUser.uid, authUser as UserProfile) as UserProfile);
    setClubProfileExists(false);
    setOwnerUid(undefined);
    console.log('[AuthContext] no profile, using authUser only', { uid: authUser.uid });
  };

  useEffect(() => {
    let unsubscribe = () => {};
    let cancelled = false;

    const initAuth = async () => {
      try {
        await setPersistence(auth, browserLocalPersistence);
      } catch (e) {
        console.warn('[AuthContext] setPersistence failed', e);
      }

      try {
        const result = await getRedirectResult(auth);
        if (result?.user) {
          console.log('[AuthContext] getRedirectResult user', { uid: result.user.uid });
        } else {
          console.log('[AuthContext] getRedirectResult empty');
        }
      } catch (e) {
        console.warn('[AuthContext] getRedirectResult failed', e);
      }

      if (cancelled) return;

      unsubscribe = onAuthStateChanged(auth, async (authUser) => {
        console.log('[AuthContext] onAuthStateChanged triggered', { authUser });
        if (authUser) {
          setLoading(true);
          await fetchUserProfile(authUser);
          setLoading(false);
        } else {
          setUser(null);
          setClubProfileExists(false);
          setLoading(false);
          console.log('[AuthContext] no authUser, signed out');
        }
      });
    };

    void initAuth();

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!loading && user && !clubProfileExists && pathname !== '/admin/register-club') {
        if(pathname.startsWith('/admin')){
            router.push('/admin/register-club');
        }
    }
  }, [user, clubProfileExists, loading, pathname, router]);

  const refreshUserProfile = async () => {
    const currentUser = auth.currentUser;
    if (currentUser) {
      setLoading(true);
      await fetchUserProfile(currentUser);
      setLoading(false);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, clubProfileExists, ownerUid, refreshUserProfile }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
