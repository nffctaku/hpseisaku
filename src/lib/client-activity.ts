import { auth } from '@/lib/firebase';

export async function touchUserActivity(): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser) return;

  try {
    const idToken = await currentUser.getIdToken();
    const res = await fetch('/api/club/activity/touch', {
      method: 'POST',
      headers: { Authorization: `Bearer ${idToken}` },
    });
    if (!res.ok) {
      console.error('[touchUserActivity] failed', res.status);
    }
  } catch (error) {
    console.error('[touchUserActivity] error:', error);
  }
}
