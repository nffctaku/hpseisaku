// Emergency bypass for mobile Chrome environments where every Firebase Web SDK
// sign-in function fails (observed: Android Chrome throws
// auth/network-request-failed for signInWithPopup/Redirect/Credential/
// CustomToken, while a plain fetch to identitytoolkit returns 200).
//
// This writes the REST signInWithIdp result into the SDK's own IndexedDB
// persistence store in exactly the format UserImpl.toJSON() produces, so the
// next SDK initialization restores the session through the normal
// PersistenceUserManager.getCurrentUser() -> UserImpl._fromJSON() path.
// No signIn*/redirect call is ever made; refresh goes through securetoken
// (verified reachable on the affected device).

const DB_NAME = "firebaseLocalStorageDb";
const DB_VERSION = 1;
const STORE_NAME = "firebaseLocalStorage";

export interface SignInWithIdpRestResponse {
  localId?: string;
  email?: string;
  emailVerified?: boolean;
  displayName?: string;
  fullName?: string;
  photoUrl?: string;
  federatedId?: string;
  idToken?: string;
  refreshToken?: string;
  expiresIn?: string;
  createdAt?: string | number;
}

function openAuthDb(onStage?: (stage: string) => void): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    onStage?.("IDB_OPEN_START");
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => {
      onStage?.("IDB_OPEN_ERROR");
      reject(req.error);
    };
    req.onblocked = () => {
      onStage?.("IDB_BLOCKED");
    };
    req.onupgradeneeded = () => {
      onStage?.("IDB_UPGRADE");
      try {
        req.result.createObjectStore(STORE_NAME, { keyPath: "fbase_key" });
      } catch (e) {
        reject(e);
      }
    };
    req.onsuccess = () => {
      onStage?.("IDB_OPEN_OK");
      const result = req.result;
      resolve(result);
    };
  });
}

export async function seedFirebaseAuthUser(
  resp: SignInWithIdpRestResponse,
  apiKey: string,
  appName: string,
  onStage?: (stage: string) => void
): Promise<void> {
  if (!resp.localId || !resp.idToken || !resp.refreshToken) {
    throw new Error("incomplete signInWithIdp response");
  }
  const displayName = resp.displayName || resp.fullName || undefined;
  const now = Date.now();
  const userJson = {
    uid: resp.localId,
    email: resp.email || undefined,
    emailVerified:
      typeof resp.emailVerified === "boolean" ? resp.emailVerified : true,
    displayName,
    isAnonymous: false,
    photoURL: resp.photoUrl || undefined,
    phoneNumber: undefined,
    tenantId: undefined,
    providerData: [
      {
        providerId: "google.com",
        uid: resp.federatedId || resp.localId,
        displayName: displayName ?? null,
        email: resp.email ?? null,
        phoneNumber: null,
        photoURL: resp.photoUrl ?? null,
      },
    ],
    stsTokenManager: {
      refreshToken: resp.refreshToken,
      accessToken: resp.idToken,
      expirationTime: now + Number(resp.expiresIn || 3600) * 1000,
    },
    createdAt: resp.createdAt ? String(resp.createdAt) : String(now),
    lastLoginAt: String(now),
    apiKey,
    appName,
  };

  const db = await openAuthDb(onStage);
  onStage?.("IDB_OPEN_RESOLVED");
  try {
    await new Promise<void>((resolve, reject) => {
      onStage?.("IDB_TX_START");
      const tx = db.transaction(STORE_NAME, "readwrite");
      onStage?.("IDB_TX_OK");
      tx.oncomplete = () => {
        onStage?.("IDB_TX_COMPLETE");
        resolve();
      };
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => {
        onStage?.("IDB_TX_ABORT");
        reject(tx.error);
      };
      onStage?.("IDB_PUT_START");
      const putReq = tx.objectStore(STORE_NAME).put({
        fbase_key: `firebase:authUser:${apiKey}:${appName}`,
        value: userJson,
      });
      putReq.onsuccess = () => onStage?.("IDB_PUT_SUCCESS");
      putReq.onerror = () => onStage?.("IDB_PUT_ERROR");
    });
  } finally {
    db.close();
  }
}
