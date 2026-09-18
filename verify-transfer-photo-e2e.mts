// 実画面検証: 移籍エントリ個別削除 + 選手画像 変更/削除 (demo-footchron エミュレータ + localhost:3002)
import { chromium, type Page } from "playwright";
import { db, auth, admin } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import assert from "node:assert/strict";

const BASE_URL = process.env.BASE_URL || "http://localhost:3002";
const PASSWORD = "testpass123";
const ts = Date.now();
const ownerUid = `u-e2e-tp-${ts}`;
const ownerEmail = `${ownerUid}@test.local`;
const clubUid = `club-tp-${ts}`;
const careerId = `career-tp-${ts}`;
const teamId = `team-tp-${ts}`;
const slug = `club-tp-${ts}`;
const clubUidB = `club-tpb-${ts}`; // Career B (分離確認用)
const careerIdB = `career-tpb-${ts}`;
const teamIdB = `team-tpb-${ts}`;
const SEASON_DASH = "2025-26";
const SEASON_SLASH = "2025/26";
const CLOUD = "dkjcpkfi1";
const OLD_PUBLIC_ID = `footchron/player-photos/${clubUid}/${teamId}/p-photo-${ts}-old`;
const OLD_URL = `https://res.cloudinary.com/${CLOUD}/image/upload/v1/${OLD_PUBLIC_ID}.png`;
const B_URL = `https://res.cloudinary.com/${CLOUD}/image/upload/v1/footchron/player-photos/${clubUidB}/b-keep-${ts}.png`;
const now = FieldValue.serverTimestamp;
const SCREEN_DIR = join(process.cwd(), "screenshots");
if (!existsSync(SCREEN_DIR)) mkdirSync(SCREEN_DIR, { recursive: true });
const shot = async (p: Page, name: string) => p.screenshot({ path: join(SCREEN_DIR, name), fullPage: false });

// 1x1 透明PNG
const PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const PNG_PATH = join(process.cwd(), `e2e-photo-${ts}.png`);
writeFileSync(PNG_PATH, Buffer.from(PNG_B64, "base64"));

