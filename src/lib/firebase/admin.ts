import admin from 'firebase-admin';

let db: admin.firestore.Firestore;
let auth: admin.auth.Auth;

try {
  if (!admin.apps.length) {
    if (!process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT_BASE64 environment variable is not set.');
    }

    const serviceAccountJson = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf-8');
    const serviceAccount = JSON.parse(serviceAccountJson);

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
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
