import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { db, auth } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import { copyCareerData, getCopyableSourceData } from "./career-copy";
import { MAX_CAREERS } from "./career-constants";

const now = FieldValue.serverTimestamp;

async function createOwner(plan: "free" | "pro") {
  const user = await auth.createUser({ email: `test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com` });
  const ref = db.collection("users").doc(user.uid);
  await ref.set({
    email: user.email,
    activeCareerId: null,
    subscription: plan === "pro" ? { status: "pro" } : { status: "free" },
    createdAt: now(),
  });
  return user.uid;
}

async function createCareer(ownerId: string, status: "active" | "creating") {
  const careerId = db.collection("careers").doc().id;
  const clubUid = db.collection("club_profiles").doc().id;
  const clubId = `club-${Math.random().toString(36).slice(2, 8)}`;
  await db.collection("careers").doc(careerId).set({
    ownerId,
    clubUid,
    name: `Test Career ${careerId.slice(-4)}`,
    clubName: "テストクラブ",
    clubLogo: null,
    status,
    createdAt: now(),
    updatedAt: now(),
  });
  await db.collection("club_profiles").doc(clubUid).set({
    ownerUid: ownerId,
    clubUid,
    clubId,
    clubName: "テストクラブ",
    logoUrl: "https://example.com/logo.png",
    homeColor: "#ffffff",
    homeColorTheme: "#000000",
    awayColor: "#eeeeee",
    awayColorTheme: "#111111",
    transfersPublic: true,
    realTeamUsage: false,
    gameTeamUsage: true,
    displaySettings: { menuShowStats: true },
    plan: "free",
    createdAt: now(),
    updatedAt: now(),
  });
  return { careerId, clubUid, clubId };
}

async function seedSource(ownerId: string, careerId: string, clubUid: string) {
  const mainTeamId = db.collection(`clubs/${clubUid}/teams`).doc().id;
  const opp1Id = db.collection(`clubs/${clubUid}/teams`).doc().id;
  const opp2Id = db.collection(`clubs/${clubUid}/teams`).doc().id;

  await db.collection(`clubs/${clubUid}/teams`).doc(mainTeamId).set({
    name: "テストFC A",
    shortName: "TFC",
    logoUrl: "https://example.com/main.png",
    color: "#fff",
    isMain: true,
    clubUid,
    createdAt: now(),
    updatedAt: now(),
  });
  await db.collection(`clubs/${clubUid}/teams`).doc(opp1Id).set({
    name: "ライバル高校",
    logoUrl: "https://example.com/opp1.png",
    color: "#f00",
    createdAt: now(),
    updatedAt: now(),
  });
  await db.collection(`clubs/${clubUid}/teams`).doc(opp2Id).set({
    name: "友情クラブ",
    logoUrl: "https://example.com/opp2.png",
    color: "#00f",
    createdAt: now(),
    updatedAt: now(),
  });

  const s2024 = "2024";
  const s2025 = "2025";
  await db.collection(`clubs/${clubUid}/seasons`).doc(s2024).set({ name: "2024シーズン" });
  await db.collection(`clubs/${clubUid}/seasons`).doc(s2025).set({ name: "2025シーズン" });

  // Player A in both 2024 and 2025
  const playerA = db.collection(`clubs/${clubUid}/teams/${mainTeamId}/players`).doc().id;
  await db.collection(`clubs/${clubUid}/teams/${mainTeamId}/players`).doc(playerA).set({
    name: "選手A",
    number: "10",
    position: "FW",
    nationality: "JP",
    photoUrl: "https://example.com/a.png",
    stats: { goals: 20, assists: 5 },
    history: [{ season: s2024, club: "旧クラブ" }],
    contract: { salary: 1000 },
    createdAt: now(),
    updatedAt: now(),
  });
  // Player B only 2024
  const playerB = db.collection(`clubs/${clubUid}/teams/${mainTeamId}/players`).doc().id;
  await db.collection(`clubs/${clubUid}/teams/${mainTeamId}/players`).doc(playerB).set({
    name: "選手B",
    number: "7",
    position: "MF",
    stats: { goals: 5 },
    createdAt: now(),
    updatedAt: now(),
  });
  // Player C only 2025
  const playerC = db.collection(`clubs/${clubUid}/teams/${mainTeamId}/players`).doc().id;
  await db.collection(`clubs/${clubUid}/teams/${mainTeamId}/players`).doc(playerC).set({
    name: "選手C",
    number: "1",
    position: "GK",
    createdAt: now(),
    updatedAt: now(),
  });

  await db.collection(`clubs/${clubUid}/seasons/${s2024}/roster`).doc(playerA).set({ registered: true, number: "10" });
  await db.collection(`clubs/${clubUid}/seasons/${s2024}/roster`).doc(playerB).set({ registered: true, number: "7" });
  await db.collection(`clubs/${clubUid}/seasons/${s2025}/roster`).doc(playerA).set({ registered: true, number: "10" });
  await db.collection(`clubs/${clubUid}/seasons/${s2025}/roster`).doc(playerC).set({ registered: true, number: "1" });

  await db.collection(`clubs/${clubUid}/competitions`).doc("comp1").set({
    name: "大会1",
    year: 2024,
    createdAt: now(),
  });

  // Mark main team in profile after the fact so resolveMainTeamId finds it
  await db.collection("club_profiles").doc(clubUid).update({ mainTeamId });

  return { mainTeamId, opp1Id, opp2Id, playerA, playerB, playerC };
}