async function seed() {
  await auth.createUser({ uid: ownerUid, email: ownerEmail, password: PASSWORD });
  await db.collection("users").doc(ownerUid).set({
    email: ownerEmail, activeCareerId: careerId,
    subscription: { status: "pro" }, plan: "pro",
    createdAt: now(), updatedAt: now(),
  });
  await db.collection("careers").doc(careerId).set({
    ownerId: ownerUid, clubUid, name: "Career T", clubName: "TP Club",
    clubId: slug, status: "active", isPublic: true, createdAt: now(), updatedAt: now(),
  });
  await db.collection("club_profiles").doc(clubUid).set({
    ownerUid, clubUid, clubId: slug, slug,
    clubName: "TP Club", logoUrl: null, mainTeamId: teamId,
    gameTeamUsage: true, createdAt: now(), updatedAt: now(),
  });
  await db.collection("club_profiles").doc(slug).set({
    ownerUid, clubUid, clubId: slug, slug, createdAt: now(), updatedAt: now(),
  });
  await db.collection(`clubs/${clubUid}/teams`).doc(teamId).set({
    name: "TP FC", isMain: true, clubUid, createdAt: now(), updatedAt: now(),
  });
  await db.collection(`clubs/${clubUid}/seasons`).doc(SEASON_DASH).set({ name: SEASON_SLASH, isPublic: true, createdAt: now() });

  const p1 = `p-photo-${ts}`;
  const p2 = `p-two-${ts}`;
  const p3 = `p-three-${ts}`;
  const base = { teamId, seasons: [SEASON_SLASH], position: "FW", createdAt: now(), updatedAt: now() };
  await db.collection(`clubs/${clubUid}/teams/${teamId}/players`).doc(p1).set({
    ...base, name: "Photo Player", number: 9,
    photoUrl: OLD_URL,
    seasonData: { [SEASON_DASH]: { number: 9, position: "FW", photoUrl: OLD_URL } },
  });
  await db.collection(`clubs/${clubUid}/teams/${teamId}/players`).doc(p2).set({ ...base, name: "Taro Move", number: 10 });
  await db.collection(`clubs/${clubUid}/teams/${teamId}/players`).doc(p3).set({ ...base, name: "Jiro Move", number: 11 });
  await db.collection(`clubs/${clubUid}/seasons/${SEASON_DASH}/roster`).doc(p1).set({
    name: "Photo Player", teamId, number: 9, position: "FW",
    photoUrl: OLD_URL,
    seasonData: { [SEASON_DASH]: { number: 9, position: "FW", photoUrl: OLD_URL } },
    seasons: [SEASON_SLASH], createdAt: now(), updatedAt: now(),
  });
  await db.collection(`clubs/${clubUid}/seasons/${SEASON_DASH}/roster`).doc(p2).set({ name: "Taro Move", teamId, number: 10, position: "FW", seasons: [SEASON_SLASH], createdAt: now() });
  await db.collection(`clubs/${clubUid}/seasons/${SEASON_DASH}/roster`).doc(p3).set({ name: "Jiro Move", teamId, number: 11, position: "FW", seasons: [SEASON_SLASH], createdAt: now() });

  const t1 = `t-one-${ts}`;
  const t2 = `t-two-${ts}`;
  const transfers = db.collection(`clubs/${clubUid}/teams/${teamId}/transfers`);
  await transfers.doc(t1).set({
    season: SEASON_SLASH, direction: "in", kind: "完全", playerName: "Taro Move",
    playerId: p2, counterparty: "FC Alpha", ownerUid: clubUid, clubProfileId: clubUid,
    createdAt: now(), updatedAt: now(),
  });
  await transfers.doc(t2).set({
    season: SEASON_SLASH, direction: "in", kind: "レンタル", playerName: "Jiro Move",
    playerId: p3, counterparty: "FC Beta", ownerUid: clubUid, clubProfileId: clubUid,
    createdAt: now(), updatedAt: now(),
  });

  // Career B（分離確認・触れられないはず）
  await db.collection("careers").doc(careerIdB).set({
    ownerId: ownerUid, clubUid: clubUidB, name: "Career B", clubName: "TP B Club",
    clubId: `b-${slug}`, status: "deleted", createdAt: now(), updatedAt: now(),
  });
  await db.collection(`clubs/${clubUidB}/teams`).doc(teamIdB).set({ name: "TP B FC", clubUid: clubUidB, createdAt: now() });
  await db.collection(`clubs/${clubUidB}/teams/${teamIdB}/players`).doc(`pb-${ts}`).set({
    name: "B Player", seasons: [SEASON_SLASH], photoUrl: B_URL, createdAt: now(),
  });
  await db.collection(`clubs/${clubUidB}/teams/${teamIdB}/transfers`).doc(`tb-${ts}`).set({
    season: SEASON_SLASH, direction: "in", playerName: "B Move", counterparty: "FC B", createdAt: now(),
  });

  return { p1, p2, t1, t2 };
}

