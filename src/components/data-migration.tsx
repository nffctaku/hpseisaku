"use client";

import { useState } from 'react';
import { db } from '@/lib/firebase';
import { collection, getDocs, writeBatch, doc, setDoc, query, where, limit } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export function DataMigration({ userId }: { userId: string }) {
  const [loading, setLoading] = useState(false);

  const handlePlayerMigration = async () => {
    const clubId = userId; // The prop is misnamed, it's actually clubId

    setLoading(true);
    const targetSeason = '2025-26';
    toast.info(`選手データを ${targetSeason} シーズンへ移行します...`);

    try {
      // 1. Find the correct ownerUid from club_profiles using the clubId
      const profilesQuery = query(collection(db, 'club_profiles'), where('clubId', '==', clubId), limit(1));
      const profileSnap = await getDocs(profilesQuery);

      if (profileSnap.empty) {
        toast.error(`clubId '${clubId}' に一致するクラブプロファイルが見つかりません。`);
        setLoading(false);
        return;
      }
      const ownerUid = profileSnap.docs[0].id;
      console.log(`Found ownerUid: ${ownerUid} for clubId: ${clubId}`);

      // 2. Get all players from the old collection using the correct ownerUid
      const oldPlayersRef = collection(db, `clubs/${ownerUid}/players`);
      const playersSnap = await getDocs(oldPlayersRef);

      if (playersSnap.empty) {
        toast.info('移行対象の選手データが見つかりませんでした。');
        setLoading(false);
        return;
      }

      console.log(`Found ${playersSnap.docs.length} players to migrate.`);
      const playersToMigrate = playersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      // 3. Ensure the target season document exists
      const seasonDocRef = doc(db, `clubs/${ownerUid}/seasons`, targetSeason);
      await setDoc(seasonDocRef, { name: targetSeason }, { merge: true });

      // 4. Write all players to the new roster subcollection using a batch
      const batch = writeBatch(db);
      const rosterColRef = collection(db, `clubs/${ownerUid}/seasons/${targetSeason}/roster`);
      playersToMigrate.forEach(player => {
        const newPlayerDocRef = doc(rosterColRef, player.id);
        batch.set(newPlayerDocRef, player);
      });

      await batch.commit();

      toast.success(`${playersToMigrate.length}人の選手を ${targetSeason} シーズンに移行しました。`);

    } catch (error) {
      console.error("Migration failed: ", error);
      toast.error('データ移行中にエラーが発生しました。');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-8 p-4 border border-dashed rounded-lg">
      <h3 className="text-lg font-semibold mb-2">選手データ移行ツール</h3>
      <p className="text-sm text-muted-foreground mb-4">
        古い形式の選手データを新しいシーズン形式（2025-2026）に移行します。この操作は一度だけ実行してください。
      </p>
      <Button onClick={handlePlayerMigration} disabled={loading}>
        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        選手データの移行を実行
      </Button>
    </div>
  );
}
