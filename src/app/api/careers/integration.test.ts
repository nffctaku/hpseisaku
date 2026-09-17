import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { db, auth } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import { POST } from "./route";

const now = FieldValue.serverTimestamp;
const API_KEY = "demo-api-key";
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";

async function createUser(uid: string, plan: "free" | "pro") {
  const email = `${uid}@example.com`;
  await auth.createUser({ uid, email, password: "testpass123" });
  await db.collection("users").doc(uid).set({
    email,
    subscription: { status: plan },
    activeCareerId: null,
    createdAt: now(),
  });
  return email;
}

async function getIdToken(email: string): Promise<string> {
  const res = await fetch(
    `http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "testpass123", returnSecureToken: true }),
    }
  );
  if (!res.ok) throw new Error(`signIn failed: ${await res.text()}`);
  const body = (await res.json()) as { idToken?: string };
  if (!body.idToken) throw new Error("idToken missing");
  return body.idToken;
}

async function createRequest(email: string, payload: object): Promise<NextRequest> {
  const token = await getIdToken(email);
  return new NextRequest("http://localhost:3000/api/careers", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

describe("POST /api/careers", () => {
  test("creates up to 3 careers and rejects the 4th", async () => {
    const uid = `limit-${Date.now()}`;
    const email = await createUser(uid, "free");

    const results: { ok?: boolean; careerId?: string; message?: string }[] = [];
    for (let i = 0; i < 4; i++) {
      const req = await createRequest(email, {
        recordName: `記録${i + 1}`,
        clubName: `クラブ${i + 1}`,
        clubId: `test-slug-${i}-${Date.now()}`,
      });
      const res = await POST(req);
      results.push(await res.json());
    }

    const oks = results.filter((r) => r.ok);
    assert.equal(oks.length, 3);
    const rejected = results.find((r) => !r.ok);
    assert.ok(rejected?.message?.includes("上限"));
  });

  test("concurrent creation does not exceed 3", async () => {
    const uid = `concurrent-${Date.now()}`;
    const email = await createUser(uid, "free");

    const jobs = Array.from({ length: 5 }).map((_, i) =>
      createRequest(email, {
        recordName: `C${i}`,
        clubName: `ClubC${i}`,
        clubId: `concurrent-${i}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      }).then((req) => POST(req).then((r) => r.json()))
    );
    const results = (await Promise.all(jobs)) as { ok?: boolean }[];
    const oks = results.filter((r) => r.ok);
    assert.equal(oks.length, 3);
  });

  test("same slug concurrent yields one success and one conflict", async () => {
    const uid = `dup-${Date.now()}`;
    const email = await createUser(uid, "free");

    const slug = `same-${Date.now()}`;
    const jobs = [0, 1].map(() =>
      createRequest(email, {
        recordName: "Duplicate",
        clubName: "Duplicate Club",
        clubId: slug,
      }).then((req) => POST(req).then((r) => ({ status: r.status, body: r.json() })))
    );
    const results = await Promise.all(jobs);
    const statuses = results.map((r) => r.status);
    assert.ok(statuses.includes(200) || statuses.includes(409));
    assert.ok(statuses.includes(409) || statuses.filter((s) => s === 200).length === 1);
    // one or one conflict
    const okCount = statuses.filter((s) => s === 200).length;
    const conflictCount = statuses.filter((s) => s === 409).length;
    assert.equal(okCount, 1);
    assert.equal(conflictCount, 1);
  });

  test("creating career can be retried with the same slug", async () => {
    const uid = `retry-${Date.now()}`;
    const email = await createUser(uid, "free");
    const slug = `retry-${Date.now()}`;

    // First attempt: reserve URL, then fail copy (invalid source)
    const badReq = await createRequest(email, {
      recordName: "Retry",
      clubName: "Retry Club",
      clubId: slug,
      copyOptions: {
        sourceCareerId: "non-existent",
        copyPlayers: false,
        copyTeams: false,
        copySettings: false,
      },
    });
    const badRes = await POST(badReq);
    assert.ok(!badRes.ok);

    // Verify the creating career is left
    const careers = await db.collection("careers").where("ownerId", "==", uid).get();
    assert.equal(careers.size, 1);
    assert.equal(careers.docs[0].data().status, "creating");

    // Retry without copy: should reuse and activate
    const retryReq = await createRequest(email, {
      recordName: "Retry",
      clubName: "Retry Club",
      clubId: slug,
    });
    const retryRes = await POST(retryReq);
    const retryBody = (await retryRes.json()) as { ok?: boolean; careerId?: string };
    assert.ok(retryBody.ok);
    assert.equal(retryBody.careerId, careers.docs[0].id);

    const career = await db.collection("careers").doc(careers.docs[0].id).get();
    assert.equal(career.data()?.status, "active");
  });

  test("another user cannot reuse a reserved slug", async () => {
    const uidA = `usera-${Date.now()}`;
    const uidB = `userb-${Date.now()}`;
    const [emailA, emailB] = await Promise.all([createUser(uidA, "free"), createUser(uidB, "free")]);
    const slug = `reserved-${Date.now()}`;

    const reqA = await createRequest(emailA, {
      recordName: "A",
      clubName: "A Club",
      clubId: slug,
    });
    const resA = await POST(reqA);
    assert.ok((await resA.json()).ok);

    const reqB = await createRequest(emailB, {
      recordName: "B",
      clubName: "B Club",
      clubId: slug,
    });
    const resB = await POST(reqB);
    const bodyB = (await resB.json()) as { ok?: boolean; message?: string };
    assert.ok(!bodyB.ok);
    assert.ok(bodyB.message?.includes("使用されています"));
  });

  test("rejects owner uid as a new career slug", async () => {
    const uid = `internal-${Date.now()}`;
    const email = await createUser(uid, "free");
    const req = await createRequest(email, {
      recordName: "Internal",
      clubName: "Internal Club",
      clubId: uid,
    });
    const res = await POST(req);
    assert.equal(res.status, 400);
    const body = (await res.json()) as { message?: string };
    assert.ok(body.message?.includes("内部ID"), `expected internal-id rejection, got ${body.message}`);
  });
});
