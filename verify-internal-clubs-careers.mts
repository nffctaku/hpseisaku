// /admin/internal-clubs 複数Career対応 集計検証 (demo-footchron エミュレータ + dev server)
// シナリオ: 単一Career Free / 複数Career paid Pro / 複数Career granted Pro /
//   Career側profile plan:'free'+UID側 paid Pro / 共有clubUid / creating Career /
//   複数Career利用合算 / 未マッピングprofile / Auth不在owner profile
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
const { Timestamp } = await import("firebase-admin/firestore");
const { auth: clientAuth } = await import("@/lib/firebase");
const { signInWithEmailAndPassword } = await import("firebase/auth");

const BASE = process.env.BASE_URL || "http://localhost:3002";
const ADMIN_UID = "uGZypGTf0mSh5JHqy3XlErH60CZ2";
const ts = Date.now();
let pass = 0, fail = 0;
const check = (name: string, cond: boolean, extra?: unknown) => {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name}`, extra !== undefined ? JSON.stringify(extra) : ""); }
};

// ---- admin token ----
try {
  await adminAuth.getUser(ADMIN_UID);
} catch {
  await adminAuth.createUser({ uid: ADMIN_UID, email: "ic-admin@test.local", password: "testpass123" });
}
try {
  await signInWithEmailAndPassword(clientAuth, "ic-admin@test.local", "testpass123");
} catch {
  await adminAuth.updateUser(ADMIN_UID, { password: "testpass123" });
  await signInWithEmailAndPassword(clientAuth, "ic-admin@test.local", "testpass123");
}
const token = await clientAuth.currentUser!.getIdToken();
const api = async (path: string) => {
  const r = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`${path} -> ${r.status}`);
  return r.json();
};

console.log("== baseline ==");
const before = await api("/api/admin/clubs");
const funnelBefore = await api("/api/admin/activation-funnel?cohort=all&full=1");

// ---- シード ----
const mkUser = async (uid: string, extra: Record<string, unknown> = {}) => {
  await adminAuth.createUser({ uid, email: `${uid}@test.local`, password: "testpass123" });
  await adminDb.collection("users").doc(uid).set({ email: `${uid}@test.local`, ...extra });
};
const mkCareer = async (id: string, ownerId: string, clubUid: string, extra: Record<string, unknown> = {}) => {
  await adminDb.collection("careers").doc(id).set({
    ownerId, clubUid, name: `Career ${id}`, clubName: `Club ${id}`,
    status: "active", isPublic: true, createdAt: Timestamp.now(), updatedAt: Timestamp.now(), ...extra,
  });
};
const mkProfile = async (id: string, ownerUid: string, extra: Record<string, unknown> = {}) => {
  await adminDb.collection("club_profiles").doc(id).set({
    ownerUid, clubName: `Club ${id}`, plan: "free", createdAt: Timestamp.now(), ...extra,
  });
};
const mkTeam = async (clubUid: string, teamId: string, extra: Record<string, unknown> = {}) => {
  await adminDb.doc(`clubs/${clubUid}/teams/${teamId}`).set({ name: `T ${teamId}`, createdAt: Timestamp.now(), ...extra });
};
const mkPlayer = async (clubUid: string, teamId: string, playerId: string, withImage = false) => {
  await adminDb.doc(`clubs/${clubUid}/teams/${teamId}/players/${playerId}`).set({
    name: `P ${playerId}`, createdAt: Timestamp.now(),
    ...(withImage ? { photoUrl: "https://img.example/p.png" } : {}),
  });
};
const mkMatch = async (clubUid: string, matchId: string) => {
  await adminDb.doc(`clubs/${clubUid}/matches/${matchId}`).set({
    homeTeam: "H", awayTeam: "A", matchDate: "2025-01-01", createdAt: Timestamp.now(),
  });
};

// A: 単一Career Free
const ua = `ua-${ts}`, caUid = `clubA-${ts}`;
await mkUser(ua, { activeCareerId: `ca-${ts}` });
await mkCareer(`ca-${ts}`, ua, caUid);
await mkProfile(ua, ua);
await mkProfile(caUid, ua, { clubUid: caUid });

// B: 複数Career paid Pro（Career側profileはfree）
const ub = `ub-${ts}`, cb1Uid = `clubB1-${ts}`, cb2Uid = `clubB2-${ts}`;
await mkUser(ub, { activeCareerId: `cb1-${ts}`, subscription: { status: "pro", startedAt: Timestamp.now() } });
await mkCareer(`cb1-${ts}`, ub, cb1Uid);
await mkCareer(`cb2-${ts}`, ub, cb2Uid);
await mkProfile(ub, ub, { plan: "pro", stripeCustomerId: `cus_b_${ts}` });
await mkProfile(cb1Uid, ub, { clubUid: cb1Uid });
await mkProfile(cb2Uid, ub, { clubUid: cb2Uid });

// C: 複数Career granted Pro（users.plan='pro' のみ、課金連携なし）
const uc = `uc-${ts}`, cc1Uid = `clubC1-${ts}`, cc2Uid = `clubC2-${ts}`;
await mkUser(uc, { activeCareerId: `cc1-${ts}`, plan: "pro" });
await mkCareer(`cc1-${ts}`, uc, cc1Uid);
await mkCareer(`cc2-${ts}`, uc, cc2Uid);
await mkProfile(uc, uc);
await mkProfile(cc1Uid, uc, { clubUid: cc1Uid });
await mkProfile(cc2Uid, uc, { clubUid: cc2Uid });

// E: 2つの旧Careerが同じclubUidを共有 + データあり
const ue = `ue-${ts}`, ceUid = `clubE-${ts}`;
await mkUser(ue, { activeCareerId: `ce1-${ts}` });
await mkCareer(`ce1-${ts}`, ue, ceUid);
await mkCareer(`ce2-${ts}`, ue, ceUid);
await mkProfile(ue, ue);
await mkProfile(ceUid, ue, { clubUid: ceUid });
await mkTeam(ceUid, `te-${ts}`);
await mkPlayer(ceUid, `te-${ts}`, `pe1-${ts}`, true);
await mkPlayer(ceUid, `te-${ts}`, `pe2-${ts}`, false);
await mkMatch(ceUid, `me1-${ts}`);
await mkMatch(ceUid, `me2-${ts}`);
await mkMatch(ceUid, `me3-${ts}`);

// F: status:'creating' のCareer（データがあっても通常指標から除外）
const uf = `uf-${ts}`, cf1Uid = `clubF1-${ts}`, cf2Uid = `clubF2-${ts}`;
await mkUser(uf, { activeCareerId: `cf1-${ts}` });
await mkCareer(`cf1-${ts}`, uf, cf1Uid);
await mkCareer(`cf2-${ts}`, uf, cf2Uid, { status: "creating" });
await mkProfile(uf, uf);
await mkProfile(cf1Uid, uf, { clubUid: cf1Uid });
await mkProfile(cf2Uid, uf, { clubUid: cf2Uid });
await mkMatch(cf2Uid, `mf1-${ts}`); // creating側データ

// G: 複数Careerで試合・画像を登録
const ug = `ug-${ts}`, cg1Uid = `clubG1-${ts}`, cg2Uid = `clubG2-${ts}`;
await mkUser(ug, { activeCareerId: `cg1-${ts}` });
await mkCareer(`cg1-${ts}`, ug, cg1Uid);
await mkCareer(`cg2-${ts}`, ug, cg2Uid);
await mkProfile(ug, ug);
await mkProfile(cg1Uid, ug, { clubUid: cg1Uid });
await mkProfile(cg2Uid, ug, { clubUid: cg2Uid });
await mkTeam(cg1Uid, `tg1-${ts}`);
await mkPlayer(cg1Uid, `tg1-${ts}`, `pg1-${ts}`, true);
await mkPlayer(cg1Uid, `tg1-${ts}`, `pg2-${ts}`, true);
await mkMatch(cg1Uid, `mg1-${ts}`);
await mkMatch(cg1Uid, `mg2-${ts}`);
await mkMatch(cg1Uid, `mg3-${ts}`);
await mkTeam(cg2Uid, `tg2-${ts}`);
await mkPlayer(cg2Uid, `tg2-${ts}`, `pg3-${ts}`, true);
for (let i = 1; i <= 5; i++) await mkMatch(cg2Uid, `mg2x${i}-${ts}`);

// H: Careerと対応付けられない旧profile（unmatched）
const uh = `uh-${ts}`, chUid = `clubH-${ts}`;
await mkUser(uh, { activeCareerId: `ch-${ts}` });
await mkCareer(`ch-${ts}`, uh, chUid);
await mkProfile(uh, uh);
await mkProfile(chUid, uh, { clubUid: chUid });
await mkProfile(`legacy-${ts}`, uh); // clubUidなし・id不一致 → 要確認

// I: Authに存在しないownerUidを持つprofile
const ghost = `ghost-${ts}`;
await mkProfile(ghost, ghost); // auth userなし・users docなし

// funnel検証用: userId=clubUid の過去形式イベント
await adminDb.collection("analyticsEvents").add({
  userId: cg1Uid, eventName: "plan_limit_reached",
  properties: { limitType: "player_photo" }, createdAt: Timestamp.now(),
});
await adminDb.collection("analyticsEvents").add({
  userId: `unmapped-${ts}`, eventName: "plan_limit_reached",
  properties: { limitType: "player_photo" }, createdAt: Timestamp.now(),
});

// ---- 検証 ----
console.log("== after seed ==");
const after = await api("/api/admin/clubs");
const funnelAfter = await api("/api/admin/activation-funnel?cohort=all&full=1");
const s0 = before.summary, s1 = after.summary;
const diag = after.profileDiagnostics;
const row = (uid: string) => after.clubs.find((c: { ownerUid: string }) => c.ownerUid === uid);

console.log("== summary deltas ==");
check("総ユーザー +7（Auth UID単位）", s1.total - s0.total === 7, { d: s1.total - s0.total });
check("有効Career +11（creating除外）", s1.totalCareers - s0.totalCareers === 11, { d: s1.totalCareers - s0.totalCareers });
check("creating Career +1", s1.creatingCareers - s0.creatingCareers === 1);
check("複数Careerユーザー +4", s1.multiCareerUsers - s0.multiCareerUsers === 4, { d: s1.multiCareerUsers - s0.multiCareerUsers });
check("club_profiles +20（profile単位）", s1.clubProfilesTotal - s0.clubProfilesTotal === 20, { d: s1.clubProfilesTotal - s0.clubProfilesTotal });
check("Paid Pro +1", s1.paidPro - s0.paidPro === 1);
check("Granted Pro +1", s1.grantedPro - s0.grantedPro === 1);

console.log("== per-user rows ==");
{
  const r = row(ua);
  check("A: 行存在＋careerCount=1", !!r && r.careerCount === 1);
  check("A: Free判定", r && r.isFree === true && r.plan === "free");
  check("A: profileCount=2", r && r.profileCount === 2);
}
{
  const r = row(ub);
  check("B: Paid Pro（Career側free profileに引きずられない）", r && r.isPaidPro === true && r.plan === "pro", r && { plan: r.plan });
  check("B: careerCount=2 / profileCount=3", r && r.careerCount === 2 && r.profileCount === 3);
  check("B: careers[]にclubUid両方", r && r.careers.some((c: { clubUid: string }) => c.clubUid === cb1Uid) && r.careers.some((c: { clubUid: string }) => c.clubUid === cb2Uid));
  check("B: activeCareer検出", r && r.careers.find((c: { careerId: string }) => c.careerId === `cb1-${ts}`)?.isActive === true);
}
{
  const r = row(uc);
  check("C: Granted Pro（users.plan由来）", r && r.isGrantedPro === true && r.plan === "officia");
  check("C: careerCount=2", r && r.careerCount === 2);
}
{
  const r = row(ue);
  check("E: 共有rootでmatch二重計上なし（3）", r && r.matchCount === 3, r && r.matchCount);
  check("E: playerCount=2（二重計上なし）", r && r.playerCount === 2);
  check("E: sharedDataRoots=2 / dataRootCount=1", r && r.sharedDataRoots === 2 && r.dataRootCount === 1);
  check("E: 両careerがsharedDataRoot", r && r.careers.every((c: { sharedDataRoot: boolean }) => c.sharedDataRoot === true));
}
{
  const r = row(uf);
  check("F: careerCount=1（creating除外）", r && r.careerCount === 1 && r.creatingCareerCount === 1);
  check("F: creating側matchは合計に入らない（0）", r && r.matchCount === 0, r && r.matchCount);
  check("F: creating careerは一覧にisCreating=true", r && r.careers.find((c: { careerId: string }) => c.careerId === `cf2-${ts}`)?.isCreating === true);
}
{
  const r = row(ug);
  check("G: matchCount=8（Career合算）", r && r.matchCount === 8, r && r.matchCount);
  check("G: playerCount=3 / playerImageCount=3", r && r.playerCount === 3 && r.playerImageCount === 3);
  check("G: career別 matchCount 3+5", r && r.careers.find((c: { clubUid: string }) => c.clubUid === cg1Uid)?.matchCount === 3 && r.careers.find((c: { clubUid: string }) => c.clubUid === cg2Uid)?.matchCount === 5);
}
{
  const r = row(uh);
  check("H: unmatchedProfileCount=1", r && r.unmatchedProfileCount === 1);
  check("H: profileCount=3（正常2＋要確認1）", r && r.profileCount === 3);
}
{
  const r = row(ghost);
  check("I: Auth不在ownerも行に出る（authExists=false）", r && r.authExists === false);
}

console.log("== profile diagnostics ==");
check("unmatchedProfiles +1", diag.unmatchedProfiles - (before.profileDiagnostics?.unmatchedProfiles ?? 0) === 1, diag.unmatchedProfiles);
check("unmatchedProfileIdsに legacy doc", diag.unmatchedProfileIds.includes(`legacy-${ts}`));
check("authlessProfiles +1", diag.authlessProfiles - (before.profileDiagnostics?.authlessProfiles ?? 0) === 1, diag.authlessProfiles);
check("authlessOwnerUidsに ghost", diag.authlessOwnerUids.includes(ghost));
check("careerMatchedProfiles +11", diag.careerMatchedProfiles - (before.profileDiagnostics?.careerMatchedProfiles ?? 0) === 11, diag.careerMatchedProfiles);
check("ownerDocProfiles +7", diag.ownerDocProfiles - (before.profileDiagnostics?.ownerDocProfiles ?? 0) === 7, diag.ownerDocProfiles);

console.log("== funnel (clubUid→uid 解決) ==");
{
  const mf0 = funnelBefore.monetizationFunnel, mf1 = funnelAfter.monetizationFunnel;
  check("plan_limit_reached 30日 +1（clubUidイベントをuid解決）",
    (mf1?.last30?.plan_limit_reached ?? 0) - (mf0?.last30?.plan_limit_reached ?? 0) === 1,
    { b: mf0?.last30?.plan_limit_reached, a: mf1?.last30?.plan_limit_reached });
  check("remappedClubUidEvents +1", (mf1?.remappedClubUidEvents ?? 0) - (mf0?.remappedClubUidEvents ?? 0) === 1);
  check("unmappedUserIdsに unmapped id", mf1?.unmappedUserIds?.includes(`unmapped-${ts}`) === true);
}

console.log(`\n=== ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail === 0 ? 0 : 1);