describe("career-copy integration", () => {
  before(async () => {
    // sanity: emulator connected
    const smoke = await db.collection("_smoke").doc("java").set({ ok: true });
    assert.ok(smoke);
  });

  test("getCopyableSourceData returns plan, seasons and counts", async () => {
    const owner = await createOwner("pro");
    const { careerId, clubUid } = await createCareer(owner, "active");
    await seedSource(owner, careerId, clubUid);
    const data = await getCopyableSourceData(owner, careerId);

    assert.equal(data.plan.plan, "pro");
    assert.equal(data.seasons.length, 2);
    assert.equal(data.teamCount, 3);
    assert.equal(data.opponentCount, 2);
    const s2024 = data.playerCountsBySeason.find((s) => s.seasonId === "2024");
    const s2025 = data.playerCountsBySeason.find((s) => s.seasonId === "2025");
    assert.equal(s2024?.count, 2);
    assert.equal(s2025?.count, 2);
  });

  test("Pro copies only selected season players with new IDs and no stats", async () => {
    const owner = await createOwner("pro");
    const source = await createCareer(owner, "active");
    const sourceSeed = await seedSource(owner, source.careerId, source.clubUid);
    const target = await createCareer(owner, "creating");

    const result = await copyCareerData(owner, target.careerId, {
      sourceCareerId: source.careerId,
      copyPlayers: true,
      playerSourceSeasonId: "2024",
      copyTeams: false,
      copySettings: false,
      targetStartSeasonId: "2026",
      targetStartSeasonName: "2026シーズン",
    });

    assert.equal(result.copied.players, 2);
    assert.equal(result.copied.teams, 1); // main team is always created
    assert.equal(result.copied.opponents, 0);
    assert.equal(result.copied.settings, false);

    const targetPlayers = await db.collection(`clubs/${target.clubUid}/teams/${target.clubUid}/players`).get();
    assert.equal(targetPlayers.size, 2);
    const names = targetPlayers.docs.map((d) => d.data().name).sort();
    assert.deepEqual(names, ["選手A", "選手B"]);

    const aDoc = targetPlayers.docs.find((d) => d.data().name === "選手A")!;
    assert.equal(typeof aDoc.data().photoUrl, "string");
    assert.equal(aDoc.data().number, "10");
    assert.equal(aDoc.data().position, "FW");
    assert.equal(aDoc.data().stats, undefined);
    assert.equal(aDoc.data().history, undefined);
    assert.equal(aDoc.data().contract, undefined);
    assert.equal(aDoc.data().clubUid, target.clubUid);

    const targetCareer = await db.collection("careers").doc(target.careerId).get();
    assert.equal(targetCareer.data()?.status, "active");
    const user = await db.collection("users").doc(owner).get();
    assert.equal(user.data()?.activeCareerId, target.careerId);

    // source unchanged
    const sourcePlayerA = await db
      .collection(`clubs/${source.clubUid}/teams/${sourceSeed.mainTeamId}/players`)
      .where("name", "==", "選手A")
      .get();
    assert.ok(sourcePlayerA.docs[0].data().stats);
  });

  test("Free rejects player copy even if directly specified", async () => {
    const owner = await createOwner("free");
    const source = await createCareer(owner, "active");
    const target = await createCareer(owner, "creating");
    await seedSource(owner, source.careerId, source.clubUid);

    await assert.rejects(
      () =>
        copyCareerData(owner, target.careerId, {
          sourceCareerId: source.careerId,
          copyPlayers: true,
          playerSourceSeasonId: "2024",
          copyTeams: false,
          copySettings: false,
          targetStartSeasonId: "2026",
          targetStartSeasonName: "2026シーズン",
        }),
      /Freeでは選手を引き継げません/
    );
  });
});
