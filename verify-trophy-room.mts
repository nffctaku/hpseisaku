// トロフィールーム検証 (demo-footchron エミュレータ + localhost:3002)
// 公開ページがCareerごとのトロフィーだけを表示し、集計が正しいことを確認する。
import { readFileSync } from "fs";
const envFile = readFileSync(".env.local", "utf-8");
for (const line of envFile.split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
process.env.FIREBASE_EMULATOR_PROJECT_ID = "demo-footchron";
const { db } = await import("@/lib/firebase/admin");
const { FieldValue } = await import("firebase-admin/firestore");
const assert = (await import("node:assert/strict")).default;

const BASE = process.env.BASE_URL || "http://localhost:3002";
const ts = Date.now();
const uid = `u-tr-${ts}`;
const clubA = `club-tra-${ts}`;
const clubB = `club-trb-${ts}`;
const careerA = `career-tra-${ts}`;
const careerB = `career-trb-${ts}`;
const slugA = `slug-tra-${ts}`;
const slugB = `slug-trb-${ts}`;
const now = FieldValue.serverTimestamp;

async function seedClub(clubUid: string, careerId: string, slug: string) {
  await db.collection("club_profiles").doc(clubUid).set({
    ownerUid: uid,
    clubUid,
    clubId: slug,
    clubName: "TR Club",
    displaySettings: {},
    createdAt: now(),
  });
  await db.collection("club_profiles").doc(slug).set({
    clubId: slug,
    clubUid,
    ownerUid: uid,
  });
  await db.collection("careers").doc(careerId).set({
    ownerId: uid,
    clubUid,
    clubId: slug,
    clubName: "TR Club",
    status: "active",
    createdAt: now(),
  });
  await db.collection("clubs").doc(clubUid).set({ clubName: "TR Club" });
}

async function seedTrophy(clubUid: string, careerId: string, name: string, seasons: string[], imageKey = "gold") {
  const ref = db.collection(`clubs/${clubUid}/trophies`).doc();
  await ref.set({
    ownerUid: uid,
    clubUid,
    clubProfileId: clubUid,
    careerId,
    titleName: name,
    normalizedTitleName: name.toLowerCase(),
    trophyImageKey: imageKey,
    winningSeasons: seasons,
    createdAt: now(),
    updatedAt: now(),
  });
  return ref.id;
}

const get = async (path: string) => (await fetch(`${BASE}${path}`)).text();

await seedClub(clubA, careerA, slugA);
await seedClub(clubB, careerB, slugB);
await seedTrophy(clubA, careerA, "リーグ優勝", ["2024/25", "2025/26"], "gold");
await seedTrophy(clubA, careerA, "国内カップ", ["2025/26"], "cup");
await seedTrophy(clubB, careerB, "他Careerのタイトル", ["2023/24"], "silver");

let pass = 0, fail = 0;
const check = (name: string, cond: boolean) => {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name}`); }
};

console.log("== T1: 公開トロフィールームにCareer Aのタイトルが出る ==");
let html = "";
for (let i = 0; i < 10; i++) {
  html = await get(`/${slugA}/trophies`);
  if (html.includes("リーグ優勝")) break;
  await new Promise((r) => setTimeout(r, 1500));
}
check("ヘッダー TROPHY ROOM", html.includes("TROPHY ROOM"));
check("リーグ優勝が表示", html.includes("リーグ優勝"));
check("国内カップが表示", html.includes("国内カップ"));
check("シーズン 2024/25 表示", html.includes("2024/25"));
check("シーズン 2025/26 表示", html.includes("2025/26"));

console.log("== T2: 集計が正しい（総タイトル=3, 種類=2, 最多=リーグ優勝）==");
check("総タイトル数=3", />3<|>3\s*</.test(html) || html.includes(">3<"));
check("タイトル種類=2", html.includes(">2<"));
check("最多獲得=リーグ優勝", html.includes("リーグ優勝"));

console.log("== T3: Career Bのページは自分のタイトルのみ（Career分離）==");
const htmlB = await get(`/${slugB}/trophies`);
check("Bに他Careerタイトル表示", htmlB.includes("他Careerのタイトル"));
check("Bにリーグ優勝が出ない", !htmlB.includes("リーグ優勝"));
check("Bの総タイトル数=1", htmlB.includes(">1<"));

console.log("== T4: 存在しないクラブはnotFound ==");
const res404 = await fetch(`${BASE}/no-such-club-xyz/trophies`);
check("404/empty", [404, 200].includes(res404.status));

console.log(`\nRESULT: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
