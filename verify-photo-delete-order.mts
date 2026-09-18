// Firestore失敗 / Cloudinary失敗 の再現検証 (demo-footchron エミュレータ)
// 3002: 正常系devサーバー / 3003: CLOUDINARY_API_SECRET=invalid で destroy が必ず失敗
import { readFileSync } from "fs";
const envFile = readFileSync(".env.local", "utf-8");
for (const line of envFile.split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
process.env.FIREBASE_EMULATOR_PROJECT_ID = "demo-footchron";
const { db, auth } = await import("@/lib/firebase/admin");
const { FieldValue } = await import("firebase-admin/firestore");
const assert = (await import("node:assert/strict")).default;

const GOOD = process.env.GOOD_URL || "http://localhost:3002";
const BAD = process.env.BAD_URL || "http://localhost:3003";
const AUTH_EMU = "http://127.0.0.1:9099";
const CLOUD = "dkjcpkfi1";
const PRESET = "hpsakusei_unsigned";
const PASSWORD = "testpass123";
const ts = Date.now();
const uid = `u-e2e-do-${ts}`;
const email = `${uid}@test.local`;
const clubUid = `club-do-${ts}`;
const careerId = `career-do-${ts}`;
const teamId = `team-do-${ts}`;
const SEASON = "2025-26";
const now = FieldValue.serverTimestamp;

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64"
);

