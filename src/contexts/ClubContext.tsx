"use client";

import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

interface ClubInfo {
  id: string | null;
  logoUrl: string | null;
  clubName: string | null;
}

interface ClubContextType {
  clubInfo: ClubInfo;
  fetchClubInfo: () => void;
}

const ClubContext = createContext<ClubContextType | undefined>(undefined);

export function ClubProvider({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const [clubInfo, setClubInfo] = useState<ClubInfo>({ id: null, logoUrl: null, clubName: null });

  const fetchClubInfo = useCallback(async () => {
    if (user && !loading) {
      try {
        // 1. Single source of truth: club_profiles document whose ID is the user's UID
        const clubProfileRef = doc(db, 'club_profiles', user.uid);
        const clubProfileSnap = await getDoc(clubProfileRef);
        const clubProfileData = clubProfileSnap.exists() ? clubProfileSnap.data() : {};

        // 2. Fetch from clubs collection (fallback)
        const clubDocRef = doc(db, "clubs", user.uid);
        const clubDocSnap = await getDoc(clubDocRef);
        const clubData = clubDocSnap.exists() ? clubDocSnap.data() : {};

        // 3. Fetch from teams subcollection (another fallback)
        const teamDocRef = doc(db, `clubs/${user.uid}/teams`, user.uid);
        const teamDocSnap = await getDoc(teamDocRef);
        const teamData = teamDocSnap.exists() ? teamDocSnap.data() : {};

        // 4. Consolidate and set the club info
        setClubInfo({
          id: clubProfileData.clubId || null,
          clubName: clubProfileData.clubName || clubData.clubName || teamData.name || null,
          logoUrl: clubProfileData.logoUrl || clubData.logoUrl || teamData.logoUrl || clubProfileData.photoURL || null,
        });
      } catch (error) {
        console.error("Error fetching club info for context:", error);
      }
    }
  }, [user, loading]);

  useEffect(() => {
    fetchClubInfo();
  }, [fetchClubInfo]);

  return (
    <ClubContext.Provider value={{ clubInfo, fetchClubInfo }}>
      {children}
    </ClubContext.Provider>
  );
}

export function useClub() {
  const context = useContext(ClubContext);
  if (context === undefined) {
    throw new Error('useClub must be used within a ClubProvider');
  }
  return context;
}
