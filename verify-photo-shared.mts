// 画像共有URL保護・所有権検証の追加検証 (demo-footchron エミュレータ + localhost:3002)
// 実Cloudinaryにアップロードした実ファイルで「共有中は消えない／最終参照で消える」を確認する。
import { readFileSync } from "fs";
const envFile = readFileSync(".env.local", "utf-8");
for (const line of envFile.split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
// エミュレータ接続（admin SDK）
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
process.env.FIREBASE_EMULATOR_PROJECT_ID = "demo-footchron";
const { db, auth } = await import("@/lib/firebase/admin");
const { FieldValue } = await import("firebase-admin/firestore");
const assert = (await import("node:assert/strict")).default;

const BASE_URL = process.env.BASE_URL || "http://localhost:3002";
const AUTH_EMU = "http://127.0.0.1:9099";
const CLOUD = "dkjcpkfi1";
const PRESET = "hpsakusei_unsigned";
const PASSWORD = "testpass123";
const ts = Date.now();
const uid = `u-e2e-ps-${ts}`;
const email = `${uid}@test.local`;
const clubA = `club-psa-${ts}`;
const clubB = `club-psb-${ts}`;
const careerA = `career-psa-${ts}`;
const careerB = `career-psb-${ts}`;
const teamA = `team-psa-${ts}`;
const teamB = `team-psb-${ts}`;
const slugA = `slug-psa-${ts}`;
const slugB = `slug-psb-${ts}`;
// 他ユーザー（所有権拒否検証用）
const uid2 = `u-e2e-ps2-${ts}`;
const email2 = `${uid2}@test.local`;
const clubU2 = `club-ps2-${ts}`;
const careerU2 = `career-ps2-${ts}`;
const teamU2 = `team-ps2-${ts}`;
const SEASON = "2025-26";
const now = FieldValue.serverTimestamp;

const PNG_B64 =
  "iVBORw0KGgoAAAABAAAAAQCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
// ↑ 壊れていると困るので正規の1x1 PNGを使う
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

async function seed(owner: string, clubUid: string, careerId: string, teamId: string, slug: string, players: Record<string, any>) {
  await db.collection("careers").doc(careerId).set({
    ownerId: owner, clubUid, name: careerId, clubName: "PS Club",
    clubId: slug, status: "active", isPublic: true, createdAt: now(), updatedAt: now(),
  });
  await db.collection("club_profiles").doc(clubUid).set({
    ownerUid: owner, clubUid, clubId: slug, slug,
    clubName: "PS Club", logoUrl: null, mainTeamId: teamId, createdAt: now(), updatedAt: now(),
  });
  await db.collection("club_profiles").doc(slug).set({
    ownerUid: owner, clubUid, clubId: slug, slug, createdAt: now(), updatedAt: now(),
  });
  await db.collection(`clubs/${clubUid}/teams`).doc(teamId).set({ name: "PS FC", isMain: true, clubUid, createdAt: now() });
  await db.collection(`clubs/${clubUid}/seasons`).doc(SEASON).set({ name: "2025/26", isPublic: true, createdAt: now() });
  let num = 10;
  for (const [pid, data] of Object.entries(players)) {
    await db.collection(`clubs/${clubUid}/teams/${teamId}/players`).doc(pid).set({
      teamId, name: `Player ${pid}`, number: num++, position: "MF", seasons: ["2025/26"], ...data, createdAt: now(), updatedAt: now(),
    });
    await db.collection(`clubs/${clubUid}/seasons/${SEASON}/roster`).doc(pid).set({
      playerId: pid, teamId, name: `Player ${pid}`, photoUrl: data.photoUrl ?? null,
      seasonData: { [SEASON]: { photoUrl: data.photoUrl ?? "" } }, createdAt: now(), updatedAt: now(),
    });
  }
}

async function getIdToken(loginEmail: string): Promise<string> {
  const res = await fetch(
    `${AUTH_EMU}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake`,
    { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: loginEmail, password: PASSWORD, returnSecureToken: true }) }
  );
  const j = (await res.json()) as any;
  if (!j.idToken) throw new Error(`signIn failed: ${JSON.stringify(j)}`);
  return j.idToken;
}

