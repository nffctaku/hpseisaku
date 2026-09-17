import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { db, auth } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import { POST } from "./route";

const now = FieldValue.serverTimestamp;
const AUTH_HOST = "127.0.0.1:9099";
const API_KEY = "demo-api-key";

async function getIdToken(email: string): Promise<string> {
  const res = await fetch(
    `http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        password: "testpass123",
        returnSecureToken: true,
      }),
    }
  );
  if (!res.ok) throw new Error(`signIn failed: ${await res.text()}`);
  const body = (await res.json()) as { idToken?: string };
  if (!body.idToken) throw new Error("idToken missing");
  return body.idToken;
}

function createRequest(token: string, payload: object): NextRequest {
  return new NextRequest("http://localhost:3000/api/club/update", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
}

async function setupTargetUser(suffix: string) {
  // 元の所有者UIDは大文字・小文字混在を模倣
  const ownerUid = `uGZypGTf0mSh5JHqy3XlErH60CZ2-${suffix}`;
  const ownerEmail = `${ownerUid}@example.com`;
  const clubUid = `targetClubUid-${suffix}`;
  const originalClubUid = ownerUid; // 元キャリア①は clubUid = ownerUid（legacy）
  const careerId = `targetCareer-${suffix}`;
  const originalCareerId = `originalCareer-${suffix}`;
  const misSavedClubId = ownerUid.toLowerCase(); // 誤って小文字化されたUID

  try {
    await auth.createUser({ uid: ownerUid, email: ownerEmail, password: "testpass123" });
  } catch {
    // 再実行時を想定
  }

  await db.collection("users").doc(ownerUid).set(
    {
      activeCareerId: careerId,
      email: ownerEmail,
      createdAt: now(),
      updatedAt: now(),
    },
    { merge: true }
  );

  await db.collection("careers").doc(careerId).set({
    ownerId: ownerUid,
    clubUid,
    name: "Nottingham Forest",
    clubName: "Nottingham Forest",
    status: "active",
    createdAt: now(),
    updatedAt: now(),
  });

  await db.collection("careers").doc(originalCareerId).set({
    ownerId: ownerUid,
    clubUid: originalClubUid,
    name: "元キャリア①",
    clubName: "元キャリア①",
    status: "active",
    createdAt: now(),
    updatedAt: now(),
  });

  const testSlug = `testslug-${suffix}`;

  // 対象：clubId は誤小文字化UID、slug は testslug-{suffix}
  await db.collection("club_profiles").doc(clubUid).set({
    ownerUid,
    clubUid,
    clubId: misSavedClubId,
    slug: testSlug,
    clubName: "Nottingham Forest",
    logoUrl: null,
    plan: "free",
    createdAt: now(),
    updatedAt: now(),
  });

  // 元キャリア①：clubId/slug は元UID（大文字小文字混在）
  await db.collection("club_profiles").doc(originalClubUid).set({
    ownerUid,
    clubUid: originalClubUid,
    clubId: originalClubUid,
    slug: originalClubUid,
    clubName: "元キャリア①",
    logoUrl: null,
    plan: "free",
    createdAt: now(),
    updatedAt: now(),
  });

  return { ownerUid, ownerEmail, clubUid, originalClubUid, misSavedClubId, testSlug };
}

describe("POST /api/club/update", () => {
  test("clubId=誤小文字化UID, slug=testslug から testslug へ統一し、他Careerは変更しない", async () => {
    const { ownerUid, ownerEmail, clubUid, originalClubUid, misSavedClubId, testSlug } =
      await setupTargetUser("sync");
    const token = await getIdToken(ownerEmail);

    const res = await POST(
      createRequest(token, {
        clubId: testSlug,
        clubName: "Nottingham Forest",
        realTeamUsage: true,
        gameTeamUsage: true,
      })
    );
    assert.equal(res.status, 200);

    const main = (await db.collection("club_profiles").doc(clubUid).get()).data() as any;
    const alias = await db.collection("club_profiles").doc(testSlug).get();
    const original = (await db.collection("club_profiles").doc(originalClubUid).get()).data() as any;

    assert.equal(main.clubId, testSlug, "main.clubId should be testSlug");
    assert.equal(main.slug, testSlug, "main.slug should be testSlug");

    assert.ok(alias.exists, `alias doc /club_profiles/${testSlug} should exist`);
    assert.equal(alias.data()?.clubId, testSlug);
    assert.equal(alias.data()?.slug, testSlug);
    assert.equal(alias.data()?.clubUid, clubUid);
    assert.equal(alias.data()?.ownerUid, ownerUid);

    assert.equal(original.clubId, originalClubUid, "元キャリア① clubId should be unchanged");
    assert.equal(original.slug, originalClubUid, "元キャリア① slug should be unchanged");
    assert.equal(original.clubUid, originalClubUid, "元キャリア① clubUid should be unchanged");

    // 旧UID形式URLが元のclubUidへ解決される
    const oldProfile = await db.collection("club_profiles").doc(originalClubUid).get();
    assert.ok(oldProfile.exists);
    assert.equal((oldProfile.data() as any).clubUid, originalClubUid);

    // 新しい testslug URL が対象 clubUid へ解決される
    const newProfile = await db.collection("club_profiles").doc(testSlug).get();
    assert.ok(newProfile.exists);
    assert.equal((newProfile.data() as any).clubUid, clubUid);

    // 一覧/Career側は testSlug を使用する（GET /api/careers と同じ結合ロジック）
    const career = (await db.collection("careers").doc("targetCareer-sync").get()).data() as any;
    const profile = (await db.collection("club_profiles").doc(career.clubUid).get()).data() as any;
    assert.equal(profile.clubId, testSlug);
  });

  test("自分の現在のURLを再保存できる", async () => {
    const { ownerUid, ownerEmail, clubUid } = await setupTargetUser("resave");
    const token = await getIdToken(ownerEmail);
    const currentSlug = `testslug-resave`;

    const res1 = await POST(
      createRequest(token, {
        clubId: currentSlug,
        clubName: "Nottingham Forest",
        realTeamUsage: true,
        gameTeamUsage: true,
      })
    );
    assert.equal(res1.status, 200);

    const res2 = await POST(
      createRequest(token, {
        clubId: currentSlug,
        clubName: "Nottingham Forest",
        realTeamUsage: true,
        gameTeamUsage: true,
      })
    );
    assert.equal(res2.status, 200);

    const main = (await db.collection("club_profiles").doc(clubUid).get()).data() as any;
    assert.equal(main.clubId, currentSlug);
    assert.equal(main.slug, currentSlug);
  });

  test("内部UIDを大文字・小文字混在のまま保存できる", async () => {
    // 元キャリアを持たないユーザーで、初めから内部UIDをclubIdとして設定
    const suffix = "internal";
    const ownerUid = `uGZypGTf0mSh5JHqy3XlErH60CZ2-${suffix}`;
    const ownerEmail = `${ownerUid}@example.com`;
    const clubUid = `internal-club-${suffix}`;
    const careerId = `internal-career-${suffix}`;

    try {
      await auth.createUser({ uid: ownerUid, email: ownerEmail, password: "testpass123" });
    } catch {
      // ignore
    }

    await db.collection("users").doc(ownerUid).set(
      { activeCareerId: careerId, email: ownerEmail, createdAt: now(), updatedAt: now() },
      { merge: true }
    );
    await db.collection("careers").doc(careerId).set({
      ownerId: ownerUid,
      clubUid,
      status: "active",
      createdAt: now(),
      updatedAt: now(),
    });

    await db.collection("club_profiles").doc(clubUid).set({
      ownerUid,
      clubUid,
      clubId: ownerUid.toLowerCase(),
      slug: ownerUid.toLowerCase(),
      createdAt: now(),
      updatedAt: now(),
    });

    const token = await getIdToken(ownerEmail);
    const res = await POST(
      createRequest(token, {
        clubId: ownerUid,
        clubName: "Nottingham Forest",
        realTeamUsage: true,
        gameTeamUsage: true,
      })
    );
    assert.equal(res.status, 400);
    const body = (await res.json()) as { message?: string };
    assert.ok(body.message?.includes("内部ID"), `expected internal-id rejection, got ${body.message}`);

    const main = (await db.collection("club_profiles").doc(clubUid).get()).data() as any;
    assert.equal(main.clubId, ownerUid.toLowerCase(), "internal uid should not change");
    assert.equal(main.slug, ownerUid.toLowerCase(), "internal slug should not change");
  });

  test("他ユーザーが使用中の testslug は拒否する", async () => {
    const suffix = "conflict";
    const ownerA = `uGZypA-${suffix}`;
    const emailA = `${ownerA}@example.com`;
    const clubA = `clubA-${suffix}`;

    const ownerB = `otherUser-${suffix}`;
    const emailB = `${ownerB}@example.com`;
    const clubB = `clubB-${suffix}`;

    for (const { uid, email } of [
      { uid: ownerA, email: emailA },
      { uid: ownerB, email: emailB },
    ]) {
      try {
        await auth.createUser({ uid, email, password: "testpass123" });
      } catch {
        // ignore
      }
    }

    await db.collection("users").doc(ownerA).set(
      { activeCareerId: "cA", email: emailA, createdAt: now(), updatedAt: now() },
      { merge: true }
    );
    await db.collection("users").doc(ownerB).set(
      { activeCareerId: "cB", email: emailB, createdAt: now(), updatedAt: now() },
      { merge: true }
    );

    await db.collection("careers").doc("cA").set({
      ownerId: ownerA,
      clubUid: clubA,
      status: "active",
      createdAt: now(),
      updatedAt: now(),
    });
    await db.collection("careers").doc("cB").set({
      ownerId: ownerB,
      clubUid: clubB,
      status: "active",
      createdAt: now(),
      updatedAt: now(),
    });

    await db.collection("club_profiles").doc(clubA).set({
      ownerUid: ownerA,
      clubUid: clubA,
      clubId: "temp-a",
      slug: "temp-a",
      createdAt: now(),
      updatedAt: now(),
    });

    // ユーザーBが testslug を使用中
    const conflictSlug = `testslug-${suffix}`;

    await db.collection("club_profiles").doc(clubB).set({
      ownerUid: ownerB,
      clubUid: clubB,
      clubId: conflictSlug,
      slug: conflictSlug,
      createdAt: now(),
      updatedAt: now(),
    });

    const tokenA = await getIdToken(emailA);
    const res = await POST(
      createRequest(tokenA, {
        clubId: conflictSlug,
        clubName: "Nottingham Forest",
        realTeamUsage: true,
        gameTeamUsage: true,
      })
    );
    assert.equal(res.status, 409);
    const data = (await res.json()) as { message?: string };
    assert.ok(data.message?.includes("使用"), `expected conflict message, got ${data.message}`);
  });

  test("更新失敗時に元のclubId・slug・URL予約が維持される", async () => {
    const suffix = "preserve";
    const ownerA = `uGZypA-${suffix}`;
    const emailA = `${ownerA}@example.com`;
    const clubA = `clubA-${suffix}`;

    const ownerB = `otherUser-${suffix}`;
    const emailB = `${ownerB}@example.com`;
    const clubB = `clubB-${suffix}`;
    const keptSlug = `kept-slug-${suffix}`;
    const conflictSlug = `stolen-slug-${suffix}`;

    for (const { uid, email } of [
      { uid: ownerA, email: emailA },
      { uid: ownerB, email: emailB },
    ]) {
      try {
        await auth.createUser({ uid, email, password: "testpass123" });
      } catch {
        // ignore
      }
    }

    await db.collection("users").doc(ownerA).set(
      { activeCareerId: "cA", email: emailA, createdAt: now(), updatedAt: now() },
      { merge: true }
    );
    await db.collection("users").doc(ownerB).set(
      { activeCareerId: "cB", email: emailB, createdAt: now(), updatedAt: now() },
      { merge: true }
    );

    await db.collection("careers").doc("cA").set({
      ownerId: ownerA,
      clubUid: clubA,
      status: "active",
      createdAt: now(),
      updatedAt: now(),
    });
    await db.collection("careers").doc("cB").set({
      ownerId: ownerB,
      clubUid: clubB,
      status: "active",
      createdAt: now(),
      updatedAt: now(),
    });

    await db.collection("club_profiles").doc(clubA).set({
      ownerUid: ownerA,
      clubUid: clubA,
      clubId: keptSlug,
      slug: keptSlug,
      clubName: "Original Club",
      createdAt: now(),
      updatedAt: now(),
    });

    // 元々のURL alias
    await db.collection("club_profiles").doc(keptSlug).set({
      ownerUid: ownerA,
      clubUid: clubA,
      clubId: keptSlug,
      slug: keptSlug,
      createdAt: now(),
      updatedAt: now(),
    });

    // ユーザーBが使用中
    await db.collection("club_profiles").doc(clubB).set({
      ownerUid: ownerB,
      clubUid: clubB,
      clubId: conflictSlug,
      slug: conflictSlug,
      createdAt: now(),
      updatedAt: now(),
    });

    const tokenA = await getIdToken(emailA);
    const res = await POST(
      createRequest(tokenA, {
        clubId: conflictSlug,
        clubName: "Changed Name",
        realTeamUsage: true,
        gameTeamUsage: true,
      })
    );
    assert.equal(res.status, 409);

    const main = (await db.collection("club_profiles").doc(clubA).get()).data() as any;
    assert.equal(main.clubId, keptSlug, "main.clubId preserved");
    assert.equal(main.slug, keptSlug, "main.slug preserved");
    assert.equal(main.clubName, "Original Club", "other fields not updated");

    const alias = await db.collection("club_profiles").doc(keptSlug).get();
    assert.ok(alias.exists, "original alias still exists");
    assert.equal((alias.data() as any).clubUid, clubA, "original alias still points to main");
    assert.equal((alias.data() as any).clubId, keptSlug, "original alias clubId unchanged");
  });
});
