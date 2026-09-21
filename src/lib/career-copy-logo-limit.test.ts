import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { db, auth } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import { copyCareerData } from "./career-copy";

const now = FieldValue.serverTimestamp;
const FREE_TEAM_IMAGE_LIMIT = 20;

async function createOwner(plan: "free" | "pro") {
  const user = await auth.createUser({
    email: `logo-limit-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
  });
  await db.collection("users").doc(user.uid).set({
    email: user.email,
    activeCareerId: null,
    subscription: { status: plan },
    createdAt: now(),
  });
  return user.uid;
}

async function createCareerDoc(ownerId: string, status: "active" | "creating") {
  const careerId = db.collection("careers").doc().id;
  const clubUid = db.collection("club_profiles").doc().id;
  await db.collection("careers").doc(careerId).set({
    ownerId,
    clubUid,
    name: `Career ${careerId.slice(-4)}`,
    clubName: "テストクラブ",
    status,
    createdAt: now(),
    updatedAt: now(),
  });
  await db.collection("club_profiles").doc(clubUid).set({
    ownerUid: ownerId,
    clubUid,
    clubName: "テストクラブ",
    plan: "free",
    createdAt: now(),
    updatedAt: now(),
  });
  return { careerId, clubUid };
}

// main team（logo付き）+ opponentCount 個の対戦相手（全件logo付き）をseedする
async function seedSourceWithLogos(clubUid: string, opponentCount: number) {
  const mainTeamId = db.collection(`clubs/${clubUid}/teams`).doc().id;
  await db.collection(`clubs/${clubUid}/teams`).doc(mainTeamId).set({
    name: "メインFC",
    logoUrl: "https://example.com/main.png",
    isMain: true,
    clubUid,
    createdAt: now(),
    updatedAt: now(),
  });
  for (let i = 0; i < opponentCount; i++) {
    const id = `opp-${String(i).padStart(3, "0")}`;
    await db.collection(`clubs/${clubUid}/teams`).doc(id).set({
      name: `対戦相手${i}`,
      logoUrl: `https://example.com/opp${i}.png`,
      createdAt: now(),
      updatedAt: now(),
    });
  }
  await db.collection("club_profiles").doc(clubUid).update({ mainTeamId });
  return { mainTeamId };
}

async function targetTeamStats(clubUid: string) {
  const snap = await db.collection(`clubs/${clubUid}/teams`).get();
  let withLogo = 0;
  for (const d of snap.docs) {
    const logo = d.data().logoUrl;
    if (typeof logo === "string" && logo.trim()) withLogo++;
  }
  return { total: snap.size, withLogo };
}

describe("career-copy: team logo limit", () => {
  before(async () => {
    await db.collection("_smoke").doc("logo-limit").set({ ok: true });
  });

  test("Free: 画像付きteamが上限(20)以下なら全て引き継ぐ", async () => {
    const owner = await createOwner("free");
    const src = await createCareerDoc(owner, "active");
    const dst = await createCareerDoc(owner, "creating");
    await seedSourceWithLogos(src.clubUid, 5); // main + 5 = 6 logos

    const result = await copyCareerData(owner, dst.careerId, {
      sourceCareerId: src.careerId,
      copyPlayers: false,
      copyTeams: true,
      copySettings: false,
    });

    const stats = await targetTeamStats(result.targetClubUid);
    assert.equal(stats.total, 6);
    assert.equal(stats.withLogo, 6);
  });

  test("Free: 上限超過時はteamは全件コピー・logoUrlのみ上限まで・main優先", async () => {
    const owner = await createOwner("free");
    const src = await createCareerDoc(owner, "active");
    const dst = await createCareerDoc(owner, "creating");
    await seedSourceWithLogos(src.clubUid, 22); // main + 22 = 23 logos

    const result = await copyCareerData(owner, dst.careerId, {
      sourceCareerId: src.careerId,
      copyPlayers: false,
      copyTeams: true,
      copySettings: false,
    });

    const stats = await targetTeamStats(result.targetClubUid);
    assert.equal(stats.total, 23, "team自体は全件コピーされる");
    assert.equal(stats.withLogo, FREE_TEAM_IMAGE_LIMIT, "logoUrlは上限20件まで");

    // main club(team id = targetClubUid)の画像は必ず保持される
    const mainTeam = await db
      .collection(`clubs/${result.targetClubUid}/teams`)
      .doc(result.targetClubUid)
      .get();
    assert.equal(mainTeam.data()?.logoUrl, "https://example.com/main.png");
  });

  test("Pro: 上限なしで全件引き継ぐ", async () => {
    const owner = await createOwner("pro");
    const src = await createCareerDoc(owner, "active");
    const dst = await createCareerDoc(owner, "creating");
    await seedSourceWithLogos(src.clubUid, 22);

    const result = await copyCareerData(owner, dst.careerId, {
      sourceCareerId: src.careerId,
      copyPlayers: false,
      copyTeams: true,
      copySettings: false,
    });

    const stats = await targetTeamStats(result.targetClubUid);
    assert.equal(stats.total, 23);
    assert.equal(stats.withLogo, 23);
  });
});
