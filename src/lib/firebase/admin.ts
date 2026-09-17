import admin from 'firebase-admin';

let db: admin.firestore.Firestore;
let auth: admin.auth.Auth;

const isEmulator = !!(process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST);

try {
  if (!admin.apps.length) {
    if (isEmulator) {
      admin.initializeApp({
        projectId: process.env.FIREBASE_EMULATOR_PROJECT_ID || 'demo-footchron',
      });
    } else if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
      const serviceAccountJson = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf-8');
      const serviceAccount = JSON.parse(serviceAccountJson);

      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: serviceAccount.project_id,
      });
    } else {
      throw new Error('FIREBASE_SERVICE_ACCOUNT_BASE64 environment variable is not set.');
    }
  }
  db = admin.firestore();
  auth = admin.auth();
} catch (error: any) {
  console.error('Firebase admin initialization error:', error.message);
  // In case of error, assign mock objects to prevent the app from crashing.
  // This allows the build to succeed even if Firebase admin fails to initialize.
  db = {} as admin.firestore.Firestore;
  auth = {} as admin.auth.Auth;
}

export { db, auth, admin };

export async function getOwnerUidByClubId(clubId: string): Promise<string | null> {
  try {
    // 1. clubId is typically the clubUid (doc id). Try direct lookup first.
    const direct = await db.collection('club_profiles').doc(clubId).get();
    if (direct.exists) {
      const data = direct.data() || {};
      return data.ownerUid || null;
    }

    // 2. Fallback: legacy clubId field lookup.
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
