import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInAnonymously } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';

test('emulator signin', async () => {
  console.log('init app...');
  const app = initializeApp({ projectId: 'demo-footchron', apiKey: 'x', authDomain: 'x' }, `t-${Date.now()}`);
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  console.log('signing in...');
  const cred = await signInAnonymously(auth);
  console.log('uid', cred.user.uid);
  assert.ok(cred.user.uid);
});
