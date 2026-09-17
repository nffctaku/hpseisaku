import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { db } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import { resolvePublicClubProfile } from "./public-club-profile";

const now = FieldValue.serverTimestamp;

async function seedClub(slug: string, name: string, color: string) {
  const ownerUid = `owner-${slug}`;
  const clubUid = db.collection("club_profiles").doc().id;
  await db.collection("club_profiles").doc(clubUid).set({
    ownerUid,
    clubUid,
    clubId: slug,
    clubName: name,
    logoUrl: `https://example.com/${slug}.png`,
    homeBgColor: color,
    homeColorTheme: "#000000",
    transfersPublic: false,
    realTeamUsage: false,
    gameTeamUsage: true,
    displaySettings: { topPageV2: true },
    createdAt: now(),
    updatedAt: now(),
  });

  const mainTeamId = clubUid;
  await db.collection(`clubs/${clubUid}/teams`).doc(mainTeamId).set({
    name,
    isMain: true,
    createdAt: now(),
    updatedAt: now(),
  });

  const playerId = db.collection(`clubs/${clubUid}/teams/${mainTeamId}/players`).doc().id;
  await db.collection(`clubs/${clubUid}/teams/${mainTeamId}/players`).doc(playerId).set({
    name: `${name} 選手`,
    number: "10",
    position: "FW",
    createdAt: now(),
    updatedAt: now(),
  });

  return { ownerUid, clubUid, mainTeamId, playerId };
}

describe("public club profile A/B isolation", () => {
  test("resolves A and B to different clubUids and data", async () => {
    const a = await seedClub("alpha-slug", "Alpha FC", "#ff0000");
    const b = await seedClub("beta-slug", "Beta FC", "#00ff00");

    const resolvedA = await resolvePublicClubProfile("alpha-slug");
    const resolvedB = await resolvePublicClubProfile("beta-slug");

    assert.ok(resolvedA);
    assert.ok(resolvedB);
    assert.notEqual(resolvedA?.clubUid, resolvedB?.clubUid);
    assert.equal(resolvedA?.clubUid, a.clubUid);
    assert.equal(resolvedB?.clubUid, b.clubUid);
    assert.equal(resolvedA?.profileData.clubName, "Alpha FC");
    assert.equal(resolvedB?.profileData.clubName, "Beta FC");
    assert.equal(resolvedA?.userUid, a.ownerUid);
    assert.equal(resolvedB?.userUid, b.ownerUid);
  });

  test("does not leak data when one club has no players", async () => {
    const full = await seedClub("full-slug", "Full FC", "#0000ff");

    // Create an empty club profile with no sub-collections at all
    const emptyOwner = "owner-empty-slug";
    const emptyClubUid = db.collection("club_profiles").doc().id;
    await db.collection("club_profiles").doc(emptyClubUid).set({
      ownerUid: emptyOwner,
      clubUid: emptyClubUid,
      clubId: "empty-slug",
      clubName: "Empty FC",
      homeColor: "#ffffff",
      createdAt: now(),
      updatedAt: now(),
    });

    const resolvedEmpty = await resolvePublicClubProfile("empty-slug");
    assert.ok(resolvedEmpty);
    assert.equal(resolvedEmpty?.clubUid, emptyClubUid);
    const emptyPlayers = await db.collection(`clubs/${emptyClubUid}/teams/${emptyClubUid}/players`).get();
    assert.equal(emptyPlayers.size, 0);

    const resolvedFull = await resolvePublicClubProfile("full-slug");
    assert.ok(resolvedFull);
    assert.equal(resolvedFull?.clubUid, full.clubUid);
    assert.notEqual(resolvedFull?.clubUid, emptyClubUid);
  });
});
