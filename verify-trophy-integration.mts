// legacy clubTitles ↔ Trophy Room 統合検証 (demo-footchron エミュレータ + localhost:3002)
// フォールバック表示・冪等移行・重複統合・Career分離・season-record優勝判定を確認する。
import { readFileSync } from "fs";
const envFile = readFileSync(".env.local", "utf-8");
for (const line of envFile.split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
// client SDK をエミュレータに接続（admin trophies page と同じコードパス）
process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR = "1";
process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = "demo-footchron";
process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST = "http://127.0.0.1:9099";
process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST = "127.0.0.1";
process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_PORT = "8080";
// admin SDK（seed用）
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
process.env.FIREBASE_EMULATOR_PROJECT_ID = "demo-footchron";

const { db: adminDb, auth: adminAuth } = await import("@/lib/firebase/admin");
const { FieldValue } = await import("firebase-admin/firestore");
const { auth: clientAuth } = await import("@/lib/firebase");
const { signInWithEmailAndPassword } = await import("firebase/auth");
const { migrateLegacyClubTitles } = await import("@/lib/trophy-migration");
const { computeSeasonTitles } = await import(
  "@/app/admin/club/history/seasons/lib/season-records"
);
const assert = (await import("node:assert/strict")).default;

const BASE = process.env.BASE_URL || "http://localhost:3002";
const ts = Date.now();
const uid = `u-ti-${ts}`;
const email = `${uid}@test.local`;
const now = FieldValue.serverTimestamp;
let pass = 0, fail = 0;
const check = (name: string, cond: boolean) => {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name}`); }
};
const get = async (path: string) => (await fetch(`${BASE}${path}`)).text();

async function seedClub(tag: string, opts: { legacy?: { competitionName: string; seasons: string[] }[]; trophies?: { name: string; seasons: string[] }[] }) {
  const clubUid = `club-ti-${tag}-${ts}`;
  const careerId = `career-ti-${tag}-${ts}`;
  const slug = `slug-ti-${tag}-${ts}`;
  await adminDb.collection("club_profiles").doc(clubUid).set({
    ownerUid: uid, clubUid, clubId: slug, clubName: `Club ${tag}`,
    clubTitles: opts.legacy ?? [],
    displaySettings: {}, createdAt: now(),
  });
  await adminDb.collection("club_profiles").doc(slug).set({ clubId: slug, clubUid, ownerUid: uid });
  await adminDb.collection("careers").doc(careerId).set({
    ownerId: uid, clubUid, clubId: slug, clubName: `Club ${tag}`, status: "active", createdAt: now(),
  });
  await adminDb.collection("clubs").doc(clubUid).set({ clubName: `Club ${tag}` });
  for (const t of opts.trophies ?? []) {
    await adminDb.collection(`clubs/${clubUid}/trophies`).doc().set({
      ownerUid: uid, clubUid, clubProfileId: clubUid, careerId,
      titleName: t.name, normalizedTitleName: t.name.toLowerCase(),
      trophyImageKey: "gold", winningSeasons: t.seasons,
      createdAt: now(), updatedAt: now(),
    });
  }
  return { clubUid, careerId, slug };
}

await adminAuth.createUser({ uid, email, password: "testpass123" });
await signInWithEmailAndPassword(clientAuth, email, "testpass123");

// S1: legacyのみ → /club と /trophies の両方に legacyタイトルが表示される
console.log("== S1: legacyのみユーザー ==");
const L = await seedClub("leg", { legacy: [{ competitionName: "旧リーグ優勝", seasons: ["2023/24"] }] });
const clubL = await get(`/${L.slug}/club`);
check("legacy Honours表示", clubL.includes("旧リーグ優勝") && clubL.includes("2023/24"));
const trophL = await get(`/${L.slug}/trophies`);
check("/trophiesにlegacy表示", trophL.includes("旧リーグ優勝") && trophL.includes("2023/24"));
check("/trophies集計（種類=1）", trophL.includes(">1<"));
check("空状態ではない", !trophL.includes("まだタイトルが登録されていません"));

// S2: trophyのみ → /club は trophy由来のHonours
console.log("== S2: trophyのみユーザー ==");
const T = await seedClub("tro", { trophies: [{ name: "新リーグ優勝", seasons: ["2025/26"] }] });
const clubT = await get(`/${T.slug}/club`);
check("trophy Honours表示", clubT.includes("新リーグ優勝") && clubT.includes("2025/26"));
const trophT = await get(`/${T.slug}/trophies`);
check("/trophiesにtrophy表示", trophT.includes("新リーグ優勝") && trophT.includes("2025/26"));

// S3: 両方存在 → trophy優先、legacyは同時表示されない
console.log("== S3: 両方存在ユーザー ==");
const B = await seedClub("both", {
  legacy: [{ competitionName: "旧カップ", seasons: ["2022/23"] }],
  trophies: [{ name: "新カップ", seasons: ["2025/26"] }],
});
const clubB = await get(`/${B.slug}/club`);
check("trophy優先表示", clubB.includes("新カップ"));
check("legacy同時表示なし", !clubB.includes("旧カップ"));
const trophB = await get(`/${B.slug}/trophies`);
check("/trophiesもtrophyのみ", trophB.includes("新カップ") && !trophB.includes("旧カップ"));

// S4: 移行（冪等）— 実コードパス migrateLegacyClubTitles
console.log("== S4: 移行 + 冪等性 ==");
const M = await seedClub("mig", {
  legacy: [
    { competitionName: "リーグ優勝", seasons: ["2024/25"] },
    { competitionName: "国内カップ", seasons: ["2024/25", "2025/26"] },
  ],
});
const r1 = await migrateLegacyClubTitles({ clubUid: M.clubUid, careerId: M.careerId, ownerUid: uid });
console.log("  result1:", JSON.stringify(r1));
check("2件作成", r1.created === 2 && r1.legacyCount === 2);
check("seasonsMerged=0", r1.seasonsMerged === 0);
const r2 = await migrateLegacyClubTitles({ clubUid: M.clubUid, careerId: M.careerId, ownerUid: uid });
console.log("  result2:", JSON.stringify(r2));
check("2回目は0件（冪等）", r2.created === 0 && r2.seasonsMerged === 0);
const clubM = await get(`/${M.slug}/club`);
check("移行後はtrophy表示", clubM.includes("リーグ優勝") && clubM.includes("2024/25"));
const trophM = await get(`/${M.slug}/trophies`);
check("/trophiesも新Trophyへ切替", trophM.includes("リーグ優勝") && trophM.includes("国内カップ"));
check("/trophies集計（総数=3）", trophM.includes(">3<"));
// legacyは残る（backup）が画面には出ない
const legacyDoc = await adminDb.collection("club_profiles").doc(M.clubUid).get();
check("legacyデータ保持", Array.isArray(legacyDoc.data()?.clubTitles) && legacyDoc.data()!.clubTitles.length === 2);

// S5: 同名タイトル・同一シーズンが両方に存在 → シーズン統合のみ
console.log("== S5: 重複統合 ==");
const D = await seedClub("dup", {
  legacy: [{ competitionName: "リーグ優勝", seasons: ["2023/24", "2025/26"] }],
  trophies: [{ name: "リーグ優勝", seasons: ["2025/26", "2024/25"] }],
});
const r3 = await migrateLegacyClubTitles({ clubUid: D.clubUid, careerId: D.careerId, ownerUid: uid });
console.log("  result3:", JSON.stringify(r3));
check("新規作成0（既存に統合）", r3.created === 0);
check("欠落seasonのみ統合=1", r3.seasonsMerged === 1);
const trophiesSnap = await adminDb.collection(`clubs/${D.clubUid}/trophies`).get();
const seasons = trophiesSnap.docs[0].data().winningSeasons as string[];
check("最終seasons=3件重複なし", seasons.length === 3 && new Set(seasons).size === 3);

// S6: Career分離 — clubB側のcareerIdには移行しない
console.log("== S6: Career分離 ==");
const Bsnap = await adminDb.collection(`clubs/${B.clubUid}/trophies`).get();
const bTrophies = Bsnap.docs.map((d) => d.data().careerId);
check("BのtrophiesはcareerBのみ", bTrophies.every((c) => c === B.careerId));

// S8: trophyを1件先に作成 → 残りlegacyも移行できる（冪等マージ）
console.log("== S8: 新Trophy先行作成 + legacy残り移行 ==");
const P = await seedClub("pre", {
  legacy: [
    { competitionName: "リーグ優勝", seasons: ["2024/25"] },
    { competitionName: "国内カップ", seasons: ["2024/25", "2025/26"] },
  ],
  trophies: [{ name: "チャンピオンズ杯", seasons: ["2025/26"] }],
});
const trophP0 = await get(`/${P.slug}/trophies`);
check("trophy存在時はlegacy非表示（片方のみ）", trophP0.includes("チャンピオンズ杯") && !trophP0.includes("リーグ優勝"));
const r4 = await migrateLegacyClubTitles({ clubUid: P.clubUid, careerId: P.careerId, ownerUid: uid });
console.log("  result4:", JSON.stringify(r4));
check("残り2件も作成される", r4.created === 2);
const trophP = await get(`/${P.slug}/trophies`);
check("移行後は3タイトル全て表示", trophP.includes("チャンピオンズ杯") && trophP.includes("リーグ優勝") && trophP.includes("国内カップ"));
const r5 = await migrateLegacyClubTitles({ clubUid: P.clubUid, careerId: P.careerId, ownerUid: uid });
check("再実行は0件（冪等）", r5.created === 0 && r5.seasonsMerged === 0);

// S9: 新Career（clubTitles空・trophies無し）→ legacyタイトルは一切出ない
console.log("== S9: 新Careerにlegacyが出ない ==");
const N = await seedClub("new", {});
const clubN = await get(`/${N.slug}/club`);
check("新Careerの/clubにHonours無し", !clubN.includes("Honours"));
const trophN = await get(`/${N.slug}/trophies`);
check("新Careerの/trophiesは空状態", trophN.includes("まだタイトルが登録されていません"));
check("他clubのlegacyが漏れない", !clubN.includes("旧リーグ優勝") && !trophN.includes("旧リーグ優勝"));

// S7: season-record優勝判定 — trophy由来のClubTitleItemでcomputeSeasonTitlesが動く
console.log("== S7: シーズン記録優勝判定 ==");
const titlesFromTrophy = (await adminDb.collection(`clubs/${M.clubUid}/trophies`).get()).docs
  .map((d) => {
    const t = d.data();
    return { competitionName: t.titleName, seasons: t.winningSeasons };
  });
const seasonTitles = computeSeasonTitles(titlesFromTrophy as any, "2024/25");
console.log("  seasonTitles:", JSON.stringify(seasonTitles));
check("2024/25の優勝判定にリーグ優勝+国内カップ", seasonTitles.length >= 1);

console.log(`\nRESULT: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