async function api(token: string, method: string, body: any) {
  const res = await fetch(`${BASE_URL}/api/club/player-photos`, {
    method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as any };
}

function hasPhotoUrlDeep(obj: any): string[] {
  const found: string[] = [];
  const walk = (v: any, path: string) => {
    if (!v || typeof v !== "object") return;
    for (const [k, val] of Object.entries(v)) {
      const p = path ? `${path}.${k}` : k;
      if (k === "photoUrl" && typeof val === "string" && val) found.push(p);
      if (k.includes(".") ) found.push(`literal-key:${p}`);
      walk(val, p);
    }
  };
  walk(obj, "");
  return found;
}

const main = async () => {
  console.log("=== photo shared-URL protection verify ===");
  // 実画像をCloudinaryへ
  const sharedId1 = `footchron/player-photos/${clubA}/${teamA}/shared1-${ts}`;
  const sharedId2 = `footchron/player-photos/${clubA}/${teamA}/shared2-${ts}`;
  const sharedUrl1 = await uploadToCloudinary(sharedId1);
  const sharedUrl2 = await uploadToCloudinary(sharedId2);
  console.log("uploaded:", sharedUrl1.slice(-50));

  await auth.createUser({ uid, email, password: PASSWORD });
  await db.collection("users").doc(uid).set({
    email, activeCareerId: careerA, subscription: { status: "pro" }, plan: "pro", createdAt: now(), updatedAt: now(),
  });
  await seed(uid, clubA, careerA, teamA, slugA, {
    pa: { photoUrl: sharedUrl1 },
    pa2: { photoUrl: sharedUrl2 },
    pa3: { photoUrl: "https://example.com/external.png" }, // 非Cloudinary
  });
  await seed(uid, clubB, careerB, teamB, slugB, {
    pb: { photoUrl: sharedUrl1 },  // CareerコピーでURL共有
    pb2: { photoUrl: sharedUrl2 },
  });
  // 他ユーザー（所有権拒否検証）
  await auth.createUser({ uid: uid2, email: email2, password: PASSWORD });
  await db.collection("users").doc(uid2).set({
    email: email2, activeCareerId: careerU2, subscription: { status: "pro" }, plan: "pro", createdAt: now(), updatedAt: now(),
  });
  await seed(uid2, clubU2, careerU2, teamU2, `slug-ps2-${ts}`, {
    pu2: { photoUrl: "https://example.com/u2.png" },
  });
  const token = await getIdToken(email);
  const token2 = await getIdToken(email2);
  console.log("seed done (Career A active)");

  // --- Test1: 共有URLを持つ選手の画像削除 → ファイル保持・B参照無傷 ---
  let r = await api(token, "DELETE", { teamId: teamA, playerId: "pa", seasons: [SEASON] });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const paDoc = await db.doc(`clubs/${clubA}/teams/${teamA}/players/pa`).get();
  const paRoster = await db.doc(`clubs/${clubA}/seasons/${SEASON}/roster/pa`).get();
  assert.deepEqual(hasPhotoUrlDeep(paDoc.data()), [], "pa doc photoUrl残留");
  assert.deepEqual(hasPhotoUrlDeep(paRoster.data()), [], "pa roster photoUrl残留");
  const pbDoc = await db.doc(`clubs/${clubB}/teams/${teamB}/players/pb`).get();
  assert.equal(pbDoc.data()?.photoUrl, sharedUrl1, "Career Bの共有参照が消えた");
  let imgRes = await fetch(sharedUrl1);
  assert.equal(imgRes.status, 200, `共有中の実ファイルが消えた (${imgRes.status})`);
  console.log("PASS T1: 共有URL削除 → A参照クリア・B参照維持・実ファイル保持");

  // --- Test2: POST変更(prev共有URL) → B参照無傷・実ファイル保持 ---
  const newUrl = `https://res.cloudinary.com/${CLOUD}/image/upload/v1/footchron/new-${ts}.png`;
  r = await api(token, "POST", { teamId: teamA, playerId: "pa2", season: SEASON, photoUrl: newUrl, prevPhotoUrl: sharedUrl2, seasons: [SEASON] });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const pa2Doc = await db.doc(`clubs/${clubA}/teams/${teamA}/players/pa2`).get();
  assert.equal(pa2Doc.data()?.photoUrl, newUrl);
  const pb2Doc = await db.doc(`clubs/${clubB}/teams/${teamB}/players/pb2`).get();
  assert.equal(pb2Doc.data()?.photoUrl, sharedUrl2, "POST側でCareer Bの共有参照が消えた");
  imgRes = await fetch(sharedUrl2);
  assert.equal(imgRes.status, 200, `POST共有prev実ファイルが消えた (${imgRes.status})`);
  console.log("PASS T2: 変更(prev共有) → A新URL・B参照維持・旧実ファイル保持");

  // --- Test3: 所有権/存在チェック ---
  r = await api(token, "POST", { teamId: teamA, playerId: "no-such", season: SEASON, photoUrl: newUrl, seasons: [SEASON] });
  assert.equal(r.status, 404, `POST nonexistent → ${r.status}`);
  r = await api(token, "DELETE", { teamId: teamA, playerId: "no-such" });
  assert.equal(r.status, 404, `DELETE nonexistent → ${r.status}`);
  // 他ユーザーが uid の選手(teamA/pa2)を変更・削除しようとしても拒否される
  // （clubUid は呼び出し側の activeCareer から解決されるため、他人の領域に届かない）
  const pa2Before = await db.doc(`clubs/${clubA}/teams/${teamA}/players/pa2`).get();
  r = await api(token2, "POST", { teamId: teamA, playerId: "pa2", season: SEASON, photoUrl: "https://res.cloudinary.com/dkjcpkfi1/image/upload/v1/footchron/hijack.png", seasons: [SEASON] });
  assert.ok(r.status === 404 || r.status === 400 || r.status === 403, `cross-user POST → ${r.status}`);
  r = await api(token2, "DELETE", { teamId: teamA, playerId: "pa2" });
  assert.ok(r.status === 404 || r.status === 403, `cross-user DELETE → ${r.status}`);
  const pa2After = await db.doc(`clubs/${clubA}/teams/${teamA}/players/pa2`).get();
  assert.equal(pa2After.data()?.photoUrl, pa2Before.data()?.photoUrl, "他ユーザーの操作で pa2 が変更された");
  console.log(`PASS T3: 存在しない選手 → 404 / 他ユーザーの選手への変更・削除 → 拒否 (POST:${"ok"}, DELETE:ok)`);

  // --- Test4: 非Cloudinary URLの削除 → destroy対象外・参照だけクリア ---
  r = await api(token, "DELETE", { teamId: teamA, playerId: "pa3", seasons: [SEASON] });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const pa3Doc = await db.doc(`clubs/${clubA}/teams/${teamA}/players/pa3`).get();
  assert.deepEqual(hasPhotoUrlDeep(pa3Doc.data()), []);
  console.log("PASS T4: 外部URL → destroyスキップ・参照クリア");

  // --- Test5: Career B切替→最終参照者の削除 → 実ファイルも消える ---
  await db.collection("users").doc(uid).update({ activeCareerId: careerB });
  r = await api(token, "DELETE", { teamId: teamB, playerId: "pb", seasons: [SEASON] });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const pbDoc2 = await db.doc(`clubs/${clubB}/teams/${teamB}/players/pb`).get();
  assert.deepEqual(hasPhotoUrlDeep(pbDoc2.data()), []);
  // CDN反映を待って確認
  let gone = false;
  for (let i = 0; i < 10; i++) {
    const res = await fetch(sharedUrl1);
    if (res.status === 404) { gone = true; break; }
    await new Promise((r2) => setTimeout(r2, 1500));
  }
  assert.equal(gone, true, "最終参照削除後も実ファイルが残っている");
  console.log("PASS T5: 最終参照者の削除 → 実ファイルもdestroy");

  // --- Test6: 変更後の公開ページに新URLが出る・再取得(再読込)後も維持・削除後は消える ---
  const pub = await fetch(`${BASE_URL}/${slugA}/players`, { cache: "no-store" });
  const html = await pub.text();
  assert.equal(pub.status, 200, `public players ${pub.status}`);
  assert.ok(html.includes(`new-${ts}`), "公開SQUADに新画像URLが無い");
  assert.ok(!html.includes(`shared2-${ts}`), "公開SQUADに旧画像URLが残っている");
  // 再読込相当の2回目取得でも維持
  const pub2 = await fetch(`${BASE_URL}/${slugA}/players`, { cache: "no-store" });
  const html2 = await pub2.text();
  assert.ok(html2.includes(`new-${ts}`), "再取得で新画像URLが消えた");
  console.log("PASS T6a: 公開ページに新URL表示・再取得でも維持");

  // 画像削除 → 公開ページからURLが消える（既定アイコン側へ）
  await db.collection("users").doc(uid).update({ activeCareerId: careerA });
  r = await api(token, "DELETE", { teamId: teamA, playerId: "pa2", seasons: [SEASON] });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const pub3 = await fetch(`${BASE_URL}/${slugA}/players`, { cache: "no-store" });
  const html3 = await pub3.text();
  assert.ok(!html3.includes(`new-${ts}`), "削除後も公開SQUADに旧URLが残っている");
  // roster/seasonData からの復活なし
  const pa2Roster = await db.doc(`clubs/${clubA}/seasons/${SEASON}/roster/pa2`).get();
  const pa2Doc2 = await db.doc(`clubs/${clubA}/teams/${teamA}/players/pa2`).get();
  assert.deepEqual(hasPhotoUrlDeep(pa2Doc2.data()), [], "pa2 doc復活");
  assert.deepEqual(hasPhotoUrlDeep(pa2Roster.data()), [], "pa2 roster復活");
  console.log("PASS T6b: 削除後 → 公開ページURL消滅・roster/seasonData復活なし");

  console.log("=== ALL PASS ===");
};

main().catch((e) => { console.error("FAIL:", e); process.exit(1); });
