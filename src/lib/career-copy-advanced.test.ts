import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { db, auth } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import { copyCareerData, getCopyableSourceData } from "./career-copy";
import { resolvePublicClubProfile } from "./public-club-profile";

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

async function createCareer(ownerId: string, status: "active" | "creating", overrides?: { name?: string; clubName?: string; clubId?: string }) {
  const careerId = db.collection("careers").doc().id;
  const clubUid = db.collection("club_profiles").doc().id;
  const clubId = overrides?.clubId || `club-${Math.random().toString(36).slice(2, 8)}`;
  await db.collection("careers").doc(careerId).set({
    ownerId,
    clubUid,
    name: overrides?.name ?? `Test Career ${careerId.slice(-4)}`,
    clubName: overrides?.clubName ?? "テストクラブ",
    clubLogo: null,
    status,
    clubId,
    createdAt: now(),
    updatedAt: now(),
  });
  await db.collection("club_profiles").doc(clubUid).set({
    ownerUid: ownerId,
    clubUid,
    clubId,
    clubName: overrides?.clubName ?? "テストクラブ",
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

  const playerA = db.collection(`clubs/${clubUid}/teams/${mainTeamId}/players`).doc().id;
  const playerB = db.collection(`clubs/${clubUid}/teams/${mainTeamId}/players`).doc().id;
  const playerC = db.collection(`clubs/${clubUid}/teams/${mainTeamId}/players`).doc().id;

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
    seasonData: {
      [s2024]: { number: "10", position: "FW" },
    },
  });
  await db.collection(`clubs/${clubUid}/teams/${mainTeamId}/players`).doc(playerB).set({
    name: "選手B",
    number: "7",
    position: "MF",
    stats: { goals: 5 },
    createdAt: now(),
    updatedAt: now(),
  });
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

  // 大会・成績・スタッツ（コピー対象外）
  await db.collection(`clubs/${clubUid}/competitions`).doc("comp1").set({
    name: "大会1",
    year: 2024,
    createdAt: now(),
  });
  await db.collection(`clubs/${clubUid}/match_results`).doc("match1").set({
    opponent: opp1Id,
    score: "2-1",
    createdAt: now(),
  });
  await db.collection(`clubs/${clubUid}/standings`).doc("stand1").set({
    season: s2024,
    rank: 1,
    createdAt: now(),
  });

  await db.collection("club_profiles").doc(clubUid).update({ mainTeamId });

  return { mainTeamId, opp1Id, opp2Id, playerA, playerB, playerC };
}

async function getDocFields(refPath: string) {
  const snap = await db.doc(refPath).get();
  return snap.exists ? (snap.data() as Record<string, unknown>) : null;
}