async function main() {
  const { p1, p2, t1, t2 } = await seed();
  console.log("[seed] done", { clubUid, teamId, p1, t1, t2 });

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.on("dialog", (d) => void d.accept()); // window.confirm → OK
  page.on("pageerror", (e) => console.log("[pageerror]", e.message));
  page.on("response", (r) => { if (r.status() >= 400) console.log(`[http ${r.status()}]`, r.url()); });

  // login
  await page.goto(`${BASE_URL}/admin/test-login?email=${encodeURIComponent(ownerEmail)}&plan=pro&password=${PASSWORD}`);
  await page.getByText("Pro テストユーザー").first().click();
  await page.waitForURL(/\/admin/, { timeout: 30000 });
  console.log("[ui] logged in");

  // ===== 1. 移籍エントリ個別削除 =====
  await page.goto(`${BASE_URL}/admin/teams/${teamId}/transfers?season=${encodeURIComponent(SEASON_SLASH)}`);
  await page.getByText("Taro Move").waitFor({ timeout: 20000 });
  await page.getByText("Jiro Move").waitFor({ timeout: 5000 });
  console.log("[ui] transfers: 2件表示を確認");
  await shot(page, "tp-01-transfers.png");

  await page.getByLabel("Taro Moveを移籍記録から削除").click();
  await page.getByText("本当に削除しますか？").waitFor({ timeout: 5000 });
  await shot(page, "tp-02-confirm.png");
  await page.getByRole("button", { name: "削除" }).click();
  await page.waitForTimeout(1500);
  assert(await page.getByText("Taro Move").count() === 0, "Taro Move が一覧から消えること");
  assert(await page.getByText("Jiro Move").isVisible(), "Jiro Move が残ること");
  console.log("[ui] 削除後: Taro 消失 / Jiro 残存");

  await page.reload();
  await page.getByText("Jiro Move").waitFor({ timeout: 15000 });
  assert(await page.getByText("Taro Move").count() === 0, "リロード後も Taro Move が消えていること");
  console.log("[ui] リロード後も削除状態を維持");

  // Firestore 検証
  const t1Snap = await db.doc(`clubs/${clubUid}/teams/${teamId}/transfers/${t1}`).get();
  const t2Snap = await db.doc(`clubs/${clubUid}/teams/${teamId}/transfers/${t2}`).get();
  assert(!t1Snap.exists, "削除対象の transfer doc が Firestore から消えていること");
  assert(t2Snap.exists, "他の transfer doc が残っていること");
  const p2Snap = await db.doc(`clubs/${clubUid}/teams/${teamId}/players/${p2}`).get();
  assert(p2Snap.exists, "選手マスターが残っていること");
  const bTransfer = await db.doc(`clubs/${clubUidB}/teams/${teamIdB}/transfers/tb-${ts}`).get();
  assert(bTransfer.exists, "Career B の移籍記録が無影響であること");
  console.log("[fs] 移籍削除: t1削除 / t2・選手マスター・Career B 残存 OK");

  // ===== 2. 画像変更（実アップロード → attach API → 全フィールド新URL） =====
  await page.goto(`${BASE_URL}/admin/teams/${teamId}?season=${encodeURIComponent(SEASON_SLASH)}`);
  await page.locator("tbody").getByText("Photo Player").first().waitFor({ timeout: 20000 });
  await shot(page, "tp-03-players.png");

  const openEdit = async () => {
    // onSnapshot の再描画でドロップダウンがデタッチすることがあるためリトライ
    for (let i = 0; i < 5; i++) {
      try {
        const row = page.locator("tbody tr", { hasText: "Photo Player" }).first();
        await row.getByRole("button", { name: "Open menu" }).click({ timeout: 5000 });
        await page.getByRole("menuitem", { name: "編集" }).click({ timeout: 5000 });
        await page.waitForTimeout(1200);
        return;
      } catch (e) {
        if (i === 4) throw e;
        await page.waitForTimeout(800);
      }
    }
  };

  await openEdit();
  await shot(page, "tp-04-edit.png");
  const fileInput = page.locator('[role="dialog"] input[type="file"]').first();
  await fileInput.setInputFiles(PNG_PATH);
  await page.getByText("画像をアップロードしました").waitFor({ timeout: 30000 });
  console.log("[ui] 新画像アップロード完了");
  await page.getByRole("button", { name: "保存する" }).click();
  await page.waitForTimeout(5000);

  const p1AfterChange = (await db.doc(`clubs/${clubUid}/teams/${teamId}/players/${p1}`).get()).data() as any;
  const newUrl = String(p1AfterChange?.photoUrl || "");
  assert(newUrl.startsWith(`https://res.cloudinary.com/${CLOUD}/`), "変更後の photoUrl が Cloudinary URL であること");
  assert(newUrl !== OLD_URL, "変更後の photoUrl が新URLであること");
  assert(newUrl.includes(clubUid), "新URLのパスに clubUid が含まれること（Career分離・一意パス）");
  assert.equal(p1AfterChange?.seasonData?.[SEASON_DASH]?.photoUrl, newUrl, "player.seasonData も新URL");
  const rosterAfterChange = (await db.doc(`clubs/${clubUid}/seasons/${SEASON_DASH}/roster/${p1}`).get()).data() as any;
  assert.equal(rosterAfterChange?.photoUrl, newUrl, "roster.photoUrl も新URL");
  assert.equal(rosterAfterChange?.seasonData?.[SEASON_DASH]?.photoUrl, newUrl, "roster.seasonData も新URL");
  console.log("[fs] 画像変更: player/seasonData/roster 全て新URL =", newUrl.slice(-70));

  // 公開SQUAD
  await page.goto(`${BASE_URL}/${slug}/players`);
  await page.waitForTimeout(4000);
  const pubImg = page.locator('img[alt="Photo Player"]').first();
  const pubImgCount = await page.locator('img[alt="Photo Player"]').count();
  const pubSrc = pubImgCount > 0 ? (await pubImg.getAttribute("src")) ?? "" : "";
  const expectedPart = newUrl.split("/image/upload/")[1]?.replace(/^v\d+\//, "").replace(/\.[a-z]+$/i, "") ?? "___none___";
  console.log("[ui] public SQUAD img[alt=Photo Player]:", pubImgCount, "src match:", pubSrc.includes(expectedPart) || pubSrc.includes(encodeURIComponent(expectedPart).slice(0, 40)));
  console.log("[ui] public img src:", pubSrc.slice(0, 140));

  // ===== 3. 画像削除（DELETE API → Firestore全クリア + Cloudinary実削除） =====
  await page.goto(`${BASE_URL}/admin/teams/${teamId}?season=${encodeURIComponent(SEASON_SLASH)}`);
  await page.locator("tbody").getByText("Photo Player").first().waitFor({ timeout: 20000 });
  await openEdit();
  await page.locator('[role="dialog"]').getByText("削除", { exact: true }).first().click(); // uploader の削除ボタン（confirm自動OK）
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: "保存する" }).click();
  await page.waitForTimeout(5000);

  const p1AfterDelete = (await db.doc(`clubs/${clubUid}/teams/${teamId}/players/${p1}`).get()).data() as any;
  assert(!p1AfterDelete?.photoUrl, "player.photoUrl が削除されていること");
  assert(!p1AfterDelete?.seasonData?.[SEASON_DASH]?.photoUrl, "player.seasonData.photoUrl が削除されていること");
  const rosterAfterDelete = (await db.doc(`clubs/${clubUid}/seasons/${SEASON_DASH}/roster/${p1}`).get()).data() as any;
  assert(!rosterAfterDelete?.photoUrl, "roster.photoUrl が削除されていること");
  assert(!rosterAfterDelete?.seasonData?.[SEASON_DASH]?.photoUrl, "roster.seasonData.photoUrl が削除されていること");
  console.log("[fs] 画像削除: player/seasonData/roster 全てクリア");

  // Cloudinary 側も消えているか
  try {
    const imgRes = await fetch(newUrl);
    console.log("[cloudinary] deleted image fetch status:", imgRes.status, "(404 期待)");
  } catch (e) {
    console.log("[cloudinary] fetch error:", (e as Error).message);
  }

  // Career B の画像が無影響
  const bPlayer = (await db.doc(`clubs/${clubUidB}/teams/${teamIdB}/players/pb-${ts}`).get()).data() as any;
  assert.equal(bPlayer?.photoUrl, B_URL, "Career B の画像が無影響であること");
  console.log("[fs] Career B 画像無影響 OK");

  // 公開SQUADで既定アイコン（img[alt]なし）
  await page.goto(`${BASE_URL}/${slug}/players`);
  await page.waitForTimeout(4000);
  const pubImgAfterDelete = await page.locator('img[alt="Photo Player"]').count();
  console.log("[ui] public SQUAD img[alt=Photo Player] after delete:", pubImgAfterDelete, "(0 期待)");
  await shot(page, "tp-05-public-after-delete.png");

  // 管理一覧（モバイルカードDOM）で既定アイコン
  await page.goto(`${BASE_URL}/admin/teams/${teamId}?season=${encodeURIComponent(SEASON_SLASH)}`);
  await page.locator("tbody").getByText("Photo Player").first().waitFor({ timeout: 15000 });
  const cardPhoto = await page.locator('div.flex.items-center.gap-3.rounded-xl.border', { hasText: "Photo Player" }).locator("img").count();
  console.log("[ui] admin card img count:", cardPhoto, "(0 期待=既定アイコン)");

  await browser.close();
  console.log("\n=== ALL CHECKS DONE ===");
}

main().catch((e) => {
  console.error("[e2e] FAILED:", e);
  process.exit(1);
});
