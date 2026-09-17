"use client";

import { createContext, useContext, useState, useEffect, useRef, ReactNode, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { useCareer } from './CareerContext';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

interface ClubInfo {
  id: string | null;
  clubProfileId: string | null;
  logoUrl: string | null;
  clubName: string | null;
}

interface ClubContextType {
  clubInfo: ClubInfo;
  mainTeamId: string | null;
  clubProfileId: string | null;
  fetchClubInfo: () => void;
}

const ClubContext = createContext<ClubContextType | undefined>(undefined);

export function ClubProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { activeCareer, loading: careerLoading } = useCareer();
  const [clubInfo, setClubInfo] = useState<ClubInfo>({ id: null, clubProfileId: null, logoUrl: null, clubName: null });
  const [mainTeamId, setMainTeamId] = useState<string | null>(null);
  const [clubProfileId, setClubProfileId] = useState<string | null>(null);
  const fetchGenRef = useRef(0);
  const lastClubUidRef = useRef<string | null | undefined>(undefined);

  const fetchClubInfo = useCallback(async () => {
    // activeCareer.clubUid が唯一のデータ取得先。ownerUid / user.uid へのフォールバックは行わない。
    const clubUid = user && !careerLoading ? activeCareer?.clubUid ?? null : null;
    const gen = ++fetchGenRef.current;
    if (lastClubUidRef.current !== clubUid) {
      lastClubUidRef.current = clubUid;
      setClubInfo({ id: null, clubProfileId: null, logoUrl: null, clubName: null });
      setMainTeamId(null);
      setClubProfileId(null);
    }
    if (!clubUid) return;
    {
      try {
        // club_profiles の docId = clubUid のみ参照する（ownerUid 検索はしない）
        const clubProfileRef = doc(db, 'club_profiles', clubUid);
        const clubProfileSnap = await getDoc(clubProfileRef);

        let clubProfileData: any = {};
        let nextClubProfileId: string | null = null;

        if (clubProfileSnap.exists()) {
          clubProfileData = clubProfileSnap.data();
          nextClubProfileId = clubProfileSnap.id;
        }

        // 2. Fetch from clubs collection (fallback)
        const clubDocRef = doc(db, "clubs", clubUid);
        const clubDocSnap = await getDoc(clubDocRef);
        const clubData = clubDocSnap.exists() ? clubDocSnap.data() : {};

        // 3. Fetch main team from teams subcollection (another fallback)
        const resolvedMainTeamId = (clubProfileData as any)?.mainTeamId || null;
        let teamData: any = {};
        if (resolvedMainTeamId) {
          const teamDocRef = doc(db, `clubs/${clubUid}/teams`, resolvedMainTeamId);
          const teamDocSnap = await getDoc(teamDocRef);
          teamData = teamDocSnap.exists() ? teamDocSnap.data() : {};
        }

        // Guard against stale async overwrites when switching careers.
        if (gen !== fetchGenRef.current || lastClubUidRef.current !== clubUid) {
          console.warn('[ClubContext] stale fetch ignored', { requested: clubUid });
          return;
        }

        // 4. Consolidate and set the club info
        const resolvedClubId =
          (clubProfileData as any).clubId ||
          (clubData as any).clubId ||
          clubUid ||
          null;

        console.log('[ClubContext] resolved club info', {
          clubUid,
          clubProfileData,
          clubData,
          teamData,
          resolvedClubId,
          resolvedMainTeamId,
        });

        setClubInfo({
          id: resolvedClubId,
          clubProfileId: nextClubProfileId,
          // 表示優先度: メインチーム > club_profiles > clubs
          clubName:
            (teamData as any).name ||
            (clubProfileData as any).clubName ||
            (clubData as any).clubName ||
            null,
          logoUrl:
            (teamData as any).logoUrl ||
            (clubProfileData as any).logoUrl ||
            (clubData as any).logoUrl ||
            (clubProfileData as any).photoURL ||
            null,
        });
        setMainTeamId(resolvedMainTeamId);
        setClubProfileId(nextClubProfileId);
      } catch (error) {
        console.error("Error fetching club info for context:", error);
      }
    }
  }, [user, careerLoading, activeCareer?.clubUid, activeCareer?.id]);

  useEffect(() => {
    fetchClubInfo();
  }, [fetchClubInfo]);

  return (
    <ClubContext.Provider value={{ clubInfo, mainTeamId, clubProfileId, fetchClubInfo }}>
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