describe("career-copy advanced", () => {
  before(async () => {
    const smoke = await db.collection("_smoke").doc("java").set({ ok: true });
    assert.ok(smoke);
  });

  test("concurrent copy to the same target leaves only one copy", async () => {
    const owner = await createOwner("pro");
    const source = await createCareer(owner, "active");
    const target = await createCareer(owner, "creating");
    await seedSource(owner, source.careerId, source.clubUid);

    const opts = {
      sourceCareerId: source.careerId,
      copyPlayers: true,
      playerSourceSeasonId: "2024",
      copyTeams: true,
      copySettings: true,
      targetStartSeasonId: "2026",
    };

    const [r1, r2] = await Promise.allSettled([
      copyCareerData(owner, target.careerId, opts),
      copyCareerData(owner, target.careerId, opts),
    ]);

    const fulfilled = [r1, r2].filter((r) => r.status === "fulfilled");
    const rejected = [r1, r2].filter((r) => r.status === "rejected");
    assert.equal(fulfilled.length, 1, "concurrent copies should have exactly one success");
    assert.equal(rejected.length, 1, "concurrent copies should have exactly one failure");

    const targetPlayers = await db.collection(`clubs/${target.clubUid}/teams/${target.clubUid}/players`).get();
    const targetTeams = await db.collection(`clubs/${target.clubUid}/teams`).get();
    assert.equal(targetPlayers.size, 2, "players should not be duplicated");
    assert.equal(targetTeams.size, 3, "teams should not be duplicated");
  });

  test("failed copy does not partially save or activate", async () => {
    const owner = await createOwner("pro");
    const source = await createCareer(owner, "active");
    const target = await createCareer(owner, "creating");
    await seedSource(owner, source.careerId, source.clubUid);

    await assert.rejects(
      () =>
        copyCareerData(owner, target.careerId, {
          sourceCareerId: source.careerId,
          copyPlayers: true,
          playerSourceSeasonId: "nonexistent-season",
          copyTeams: true,
          copySettings: true,
          targetStartSeasonId: "2026",
        }),
      /引き継ぎ元Seasonが見つかりません/
    );

    const targetCareer = await db.collection("careers").doc(target.careerId).get();
    assert.equal(targetCareer.data()?.status, "creating", "career must not be activated on failure");

    const targetPlayers = await db.collection(`clubs/${target.clubUid}/teams/${target.clubUid}/players`).get();
    assert.equal(targetPlayers.size, 0, "no players should be written");

    const targetTeams = await db.collection(`clubs/${target.clubUid}/teams`).get();
    assert.equal(targetTeams.size, 0, "no teams should be written");

    const user = await db.collection("users").doc(owner).get();
    assert.equal(user.data()?.activeCareerId, null, "user must not be activated");
  });

  test("retry after failure does not duplicate players or teams", async () => {
    const owner = await createOwner("pro");
    const source = await createCareer(owner, "active");
    const target = await createCareer(owner, "creating");
    await seedSource(owner, source.careerId, source.clubUid);

    // 1回目は存在しない Season で失敗させる
    await assert.rejects(
      () =>
        copyCareerData(owner, target.careerId, {
          sourceCareerId: source.careerId,
          copyPlayers: true,
          playerSourceSeasonId: "nonexistent-season",
          copyTeams: false,
          copySettings: false,
          targetStartSeasonId: "2026",
        }),
      /引き継ぎ元Seasonが見つかりません/
    );

    // 2回目の再試行で 2024 Season を正しくコピー
    const result = await copyCareerData(owner, target.careerId, {
      sourceCareerId: source.careerId,
      copyPlayers: true,
      playerSourceSeasonId: "2024",
      copyTeams: false,
      copySettings: false,
      targetStartSeasonId: "2026",
    });

    assert.equal(result.copied.players, 2);
    const targetPlayers = await db.collection(`clubs/${target.clubUid}/teams/${target.clubUid}/players`).get();
    assert.equal(targetPlayers.size, 2);
    const targetTeams = await db.collection(`clubs/${target.clubUid}/teams`).get();
    assert.equal(targetTeams.size, 1);
  });

  test("source career data remains unchanged", async () => {
    const owner = await createOwner("pro");
    const source = await createCareer(owner, "active");
    const target = await createCareer(owner, "creating");
    const seeded = await seedSource(owner, source.careerId, source.clubUid);

    const before = await getDocFields(`clubs/${source.clubUid}/teams/${seeded.mainTeamId}/players/${seeded.playerA}`);
    assert.ok(before);
    assert.equal((before as any).stats?.goals, 20);
    assert.equal((before as any).history?.length, 1);

    await copyCareerData(owner, target.careerId, {
      sourceCareerId: source.careerId,
      copyPlayers: true,
      playerSourceSeasonId: "2024",
      copyTeams: true,
      copySettings: true,
      targetStartSeasonId: "2026",
    });

    const after = await getDocFields(`clubs/${source.clubUid}/teams/${seeded.mainTeamId}/players/${seeded.playerA}`);
    assert.deepEqual(after, before, "source player doc must be unchanged");

    const sourceTeams = await db.collection(`clubs/${source.clubUid}/teams`).get();
    assert.equal(sourceTeams.size, 3, "source teams unchanged");

    const sourceCompetitions = await db.collection(`clubs/${source.clubUid}/competitions`).get();
    assert.equal(sourceCompetitions.size, 1, "source competitions unchanged");

    const sourceMatches = await db.collection(`clubs/${source.clubUid}/match_results`).get();
    assert.equal(sourceMatches.size, 1, "source match results unchanged");

    const sourceStandings = await db.collection(`clubs/${source.clubUid}/standings`).get();
    assert.equal(sourceStandings.size, 1, "source standings unchanged");
  });

  test("new record name, club name and public URL are preserved", async () => {
    const owner = await createOwner("pro");
    const source = await createCareer(owner, "active");
    // エミュレータは実行間でデータを保持するため、clubIdは実行ごとに一意にする
    const uniqueClubId = `new-club-${Math.random().toString(36).slice(2, 10)}`;
    const target = await createCareer(owner, "creating", {
      name: "新しい記録",
      clubName: "新クラブ",
      clubId: uniqueClubId,
    });
    await seedSource(owner, source.careerId, source.clubUid);

    await copyCareerData(owner, target.careerId, {
      sourceCareerId: source.careerId,
      copyPlayers: true,
      playerSourceSeasonId: "2024",
      copyTeams: true,
      copySettings: true,
      targetStartSeasonId: "2026",
    });

    const career = await db.collection("careers").doc(target.careerId).get();
    assert.equal(career.data()?.name, "新しい記録");
    assert.equal(career.data()?.clubName, "新クラブ");
    assert.equal(career.data()?.status, "active");

    const profile = await getDocFields(`club_profiles/${target.clubUid}`);
    assert.equal(profile?.clubName, "新クラブ");
    assert.equal(profile?.clubId, uniqueClubId);

    const resolved = await resolvePublicClubProfile(uniqueClubId);
    assert.equal(resolved?.clubUid, target.clubUid);
  });

  test("team and emblem toggles are independent", async () => {
    const owner = await createOwner("pro");
    const source = await createCareer(owner, "active");
    const targetOffTeams = await createCareer(owner, "creating");
    const targetOffEmblem = await createCareer(owner, "creating");
    await seedSource(owner, source.careerId, source.clubUid);

    // チームON・エンブレムOFF
    await copyCareerData(owner, targetOffEmblem.careerId, {
      sourceCareerId: source.careerId,
      copyPlayers: false,
      copyTeams: true,
      copySettings: false,
      targetStartSeasonId: "2026",
    });
    const pOff = await getDocFields(`club_profiles/${targetOffEmblem.clubUid}`);
    assert.equal(pOff?.logoUrl, null);
    const tOn = await db.collection(`clubs/${targetOffEmblem.clubUid}/teams`).get();
    assert.equal(tOn.size, 3);

    // チームOFF・エンブレムON
    await copyCareerData(owner, targetOffTeams.careerId, {
      sourceCareerId: source.careerId,
      copyPlayers: false,
      copyTeams: false,
      copySettings: true,
      targetStartSeasonId: "2026",
    });
    const pOn = await getDocFields(`club_profiles/${targetOffTeams.clubUid}`);
    assert.equal(pOn?.logoUrl, "https://example.com/logo.png");
    const tOff = await db.collection(`clubs/${targetOffTeams.clubUid}/teams`).get();
    assert.equal(tOff.size, 1, "only main team is created");
  });

  test("team OFF / player ON still assigns players to new own club", async () => {
    const owner = await createOwner("pro");
    const source = await createCareer(owner, "active");
    const target = await createCareer(owner, "creating");
    await seedSource(owner, source.careerId, source.clubUid);

    const result = await copyCareerData(owner, target.careerId, {
      sourceCareerId: source.careerId,
      copyPlayers: true,
      playerSourceSeasonId: "2024",
      copyTeams: false,
      copySettings: false,
      targetStartSeasonId: "2026",
    });

    assert.equal(result.copied.players, 2);
    assert.equal(result.copied.teams, 1);
    assert.equal(result.copied.opponents, 0);

    const players = await db.collection(`clubs/${target.clubUid}/teams/${target.clubUid}/players`).get();
    assert.equal(players.size, 2);
    for (const p of players.docs) {
      assert.equal(p.data().clubUid, target.clubUid);
      assert.equal(p.data().teamId, target.clubUid);
      assert.equal(p.data().registered, true);
    }
  });

  test("copies only basic info from all registered players in selected season", async () => {
    const owner = await createOwner("pro");
    const source = await createCareer(owner, "active");
    const target = await createCareer(owner, "creating");
    const seeded = await seedSource(owner, source.careerId, source.clubUid);

    const result = await copyCareerData(owner, target.careerId, {
      sourceCareerId: source.careerId,
      copyPlayers: true,
      playerSourceSeasonId: "2024",
      copyTeams: true,
      copySettings: true,
      targetStartSeasonId: "2026",
    });

    assert.equal(result.copied.players, 2);
    assert.equal(result.copied.skippedPlayers, 0);
    assert.equal(result.copied.skippedPlayerDetails.length, 0);

    const players = await db.collection(`clubs/${target.clubUid}/teams/${target.clubUid}/players`).get();
    const names = players.docs.map((d) => d.data().name).sort();
    assert.deepEqual(names, ["選手A", "選手B"]);

    const a = players.docs.find((d) => d.data().name === "選手A")!;
    assert.equal(a.data().number, "10");
    assert.equal(a.data().position, "FW");
    assert.equal(a.data().nationality, "JP");
    assert.equal(a.data().photoUrl, "https://example.com/a.png");
    assert.equal(a.data().stats, undefined);
    assert.equal(a.data().history, undefined);
    assert.equal(a.data().contract, undefined);
    const seasonData = a.data().seasonData as Record<string, Record<string, unknown>>;
    assert.ok(seasonData && typeof seasonData === "object", "seasonData should be present");
    assert.equal(seasonData["2026"]?.name, "選手A");
    assert.equal(seasonData["2026"]?.number, "10");
    assert.equal((seasonData["2026"] as any)?.stats, undefined);
  });

  test("stale roster entries are reported as skipped with reasons, not silently dropped", async () => {
    const owner = await createOwner("pro");
    const source = await createCareer(owner, "active");
    const target = await createCareer(owner, "creating");
    await seedSource(owner, source.careerId, source.clubUid);

    // roster上は登録されているが選手ドキュメントが存在しない不整合エントリ
    const ghostPlayerId = db.collection(`clubs/${source.clubUid}/teams/x/players`).doc().id;
    await db.collection(`clubs/${source.clubUid}/seasons/2024/roster`).doc(ghostPlayerId).set({
      registered: true,
      number: "99",
    });

    const result = await copyCareerData(owner, target.careerId, {
      sourceCareerId: source.careerId,
      copyPlayers: true,
      playerSourceSeasonId: "2024",
      copyTeams: false,
      copySettings: false,
      targetStartSeasonId: "2026",
    });

    // 対象3人(roster上) = コピー2人 + スキップ1人
    assert.equal(result.copied.players + result.copied.skippedPlayers, 3);
    assert.equal(result.copied.players, 2);
    assert.equal(result.copied.skippedPlayers, 1);
    assert.equal(result.copied.skippedPlayerDetails.length, 1);
    assert.equal(result.copied.skippedPlayerDetails[0].playerId, ghostPlayerId);
    assert.ok(result.copied.skippedPlayerDetails[0].reason.length > 0);

    const players = await db.collection(`clubs/${target.clubUid}/teams/${target.clubUid}/players`).get();
    assert.equal(players.size, 2);
    const roster = await db.collection(`clubs/${target.clubUid}/seasons/2026/roster`).get();
    assert.equal(roster.size, 2);
  });

  test("competitions, match results, standings, stats and history are not copied", async () => {
    const owner = await createOwner("pro");
    const source = await createCareer(owner, "active");
    const target = await createCareer(owner, "creating");
    await seedSource(owner, source.careerId, source.clubUid);

    await copyCareerData(owner, target.careerId, {
      sourceCareerId: source.careerId,
      copyPlayers: true,
      playerSourceSeasonId: "2024",
      copyTeams: true,
      copySettings: true,
      targetStartSeasonId: "2026",
    });

    const targetCompetitions = await db.collection(`clubs/${target.clubUid}/competitions`).get();
    assert.equal(targetCompetitions.size, 0);

    const targetMatches = await db.collection(`clubs/${target.clubUid}/match_results`).get();
    assert.equal(targetMatches.size, 0);

    const targetStandings = await db.collection(`clubs/${target.clubUid}/standings`).get();
    assert.equal(targetStandings.size, 0);

    const targetSeasons = await db.collection(`clubs/${target.clubUid}/seasons`).get();
    assert.equal(targetSeasons.size, 1, "only the start season is created");
  });
});
