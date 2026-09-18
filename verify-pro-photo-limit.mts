// Pro会員の選手画像20枚制限 誤判定の検証 (demo-footchron エミュレータ + localhost:3002)
// バグ: GET /api/club/player-photos/check が getEffectivePlanForUid(clubUid) を呼び、
// 非デフォルトCareer(clubUid≠uid)では club_profiles/{clubUid}.plan='free' を見て Free と誤判定。
// 修正後: uid ベースで Pro が解決され、画面表示(check)と保存(POST)が同じ判定になることを確認。
import { readFileSync } from "fs";
const envFile = readFileSync(".env.local", "utf-8");
for (const line of envFile.split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR = "1";
process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = "demo-footchron";
process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST = "http://127.0.0.1:9099";
process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST = "127.0.0.1";
process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_PORT = "8080";
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
process.env.FIREBASE_EMULATOR_PROJECT_ID = "demo-footchron";

const { db: adminDb, auth: adminAuth } = await import("@/lib/firebase/admin");
const { FieldValue } = await import("firebase-admin/firestore");
const { auth: clientAuth } = await import("@/lib/firebase");
const { signInWithEmailAndPassword } = await import("firebase/auth");
const { getEffectivePlanForUid } = await import("@/lib/server-plan");

const BASE = process.env.BASE_URL || "http://localhost:3002";
const ts = Date.now();
const now = FieldValue.serverTimestamp;
let pass = 0, fail = 0;
const check = (name: string, cond: boolean, extra?: unknown) => {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name}`, extra ?? ""); }
};

async function makeUser(tag: string, opts: {
  userDoc?: Record<string, unknown>;
  profilePlan?: string | null;           // club_profiles/{uid}.plan
  careerProfilePlan?: string | null;     // club_profiles/{clubUid}.plan（Career側プロフィール）
}) {
  const uid = `u-pl-${tag}-${ts}`;
  const email = `${uid}@test.local`;
  const clubUid = `clubB-pl-${tag}-${ts}`;   // ≠ uid: 非デフォルトCareer
  const careerId = `career-pl-${tag}-${ts}`;
  const teamId = `team-pl-${tag}-${ts}`;
  await adminAuth.createUser({ uid, email, password: "testpass123" });
  await adminDb.collection("users").doc(uid).set({
    email, activeCareerId: careerId, ...opts.userDoc,
  });
  await adminDb.collection("careers").doc(careerId).set({
    ownerId: uid, clubUid, name: `Career ${tag}`, clubName: `Club ${tag}`,
    status: "active", createdAt: now(), updatedAt: now(),
  });
  if (opts.profilePlan !== null) {
    await adminDb.collection("club_profiles").doc(uid).set({
      ownerUid: uid, clubName: `Club ${tag}`, plan: opts.profilePlan ?? "free", createdAt: now(),
    });
  }
  await adminDb.collection("club_profiles").doc(clubUid).set({
    ownerUid: uid, clubUid, clubName: `Club ${tag} B`, plan: opts.careerProfilePlan ?? "free", createdAt: now(),
  });
  // チーム + 画像付き選手20件をシード
  await adminDb.doc(`clubs/${clubUid}/teams/${teamId}`).set({ name: `Team ${tag}`, ownerUid: uid });
  const batch = adminDb.batch();
  for (let i = 1; i <= 21; i++) {
    const ref = adminDb.doc(`clubs/${clubUid}/teams/${teamId}/players/p${i}`);
    batch.set(ref, i <= 20
      ? { name: `P${i}`, photoUrl: `https://res.cloudinary.com/x/image/upload/v1/p${i}.jpg`, seasons: ["2025/26"] }
      : { name: `P${i}`, seasons: ["2025/26"] });
  }
  await batch.commit();
  const cred = await signInWithEmailAndPassword(clientAuth, email, "testpass123");
  const idToken = await cred.user.getIdToken();
  return { uid, clubUid, teamId, idToken };
}

