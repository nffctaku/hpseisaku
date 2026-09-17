const path = require('node:path');
const { spawn } = require('node:child_process');
const { loadEnvConfig } = require('@next/env');

const root = path.resolve(__dirname, '..');
const emulator = process.argv.includes('--emulator');
// Load local configuration first, then override inherited test settings.
loadEnvConfig(root, true);
const env = { ...process.env };
for (const key of Object.keys(env)) {
  if (/EMULATOR/i.test(key)) delete env[key];
}
env.FOOTCHRON_DEV_MODE = emulator ? 'emulator' : 'normal';
env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR = emulator ? '1' : '0';
// Empty overrides prevent Next from reloading these values from .env files.
env.FIRESTORE_EMULATOR_HOST = '';
env.FIREBASE_AUTH_EMULATOR_HOST = '';
env.FIREBASE_EMULATOR_PROJECT_ID = '';
env.FIREBASE_DATABASE_EMULATOR_HOST = '';
env.FIREBASE_STORAGE_EMULATOR_HOST = '';
env.STORAGE_EMULATOR_HOST = '';
if (emulator) {
  env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
  env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
  env.FIREBASE_EMULATOR_PROJECT_ID = 'demo-footchron';
  env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = 'demo-footchron';
  env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST = 'http://127.0.0.1:9099';
  env.NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST = '127.0.0.1';
  env.NEXT_PUBLIC_FIRESTORE_EMULATOR_PORT = '8080';
}
if (process.argv.includes('--check')) {
  console.log(JSON.stringify({ mode: env.FOOTCHRON_DEV_MODE, port: emulator ? 3002 : 3000, clientEmulator: env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR, firestoreEmulator: env.FIRESTORE_EMULATOR_HOST, authEmulator: env.FIREBASE_AUTH_EMULATOR_HOST }));
} else {
  console.log(emulator ? 'Test app: http://localhost:3002 (demo-footchron emulators required)' : 'Normal app: http://localhost:3000 (emulators disabled)');
  const child = spawn(process.execPath, ['--preserve-symlinks', '--preserve-symlinks-main', require.resolve('next/dist/bin/next'), 'dev', '--turbopack', '--port', emulator ? '3002' : '3000'], { cwd: root, env, stdio: 'inherit' });
  child.on('error', (error) => { console.error(error); process.exitCode = 1; });
  child.on('exit', (code) => { process.exitCode = code ?? 1; });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
}
