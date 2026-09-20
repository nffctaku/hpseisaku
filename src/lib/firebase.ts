import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { getFirestore, setLogLevel, connectFirestoreEmulator } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// 自ドメイン上では authDomain を自ドメインにする
// （/__/auth/* は rewrite でプロキシ済み）。iOS Safari や Chrome の
// サードパーティストレージ制限で認証結果が復元できない問題を回避するため。
const SELF_AUTH_DOMAINS = new Set(['www.footchron.com', 'footchron.com']);
const DEFAULT_AUTH_DOMAIN = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
// 自ドメイン上では初期値から authDomain を自ドメインにする。
// popup/redirect とも auth イベントの受け渡しに authDomain の
// cross-origin iframe ストレージを使うため、Chrome のサードパーティ
// ストレージブロックでは firebaseapp.com のままだとログインが失敗する。
// 自ドメインなら iframe が同一オリジンになり影響を受けない
// （/__/auth/* は rewrite で firebaseapp.com へプロキシ済み）。
const resolvedAuthDomain =
  typeof window !== 'undefined' && SELF_AUTH_DOMAINS.has(window.location.hostname)
    ? window.location.hostname
    : DEFAULT_AUTH_DOMAIN;

export function useSelfAuthDomainForRedirect(): void {
  const host = typeof window !== 'undefined' ? window.location.hostname : '';
  if (SELF_AUTH_DOMAINS.has(host)) {
    (auth.config as { authDomain: string }).authDomain = host;
  }
}

export function restoreDefaultAuthDomain(): void {
  if (resolvedAuthDomain) {
    (auth.config as { authDomain: string }).authDomain = resolvedAuthDomain;
  }
}

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: resolvedAuthDomain,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const currentDomain = typeof window !== 'undefined' ? window.location.hostname : 'server';
console.log('[Firebase] Config check', {
  hasApiKey: !!firebaseConfig.apiKey,
  hasAuthDomain: !!firebaseConfig.authDomain,
  hasProjectId: !!firebaseConfig.projectId,
  hasAppId: !!firebaseConfig.appId,
  projectId: firebaseConfig.projectId,
  authDomain: firebaseConfig.authDomain,
  currentDomain,
  match: currentDomain === firebaseConfig.authDomain,
});

// Initialize Firebase
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
console.log('[Firebase] App initialized', { appName: app.name, projectId: app.options.projectId });

const auth = getAuth(app);
console.log('[Firebase] Auth initialized');

const db = getFirestore(app);
setLogLevel('error');
console.log('[Firebase] Firestore initialized');

const storage = getStorage(app);
console.log('[Firebase] Storage initialized');

if (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === '1') {
  console.log('[Firebase] Connecting to emulator', {
    useEmulator: process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR,
    authHost: process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST,
    firestoreHost: process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST,
    firestorePort: process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_PORT,
    projectId: app.options.projectId,
  });
  const authHost = process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST || 'http://127.0.0.1:9099';
  const firestoreHost = process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST || '127.0.0.1';
  const firestorePort = Number(process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_PORT || '8080');
  connectAuthEmulator(auth, authHost, { disableWarnings: true });
  connectFirestoreEmulator(db, firestoreHost, firestorePort);
}

export { app, auth, db, storage };
