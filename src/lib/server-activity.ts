import { db, admin } from '@/lib/firebase/admin';

export async function touchUserActivity(uid: string): Promise<void> {
  try {
    await db
      .collection('users')
      .doc(uid)
      .set(
        {
          lastActivityAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
  } catch (error) {
    console.error('[touchUserActivity] failed for', uid, error);
    // 活動記録失敗はメイン処理を止めない
  }
}