async function uploadToCloudinary(publicId: string): Promise<string> {
  const fd = new FormData();
  fd.append("file", new Blob([PNG], { type: "image/png" }), "t.png");
  fd.append("upload_preset", PRESET);
  fd.append("public_id", publicId);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD}/image/upload`, { method: "POST", body: fd });
  const j = (await res.json()) as any;
  if (!res.ok || !j.secure_url) throw new Error(`upload failed: ${JSON.stringify(j)}`);
  return j.secure_url as string;
}

async function getIdToken(): Promise<string> {
  const res = await fetch(
    `${AUTH_EMU}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake`,
    { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: PASSWORD, returnSecureToken: true }) }
  );
  const j = (await res.json()) as any;
  if (!j.idToken) throw new Error(`signIn failed: ${JSON.stringify(j)}`);
  return j.idToken;
}

async function api(base: string, token: string, method: string, body: any) {
  const res = await fetch(`${base}/api/club/player-photos`, {
    method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as any };
}

async function seedPlayer(pid: string, photoUrl: string) {
  await db.doc(`clubs/${clubUid}/teams/${teamId}/players/${pid}`).set({
    teamId, name: `P ${pid}`, number: 1, position: "MF", photoUrl,
    seasons: ["2025/26"], seasonData: { [SEASON]: { photoUrl } }, createdAt: now(), updatedAt: now(),
  });
  await db.doc(`clubs/${clubUid}/seasons/${SEASON}/roster/${pid}`).set({
    playerId: pid, teamId, name: `P ${pid}`, photoUrl,
    seasonData: { [SEASON]: { photoUrl } }, createdAt: now(), updatedAt: now(),
  });
}

const waitGone = async (url: string, tries = 10) => {
  for (let i = 0; i < tries; i++) {
    if ((await fetch(url)).status === 404) return true;
    await new Promise((r) => setTimeout(r, 1500));
  }
  return false;
};

const main = async () => {
  console.log("=== photo delete-order failure reproduction ===");
  const urlA = await uploadToCloudinary(`footchron/do-${ts}-a`);
  const urlB = await uploadToCloudinary(`footchron/do-${ts}-b`);
  const urlC = await uploadToCloudinary(`footchron/do-${ts}-c`);
  console.log("uploaded 3 test images");

  await auth.createUser({ uid, email, password: PASSWORD });
  await db.doc(`users/${uid}`).set({
    email, activeCareerId: careerId, subscription: { status: "pro" }, plan: "pro", createdAt: now(), updatedAt: now(),
  });
  await db.doc(`careers/${careerId}`).set({
    ownerId: uid, clubUid, name: "DO", clubName: "DO Club", clubId: `slug-do-${ts}`,
    status: "active", isPublic: true, createdAt: now(), updatedAt: now(),
  });
  await db.doc(`clubs/${clubUid}/teams/${teamId}`).set({ name: "DO FC", isMain: true, clubUid, createdAt: now() });
  await db.doc(`clubs/${clubUid}/seasons/${SEASON}`).set({ name: "2025/26", isPublic: true, createdAt: now() });
  await seedPlayer("pf", urlA);   // Firestore失敗再現
  await seedPlayer("pc", urlB);   // Cloudinary失敗再現
  await seedPlayer("pp", urlC);   // POST(prev)失敗→retry
  const token = await getIdToken();
  console.log("seed done");

  // --- T-A: Firestore更新失敗の再現（不正なシーズンキー → commit失敗）---
  let r = await api(GOOD, token, "DELETE", { teamId, playerId: "pf", seasons: [SEASON, "bad*key"] });
  assert.equal(r.status, 500, `expected 500, got ${r.status} ${JSON.stringify(r.body)}`);
  const pfDoc = await db.doc(`clubs/${clubUid}/teams/${teamId}/players/pf`).get();
  assert.equal(pfDoc.data()?.photoUrl, urlA, "失敗時に参照が消えた");
  assert.equal(pfDoc.data()?.seasonData?.[SEASON]?.photoUrl, urlA, "seasonData参照も消えた");
  const pfRoster = await db.doc(`clubs/${clubUid}/seasons/${SEASON}/roster/pf`).get();
  assert.equal(pfRoster.data()?.photoUrl, urlA, "roster参照も消えた");
  assert.equal((await fetch(urlA)).status, 200, "失敗時に実ファイルが消えた");
  console.log("PASS T-A: Firestore失敗 → 参照・実ファイルとも無傷（表示画像を失わない）");

  // --- T-B: Cloudinary削除失敗の再現（3003=不正secret → destroy失敗）---
  r = await api(BAD, token, "DELETE", { teamId, playerId: "pc", seasons: [SEASON] });
  assert.equal(r.status, 200, `expected 200 (Firestore先確定), got ${r.status} ${JSON.stringify(r.body)}`);
  assert.ok(r.body.pendingDeletes >= 1, `pendingDeletes未返却: ${JSON.stringify(r.body)}`);
  const pcDoc = await db.doc(`clubs/${clubUid}/teams/${teamId}/players/pc`).get();
  assert.equal(pcDoc.data()?.photoUrl, undefined, "参照が残っている");
  const pending = pcDoc.data()?.pendingPhotoDeletes;
  assert.ok(Array.isArray(pending) && pending.length === 1, `pendingPhotoDeletes未退避: ${JSON.stringify(pending)}`);
  assert.equal((await fetch(urlB)).status, 200, "destroy失敗なのにファイルが消えた");
  console.log("PASS T-B: Cloudinary失敗 → 参照削除確定・実ファイル保持・pendingPhotoDeletes退避");

  // --- T-C: 再試行（3002=正常secret で同じDELETEを再実行 → キューがdrainされる）---
  r = await api(GOOD, token, "DELETE", { teamId, playerId: "pc", seasons: [SEASON] });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.pendingDeletes, 0, `再試行後もpending残: ${JSON.stringify(r.body)}`);
  const pcDoc2 = await db.doc(`clubs/${clubUid}/teams/${teamId}/players/pc`).get();
  assert.equal(pcDoc2.data()?.pendingPhotoDeletes, undefined, "キューがクリアされていない");
  assert.equal(await waitGone(urlB), true, "再試行後も実ファイルが残っている");
  console.log("PASS T-C: 再実行でキューdrain → 実ファイルdestroy・キュークリア");

  // --- T-D: POST変更時の旧画像destroy失敗もキューへ（3003）→ 3002のDELETEで回収 ---
  const newUrl = `https://res.cloudinary.com/${CLOUD}/image/upload/v1/footchron/do-${ts}-new.png`;
  r = await api(BAD, token, "POST", { teamId, playerId: "pp", season: SEASON, photoUrl: newUrl, prevPhotoUrl: urlC, seasons: [SEASON] });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const ppDoc = await db.doc(`clubs/${clubUid}/teams/${teamId}/players/pp`).get();
  assert.equal(ppDoc.data()?.photoUrl, newUrl, "POST自体は反映されるべき");
  const ppPending = ppDoc.data()?.pendingPhotoDeletes;
  assert.ok(Array.isArray(ppPending) && ppPending.length === 1, `POST失敗分が未退避: ${JSON.stringify(ppPending)}`);
  assert.equal((await fetch(urlC)).status, 200, "destroy失敗なのに旧ファイルが消えた");
  // 3002でDELETE → キューdrain → 旧ファイルも消える
  r = await api(GOOD, token, "DELETE", { teamId, playerId: "pp", seasons: [SEASON] });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(await waitGone(urlC), true, "DELETE時のdrainで旧ファイルが消えていない");
  console.log("PASS T-D: POST(prev)失敗もキュー退避 → 次回DELETEで回収・実ファイルdestroy");

  // --- T-E: T-A失敗後のリトライ（正常なseasons）で削除完結 ---
  r = await api(GOOD, token, "DELETE", { teamId, playerId: "pf", seasons: [SEASON] });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const pfDoc2 = await db.doc(`clubs/${clubUid}/teams/${teamId}/players/pf`).get();
  assert.equal(pfDoc2.data()?.photoUrl, undefined);
  assert.equal(await waitGone(urlA), true, "リトライ後も実ファイルが残っている");
  console.log("PASS T-E: Firestore失敗後のリトライで削除完結");

  console.log("=== ALL PASS ===");
};

main().catch((e) => { console.error("FAIL:", e); process.exit(1); });