const api = (idToken: string, path: string, init?: RequestInit) =>
  fetch(`${BASE}${path}`, { ...init, headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json", ...(init?.headers || {}) } });

// ── A) Pro（課金）+ 非デフォルトCareer ─────────────────────────
console.log("== A: paid Pro on non-default career (clubUid != uid) ==");
{
  const u = await makeUser("pro", {
    userDoc: { subscription: { status: "pro" } },
    profilePlan: "pro",
    careerProfilePlan: "free",
  });
  // 旧バグの再現確認: clubUid で引くと free になる
  const byClub = await getEffectivePlanForUid(u.clubUid);
  check("旧パス getEffectivePlanForUid(clubUid) → free を再現", byClub.plan === "free", byClub);
  const byUid = await getEffectivePlanForUid(u.uid);
  check("uid ベース → pro", byUid.plan === "pro" && byUid.isPaid === true, byUid);

  const res = await api(u.idToken, `/api/club/player-photos/check?teamId=${u.teamId}&season=2025%2F26`);
  const d = await res.json();
  check("check API: plan=pro", d.plan === "pro", d);
  check("check API: allowed=true（21枚目可）", d.allowed === true, d);
  check("check API: currentCount=20", d.currentCount === 20, d);

  // 保存API（POST）も同じPro判定で 21枚目を通す
  const post = await api(u.idToken, `/api/club/player-photos`, {
    method: "POST",
    body: JSON.stringify({ teamId: u.teamId, season: "2025-26", playerId: "p21", photoUrl: "https://res.cloudinary.com/x/image/upload/v1/new21.jpg" }),
  });
  const pd = await post.json();
  check("POST: Proは21枚目を保存可能", post.status === 200 && pd.ok === true, { status: post.status, pd });

  // 既存画像の変更（replace）も通る
  const rep = await api(u.idToken, `/api/club/player-photos`, {
    method: "POST",
    body: JSON.stringify({ teamId: u.teamId, season: "2025-26", playerId: "p1", photoUrl: "https://res.cloudinary.com/x/image/upload/v1/repl1.jpg", prevPhotoUrl: "https://res.cloudinary.com/x/image/upload/v1/p1.jpg" }),
  });
  const rd = await rep.json();
  check("POST: Proは既存画像の変更可能", rep.status === 200 && rd.ok === true, { status: rep.status, rd });

  // 既存画像の削除も通る（プラン制限なし）
  const del = await api(u.idToken, `/api/club/player-photos`, {
    method: "DELETE",
    body: JSON.stringify({ teamId: u.teamId, playerId: "p2", seasons: ["2025-26"] }),
  });
  const dd = await del.json();
  check("DELETE: Proは既存画像の削除可能", del.status === 200 && dd.ok === true, { status: del.status, dd });
}

// ── B) Free + 非デフォルトCareer（制限維持）────────────────────
console.log("== B: Free on non-default career ==");
{
  const u = await makeUser("free", {
    userDoc: { subscription: { status: "free" } },
    profilePlan: "free",
    careerProfilePlan: "free",
  });
  const res = await api(u.idToken, `/api/club/player-photos/check?teamId=${u.teamId}&season=2025%2F26`);
  const d = await res.json();
  check("check API: plan=free", d.plan === "free", d);
  check("check API: allowed=false（20枚到達）", d.allowed === false, d);
  check("check API: limit=20", d.limit === 20, d);

  const post = await api(u.idToken, `/api/club/player-photos`, {
    method: "POST",
    body: JSON.stringify({ teamId: u.teamId, season: "2025-26", playerId: "p21", photoUrl: "https://res.cloudinary.com/x/image/upload/v1/new21.jpg" }),
  });
  const pd = await post.json();
  check("POST: Freeは21枚目で403ブロック", post.status === 403 && pd.ok === false, { status: post.status, pd });
}

// ── C) 手動付与: users/{uid}.plan='pro' のみ（subscription.status 無し）──
console.log("== C: manual grant via users.plan only ==");
{
  const u = await makeUser("grantU", {
    userDoc: { plan: "pro" },              // subscription.status なし
    profilePlan: "free",
    careerProfilePlan: "free",
  });
  const eff = await getEffectivePlanForUid(u.uid);
  check("getEffectivePlanForUid(uid) → granted(officia)", eff.plan === "officia" && eff.isGranted === true, eff);
  const res = await api(u.idToken, `/api/club/player-photos/check?teamId=${u.teamId}`);
  const d = await res.json();
  check("check API: 手動付与も allowed=true", d.allowed === true && (d.plan === "officia" || d.plan === "pro"), d);
}

// ── D) 手動付与: Career側 club_profiles/{clubUid}.plan='pro' ────
console.log("== D: manual grant on career profile only ==");
{
  const u = await makeUser("grantC", {
    userDoc: { subscription: { status: "free" } },
    profilePlan: "free",
    careerProfilePlan: "pro",              // ownerUid=uid のクエリで検出されるはず
  });
  const eff = await getEffectivePlanForUid(u.uid);
  check("getEffectivePlanForUid(uid) → granted", eff.isGranted === true, eff);
  const res = await api(u.idToken, `/api/club/player-photos/check?teamId=${u.teamId}`);
  const d = await res.json();
  check("check API: Career側付与も allowed=true", d.allowed === true, d);
}

console.log(`\nRESULT: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
