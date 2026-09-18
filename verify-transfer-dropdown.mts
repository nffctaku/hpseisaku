// 実画面検証: 移籍管理プルダウンに選択シーズンの登録選手が表示されること
// (demo-footchron エミュレータ + localhost:3002)
import { chromium, type Page } from "playwright";
import { db, auth } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import { existsSync, mkdirSync } from "fs";
import { join } from "path";
import assert from "node:assert/strict";

const BASE_URL = process.env.BASE_URL || "http://localhost:3002";
const PASSWORD = "testpass123";
const ts = Date.now();
const ownerUid = `u-e2e-dd-${ts}`;
const ownerEmail = `${ownerUid}@test.local`;
const clubUid = `club-dd-${ts}`;
const careerId = `career-dd-${ts}`;
const teamId = `team-dd-${ts}`;
const slug = `club-dd-${ts}`;
const clubUidB = `club-ddb-${ts}`;
const careerIdB = `career-ddb-${ts}`;
const teamIdB = `team-ddb-${ts}`;
const S1 = "2025/26";
const S1D = "2025-26";
const S0 = "2024/25";
const S0D = "2024-25";
const now = FieldValue.serverTimestamp;
const SCREEN_DIR = join(process.cwd(), "screenshots");
if (!existsSync(SCREEN_DIR)) mkdirSync(SCREEN_DIR, { recursive: true });
const shot = async (p: Page, name: string) => p.screenshot({ path: join(SCREEN_DIR, name), fullPage: false });

const P = {
  normal: `p-normal-${ts}`,   // seasons=[2025/26] + seasonData
  sdonly: `p-sdonly-${ts}`,   // seasons=[2024/25] + seasonData[2025-26] のみで今季所属
  legacy: `p-legacy-${ts}`,   // seasons/seasonData なし（レガシー）
  prev: `p-prev-${ts}`,       // seasons=[2024/25] のみ
  future: `p-future-${ts}`,   // seasons=[2026/27] のみ
  dup1: `p-dup1-${ts}`,       // 同名 "Dup Name"
  dup2: `p-dup2-${ts}`,
};

async function seed() {
  await auth.createUser({ uid: ownerUid, email: ownerEmail, password: PASSWORD });
  await db.collection("users").doc(ownerUid).set({
    email: ownerEmail, activeCareerId: careerId,
    subscription: { status: "pro" }, plan: "pro",
    createdAt: now(), updatedAt: now(),
  });
  await db.collection("careers").doc(careerId).set({
    ownerId: ownerUid, clubUid, name: "Career A", clubName: "DD Club",
    clubId: slug, status: "active", isPublic: true, createdAt: now(), updatedAt: now(),
  });
  await db.collection("club_profiles").doc(clubUid).set({
    ownerUid, clubUid, clubId: slug, slug,
    clubName: "DD Club", logoUrl: null, mainTeamId: teamId,
    createdAt: now(), updatedAt: now(),
  });
  await db.collection(`clubs/${clubUid}/teams`).doc(teamId).set({
    name: "DD FC", isMain: true, clubUid, createdAt: now(), updatedAt: now(),
  });
  await db.collection(`clubs/${clubUid}/seasons`).doc(S1D).set({ name: S1, isPublic: true, createdAt: now() });
  await db.collection(`clubs/${clubUid}/seasons`).doc(S0D).set({ name: S0, isPublic: true, createdAt: now() });

  const players = db.collection(`clubs/${clubUid}/teams/${teamId}/players`);
  const base = { teamId, position: "MF", createdAt: now(), updatedAt: now() };
  await players.doc(P.normal).set({
    ...base, name: "Normal Season", number: 8,
    seasons: [S1], seasonData: { [S1D]: { number: 8, position: "MF" } },
  });
  await players.doc(P.sdonly).set({
    ...base, name: "SD Only", number: 14,
    seasons: [S0], seasonData: { [S1D]: { number: 14, position: "FW" } },
  });
  await players.doc(P.legacy).set({ ...base, name: "Legacy Man", number: 4 });
  await players.doc(P.prev).set({ ...base, name: "Prev Only", number: 3, seasons: [S0] });
  await players.doc(P.future).set({ ...base, name: "Future Man", number: 30, seasons: ["2026/27"] });
  await players.doc(P.dup1).set({ ...base, name: "Dup Name", number: 11, seasons: [S1] });
  await players.doc(P.dup2).set({ ...base, name: "Dup Name", number: 22, seasons: [S1] });

  // Career B（Career切替の分離確認用）
  await db.collection("careers").doc(careerIdB).set({
    ownerId: ownerUid, clubUid: clubUidB, name: "Career B", clubName: "DD B Club",
    clubId: `b-${slug}`, status: "active", createdAt: now(), updatedAt: now(),
  });
  await db.collection(`clubs/${clubUidB}/teams`).doc(teamIdB).set({
    name: "DD B FC", clubUid: clubUidB, createdAt: now(),
  });
  await db.collection(`clubs/${clubUidB}/seasons`).doc(S1D).set({ name: S1, createdAt: now() });
  await db.collection(`clubs/${clubUidB}/teams/${teamIdB}/players`).doc(`pb-${ts}`).set({
    name: "B Only", teamId: teamIdB, seasons: [S1], createdAt: now(),
  });
}

