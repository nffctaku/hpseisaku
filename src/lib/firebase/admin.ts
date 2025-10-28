import admin from 'firebase-admin';

let db: admin.firestore.Firestore;
let auth: admin.auth.Auth;

try {
  // --- DEBUGGING ENVIRONMENT VARIABLES ---
  console.log('--- Firebase Admin Env Check ---');
  console.log('Has projectId:', !!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID);
  console.log('Has clientEmail:', !!process.env.FIREBASE_CLIENT_EMAIL);
  console.log('Has privateKey:', !!process.env.FIREBASE_PRIVATE_KEY);
  console.log('--------------------------------');
  // --- END DEBUGGING ---

  if (!admin.apps.length) {
    const serviceAccount = {
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    };

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount as any),
    });
  }
  db = admin.firestore();
  auth = admin.auth();
} catch (error: any) {
  console.error('Firebase admin initialization error', error.stack);
  // @ts-ignore
  db = {}; 
  // @ts-ignore
  auth = {};
}

export { db, auth, admin };

export async function getOwnerUidByClubId(clubId: string): Promise<string | null> {
  try {
    const profilesRef = db.collection('club_profiles');
    const q = profilesRef.where('clubId', '==', clubId).limit(1);
    const snapshot = await q.get();

    if (snapshot.empty) {
      console.log(`No matching club profile found for clubId: ${clubId}`);
      return null;
    }

    const userProfile = snapshot.docs[0].data();
    return userProfile.ownerUid || null;
  } catch (error) {
    console.error(`Error fetching ownerUid for clubId ${clubId}:`, error);
    return null;
  }
}
