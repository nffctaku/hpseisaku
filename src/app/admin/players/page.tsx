"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { collection, doc, getDoc, getDocs, limit, query, where } from 'firebase/firestore';
import { Loader2 } from 'lucide-react';
import { toSlashSeason } from '@/lib/season';

export default function PlayersAdminPage() {
  const { user, ownerUid, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    const redirectToLatestSeason = async () => {
      if (!user) return;
      const clubUid = ownerUid || user.uid;

      try {
        // Get main team ID
        let mainTeamId: string | null = null;

        const byId = await getDoc(doc(db, 'club_profiles', clubUid));
        if (byId.exists()) {
          const data = byId.data() as any;
          if (typeof data?.mainTeamId === 'string') mainTeamId = String(data.mainTeamId).trim();
        }

        if (!mainTeamId) {
          const q = query(collection(db, 'club_profiles'), where('ownerUid', '==', clubUid), limit(1));
          const s = await getDocs(q);
          if (!s.empty) {
            const data = s.docs[0].data() as any;
            if (typeof data?.mainTeamId === 'string') mainTeamId = String(data.mainTeamId).trim();
          }
        }

        // Fallback to first team if no mainTeamId
        if (!mainTeamId) {
          const teamsSnap = await getDocs(query(collection(db, `clubs/${clubUid}/teams`), limit(1)));
          if (!teamsSnap.empty) {
            mainTeamId = teamsSnap.docs[0].id;
          }
        }

        if (!mainTeamId) {
          router.push('/admin/teams');
          return;
        }

        // Get latest season
        const seasonsColRef = collection(db, `clubs/${clubUid}/seasons`);
        const seasonsSnap = await getDocs(seasonsColRef);
        const seasons = seasonsSnap.docs
          .map((d) => toSlashSeason(d.id))
          .sort((a, b) => b.localeCompare(a));

        if (seasons.length === 0) {
          router.push(`/admin/teams/${mainTeamId}/season`);
          return;
        }

        const latestSeason = seasons[0];
        router.push(`/admin/teams/${mainTeamId}?season=${encodeURIComponent(latestSeason)}`);
      } catch (error) {
        console.error('Failed to redirect to players page: ', error);
        router.push('/admin/teams');
      }
    };

    redirectToLatestSeason();
  }, [user, ownerUid, router]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex justify-center items-center h-screen">
      <Loader2 className="h-8 w-8 animate-spin" />
    </div>
  );
}