const KNOWN_NAMES = ["Normal Season", "SD Only", "Legacy Man", "Prev Only", "Future Man", "Dup Name", "B Only"];

// ダイアログを開いて選手プルダウンの選択肢を収集
async function collectOptions(page: Page): Promise<string[]> {
  await page.getByRole("button", { name: "＋ 選手の移籍を記録する" }).click();
  await page.locator('[role="dialog"]').waitFor({ timeout: 10000 });
  // 「登録済み選手から選ぶ」モードの選手Selectを開く（combobox: 0=種類, 1=選手）
  await page.locator('[role="dialog"] button[role="combobox"]').nth(1).click();
  await page.waitForTimeout(800);
  const options = await page.getByRole("option").allTextContents();
  await page.keyboard.press("Escape"); // Selectを閉じる
  await page.waitForTimeout(400);
  await page.keyboard.press("Escape"); // ダイアログを閉じる
  await page.locator('[role="dialog"]').waitFor({ state: "hidden", timeout: 5000 }).catch(() => {});
  return options.map((t) => t.trim());
}

async function main() {
  await seed();
  console.log("[seed] done", { clubUid, teamId });

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.on("dialog", (d) => void d.accept());
  page.on("pageerror", (e) => console.log("[pageerror]", e.message));

  await page.goto(`${BASE_URL}/admin/test-login?email=${encodeURIComponent(ownerEmail)}&plan=pro&password=${PASSWORD}`);
  await page.getByText("Pro テストユーザー").first().click();
  await page.waitForURL(/\/admin/, { timeout: 30000 });
  console.log("[ui] logged in");

  // ===== A. 選手管理の表示一覧を取得（照合用） =====
  await page.goto(`${BASE_URL}/admin/teams/${teamId}?season=${encodeURIComponent(S1)}`);
  await page.locator("tbody").getByText("Normal Season").waitFor({ timeout: 20000 });
  await page.waitForTimeout(800);
  const mgmtNames: string[] = [];
  for (const row of await page.locator("tbody tr").all()) {
    const text = (await row.textContent()) ?? "";
    for (const name of KNOWN_NAMES) {
      if (text.includes(name)) mgmtNames.push(name);
    }
  }
  console.log("[ui] 選手管理 2025/26 表示:", mgmtNames);

  // ===== B. 移籍管理 IN のプルダウン =====
  await page.goto(`${BASE_URL}/admin/teams/${teamId}/transfers?season=${encodeURIComponent(S1)}`);
  await page.getByRole("button", { name: "＋ 選手の移籍を記録する" }).waitFor({ timeout: 20000 });
  const inOptions = await collectOptions(page);
  console.log("[ui] IN プルダウン:", inOptions);

  for (const name of ["Normal Season", "SD Only", "Legacy Man"]) {
    assert(inOptions.includes(name), `IN候補に ${name} が含まれること`);
  }
  assert.equal(inOptions.filter((t) => t === "Dup Name").length, 2, "同名の別選手が2件とも表示されること");
  for (const name of ["Prev Only", "Future Man", "B Only"]) {
    assert(!inOptions.includes(name), `IN候補に ${name} が含まれないこと`);
  }
  // 選手管理の表示名と突合（順不同・同名は件数一致）
  const ddSet = [...inOptions].filter((t) => t !== "未選択").sort();
  const mgmtSorted = [...mgmtNames].sort();
  assert.deepEqual(ddSet, mgmtSorted, "プルダウン候補と選手管理の表示一覧が一致すること");
  console.log("[check] IN 候補 = 選手管理表示一覧:", ddSet);
  await shot(page, "dd-01-in-options.png");

  // ===== C. OUT では前シーズン選手も候補 =====
  await page.getByRole("button", { name: "OUT" }).click();
  const outOptions = await collectOptions(page);
  console.log("[ui] OUT プルダウン:", outOptions);
  assert(outOptions.includes("Prev Only"), "OUT候補に前シーズン選手 Prev Only が含まれること");
  assert(!outOptions.includes("Future Man"), "OUT候補に Future Man が含まれないこと");

  // ===== D. 実際に選択・保存できること =====
  await page.getByRole("button", { name: "IN" }).click();
  await page.getByRole("button", { name: "＋ 選手の移籍を記録する" }).click();
  await page.locator('[role="dialog"] button[role="combobox"]').nth(1).click();
  await page.getByRole("option", { name: "SD Only" }).click();
  await page.locator('[role="dialog"] input[placeholder="例: FC ○○"]').fill("FC Verify");
  await page.getByRole("button", { name: "保存する" }).click();
  await page.waitForTimeout(2500);
  const tSnap = await db.collection(`clubs/${clubUid}/teams/${teamId}/transfers`).get();
  const created = tSnap.docs.map((d) => d.data()).find((t: any) => t.playerId === P.sdonly);
  assert(created, "選択した選手の移籍記録がFirestoreに作成されること");
  assert.equal(created?.playerName, "SD Only");
  assert.equal(created?.season, S1);
  console.log("[fs] 選択・保存 OK: playerId=", P.sdonly, "season=", created?.season);

  // ===== E. シーズン変更後も正しい候補 =====
  await page.goto(`${BASE_URL}/admin/teams/${teamId}/transfers?season=${encodeURIComponent(S0)}`);
  await page.getByRole("button", { name: "＋ 選手の移籍を記録する" }).waitFor({ timeout: 20000 });
  const prevSeasonOptions = await collectOptions(page);
  console.log("[ui] 2024/25 IN プルダウン:", prevSeasonOptions);
  assert(prevSeasonOptions.includes("Prev Only"), "2024/25 では Prev Only が候補になること");
  assert(!prevSeasonOptions.includes("Normal Season"), "2024/25 では Normal Season が候補外であること");

  // ===== F. Career切替後は切替先の候補のみ =====
  await db.collection("users").doc(ownerUid).update({ activeCareerId: careerIdB });
  await page.goto(`${BASE_URL}/admin/teams/${teamIdB}/transfers?season=${encodeURIComponent(S1)}`);
  await page.getByRole("button", { name: "＋ 選手の移籍を記録する" }).waitFor({ timeout: 20000 });
  const bOptions = await collectOptions(page);
  console.log("[ui] Career B プルダウン:", bOptions);
  assert(bOptions.includes("B Only"), "Career B の選手が候補になること");
  for (const name of ["Normal Season", "SD Only", "Legacy Man", "Dup Name"]) {
    assert(!bOptions.includes(name), `Career B の候補に Career A の ${name} が混ざらないこと`);
  }
  console.log("[check] Career切替後の分離 OK");

  await browser.close();
  console.log("\n=== ALL CHECKS DONE ===");
}

main().catch((e) => {
  console.error("[e2e] FAILED:", e);
  process.exit(1);
});
