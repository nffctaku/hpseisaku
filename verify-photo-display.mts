// 既存選手の画像表示検証: 編集ダイアログ・管理一覧・公開SQUAD
// 画像URLの配置パターン別に選手をseedして表示を確認（localhost:3002 エミュレータ）
import { chromium, type Page } from "playwright";
import { db, auth } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import { existsSync, mkdirSync } from "fs";
import { join } from "path";

const BASE_URL = process.env.BASE_URL || "http://localhost:3002";
const PASSWORD = "testpass123";
const ts = Date.now();
const ownerUid = `u-e2e-pd-${ts}`;
const ownerEmail = `${ownerUid}@test.local`;
const clubUid = `club-pd-${ts}`;
const careerId = `career-pd-${ts}`;
const teamId = `team-pd-${ts}`;
const slug = `club-pd-${ts}`;
const S1 = "2025/26";
const S1D = "2025-26";
const S0D = "2024-25";
const CLOUD = "dkjcpkfi1";
const url = (name: string) => `https://res.cloudinary.com/${CLOUD}/image/upload/v1/footchron/player-photos/${clubUid}/${name}.png`;
const now = FieldValue.serverTimestamp;
const SCREEN_DIR = join(process.cwd(), "screenshots");
if (!existsSync(SCREEN_DIR)) mkdirSync(SCREEN_DIR, { recursive: true });
const shot = async (p: Page, name: string) => p.screenshot({ path: join(SCREEN_DIR, name), fullPage: false });

async function seed() {
  await auth.createUser({ uid: ownerUid, email: ownerEmail, password: PASSWORD });
  await db.collection("users").doc(ownerUid).set({
    email: ownerEmail, activeCareerId: careerId,
    subscription: { status: "pro" }, plan: "pro", createdAt: now(), updatedAt: now(),
  });
  await db.collection("careers").doc(careerId).set({
    ownerId: ownerUid, clubUid, name: "Career PD", clubName: "PD Club",
    clubId: slug, status: "active", isPublic: true, createdAt: now(), updatedAt: now(),
  });
  await db.collection("club_profiles").doc(clubUid).set({
    ownerUid, clubUid, clubId: slug, slug, clubName: "PD Club", mainTeamId: teamId,
    createdAt: now(), updatedAt: now(),
  });
  await db.collection("club_profiles").doc(slug).set({
    ownerUid, clubUid, clubId: slug, slug, createdAt: now(), updatedAt: now(),
  });
  await db.collection(`clubs/${clubUid}/teams`).doc(teamId).set({
    name: "PD FC", isMain: true, clubUid, createdAt: now(),
  });
  await db.collection(`clubs/${clubUid}/seasons`).doc(S1D).set({ name: S1, isPublic: true, createdAt: now() });

  const players = db.collection(`clubs/${clubUid}/teams/${teamId}/players`);
  const base = { teamId, position: "MF", seasons: [S1], createdAt: now(), updatedAt: now() };

  // A: トップレベルのみ（旧形式: seasonData.photoUrlなし）
  await players.doc(`pa-${ts}`).set({ ...base, name: "TopOnly", number: 1, photoUrl: url("a") });
  // B: seasonDataのみ（トップレベルなし）
  await players.doc(`pb-${ts}`).set({
    ...base, name: "SeasonOnly", number: 2,
    seasonData: { [S1D]: { number: 2, position: "MF", photoUrl: url("b") } },
  });
  // C: 別シーズンのseasonDataのみ
  await players.doc(`pc-${ts}`).set({
    ...base, name: "OtherSeason", number: 3,
    seasonData: { [S0D]: { number: 3, position: "MF", photoUrl: url("c") } },
  });
  // D: seasonData.photoUrl = "" かつトップレベルあり（空文字が ?? をすり抜けるケース）
  await players.doc(`pd-${ts}`).set({
    ...base, name: "EmptySeason", number: 4, photoUrl: url("d"),
    seasonData: { [S1D]: { number: 4, position: "MF", photoUrl: "" } },
  });
}

// 編集ダイアログを開いてアップローダー内のimgのsrcを取得
async function checkDialog(page: Page, name: string): Promise<{ imgCount: number; src: string }> {
  for (let i = 0; i < 5; i++) {
    try {
      const row = page.locator("tbody tr", { hasText: name }).first();
      await row.getByRole("button", { name: "Open menu" }).click({ timeout: 5000 });
      await page.getByRole("menuitem", { name: "編集" }).click({ timeout: 5000 });
      break;
    } catch (e) {
      if (i === 4) throw e;
      await page.waitForTimeout(800);
    }
  }
  await page.waitForTimeout(1500);
  const uploader = page.locator('[role="dialog"]').locator('img[alt="選手写真"]');
  const imgCount = await uploader.count();
  const src = imgCount > 0 ? (await uploader.first().getAttribute("src")) ?? "" : "";
  await page.keyboard.press("Escape");
  await page.locator('[role="dialog"]').waitFor({ state: "hidden", timeout: 5000 }).catch(() => {});
  return { imgCount, src };
}

async function main() {
  await seed();
  console.log("[seed] done", { clubUid, teamId });

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("[pageerror]", e.message));

  await page.goto(`${BASE_URL}/admin/test-login?email=${encodeURIComponent(ownerEmail)}&plan=pro&password=${PASSWORD}`);
  await page.getByText("Pro テストユーザー").first().click();
  await page.waitForURL(/\/admin/, { timeout: 30000 });
  console.log("[ui] logged in");

  await page.goto(`${BASE_URL}/admin/teams/${teamId}?season=${encodeURIComponent(S1)}`);
  await page.locator("tbody").getByText("TopOnly").waitFor({ timeout: 20000 });
  await page.waitForTimeout(1000);
  await shot(page, "pd-01-list.png");

  for (const name of ["TopOnly", "SeasonOnly", "OtherSeason", "EmptySeason"]) {
    const r = await checkDialog(page, name);
    console.log(`[dialog] ${name}: img=${r.imgCount} src=${r.src.slice(0, 110)}`);
  }

  const listImgs = await page.locator("tbody tr img").count();
  console.log("[list] tbody img count:", listImgs);

  await page.goto(`${BASE_URL}/${slug}/players`);
  await page.waitForTimeout(4000);
  for (const name of ["TopOnly", "SeasonOnly", "OtherSeason", "EmptySeason"]) {
    const c = await page.locator(`img[alt="${name}"]`).count();
    console.log(`[public] img[alt=${name}]: ${c}`);
  }
  await shot(page, "pd-02-public.png");

  await browser.close();
  console.log("\n=== DONE ===");
}

main().catch((e) => { console.error("[e2e] FAILED:", e); process.exit(1); });
